import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { Presentation, normalizeAppearance, normalizeAlerts } from '../lib/presentation.mjs';
import { createApp } from '../server.mjs';
import { Store, normalizeRule } from '../lib/model.mjs';
import { Engine } from '../lib/engine.mjs';
import { Archipelago } from '../lib/archipelago.mjs';

const temp = t => { const path = mkdtempSync(join(tmpdir(), 'ap-presentation-')); t.after(() => rmSync(path, { recursive: true, force: true })); return path; };
const post = (app, path, value) => fetch(app.url + '/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-Session': app.snapshot().session }, body: JSON.stringify(value) });
const gif = Buffer.from('47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b', 'hex');

test('appearance and alert preferences validate colors, choices and limits', () => {
  assert.equal(normalizeAppearance({ mode: 'light', accent: '#FA1234' }).accent, '#fa1234');
  for (const raw of [{ mode: 'script' }, { accent: 'red' }, { accent: '#fff; color:red' }]) assert.throws(() => normalizeAppearance(raw));
  for (const raw of [{ durationSec: 60 }, { mediaSize: 20 }, { animation: 'url(x)' }, { media: '../other.txt' }]) assert.throws(() => normalizeAlerts(raw));
});

test('neutral, light and tinted palettes keep text and custom accent labels readable', t => {
  const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  dom.window.eval(readFileSync(new URL('../public/appearance.js', import.meta.url), 'utf8') + '\nwindow.paletteTest = Appearance;');
  const ui = dom.window.paletteTest;
  for (const mode of ['dark', 'light', 'classic']) for (const accent of [...Object.keys(ui.presets), '#000000', '#ffffff', '#777777', '#0000ff', '#ff0000']) {
    const p = ui.palette({ mode, accent });
    assert(ui.contrast(p.text, p.panel) >= 4.5, mode + ' main text');
    assert(ui.contrast(p.muted, p.panel) >= 4.5, mode + ' secondary text');
    assert(ui.contrast(p['on-accent'], p.accent) >= 4.5, mode + ' button ' + accent);
    assert(ui.contrast(p['accent-text'], p.panel) >= 4.5, mode + ' accent label ' + accent);
    assert(ui.contrast(p['accent-text'], p.bg) >= 4.5, mode + ' accent heading ' + accent);
  }
  dom.window.close();
});

test('appearance persists outside rooms and uploaded media survives a restart', t => {
  const path = temp(t), first = new Presentation(path);
  first.update({ mode: 'classic', accent: '#fb7185', motion: false });
  const uploaded = first.upload({ content: gif.toString('base64') });
  assert.equal(uploaded.type, 'image/gif'); assert.equal(uploaded.bytes, gif.length);
  const second = new Presentation(path);
  assert.deepEqual(second.appearance, { mode: 'classic', accent: '#fb7185', motion: false });
  assert.deepEqual(second.get(uploaded.name).bytes, gif);
  assert.equal(second.get('../appearance.json'), null);
  assert.throws(() => second.upload({ content: Buffer.from('<svg onload="x()"/>').toString('base64') }), /GIF/);
});

test('alert API keeps previews separate from game actions and exposes only display data', async t => {
  const app = await createApp({ memory: true, port: 0 }); t.after(() => app.close());
  let executed = 0; app.ap.execute = async () => { executed++; };
  app.vault.update('default', { adminPassword: 'do-not-expose' });
  const before = app.store.state.queue.length, events = app.store.state.events.length;
  assert.equal((await post(app, 'alerts/preview', {})).status, 200);
  assert.equal(app.store.state.queue.length, before); assert.equal(app.store.state.events.length, events); assert.equal(executed, 0);
  const overlay = await fetch(app.url + '/api/overlay').then(r => r.json());
  assert.equal(overlay.jobs.at(-1).status, 'preview'); assert(!Object.hasOwn(overlay, 'session')); assert(!Object.hasOwn(overlay, 'config'));
  assert(!JSON.stringify(overlay).includes('do-not-expose')); assert(!JSON.stringify(overlay).includes(app.snapshot().session));
  const uploaded = await (await post(app, 'alerts/media', { content: gif.toString('base64') })).json();
  const image = await fetch(app.url + uploaded.url); assert.equal(image.headers.get('content-type'), 'image/gif'); assert.deepEqual(Buffer.from(await image.arrayBuffer()), gif);
  assert.equal((await post(app, 'config', { alerts: { media: uploaded.name, showText: false } })).status, 200);
  assert.equal((await fetch(app.url + '/api/overlay').then(r => r.json())).alerts.media, uploaded.name);
  assert.equal((await fetch(app.url + '/alert-media/not-a-hash.gif')).status, 404);
  const noSession = await fetch(app.url + '/api/alerts/media', { method: 'POST', body: '{}' }); assert.equal(noSession.status, 403);
  const frame = await fetch(app.url + '/overlay'); assert(frame.headers.get('content-security-policy').includes("frame-ancestors 'self'"));
});

