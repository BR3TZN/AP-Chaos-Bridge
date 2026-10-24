import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, parseDocument } from 'yaml';
import { spawnSync } from 'node:child_process';
import { GameLibrary } from '../lib/game-library.mjs';
import { YAML_IMPORT_LIMIT } from '../lib/yaml-templates.mjs';
import { createApp } from '../server.mjs';
import { writeZip } from '../lib/zip.mjs';

const source = readFileSync(new URL('../examples/elden-ring-peliarch.yaml', import.meta.url), 'utf8');
const root = fileURLToPath(new URL('../', import.meta.url));
const noPython = () => { throw new Error('YAML-Import darf Python nicht aufrufen'); };
const fresh = () => { const library = new GameLibrary('.', root, { memory: true }); library.pythonCommand = noPython; return library; };
function temporary(t) { const path = mkdtempSync(join(tmpdir(), 'ap-yaml-import-')); t.after(() => rmSync(path, { recursive: true, force: true })); return path; }

test('the supplied Peliarch YAML imports all 91 settings and retains comments and root metadata for multiple players', () => {
  const library = fresh(), result = library.importYaml({ name: 'EldenRing.yaml', content: source });
  assert.deepEqual(result.games, ['Elden Ring']); assert.equal(library.list().games.length, 1);
  const entry = library.get('Elden Ring'), expected = parse(source, { version: '1.2' });
  assert.equal(entry.kind, 'yaml'); assert.equal(entry.options.length, 91);
  assert.equal(entry.options.find(o => o.key === 'num_regions').kind, 'range');
  assert.equal(entry.options.find(o => o.key === 'num_regions').max, 28);
  assert.equal(entry.options.find(o => o.key === 'dungeon_sweep').label, 'Dungeon Sweep');
  assert.deepEqual(entry.options.find(o => o.key === 'no_equip_load').choices.map(c => c.value), ['off', 'light', 'medium']);
  const files = library.generate({ game: entry.game, sourceId: entry.sourceId, players: ['Daniel', 'Friend'] });
  const checks = [];
  for (const [index, file] of files.entries()) {
    const data = parse(file.content, { version: '1.1' });
    assert.deepEqual(data, { ...expected, name: ['Daniel', 'Friend'][index] });
    assert(file.content.includes('THE GAME ID IS `Elden Ring`'));
    assert(file.content.includes('FIXED IN v0.2')); assert.equal(typeof data['Elden Ring'].no_equip_load, 'string');
    checks.push({ file: file.name, game: entry.game, yaml: file.content, expected: data });
  }
  const output = spawnSync('python', [join(root, 'scripts/validate_yaml_compat.py')], { input: JSON.stringify(checks), encoding: 'utf8' });
  assert.equal(output.status, 0, output.stdout + output.stderr);
});

test('editing Peliarch dropdowns, ranges, traps and extra keys preserves every other setting', () => {
  const library = fresh(); library.importYaml({ name: 'EldenRing.yaml', content: source });
  const values = { num_regions: 10, dungeon_sweep: 'all', death_link: true, no_equip_load: 'light', maximum_enemy_difficulty: 50, curated_filler: { juice: 90, runes: 10 }, start_region_pool: ['Limgrave'] };
  const yaml = library.generate({ game: 'Elden Ring', values, extra: 'new_setting: "no"', players: ['Daniel'] })[0].content;
  const expected = parse(source, { version: '1.2' }); expected.name = 'Daniel'; Object.assign(expected['Elden Ring'], values, { new_setting: 'no' });
  assert.deepEqual(parse(yaml, { version: '1.1' }), expected);
  assert(yaml.includes('Which boss kills also collect')); assert(yaml.includes('Filler Recipe'));
  assert.throws(() => library.generate({ game: 'Elden Ring', values: { num_regions: 29 }, players: ['Daniel'] }), /Bereich/);
});

