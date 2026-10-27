import { randomUUID } from 'node:crypto';
import { TwitchSource, TWITCH_EVENTS } from './sources.mjs';
import { text } from './model.mjs';

export function normalizeTwitchChannel(raw, existing = {}) {
  const channelName = text(raw.channelName ?? existing.channelName ?? '', 26).replace(/^@/, '').toLowerCase();
  const clientId = text(raw.clientId ?? existing.clientId ?? '', 100);
  const events = raw.events ?? existing.events ?? ['channel.subscribe', 'channel.subscription.message', 'channel.subscription.gift', 'channel.cheer', 'channel.channel_points_custom_reward_redemption.add'];
  if (!/^[a-z0-9_]{1,25}$/.test(channelName)) throw new Error('Den Twitch-Kanalnamen ohne Link eintragen, zum Beispiel br3tzn.');
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(clientId)) throw new Error('Die Client-ID deiner Twitch-Anwendung eintragen.');
  if (!Array.isArray(events) || !events.length || events.some(event => !Object.hasOwn(TWITCH_EVENTS, event))) throw new Error('Mindestens einen gültigen Twitch-Ereignistyp wählen.');
  return { id: existing.id || randomUUID(), channelName, clientId, broadcasterId: existing.broadcasterId || '', events: [...new Set(events)], autoConnect: existing.autoConnect === true };
}

