import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import WebSocket, { WebSocketServer } from 'ws';
import { parse } from 'yaml';
import { Store, initialState } from '../lib/model.mjs';
import { connectionConfig } from '../lib/address.mjs';
import { Archipelago } from '../lib/archipelago.mjs';
import { adminSlotFile } from '../lib/admin-slot.mjs';
import { readZip } from '../lib/zip.mjs';
import { createApp } from '../server.mjs';

async function until(predicate) { const end = Date.now() + 2500; while (!predicate()) { if (Date.now() > end) throw new Error('Timed out'); await new Promise(resolve => setTimeout(resolve, 10)); } }
function temporary(t) { const directory = mkdtempSync(join(tmpdir(), 'ap-admin-')); t.after(() => rmSync(directory, { recursive: true, force: true })); return directory; }

test('new rooms use ADMIN while saved player-slot logins and passwords remain usable', t => {
  assert.deepEqual(initialState().config.ap, { url: '', slotName: 'ADMIN', loginMode: 'admin', expectedSeed: '' });
  const directory = temporary(t), state = initialState(); delete state.config.ap.loginMode; state.config.ap.slotName = 'Daniel';
  writeFileSync(join(directory, 'state.json'), JSON.stringify(state));
  const existing = new Store(directory); assert.equal(existing.state.config.ap.slotName, 'Daniel'); assert.equal(existing.state.config.ap.loginMode, 'slot');
  state.config.ap.slotName = ''; writeFileSync(join(directory, 'state.json'), JSON.stringify(state));
  assert.equal(new Store(directory).state.config.ap.slotName, 'ADMIN');
  assert.equal(connectionConfig(existing.state.config.ap, { loginMode: 'admin', slotName: 'Other' }).slotName, 'ADMIN');
  const legacy = connectionConfig(initialState().config.ap, { slotName: 'Daniel' }); assert.equal(legacy.loginMode, 'slot');
  assert.equal(connectionConfig(legacy, { addressMode: 'local', port: 1234 }).slotName, 'Daniel');
  assert.throws(() => connectionConfig(legacy, { loginMode: 'invented' }));
});

test('ADMIN downloads and optional bundles contain exactly one official spectator YAML without changing player YAMLs', async t => {
  const app = await createApp({ directory: temporary(t), memory: true, port: 0 }); t.after(() => app.close());
  const post = (path, data) => fetch(app.url + '/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-Session': app.snapshot().session }, body: JSON.stringify(data) });
  app.library.importYaml({ name: 'Fixture.yaml', content: 'name: Friend\ngame: Admin Fixture\nAdmin Fixture:\n  difficulty: easy\n' });
  const response = await fetch(app.url + '/api/ap/admin-yaml'); assert.equal(response.status, 200); assert.match(response.headers.get('content-disposition'), /ADMIN.yaml/);
  const admin = await response.text(); assert.equal(admin, adminSlotFile().content);
  const doc = parse(admin); assert.equal(doc.name, 'ADMIN'); assert.equal(doc.game, 'Archipelago'); assert.deepEqual(doc.Archipelago, {}); assert(!Object.hasOwn(doc, 'quantity'));
  const value = { game: 'Admin Fixture', players: ['Friend'] };
  const original = await post('yaml/generate', value).then(response => response.json());
  const combined = await post('yaml/generate', { ...value, includeAdmin: true }).then(response => response.json());
  assert.equal(original.files.length, 1); assert.deepEqual(combined.files, [...original.files, adminSlotFile()]);
  const zip = await post('yaml/bundle', { ...value, players: ['Friend', 'Daniel'], includeAdmin: true }); assert.equal(zip.status, 200);
  const entries = await readZip(Buffer.from(await zip.arrayBuffer())); assert.equal(entries.length, 3); assert.equal(entries.filter(file => file.name === 'ADMIN.yaml').length, 1);
  for (const player of ['ADMIN', 'admin']) {
    const refused = await post('yaml/bundle', { ...value, players: [player], includeAdmin: true }); assert.equal(refused.status, 400); assert.match((await refused.json()).error, /reserviert/);
  }
  await post('yaml/preset', { ...value, includeAdmin: true }); assert.equal(Object.values(app.store.state.yamlPresets)[0].includeAdmin, true);
  assert.equal(app.snapshot().config.ap.slotName, 'ADMIN'); assert(!admin.includes('password'));
});

