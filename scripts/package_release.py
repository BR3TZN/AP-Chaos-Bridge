"""Package code or the complete local release without personal/runtime cache files."""
import argparse
import zipfile
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('output', type=Path)
parser.add_argument('--source', action='store_true')
args = parser.parse_args()
args.output.parent.mkdir(parents=True, exist_ok=True)
excluded = {'.git', 'data', '.catalog-cache', '__pycache__'} | ({'node_modules', 'apworlds'} if args.source else set())
with zipfile.ZipFile(args.output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    if args.source:
        archive.writestr('AP-Chaos-Bridge/SOURCE-SETUP.md', '# Quellcode-Paket\n\nDieses Paket enthält den Bridge-Quellcode. Für Laufzeitpakete `npm ci --ignore-scripts` ausführen. APworlds werden separat über `python3 scripts/sync_apworld_catalog.py`, `python3 scripts/build_apworld_cache.py` und `python3 scripts/build_catalog_report.py` vorbereitet. Anschließend `npm run validate:worlds` und `npm start` ausführen. Das vollständige Release-ZIP enthält die APworlds und Laufzeitpakete bereits.\n')
    for path in sorted(ROOT.rglob('*')):
        rel = path.relative_to(ROOT)
        if any(part.startswith('.') for part in rel.parts) and rel.as_posix() != '.gitignore':
            continue
        if rel.parts[0] in excluded or '__pycache__' in rel.parts or (not path.is_file()) or (path.suffix in ('.zip', '.tmp', '.pyc')):
            continue
        if args.source and rel.as_posix() in ('assets/apworld-settings.json', 'assets/apworld-downloads.json', 'assets/apworld-validation.json'):
            continue
        archive.write(path, 'AP-Chaos-Bridge/' + rel.as_posix(), compress_type=zipfile.ZIP_STORED if path.suffix == '.apworld' else zipfile.ZIP_DEFLATED)
print(args.output.resolve(), args.output.stat().st_size)