test('an imported YAML never borrows defaults from another APworld of the same game', async t => {
  const library = new GameLibrary('.', root, { memory: true }), folder = temporary(t);
  library.importWorld(writeZip([{ name: 'fixture/__init__.py', content: "class WrongOption(Toggle):\n pass\nclass Settings(PerGameCommonOptions):\n unrelated_world_option: WrongOption\nclass EldenWorld(World):\n game = 'Elden Ring'\n options_dataclass = Settings" }]), 'different.apworld');
  const world = library.get('Elden Ring'); assert.equal(world.kind, 'apworld');
  library.pythonCommand = noPython; library.importYaml({ name: 'EldenRing.yaml', content: source });
  assert.equal(library.get('Elden Ring').kind, 'yaml'); assert.equal(library.get('Elden Ring').sources.length, 2);
  const yaml = library.generate({ game: 'Elden Ring', players: ['Daniel'] })[0].content;
  assert(!Object.hasOwn(parse(yaml)['Elden Ring'], 'unrelated_world_option'));
  library.selectSource({ game: 'Elden Ring', sourceId: 'world' });
  assert.equal(library.get('Elden Ring').kind, 'apworld');
  assert(Object.hasOwn(parse(library.generate({ game: 'Elden Ring', players: ['Daniel'] })[0].content)['Elden Ring'], 'unrelated_world_option'));
  await library.scan(folder); assert.equal(library.get('Elden Ring').kind, 'yaml');
});

test('YAML templates and the selected version survive scans, process restarts and deduplicate renamed uploads', async t => {
  const directory = temporary(t), folder = join(directory, 'worlds'); mkdirSync(folder);
  let library = new GameLibrary(directory, root, { folder, core: false }); library.pythonCommand = noPython;
  const first = library.importYaml({ name: 'EldenRing.yaml', content: source });
  const duplicate = library.importYaml({ name: 'Renamed.yml', content: source });
  assert.equal(first.templates[0].id, duplicate.templates[0].id); assert.equal(library.yamlTemplates.entries().length, 1);
  library.importYaml({ name: 'ShortRun.yml', content: source.replace('num_regions: 6', 'num_regions: 3') });
  assert.equal(library.get('Elden Ring').base['Elden Ring'].num_regions, 3);
  library.selectSource({ game: 'Elden Ring', sourceId: first.templates[0].id }); await library.scan();
  library = new GameLibrary(directory, root, { core: false }); library.pythonCommand = noPython;
  assert.equal(library.get('Elden Ring').base['Elden Ring'].num_regions, 6);
  assert.equal(library.get('Elden Ring').sources.length, 2); assert.equal(library.generate({ game: 'Elden Ring', players: ['Friend'] }).length, 1);
});

test('weighted settings, aliases, merges and explicit strings retain their types on export and local edits', () => {
  const library = fresh();
  const content = `# shared comment\nshared: &settings\n  item: no\n  count: 3\n  nested: &nested {x: 1}\nname: Source\ngame: Alias Game\nrequires: {version: 0.6.7}\nAlias Game:\n  <<: *settings\n  text: !!str off\n  mode: {off: 2, on: 3, random: 1}\n  copy: *nested\n  decimal: 9e-7\n  list: [on, no, off]\n`;
  library.importYaml({ name: 'alias.yml', content });
  const expected = parse(content, { version: '1.2', merge: true });
  let yaml = library.generate({ game: 'Alias Game', players: ['Daniel'] })[0].content;
  assert.deepEqual(parse(yaml, { version: '1.1', merge: true }), { ...expected, name: 'Daniel' });
  yaml = library.generate({ game: 'Alias Game', players: ['Daniel'], values: { count: 5, copy: { x: 2 }, text: 'on' } })[0].content;
  assert.deepEqual(parse(yaml, { version: '1.1', merge: true }), { ...expected, name: 'Daniel', 'Alias Game': { ...expected['Alias Game'], count: 5, copy: { x: 2 }, text: 'on' } });
  assert(yaml.includes('shared comment'));
  library.importYaml({ name: 'anchors.yaml', content: 'name: &name Source\ndescription: *name\ngame: Anchors\nAnchors:\n  first: &first {keep: 1, remove: 2}\n  second: *first\n  merged: {<<: *first, extra: 3}\n' });
  yaml = library.generate({ game: 'Anchors', players: ['Daniel'], values: { first: { keep: 4 }, merged: { keep: 5 } } })[0].content;
  assert.deepEqual(parse(yaml, { version: '1.1', merge: true }), { name: 'Daniel', description: 'Source', game: 'Anchors', Anchors: { first: { keep: 4 }, second: { keep: 1, remove: 2 }, merged: { keep: 5 } } });
});

