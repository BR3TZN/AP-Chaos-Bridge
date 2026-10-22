"""Build-time access to the explicitly pinned official Archipelago source tree.

This helper imports official Core code. It is never called by the Bridge server
or when importing third-party APworlds; those remain static AST imports.
"""
import importlib
import json
import os
import subprocess
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_core(source):
    source = source.resolve()
    spec = json.loads((ROOT / 'assets/core-worlds-source.json').read_text(encoding='utf-8'))
    head = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
    if head != spec['commit']:
        raise ValueError('Archipelago-Quellcode muss exakt Commit ' + spec['commit'] + ' verwenden.')
    subprocess.run(['git', '-C', str(source), 'diff', '--exit-code', 'HEAD', '--', '*.py', '*.json'], check=True, stdout=subprocess.DEVNULL)
    os.environ['SKIP_REQUIREMENTS_UPDATE'] = '1'
    sys.path.insert(0, str(source))
    # Load only the selected official worlds, not any locally installed custom worlds.
    worlds = types.ModuleType('worlds')
    worlds.__path__ = [str(source / 'worlds')]
    sys.modules['worlds'] = worlds
    from worlds.AutoWorld import AutoWorldRegister
    worlds.AutoWorldRegister = AutoWorldRegister
    for row in spec['worlds']:
        importlib.import_module('worlds.' + row['folder'])
    import Utils
    if Utils.__version__ != spec['version']:
        raise ValueError('Archipelago-Version stimmt nicht mit dem Core-Manifest überein.')
    return spec, AutoWorldRegister.world_types


def json_value(value):
    import enum
    if isinstance(value, enum.Enum): return json_value(value.value)
    if value is None or isinstance(value, (str, int, float, bool)): return value
    if isinstance(value, dict): return {str(k): json_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)): return [json_value(v) for v in value]
    if isinstance(value, (set, frozenset)): return sorted((json_value(v) for v in value), key=str)
    raise TypeError('Nicht als JSON darstellbarer Optionswert: ' + type(value).__name__)
