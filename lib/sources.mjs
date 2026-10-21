import { createHash, verify } from 'node:crypto';
import WebSocket from 'ws';
import { text } from './model.mjs';

export const CHARITY_SOCKET = 'wss://streamer.make-a-wish.at/app/mqfzsnt3n1tetbgezmfb?protocol=7&client=ap-chaos-bridge&version=0.1.0';
export const CHARITY_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0DnF7m6D7V41CMrnGpTM
RqfMtWw8amaIkfmjF8Ljwa2MkzLd/EEbZpZlMuMz9BIj7zmlBYX2HPKZ5hUQi2aD
vddgL5CtcVV3sSGa8yQxsSVjg+R4yYFseByy6OSrV+1MlXRbOrg8qlXfZYnV+z1M
XAx36STb7EP199n54TTRRP9MOHPp+t+894P0cxnw8o/UEN6EqMKbsHGaJQ7zN+S7
7MVV6ViQpKZLjnhOPmblJ2u1Anp+SJ6H0Q94T2I38ghdjcj9q9SZIbd6gqgmVxNz
0T20cHbGVYL2rr0mT896hVZifvGwqyb9D7Kdji9ffzd9qr9apllYL4VmNtAwiYAZ
kwIDAQAB
-----END PUBLIC KEY-----`;
export function verifyCharity(raw, signature, publicKey = CHARITY_KEY) {
  if (typeof signature !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(signature)) return false;
  try { return verify('RSA-SHA256', raw, publicKey, Buffer.from(signature, 'base64')); } catch { return false; }
}
export function normalizeCharity(d, { slug, project }, testEvent = false) {
  if (!slug || d.streamer_slug !== slug) return null;
  if (d.project_slug && d.project_slug !== project) return null;
  const test = testEvent || d.id == null;
  if (!test && !/^\d+$/.test(String(d.id))) throw new Error('Charity-Spenden-ID ungültig.');
  if (!test && (!Number.isFinite(d.date) || d.date <= 0)) throw new Error('Charity-Zeitstempel fehlt.');
  return {
    id: test ? 'test-' + createHash('sha256').update(JSON.stringify(d)).digest('hex') : String(d.id),
    source: 'charity', type: 'donation', user: d.username || 'Anonym',
    amountCents: d.amount_net ?? d.amount, units: 0, action: d.metadata?.action || '',
    timestamp: test ? Date.now() : d.date * 1000, test,
  };
}

export class CharitySource {
  constructor({ getConfig, ingest, log, changed, url = CHARITY_SOCKET }) {
    Object.assign(this, { getConfig, ingest, log, changed, url }); this.state = 'disconnected'; this.generation = 0; this.retry = 0;
  }
  status() { return { state: this.state, error: this.error || '' }; }
  disconnect() {
    this.generation++; this.stopped = true; clearTimeout(this.retryTimer); clearInterval(this.watchdog); this.socket?.close();
    this.state = 'disconnected'; this.changed();
  }
  connect() {
    this.disconnect(); const c = this.getConfig();
    if (!/^[a-zA-Z0-9_-]+$/.test(c.slug)) throw new Error('Exakten Charity-Streamer-Slug eintragen.');
    this.stopped = false; this.retry = 0; this.open();
  }
  handleDonation(data, testEvent = false) {
    const normalized = normalizeCharity(data, this.getConfig(), testEvent);
    return normalized ? this.ingest(normalized) : { accepted: false, reason: 'Anderer Streamer oder anderes Projekt.' };
  }
  open() {
    const gen = ++this.generation; this.state = 'connecting'; this.error = ''; this.changed();
    const ws = this.socket = new WebSocket(this.url, { handshakeTimeout: 12000, maxPayload: 1024 * 1024 });
    let last = Date.now(), pingAt = 0, activityMs = 120000;
    this.watchdog = setInterval(() => {
      if (pingAt && Date.now() - pingAt > 15000) return ws.terminate();
      if (Date.now() - last > activityMs && !pingAt && ws.readyState === WebSocket.OPEN) {
        pingAt = Date.now(); ws.send(JSON.stringify({ event: 'pusher:ping', data: {} }));
      }
    }, 5000);
    this.watchdog.unref?.();
    ws.on('message', raw => {
      if (gen !== this.generation) return;
      try {
        const p = JSON.parse(raw.toString()); const d = typeof p.data === 'string' ? JSON.parse(p.data) : p.data;
        last = Date.now(); pingAt = 0;
        if (p.event === 'pusher:connection_established') {
          if (Number.isFinite(d?.activity_timeout)) activityMs = Math.max(10000, d.activity_timeout * 1000);
          ws.send(JSON.stringify({ event: 'pusher:subscribe', data: { channel: 'donations' } }));
        } else if (p.event === 'pusher_internal:subscription_succeeded' && p.channel === 'donations') {
          this.state = 'connected'; this.retry = 0; this.changed(); this.log('info', 'Charity Royale: Spendenkanal abonniert.');
        } else if (p.event === 'pusher:ping') ws.send(JSON.stringify({ event: 'pusher:pong', data: {} }));
        else if (p.event === 'pusher:error') { this.error = 'Charity-WebSocket meldet einen Protokollfehler.'; ws.close(); }
        else if (p.channel === 'donations' && ['App\\Events\\DonationCompleted', 'App\\Events\\DonationCompletedTest'].includes(p.event)) this.handleDonation(d, p.event.endsWith('Test'));
      } catch (e) { this.log('error', 'Charity-Ereignis: ' + e.message); }
    });
    ws.on('error', () => { if (gen === this.generation) { this.error = 'Charity-WebSocket nicht erreichbar.'; this.changed(); } });
    ws.on('close', () => {
      if (gen !== this.generation) return;
      clearInterval(this.watchdog);
      if (this.stopped) this.state = 'disconnected';
      else {
        this.state = 'reconnecting'; this.log('warn', 'Charity-Verbindung unterbrochen. Ereignisse aus der Offline-Lücke werden nicht automatisch nachgeholt.');
        this.retryTimer = setTimeout(() => this.open(), Math.min(30000, 1000 * 2 ** this.retry++));
      }
      this.changed();
    });
  }
}

export const TWITCH_EVENTS = {
  'channel.subscribe': { type: 'sub', scope: 'channel:read:subscriptions', label: 'Subs' },
  'channel.subscription.message': { type: 'resub', scope: 'channel:read:subscriptions', label: 'Resub-Nachrichten' },
  'channel.subscription.gift': { type: 'gift_sub', scope: 'channel:read:subscriptions', label: 'Gift-Sub-Pakete' },
  'channel.cheer': { type: 'cheer', scope: 'bits:read', label: 'Bits' },
  'channel.channel_points_custom_reward_redemption.add': { type: 'channel_points', scope: 'channel:read:redemptions', label: 'Kanalpunkte' },
};
export function normalizeTwitch(packet, broadcasterId) {
  if (packet.metadata?.message_type !== 'notification') return null;
  const type = packet.payload?.subscription?.type, e = packet.payload?.event;
  if (!TWITCH_EVENTS[type] || !e || e.broadcaster_user_id !== broadcasterId) return null;
  // Gifts arrive as aggregate gifts AND individual subscriptions. Only the aggregate triggers.
  if (type === 'channel.subscribe' && e.is_gift) return null;
  return { id: packet.metadata.message_id, source: 'twitch', type: TWITCH_EVENTS[type].type,
    user: e.user_name || 'Anonym', units: type === 'channel.cheer' ? e.bits : type === 'channel.subscription.gift' ? e.total : 1,
    amountCents: 0, action: e.reward?.id || '', rewardId: e.reward?.id || '',
    timestamp: Date.parse(packet.metadata.message_timestamp), test: false };
}

export class TwitchSource {
  constructor({ getConfig, ingest, log, changed, fetchImpl = fetch, socketUrl = 'wss://eventsub.wss.twitch.tv/ws', onTokens = () => {} }) {
    Object.assign(this, { getConfig, ingest, log, changed, fetchImpl, socketUrl, onTokens }); this.state = 'disconnected'; this.generation = 0; this.sockets = new Set(); this.retry = 0;
  }
  status() { return { state: this.state, error: this.error || '', subscriptions: this.subscriptions || [], rejected: this.rejected || [] }; }
  disconnect() {
    this.generation++; this.stopped = true; clearTimeout(this.retryTimer); clearInterval(this.validationTimer);
    for (const ws of this.sockets) ws.close(); this.sockets.clear(); this.token = ''; this.refreshToken = ''; this.clientSecret = ''; this.refreshing = null; this.broadcasterId = ''; this.state = 'disconnected'; this.subscriptions = []; this.changed();
  }
  async refreshTokens() {
    if (!this.refreshToken) throw new Error('Twitch-Anmeldung abgelaufen. Erneut mit Twitch anmelden.');
    if (this.refreshing) return this.refreshing;
    const generation = this.generation;
    const refreshing = (async () => {
      const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: this.refreshToken, client_id: this.getConfig().clientId });
      if (this.clientSecret) body.set('client_secret', this.clientSecret);
      const response = await this.fetchImpl('https://id.twitch.tv/oauth2/token', { method: 'POST', body, signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('Twitch-Anmeldung kann nicht erneuert werden. Erneut anmelden.');
      const data = await response.json();
      if (generation !== this.generation) throw new Error('Twitch-Verbindung wurde inzwischen gewechselt.');
      if (!data.access_token) throw new Error('Twitch hat keinen neuen Access Token geliefert.');
      this.token = data.access_token; this.refreshToken = data.refresh_token || this.refreshToken;
      this.onTokens({ twitchToken: this.token, twitchRefresh: this.refreshToken });
    })();
    this.refreshing = refreshing;
    try { return await refreshing; } finally { if (this.refreshing === refreshing) this.refreshing = null; }
  }
  async validate(retry = true) {
    const response = await this.fetchImpl('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: 'OAuth ' + this.token }, signal: AbortSignal.timeout(12000) });
    if (response.status === 401 && retry && this.refreshToken) { await this.refreshTokens(); return this.validate(false); }
    if (!response.ok) throw new Error('Twitch-Token ist abgelaufen oder ungültig. Neuen User Access Token verbinden.');
    const data = await response.json(); const config = this.getConfig();
    if (data.client_id !== config.clientId) throw new Error('Twitch-Token gehört zu einer anderen Client-ID.');
    if (!data.user_id || (config.broadcasterId && config.broadcasterId !== data.user_id) || (this.broadcasterId && this.broadcasterId !== data.user_id)) throw new Error('User Access Token des Broadcasters erforderlich.');
    this.broadcasterId = data.user_id; this.scopes = data.scopes || []; return data;
  }
  async connect(token, { refreshToken = '', clientSecret = '' } = {}) {
    this.disconnect(); const gen = this.generation;
    this.refreshToken = refreshToken; this.clientSecret = clientSecret;
    this.token = text(token.replace(/^oauth:/, ''), 1000);
    if (!this.getConfig().clientId || !this.token) throw new Error('Client-ID und User Access Token fehlen.');
    if (!this.getConfig().events.length) throw new Error('Mindestens einen Twitch-Ereignistyp wählen.');
    try { await this.validate(); } catch (e) { this.token = ''; this.state = 'error'; this.error = e.message; this.changed(); throw e; }
    if (gen !== this.generation) return;
    this.stopped = false; this.retry = 0; this.open(this.socketUrl, false);
    this.onTokens({ twitchToken: this.token, twitchRefresh: this.refreshToken });
    this.validationTimer = setInterval(async () => { try { await this.validate(); } catch (e) { if (gen !== this.generation) return; this.disconnect(); this.error = e.message; this.state = 'error'; this.log('error', e.message); this.changed(); } }, 3600000);
    this.validationTimer.unref?.();
  }
  open(url, migration, old = null) {
    const gen = this.generation; this.state = migration ? 'reconnecting' : 'connecting'; this.error = ''; this.changed();
    const ws = new WebSocket(url, { handshakeTimeout: 12000, maxPayload: 1024 * 1024 }); this.sockets.add(ws);
    let active = false, last = Date.now(), timeoutMs = 25000;
    const watchdog = setInterval(() => { if (Date.now() - last > timeoutMs) ws.terminate(); }, 5000); watchdog.unref?.();
    ws.on('message', async raw => {
      if (gen !== this.generation || this.stopped) return;
      try {
        const p = JSON.parse(raw.toString()); last = Date.now();
        if (p.metadata?.message_type === 'session_welcome') {
          timeoutMs = (p.payload.session.keepalive_timeout_seconds || 20) * 1000 + 5000;
          if (!migration) {
            this.subscriptions = []; this.rejected = [];
            await Promise.all(this.getConfig().events.map(async type => {
              if (!TWITCH_EVENTS[type]) return;
              if (!this.scopes.includes(TWITCH_EVENTS[type].scope)) { this.rejected.push(type + ': Berechtigung ' + TWITCH_EVENTS[type].scope + ' fehlt'); return; }
              try {
              const response = await this.fetchImpl('https://api.twitch.tv/helix/eventsub/subscriptions', {
                method: 'POST', headers: { Authorization: 'Bearer ' + this.token, 'Client-Id': this.getConfig().clientId, 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, version: '1', condition: { broadcaster_user_id: this.broadcasterId }, transport: { method: 'websocket', session_id: p.payload.session.id } }), signal: AbortSignal.timeout(8000),
              });
              if (response.ok) this.subscriptions.push(type); else this.rejected.push(type + ': HTTP ' + response.status);
              } catch { this.rejected.push(type + ': Netzwerkfehler beim Abonnieren'); }
            }));
            if (gen !== this.generation || this.stopped) return;
            if (!this.subscriptions.length) { this.error = 'Keine Twitch-Subscription aktiv. Berechtigungen prüfen.'; this.state = 'error'; this.stopped = true; ws.close(); this.changed(); return; }
          }
          active = true; this.current = ws; if (old) { old.retiring = true; old.close(); }
          this.state = 'connected'; this.retry = 0;
          if (this.rejected?.length) this.log('warn', 'Twitch teilweise verbunden: ' + this.rejected.join('; '));
          this.changed();
        } else if (p.metadata?.message_type === 'notification') {
          const event = normalizeTwitch(p, this.broadcasterId); if (event) this.ingest(event);
        } else if (p.metadata?.message_type === 'session_reconnect') {
          const reconnect = new URL(p.payload.session.reconnect_url);
          if (reconnect.protocol !== 'wss:' || !/(^|\.)twitch\.tv$/.test(reconnect.hostname)) throw new Error('Ungültige Twitch-Reconnect-Adresse.');
          this.open(reconnect.href, true, ws);
        } else if (p.metadata?.message_type === 'revocation') {
          this.subscriptions = this.subscriptions.filter(t => t !== p.payload.subscription.type);
          this.rejected ||= []; this.rejected.push(p.payload.subscription.type + ': ' + p.payload.subscription.status);
          if (!this.subscriptions.length) { this.state = 'error'; this.error = 'Alle Twitch-Ereignisberechtigungen wurden widerrufen.'; }
          this.log('error', 'Twitch hat eine Ereignisberechtigung widerrufen.'); this.changed();
        }
      } catch (e) { this.log('error', 'Twitch-Ereignis konnte nicht verarbeitet werden: ' + e.message); }
    });
    ws.on('error', () => { if (gen === this.generation) { this.error = 'Twitch-WebSocket nicht erreichbar.'; this.changed(); } });
    ws.on('close', () => {
      clearInterval(watchdog); this.sockets.delete(ws);
      if (gen !== this.generation || this.stopped || ws.retiring || (this.current && this.current !== ws && this.sockets.has(this.current) && active)) return;
      this.state = 'reconnecting'; this.changed();
      this.retryTimer = setTimeout(() => this.open(this.socketUrl, false), Math.min(30000, 1000 * 2 ** this.retry++));
      this.log('warn', 'Twitch getrennt. Ereignisse während der Offline-Lücke werden nicht nachgeliefert.');
    });
  }
}
