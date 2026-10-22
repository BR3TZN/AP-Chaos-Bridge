"""Validate exported YAML with the pinned Core's real roll_settings and validators.

JSON input: [{file, game, yaml}]. Requires the developer-only Core dependencies.
This checks options, not complete seeds, ROM patching or gameplay.
"""
import argparse
import json
import sys
from pathlib import Path
from core_worlds import ROOT, load_core

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--archipelago', type=Path, required=True)
args = parser.parse_args()
checks = json.load(sys.stdin)
spec, worlds = load_core(args.archipelago)
import Generate
import Utils
from BaseClasses import PlandoOptions

results, errors = [], []
for check in checks:
    try:
        documents = list(Utils.parse_yamls(check['yaml']))
        if len(documents) != 1: raise ValueError('Genau ein YAML-Dokument erwartet')
        rolled = Generate.roll_settings(documents[0], PlandoOptions(0))
        if rolled.game != check['game']: raise ValueError('Spielname verändert')
        world = worlds[rolled.game]
        options = world.options_dataclass(**{key: getattr(rolled, key) for key in world.options_dataclass.type_hints})
        if callable(getattr(options, 'validate', None)): options.validate()
        results.append({'file': check['file'], 'game': rolled.game, 'player': rolled.name,
                        'options': len(world.options_dataclass.type_hints), 'valid': True})
    except Exception as error:
        cause = error
        while cause.__cause__: cause = cause.__cause__
        errors.append({'file': check['file'], 'game': check['game'], 'error': str(error), 'cause': str(cause)})
report = {'archipelagoVersion': spec['version'], 'sourceCommit': spec['commit'], 'games': len({r['game'] for r in results}),
          'configurations': len(results), 'method': 'Generate.roll_settings, Option.verify und Options-Dataclass.validate; keine vollständige Seed-Generierung',
          'results': results, 'errors': errors}
(ROOT / 'assets/core-worlds-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({k: v for k, v in report.items() if k != 'results'}, ensure_ascii=False))
if errors: sys.exit(1)
