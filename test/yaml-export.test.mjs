import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { parse, stringify } from 'yaml';
import { YamlExport, yamlFolderName } from '../lib/yaml-export.mjs';
import { createApp } from '../server.mjs';

function directory(t) { const path = mkdtempSync(join(tmpdir(), 'ap-yaml-export-')); t.after(() => rmSync(path, { recursive: true, force: true })); return path; }
function setup(t) { const root = directory(t), players = join(root, 'Players'); mkdirSync(players); const exporter = new YamlExport(join(root, 'data')); exporter.update({ playersDirectory: players }); return { root, players, exporter }; }
const room = { id: 'first-room', name: 'Charity mit Freunden' };
const yaml = (name, value = 3, game = 'Export Fixture') => ({ name: 'ignored.yaml', content: stringify({ name, game, [game]: { health: value } }) });

test('Players settings persist globally, validate existing absolute directories, and can restore ordinary downloads', t => {
  const { root, players, exporter } = setup(t);
  assert.equal(new YamlExport(join(root, 'data')).settings.playersDirectory, players);
  for (const playersDirectory of ['relative/Players', join(root, 'missing'), join(root, 'data/yaml-export.json'), '\u0000']) assert.throws(() => exporter.update({ playersDirectory }));
  assert.equal(exporter.settings.playersDirectory, players);
  assert.equal(exporter.status(room).roomDirectory, join(players, room.name));
  exporter.update({ playersDirectory: '' });
  assert.equal(new YamlExport(join(root, 'data')).status(room).roomDirectory, '');
  assert.throws(() => exporter.save(room, [yaml('Daniel')]), /Players-Ordner/);
});

test('individual YAMLs round-trip unchanged and stable slot names update without duplicates or losing other games', t => {
  const { players, exporter } = setup(t), first = [yaml('Daniel'), yaml('Friend')];
  let result = exporter.save(room, first);
  assert.equal(result.directory, join(players, room.name)); assert.equal(result.files.length, 2);
  for (let index = 0; index < first.length; index++) assert.equal(readFileSync(result.files[index].path, 'utf8'), first[index].content);
  exporter.save(room, [yaml('Other', 2, 'Other Game')]);
  exporter.save(room, [yaml('Friend', 8), yaml('Daniel', 5)]);
  const names = readdirSync(result.directory).filter(name => name.endsWith('.yaml')).sort();
  assert.deepEqual(names, ['Daniel.yaml', 'Friend.yaml', 'Other.yaml']);
  assert.equal(parse(readFileSync(join(result.directory, 'Daniel.yaml'), 'utf8'))['Export Fixture'].health, 5);
  assert.equal(parse(readFileSync(join(result.directory, 'Other.yaml'), 'utf8')).game, 'Other Game');
  assert(!readdirSync(result.directory).some(name => name.endsWith('.tmp') || name.endsWith('.zip')));
});

test('room names remain readable and colliding rooms or existing manual folders remain separate', t => {
  const { players, exporter } = setup(t);
  mkdirSync(join(players, room.name)); writeFileSync(join(players, room.name, 'manual.yaml'), 'manual');
  const one = exporter.save(room, [yaml('Daniel')]);
  assert.notEqual(one.directory, join(players, room.name)); assert.equal(readFileSync(join(players, room.name, 'manual.yaml'), 'utf8'), 'manual');
  const two = exporter.save({ id: 'second-room', name: room.name }, [yaml('Daniel', 9)]);
  assert.notEqual(one.directory, two.directory);
  const renamed = exporter.save({ ...room, name: 'Neuer Raum' }, [yaml('Daniel', 8)]);
  assert.equal(renamed.directory, join(players, 'Neuer Raum')); assert(existsSync(one.files[0].path));
  for (const name of ['../escape', 'CON', 'A: B?*', '..', 'Übung · Freunde.']) {
    const result = exporter.save({ id: name, name }, [yaml('A/B'), yaml('A_B')]);
    assert(!relative(players, result.directory).includes('..')); assert.equal(result.files.length, 2); assert.notEqual(result.files[0].name, result.files[1].name);
  }
  assert.equal(yamlFolderName('Übung · Freunde'), 'Übung · Freunde'); assert.equal(yamlFolderName('CON'), '_CON');
});

test('a blocked output fails before replacing any existing YAML and a missing Players folder never falls back to downloads', t => {
  const { players, exporter } = setup(t), before = yaml('Daniel');
  const result = exporter.save(room, [before]);
  mkdirSync(join(result.directory, 'Blocked.yaml'));
  assert.throws(() => exporter.save(room, [yaml('Daniel', 8), yaml('Blocked')]), /keine normale Datei/);
  assert.equal(readFileSync(result.files[0].path, 'utf8'), before.content);
  assert(!readdirSync(result.directory).some(name => name.endsWith('.tmp')));
  rmSync(players, { recursive: true }); assert.throws(() => exporter.save(room, [before]), /nicht erreichbar/);
});