test('multiple player documents import atomically with distinct sources', () => {
  const library = fresh();
  const yaml = 'name: First\ngame: Same Game\nSame Game: {setting: 1}\n---\nname: Second\ngame: Same Game\nSame Game: {setting: 2}\n';
  const imported = library.importYaml({ name: 'players.yaml', content: yaml });
  assert.equal(imported.templates.length, 2); assert.equal(library.get('Same Game').base['Same Game'].setting, 2);
  const first = library.generate({ game: 'Same Game', sourceId: imported.templates[0].id, players: ['Daniel'] });
  assert.equal(parse(first[0].content)['Same Game'].setting, 1);
});

test('minimal player YAMLs keep implicit defaults and can receive explicit extra settings', () => {
  const library = fresh(); library.importYaml({ name: 'minimal.yaml', content: '# minimal player\nname: Source\ngame: Defaults Only\n' });
  assert.equal(library.get('Defaults Only').options.length, 0);
  assert.deepEqual(parse(library.generate({ game: 'Defaults Only', players: ['Daniel'] })[0].content), { name: 'Daniel', game: 'Defaults Only' });
  assert.deepEqual(parse(library.generate({ game: 'Defaults Only', extra: 'custom_option: true', players: ['Daniel'] })[0].content), { name: 'Daniel', game: 'Defaults Only', 'Defaults Only': { custom_option: true } });
});

test('explicit sets, exponent numbers, plain choice words and date strings survive YAML 1.1 export', () => {
  const library = fresh(); library.importYaml({ name: 'types.yaml', content: 'game: Types\nTypes:\n  labels: !!set {on: null, off: null}\n  exponent: 9e-7\n  words: [2026-10-24, yes, no, on, off]\n' });
  const data = parse(library.generate({ game: 'Types', players: ['Daniel'], values: { labels: ['on', 'no'] } })[0].content, { version: '1.1' });
  assert.deepEqual(data.Types.labels, new Set(['on', 'no'])); assert.equal(data.Types.exponent, 9e-7);
  assert.deepEqual(data.Types.words, ['2026-10-24', 'yes', 'no', 'on', 'off']);
});

test('removing an imported template restores another source and survives a restart', t => {
  const directory = temporary(t), folder = join(directory, 'worlds'); mkdirSync(folder);
  let library = new GameLibrary(directory, root, { folder, core: false });
  const first = library.importYaml({ name: 'first.yaml', content: 'game: Removal\nRemoval: {count: 1}' });
  const second = library.importYaml({ name: 'second.yaml', content: 'game: Removal\nRemoval: {count: 2}' });
  library.removeYaml({ sourceId: second.templates[0].id });
  assert.equal(library.get('Removal').base.Removal.count, 1);
  library = new GameLibrary(directory, root, { core: false }); assert.equal(library.get('Removal').sourceId, first.templates[0].id);
  library.removeYaml({ sourceId: first.templates[0].id }); assert.equal(library.list().games.length, 0);
  assert.throws(() => library.get('Removal')); assert.throws(() => library.removeYaml({ sourceId: first.templates[0].id }));
});

test('invalid, oversized, unsafe and ambiguous YAML is rejected without changing the catalog', () => {
  const library = fresh();
  for (const content of ['game: Bad\nBad: {}\ngame: Again', 'name: NoGame\nsetting: 2', 'game: Unknown\nUnknown: !unknown value', '%YAML 1.1\n---\ngame: Date\nDate: {timestamp: 2026-10-24}', 'game: Unsafe\nUnsafe:\n  __proto__: {polluted: true}', 'game: {First: 1, Second: 2}\nFirst: {}\nSecond: {}', 'game: Loop\nLoop: &loop {value: *loop}', 'game: Bad\nBad: {}\n---\ninvalid: [']) {
    assert.throws(() => library.importYaml({ name: 'bad.yaml', content })); assert.equal(library.list().games.length, 0);
  }
  assert.throws(() => library.importYaml({ name: '../bad.yaml', content: source }), /Datei/);
  assert.throws(() => library.importYaml({ name: 'huge.yaml', content: ' '.repeat(YAML_IMPORT_LIMIT + 1) }), /2 MiB/);
  assert.equal({}.polluted, undefined);
});

