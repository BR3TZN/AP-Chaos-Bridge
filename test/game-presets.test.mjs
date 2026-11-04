import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GamePresets, gamePresetRevision } from '../lib/game-presets.mjs';
import { createApp } from '../server.mjs';
import { writeZip } from '../lib/zip.mjs';
import { parse } from 'yaml';

function directory(t) { const path = mkdtempSync(join(tmpdir(), 'ap-game-presets-')); t.after(() => rmSync(path, { recursive: true, force: true })); return path; }
const entry = () => ({ game: 'Preset Game', kind: 'apworld', sourceId: 'world', source: 'fixture.apworld', worldVersion: '1.0', base: { 'Preset Game': { health: 3 } }, options: [{ key: 'health', label: 'Health', kind: 'range', min: 1, max: 9, default: 3 }] });
async function setup(t, options = {}) { const app = await createApp({ directory: directory(t), port: 0, memory: true, ...options }); t.after(() => app.close()); const post = (path, data, session = app.snapshot().session) => fetch(app.url + '/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-Session': session }, body: JSON.stringify(data) }); return { app, post }; }
const source = { name: 'Original.yaml', content: 'name: Original\ngame: Preset Game\nPreset Game:\n  # Allowed values: easy, hard\n  difficulty: easy\n  trap_count: 5\n  death_link: false\n' };
const context = (app, entry) => ({ roomId: app.rooms.id, game: entry.game, sourceId: entry.sourceId, sourceRevision: gamePresetRevision(entry) });

test('named game presets persist, clone settings and handle explicit updates and concurrent changes', t => {
  const path = directory(t), first = new GamePresets(path), world = entry();
  const saved = first.save({ name: 'Charity', values: { health: 7 }, extra: 'trap_weight: 20\n', players: ['MustNotBeStored'] }, world);
  assert(!Object.hasOwn(saved, 'players')); assert(!readFileSync(join(path, 'game-presets.json'), 'utf8').includes('MustNotBeStored'));
  const restarted = new GamePresets(path); assert.deepEqual(restarted.get(saved.id, world.game).values, { health: 7 });
  const copy = restarted.get(saved.id, world.game); copy.values.health = 1; assert.equal(restarted.get(saved.id, world.game).values.health, 7);
  assert.throws(() => restarted.save({ name: 'CHARITY', values: {}, extra: '' }, world), /bereits/);
  const updated = restarted.save({ id: saved.id, expectedRevision: saved.revision, name: 'Charity entspannt', values: { health: 8 }, extra: '' }, world);
  assert.equal(updated.id, saved.id); assert.notEqual(updated.revision, saved.revision);
  assert.throws(() => restarted.save({ id: saved.id, expectedRevision: saved.revision, name: 'Old', values: {}, extra: '' }, world), /inzwischen/);
  assert.throws(() => restarted.remove({ id: saved.id, game: world.game, expectedRevision: saved.revision }), /inzwischen/);
  restarted.remove({ id: saved.id, game: world.game, expectedRevision: updated.revision }); assert.equal(new GamePresets(path).list().length, 0);
});

test('preset compatibility ignores file paths and descriptions but detects other sources, versions and defaults', t => {
  const presets = new GamePresets(directory(t), { memory: true }), world = entry(), saved = presets.save({ name: 'Default', values: { health: 7 } }, world);
  const moved = structuredClone(world); moved.source = 'renamed/fixture.apworld'; moved.options[0].label = 'Gesundheit'; moved.options[0].description = 'Changed documentation'; assert.equal(gamePresetRevision(moved), saved.sourceRevision); presets.compatible(saved, moved);
  for (const modify of [value => { value.worldVersion = '2.0'; }, value => { value.kind = 'yaml'; }, value => { value.options[0].max = 5; }, value => { value.base[world.game].health = 2; }]) {
    const changed = structuredClone(world); modify(changed); assert.throws(() => presets.compatible(saved, changed), /andere/);
  }
  assert.throws(() => presets.get(saved.id, 'Other Game'), /fehlt/);
  assert(!Object.hasOwn(presets.list()[0], 'values')); assert(!Object.hasOwn(presets.list()[0], 'extra'));
});

