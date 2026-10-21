import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, PROFILES, parseYamlProfiles, normalizeRule, matches } from '../lib/model.mjs';
import { Engine } from '../lib/engine.mjs';

function fixture() {
  const store = new Store('.', { memory: true }); let clock = 10000000, executions = [];
  const ap = { connected: true, demo: false, admin: true, roomKey: 'room|seed', seed: 'seed', team: 0,
    players: [{ name: 'Daniel Player', slot: 1, team: 0, game: 'Stardew Valley', type: 1 }, { name: 'Another', slot: 2, team: 0, game: 'Factorio', type: 1 }],
    items: () => ({ 'Darkness Trap': 100, 'Money': 101 }), execute: async j => { executions.push(j); return { status: 'confirmed', detail: 'server' }; } };
  store.state.approvals[ap.roomKey] = { '0:1': { enabled: true, items: ['Darkness Trap', 'Money'], traps: ['Darkness Trap'] }, '0:2': { enabled: false, items: [], traps: [] } };
  const rule = normalizeRule({ name: 'Test rule', enabled: true, source: 'charity', type: 'donation', action: 'trap', minimumCents: 1000, effect: 'random_trap', target: 'random', cooldownSec: 20 });
  store.state.rules = [rule]; store.state.config.paused = false; store.state.config.globalCooldownSec = 0;
  const engine = new Engine(store, ap, { now: () => clock, choose: xs => xs[0] });
  const event = { id: '1', source: 'charity', type: 'donation', user: 'Viewer', amountCents: 1000, units: 0, action: 'trap', timestamp: clock };
  return { store, ap, rule, engine, event, executions, advance: n => clock += n };
}

