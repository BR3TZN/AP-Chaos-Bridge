"""Extract declarative APworld metadata. World code is parsed, never imported or run."""
import ast
import copy
import json
import sys

UNKNOWN = object()
BUILTINS = {
    'Toggle': ('toggle', False), 'DefaultOnToggle': ('toggle', True), 'DeathLink': ('toggle', False),
    'Choice': ('choice', 0), 'TextChoice': ('textchoice', 0), 'Range': ('range', 0), 'NamedRange': ('range', 0),
    'OptionDict': ('dict', {}), 'OptionCounter': ('dict', {}), 'ItemDict': ('dict', {}), 'OptionList': ('list', []), 'ItemLinks': ('list', []),
    'FreeText': ('text', ''),
    'OptionSet': ('set', []), 'ItemSet': ('set', []), 'LocationSet': ('set', []),
    'StartInventory': ('dict', {}), 'StartInventoryPool': ('dict', {}), 'LocalItems': ('set', []),
    'NonLocalItems': ('set', []), 'StartHints': ('set', []), 'StartLocationHints': ('set', []),
    'ExcludeLocations': ('set', []), 'PriorityLocations': ('set', []),
    'Accessibility': ('choice', 0), 'ItemsAccessibility': ('choice', 1), 'ProgressionBalancing': ('range', 50),
}
COMMON = [
    {'key': 'progression_balancing', 'label': 'Progression Balancing', 'kind': 'range', 'default': 50, 'min': 0, 'max': 99, 'group': 'Archipelago'},
    {'key': 'accessibility', 'label': 'Accessibility', 'kind': 'choice', 'default': 'full', 'choices': [{'value': 'full', 'label': 'Full'}, {'value': 'minimal', 'label': 'Minimal'}], 'group': 'Archipelago'},
    *[{'key': k, 'label': k.replace('_', ' ').title(), 'kind': kind, 'default': {} if kind == 'dict' else [], 'group': 'Archipelago'} for k, kind in [
        ('local_items', 'set'), ('non_local_items', 'set'), ('start_inventory', 'dict'), ('start_hints', 'set'),
        ('start_location_hints', 'set'), ('exclude_locations', 'set'), ('priority_locations', 'set'), ('item_links', 'list')]],
]

def name_of(node):
    if isinstance(node, ast.Name): return node.id
    if isinstance(node, ast.Attribute): return name_of(node.value) + '.' + node.attr
    if isinstance(node, ast.Subscript): return name_of(node.value)
    if isinstance(node, ast.Constant) and isinstance(node.value, str): return node.value
    return ''

def assignments(body):
    for node in body:
        if isinstance(node, (ast.Assign, ast.AnnAssign)):
            for target in node.targets if isinstance(node, ast.Assign) else [node.target]:
                if isinstance(target, ast.Name): yield target.id, node.value


