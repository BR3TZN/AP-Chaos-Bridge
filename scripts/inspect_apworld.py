"""Read APWorld option declarations with Python's AST. Never import world code."""
import ast
import json
import sys

UNKNOWN = object()
BUILTINS = {
    'Toggle': ('toggle', False), 'DefaultOnToggle': ('toggle', True), 'DeathLink': ('toggle', False),
    'Choice': ('choice', 0), 'TextChoice': ('textchoice', 0), 'Range': ('range', 0), 'NamedRange': ('range', 0),
    'OptionDict': ('dict', {}), 'ItemDict': ('dict', {}), 'OptionList': ('list', []),
    'OptionSet': ('set', []), 'ItemSet': ('set', []), 'LocationSet': ('set', []),
    'StartInventory': ('dict', {}), 'StartInventoryPool': ('dict', {}),
    'LocalItems': ('set', []), 'NonLocalItems': ('set', []), 'StartHints': ('set', []),
    'StartLocationHints': ('set', []), 'ExcludeLocations': ('set', []), 'PriorityLocations': ('set', []),
    'Accessibility': ('choice', 0), 'ProgressionBalancing': ('range', 50),
}
COMMON = [
    {'key': 'progression_balancing', 'label': 'Progression Balancing', 'kind': 'range', 'default': 50, 'min': 0, 'max': 99, 'group': 'Archipelago'},
    {'key': 'accessibility', 'label': 'Accessibility', 'kind': 'text', 'default': 'full', 'group': 'Archipelago', 'description': 'Archipelago 0.6.x: full oder minimal. Bei älteren Worlds deren Vorlage beachten.'},
    *[{'key': k, 'label': k.replace('_', ' ').title(), 'kind': kind, 'default': {} if kind == 'dict' else [], 'group': 'Archipelago'} for k, kind in [
        ('local_items', 'set'), ('non_local_items', 'set'), ('start_inventory', 'dict'), ('start_hints', 'set'),
        ('start_location_hints', 'set'), ('exclude_locations', 'set'), ('priority_locations', 'set'), ('item_links', 'list')]],
]


def name_of(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return name_of(node.value) + '.' + node.attr
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return ''


def literal(node, env, depth=0):
    if depth > 15 or node is None:
        return UNKNOWN
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Name):
        return env.get(node.id, UNKNOWN)
    if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
        values = [literal(x, env, depth + 1) for x in node.elts]
        return UNKNOWN if any(x is UNKNOWN for x in values) else values
    if isinstance(node, ast.Dict):
        values = [(literal(k, env, depth + 1), literal(v, env, depth + 1)) for k, v in zip(node.keys, node.values)]
        if any(k is UNKNOWN or v is UNKNOWN or not isinstance(k, (str, int, float, bool)) for k, v in values):
            return UNKNOWN
        return dict(values)
    if isinstance(node, ast.UnaryOp):
        value = literal(node.operand, env, depth + 1)
        if isinstance(value, (int, float)):
            if isinstance(node.op, ast.USub):
                return -value
            if isinstance(node.op, ast.UAdd):
                return value
    if isinstance(node, ast.BinOp):
        left, right = literal(node.left, env, depth + 1), literal(node.right, env, depth + 1)
        if isinstance(node.op, ast.Add) and type(left) is type(right) and isinstance(left, (str, int, float, list)):
            value = left + right
            return value if not isinstance(value, (str, list)) or len(value) <= 10000 else UNKNOWN
    if isinstance(node, ast.Call) and name_of(node.func) in ('set', 'frozenset', 'list', 'tuple', 'dict'):
        if not node.args and not node.keywords:
            return {} if name_of(node.func) == 'dict' else []
        if len(node.args) == 1 and not node.keywords:
            value = literal(node.args[0], env, depth + 1)
            return value if isinstance(value, (list, dict)) else UNKNOWN
    return UNKNOWN


