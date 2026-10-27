import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.mjs';
import { Store, normalizeRule, matches } from '../lib/model.mjs';
import { Engine } from '../lib/engine.mjs';
import { Archipelago } from '../lib/archipelago.mjs';
import { exportRules, parseRules, planRules, RuleLibrary } from '../lib/rule-library.mjs';

const rule = extra => normalizeRule({ name: 'A rule', source: 'twitch', type: 'subscription', effect: 'random_hint', target: 'random', enabled: true, ...extra });
const players = [{ team: 0, slot: 1, type: 1, name: 'Alice', game: 'Game' }, { team: 0, slot: 2, type: 1, name: 'Bob', game: 'Game' }];
const config = { twitch: { clientId: '', channels: [{ id: 'source-channel', channelName: 'alice', broadcasterId: '11', clientId: 'public-client', twitchToken: 'must-never-export', clientSecret: 'private-secret' }] }, ap: { adminPassword: 'private-admin' } };
const post = (app, path, value = {}) => fetch(app.url + '/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-Session': app.snapshot().session }, body: JSON.stringify(value) });
async function appFor(t, persistent = false) {
  const directory = mkdtempSync(join(tmpdir(), 'ap-rules-'));
  const options = { memory: !persistent, directory, worldsDirectory: join(directory, 'worlds'), core: false, port: 0 };
  const app = await createApp(options), apps = [app];
  t.after(() => { apps.forEach(active => active.close()); rmSync(directory, { recursive: true, force: true }); });
  return { app, apps, options, directory };
}

test('rules-only export contains portable recipient and channel identities without connection credentials', () => {
  const original = rule({ target: 'selected', targetKeys: ['0:1', '0:2'], twitchChannelId: 'source-channel' });
  const bundle = exportRules({ rules: [original], config, players, room: { id: 'one', name: 'First run' } });
  assert.equal(bundle.kind, 'ap-chaos-bridge-rules'); assert.equal(bundle.rules[0].targetPlayers[0].name, 'Alice');
  for (const value of ['must-never-export', 'private-secret', 'private-admin', 'public-client']) assert(!JSON.stringify(bundle).includes(value));
  const plan = planRules(bundle, { players: [{ ...players[0], slot: 9 }, { ...players[1], slot: 6 }], channels: [{ id: 'different-profile', channelName: 'alice', broadcasterId: '11' }] });
  assert.deepEqual(plan[0].rule.targetKeys, ['0:9', '0:6']); assert.equal(plan[0].rule.twitchChannelId, 'different-profile');
  assert.equal(plan[0].rule.enabled, false); assert.notEqual(plan[0].rule.id, original.id); assert.deepEqual(plan[0].notes, []);
  assert.deepEqual(original.targetKeys, ['0:1', '0:2']);
});

test('unknown recipients and missing channels never silently become the same slot or every Twitch channel', () => {
  const bundle = exportRules({ rules: [rule({ target: '0:1', twitchChannelId: 'source-channel' })], config, players });
  const [{ rule: imported, notes }] = planRules(bundle, { players: [{ ...players[1], slot: 1 }], channels: [{ id: 'source-channel', channelName: 'other', broadcasterId: '22' }] });
  assert(notes.some(note => note.includes('Alice'))); assert(notes.some(note => note.includes('@alice'))); assert(imported.twitchChannelId.startsWith('import-'));
  assert(!matches({ ...imported, enabled: true }, { source: 'twitch', type: 'sub', amountCents: 0, units: 1, channelId: imported.twitchChannelId }));
  const engine = new Engine(new Store('', { memory: true }), {}); assert.throws(() => engine.plan(imported, {}), /Zuordnungen/);
});

test('legacy full configuration exports are accepted as rule sources without importing settings or approvals', () => {
  const legacy = { schema: 1, config, approvals: { source: { enabled: true } }, rules: [rule({ effect: 'alert', twitchChannelId: 'source-channel' })] };
  const bundle = parseRules(legacy); assert.equal(bundle.channels[0].channelName, 'alice'); assert.equal(bundle.config, undefined); assert.equal(bundle.approvals, undefined);
  assert.throws(() => parseRules({ ...legacy, rules: [legacy.rules[0], legacy.rules[0]] }), /doppelte/);
  assert.throws(() => parseRules({ ...legacy, kind: 'different' }), /Regelvorlage/);
});

