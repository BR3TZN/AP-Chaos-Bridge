import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { createApp } from '../server.mjs';
import { Store, initialState, normalizeRule, matches } from '../lib/model.mjs';
import { desktopParent, desktopRootId } from '../lib/desktop.mjs';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) { const end = Date.now() + 3000; while (!check()) { if (Date.now() > end) throw new Error('Timeout'); await delay(15); } }
const post = (app, path, data = {}) => fetch(app.url + '/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-Session': app.snapshot().session }, body: JSON.stringify(data) });
const starter = () => ({ id: 'old-starter', name: 'Charity · Zufällige Falle', enabled: false, source: 'charity', type: 'donation', action: 'random-trap', minimumCents: 1000, minimumUnits: 0, rewardId: '', effect: 'random_trap', target: 'random', game: '', item: '', quantity: 1, cooldownSec: 20 });

test('fresh rooms have no rules and only an untouched, unused legacy example is removed', async t => {
  assert.deepEqual(initialState().rules, []);
  const directory = mkdtempSync(join(tmpdir(), 'ap-empty-rules-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const save = state => writeFileSync(join(directory, 'state.json'), JSON.stringify(state));
  save({ ...initialState(), rules: [starter()] }); assert.equal(new Store(directory).state.rules.length, 0);
  for (const rule of [{ ...starter(), name: 'My rule' }, normalizeRule(starter()), { ...starter(), minimumCents: 1100 }]) {
    save({ ...initialState(), rules: [rule] }); assert.equal(new Store(directory).state.rules.length, 1);
  }
  save({ ...initialState(), rules: [starter()], queue: [{ ruleId: 'old-starter', status: 'simulated' }] }); assert.equal(new Store(directory).state.rules.length, 1);
  const app = await createApp({ memory: true, port: 0 }); t.after(() => app.close());
  const room = (await (await post(app, 'rooms/create', { name: 'New room' })).json()).room;
  await post(app, 'rooms/activate', { id: room.id }); assert.deepEqual(app.snapshot().rules, []);
});

test('platform-specific rules clear stale filters and isolate the selected Twitch broadcaster', () => {
  const base = { name: 'Rule', enabled: true, source: 'charity', type: 'donation', effect: 'alert', minimumCents: 200, minimumUnits: 8, rewardId: 'stale' };
  const charity = normalizeRule(base); assert.equal(charity.minimumUnits, 0); assert.equal(charity.rewardId, '');
  const bits = normalizeRule({ ...base, source: 'twitch', type: 'cheer', twitchChannelId: 'friend', action: 'stale', minimumUnits: 100 });
  assert.equal(bits.minimumCents, 0); assert.equal(bits.rewardId, ''); assert.equal(bits.action, '');
  const event = { source: 'twitch', type: 'cheer', amountCents: 0, units: 100, channelId: 'friend' };
  assert(matches(bits, event)); assert(!matches(bits, { ...event, channelId: 'other' })); assert(!matches(bits, { ...event, units: 99 }));
  assert.equal(normalizeRule({ ...base, source: 'twitch', type: 'sub' }).minimumUnits, 0);
  assert.throws(() => normalizeRule({ ...base, source: 'twitch' }), /Für Twitch/);
  assert.equal(normalizeRule({ ...base, source: 'manual' }).minimumCents, 0);
});

async function fixture(t, persist = false) {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 }); await once(wss, 'listening');
  const sockets = new Map(), sessions = new Map(); let count = 0;
  wss.on('connection', ws => { const id = 'session-' + ++count; sockets.set(id, ws); ws.send(JSON.stringify({ metadata: { message_type: 'session_welcome' }, payload: { session: { id, keepalive_timeout_seconds: 120 } } })); });
  const directory = persist ? mkdtempSync(join(tmpdir(), 'ap-twitch-persist-')) : undefined;
  const options = { memory: !persist, ...(directory ? { directory, worldsDirectory: join(directory, 'worlds'), core: false } : {}), port: 0, twitchSocketUrl: `ws://127.0.0.1:${wss.address().port}`, fetchImpl: async (url, req) => {
    if (url.includes('/validate')) {
      const login = req.headers.Authorization.replace('OAuth token-', '');
      return Response.json({ login, user_id: login === 'alice' ? '11' : '22', client_id: 'shared-app', scopes: ['bits:read', 'channel:read:redemptions'] });
    }
    if (url.includes('/eventsub/subscriptions')) { const data = JSON.parse(req.body); sessions.set(data.condition.broadcaster_user_id, data.transport.session_id); return Response.json({}, { status: 202 }); }
    if (url.includes('/custom_rewards?')) return Response.json({ data: [{ id: 'reward-' + new URL(url).searchParams.get('broadcaster_id'), title: 'Bomb Trap', cost: 500 }] });
    throw new Error('Unexpected Twitch request');
  } };
  const app = await createApp(options);
  const apps = [app];
  t.after(() => { for (const active of apps) active.close(); for (const ws of wss.clients) ws.terminate(); wss.close(); if (directory) rmSync(directory, { recursive: true, force: true }); });
  async function add(channelName) { const response = await post(app, 'twitch/channel', { channelName, clientId: 'shared-app', events: ['channel.cheer', 'channel.channel_points_custom_reward_redemption.add'] }); assert.equal(response.status, 200); return (await response.json()).channel; }
  const alice = await add('alice'), bob = await add('bob');
  return { app, alice, bob, sockets, sessions, options, directory, apps };
}

