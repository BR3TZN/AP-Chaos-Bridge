import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { parse } from 'yaml';
import { createApp } from '../server.mjs';
import { connectionConfig } from '../lib/address.mjs';
import { Store, normalizeRule } from '../lib/model.mjs';
import { Engine } from '../lib/engine.mjs';
import { Vault, SECRET_MASK } from '../lib/vault.mjs';
import { GameLibrary } from '../lib/game-library.mjs';
import { readZip, writeZip } from '../lib/zip.mjs';
import { TwitchSource } from '../lib/sources.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, timeout = 2500) { const end = Date.now() + timeout; while (!predicate()) { if (Date.now() > end) throw new Error('Timed out'); await delay(10); } }
const tempPaths = [];
after(() => { for (const path of tempPaths) rmSync(path, { recursive: true, force: true }); });
function temp(t) { const path = mkdtempSync(join(tmpdir(), 'ap-studio-')); tempPaths.push(path); return path; }
function post(app, path, value = {}, headers = {}) { return fetch(app.url + '/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-Session': app.snapshot().session, ...headers }, body: JSON.stringify(value) }); }
async function appFor(t, options = {}) { const app = await createApp({ memory: true, port: 0, ...options }); t.after(() => app.close()); return app; }
const world = `
raise RuntimeError('This APworld must never be executed')
class Difficulty(Choice):
    """Difficulty description from the APworld."""
    display_name = 'Difficulty'
    option_easy = 1
    option_hard = 5
    default = 5
class StartingHealth(Range):
    range_start = 1
    range_end = 9
    default = 3
class FastMode(DefaultOnToggle):
    pass
class StartingItems(OptionDict):
    default = {'Potion': 2}
class DynamicMode(Choice):
    option_special = compute_at_runtime()
class FixtureOptions(PerGameCommonOptions):
    difficulty: Difficulty
    health: StartingHealth
    fast_mode: FastMode
    starting_items: StartingItems
    death_link: DeathLink
    dynamic_mode: DynamicMode
class FixtureWorld(World):
    game = 'Fixture Adventure'
    options_dataclass = FixtureOptions
    item_name_to_id = {'Bomb Trap': 10, 'Potion': 11}
`;
const worldZip = () => writeZip([{ name: 'fixture/__init__.py', content: world }]);

