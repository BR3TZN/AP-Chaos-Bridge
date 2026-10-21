"""Check the emitted documents with Archipelago's YAML-1.1 loader dependency."""
import json
import sys
import yaml


def same_type_values(expected, actual):
    if type(expected) is not type(actual):
        return False
    if isinstance(expected, dict):
        return expected.keys() == actual.keys() and all(same_type_values(value, actual[key]) for key, value in expected.items())
    if isinstance(expected, list):
        return len(expected) == len(actual) and all(same_type_values(a, b) for a, b in zip(expected, actual))
    return expected == actual


errors = []
checks = json.load(sys.stdin)
for check in checks:
    try:
        result = yaml.safe_load(check['yaml'])
        if not same_type_values(check['expected'], result):
            raise ValueError('Der YAML-1.1-Leser verändert Werte oder Datentypen.')
    except Exception as error:
        errors.append({'file': check['file'], 'game': check['game'], 'error': str(error)})
json.dump({'checked': len(checks), 'loader': 'PyYAML ' + yaml.__version__, 'errors': errors}, sys.stdout)
sys.exit(bool(errors))
