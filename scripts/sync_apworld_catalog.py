"""Fetch public APworld assets from the supplied sheet without executing packages."""
import concurrent.futures, hashlib, html.parser, io, json, re, time, urllib.parse, urllib.request, zipfile, xml.etree.ElementTree as E, sys, ipaddress
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'apworlds'
CACHE = ROOT / '.catalog-cache'
OUT.mkdir(exist_ok=True)
CACHE.mkdir(exist_ok=True)
SOURCE = 'https://docs.google.com/spreadsheets/d/1iuzDTOAvdoNe8Ne8i461qGNucg5OuEoF-Ikqs8aUQZw/edit?gid=58422002#gid=58422002'
MAX = 40 * 1024 * 1024

class Links(html.parser.HTMLParser):

    def __init__(self):
        super().__init__()
        self.links = []
        self.fragments = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'a' and a.get('href'):
            self.links.append(a['href'])
        if tag == 'include-fragment' and '/releases/expanded_assets/' in a.get('src', ''):
            self.fragments.append(a['src'])

def fetch(url, limit=MAX):
    p = urllib.parse.urlsplit(url)
    if p.scheme not in ('https', 'http') or not p.hostname or p.username or p.password or (p.hostname in ('localhost', '127.0.0.1', '::1')):
        raise ValueError('Kein öffentlicher Download')
    try:
        if not ipaddress.ip_address(p.hostname).is_global:
            raise ValueError('Keine öffentliche IP-Adresse')
    except ValueError as error:
        if str(error) == 'Keine öffentliche IP-Adresse':
            raise
    key = hashlib.sha256(url.encode()).hexdigest()
    path = CACHE / key
    meta = CACHE / (key + '.json')
    if path.exists() and meta.exists() and (time.time() - path.stat().st_mtime < 300 or p.path.lower().endswith(('.apworld', '.zip')) or '/releases/download/' in p.path):
        try:
            m = json.loads(meta.read_text(encoding='utf-8'))
            return (path.read_bytes(), m['url'])
        except ValueError:
            pass
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'AP-Chaos-Bridge/0.3 public APworld catalog'}), timeout=20) as res:
        if int(res.headers.get('Content-Length', '0')) > limit:
            raise ValueError('Download größer als 40 MiB')
        data = res.read(limit + 1)
        final = res.url
        if len(data) > limit:
            raise ValueError('Download größer als 40 MiB')
    temp = CACHE / (key + '.' + str(__import__('threading').get_ident()) + '.tmp')
    temp.write_bytes(data)
    temp.replace(path)
    temp = CACHE / (key + '.' + str(__import__('threading').get_ident()) + '.json.tmp')
    temp.write_text(json.dumps({'url': final}), encoding='utf-8')
    temp.replace(meta)
    return (data, final)

