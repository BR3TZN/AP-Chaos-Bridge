"""Validate player YAMLs with an installed source checkout and the exact APworld.

This developer command imports the selected APworld. It checks real option
classes and the world's optional validate() method, not ROM output or seed fill.
The normal Bridge importer never imports APworld code.
"""
import argparse
import hashlib
import importlib
import json
import os
import sys
import types
import zipfile
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--archipelago', type=Path, required=True, help='Archipelago-Quellcodeordner mit Generate.py')
parser.add_argument('--apworld', type=Path, required=True)
parser.add_argument('yaml', type=Path, nargs='+')
args = parser.parse_args()
ap, package = args.archipelago.resolve(), args.apworld.resolve()
if not (ap / 'Generate.py').is_file(): parser.error('Archipelago-Quellcodeordner fehlt.')
with zipfile.ZipFile(package) as archive:
    roots = {name.split('/')[0] for name in archive.namelist() if name.count('/') == 1 and name.endswith('/__init__.py')}
    if len(roots) != 1: parser.error('Genau ein World-Paket im APworld erwartet.')
    module_name = roots.pop()
    manifest = json.loads(archive.read(module_name + '/archipelago.json')) if module_name + '/archipelago.json' in archive.namelist() else {}
os.environ['SKIP_REQUIREMENTS_UPDATE'] = '1'
sys.path.insert(0, str(ap))
worlds = types.ModuleType('worlds'); worlds.__path__ = [str(ap / 'worlds'), str(package)]
sys.modules['worlds'] = worlds
from worlds.AutoWorld import AutoWorldRegister
worlds.AutoWorldRegister = AutoWorldRegister
importlib.import_module('worlds.' + module_name)
import Generate
import Utils
from BaseClasses import PlandoOptions

results = []
for filename in args.yaml:
    documents = list(Utils.parse_yamls(filename.read_bytes()))
    if not documents: raise ValueError('Leere YAML: ' + str(filename))
    for document in documents:
        rolled = Generate.roll_settings(document, PlandoOptions(0))
        world = AutoWorldRegister.world_types[rolled.game]
        options = world.options_dataclass(**{key: getattr(rolled, key) for key in world.options_dataclass.type_hints})
        if callable(getattr(options, 'validate', None)): options.validate()
        results.append({'file': filename.name, 'game': rolled.game, 'player': rolled.name, 'options': len(world.options_dataclass.type_hints), 'valid': True})
print(json.dumps({'archipelagoVersion': Utils.__version__, 'worldVersion': manifest.get('world_version'), 'apworldSha256': hashlib.sha256(package.read_bytes()).hexdigest(), 'results': results}, ensure_ascii=False))