export class TwitchChannels {
  constructor({ getConfig, getRoom, getLegacyAuto, getSecrets, saveSecrets, onIdentity = () => {}, ingest, log, changed, fetchImpl = fetch, socketUrl }) {
    Object.assign(this, { getConfig, getRoom, getLegacyAuto, getSecrets, saveSecrets, onIdentity, ingest, log, changed, fetchImpl, socketUrl });
    this.sources = new Map();
  }
  config(id = 'default') {
    const config = id === 'default' ? this.getConfig() : this.getConfig().channels?.find(channel => channel.id === id);
    if (!config) throw new Error('Twitch-Kanal ist nicht mehr vorhanden.');
    return config;
  }
  configs() {
    const config = this.getConfig();
    return [...(config.clientId || config.channelName || config.broadcasterId ? [{ ...config, id: 'default', autoConnect: this.getLegacyAuto() }] : []), ...(config.channels || [])];
  }
  source(id = 'default') {
    this.config(id);
    if (!this.sources.has(id)) {
      const room = this.getRoom();
      const config = () => { if (room !== this.getRoom()) throw new Error('Der Raum wurde gewechselt.'); return this.config(id); };
      const source = new TwitchSource({ getConfig: config, fetchImpl: this.fetchImpl, changed: this.changed,
        ...(this.socketUrl ? { socketUrl: this.socketUrl } : {}),
        ingest: event => { if (room === this.getRoom()) return this.ingest({ ...event, channelId: id, channel: source.accountLogin || config().channelName || event.channel, broadcasterId: source.broadcasterId }); },
        log: (level, message) => { if (room === this.getRoom()) this.log(level, 'Twitch @' + (source.accountLogin || config().channelName || 'Mein Kanal') + ' · ' + message); },
        onTokens: values => { if (room === this.getRoom()) this.saveSecrets(id, values); },
      });
      this.sources.set(id, source);
    }
    return this.sources.get(id);
  }
  get primary() { return this.source(); }
  get state() { return this.status().state; }
  get refreshToken() { return this.primary.refreshToken; }
  get broadcasterId() { return this.primary.broadcasterId; }
  status() {
    const channels = this.configs().map(config => {
      const source = this.sources.get(config.id), secrets = this.getSecrets(config.id);
      return { id: config.id, channelName: source?.accountLogin || config.channelName || '', clientId: config.clientId, broadcasterId: source?.broadcasterId || config.broadcasterId || '', events: config.events, autoConnect: config.autoConnect,
        ...(source?.status() || { state: 'disconnected', error: '', subscriptions: [], rejected: [] }), broadcasterId: source?.broadcasterId || config.broadcasterId || '',
        hasToken: Boolean(secrets.twitchToken), hasSecret: Boolean(secrets.twitchSecret), hasRefresh: Boolean(secrets.twitchRefresh) };
    });
    const state = channels.some(channel => channel.state === 'connected') ? 'connected' : channels.find(channel => ['connecting', 'reconnecting'].includes(channel.state))?.state || (channels.some(channel => channel.state === 'error') ? 'error' : 'disconnected');
    return { state, channels, subscriptions: channels.flatMap(channel => channel.subscriptions), rejected: channels.flatMap(channel => channel.rejected.map(reason => '@' + (channel.channelName || 'Mein Kanal') + ': ' + reason)), error: channels.filter(channel => channel.error).map(channel => '@' + (channel.channelName || 'Mein Kanal') + ': ' + channel.error).join(' · ') };
  }
  async connect(token, values = {}, id = 'default') {
    const room = this.getRoom(), source = this.source(id), pending = source.connect(token, values), generation = source.generation;
    await pending;
    if (room !== this.getRoom() || generation !== source.generation) throw new Error('Raum oder Twitch-Verbindung wurde während der Anmeldung gewechselt.');
    if ([...this.sources].some(([otherId, other]) => otherId !== id && other.broadcasterId && other.broadcasterId === source.broadcasterId && !['disconnected', 'error'].includes(other.state))) {
      source.disconnect(); throw new Error('Dieser Twitch-Kanal ist bereits verbunden. Die vorhandene Verbindung verwenden.');
    }
    this.onIdentity(id, { broadcasterId: source.broadcasterId, channelName: source.accountLogin || this.config(id).channelName || '' });
  }
  disconnect(id) { if (id !== undefined) this.sources.get(id)?.disconnect(); else for (const source of this.sources.values()) source.disconnect(); }
  reset() { this.disconnect(); this.sources.clear(); }
  remove(id) { this.disconnect(id); this.sources.delete(id); }
  async resume() {
    await Promise.all(this.configs().filter(channel => channel.autoConnect && this.getSecrets(channel.id).twitchToken).map(async channel => {
      const values = this.getSecrets(channel.id);
      try { await this.connect(values.twitchToken, { refreshToken: values.twitchRefresh || '', clientSecret: values.twitchSecret || '' }, channel.id); }
      catch (error) { this.log('error', 'Twitch @' + (channel.channelName || 'Mein Kanal') + ' · ' + error.message); }
    }));
  }
  enableSubscriptions(id) {
    const events = ['channel.subscribe', 'channel.subscription.message', 'channel.subscription.gift'];
    for (const config of this.configs().filter(channel => !id || channel.id === id)) {
      const target = this.config(config.id), source = this.sources.get(config.id);
      target.events = [...new Set([...target.events, ...events])];
      if (source?.state === 'connected') for (const event of events) void source.subscribeEvent(event);
    }
  }
  async rewards(id) {
    const source = this.source(id), room = this.getRoom(), generation = source.generation;
    if (!source.token || !source.broadcasterId) throw new Error('Den Twitch-Kanal zuerst verbinden.');
    const response = await this.fetchImpl('https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=' + encodeURIComponent(source.broadcasterId), { headers: { Authorization: 'Bearer ' + source.token, 'Client-Id': this.config(id).clientId }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Kanalpunkte-Belohnungen konnten nicht geladen werden. Kanalpunkte-Berechtigung prüfen.');
    const data = await response.json();
    if (room !== this.getRoom() || generation !== source.generation) throw new Error('Der Raum oder Twitch-Kanal wurde gewechselt.');
    return (data.data || []).map(reward => ({ id: String(reward.id), title: String(reward.title), cost: reward.cost, prompt: reward.prompt || '', enabled: reward.is_enabled !== false }));
  }
  async createReward(id, raw) {
    const source = this.source(id), room = this.getRoom(), generation = source.generation;
    if (!source.token || !source.broadcasterId) throw new Error('Den Twitch-Kanal zuerst verbinden.');
    const title = text(raw.title, 45), prompt = text(raw.prompt || '', 200), cost = Number(raw.cost), cooldown = Number(raw.cooldown || 0);
    if (!title || !Number.isSafeInteger(cost) || cost < 1) throw new Error('Einen Titel und mindestens einen ganzen Kanalpunkt als Preis eintragen.');
    if (!Number.isSafeInteger(cooldown) || cooldown < 0 || cooldown > 604800) throw new Error('Die Abklingzeit muss 0 bis 604800 Sekunden betragen.');
    if (raw.color && !/^#[a-f0-9]{6}$/i.test(raw.color)) throw new Error('Eine gültige Belohnungsfarbe wählen.');
    await source.validate();
    if (room !== this.getRoom() || generation !== source.generation) throw new Error('Der Raum oder Twitch-Kanal wurde gewechselt.');
    if (!source.scopes.includes('channel:manage:redemptions')) throw new Error('Twitch erneut mit „Belohnungen freigeben“ anmelden. Die Berechtigung zum Anlegen von Kanalpunkte-Belohnungen fehlt.');
    const body = { title, cost, prompt, is_enabled: raw.enabled !== false, is_user_input_required: raw.requireInput === true,
      ...(raw.color ? { background_color: raw.color } : {}), is_global_cooldown_enabled: cooldown > 0, ...(cooldown > 0 ? { global_cooldown_seconds: cooldown } : {}) };
    let response;
    try { response = await this.fetchImpl('https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=' + encodeURIComponent(source.broadcasterId), { method: 'POST', headers: { Authorization: 'Bearer ' + source.token, 'Client-Id': this.config(id).clientId, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) }); }
    catch { throw new Error('Twitch hat das Anlegen nicht bestätigt. Die Belohnungsliste neu laden, bevor du es erneut versuchst.'); }
    if (!response.ok) {
      if (response.status === 401) throw new Error('Twitch-Anmeldung erneuern; die Berechtigung zum Anlegen von Belohnungen fehlt oder ist abgelaufen.');
      if (response.status === 403) throw new Error('Twitch erlaubt hier keine Kanalpunkte-Belohnungen. Der Kanal benötigt die Kanalpunkte-Funktion und die passende Freigabe.');
      if (response.status === 400) throw new Error('Twitch hat die Belohnung abgelehnt. Titel müssen eindeutig sein; pro Kanal sind höchstens 50 Belohnungen erlaubt.');
      throw new Error('Twitch konnte die Belohnung nicht anlegen (HTTP ' + response.status + ').');
    }
    const value = (await response.json()).data?.[0];
    if (room !== this.getRoom() || generation !== source.generation) throw new Error('Der Raum oder Twitch-Kanal wurde gewechselt. Die Belohnung gegebenenfalls in Twitch prüfen.');
    if (!value?.id) throw new Error('Twitch hat keine Belohnungs-ID zurückgegeben. Die Liste vor einem erneuten Versuch neu laden.');
    return { id: String(value.id), title: String(value.title), cost: value.cost, prompt: value.prompt || '', enabled: value.is_enabled !== false };
  }
}
