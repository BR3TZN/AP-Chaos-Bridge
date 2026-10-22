"""Developer-only validation of explicitly reviewed and hash-pinned option modules.

The application never calls this script. Package initializers, World implementations
and clients are not imported. A temporary World registers the original option
dataclass for Generate.roll_settings; legacy option dictionaries are checked with
their original option types. This does not validate seeds or game compatibility.
"""
import argparse
import ast
import dataclasses
import hashlib
import importlib.machinery
import json
import os
import subprocess
import sys
import types
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--archipelago', type=Path, required=True)
args = parser.parse_args()
checks = json.load(sys.stdin)
spec = json.loads((ROOT / 'assets/user-worlds-validation-source.json').read_text(encoding='utf-8'))
source = args.archipelago.resolve()
head = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
if head != spec['archipelagoCommit']: raise ValueError('Falscher Archipelago-Quellstand')
subprocess.run(['git', '-C', str(source), 'diff', '--exit-code', 'HEAD', '--', '*.py'], check=True, stdout=subprocess.DEVNULL)
os.environ['SKIP_REQUIREMENTS_UPDATE'] = '1'
sys.path.insert(0, str(source))
worlds = types.ModuleType('worlds'); worlds.__path__ = [str(source / 'worlds')]; sys.modules['worlds'] = worlds
from worlds.AutoWorld import World, AutoWorldRegister
worlds.AutoWorldRegister = AutoWorldRegister
import Options
import Generate
import Utils
from BaseClasses import PlandoOptions

def module(name):
    result = types.ModuleType(name); result.__package__ = name.rpartition('.')[0]
    result.__file__ = str(ROOT / 'scripts' / 'validate_user_worlds.py')
    sys.modules[name] = result
    return result

schemas = {}
for index, row in enumerate(spec['worlds']):
    path = ROOT / 'apworlds' / row['file']
    if hashlib.sha256(path.read_bytes()).hexdigest() != row['sha256']: raise ValueError('World-Hash verändert: ' + row['file'])
    package_name = 'worlds._validated_' + str(index)
    package = module(package_name); package.__path__ = []
    loaded_options = []
    with zipfile.ZipFile(path) as archive:
        for item in sorted(row['sources'], key=lambda x: x['kind'] == 'options'):
            raw = archive.read(item['file'])
            if hashlib.sha256(raw).hexdigest() != item['sha256']: raise ValueError('Options-Hash verändert')
            normalized = item['file'].replace('\\', '/')
            name = package_name + '.' + normalized.rsplit('/', 1)[-1][:-3]
            target = module(name)
            # Supply read-only JSON resources for declarative data dependencies
            # such as Celeste. No package initializer or client is loaded.
            resources = {entry.filename.replace('\\', '/'): archive.read(entry)
                         for entry in archive.infolist() if entry.filename.endswith('.json')}
            class Resources:
                def __init__(self, files):
                    self.files = files
                def get_data(self, path):
                    return self.files[path.removeprefix('/_world_validation/')]
            target.__file__ = '/_world_validation/' + normalized
            target.__loader__ = Resources(resources)
            target.__spec__ = importlib.machinery.ModuleSpec(name, target.__loader__)
            if item['kind'] == 'literalDependency':
                declarations = {node.target.id: node.value for node in ast.parse(raw).body if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name)}
                for key in item['constants']: setattr(target, key, ast.literal_eval(declarations[key]))
            else:
                exec(compile(raw, row['file'] + '/' + normalized, 'exec'), target.__dict__)
            if item['kind'] == 'options': loaded_options.append(target)
    candidates = [value for target in loaded_options for value in target.__dict__.values()
                  if isinstance(value, type) and value is not Options.PerGameCommonOptions
                  and value.__module__ == target.__name__ and issubclass(value, Options.PerGameCommonOptions)]
    if row['legacy']:
        definitions = loaded_options[0].space_engineers_options
        schema = dataclasses.make_dataclass('LegacyOptions', list(definitions.items()), bases=(Options.PerGameCommonOptions,))
    elif not loaded_options:
        schema = Options.PerGameCommonOptions
    else:
        if len(candidates) != 1: raise ValueError('Options-Dataclass nicht eindeutig: ' + row['file'])
        schema = candidates[0]
    for game in row['games']:
        type('ValidatedWorld' + str(index), (World,), {'game': game, 'options_dataclass': schema,
             'item_name_to_id': {}, 'location_name_to_id': {}, '__module__': package_name})
        schemas[row['file'], game] = schema

results, errors = [], []
for check in checks:
    try:
        document = list(Utils.parse_yamls(check['yaml']))[0]
        rolled = Generate.roll_settings(document, PlandoOptions(0))
        schema = schemas[check['file'], check['game']]
        options = schema(**{key: getattr(rolled, key) for key in schema.type_hints})
        if callable(getattr(options, 'validate', None)): options.validate()
        results.append({key: check[key] for key in ('file', 'game', 'variant')} | {'options': len(schema.type_hints), 'valid': True})
    except Exception as error:
        cause = error
        while cause.__cause__: cause = cause.__cause__
        errors.append({key: check[key] for key in ('file', 'game', 'variant')} | {'error': str(error), 'cause': str(cause)})
report = {'archipelagoVersion': Utils.__version__, 'sourceCommit': head,
          'games': len({r['game'] for r in results}), 'configurations': len(results),
          'method': 'Originale geprüfte Optionsmodule, Generate.roll_settings, Option.verify und Dataclass.validate; temporäre World-Registrierung ohne Spielcode oder Seed-Generierung. Legacy-Wörterbuch mit ursprünglichen Optionstypen.',
          'results': results, 'errors': errors}
(ROOT / 'assets/user-worlds-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({key: value for key, value in report.items() if key != 'results'}, ensure_ascii=False))
if errors: sys.exit(1)