test('selected rules can be imported from a different room without changing connections, active rules or approvals', async t => {
  const { app } = await appFor(t);
  await post(app, 'rule', rule({ name: 'Source one', effect: 'alert', target: 'group' }));
  await post(app, 'rule', rule({ name: 'Source two', effect: 'alert', target: 'group' }));
  const sourceRoomId = app.rooms.id, sourceId = app.store.state.rules[0].id;
  const room = (await (await post(app, 'rooms/create', { name: 'Destination' })).json()).room;
  await post(app, 'rooms/activate', { id: room.id });
  await post(app, 'rule', rule({ name: 'Keep me', effect: 'alert', source: 'charity', type: 'donation', target: 'group' }));
  app.store.state.config.ap.slotName = 'Keep connection'; app.store.state.approvals = { untouched: { slot: true } }; app.store.state.config.paused = false;
  const beforeConfig = structuredClone(app.store.state.config), beforeApprovals = structuredClone(app.store.state.approvals);
  const request = { roomId: room.id, sourceRoomId, ids: [sourceId] };
  assert.equal((await post(app, 'rules/preview', request)).status, 200);
  const imported = await post(app, 'rules/import', request); assert.equal(imported.status, 200); assert.equal((await imported.json()).count, 1);
  assert.deepEqual(app.store.state.config, beforeConfig); assert.deepEqual(app.store.state.approvals, beforeApprovals);
  assert.equal(app.store.state.rules.length, 2); assert.equal(app.store.state.rules[0].name, 'Keep me'); assert.equal(app.store.state.rules[1].name, 'Source one'); assert.equal(app.store.state.rules[1].enabled, false);
  await post(app, 'rooms/activate', { id: sourceRoomId }); assert.equal(app.store.state.rules.length, 2); assert(app.store.state.rules.every(rule => rule.enabled));
});

test('rule imports validate the entire file, reject stale rooms and enforce the combined limit atomically', async t => {
  const { app } = await appFor(t), original = rule({ effect: 'alert' }); app.store.state.rules = [original];
  const request = { roomId: app.rooms.id, bundle: { schema: 1, rules: [rule({ effect: 'alert' }), { name: 'Broken', effect: 'invented' }] } };
  assert.equal((await post(app, 'rules/import', request)).status, 400); assert.deepEqual(app.store.state.rules, [original]);
  request.bundle.rules = [rule({ effect: 'alert' })]; request.roomId = 'stale';
  assert.equal((await post(app, 'rules/import', request)).status, 400); assert.deepEqual(app.store.state.rules, [original]);
  request.roomId = app.rooms.id; app.store.state.rules = Array.from({ length: 100 }, () => rule({ effect: 'alert' }));
  assert.equal((await post(app, 'rules/import', request)).status, 400); assert.equal(app.store.state.rules.length, 100);
  assert.equal((await post(app, 'rules/import', { ...request, mode: 'replace' })).status, 200); assert.equal(app.store.state.rules.length, 1); assert(app.store.state.config.paused); assert.equal(app.store.state.rules[0].enabled, false);
});

test('saved rule presets survive restart, work across rooms and remain available after deleting their source room', async t => {
  const { app, apps, options, directory } = await appFor(t, true);
  await post(app, 'rule', rule({ name: 'Reusable', effect: 'alert' }));
  const saved = await post(app, 'rules/presets', { roomId: app.rooms.id, name: 'Charity collection' }); assert.equal(saved.status, 200); const id = (await saved.json()).id;
  const onDisk = JSON.parse(readFileSync(join(directory, 'rule-presets.json'), 'utf8')); assert.equal(onDisk.presets[0].name, 'Charity collection');
  const room = (await (await post(app, 'rooms/create', { name: 'Other run' })).json()).room; await post(app, 'rooms/activate', { id: room.id });
  await post(app, 'rooms/delete', { id: 'default', confirmName: 'Mein Multiworld' }); app.close();
  const restarted = await createApp(options); apps.push(restarted);
  const catalog = await fetch(restarted.url + '/api/rules/library').then(response => response.json()); assert.equal(catalog.presets[0].id, id);
  assert.equal((await post(restarted, 'rules/import', { roomId: room.id, presetId: id })).status, 200); assert.equal(restarted.store.state.rules[0].name, 'Reusable');
  assert.equal((await post(restarted, 'rules/presets/delete', { id })).status, 200); assert.equal(new RuleLibrary(directory).list().length, 0);
});

