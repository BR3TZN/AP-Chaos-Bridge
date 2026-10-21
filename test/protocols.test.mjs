import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { generateKeyPairSync, sign } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { Archipelago, quoteAP, serverUrl } from '../lib/archipelago.mjs';
import { CharitySource, TwitchSource, normalizeCharity, normalizeTwitch, verifyCharity } from '../lib/sources.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, timeout = 2000) { const start = Date.now(); while (!predicate()) { if (Date.now() - start > timeout) throw new Error('Timed out'); await delay(10); } }
async function mockServer() { const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' }); await once(wss, 'listening'); return wss; }
function closeServer(wss) { for (const ws of wss.clients) ws.terminate(); wss.close(); }
const wsUrl = server => 'ws://127.0.0.1:' + server.address().port;

test('AP addresses follow official client defaults and preserve explicit TLS', () => {
  assert.equal(serverUrl('archipelago.gg:12345'), 'ws://archipelago.gg:12345/');
  assert.equal(serverUrl('localhost'), 'ws://localhost:38281/');
  assert.equal(serverUrl('archipelago://localhost:12345'), 'ws://localhost:12345/');
  assert.equal(serverUrl('wss://host.example/room'), 'wss://host.example/room');
  assert.throws(() => serverUrl('ws://name:password@host.example:12345'), /Zugangsdaten/);
});

test('AP handshakes as TextOnly, loads catalog, logs in and sends exact quoted item', async t => {
  const wss = await mockServer(), packets = [], logs = [];
  const name = 'Daniel "Player"';
  const ap = new Archipelago({ uuid: 'test', log: (level, message) => logs.push(message) });
  t.after(() => { ap.disconnect(); closeServer(wss); });
  wss.on('connection', ws => {
    ws.send(JSON.stringify([{ cmd: 'RoomInfo', seed_name: 'SeedA', time: Date.now() / 1000, version: { major: 0, minor: 6, build: 8 } }]));
    ws.on('message', raw => { for (const p of JSON.parse(raw.toString())) {
      packets.push(p);
      if (p.cmd === 'Connect') ws.send(JSON.stringify([{ cmd: 'Connected', team: 0, slot: 1, players: [{ team: 0, slot: 1, name, alias: name }], slot_info: { '1': { name, game: 'Stardew Valley', type: 1 } } }]));
      if (p.cmd === 'GetDataPackage') ws.send(JSON.stringify([{ cmd: 'DataPackage', data: { games: { 'Stardew Valley': { item_name_to_id: { 'Darkness Trap': 1234 } } } } }]));
      if (p.cmd === 'Say' && p.text.startsWith('!admin login')) ws.send(JSON.stringify([{ cmd: 'PrintJSON', type: 'CommandResult', data: [{ text: 'Login successful. You can now issue server side commands.' }] }]));
      if (p.cmd === 'Say' && p.text.startsWith('!admin /send')) ws.send(JSON.stringify([{ cmd: 'PrintJSON', data: [{ text: `Cheat console: sending "Darkness Trap" to ${name}` }] }]));
    } });
  });
  ap.connect({ url: wsUrl(wss), slotName: name, expectedSeed: 'SeedA' }, 'room-secret', 'admin-secret');
  await until(() => ap.admin && Object.keys(ap.items('Stardew Valley')).length);
  const connect = packets.find(p => p.cmd === 'Connect');
  assert.equal(connect.game, ''); assert.equal(connect.items_handling, 0); assert(connect.tags.includes('TextOnly')); assert(!connect.tags.includes('DeathLink'));
  const result = await ap.execute({ roomKey: ap.roomKey, effect: 'item', game: 'Stardew Valley', team: 0, slot: 1, targetName: name, item: 'Darkness Trap' });
  assert.equal(result.status, 'confirmed');
  assert.equal(packets.find(p => p.cmd === 'Say' && p.text.startsWith('!admin /send')).text, '!admin /send "Daniel \\"Player\\"" "Darkness Trap"');
  assert(!logs.join(' ').includes('admin-secret')); assert(!logs.join(' ').includes('room-secret'));
  await ap.execute({ roomKey: ap.roomKey, effect: 'deathlink', user: 'Viewer' }); await until(() => packets.some(p => p.cmd === 'Bounce'));
  const bounce = packets.find(p => p.cmd === 'Bounce'); assert.deepEqual(bounce.tags, ['DeathLink']); assert(!Object.hasOwn(bounce, 'slots')); assert(!Object.hasOwn(bounce, 'games')); assert.equal(bounce.data.source, 'AP Chaos Bridge');
});
test('AP seed mismatch stops before authenticating', async t => {
  const wss = await mockServer(), ap = new Archipelago(); let messages = 0;
  t.after(() => { ap.disconnect(); closeServer(wss); });
  wss.on('connection', ws => { ws.on('message', () => messages++); ws.send(JSON.stringify([{ cmd: 'RoomInfo', seed_name: 'WrongSeed' }])); });
  ap.connect({ url: wsUrl(wss), slotName: 'Player', expectedSeed: 'ExpectedSeed' });
  await until(() => ap.error?.includes('Seed')); assert.equal(ap.connected, false); assert.equal(messages, 0);
});
test('AP rejects missing items before any command is sent', async () => {
  const ap = new Archipelago(); ap.connected = true; ap.admin = true; ap.roomKey = 'r';
  assert.throws(() => ap.execute({ roomKey: 'r', effect: 'item', game: 'Unknown', item: 'Invented' }), /katalog/i);
  assert.equal(quoteAP('A "quoted" name'), '"A \\"quoted\\" name"');
});
test('AP server rejection gives definitive failure and revokes stale admin state', async t => {
  const wss = await mockServer(), ap = new Archipelago();
  t.after(() => { ap.disconnect(); closeServer(wss); });
  wss.on('connection', ws => {
    ws.send(JSON.stringify([{ cmd: 'RoomInfo', seed_name: 'Reject', version: { major: 0, minor: 6, build: 8 } }]));
    ws.on('message', raw => { for (const p of JSON.parse(raw.toString())) {
      if (p.cmd === 'Connect') ws.send(JSON.stringify([{ cmd: 'Connected', team: 0, slot: 1, players: [{ team: 0, slot: 1, name: 'Player', alias: 'Player' }], slot_info: { '1': { game: 'Demo', type: 1 } } }]));
      if (p.cmd === 'Say' && p.text.startsWith('!admin /send')) ws.send(JSON.stringify([{ cmd: 'PrintJSON', type: 'CommandResult', data: [{ text: 'You must first login using !admin login [password]' }] }]));
    } });
  });
  ap.connect({ url: wsUrl(wss), slotName: 'Player' }); await until(() => ap.connected);
  ap.admin = true; ap.catalogs.Demo = { item_name_to_id: { Trap: 1 } };
  await assert.rejects(ap.execute({ roomKey: ap.roomKey, effect: 'item', targetName: 'Player', team: 0, slot: 1, game: 'Demo', item: 'Trap' }), error => error.definitive === true);
  assert.equal(ap.admin, false); assert.equal(ap.pending, null);
});
test('Charity normalization uses net cents, filters slug and forces official tests dry', () => {
  const data = { id: 100, username: 'Viewer', streamer_slug: 'br3tzn', amount: 1055, amount_net: 1000, date: Date.now() / 1000, metadata: { action: 'trap' } };
  const config = { slug: 'br3tzn', project: 'charityroyale2026' };
  assert.equal(normalizeCharity(data, config).amountCents, 1000); assert.equal(normalizeCharity(data, { ...config, slug: 'other' }), null);
  assert.equal(normalizeCharity({ ...data, project_slug: 'wrong' }, config), null);
  assert.equal(normalizeCharity({ ...data, id: null }, config).test, true); assert.equal(normalizeCharity(data, config, true).test, true);
});
test('Charity Pusher websocket subscribes correctly and handles string-wrapped donation payload', async t => {
  const wss = await mockServer(), received = [], packets = [];
  const source = new CharitySource({ url: wsUrl(wss), getConfig: () => ({ slug: 'br3tzn', project: 'charityroyale2026' }), ingest: e => received.push(e), log: () => {}, changed: () => {} });
  t.after(() => { source.disconnect(); closeServer(wss); });
  wss.on('connection', ws => {
    ws.send(JSON.stringify({ event: 'pusher:connection_established', data: JSON.stringify({ socket_id: '1', activity_timeout: 120 }) }));
    ws.on('message', raw => {
      const p = JSON.parse(raw.toString()); packets.push(p);
      if (p.event === 'pusher:subscribe') {
        ws.send(JSON.stringify({ event: 'pusher_internal:subscription_succeeded', channel: 'donations', data: '{}' }));
        ws.send(JSON.stringify({ event: 'App\\Events\\DonationCompleted', channel: 'donations', data: JSON.stringify({ id: 10, amount: 1055, amount_net: 1000, streamer_slug: 'br3tzn', date: Date.now() / 1000 }) }));
        ws.send(JSON.stringify({ event: 'App\\Events\\DonationCompletedTest', channel: 'donations', data: JSON.stringify({ id: 11, amount_net: 500, streamer_slug: 'br3tzn' }) }));
      }
    });
  });
  source.connect(); await until(() => received.length === 2);
  assert.deepEqual(packets[0], { event: 'pusher:subscribe', data: { channel: 'donations' } });
  assert.equal(source.state, 'connected'); assert.equal(received[0].amountCents, 1000); assert.equal(received[1].test, true);
});
test('RSA webhook verification binds the signature to the exact raw body', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const raw = Buffer.from('{"amount_net":1000}'), signature = sign('RSA-SHA256', raw, privateKey).toString('base64');
  assert(verifyCharity(raw, signature, publicKey)); assert(!verifyCharity(Buffer.from('{"amount_net":1001}'), signature, publicKey));
  assert(!verifyCharity(raw, 'bad!')); assert(!verifyCharity(raw, signature));
});
function twitchEvent(type, overrides = {}) {
  return { metadata: { message_type: 'notification', message_id: 'e1', message_timestamp: new Date().toISOString() }, payload: { subscription: { type }, event: { broadcaster_user_id: '42', user_name: 'Viewer', ...overrides } } };
}
test('Twitch normalizer prevents gifts plus individual gifted-sub double activation', () => {
  assert.equal(normalizeTwitch(twitchEvent('channel.subscribe', { is_gift: true }), '42'), null);
  assert.equal(normalizeTwitch(twitchEvent('channel.subscription.gift', { total: 5 }), '42').units, 5);
  assert.equal(normalizeTwitch(twitchEvent('channel.subscribe', { is_gift: false }), '42').type, 'sub');
  assert.equal(normalizeTwitch(twitchEvent('channel.cheer', { bits: 300 }), '42').units, 300);
  assert.equal(normalizeTwitch(twitchEvent('channel.cheer'), 'other'), null);
});
test('Twitch uses user token validation and Helix subscriptions before accepting notifications', async t => {
  const wss = await mockServer(), calls = [], events = [];
  const config = { clientId: 'client-1', broadcasterId: '', events: ['channel.subscribe', 'channel.cheer'] };
  const source = new TwitchSource({ getConfig: () => config, ingest: e => events.push(e), log: () => {}, changed: () => {}, socketUrl: wsUrl(wss), fetchImpl: async (url, request) => {
    calls.push({ url, request });
    if (url.includes('/validate')) return new Response(JSON.stringify({ user_id: '42', client_id: 'client-1', scopes: ['channel:read:subscriptions'] }), { status: 200 });
    const sent = JSON.parse(request.body); assert.equal(sent.condition.broadcaster_user_id, '42'); assert.equal(sent.transport.session_id, 'session-1'); return new Response('{}', { status: 202 });
  } });
  t.after(() => { source.disconnect(); closeServer(wss); });
  let socket;
  wss.on('connection', ws => { socket = ws; ws.send(JSON.stringify({ metadata: { message_type: 'session_welcome' }, payload: { session: { id: 'session-1', keepalive_timeout_seconds: 10 } } })); });
  await source.connect('secret-token'); await until(() => source.state === 'connected');
  assert.deepEqual(source.subscriptions, ['channel.subscribe']); assert.equal(source.rejected.length, 1);
  socket.send(JSON.stringify(twitchEvent('channel.subscribe', { is_gift: false }))); await until(() => events.length);
  assert.equal(calls[0].request.headers.Authorization, 'OAuth secret-token'); assert.equal(calls[1].request.headers.Authorization, 'Bearer secret-token');
  source.disconnect(); assert.equal(source.token, '');
});
test('Twitch rejects tokens for another client and app-only tokens', async () => {
  const make = data => new TwitchSource({ getConfig: () => ({ clientId: 'right', broadcasterId: '', events: ['channel.subscribe'] }), ingest: () => {}, log: () => {}, changed: () => {}, fetchImpl: async () => new Response(JSON.stringify(data), { status: 200 }) });
  await assert.rejects(make({ client_id: 'wrong', user_id: '42' }).connect('token'), /Client-ID/);
  await assert.rejects(make({ client_id: 'right' }).connect('token'), /User Access Token/);
});