def read_catalog():
    local = ROOT.parent.parent / 'research/apworld-catalog.xlsx'
    data = local.read_bytes() if local.exists() else fetch(SOURCE.split('/edit')[0] + '/export?format=xlsx', 5 * 1024 * 1024)[0]
    ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        strings = [''.join(s.itertext()) for s in E.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', ns)]
        wb = E.fromstring(z.read('xl/workbook.xml'))
        rels = {x.get('Id'): x.get('Target') for x in E.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
        sh = next((x for x in wb.findall('m:sheets/m:sheet', ns) if x.get('name') == 'Playable Worlds'))
        target = rels[sh.get('{' + ns['r'] + '}id')].lstrip('/')
        target = target if target.startswith('xl/') else 'xl/' + target
        rpath = str(Path(target).parent / '_rels' / (Path(target).name + '.rels'))
        rels = {x.get('Id'): x.get('Target') for x in E.fromstring(z.read(rpath))}
        tree = E.fromstring(z.read(target))
        links = {}
        for x in tree.findall('.//m:hyperlink', ns):
            url = rels.get(x.get('{' + ns['r'] + '}id'))
            if url:
                links.setdefault(x.get('ref'), []).append(url)
        rows = []
        for row in tree.findall('.//m:row', ns)[2:]:
            vals = {}
            for c in row.findall('m:c', ns):
                v = c.find('m:v', ns)
                value = v.text if v is not None else ''
                if c.get('t') == 's':
                    value = strings[int(value)]
                vals[re.sub('\\d', '', c.get('r'))] = value
            if vals.get('A'):
                rows.append({'game': vals['A'], 'row': int(row.get('r')), 'stability': vals.get('B', ''), 'core': vals.get('C') == 'Core', 'links': {k: links.get(k + row.get('r'), []) for k in 'EFG'}})
        return rows

def package(data, name, url):
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        entries = z.infolist()
        if len(entries) > 12000 or sum((e.file_size for e in entries)) > 100 * 1024 * 1024:
            raise ValueError('Archiv überschreitet Import-Limit')
        if not any((e.filename.endswith('.py') for e in entries)):
            raise ValueError('Keine World-Quelldateien')
        for e in entries:
            n = e.filename.replace('\\', '/')
            if e.flag_bits & 1 or '..' in n.split('/') or n.startswith('/') or re.match('^[a-zA-Z]:', n):
                raise ValueError('Ungültiger Archiveintrag')
            if (n.endswith('.py') or n.split('/')[-1] == 'archipelago.json') and e.file_size > 8 * 1024 * 1024:
                raise ValueError('Textdatei zu groß')
        if z.testzip():
            raise ValueError('ZIP-Prüfsumme ungültig')
    p = urllib.parse.urlsplit(url)
    owner = p.netloc + '-' + p.path.strip('/').split('/')[0]
    owner = re.sub('[^a-zA-Z0-9_-]+', '-', owner)[:65]
    name = re.sub('[^a-zA-Z0-9_.()+ -]+', '-', urllib.parse.unquote(name))[:120]
    name = name if name.lower().endswith('.apworld') else name + '.apworld'
    sha = hashlib.sha256(data).hexdigest()
    filename = owner + '/' + sha[:8] + '/' + name
    path = OUT / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        temp = path.with_suffix('.' + str(__import__('threading').get_ident()) + '.tmp')
        temp.write_bytes(data)
        temp.replace(path)
    return {'file': filename, 'originalName': name, 'url': url, 'sha256': sha, 'bytes': len(data)}

def direct(url):
    data, final = fetch(url)
    name = urllib.parse.urlsplit(url).path.split('/')[-1]
    finalname = urllib.parse.urlsplit(final).path.split('/')[-1]
    if name.lower().endswith('.apworld'):
        return [package(data, name, url)]
    if finalname.lower().endswith('.apworld'):
        return [package(data, finalname, url)]
    if name.lower().endswith('.zip'):
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            entries = z.infolist()
            if len(entries) > 12000 or sum((e.file_size for e in entries)) > 100 * 1024 * 1024:
                raise ValueError('Download-Bundle überschreitet Import-Limit')
            selected = [e for e in entries if e.filename.lower().endswith('.apworld') and e.file_size <= MAX][:30]
            if not selected:
                raise ValueError('Download-Bundle enthält keine .apworld-Datei')
            return [package(z.read(e), Path(e.filename).name, url) for e in selected]
    raise ValueError('Kein direkter APworld-Download')

def download_assets(urls):
    files = []
    errors = []
    for url in dict.fromkeys(urls):
        try:
            files += direct(url)
        except Exception as e:
            errors.append(str(e))
    if not files and errors:
        raise ValueError('; '.join(errors))
    return files

def github(url):
    p = urllib.parse.urlsplit(url)
    parts = p.path.strip('/').split('/')
    if len(parts) < 2:
        return []
    if '/releases/download/' in p.path or p.path.lower().endswith('.apworld'):
        return direct(url.replace('/blob/', '/raw/', 1))
    if parts[0].lower() == 'archipelagomw' and parts[1].lower() == 'archipelago':
        return []
    if 'releases' not in parts:
        url = f'https://github.com/{parts[0]}/{parts[1]}/releases/latest'
    data, final = fetch(url, 4 * 1024 * 1024)
    doc = Links()
    doc.feed(data.decode('utf8', 'replace'))
    urls = [urllib.parse.urljoin(final, u) for u in doc.links if '/releases/download/' in u and urllib.parse.urlsplit(u).path.lower().endswith(('.apworld', '.zip'))]
    if urls:
        return download_assets(urls)
    for fragment in list(dict.fromkeys(doc.fragments))[:4]:
        body, base = fetch(urllib.parse.urljoin(final, fragment), 3 * 1024 * 1024)
        assets = Links()
        assets.feed(body.decode('utf8', 'replace'))
        urls = [urllib.parse.urljoin(base, u) for u in assets.links if urllib.parse.urlsplit(u).path.lower().endswith(('.apworld', '.zip'))]
        if urls:
            return download_assets(urls[:10])
    return []

def forge(url):
    p = urllib.parse.urlsplit(url)
    parts = p.path.strip('/').split('/')
    if p.hostname == 'gitlab.com':
        project = p.path.split('/-/')[0].strip('/')
        endpoint = 'https://gitlab.com/api/v4/projects/' + urllib.parse.quote(project, safe='') + '/releases/permalink/latest'
        raw, _ = fetch(endpoint, 3 * 1024 * 1024)
        assets = json.loads(raw).get('assets', {}).get('links', [])
        urls = [a.get('direct_asset_url') or a.get('url', '') for a in assets]
    else:
        if len(parts) < 2:
            return []
        endpoint = p.scheme + '://' + p.netloc + '/api/v1/repos/' + parts[0] + '/' + parts[1] + '/releases/latest'
        raw, _ = fetch(endpoint, 3 * 1024 * 1024)
        urls = [a.get('browser_download_url', '') for a in json.loads(raw).get('assets', [])]
    return download_assets([u for u in urls if urllib.parse.urlsplit(u).path.lower().endswith(('.apworld', '.zip'))][:10])

def work(row):
    r = {**{k: row[k] for k in ['game', 'row', 'stability', 'core', 'links']}, 'files': [], 'errors': []}
    if not row['links']['E']:
        r['reason'] = 'Core-Spiel ohne separaten Download' if r['core'] else 'Kein Download-Link in der Tabelle'
    elif all(('discord' in urllib.parse.urlsplit(u).hostname for u in row['links']['E'])):
        r['reason'] = 'Download nur über Discord verlinkt'
    else:
        for url in row['links']['E']:
            p = urllib.parse.urlsplit(url)
            try:
                if p.hostname == 'github.com':
                    files = github(url)
                elif p.hostname == 'gitlab.com' and '/-/blob/' in p.path and p.path.lower().endswith('.apworld'):
                    files = direct(url.replace('/-/blob/', '/-/raw/', 1))
                elif p.path.lower().endswith(('.apworld', '.zip')):
                    files = direct(url)
                elif p.hostname in ('gitlab.com', 'codeberg.org', 'git.makuluni.com', 'git.moyskleytech.com') and '/releases' in p.path:
                    files = forge(url)
                elif p.hostname in ('archipelagodoom.github.io', 'codeberg.org', 'gitlab.com', 'brandenek.github.io', 'www.kh1fmrando.com', 'pharware.com', 'mariomantaw.github.io', 'shapezap.ec32.tech', 'arthurstreeter.github.io', 'scrokkle.io', 'www.iwannawiki.com', 'git.makuluni.com', 'git.moyskleytech.com'):
                    data, final = fetch(url, 3 * 1024 * 1024)
                    doc = Links()
                    doc.feed(data.decode('utf8', 'replace'))
                    urls = [urllib.parse.urljoin(final, u) for u in doc.links if urllib.parse.urlsplit(u).path.lower().endswith('.apworld')]
                    files = download_assets(urls[:1])
                else:
                    files = []
                r['files'] += files
            except Exception as e:
                r['errors'].append(str(e)[:200])
    if r['files']:
        r['status'] = 'downloaded'
    elif r['core']:
        r['status'] = 'core'
        r['reason'] = 'Core-Spiel: kein eigenständiges APworld im Tabellenlink gefunden'
    else:
        r['status'] = 'manual'
        r['reason'] = r.get('reason') or '; '.join(r['errors']) or 'Kein direktes APworld-Asset im verlinkten Download gefunden'
    return r

def main():
    rows = read_catalog()
    (ROOT / 'assets/apworld-catalog.json').write_text(json.dumps({'schema': 1, 'source': SOURCE, 'rows': rows}, ensure_ascii=False, indent=2), encoding='utf-8')
    out = ROOT / 'assets/apworld-downloads.json'
    prior = json.loads(out.read_text(encoding='utf-8')) if out.exists() else {}
    by_row = {r['row']: r for r in rows}
    done = {}
    for row in prior.get('entries', []):
        current = by_row.get(row['row'])
        if not current or current['game'] != row['game'] or current['links']['E'] != row['links']['E']:
            continue
        valid = row['status'] == 'downloaded' and row['files'] and all(((OUT / f['file']).exists() and hashlib.sha256((OUT / f['file']).read_bytes()).hexdigest() == f['sha256'] for f in row['files']))
        if valid or ('--retry-manual' in sys.argv and row['status'] == 'core'):
            done[row['row']] = row
    results = dict(done)
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        futures = {pool.submit(work, r): r for r in rows if r['row'] not in done}
        for future in concurrent.futures.as_completed(futures):
            row = futures[future]
            try:
                r = future.result()
            except Exception as e:
                r = {**row, 'status': 'manual', 'reason': str(e), 'files': [], 'errors': []}
            results[r['row']] = r
            entries = sorted(results.values(), key=lambda r: r['row'])
            stats = {s: sum((r['status'] == s for r in entries)) for s in ['downloaded', 'manual', 'core']}
            report = {'schema': 1, 'source': SOURCE, 'retrievedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'total': len(rows), 'processed': len(entries), 'stats': stats, 'entries': entries}
            temp = out.with_suffix('.tmp')
            temp.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
            temp.replace(out)
            print(len(entries), '/', len(rows), stats, r['game'], flush=True)
if __name__ == '__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8', errors='backslashreplace')
    main()