def inspect(files):
    classes, constants, errors = {}, {}, []
    traps = set()
    for file in files:
        if not file['name'].endswith('.py'):
            continue
        try:
            tree = ast.parse(file['text'], filename=file['name'])
        except (SyntaxError, ValueError, RecursionError) as error:
            errors.append(file['name'] + ': ' + str(error).splitlines()[0])
            continue
        env = dict(constants)
        traps.update(n.value for n in ast.walk(tree) if isinstance(n, ast.Constant) and isinstance(n.value, str) and n.value.endswith(' Trap') and len(n.value) < 160 and '\n' not in n.value)
        for node in tree.body:
            if isinstance(node, (ast.Assign, ast.AnnAssign)):
                value = literal(node.value, env)
                for target in node.targets if isinstance(node, ast.Assign) else [node.target]:
                    if isinstance(target, ast.Name) and value is not UNKNOWN:
                        env[target.id] = value
            if isinstance(node, ast.ClassDef):
                classes[node.name] = {'node': node, 'file': file['name'], 'env': env}
        constants.update(env)

    def details(name, trail=()):
        name = name.split('.')[-1]
        if name in trail or len(trail) > 20:
            return {}, None
        result, kind = {}, BUILTINS.get(name, (None, None))[0]
        if name in BUILTINS:
            result['default'] = BUILTINS[name][1]
        if name in ('Range', 'NamedRange'):
            result.update(range_start=0, range_end=1)
        entry = classes.get(name)
        if not entry:
            return result, kind
        for base in entry['node'].bases:
            inherited, base_kind = details(name_of(base), trail + (name,))
            result.update(inherited)
            kind = base_kind or kind
        env = {**constants, **entry['env'], **result}
        for node in entry['node'].body:
            if isinstance(node, (ast.Assign, ast.AnnAssign)):
                value = literal(node.value, env)
                for target in node.targets if isinstance(node, ast.Assign) else [node.target]:
                    if isinstance(target, ast.Name) and value is not UNKNOWN:
                        result[target.id] = value
                        env[target.id] = value
        return result, kind

    def fields(name, trail=()):
        name = name.split('.')[-1]
        if name in trail or name not in classes:
            return {}
        entry = classes[name]
        result = {}
        for base in entry['node'].bases:
            result.update(fields(name_of(base), trail + (name,)))
        for node in entry['node'].body:
            if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
                annotation = name_of(node.annotation)
                if annotation:
                    result[node.target.id] = annotation
        return result

    worlds = []
    for name, entry in classes.items():
        node = entry['node']
        if not any(name_of(base).split('.')[-1].endswith('World') for base in node.bases):
            continue
        attrs, _ = details(name)
        game = attrs.get('game')
        if not isinstance(game, str) or not game.strip():
            continue
        data_class = next((name_of(statement.value) for statement in node.body if isinstance(statement, (ast.Assign, ast.AnnAssign)) and any(isinstance(t, ast.Name) and t.id == 'options_dataclass' for t in (statement.targets if isinstance(statement, ast.Assign) else [statement.target]))), '')
        option_fields = fields(data_class)
        if not option_fields:
            candidates = [n for n, c in classes.items() if any(name_of(b).split('.')[-1] in ('PerGameCommonOptions', 'CommonOptions') for b in c['node'].bases)]
            if len(candidates) == 1:
                option_fields = fields(candidates[0])
        options, unresolved = [dict(option) for option in COMMON], []
        for key, type_name in option_fields.items():
            value, kind = details(type_name)
            if not kind:
                unresolved.append(key)
                continue
            option = {'key': key, 'label': value.get('display_name', key.replace('_', ' ').title()), 'kind': kind, 'group': 'Spieleinstellungen'}
            declaration = classes.get(type_name.split('.')[-1])
            option['description'] = ast.get_docstring(declaration['node']) or '' if declaration else ''
            if kind in ('choice', 'textchoice'):
                choices = {k[7:]: v for k, v in value.items() if k.startswith('option_') and isinstance(v, (int, str))}
                if not choices:
                    unresolved.append(key)
                    continue
                option['choices'] = [{'value': k, 'label': k.replace('_', ' ').title()} for k in choices]
                default = value.get('default', UNKNOWN)
                option['default'] = next((k for k, v in choices.items() if v == default), default if isinstance(default, str) else UNKNOWN)
            elif kind == 'range':
                if not isinstance(value.get('range_start'), int) or not isinstance(value.get('range_end'), int):
                    unresolved.append(key)
                    continue
                option.update(min=value['range_start'], max=value['range_end'])
                option['default'] = value.get('default', UNKNOWN)
                option['special'] = list(value.get('special_range_names', {}).keys()) if isinstance(value.get('special_range_names'), dict) else []
            elif kind == 'toggle':
                option['default'] = bool(value.get('default', False))
            else:
                option['default'] = value.get('default', UNKNOWN)
                if isinstance(value.get('valid_keys'), list):
                    option['validKeys'] = value['valid_keys']
            if option.get('default') is UNKNOWN:
                option.pop('default', None)
                unresolved.append(key + ' (Standardwert dynamisch)')
            options = [o for o in options if o['key'] != key]
            options.append(option)
        if not option_fields:
            unresolved.append('Options-Dataclass konnte nicht statisch aufgelöst werden')
        worlds.append({'game': game, 'options': options, 'unresolved': unresolved, 'traps': sorted(traps), 'parser': 'Python AST · kein Import', 'sourceFile': entry['file']})
    return {'worlds': worlds, 'warnings': errors}


if __name__ == '__main__':
    try:
        payload = json.load(sys.stdin)
        result = inspect(payload['files'])
        json.dump(result, sys.stdout, ensure_ascii=True)
    except Exception as error:
        json.dump({'error': 'APworld-Analyse: ' + str(error)}, sys.stdout, ensure_ascii=True)
        sys.exit(1)