test('two Twitch channels connect independently, persist encrypted tokens, label events and match per-channel rules', async t => {
  const { app, alice, bob, sockets, sessions } = await fixture(t);
  for (const channel of [alice, bob]) {
    assert.equal((await post(app, 'twitch/connect', { channelId: channel.id, token: 'token-' + channel.channelName })).status, 200);
    await post(app, 'rule', { name: channel.channelName + ' only', enabled: true, source: 'twitch', type: 'cheer', minimumUnits: 100, twitchChannelId: channel.id, effect: 'alert', message: '{channel}' });
  }
  await until(() => app.snapshot().twitch.channels.every(channel => channel.state === 'connected'));
  for (const [broadcaster, name] of [['11', 'alice'], ['22', 'bob']]) sockets.get(sessions.get(broadcaster)).send(JSON.stringify({ metadata: { message_type: 'notification', message_id: 'same-id', message_timestamp: new Date().toISOString() }, payload: { subscription: { type: 'channel.cheer' }, event: { broadcaster_user_id: broadcaster, broadcaster_user_login: name, user_name: 'Viewer', bits: 100 } } }));
  await until(() => app.store.state.events.length === 2);
  assert.deepEqual(app.store.state.events.map(event => event.channel).sort(), ['alice', 'bob']);
  assert.equal(app.store.state.queue.length, 2); assert.deepEqual(app.store.state.queue.map(job => job.message).sort(), ['alice', 'bob']);
  assert(app.store.state.config.twitch.channels.every(channel => channel.autoConnect));
  assert.equal(app.vault.get(app.rooms.id).twitchChannels[alice.id].twitchToken, 'token-alice');
  assert(!JSON.stringify(app.snapshot()).includes('token-alice')); assert(!(await fetch(app.url + '/api/export').then(response => response.text())).includes('token-alice'));
  const rewards = await fetch(app.url + '/api/twitch/rewards?channelId=' + bob.id).then(response => response.json()); assert.equal(rewards.rewards[0].id, 'reward-22');
  await post(app, 'twitch/disconnect', { channelId: alice.id }); assert.equal(app.snapshot().twitch.channels.find(channel => channel.id === bob.id).state, 'connected');
  assert.equal((await post(app, 'twitch/connect', { channelId: alice.id, token: 'token-bob' })).status, 400);
  assert.equal(app.snapshot().twitch.channels.find(channel => channel.id === bob.id).state, 'connected');
  assert.equal((await post(app, 'twitch/channel/delete', {})).status, 400);
  await post(app, 'credentials/forget', { source: 'twitch', channelId: alice.id }); assert(app.vault.get(app.rooms.id).twitchChannels[bob.id].twitchToken);
});

test('concurrent OAuth flows stay bound to their channel and room; removing one profile leaves the other flow valid', async t => {
  const { app, alice, bob } = await fixture(t);
  const auth = async channel => new URL((await (await post(app, 'twitch/auth', { channelId: channel.id })).json()).url).searchParams.get('state');
  const aliceState = await auth(alice), bobState = await auth(bob);
  await post(app, 'twitch/channel/delete', { channelId: alice.id });
  assert.equal((await post(app, 'twitch/oauth', { state: aliceState, token: 'token-alice' })).status, 400);
  assert.equal((await post(app, 'twitch/oauth', { state: bobState, token: 'token-bob' })).status, 200);
  const pending = await auth(bob), room = (await (await post(app, 'rooms/create', { name: 'Other room' })).json()).room;
  await post(app, 'rooms/activate', { id: room.id });
  assert.equal((await post(app, 'twitch/oauth', { state: pending, token: 'token-bob' })).status, 400); assert.equal(app.snapshot().twitch.channels.length, 0);
});

test('desktop identity is stable, the native endpoint is scoped locally and only the real parent PID is accepted', async t => {
  assert.equal(desktopParent({ AP_BRIDGE_DESKTOP_PID: '123' }, 123), 123); assert.equal(desktopParent({ AP_BRIDGE_DESKTOP_PID: '456' }, 123), undefined);
  assert.match(desktopRootId('/example'), /^[a-f0-9]{64}$/); assert.notEqual(desktopRootId('/example'), desktopRootId('/other'));
  const app = await createApp({ memory: true, port: 0 }); t.after(() => app.close());
  const response = await fetch(app.url + '/api/desktop').then(response => response.json()); assert.equal(response.pid, process.pid); assert.equal(response.session, app.snapshot().session);
  assert.equal((await fetch(app.url + '/api/desktop', { headers: { Origin: 'https://other.example' } })).status, 403);
});


test('multiple saved Twitch connections resume from encrypted credentials after restart and export imports keep profiles', async t => {
  const { app, alice, bob, options, directory, apps } = await fixture(t, true);
  for (const channel of [alice, bob]) await post(app, 'twitch/connect', { channelId: channel.id, token: 'token-' + channel.channelName });
  await until(() => app.snapshot().twitch.channels.every(channel => channel.state === 'connected'));
  const exported = await fetch(app.url + '/api/export').then(response => response.json());
  assert(!readFileSync(join(directory, 'connections.enc')).includes(Buffer.from('token-alice')));
  app.close();
  const restarted = await createApp(options); apps.push(restarted);
  await until(() => restarted.snapshot().twitch.channels.every(channel => channel.state === 'connected'));
  assert.equal(restarted.snapshot().twitch.channels.length, 2);
  const other = await createApp({ memory: true, port: 0 }); t.after(() => other.close());
  assert.equal((await post(other, 'import', exported)).status, 200);
  assert.deepEqual(other.snapshot().twitch.channels.map(channel => channel.id), [alice.id, bob.id]);
  assert(other.snapshot().twitch.channels.every(channel => !channel.hasToken && !channel.autoConnect));
});