test('real HTTP import needs a session, adds YAML-only games and isolates sources and presets by room', async t => {
  const app = await createApp({ memory: true, worldsDirectory: temporary(t), port: 0 }); t.after(() => app.close()); app.library.pythonCommand = noPython;
  const post = (path, body, auth = true) => fetch(app.url + '/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { 'X-Bridge-Session': app.snapshot().session } : {}) }, body: JSON.stringify(body) });
  assert.equal((await post('yaml/import', { name: 'ER.yaml', content: source }, false)).status, 403);
  const response = await post('yaml/import', { name: 'ER.yaml', content: source }); assert.equal(response.status, 200, await response.clone().text());
  const first = (await response.json()).templates[0].id;
  const second = await post('yaml/import', { name: 'Short.yaml', content: source.replace('num_regions: 6', 'num_regions: 2') }); const secondId = (await second.json()).templates[0].id;
  assert.equal((await post('yaml/preset', { game: 'Elden Ring', sourceId: first, players: ['Daniel'], values: { num_regions: 9 } })).status, 200);
  assert.equal((await post('yaml/preset', { game: 'Elden Ring', sourceId: secondId, players: ['Friend'], values: { num_regions: 2 } })).status, 200);
  assert.equal(app.store.state.yamlPresets[first].values.num_regions, 9); assert.equal(app.store.state.yamlPresets[secondId].values.num_regions, 2);
  const index = await fetch(app.url + '/api/game-index').then(r => r.json()); assert.equal(index.games[0].kind, 'yaml');
  assert.equal(app.snapshot().gameLibrary.games[0].optionCount, 91);
  const files = await (await post('yaml/generate', { game: 'Elden Ring', sourceId: first, players: ['Daniel', 'Friend'], values: { num_regions: 9 } })).json();
  assert.equal(files.files.length, 2); assert.equal(parse(files.files[1].content)['Elden Ring'].num_regions, 9);
  assert.equal((await post('yaml/source', { game: 'Elden Ring', sourceId: first })).status, 200);
  assert.equal((await fetch(app.url + '/api/game-settings?game=Elden%20Ring').then(r => r.json())).sourceId, first);
  const room = (await (await post('rooms/create', { name: 'Andere Peliarch-Runde' })).json()).room;
  assert.equal((await post('rooms/activate', { id: room.id })).status, 200);
  assert.equal((await post('yaml/source', { game: 'Elden Ring', sourceId: secondId })).status, 200);
  assert.equal((await post('yaml/preset', { game: 'Elden Ring', players: ['OtherRoom'], values: { num_regions: 4 } })).status, 200);
  assert.equal(app.store.state.yamlPresets[secondId].values.num_regions, 4);
  assert.equal((await fetch(app.url + '/api/game-index').then(r => r.json())).games[0].sourceId, secondId);
  assert.equal((await post('rooms/activate', { id: 'default' })).status, 200);
  assert.equal((await fetch(app.url + '/api/game-settings?game=Elden%20Ring').then(r => r.json())).sourceId, first);
  assert.equal(app.snapshot().gameLibrary.games[0].sourceId, first);
  assert.equal((await fetch(app.url + '/api/game-library').then(r => r.json())).games[0].sourceId, first);
  assert.equal(app.store.state.yamlPresets[first].values.num_regions, 9);
  assert.equal(app.store.state.yamlPresets[secondId].values.num_regions, 2);
  const defaultSource = await (await post('yaml/generate', { game: 'Elden Ring', players: ['RoomDefault'] })).json();
  assert.equal(parse(defaultSource.files[0].content)['Elden Ring'].num_regions, 6);
  assert.equal((await post('yaml/remove', { sourceId: secondId })).status, 200);
  assert.equal((await post('rooms/activate', { id: room.id })).status, 200);
  assert.equal((await fetch(app.url + '/api/game-settings?game=Elden%20Ring').then(r => r.json())).sourceId, first);
});
