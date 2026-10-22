"""Prepare real option types/defaults from the pinned official Core release.

Developer command only: imports the selected official Core worlds. End users
receive the resulting JSON and need neither Python nor an Archipelago checkout.
"""
import argparse
import copy
import inspect
import json
from pathlib import Path
from core_worlds import ROOT, json_value, load_core


def option_metadata(key, option, groups, common):
    import Options
    raw = copy.deepcopy(option.default)
    value = json_value(option.from_any(copy.deepcopy(raw)).value)
    result = {'key': key, 'label': getattr(option, 'display_name', key.replace('_', ' ').title()),
              'group': groups.get(option, 'Archipelago' if key in common else 'Spieleinstellungen'),
              'description': inspect.getdoc(option) or ''}
    if issubclass(option, Options.Toggle):
        result.update(kind='toggle', default=bool(value))
    elif issubclass(option, Options.Range):
        special = getattr(option, 'special_range_names', {})
        result.update(kind='range', min=option.range_start, max=option.range_end,
                      special=list(special), specialValues=list(special.values()),
                      default=raw if isinstance(raw, str) else value)
    elif issubclass(option, Options.Choice):
        choices = [{'value': name, 'label': name.replace('_', ' ').title()} for name in sorted(option.name_lookup.values())]
        default = value if isinstance(value, str) else option.name_lookup[value]
        result.update(kind='textchoice' if issubclass(option, Options.TextChoice) else 'choice',
                      choices=choices, default=raw if raw == 'random' else default)
    else:
        kind = ('dict' if issubclass(option, Options.OptionDict) else
                'set' if issubclass(option, Options.OptionSet) else
                'list' if issubclass(option, (Options.OptionList, Options.PlandoConnections, Options.PlandoTexts)) else
                'text' if issubclass(option, Options.FreeText) and isinstance(value, str) else 'json')
        # YAML is input to from_any, not its internal output. Factorio's world_gen
        # and SC2 mission orders transform their data and cannot consume it twice.
        default = json_value(raw)
        expected = {'dict': dict, 'set': list, 'list': list}.get(kind)
        if expected and not isinstance(default, expected): kind = 'json'
        result.update(kind=kind, default=default)
        keys = getattr(option, 'valid_keys', ())
        if keys and kind in ('set', 'dict', 'list'): result['validKeys'] = json_value(sorted(keys, key=str))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archipelago', type=Path, required=True)
    args = parser.parse_args()
    spec, worlds = load_core(args.archipelago)
    import Options
    common = set(Options.PerGameCommonOptions.type_hints)
    prepared = []
    for row in spec['worlds']:
        world = worlds[row['game']]
        groups = {option: group.name for group in world.web.option_groups for option in group.options}
        options = [option_metadata(key, option, groups, common) for key, option in world.options_dataclass.type_hints.items()]
        prepared.append({'game': row['game'], 'aliases': [row['referenceName']] if row['referenceName'] != row['game'] else [],
                         'options': options, 'unresolved': [], 'traps': sorted(name for name in world.item_name_to_id if name.endswith(' Trap')),
                         'parser': 'Offizielle Archipelago-Optionstypen · vorbereitet beim Build',
                         'sourceFile': 'worlds/' + row['folder'] + '/__init__.py',
                         'sourceURL': spec['repository'] + '/tree/' + spec['commit'] + '/worlds/' + row['folder'],
                         'coreVersion': spec['version'], 'minimumAPVersion': spec['version']})
    result = {'schema': 1, 'version': spec['version'], 'source': {'repository': spec['repository'], 'commit': spec['commit']}, 'worlds': prepared}
    output = ROOT / 'assets/core-world-settings.json'
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True, allow_nan=False) + '\n', encoding='utf-8')
    print(json.dumps({'coreGames': len(prepared), 'options': sum(len(w['options']) for w in prepared), 'version': spec['version']}))


if __name__ == '__main__': main()