test('three original YAML files parse correctly, including quoted booleans', () => {
  const dir = new URL('../examples/', import.meta.url);
  const kh = parseYamlProfiles(readFileSync(new URL('kh2.yaml', dir), 'utf8'))[0];
  const f = parseYamlProfiles(readFileSync(new URL('factorio.yaml', dir), 'utf8'))[0];
  const sd = parseYamlProfiles(readFileSync(new URL('stardew.yaml', dir), 'utf8'))[0];
  assert.equal(kh.game, 'Kingdom Hearts 2'); assert.equal(kh.deathLink, 'unknown'); assert.equal(kh.traps.length, 0);
  assert.equal(f.deathLink, 'off'); assert.equal(f.traps.length, 9); assert.equal(sd.deathLink, 'off'); assert.equal(sd.traps.length, 23);
});
test('multi-document YAML supports generation triggers and name templates', () => {
  const p = parseYamlProfiles('name: Test{player}\ngame: Demo\nDemo:\n  triggers: []\n---\nname: Other\ngame: Factorio\nFactorio: {}');
  assert.equal(p.length, 2); assert.equal(p[0].weightedName, true); assert.equal(p[0].hasGenerationTriggers, true);
});
test('ambiguous weighted games, duplicate keys and executable YAML tags are rejected', () => {
  assert.throws(() => parseYamlProfiles('name: D\ngame: {A: 1, B: 1}'), /Gewichtete/);
  assert.throws(() => parseYamlProfiles('name: A\nname: B\ngame: C'), /YAML/);
  assert.throws(() => parseYamlProfiles('!!python/object/apply:os.system [anything]'));
});
test('rule validates caps and normalizes DeathLink to group', () => {
  const raw = { name: 'DL', source: 'twitch', type: 'sub', effect: 'deathlink', target: '0:1', quantity: 5 };
  const r = normalizeRule(raw); assert.equal(r.target, 'group'); assert.equal(r.quantity, 1);
  assert.throws(() => normalizeRule({ ...raw, quantity: 6 }));
  assert.throws(() => normalizeRule({ ...raw, source: 'invented' }));
});
test('net cents, action and event type all participate in matching', () => {
  const { rule, event } = fixture(); assert(matches(rule, event));
  assert(!matches(rule, { ...event, amountCents: 999 })); assert(!matches(rule, { ...event, action: 'other' })); assert(!matches(rule, { ...event, type: 'sub' }));
});
test('durable deduplication creates only one action', () => {
  const { engine, event, store } = fixture();
  assert(engine.ingest(event).accepted); assert(engine.ingest(event).duplicate); assert.equal(store.state.queue.length, 1);
});
test('old, future and malformed events cannot enter the queue', () => {
  const { engine, event, store } = fixture();
  assert.equal(engine.ingest({ ...event, timestamp: event.timestamp - 400000 }).accepted, false);
  assert.equal(engine.ingest({ ...event, timestamp: event.timestamp + 90000 }).accepted, false);
  assert.throws(() => engine.ingest({ ...event, amountCents: -1 })); assert.throws(() => engine.ingest({ ...event, units: 0.5 })); assert.equal(store.state.queue.length, 0);
});
test('random pool excludes approved useful items', () => {
  const { engine, event, store } = fixture(); engine.ingest(event); assert.equal(store.state.queue[0].item, 'Darkness Trap');
});
test('test event remains a simulation after switching mode to live', async () => {
  const { engine, event, store, executions } = fixture(); engine.ingest(event); store.state.config.mode = 'live';
  await engine.tick(); assert.equal(store.state.queue[0].status, 'simulated'); assert.equal(executions.length, 0);
});
test('official test events never execute live', async () => {
  const { engine, event, store, executions } = fixture(); store.state.config.mode = 'live'; engine.ingest({ ...event, test: true });
  await engine.tick(); assert.equal(store.state.queue[0].status, 'simulated'); assert.equal(executions.length, 0);
});
test('live execution requires retained current-room approval', async () => {
  const { engine, event, store, ap, executions } = fixture(); store.state.config.mode = 'live'; engine.ingest(event);
  store.state.approvals[ap.roomKey]['0:1'].enabled = false;
  await engine.tick(); assert.equal(store.state.queue[0].status, 'failed'); assert.equal(executions.length, 0);
});
test('live item is confirmed once', async () => {
  const { engine, event, store, executions } = fixture(); store.state.config.mode = 'live'; engine.ingest(event);
  await engine.tick(); await engine.tick(); assert.equal(store.state.queue[0].status, 'confirmed'); assert.equal(executions.length, 1);
});
test('uncertain network failure pauses queue and never retries', async () => {
  const { engine, event, store, ap } = fixture(); let calls = 0; ap.execute = async () => { calls++; throw new Error('Socket closed'); };
  store.state.config.mode = 'live'; engine.ingest(event); await engine.tick(); await engine.tick();
  assert.equal(store.state.queue[0].status, 'uncertain'); assert.equal(store.state.config.paused, true); assert.equal(calls, 1);
});
test('rule cooldown delays a second event instead of losing it', async () => {
  const { engine, event, store, advance } = fixture(); engine.ingest(event); engine.ingest({ ...event, id: '2' });
  await engine.tick(); await engine.tick(); assert.equal(store.state.queue[1].status, 'queued'); advance(20001); await engine.tick(); assert.equal(store.state.queue[1].status, 'simulated');
});
test('full queue logs rejected fanout without a partial action', () => {
  const { engine, event, store, rule } = fixture(); store.state.config.maxQueue = 1; rule.quantity = 2;
  const r = engine.ingest(event); assert.equal(r.receipt.jobs, 0); assert.match(r.receipt.errors[0], /voll/); assert.equal(store.state.queue.length, 0);
});
test('emergency cancels pending actions, disarms group effects and pauses', () => {
  const { engine, event, store } = fixture(); engine.ingest(event); store.state.config.deathLinkArmed = true; engine.emergency();
  assert.equal(store.state.queue[0].status, 'cancelled'); assert.equal(store.state.config.mode, 'test'); assert.equal(store.state.config.deathLinkArmed, false); assert.equal(store.state.config.paused, true);
});
test('expired actions and actions for another room are not dispatched', async () => {
  const { engine, event, store, ap, advance, executions } = fixture(); engine.ingest(event); ap.roomKey = 'another-room'; await engine.tick();
  assert.equal(store.state.queue[0].status, 'queued'); advance(1000000); await engine.tick(); assert.equal(store.state.queue[0].status, 'expired'); assert.equal(executions.length, 0);
});
test('DeathLink is group-only and requires separate live arming', () => {
  const { engine, store, event, rule } = fixture(); rule.effect = 'deathlink'; store.state.config.mode = 'live';
  assert.match(engine.ingest(event).receipt.errors[0], /gesperrt/);
  store.state.config.deathLinkArmed = true; engine.ingest({ ...event, id: '2' }); assert.equal(store.state.queue[0].targetKey, 'group');
});
test('manual simulation works with an inactive rule; live test requires active rule', async () => {
  const { engine, store, rule, executions } = fixture(); rule.enabled = false;
  engine.runRule(rule.id); await engine.tick(); assert.equal(store.state.queue[0].status, 'simulated'); assert.equal(executions.length, 0);
  assert.throws(() => engine.runRule(rule.id, true), /Live-Test/);
});
test('persistent restart retains dedup IDs and marks interrupted dispatch uncertain', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ap-chaos-state-'));
  try {
    const first = new Store(directory); first.state.config.mode = 'live'; first.state.config.paused = false; first.state.config.deathLinkArmed = true;
    first.state.seen['charity:12'] = Date.now(); first.state.queue.push({ id: 'job', status: 'dispatching' }); first.save();
    const second = new Store(directory); assert.equal(second.state.config.mode, 'test'); assert.equal(second.state.config.paused, true); assert.equal(second.state.config.deathLinkArmed, false);
    assert(second.state.seen['charity:12']); assert.equal(second.state.queue[0].status, 'uncertain');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
