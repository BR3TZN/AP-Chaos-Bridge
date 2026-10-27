"""Package code or the complete local release without personal/runtime cache files."""
import argparse
import hashlib
import json
import subprocess
import sys
import zipfile
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('output', type=Path)
parser.add_argument('--source', action='store_true')
args = parser.parse_args()
args.output.parent.mkdir(parents=True, exist_ok=True)
excluded = {'.git', 'data', 'dist', '.catalog-cache', '__pycache__'} | ({'node_modules', 'apworlds'} if args.source else set())
package = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
lock = json.loads((ROOT / 'package-lock.json').read_text(encoding='utf-8'))
runtime = {name for name, info in lock['packages'].items() if name.startswith('node_modules/') and not info.get('dev')}
if not args.source:
    subprocess.run([sys.executable, str(ROOT / 'scripts/prepare_large_apworlds.py')], check=True)
    for name in runtime:
        if not (ROOT / name / 'package.json').is_file(): raise SystemExit('Laufzeitpaket fehlt: ' + name)
manifest = {'schema': 1, 'name': package['name'], 'version': package['version'], 'files': []}
with zipfile.ZipFile(args.output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    if args.source:
        archive.writestr('AP-Chaos-Bridge/SOURCE-SETUP.md', '# Quellcode-Paket\n\nDieses Paket enthält den Bridge-Quellcode. Für Laufzeitpakete `npm ci --ignore-scripts` ausführen. APworlds werden separat über `python3 scripts/sync_apworld_catalog.py`, `python3 scripts/build_apworld_cache.py` und `python3 scripts/build_catalog_report.py` vorbereitet. Anschließend `npm run validate:worlds` und `npm start` ausführen. Das vollständige Release-ZIP enthält die APworlds und Laufzeitpakete bereits.\n')
    for path in sorted(ROOT.rglob('*')):
        rel = path.relative_to(ROOT)
        allowed_dotfile = rel.as_posix() == '.gitignore' or (args.source and rel.parts[0] == '.github')
        if any(part.startswith('.') for part in rel.parts) and not allowed_dotfile:
            continue
        if rel.parts[0] in excluded or '__pycache__' in rel.parts or (not path.is_file()) or (path.suffix in ('.zip', '.tmp', '.pyc')):
            continue
        if args.source and rel.as_posix() in ('assets/apworld-settings.json', 'assets/apworld-downloads.json', 'assets/apworld-validation.json'):
            continue
        if rel.name == 'AP-Chaos-Bridge.exe' and len(rel.parts) == 1: continue
        if args.source and rel.parts[:2] == ('assets', 'windows'): continue
        if rel.parts[0] == 'node_modules' and not any(rel.as_posix().startswith(name + '/') for name in runtime): continue
        if rel.as_posix() == 'release-manifest.json': continue
        # Existing updaters allow assets but reject new files at the package root.
        relocated = not args.source and rel.as_posix() == 'FEHLENDE-SPIELE.md'
        if relocated: rel = Path('assets') / rel.name
        if not args.source:
            raw = path.read_bytes()
            if relocated: raw = raw.replace(b'](assets/', b'](')
            manifest['files'].append({'path': rel.as_posix(), 'size': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'mode': 0o755 if rel.as_posix() == 'start.sh' else 0o644})
        if relocated: archive.writestr('AP-Chaos-Bridge/' + rel.as_posix(), raw)
        else: archive.write(path, 'AP-Chaos-Bridge/' + rel.as_posix(), compress_type=zipfile.ZIP_STORED if path.suffix == '.apworld' else zipfile.ZIP_DEFLATED)
    if not args.source:
        subprocess.run(['node', str(ROOT / 'scripts/validate_release_manifest.mjs')], input=json.dumps(manifest), text=True, check=True)
        archive.writestr('AP-Chaos-Bridge/release-manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2))
print(args.output.resolve(), args.output.stat().st_size)
