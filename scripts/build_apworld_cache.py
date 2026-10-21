"""Prepare static option metadata for the bundled APworlds (no package imports)."""
import concurrent.futures
import hashlib
import json
import time
import zipfile
from pathlib import Path
from inspect_apworld import inspect
ROOT = Path(__file__).resolve().parent.parent

def analyze(path):
    name = path.relative_to(ROOT / 'apworlds').as_posix()
    try:
        if path.stat().st_size > 40 * 1024 * 1024:
            raise ValueError('Download größer als 40 MiB')
        with zipfile.ZipFile(path) as archive:
            entries = archive.infolist()
            if len(entries) > 12000 or sum((e.file_size for e in entries)) > 100 * 1024 * 1024:
                raise ValueError('Archiv überschreitet Import-Limit')
            files = []
            for entry in entries:
                filename = entry.filename.replace('\\', '/')
                if entry.flag_bits & 1 or filename.startswith('/') or '..' in filename.split('/') or (':' in filename):
                    raise ValueError('Ungültiger Archiveintrag')
                if not (filename.endswith('.py') or filename.split('/')[-1] == 'archipelago.json') or '__pycache__' in filename:
                    continue
                if entry.file_size > 8 * 1024 * 1024:
                    raise ValueError('Quelldatei größer als 8 MiB')
                files.append({'name': filename, 'text': archive.read(entry).decode('utf8', 'replace')})
        result = inspect(files)
        if not result['worlds']:
            raise ValueError('Kein statisch deklarierter World-Spielname gefunden')
        return (name, {'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), **result}, None)
    except Exception as error:
        return (name, None, str(error))

def main():
    paths = sorted((ROOT / 'apworlds').rglob('*.apworld'))
    result = {'schema': 1, 'generatedAt': int(time.time() * 1000), 'files': {}, 'errors': [], 'parserSha256': hashlib.sha256((ROOT / 'scripts/inspect_apworld.py').read_bytes()).hexdigest()}
    out = ROOT / 'assets/apworld-settings.json'
    prior = json.loads(out.read_text(encoding='utf-8')) if out.exists() else {}
    pending = []
    for path in paths:
        name = path.relative_to(ROOT / 'apworlds').as_posix()
        entry = prior.get('files', {}).get(name)
        if prior.get('parserSha256') == result['parserSha256'] and entry and (hashlib.sha256(path.read_bytes()).hexdigest() == entry['sha256']):
            result['files'][name] = entry
        else:
            pending.append(path)
    with concurrent.futures.ProcessPoolExecutor(max_workers=4) as pool:
        for name, data, error in pool.map(analyze, pending):
            if error:
                result['errors'].append({'file': name, 'error': error})
            else:
                result['files'][name] = data
    out = ROOT / 'assets/apworld-settings.json'
    temp = out.with_suffix('.tmp')
    temp.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')
    temp.replace(out)
    games = {world['game'] for data in result['files'].values() for world in data['worlds']}
    print(json.dumps({'files': len(result['files']), 'games': len(games), 'errors': result['errors']}, ensure_ascii=False))
if __name__ == '__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8', errors='backslashreplace')
    main()