test('unresolved imported rules cannot be activated or simulated before the user reviews valid current bindings', async t => {
  const { app } = await appFor(t);
  const bundle = exportRules({ rules: [rule({ target: '0:1' })], players });
  await post(app, 'rules/import', { roomId: app.rooms.id, bundle }); const imported = app.store.state.rules[0]; assert(imported.reviewNotes.length);
  assert.equal((await post(app, 'rule', { ...imported, enabled: true, reviewNotes: [] })).status, 400);
  assert.equal((await post(app, 'test-rule', { id: imported.id })).status, 400);
  assert.equal((await post(app, 'rule', { ...imported, enabled: true, reviewed: true })).status, 400);
  app.ap.loadDemo();
  const updated = await post(app, 'rule', { ...imported, target: '0:1', reviewed: true, enabled: true }); assert.equal(updated.status, 200);
  assert.deepEqual(app.store.state.rules[0].reviewNotes, []); assert.equal(app.store.state.rules[0].targetPlayers[0].name, 'Stardew-Demo');
});

test('random hints draw from each approved own-team item pool and dispatch a hint rather than sending an item', async () => {
  const store = new Store('', { memory: true }), ap = new Archipelago(); ap.connected = true; ap.admin = true; ap.roomKey = 'room'; ap.team = 0; ap.seed = 'seed';
  ap.players = [...players, { ...players[0], team: 1, name: 'Foreign' }]; ap.catalogs = { Game: { item_name_to_id: { Potion: 1, Trap: 2, Forbidden: 3 } } };
  store.state.approvals.room = { '0:1': { enabled: true, items: ['Potion', 'Trap'], traps: ['Trap'] }, '0:2': { enabled: true, items: ['Potion'], traps: [] }, '1:1': { enabled: true, items: ['Forbidden'], traps: [] } };
  const engine = new Engine(store, ap, { choose: values => values.at(-1) });
  const random = rule({ target: 'all', quantity: 5, item: 'Forbidden' }); assert.equal(random.quantity, 1);
  const jobs = engine.plan(random, { id: 'hint', source: 'manual', user: 'Viewer', dryRun: false });
  assert.equal(jobs.length, 2); assert.deepEqual(jobs.map(job => job.item), ['Trap', 'Potion']); assert(jobs.every(job => job.effect === 'hint' && job.team === 0));
  const packets = []; ap.socket = { send: (value, callback) => { packets.push(JSON.parse(value)[0]); callback?.(); } };
  await ap.execute(jobs[0]); assert.equal(packets[0].text, '!admin /hint "Alice" "Trap"'); assert(!packets.some(packet => packet.text.includes('/send')));
  const mixed = rule({ effect: 'random_action', randomEffects: ['random_hint'], target: '0:2' }); assert.equal(engine.plan(mixed, { id: 'mix', source: 'manual', user: 'Viewer', dryRun: false })[0].effect, 'hint');
  store.state.approvals.room['0:2'].items = []; assert.throws(() => engine.plan(rule({ target: '0:2' }), { dryRun: true }), /Kein freigegebener/);
});

test('a renamed Twitch account maps by broadcaster ID while a recycled channel name requires review', () => {
  const bundle = exportRules({ rules: [rule({ effect: 'alert', twitchChannelId: 'source-channel' })], config });
  const renamed = planRules(bundle, { channels: [{ id: 'renamed', channelName: 'new_name', broadcasterId: '11' }] }); assert.equal(renamed[0].rule.twitchChannelId, 'renamed'); assert.equal(renamed[0].notes.length, 0);
  const otherAccount = planRules(bundle, { channels: [{ id: 'other', channelName: 'alice', broadcasterId: '22' }] }); assert(otherAccount[0].notes.length); assert.notEqual(otherAccount[0].rule.twitchChannelId, 'other');
});

test('a rules-only file cannot accidentally replace connection settings through the full configuration import', async t => {
  const { app } = await appFor(t); const original = rule({ effect: 'alert' }); app.store.state.rules = [original];
  const response = await post(app, 'import', exportRules({ rules: [rule({ name: 'Wrong section', effect: 'alert' })] })); assert.equal(response.status, 400); assert((await response.json()).error.includes('Regeln übernehmen')); assert.deepEqual(app.store.state.rules, [original]);
});