test('local, archipelago.gg and custom server inputs construct precise addresses', () => {
  assert.equal(connectionConfig({}, { addressMode: 'local', port: 12345, slotName: 'A' }).url, 'ws://127.0.0.1:12345/');
  assert.equal(connectionConfig({}, { addressMode: 'hosted', port: 23456 }).url, 'ws://archipelago.gg:23456/');
  assert.equal(connectionConfig({}, { addressMode: 'custom', host: 'ap.example.com', port: 443, secure: true }).url, 'wss://ap.example.com/');
  for (const raw of [{ addressMode: 'custom', host: 'evil@host', port: 5 }, { addressMode: 'local', port: 0 }, { addressMode: 'hosted', port: 1.5 }]) assert.throws(() => connectionConfig({}, raw));
});
test('vault preserves masked credentials across restarts and keeps plaintext out of its file', t => {
  const path = temp(t), first = new Vault(path); first.update('room-a', { adminPassword: 'private-password' });
  assert.equal(first.resolve('room-a', 'adminPassword', SECRET_MASK), 'private-password');
  assert(!readFileSync(join(path, 'connections.enc')).includes(Buffer.from('private-password')));
  const second = new Vault(path); assert.equal(second.get('room-a').adminPassword, 'private-password'); assert.equal(second.get('room-b').adminPassword, undefined);
  assert.deepEqual(second.status('room-a').adminPassword, true);
});
test('Twitch callback permits cross-site navigation while cross-site API reads and writes stay blocked', async t => {
  const app = await appFor(t);
  assert.equal((await fetch(app.url + '/oauth/callback', { headers: { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://id.twitch.tv' } })).status, 200);
  assert.equal((await fetch(app.url + '/api/state', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await post(app, 'config', {}, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await fetch(app.url + '/oauth/callback?code=unrequested&state=wrong')).status, 400);
});
test('Twitch authorization code flow uses local callback, checks state and retains refresh token', async t => {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' }); await once(wss, 'listening');
  t.after(() => { for (const ws of wss.clients) ws.terminate(); wss.close(); });
  wss.on('connection', ws => ws.send(JSON.stringify({ metadata: { message_type: 'session_welcome' }, payload: { session: { id: 'mock-session', keepalive_timeout_seconds: 20 } } })));
  const requests = [];
  const fetchImpl = async (url, request = {}) => {
    requests.push({ url, request });
    if (url.endsWith('/oauth2/token')) return new Response(JSON.stringify({ access_token: 'private-access-token', refresh_token: 'private-refresh-token' }));
    if (url.endsWith('/oauth2/validate')) return new Response(JSON.stringify({ client_id: 'test-app', user_id: '42', scopes: ['bits:read'] }));
    return new Response('{}', { status: 202 });
  };
  const app = await appFor(t, { fetchImpl, twitchSocketUrl: `ws://127.0.0.1:${wss.address().port}` });
  await post(app, 'config', { twitch: { clientId: 'test-app', events: ['channel.cheer'] } });
  await post(app, 'twitch/credentials', { clientSecret: 'private-client-secret' });
  const auth = new URL((await (await post(app, 'twitch/auth')).json()).url);
  assert.equal(auth.searchParams.get('response_type'), 'code');
  const state = auth.searchParams.get('state');
  assert.equal((await fetch(app.url + '/oauth/callback?code=code&state=wrong')).status, 400);
  const callback = await fetch(app.url + '/oauth/callback?code=code&state=' + state, { redirect: 'manual', headers: { 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(callback.status, 303); assert.equal(callback.headers.get('location'), '/oauth/callback?complete=1');
  await until(() => app.twitch.state === 'connected');
  assert.equal(app.vault.get('default').twitchRefresh, 'private-refresh-token');
  assert.equal(requests[0].request.body.get('client_secret'), 'private-client-secret');
  assert(!JSON.stringify(app.snapshot()).includes('private-'));
  assert(!(await fetch(app.url + '/api/export').then(r => r.text())).includes('private-'));
  assert.equal((await fetch(app.url + '/oauth/callback?code=replay&state=' + state)).status, 400);
  assert.equal((await post(app, 'twitch/connect', { token: 'manual-replacement' })).status, 200);
  assert.equal(app.twitch.refreshToken, ''); assert.equal(app.snapshot().savedCredentials.twitchRefresh, false);
  await post(app, 'credentials/forget', { source: 'twitch' });
  assert.equal(app.twitch.state, 'disconnected'); assert.equal(app.snapshot().savedCredentials.twitchToken, false); assert.equal(app.store.state.config.autoConnect.twitch, false);
});
test('Twitch refreshes expired tokens once, retains rotated refresh token and validates the replacement', async () => {
  const saved = [], calls = [];
  const source = new TwitchSource({ getConfig: () => ({ clientId: 'app', broadcasterId: '', events: ['channel.cheer'] }), ingest() {}, log() {}, changed() {}, onTokens: value => saved.push(value), fetchImpl: async (url, request) => {
    calls.push(url);
    if (url.endsWith('/token')) return new Response(JSON.stringify({ access_token: 'new', refresh_token: 'rotated' }));
    return request.headers.Authorization === 'OAuth old' ? new Response('{}', { status: 401 }) : new Response(JSON.stringify({ client_id: 'app', user_id: '42', scopes: ['bits:read'] }));
  } });
  source.token = 'old'; source.refreshToken = 'refresh'; source.clientSecret = 'secret';
  await source.validate(); assert.equal(source.token, 'new'); assert.equal(source.refreshToken, 'rotated'); assert.equal(calls.length, 3); assert.equal(saved.length, 1);
});
test('rooms keep rules, player names, event logs and saved credentials separate after restart', async t => {
  const directory = temp(t), worldsDirectory = join(directory, 'apworlds');
  let app = await createApp({ directory, worldsDirectory, port: 0 });
  t.after(() => app.close());
  app.store.state.rules[0].name = 'Original room'; app.store.state.events.push({ id: 'old-room-event' }); app.store.save();
  app.vault.update('default', { adminPassword: 'old-room-secret' });
  const room = (await (await post(app, 'rooms/create', { name: 'Factorio Run', game: 'Factorio' })).json()).room;
  assert.equal((await post(app, 'rooms/activate', { id: room.id })).status, 200);
  assert.equal(app.store.state.events.length, 0); assert.equal(app.vault.status(room.id).adminPassword, false);
  await post(app, 'players', { players: [{ name: 'PlayerTwo', game: 'Factorio' }] });
  app.store.state.rules[0].name = 'Factorio only'; app.store.save(); app.close();
  app = await createApp({ directory, worldsDirectory, port: 0 }); t.after(() => app.close());
  assert.equal(app.rooms.id, room.id); assert.equal(app.store.state.players[0].name, 'PlayerTwo'); assert.equal(app.store.state.rules[0].name, 'Factorio only');
  await post(app, 'rooms/activate', { id: 'default' });
  assert.equal(app.store.state.rules[0].name, 'Original room'); assert.equal(app.store.state.events[0].id, 'old-room-event'); assert.equal(app.vault.status('default').adminPassword, true); assert.equal(app.store.state.players.length, 0);
});
test('AP credentials are reused during automatic reconnect after a process restart', async t => {
  const directory = temp(t), connections = [], wss = new WebSocketServer({ port: 0, host: '127.0.0.1' }); await once(wss, 'listening');
  t.after(() => { for (const ws of wss.clients) ws.terminate(); wss.close(); });
  wss.on('connection', ws => {
    const send = p => ws.send(JSON.stringify([p])); send({ cmd: 'RoomInfo', seed_name: 'persist-seed', version: { major: 0, minor: 6, build: 8 } });
    ws.on('message', bytes => { for (const p of JSON.parse(bytes.toString())) {
      if (p.cmd === 'Connect') { connections.push(p.password); send({ cmd: 'Connected', team: 0, slot: 1, players: [], slot_info: {} }); }
      if (p.cmd === 'Say' && p.text === '!admin login persistent-admin') send({ cmd: 'PrintJSON', type: 'CommandResult', data: [{ text: 'Login successful.' }] });
    } });
  });
  let app = await createApp({ directory, worldsDirectory: join(directory, 'worlds'), port: 0 });
  t.after(() => app.close());
  await post(app, 'ap/connect', { url: `ws://127.0.0.1:${wss.address().port}`, slotName: 'Player', roomPassword: 'persistent-room', adminPassword: 'persistent-admin' });
  await until(() => app.ap.admin); app.close();
  app = await createApp({ directory, worldsDirectory: join(directory, 'worlds'), port: 0 }); t.after(() => app.close());
  await until(() => app.ap.admin); assert.deepEqual(connections, ['persistent-room', 'persistent-room']); assert.equal(app.store.state.config.mode, 'test'); assert.equal(app.store.state.config.paused, true);
  assert.equal(app.snapshot().savedCredentials.adminPassword, true); assert(!JSON.stringify(app.snapshot()).includes('persistent-admin'));
});
test('ZIP reader verifies checksums and rejects traversal paths', () => {
  const zip = worldZip(); assert.equal(readZip(zip)[0].text, world);
  const corrupt = Buffer.from(zip); corrupt[60] ^= 1; assert.throws(() => readZip(corrupt));
  assert.throws(() => readZip(writeZip([{ name: '../bad.py', content: 'no' }])));
});
test('APworld AST import resolves real declarations and never executes Python world code', t => {
  const path = temp(t), library = new GameLibrary(path, root, { memory: true });
  assert.deepEqual(library.importWorld(worldZip(), 'fixture.apworld'), ['Fixture Adventure']);
  const entry = library.get('Fixture Adventure');
  const option = name => entry.options.find(o => o.key === name);
  assert.equal(option('difficulty').default, 'hard'); assert.equal(option('health').min, 1); assert.equal(option('health').max, 9); assert.equal(option('fast_mode').default, true);
  assert.deepEqual(option('starting_items').default, { Potion: 2 }); assert(entry.unresolved.includes('dynamic_mode')); assert(entry.traps.includes('Bomb Trap'));
  const files = library.generate({ game: entry.game, values: { difficulty: 'easy', health: 5, fast_mode: false }, players: ['Br3tzn', 'PlayerTwo'] });
  assert.equal(files.length, 2);
  for (let i = 0; i < files.length; i++) { const value = parse(files[i].content); assert.equal(value.name, ['Br3tzn', 'PlayerTwo'][i]); assert.equal(value[entry.game].difficulty, 'easy'); assert.equal(value[entry.game].health, 5); assert.equal(value[entry.game].fast_mode, false); assert.equal(value[entry.game].dynamic_mode, undefined); }
  assert.throws(() => library.generate({ game: entry.game, values: { health: 99 }, players: ['Player'] }), /Bereich/);
  assert.throws(() => library.generate({ game: entry.game, values: { difficulty: 'fake' }, players: ['Player'] }), /Auswahl/);
});
test('folder scan caches unchanged APworlds and includes errors per unsupported file', async t => {
  const directory = temp(t), library = new GameLibrary(directory, root, { memory: true });
  writeFileSync(join(directory, 'fixture.apworld'), worldZip()); writeFileSync(join(directory, 'broken.apworld'), 'not a zip');
  const first = await library.scan(directory); assert.equal(first.imported.length, 1); assert.equal(first.errors.length, 1);
  const second = await library.scan(directory); assert.equal(second.unchanged, 1); assert.equal(second.errors.length, 1);
});
test('APworld export preserves advanced weighted options and creates one YAML per player', t => {
  const library = new GameLibrary(temp(t), root, { memory: true }); library.importWorld(worldZip(), 'fixture.apworld');
  const files = library.generate({ game: 'Fixture Adventure', values: { fast_mode: false }, players: ['One', 'Two'], extra: 'difficulty: {easy: 50, hard: 50}\nnew_option: 7' });
  assert.equal(parse(files[0].content).name, 'One'); assert.equal(parse(files[1].content).name, 'Two');
  assert.deepEqual(parse(files[0].content)['Fixture Adventure'].difficulty, { easy: 50, hard: 50 });
  assert.equal(parse(files[0].content)['Fixture Adventure'].new_option, 7);
  assert.throws(() => library.generate({ game: 'Fixture Adventure', players: ['One', 'one'] }), /Eindeutige/);
  assert.throws(() => library.generate({ game: 'Fixture Adventure', players: ['NameLongerThanSixteenCharacters'] }));
  assert.equal(readZip(writeZip(files)).length, 2);
});
test('HTTP imports templates, persists presets and returns valid multi-player YAML ZIPs', async t => {
  const app = await appFor(t, { worldsDirectory: temp(t) });
  const uploaded = await post(app, 'worlds/upload', { name: 'fixture.apworld', content: worldZip().toString('base64') }); assert.equal(uploaded.status, 200, await uploaded.text());
  const data = { game: 'Fixture Adventure', values: { health: 4 }, players: ['Daniel', 'Friend'] };
  assert.equal((await post(app, 'yaml/preset', data)).status, 200); assert.equal(app.snapshot().yamlPresets[data.game].values.health, 4);
  const bundled = await post(app, 'yaml/bundle', data); assert.equal(bundled.status, 200); const files = readZip(Buffer.from(await bundled.arrayBuffer()));
  assert.equal(files.length, 2); assert.equal(parse(files[1].text).name, 'Friend');
  app.ap.catalogs['Fixture Adventure'] = { item_name_to_id: { 'Bomb Trap': 1 } };
  const catalog = await fetch(app.url + '/api/catalog?game=Fixture%20Adventure').then(r => r.json()); assert(catalog.candidates.includes('Bomb Trap'));
});
test('mixed random actions can choose useful items and selected player lists isolate targets', () => {
  const store = new Store('.', { memory: true });
  const ap = { connected: true, demo: false, roomKey: 'room', seed: 'seed', team: 0, players: [{ team: 0, slot: 1, name: 'A', game: 'Demo', type: 1 }, { team: 0, slot: 2, name: 'B', game: 'Demo', type: 1 }, { team: 0, slot: 3, name: 'C', game: 'Demo', type: 1 }], items: () => ({ 'Bomb Trap': 1, 'Potion': 2 }) };
  store.state.approvals.room = Object.fromEntries(ap.players.map(p => ['0:' + p.slot, { enabled: true, items: ['Bomb Trap', 'Potion'], traps: ['Bomb Trap'] }]));
  const engine = new Engine(store, ap, { choose: xs => xs.at(-1) });
  const event = { id: 'e', source: 'manual', user: 'Test', dryRun: false };
  const rule = normalizeRule({ enabled: true, source: 'any', type: 'any', effect: 'random_item', target: 'selected', targetKeys: ['0:1', '0:3'] });
  const jobs = engine.plan(rule, event); assert.deepEqual(jobs.map(j => j.targetName), ['A', 'C']); assert(jobs.every(j => j.item === 'Potion'));
  assert(engine.plan({ ...rule, effect: 'random_trap' }, event).every(j => j.item === 'Bomb Trap'));
  const random = { ...rule, effect: 'random_action', includeDeathLink: true };
  assert(engine.plan(random, event).every(j => j.effect === 'random_item'));
  store.state.config.deathLinkArmed = true;
  const death = engine.plan(random, event); assert.equal(death.length, 1); assert.equal(death[0].effect, 'deathlink'); assert.equal(death[0].targetKey, 'group');
});


test('active rooms archive and restore without losing history or credentials after restart', async t => {
  const directory = temp(t), worldsDirectory = join(directory, 'worlds');
  let app = await createApp({ directory, worldsDirectory, port: 0 }); t.after(() => app.close());
  app.store.state.rules[0].name = 'Preserve'; app.store.state.events.push({ id: 'archived-event' }); app.store.save(); app.vault.update('default', { adminPassword: 'archive-secret' });
  assert.equal((await post(app, 'rooms/archive', { id: 'default', archived: true })).status, 200);
  assert.notEqual(app.rooms.id, 'default'); assert.equal(app.rooms.require('default').archived, true);
  assert.equal(app.store.state.config.paused, true); assert.equal(app.store.state.config.mode, 'test');
  assert.equal((await post(app, 'rooms/activate', { id: 'default' })).status, 400);
  app.close(); app = await createApp({ directory, worldsDirectory, port: 0 });
  assert.equal(app.rooms.require('default').archived, true);
  assert.equal((await post(app, 'rooms/archive', { id: 'default', archived: false })).status, 200);
  assert.notEqual(app.rooms.id, 'default');
  await post(app, 'rooms/activate', { id: 'default' });
  assert.equal(app.store.state.rules[0].name, 'Preserve'); assert.equal(app.store.state.events[0].id, 'archived-event'); assert.equal(app.vault.get('default').adminPassword, 'archive-secret');
});
test('deleting default room requires its exact name and preserves shared files across restart', async t => {
  const directory = temp(t), worldsDirectory = join(directory, 'worlds');
  let app = await createApp({ directory, worldsDirectory, port: 0 }); t.after(() => app.close());
  app.vault.update('default', { adminPassword: 'delete-secret' }); const name = app.rooms.require('default').name;
  writeFileSync(join(directory, 'game-library.json'), JSON.stringify({ games: {}, hashes: {}, folder: worldsDirectory }));
  assert.equal((await post(app, 'rooms/delete', { id: 'default', confirmName: 'wrong' })).status, 400);
  assert.equal(app.rooms.id, 'default'); assert(existsSync(join(directory, 'state.json')));
  assert.equal((await post(app, 'rooms/delete', { id: 'default', confirmName: name })).status, 200);
  assert.equal(app.vault.get('default').adminPassword, undefined); assert(!existsSync(join(directory, 'state.json')));
  for (const name of ['game-library.json', 'connections.key', 'integration-key.txt']) assert(existsSync(join(directory, name)));
  const active = app.rooms.id; app.close(); app = await createApp({ directory, worldsDirectory, port: 0 });
  assert.equal(app.rooms.id, active); assert(!existsSync(join(directory, 'state.json'))); assert.equal(app.rooms.manifest.rooms.length, 1);
});
test('busy active room is not archived or deleted and archived room deletion removes its own directory', async t => {
  const directory = temp(t); const app = await createApp({ directory, worldsDirectory: join(directory, 'worlds'), port: 0 }); t.after(() => app.close());
  app.engine.busy = true;
  assert.equal((await post(app, 'rooms/archive', { id: 'default', archived: true })).status, 400); assert.equal(app.rooms.manifest.rooms.length, 1);
  app.engine.busy = false;
  const room = (await (await post(app, 'rooms/create', { name: 'Old run' })).json()).room;
  app.vault.update(room.id, { twitchToken: 'old' }); await post(app, 'rooms/archive', { id: room.id, archived: true });
  assert.equal((await post(app, 'rooms/delete', { id: room.id, confirmName: room.name })).status, 200);
  assert(!existsSync(join(directory, 'rooms', room.id))); assert.equal(app.vault.get(room.id).twitchToken, undefined);
});
test('only APworld files become settings and recursive scan preserves original names', async t => {
  const directory = temp(t), nested = join(directory, 'source', 'version'); mkdirSync(nested, { recursive: true });
  const library = new GameLibrary(directory, root, { memory: true }); assert.equal(library.list().games.length, 0);
  writeFileSync(join(directory, 'old.yaml'), 'game: Legacy'); writeFileSync(join(nested, 'fixture.apworld'), worldZip());
  const report = await library.scan(directory); assert.equal(report.imported.length, 1); assert.equal(report.errors.length, 0);
  assert.equal(library.get('Fixture Adventure').source, 'source/version/fixture.apworld');
  assert.throws(() => library.upload({ name: 'old.yaml', content: Buffer.from('game: Legacy').toString('base64') }), /apworld/);
});
test('bundled settings require matching file hashes and accept nested original filenames without Python', t => {
  const directory = temp(t), appRoot = temp(t); mkdirSync(join(appRoot, 'assets')); mkdirSync(join(appRoot, 'apworlds', 'source'), { recursive: true });
  const bytes = worldZip(); writeFileSync(join(appRoot, 'apworlds', 'source', 'fixture.apworld'), bytes);
  const library = new GameLibrary(directory, root, { memory: true }); library.importWorld(bytes, 'fixture.apworld');
  const entry = library.get('Fixture Adventure');
  const cache = { schema: 1, generatedAt: Date.now(), files: { 'source/fixture.apworld': { sha256: createHash('sha256').update(bytes).digest('hex'), worlds: [entry], warnings: [] } } };
  writeFileSync(join(appRoot, 'assets', 'apworld-settings.json'), JSON.stringify(cache));
  const cached = new GameLibrary(directory, appRoot); cached.pythonCommand = () => { throw new Error('Must not need Python'); };
  assert.equal(cached.get(entry.game).source, 'source/fixture.apworld'); assert.equal(cached.generate({ game: entry.game, players: ['One'] }).length, 1);
  writeFileSync(join(appRoot, 'apworlds', 'source', 'fixture.apworld'), Buffer.from('changed'));
  const changed = new GameLibrary(temp(t), appRoot); assert.equal(changed.list().games.length, 0);
});
test('scoped AST resolves aliases and imported constants without merging same-named classes', t => {
  const library = new GameLibrary(temp(t), root, { memory: true });
  library.importWorld(writeZip([
    { name: 'scoped/__init__.py', content: `from .Options import Settings as S\nfrom .config import GAME\nclass ScopedWorld(World):\n game = GAME\n options_dataclass = S` },
    { name: 'scoped/config.py', content: `GAME = 'Scoped'\nLIMIT = 10` },
    { name: 'scoped/Options.py', content: `from Options import Choice as BaseChoice, NamedRange, TextChoice, Toggle\nfrom .config import LIMIT\nclass SameName(BaseChoice):\n option_first = 1\n default = 1\nclass Health(NamedRange):\n range_start = 1\n range_end = LIMIT\n special_range_names = {'all': -1}\n default = -1\nclass Text(TextChoice):\n option_preset = 0\n default = 'My text'\nclass Dynamic(Toggle):\n default = runtime()\nclass Settings(PerGameCommonOptions):\n choice: SameName\n health: Health\n text: Text\n dynamic: Dynamic` },
    { name: 'scoped/other.py', content: `class SameName(Choice):\n option_wrong = 99\n default = 99` },
  ]), 'scoped.apworld');
  const entry = library.get('Scoped'), find = k => entry.options.find(o => o.key === k);
  assert.equal(find('choice').default, 'first'); assert.equal(find('health').max, 10); assert.equal(find('health').default, -1); assert.equal(find('text').default, 'My text'); assert(!Object.hasOwn(find('dynamic'), 'default'));
  assert.equal(library.generate({ game: 'Scoped', values: { health: 'random-range-low-6-10' }, players: ['One'] }).length, 1);
  assert.throws(() => library.generate({ game: 'Scoped', values: { health: 'random-range-6-200' }, players: ['One'] }), /Bereich/);
});
test('manifest fallback and scalar collection presets remain exportable', t => {
  const library = new GameLibrary(temp(t), root, { memory: true });
  library.importWorld(writeZip([{ name: 'preset/archipelago.json', content: '{"game":"Preset"}' }, { name: 'preset/__init__.py', content: `class Items(OptionSet):\n default = 'All'\nclass PresetOptions(PerGameCommonOptions):\n items: Items\nclass PresetWorld(World):\n game = runtime_name()\n options_dataclass = PresetOptions` }]), 'preset.apworld');
  const entry = library.get('Preset'); assert.equal(entry.options.find(o => o.key === 'items').kind, 'json');
  assert.equal(parse(library.generate({ game: 'Preset', players: ['One'] })[0].content).Preset.items, 'All');
});
test('APworld reader skips large unused binary resources while checking Python checksums', () => {
  const bytes = writeZip([{ name: 'fixture/binary.bin', content: Buffer.alloc(9 * 1024 * 1024) }, { name: 'fixture/__init__.py', content: world }]);
  assert.equal(readZip(bytes, { worldOnly: true }).length, 1);
  const selected = writeZip([{ name: 'fixture/huge.py', content: 'x'.repeat(9 * 1024 * 1024) }]); assert.throws(() => readZip(selected, { worldOnly: true }), /zu groß/);
});


test('recipient modes select one, all or a random member of the chosen own-team group', () => {
  const store = new Store('.', { memory: true });
  const players = [{ team: 0, slot: 1, name: 'A', game: 'Demo', type: 1 }, { team: 0, slot: 2, name: 'B', game: 'Demo', type: 1 }, { team: 0, slot: 3, name: 'C', game: 'Demo', type: 1 }, { team: 1, slot: 4, name: 'Other team', game: 'Demo', type: 1 }];
  const ap = { connected: true, demo: false, roomKey: 'group-room', seed: 'seed', team: 0, players, items: () => ({ 'Bomb Trap': 1 }) };
  store.state.approvals[ap.roomKey] = Object.fromEntries(players.map(p => [p.team + ':' + p.slot, { enabled: true, items: ['Bomb Trap'], traps: ['Bomb Trap'] }]));
  const engine = new Engine(store, ap, { choose: xs => xs.at(-1) }), event = { id: 'group', source: 'manual', user: 'Test', dryRun: true };
  const base = { name: 'Group', enabled: true, source: 'any', type: 'any', effect: 'random_trap', targetKeys: ['0:1', '0:3', '1:4'] };
  const plan = target => engine.plan(normalizeRule({ ...base, target }), event).map(job => job.targetName);
  assert.deepEqual(plan('0:2'), ['B']); assert.deepEqual(plan('all'), ['A', 'B', 'C']); assert.deepEqual(plan('selected'), ['A', 'C']); assert.deepEqual(plan('random_selected'), ['C']); assert.deepEqual(plan('random'), ['C']);
  store.state.approvals[ap.roomKey]['0:3'].enabled = false; assert.deepEqual(plan('random_selected'), ['A']);
  assert.throws(() => normalizeRule({ ...base, target: 'random_selected', targetKeys: [] }), /Zielslot/);
});


test('APworlds with Windows archive separators resolve imports and manifest metadata', t => {
  const library = new GameLibrary(temp(t), root, { memory: true });
  const bytes = writeZip([
    { name: 'windows\\archipelago.json', content: '{"game":"Windows Paths"}' },
    { name: 'windows\\__init__.py', content: `from .options import WindowsOptions\nclass WindowsWorld(World):\n game = runtime_name()\n options_dataclass = WindowsOptions` },
    { name: 'windows\\options.py', content: `class Health(Range):\n range_start = 1\n range_end = 9\n default = 3\nclass WindowsOptions(PerGameCommonOptions):\n health: Health` },
  ]);
  assert(readZip(bytes, { worldOnly: true }).every(file => !file.name.includes('\\')));
  assert.deepEqual(library.importWorld(bytes, 'windows.apworld'), ['Windows Paths']);
  assert.equal(library.get('Windows Paths').options.find(o => o.key === 'health').default, 3);
});


test('own APworlds in the root directory take precedence over bundled variants', async t => {
  const directory = temp(t), appRoot = temp(t), worlds = join(appRoot, 'apworlds');
  mkdirSync(join(worlds, 'bundle'), { recursive: true }); mkdirSync(join(appRoot, 'assets'));
  const ownBytes = writeZip([{ name: 'fixture/__init__.py', content: world.replace('default = 3', 'default = 7') }]);
  writeFileSync(join(worlds, 'own.apworld'), ownBytes); writeFileSync(join(worlds, 'bundle', 'fixture.apworld'), worldZip());
  const library = new GameLibrary(directory, root, { memory: true });
  const report = await library.scan(worlds); assert.equal(report.imported.length, 2); assert.equal(library.get('Fixture Adventure').source, 'own.apworld');
  assert.equal(library.get('Fixture Adventure').options.find(o => o.key === 'health').default, 7);
  writeFileSync(join(worlds, 'bundle', 'fixture.apworld'), writeZip([{ name: 'fixture/__init__.py', content: world.replace('default = 3', 'default = 5') }]));
  await library.scan(worlds); assert.equal(library.get('Fixture Adventure').source, 'own.apworld'); assert.equal(library.get('Fixture Adventure').options.find(o => o.key === 'health').default, 7);
  assert.equal((await library.scan(worlds)).unchanged, 2);
  writeFileSync(join(worlds, 'bundle', 'fixture.apworld'), worldZip());
  const own = library.get('Fixture Adventure'); library.importWorld(worldZip(), 'bundle/fixture.apworld'); const bundled = library.get('Fixture Adventure');
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  writeFileSync(join(appRoot, 'assets', 'apworld-settings.json'), JSON.stringify({ schema: 1, generatedAt: Date.now(), files: {
    'own.apworld': { sha256: sha(ownBytes), worlds: [own], warnings: [] },
    'bundle/fixture.apworld': { sha256: sha(worldZip()), worlds: [bundled], warnings: [] },
  } }));
  const cached = new GameLibrary(temp(t), appRoot); assert.equal(cached.get('Fixture Adventure').source, 'own.apworld'); assert.equal(cached.get('Fixture Adventure').options.find(o => o.key === 'health').default, 7);
});
