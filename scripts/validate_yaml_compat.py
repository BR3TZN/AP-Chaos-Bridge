"""Check the emitted documents with Archipelago's YAML-1.1 loader dependency."""
import json
import sys
import yaml


def mismatch(expected, actual, path='root'):
    if type(expected) is not type(actual):
        return path + ': erwartet ' + repr(expected) + ' (' + type(expected).__name__ + '), gelesen ' + repr(actual) + ' (' + type(actual).__name__ + ')'
    if isinstance(expected, dict):
        if expected.keys() != actual.keys(): return path + ': unterschiedliche Schlüssel'
        return next((error for key, value in expected.items() if (error := mismatch(value, actual[key], path + '.' + str(key)))), None)
    if isinstance(expected, list):
        if len(expected) != len(actual): return path + ': unterschiedliche Listenlänge'
        return next((error for i, (a, b) in enumerate(zip(expected, actual)) if (error := mismatch(a, b, path + '[' + str(i) + ']'))), None)
    return None if expected == actual else path + ': unterschiedliche Werte'


errors = []
checks = json.load(sys.stdin)
for check in checks:
    try:
        result = yaml.safe_load(check['yaml'])
        error = mismatch(check['expected'], result)
        if error: raise ValueError(error)
    except Exception as error:
        errors.append({'file': check['file'], 'game': check['game'], 'error': str(error)})
json.dump({'checked': len(checks), 'loader': 'PyYAML ' + yaml.__version__, 'errors': errors}, sys.stdout)
sys.exit(bool(errors))
