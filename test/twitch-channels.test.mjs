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

async function fixture(t, persist = false, scopes = ['bits:read', 'channel:read:redemptions']) {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 }); await once(wss, 'listening');
  const sockets = new Map(), sessions = new Map(), created = [], rewardRequests = []; let count = 0;
  wss.on('connection', ws => { const id = 'session-' + ++count; sockets.set(id, ws); ws.send(JSON.stringify({ metadata: { message_type: 'session_welcome' }, payload: { session: { id, keepalive_timeout_seconds: 120 } } })); });
  const directory = persist ? mkdtempSync(join(tmpdir(), 'ap-twitch-persist-')) : undefined;
  const options = { memory: !persist, ...(directory ? { directory, worldsDirectory: join(directory, 'worlds'), core: false } : {}), port: 0, twitchSocketUrl: `ws://127.0.0.1:${wss.address().port}`, fetchImpl: async (url, req) => {
    if (url.includes('/validate')) {
      const login = req.headers.Authorization.replace('OAuth token-', '');
      return Response.json({ login, user_id: login === 'alice' ? '11' : '22', client_id: 'shared-app', scopes });
    }
    if (url.includes('/eventsub/subscriptions')) { const data = JSON.parse(req.body); sessions.set(data.condition.broadcaster_user_id, data.transport.session_id); return Response.json({}, { status: 202 }); }
    if (url.includes('/custom_rewards?')) {
      const broadcaster = new URL(url).searchParams.get('broadcaster_id');
      if (req.method === 'POST') { const body = JSON.parse(req.body); rewardRequests.push({ broadcaster, headers: req.headers, body }); const reward = { id: 'created-' + broadcaster + '-' + created.length, ...body, broadcaster }; created.push(reward); return Response.json({ data: [reward] }); }
      return Response.json({ data: [{ id: 'reward-' + broadcaster, title: 'Bomb Trap', cost: 500 }, ...created.filter(reward => reward.broadcaster === broadcaster)] });
    }
    throw new Error('Unexpected Twitch request');
  } };
  const app = await createApp(options);
  const apps = [app];
  t.after(() => { for (const active of apps) active.close(); for (const ws of wss.clients) ws.terminate(); wss.close(); if (directory) rmSync(directory, { recursive: true, force: true }); });
  async function add(channelName) { const response = await post(app, 'twitch/channel', { channelName, clientId: 'shared-app', events: ['channel.cheer', 'channel.channel_points_custom_reward_redemption.add'] }); assert.equal(response.status, 200); return (await response.json()).channel; }
  const alice = await add('alice'), bob = await add('bob');
  return { app, alice, bob, sockets, sessions, options, directory, apps, created, rewardRequests };
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

const fullScopes = ['bits:read', 'channel:read:redemptions', 'channel:manage:redemptions', 'channel:read:subscriptions'];
test('creating a Twitch reward uses the selected broadcaster and its token, then its redemption triggers the selected rule', async t => {
  const { app, bob, alice, created, rewardRequests, sockets, sessions } = await fixture(t, false, fullScopes);
  for (const channel of [alice, bob]) await post(app, 'twitch/connect', { channelId: channel.id, token: 'token-' + channel.channelName });
  await until(() => app.snapshot().twitch.channels.every(channel => channel.state === 'connected'));
  const response = await post(app, 'twitch/rewards/create', { channelId: bob.id, title: 'Random trap', cost: 1000, prompt: 'Trigger a trap', cooldown: 60, color: '#ff5500', requireInput: true }); assert.equal(response.status, 200);
  const reward = (await response.json()).reward; assert.equal(reward.title, 'Random trap'); assert.equal(created.length, 1);
  const request = rewardRequests[0]; assert.equal(request.broadcaster, '22'); assert.equal(request.headers.Authorization, 'Bearer token-bob'); assert.equal(request.headers['Client-Id'], 'shared-app');
  assert.deepEqual(request.body, { title: 'Random trap', cost: 1000, prompt: 'Trigger a trap', is_enabled: true, is_user_input_required: true, background_color: '#ff5500', is_global_cooldown_enabled: true, global_cooldown_seconds: 60 });
  await post(app, 'rule', { name: 'Reward rule', source: 'twitch', type: 'channel_points', twitchChannelId: bob.id, rewardId: reward.id, effect: 'alert', enabled: true });
  sockets.get(sessions.get('22')).send(JSON.stringify({ metadata: { message_type: 'notification', message_id: 'reward-notification', message_timestamp: new Date().toISOString() }, payload: { subscription: { type: 'channel.channel_points_custom_reward_redemption.add' }, event: { broadcaster_user_id: '22', broadcaster_user_login: 'bob', user_name: 'Viewer', reward: { id: reward.id } } } }));
  await until(() => app.store.state.queue.length === 1); assert.equal(app.store.state.queue[0].ruleName, 'Reward rule'); assert.equal(app.store.state.queue[0].channel, 'bob');
  const rewards = await fetch(app.url + '/api/twitch/rewards?channelId=' + bob.id).then(response => response.json()); assert(rewards.rewards.some(entry => entry.id === reward.id));
  assert(!JSON.stringify(app.snapshot()).includes('Bearer token-bob'));
});