test('ADMIN remains separate from an occupied game slot and can target both players and their DeathLink group', async t => {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' }); await once(wss, 'listening');
  const ap = new Archipelago(), occupied = new Map(), sent = [];
  t.after(() => { ap.disconnect(); for (const socket of wss.clients) socket.terminate(); wss.close(); });
  const players = [1, 2, 3].map((slot, i) => ({ team: 0, slot, name: ['Daniel', 'Friend', 'ADMIN'][i], alias: ['Daniel', 'Friend', 'ADMIN'][i] }));
  const slot_info = { 1: { game: 'Demo', type: 1 }, 2: { game: 'Demo', type: 1 }, 3: { game: 'Archipelago', type: 0 } };
  wss.on('connection', socket => {
    socket.send(JSON.stringify([{ cmd: 'RoomInfo', seed_name: 'SeparateAdmin' }]));
    socket.on('message', raw => { for (const packet of JSON.parse(raw.toString())) {
      sent.push(packet);
      if (packet.cmd === 'Connect') {
        if (occupied.has(packet.name)) { socket.send(JSON.stringify([{ cmd: 'ConnectionRefused', errors: ['SlotAlreadyTaken'] }])); continue; }
        occupied.set(packet.name, socket); socket.on('close', () => occupied.delete(packet.name));
        socket.send(JSON.stringify([{ cmd: 'Connected', team: 0, slot: packet.name === 'ADMIN' ? 3 : 1, players, slot_info }]));
      }
      if (packet.cmd === 'GetDataPackage') { assert.deepEqual(packet.games, ['Demo']); socket.send(JSON.stringify([{ cmd: 'DataPackage', data: { games: { Demo: { item_name_to_id: { Trap: 10 } } } } }])); }
      if (packet.cmd === 'Say' && packet.text === '!admin login secret') socket.send(JSON.stringify([{ cmd: 'PrintJSON', type: 'CommandResult', data: [{ text: 'Login successful.' }] }]));
      if (packet.cmd === 'Say' && packet.text.startsWith('!admin /send')) { const [, name, item] = packet.text.match(/^!admin \/send "([^"]+)" "([^"]+)"$/); socket.send(JSON.stringify([{ cmd: 'PrintJSON', data: [{ text: `Cheat console: sending "${item}" to ${name}` }] }])); }
    } });
  });
  const url = 'ws://127.0.0.1:' + wss.address().port, game = new WebSocket(url); await once(game, 'open');
  game.send(JSON.stringify([{ cmd: 'Connect', name: 'Daniel', game: 'Demo', items_handling: 7, tags: ['AP'] }])); await until(() => occupied.has('Daniel'));
  ap.connect({ url, loginMode: 'admin', slotName: 'Unused' }, '', 'secret'); await until(() => ap.admin && ap.items('Demo').Trap);
  assert.equal(game.readyState, WebSocket.OPEN); assert.equal(ap.status().slotName, 'ADMIN'); assert.equal(ap.slot, 3); assert.equal(occupied.size, 2);
  const connect = sent.find(packet => packet.cmd === 'Connect' && packet.name === 'ADMIN'); assert.equal(connect.items_handling, 0); assert(connect.tags.includes('TextOnly'));
  assert.equal(ap.players.filter(player => player.type === 1).length, 2);
  for (const slot of [1, 2]) assert.equal((await ap.execute({ roomKey: ap.roomKey, effect: 'item', game: 'Demo', team: 0, slot, targetName: players[slot - 1].name, item: 'Trap' })).status, 'confirmed');
  await ap.execute({ roomKey: ap.roomKey, effect: 'deathlink', user: 'Viewer' }); await until(() => sent.some(packet => packet.cmd === 'Bounce'));
  const bounce = sent.find(packet => packet.cmd === 'Bounce'); assert.deepEqual(bounce.tags, ['DeathLink']); assert(!bounce.slots); assert(!bounce.games);
});

test('missing or misconfigured ADMIN stops before admin login with an actionable error', async t => {
  for (const spectator of [false, null]) {
    const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' }); await once(wss, 'listening');
    const ap = new Archipelago(), sent = [];
    t.after(() => { ap.disconnect(); for (const socket of wss.clients) socket.terminate(); wss.close(); });
    wss.on('connection', socket => {
      socket.send(JSON.stringify([{ cmd: 'RoomInfo', seed_name: 'NoAdmin' }]));
      socket.on('message', raw => { for (const packet of JSON.parse(raw.toString())) {
        sent.push(packet);
        if (packet.cmd === 'Connect') socket.send(JSON.stringify([spectator === null ? { cmd: 'ConnectionRefused', errors: ['InvalidSlot'] } : { cmd: 'Connected', team: 0, slot: 1, players: [], slot_info: { 1: { name: 'ADMIN', game: 'Demo', type: 1 } } }]));
      } });
    });
    ap.connect({ url: 'ws://127.0.0.1:' + wss.address().port, loginMode: 'admin' }, '', 'secret'); await until(() => ap.error?.includes('ADMIN.yaml'));
    assert.equal(ap.connected, false); assert.equal(ap.admin, false); assert(!sent.some(packet => packet.cmd === 'Say')); assert.equal(ap.stopped, true);
  }
});