test('shared presets load in another room and survive deletion of their original room without copying slot identities', async t => {
  const { app, post } = await setup(t); app.library.importYaml(source);
  const world = app.library.get('Preset Game'), data = { ...context(app, world), name: 'Charity Weekend', values: { trap_count: 25, death_link: true }, extra: 'difficulty: hard\n' };
  const created = await post('game-presets/save', { ...data, players: ['Original'] }); assert.equal(created.status, 200); const saved = await created.json();
  const room = app.rooms.create({ name: 'Other Run' }); await post('rooms/activate', { id: room.id }); app.store.state.players = [{ id: 'friend', name: 'Friend', game: world.game }];
  const loaded = await post('game-presets/load', { ...context(app, world), id: saved.id }); assert.equal(loaded.status, 200); const preset = await loaded.json();
  assert(!Object.hasOwn(preset, 'players')); assert.deepEqual(app.store.state.players.map(player => player.name), ['Friend']); assert.equal(Object.keys(app.store.state.yamlPresets).length, 0);
  const generated = await post('yaml/generate', { game: world.game, sourceId: world.sourceId, values: preset.values, extra: preset.extra, players: ['Friend'] }).then(response => response.json());
  const yaml = parse(generated.files[0].content); assert.equal(yaml.name, 'Friend'); assert.equal(yaml[world.game].trap_count, 25); assert.equal(yaml[world.game].death_link, true); assert.equal(yaml[world.game].difficulty, 'hard');
  const removed = await post('rooms/delete', { id: 'default', confirmName: 'Mein Multiworld' }); assert.equal(removed.status, 200);
  assert.equal(app.snapshot().gamePresets[0].id, saved.id); assert.equal((await post('game-presets/load', { ...context(app, world), id: saved.id })).status, 200);
  const revision = app.snapshot().gamePresets[0].revision; assert.equal((await post('game-presets/delete', { id: saved.id, game: world.game, expectedRevision: revision })).status, 200); assert.equal(app.snapshot().gamePresets.length, 0);
});

test('preset HTTP guards reject stale sources, invalid settings and untrusted writes atomically', async t => {
  const { app, post } = await setup(t); app.library.importYaml(source); const world = app.library.get('Preset Game');
  const data = { ...context(app, world), name: 'Safe', values: { trap_count: 10 }, extra: '' };
  for (const value of [{ ...data, sourceRevision: 'stale' }, { ...data, roomId: 'stale' }, { ...data, values: { invented_option: 1 } }, { ...data, name: '' }, { ...data, extra: 'invalid: [yaml' }]) assert.equal((await post('game-presets/save', value)).status, 400);
  assert.equal((await post('game-presets/save', data, 'wrong-session')).status, 403);
  assert.equal(app.snapshot().gamePresets.length, 0);
  const saved = await post('game-presets/save', data).then(response => response.json());
  assert.equal((await post('game-presets/load', { ...data, id: saved.id, sourceRevision: 'stale' })).status, 400);
  assert.equal((await post('game-presets/delete', { id: saved.id, game: 'Another', expectedRevision: saved.revision })).status, 400);
  assert.equal(app.snapshot().gamePresets.length, 1);
});

test('APworld and Core presets validate their original option types before saving', async t => {
  const { app, post } = await setup(t, { core: true });
  app.library.importWorld(writeZip([{ name: 'preset/__init__.py', content: 'class Health(Range):\n range_start = 1\n range_end = 9\n default = 3\nclass PresetOptions(PerGameCommonOptions):\n health: Health\nclass PresetWorld(World):\n game = "AP Preset"\n options_dataclass = PresetOptions\n' }]), 'fixture.apworld');
  const world = app.library.get('AP Preset'); assert.equal((await post('game-presets/save', { ...context(app, world), name: 'Too high', values: { health: 100 } })).status, 400);
  assert.equal((await post('game-presets/save', { ...context(app, world), name: 'Good', values: { health: 8 } })).status, 200);
  const core = app.library.get('Factorio'), option = core.options.find(option => option.kind === 'toggle'); assert(option);
  assert.equal((await post('game-presets/save', { ...context(app, core), name: 'Core Charity', values: { [option.key]: !option.default } })).status, 200);
  assert.equal(app.snapshot().gamePresets.length, 2);
});

test('damaged persisted preset files fail without being overwritten', t => {
  const path = directory(t), content = '{"schema":99,"presets":[]}'; writeFileSync(join(path, 'game-presets.json'), content);
  assert.throws(() => new GamePresets(path), /beschädigt/); assert.equal(readFileSync(join(path, 'game-presets.json'), 'utf8'), content);
});
