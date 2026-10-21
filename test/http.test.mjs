import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';
import { WebSocketServer } from 'ws';
import { once } from 'node:events';

const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(predicate, timeout = 3000) { const start = Date.now(); while (!predicate()) { if (Date.now() - start > timeout) throw new Error('Timed out'); await wait(20); } }
async function setup(t) {
  const app = await createApp({ memory: true, port: 0 }); t.after(() => app.close()); const state = app.snapshot();
  const post = (path, data, headers = {}) => fetch(app.url + '/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-Session': state.session, ...headers }, body: JSON.stringify(data) });
  return { app, state, post };
}
test('HTTP serves the real app, examples and game catalog without external assets', async t => {
  const { app } = await setup(t);
  const html = await fetch(app.url).then(r => r.text()); assert(html.includes('AP Chaos Bridge')); assert(html.includes('/app.js'));
  for (const path of ['/app.js', '/style.css', '/icon.svg', '/overlay', '/overlay.js', '/overlay.css', '/oauth/callback', '/oauth.js']) {
    const response = await fetch(app.url + path); assert.equal(response.status, 200, path); assert(response.headers.get('content-security-policy'));
  }
  const index = await fetch(app.url + '/api/game-index').then(r => r.json()); assert.equal(index.games.length, 0);
  assert.equal(app.store.state.yamlProfiles.length, 3); assert.equal(app.snapshot().config.mode, 'test'); assert.equal(app.snapshot().config.paused, true);
});
test('cross-site requests and writes without session are rejected', async t => {
  const { app, post } = await setup(t);
  assert.equal((await fetch(app.url + '/api/state', { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(app.url + '/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await post('mode', { mode: 'live' })).status, 400); assert.equal((await post('rule', { source: 'invented' })).status, 400);
});
test('demo manual test runs through queue and cannot be switched to live', async t => {
  const { app, post } = await setup(t); assert.equal((await post('demo', {})).status, 200);
  assert.equal((await post('mode', { mode: 'live' })).status, 400);
  const rule = app.store.state.rules[0]; assert.equal((await post('test-rule', { id: rule.id })).status, 200);
  await until(() => app.store.state.queue.some(j => j.status === 'simulated'));
  assert.equal(app.store.state.queue.length, 1); assert.equal(app.store.state.queue[0].dryRun, true);
});
test('external endpoint requires bearer, forces source and deduplicates IDs', async t => {
  const { app, post } = await setup(t); await post('demo', {});
  const rule = { ...app.store.state.rules[0], source: 'external', enabled: true, type: 'sub', minimumCents: 0, action: '' }; await post('rule', rule);
  const e = { id: 'stable-id', source: 'charity', type: 'sub', user: 'Viewer', units: 1, timestamp: Date.now() };
  assert.equal((await post('ingest', e)).status, 401);
  const response = await post('ingest', e, { Authorization: 'Bearer ' + app.integrationKey }); assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.receipt.source, 'external'); assert.equal(result.receipt.jobs, 1);
  assert.equal((await (await post('ingest', e, { Authorization: 'Bearer ' + app.integrationKey })).json()).duplicate, true);
});
test('configuration import is atomic, never arms live and does not trust imported slot approvals', async t => {
  const { app, post } = await setup(t); await post('demo', {});
  const before = app.store.state.rules[0].name;
  assert.equal((await post('import', { schema: 1, config: { globalCooldownSec: -1 }, rules: [] })).status, 400); assert.equal(app.store.state.rules[0].name, before);
  assert.equal((await post('import', { schema: 1, config: { mode: 'live', paused: false, deathLinkArmed: true }, rules: app.store.state.rules })).status, 200);
  assert.equal(app.store.state.config.mode, 'test'); assert.equal(app.store.state.config.paused, true); assert.equal(app.store.state.config.deathLinkArmed, false); assert.deepEqual(app.store.state.approvals, {});
});
test('untrusted charity webhook payload cannot enter the engine', async t => {
  const { app } = await setup(t);
  const r = await fetch(app.url + '/hooks/charity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"id":12,"amount_net":1000}' });
  assert.equal(r.status, 401); assert.equal(app.store.state.events.length, 0);
});
test('real HTTP → event → durable queue → AP websocket → server confirmation workflow', async t => {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' }); await once(wss, 'listening');
  t.after(() => { for (const ws of wss.clients) ws.terminate(); wss.close(); });
  let sentItems = 0;
  wss.on('connection', ws => {
    const send = p => ws.send(JSON.stringify([p]));
    send({ cmd: 'RoomInfo', seed_name: 'E2E', time: Date.now() / 1000, version: { major: 0, minor: 6, build: 8 } });
    ws.on('message', raw => { for (const p of JSON.parse(raw.toString())) {
      if (p.cmd === 'Connect') send({ cmd: 'Connected', team: 0, slot: 1, players: [{ team: 0, slot: 1, name: 'Daniel', alias: 'Daniel' }], slot_info: { '1': { game: 'Stardew Valley', type: 1 } } });
      if (p.cmd === 'GetDataPackage') send({ cmd: 'DataPackage', data: { games: { 'Stardew Valley': { item_name_to_id: { 'Darkness Trap': 123 } } } } });
      if (p.cmd === 'Say' && p.text.startsWith('!admin login')) send({ cmd: 'PrintJSON', type: 'CommandResult', data: [{ text: 'Login successful.' }] });
      if (p.cmd === 'Say' && p.text === '!admin /send "Daniel" "Darkness Trap"') { sentItems++; send({ cmd: 'PrintJSON', data: [{ text: 'Cheat console: sending "Darkness Trap" to Daniel' }] }); }
    } });
  });
  const { app, post } = await setup(t);
  assert.equal((await post('ap/connect', { url: `ws://127.0.0.1:${wss.address().port}`, slotName: 'Daniel', expectedSeed: 'E2E', roomPassword: 'room-private', adminPassword: 'admin-private' })).status, 200);
  await until(() => app.ap.admin && app.ap.items('Stardew Valley')['Darkness Trap']);
  assert.equal(app.store.state.config.paused, true);
  const rule = { ...app.store.state.rules[0], enabled: true, source: 'external', action: 'trap', effect: 'random_trap' }; await post('rule', rule);
  assert.equal((await post('approval', { targetKey: '0:1', enabled: true, items: ['Darkness Trap'], traps: ['Darkness Trap'] })).status, 200);
  await post('mode', { mode: 'live' }); await post('pause', { paused: false });
  const incoming = { id: 'paid-event', type: 'donation', user: 'Viewer', amountCents: 1000, units: 0, action: 'trap', timestamp: Date.now() };
  const response = await post('ingest', incoming, { Authorization: 'Bearer ' + app.integrationKey }); assert.equal(response.status, 200);
  await until(() => app.store.state.queue[0]?.status === 'confirmed'); assert.equal(sentItems, 1);
  await post('ingest', incoming, { Authorization: 'Bearer ' + app.integrationKey }); assert.equal(sentItems, 1);
  const exported = await fetch(app.url + '/api/export').then(r => r.text()); assert(!exported.includes('room-private')); assert(!exported.includes('admin-private'));
  await post('emergency', {}); assert.equal(app.store.state.config.mode, 'test'); assert.equal(app.store.state.config.paused, true);
});