test('old read-only Twitch tokens require explicit reward authorization and never issue a create request', async t => {
  const { app, alice, rewardRequests } = await fixture(t);
  await post(app, 'twitch/connect', { channelId: alice.id, token: 'token-alice' });
  const response = await post(app, 'twitch/rewards/create', { channelId: alice.id, title: 'Reward', cost: 1 }); assert.equal(response.status, 400); assert((await response.json()).error.includes('freigeben')); assert.equal(rewardRequests.length, 0);
  const auth = new URL((await (await post(app, 'twitch/auth', { channelId: alice.id, enableRewards: true })).json()).url);
  assert(auth.searchParams.get('scope').includes('channel:manage:redemptions')); assert(auth.searchParams.get('scope').includes('channel:read:redemptions'));
});

test('reward input validation rejects invalid titles, prices, cooldowns and colors without writing to Twitch', async t => {
  const { app, alice, rewardRequests } = await fixture(t, false, fullScopes); await post(app, 'twitch/connect', { channelId: alice.id, token: 'token-alice' });
  for (const invalid of [{ title: '' }, { title: 'x'.repeat(46) }, { cost: 0 }, { cost: 1.5 }, { cost: Number.MAX_SAFE_INTEGER + 1 }, { cooldown: -1 }, { cooldown: 604801 }, { color: 'red' }]) {
    assert.equal((await post(app, 'twitch/rewards/create', { channelId: alice.id, title: 'A reward', cost: 1, ...invalid })).status, 400);
  }
  assert.equal(rewardRequests.length, 0);
  assert.equal((await fetch(app.url + '/api/twitch/rewards/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
});

test('a reward created while rooms switch is not attached to the new room', async t => {
  const { app, alice, created } = await fixture(t, false, fullScopes); await post(app, 'twitch/connect', { channelId: alice.id, token: 'token-alice' });
  const original = app.twitch.fetchImpl; let release, reached = false; const gate = new Promise(resolve => { release = resolve; });
  app.twitch.fetchImpl = async (...args) => { const response = await original(...args); if (args[1]?.method === 'POST' && args[0].includes('/custom_rewards?')) { reached = true; await gate; } return response; };
  const pending = post(app, 'twitch/rewards/create', { channelId: alice.id, title: 'In flight', cost: 1 }); await until(() => reached);
  const room = (await (await post(app, 'rooms/create', { name: 'Other room' })).json()).room; await post(app, 'rooms/activate', { id: room.id }); release();
  const response = await pending; assert.equal(response.status, 400); assert((await response.json()).error.includes('gewechselt')); assert.equal(created.length, 1); assert.equal(app.snapshot().twitch.channels.length, 0);
});

test('all-subscription rules enable all three EventSub types on the existing socket and never count gifted recipients twice', async t => {
  const { app, alice, sockets, sessions } = await fixture(t, false, fullScopes); await post(app, 'twitch/connect', { channelId: alice.id, token: 'token-alice' });
  await until(() => app.snapshot().twitch.channels.find(channel => channel.id === alice.id).state === 'connected');
  assert.equal((await post(app, 'rule', { name: 'All subscriptions', source: 'twitch', type: 'subscription', twitchChannelId: alice.id, effect: 'alert', enabled: true })).status, 200);
  await until(() => app.snapshot().twitch.channels.find(channel => channel.id === alice.id).subscriptions.length === 5);
  assert.equal(sockets.size, 1);
  const send = (id, type, extra = {}) => sockets.get(sessions.get('11')).send(JSON.stringify({ metadata: { message_type: 'notification', message_id: id, message_timestamp: new Date().toISOString() }, payload: { subscription: { type }, event: { broadcaster_user_id: '11', broadcaster_user_login: 'alice', user_name: 'Viewer', ...extra } } }));
  send('new-sub', 'channel.subscribe', { is_gift: false }); send('resub', 'channel.subscription.message'); send('gift-package', 'channel.subscription.gift', { total: 5 }); send('individual-gift', 'channel.subscribe', { is_gift: true }); send('cheer', 'channel.cheer', { bits: 100 });
  await until(() => app.store.state.events.length === 4); assert.equal(app.store.state.queue.length, 3); assert(app.store.state.queue.every(job => job.ruleName === 'All subscriptions'));
  assert.equal(app.store.state.events.find(event => event.id === 'gift-package').units, 5);
});
