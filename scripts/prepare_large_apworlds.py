"""Fetch pinned large APworlds for development, validation and complete releases.

Only the pinned APworld or named archive member is copied. APworld code and client libraries are
never executed. The download and extracted World must both match pinned hashes.
"""
import hashlib
import json
import shutil
import tempfile
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parent.parent

def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()

def prepare(root=ROOT):
    limits = json.loads((root / 'assets/apworld-import-limits.json').read_text(encoding='utf-8'))
    worlds = json.loads((root / 'assets/large-apworlds.json').read_text(encoding='utf-8'))['worlds']
    cache = root / '.catalog-cache'
    cache.mkdir(exist_ok=True)
    for world in worlds:
        relative = PurePosixPath(world['file'])
        if relative.is_absolute() or '..' in relative.parts or ':' in str(relative) or '\\' in str(relative) or not str(relative).endswith('.apworld'):
            raise ValueError('Ungültiger APworld-Pfad')
        target = root / 'apworlds' / relative
        if target.is_file() and target.stat().st_size == world['bytes'] and digest(target) == world['sha256']:
            print('Bereit: ' + str(relative), flush=True)
            continue
        if not 0 < world['bytes'] <= limits['maxArchiveBytes']:
            raise ValueError('APworld überschreitet Import-Limit')
        direct = not world.get('member')
        bundle_hash = world['sha256'] if direct else world['bundleSha256']
        download_limit = limits['maxArchiveBytes'] if direct else limits['maxBundleBytes']
        bundle = cache / (bundle_hash + '.zip')
        if not bundle.exists() or digest(bundle) != bundle_hash:
            url = world['url']
            if not url.startswith('https://github.com/') or '/releases/download/' not in url:
                raise ValueError('Kein gepinnter GitHub-Release-Download')
            request = urllib.request.Request(url, headers={'User-Agent': 'AP-Chaos-Bridge large-world preparation'})
            with urllib.request.urlopen(request, timeout=30) as response, tempfile.NamedTemporaryFile(dir=cache, suffix='.tmp', delete=False) as output:
                temporary = Path(output.name)
                try:
                    size = 0
                    while chunk := response.read(1024 * 1024):
                        size += len(chunk)
                        if size > download_limit:
                            raise ValueError('Download-Bundle überschreitet Größenlimit')
                        output.write(chunk)
                except BaseException:
                    output.close()
                    temporary.unlink(missing_ok=True)
                    raise
            if digest(temporary) != bundle_hash:
                temporary.unlink(missing_ok=True)
                raise ValueError('SHA-256 des Release-Bundles stimmt nicht')
            temporary.replace(bundle)
        if bundle.stat().st_size > download_limit:
            raise ValueError('Download-Bundle überschreitet Größenlimit')
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix('.tmp')
        try:
            if direct:
                if bundle.stat().st_size != world['bytes']:
                    raise ValueError('APworld-Dateigröße ungültig')
                shutil.copyfile(bundle, temporary)
            else:
                with zipfile.ZipFile(bundle) as archive:
                    info = archive.getinfo(world['member'])
                    if info.flag_bits & 1 or info.file_size != world['bytes']:
                        raise ValueError('APworld-Dateigröße oder Verschlüsselung ungültig')
                    with archive.open(info) as source, temporary.open('wb') as output:
                        shutil.copyfileobj(source, output, 1024 * 1024)
            if digest(temporary) != world['sha256']:
                raise ValueError('SHA-256 der APworld stimmt nicht')
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
        print('Vorbereitet: ' + str(relative), flush=True)

if __name__ == '__main__':
    prepare()