def inspect(files):
    modules, classes, warnings, traps, manifests, manifest_details = {}, {}, [], set(), {}, {}
    for file in sorted(files, key=lambda f: f['name']):
        filename = file['name']
        if filename.rsplit('/', 1)[-1] == 'archipelago.json':
            try:
                data = json.loads(file['text'])
                if isinstance(data.get('game'), str):
                    package_root = filename.split('/')[0] if '/' in filename else ''
                    manifests[package_root] = data['game']; manifest_details[package_root] = data
            except (ValueError, TypeError, AttributeError): pass
        if not filename.endswith('.py'): continue
        try: tree = ast.parse(file['text'].lstrip('\ufeff'), filename=filename)
        except (SyntaxError, ValueError, RecursionError) as error:
            warnings.append(filename + ': ' + str(error).splitlines()[0]); continue
        module = filename[:-3].replace('/', '.')
        package = module[:-9] if module.endswith('.__init__') else module.rpartition('.')[0]
        if module.endswith('.__init__'): module = module[:-9]
        modules[module] = {'tree': tree, 'constants': dict(assignments(tree.body)), 'aliases': {}, 'stars': []}
        for node in ast.walk(tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, str) and node.value.endswith(' Trap') and len(node.value) < 160 and '\n' not in node.value: traps.add(node.value)
        for node in tree.body:
            if isinstance(node, ast.ClassDef): classes[module + '.' + node.name] = {'node': node, 'module': module, 'file': filename, 'attrs': dict(assignments(node.body))}
            if isinstance(node, ast.ImportFrom):
                prefix = node.module or ''
                if node.level:
                    parts = package.split('.') if package else []
                    prefix = '.'.join(parts[:max(0, len(parts) - node.level + 1)] + ([prefix] if prefix else []))
                for alias in node.names:
                    if alias.name == '*': modules[module]['stars'].append(prefix)
                    else: modules[module]['aliases'][alias.asname or alias.name] = prefix + '.' + alias.name if prefix else alias.name
            elif isinstance(node, ast.Import):
                for alias in node.names: modules[module]['aliases'][alias.asname or alias.name.split('.')[0]] = alias.name if alias.asname else alias.name.split('.')[0]

    def normalize(name):
        if name.startswith('worlds.'):
            candidate = name[7:]
            if any(candidate == m or candidate.startswith(m + '.') for m in modules): return candidate
        return name

    def reference(node, module, depth=0):
        if depth > 15: return ''
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            try: return reference(ast.parse(node.value, mode='eval').body, module, depth + 1)
            except (SyntaxError, ValueError): return ''
        name = name_of(node)
        if not name: return ''
        first, _, rest = name.partition('.')
        local = modules.get(module, {})
        if module + '.' + first in classes or first in local.get('constants', {}): return module + '.' + name
        if first in local.get('aliases', {}): return normalize(local['aliases'][first] + ('.' + rest if rest else ''))
        for star in local.get('stars', []):
            candidate = normalize(star + '.' + name)
            if candidate in classes or (star in modules and first in modules[star]['constants']): return candidate
        return normalize(name)

    detail_cache = {}
    def literal(node, module, env=None, depth=0):
        if node is None or depth > 24: return UNKNOWN
        env = env or {}
        if isinstance(node, ast.Constant): return node.value
        if isinstance(node, ast.Name) and node.id in env: return env[node.id]
        if isinstance(node, (ast.Name, ast.Attribute)):
            ref = reference(node, module); owner, _, attr = ref.rpartition('.')
            if owner in modules and attr in modules[owner]['constants']: return literal(modules[owner]['constants'][attr], owner, depth=depth + 1)
            if owner in classes: return details(owner, depth=depth + 1)[0].get(attr, UNKNOWN)
            if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name) and node.value.id in env and isinstance(env[node.value.id], dict): return env[node.value.id].get(node.attr, UNKNOWN)
            return UNKNOWN
        if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
            if len(node.elts) > 10000: return UNKNOWN
            values = [literal(x, module, env, depth + 1) for x in node.elts]
            return UNKNOWN if any(x is UNKNOWN for x in values) else values
        if isinstance(node, ast.Dict):
            if len(node.keys) > 10000: return UNKNOWN
            result = {}
            for key, val in zip(node.keys, node.values):
                value = literal(val, module, env, depth + 1)
                if value is UNKNOWN: return UNKNOWN
                if key is None:
                    if not isinstance(value, dict): return UNKNOWN
                    result.update(value); continue
                key = literal(key, module, env, depth + 1)
                if key is UNKNOWN or not isinstance(key, (str, int, float, bool)): return UNKNOWN
                result[key] = value
            return result
        if isinstance(node, ast.UnaryOp):
            value = literal(node.operand, module, env, depth + 1)
            if isinstance(value, (int, float)):
                if isinstance(node.op, ast.USub): return -value
                if isinstance(node.op, ast.UAdd): return value
        if isinstance(node, ast.BinOp):
            left, right = literal(node.left, module, env, depth + 1), literal(node.right, module, env, depth + 1)
            try:
                if isinstance(node.op, ast.Add) and type(left) is type(right) and isinstance(left, (str, list, int, float)):
                    if isinstance(left, (str, list)) and len(left) + len(right) > 10000: return UNKNOWN
                    return left + right
                if isinstance(node.op, ast.BitOr) and isinstance(left, dict) and isinstance(right, dict): return left | right
                if isinstance(left, (int, float)) and isinstance(right, (int, float)) and abs(left) < 1e12 and abs(right) < 1e12:
                    if isinstance(node.op, ast.Sub): return left - right
                    if isinstance(node.op, ast.Mult): return left * right
                    if isinstance(node.op, ast.Pow) and 0 <= right <= 10: return left ** right
            except (TypeError, ValueError, OverflowError): pass
        if isinstance(node, ast.Subscript):
            value, key = literal(node.value, module, env, depth + 1), literal(node.slice, module, env, depth + 1)
            try:
                if isinstance(value, (dict, list, str)) and key is not UNKNOWN: return value[key]
            except (KeyError, IndexError, TypeError): pass
        if isinstance(node, ast.Call) and name_of(node.func) in ('set', 'frozenset', 'list', 'tuple', 'dict') and not node.keywords:
            if not node.args: return {} if name_of(node.func) == 'dict' else []
            if len(node.args) == 1:
                value = literal(node.args[0], module, env, depth + 1)
                if isinstance(value, (list, dict)):
                    if name_of(node.func) == 'dict':
                        try: return dict(value)
                        except (TypeError, ValueError): return UNKNOWN
                    return list(value)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr in ('keys', 'values') and not node.args and not node.keywords:
            value = literal(node.func.value, module, env, depth + 1)
            if isinstance(value, dict): return list(value.keys() if node.func.attr == 'keys' else value.values())
        return UNKNOWN

    def details(ref, trail=(), depth=0):
        if ref in trail or depth > 24: return {}, None
        if ref in detail_cache: return detail_cache[ref]
        name = ref.rsplit('.', 1)[-1]
        if ref not in classes:
            if name not in BUILTINS: return {}, None
            kind, default = BUILTINS[name]; attrs = {'default': copy.deepcopy(default)}
            if kind == 'range': attrs.update(range_start=0, range_end=99 if name == 'ProgressionBalancing' else 1)
            if name in ('Accessibility', 'ItemsAccessibility'):
                attrs.update(option_full=0, option_minimal=2)
                if name == 'ItemsAccessibility': attrs['option_items'] = 1
            return attrs, kind
        entry = classes[ref]; result, kind = {}, None
        for base in entry['node'].bases:
            inherited, base_kind = details(reference(base, entry['module']), trail + (ref,), depth + 1)
            result.update(inherited); kind = base_kind or kind
        for key, node in entry['attrs'].items(): result[key] = literal(node, entry['module'], result, depth + 1)
        detail_cache[ref] = result, kind
        return result, kind

    def attribute(ref, key, trail=()):
        if ref in trail or ref not in classes: return None, ''
        entry = classes[ref]
        if key in entry['attrs']: return entry['attrs'][key], entry['module']
        for base in entry['node'].bases:
            value, module = attribute(reference(base, entry['module']), key, trail + (ref,))
            if value is not None: return value, module
        return None, ''

    def fields(ref, trail=()):
        if ref in trail or ref not in classes: return {}
        entry = classes[ref]; result = {}
        for base in entry['node'].bases: result.update(fields(reference(base, entry['module']), trail + (ref,)))
        for node in entry['node'].body:
            if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name): result[node.target.id] = reference(node.annotation, entry['module'])
        return result

    def is_world(ref, trail=()):
        if ref in trail: return False
        if ref not in classes: return ref.rsplit('.', 1)[-1].endswith('World') and ref.rsplit('.', 1)[-1] != 'WebWorld'
        return any(is_world(reference(b, classes[ref]['module']), trail + (ref,)) for b in classes[ref]['node'].bases)

    groups = {}
    for module, entry in modules.items():
        for node in ast.walk(entry['tree']):
            if isinstance(node, ast.Call) and name_of(node.func).endswith('OptionGroup') and len(node.args) >= 2:
                label = literal(node.args[0], module)
                if isinstance(label, str) and isinstance(node.args[1], (ast.List, ast.Tuple)):
                    for option in node.args[1].elts: groups[reference(option, module)] = label

    worlds = []
    for ref, entry in classes.items():
        if not is_world(ref): continue
        game = details(ref)[0].get('game')
        if not isinstance(game, str) or not game.strip(): game = manifests.get(entry['module'].split('.')[0], manifests.get(''))
        if not isinstance(game, str) or not game.strip(): continue
        node, module = attribute(ref, 'options_dataclass'); option_fields = fields(reference(node, module)) if node is not None else {}
        if not option_fields:
            node, module = attribute(ref, 'options')
            if isinstance(node, ast.Dict):
                for key, val in zip(node.keys, node.values):
                    name = literal(key, module)
                    if isinstance(name, str): option_fields[name] = reference(val, module)
        if not option_fields:
            candidates = [n for n, c in classes.items() if c['module'].split('.')[0] == entry['module'].split('.')[0] and any(name_of(b).split('.')[-1] in ('PerGameCommonOptions', 'CommonOptions') for b in c['node'].bases)]
            if len(candidates) == 1: option_fields = fields(candidates[0])
        options, unresolved = copy.deepcopy(COMMON), []
        for key, type_ref in option_fields.items():
            attrs, kind = details(type_ref)
            if not kind: unresolved.append(key); continue
            label = attrs.get('display_name'); label = label if isinstance(label, str) else key.replace('_', ' ').title()
            declaration = classes.get(type_ref)
            option = {'key': key, 'label': label, 'kind': kind, 'group': groups.get(type_ref, 'Spieleinstellungen'), 'description': (ast.get_docstring(declaration['node']) or '') if declaration else ''}
            default = attrs.get('default', UNKNOWN)
            if kind in ('choice', 'textchoice'):
                choices = {k[7:].lower(): v for k, v in attrs.items() if k.startswith('option_') and isinstance(v, (int, str))}
                if not choices and kind == 'choice': unresolved.append(key); continue
                option['choices'] = [{'value': k, 'label': k.replace('_', ' ').title()} for k in choices]
                default = next((k for k, v in choices.items() if v == default), default if isinstance(default, str) else UNKNOWN)
                if kind == 'choice' and default not in choices and default != 'random': default = UNKNOWN
            elif kind == 'range':
                low, high = attrs.get('range_start'), attrs.get('range_end')
                if not isinstance(low, int) or not isinstance(high, int) or low > high: unresolved.append(key); continue
                special = attrs.get('special_range_names', {})
                if not isinstance(special, dict): special = {}
                option.update(min=low, max=high, special=list(special), specialValues=[v for v in special.values() if isinstance(v, int)])
                if default is not UNKNOWN and not ((isinstance(default, int) and (low <= default <= high or default in option['specialValues'])) or (isinstance(default, str) and (default in special or default.startswith('random')))): default = UNKNOWN
            elif kind == 'toggle':
                default = bool(default) if default is not UNKNOWN else UNKNOWN
            elif kind == 'text':
                # Some worlds subclass FreeText with scalar presets of another type.
                # Keep the declared value instead of inventing a string conversion.
                if default is not UNKNOWN and not isinstance(default, str): option.update(kind='json')
            elif kind in ('set', 'list', 'dict'):
                if kind in ('set', 'list') and isinstance(default, dict): default = list(default)
                if default is not UNKNOWN and not isinstance(default, dict if kind == 'dict' else list): option.update(kind='json', collectionKind=kind)
                if isinstance(attrs.get('valid_keys'), (list, dict)): option['validKeys'] = list(attrs['valid_keys'])
            if default is UNKNOWN: unresolved.append(key + ' (Standardwert dynamisch)')
            else: option['default'] = default
            options = [o for o in options if o['key'] != key] + [option]
        if not option_fields: unresolved.append('Options-Dataclass konnte nicht statisch aufgelöst werden')
        manifest = manifest_details.get(entry['module'].split('.')[0], manifest_details.get('', {}))
        info = {}
        for source_key, target_key in [('minimum_ap_version', 'minimumAPVersion'), ('world_version', 'worldVersion')]:
            value = manifest.get(source_key)
            if isinstance(value, str): info[target_key] = value[:200]
            elif isinstance(value, list) and len(value) == 3 and all(isinstance(part, int) and part >= 0 for part in value): info[target_key] = '.'.join(map(str, value))
        worlds.append({'game': game, 'options': options, 'unresolved': unresolved, 'traps': sorted(traps), 'parser': 'Python AST · kein Import', 'sourceFile': entry['file'], **info})
    return {'worlds': worlds, 'warnings': warnings}

if __name__ == '__main__':
    try:
        json.dump(inspect(json.load(sys.stdin)['files']), sys.stdout, ensure_ascii=True, allow_nan=False)
    except Exception as error:
        json.dump({'error': 'APworld-Analyse: ' + str(error)}, sys.stdout, ensure_ascii=True); sys.exit(1)