test('changing rooms keeps global appearance and separate alert settings', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'ap-presentation-')), app = await createApp({ directory, worldsDirectory: join(directory, 'worlds'), port: 0 }); t.after(() => { app.close(); rmSync(directory, { recursive: true, force: true }); });
  await post(app, 'appearance', { mode: 'light', accent: '#ff0000' });
  await post(app, 'config', { alerts: { durationSec: 4 } });
  const { room } = await (await post(app, 'rooms/create', { name: 'Other' })).json(); await post(app, 'rooms/activate', { id: room.id });
  assert.equal(app.snapshot().appearance.mode, 'light'); assert.equal(app.snapshot().config.alerts.durationSec, 6.5);
  await post(app, 'rooms/activate', { id: 'default' }); assert.equal(app.snapshot().config.alerts.durationSec, 4);
});

function setup() {
  const store = new Store('.', { memory: true }), ap = { connected: true, demo: false, roomKey: 'room', seed: 'seed', team: 0, players: [{ team: 0, slot: 1, name: 'Daniel', game: 'Game A', type: 1 }, { team: 0, slot: 2, name: 'Friend', game: 'Game B', type: 1 }], items: () => ({ 'Bomb Trap': 1, Potion: 2, Sword: 3 }), execute: async () => ({ status: 'confirmed' }) };
  store.state.approvals.room = { '0:1': { enabled: true, items: ['Bomb Trap', 'Potion', 'Sword'], traps: ['Bomb Trap'] }, '0:2': { enabled: true, items: ['Bomb Trap', 'Potion'], traps: ['Bomb Trap'] } };
  const engine = new Engine(store, ap, { choose: xs => xs.at(-1) });
  const rule = normalizeRule({ source: 'any', type: 'any', effect: 'random_item', target: 'all', enabled: true });
  const event = { id: 'event', source: 'manual', user: 'Viewer', dryRun: true };
  return { store, ap, engine, rule, event };
}

test('nontrap and custom item draws respect each slot approval and its actual game filter', () => {
  const { engine, rule, event } = setup();
  const nontrap = engine.plan({ ...rule, effect: 'random_nontrap' }, event); assert(nontrap.every(j => j.item !== 'Bomb Trap'));
  const custom = engine.plan({ ...rule, effect: 'random_choice', itemPool: ['Potion', 'Not in catalog'] }, event); assert.equal(custom.length, 2); assert(custom.every(j => j.item === 'Potion'));
  const filtered = engine.plan({ ...rule, game: 'Game B' }, event); assert.deepEqual(filtered.map(j => j.targetName), ['Friend']);
  assert.throws(() => engine.plan({ ...rule, effect: 'random_choice', itemPool: ['Not in catalog'] }, event));
});

test('random action draws configured action types rather than weighting them by item count', () => {
  const { engine, ap, rule, event } = setup(); let seed = 4729;
  engine.choose = xs => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return xs[Math.floor(seed / 2 ** 32 * xs.length)]; };
  let traps = 0, others = 0;
  for (let i = 0; i < 1000; i++) { const jobs = engine.plan({ ...rule, target: '0:1', effect: 'random_action', randomEffects: ['random_trap', 'random_nontrap'] }, event); jobs[0].effect === 'random_trap' ? traps++ : others++; }
  assert(traps > 430 && traps < 570, `${traps}/${others}`);
  const pure = engine.plan({ ...rule, effect: 'random_action', randomEffects: ['alert'], message: '{user} wins' }, event);
  assert.equal(pure[0].effect, 'alert'); assert.equal(pure[0].message, 'Viewer wins');
  engine.choose = xs => xs[0];
  const mixed = { ...rule, effect: 'random_action', randomEffects: ['random_trap', 'deathlink', 'alert'] };
  assert.equal(engine.plan(mixed, { ...event, dryRun: false })[0].effect, 'alert');
  ap.admin = true;
  assert.equal(engine.plan(mixed, { ...event, dryRun: false })[0].effect, 'random_trap');
});

test('visual-only rules work without an AP connection and never execute the AP adapter', async () => {
  const { store, ap, engine, rule, event } = setup(); ap.connected = false; let sends = 0; ap.execute = async () => { sends++; };
  const visual = normalizeRule({ ...rule, effect: 'alert', message: 'Hello {user}' }); store.state.rules = [visual];
  store.state.config.mode = 'live'; store.state.config.paused = false; store.state.config.globalCooldownSec = 0;
  const jobs = engine.plan(visual, { ...event, dryRun: false }); store.state.queue.push(...jobs); await engine.tick();
  assert.equal(store.state.queue.at(-1).status, 'alerted'); assert.equal(sends, 0);
});

test('chat templates are prefixed as text and hint requests use the selected player', async () => {
  const ap = new Archipelago(); ap.connected = true; ap.admin = true; ap.roomKey = 'room'; ap.players = [{ team: 0, slot: 1, name: 'Daniel' }]; ap.catalogs = { Game: { item_name_to_id: { Potion: 1 } } };
  const packets = []; ap.socket = { send: (data, done) => { packets.push(JSON.parse(data)[0]); done?.(); } };
  const chat = await ap.execute({ effect: 'message', roomKey: 'room', message: '!admin /release Everyone' });
  assert.equal(chat.status, 'sent'); assert.equal(packets[0].text, '[AP Chaos] !admin /release Everyone');
  await ap.execute({ effect: 'hint', roomKey: 'room', team: 0, slot: 1, targetName: 'Daniel', game: 'Game', item: 'Potion' });
  assert.equal(packets[1].text, '!admin /hint "Daniel" "Potion"'); assert.equal(packets.length, 2);
});