test('links and dangling links cannot redirect a room export outside the chosen folder', { skip: process.platform === 'win32' }, t => {
  const { root, players, exporter } = setup(t), outside = join(root, 'outside'); mkdirSync(outside);
  symlinkSync(outside, join(players, room.name));
  assert.throws(() => exporter.save(room, [yaml('Daniel')]), /normaler Ordner/); assert.equal(readdirSync(outside).length, 0);
  rmSync(join(players, room.name)); const result = exporter.save(room, [yaml('Daniel')]);
  symlinkSync(join(outside, 'missing.yaml'), join(result.directory, 'Friend.yaml'));
  assert.throws(() => exporter.save(room, [yaml('Daniel', 8), yaml('Friend')]), /Link/);
  assert.equal(parse(readFileSync(result.files[0].path, 'utf8'))['Export Fixture'].health, 3); assert.equal(readdirSync(outside).length, 0);
});

async function http(t) {
  const root = directory(t), players = join(root, 'Players'); mkdirSync(players);
  const app = await createApp({ directory: join(root, 'data'), memory: true, core: false, port: 0 }); t.after(() => app.close());
  app.library.importYaml({ name: 'fixture.yaml', content: 'name: Original\ngame: Export Fixture\nExport Fixture:\n  health: 3\n' });
  const post = (path, data, session = app.snapshot().session) => fetch(app.url + '/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-Session': session }, body: JSON.stringify(data) });
  const entry = app.library.get('Export Fixture');
  const data = () => ({ roomId: app.rooms.id, game: entry.game, sourceId: entry.sourceId, values: { health: 7 }, players: ['Daniel', 'Friend'], extra: '' });
  return { app, players, post, data };
}

test('the export API authenticates, checks the active room, generates its own validated YAMLs and saves room settings only after success', async t => {
  const { app, players, post, data } = await http(t);
  assert.equal((await post('yaml/export-settings', { playersDirectory: players }, 'wrong')).status, 403);
  assert.equal((await post('yaml/export-settings', { playersDirectory: players })).status, 200);
  assert.equal((await post('yaml/save', data(), 'wrong')).status, 403);
  assert.equal((await post('yaml/save', { ...data(), roomId: 'stale' })).status, 400);
  assert.equal((await post('yaml/save', { ...data(), players: [] })).status, 400);
  assert.equal(readdirSync(players).length, 0); assert.equal(Object.keys(app.store.state.yamlPresets).length, 0);
  const response = await post('yaml/save', { ...data(), files: [{ name: '../injected.yaml', content: 'injected' }] }); assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.files.length, 2);
  for (const file of result.files) { const doc = parse(readFileSync(file.path, 'utf8')); assert.equal(doc.game, 'Export Fixture'); assert.equal(doc['Export Fixture'].health, 7); }
  assert.deepEqual(app.store.state.yamlPresets[data().sourceId].players, ['Daniel', 'Friend']);
  const before = JSON.stringify(app.store.state.yamlPresets);
  const admin = await post('yaml/save-admin', { roomId: app.rooms.id }).then(response => response.json());
  const adminYaml = parse(readFileSync(admin.files[0].path, 'utf8')); assert.equal(adminYaml.name, 'ADMIN'); assert.equal(adminYaml.game, 'Archipelago'); assert.deepEqual(adminYaml.Archipelago, {});
  assert.equal(JSON.stringify(app.store.state.yamlPresets), before);
  assert.equal((await post('yaml/save-admin', { roomId: 'stale' })).status, 400);
});

test('the same global Players destination follows room switches while archived or deleted rooms do not remove exported files', async t => {
  const { app, players, post, data } = await http(t);
  await post('yaml/export-settings', { playersDirectory: players });
  const first = await post('yaml/save', data()).then(response => response.json()), stale = data();
  const second = app.rooms.create({ name: 'Wochenende' }); app.rooms.activate(second.id);
  assert.equal(app.snapshot().yamlExport.playersDirectory, players); assert.equal(app.snapshot().yamlExport.roomDirectory, join(players, second.name));
  assert.equal((await post('yaml/save', stale)).status, 400);
  const next = await post('yaml/save', data()).then(response => response.json()); assert.notEqual(first.directory, next.directory);
  app.rooms.archive('default', true); app.rooms.remove('default');
  assert(existsSync(first.files[0].path)); assert(existsSync(next.files[0].path));
  await post('yaml/export-settings', { playersDirectory: '' }); assert.equal((await post('yaml/save', data())).status, 400);
  assert.equal((await post('yaml/generate', data())).status, 200);
});
