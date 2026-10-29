import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Store, VERSION, PROFILES, normalizeRule, parseYamlProfiles, text, number } from './lib/model.mjs';
import { Engine } from './lib/engine.mjs';
import { Archipelago } from './lib/archipelago.mjs';
import { adminSlotFile, includeAdminSlot } from './lib/admin-slot.mjs';
import { CharitySource, TWITCH_EVENTS, TWITCH_REWARDS_EVENT, twitchScopes, verifyCharity } from './lib/sources.mjs';
import { TwitchChannels, normalizeTwitchChannel } from './lib/twitch-channels.mjs';
import { Vault } from './lib/vault.mjs';
import { Rooms } from './lib/rooms.mjs';
import { GameLibrary } from './lib/game-library.mjs';
import { YAML_IMPORT_LIMIT } from './lib/yaml-templates.mjs';
import { writeZip, APWORLD_LIMITS, APWORLD_BASE64_LIMIT } from './lib/zip.mjs';
import { connectionConfig } from './lib/address.mjs';
import { Updater } from './lib/updater.mjs';
import { Presentation, normalizeAlerts } from './lib/presentation.mjs';
import { desktopExecutable, desktopRootId, desktopParent } from './lib/desktop.mjs';
import { spawn } from 'node:child_process';
import { HelpLanguage, HelpTranslator, helpRevision } from './lib/help-language.mjs';
import { RuleLibrary, RULE_IMPORT_LIMIT, captureTargets, targetKeys, channelIdentities, exportRules, parseRules, planRules } from './lib/rule-library.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const secretEquals = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const json = (response, value, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)); };
async function body(request, limit = 800000) {
  const chunks = []; let bytes = 0;
  for await (const chunk of request) { bytes += chunk.length; if (bytes > limit) throw new Error('Anfrage ist zu groß.'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
function cleanConfig(old, raw) {
  const c = structuredClone(old);
  for (const [key, min, max] of [['globalCooldownSec', 0, 3600], ['queueTtlSec', 30, 86400], ['maxQueue', 1, 1000], ['eventMaxAgeSec', 10, 3600]]) if (raw[key] !== undefined) c[key] = number(raw[key], min, max);
  if (raw.deathLinkArmed !== undefined) c.deathLinkArmed = raw.deathLinkArmed === true;
  if (raw.alerts) c.alerts = normalizeAlerts(raw.alerts, c.alerts);
  if (raw.ap) c.ap = connectionConfig(c.ap, raw.ap);
  if (raw.rememberConnections !== undefined) c.rememberConnections = raw.rememberConnections === true;
  if (raw.charity) {
    const slug = text(raw.charity.slug ?? c.charity.slug), project = text(raw.charity.project ?? c.charity.project);
    if ((slug && !/^[a-zA-Z0-9_-]+$/.test(slug)) || !/^[a-zA-Z0-9_-]+$/.test(project)) throw new Error('Ungültiger Charity-Slug.');
    c.charity = { slug, project };
  }
  if (raw.twitch) {
    const events = raw.twitch.events ?? c.twitch.events;
    if (!Array.isArray(events) || events.some(e => !Object.hasOwn(TWITCH_EVENTS, e))) throw new Error('Unbekannter Twitch-Ereignistyp.');
    c.twitch = { ...c.twitch, clientId: text(raw.twitch.clientId ?? c.twitch.clientId), broadcasterId: text(raw.twitch.broadcasterId ?? c.twitch.broadcasterId), channelName: text(raw.twitch.channelName ?? c.twitch.channelName ?? '', 25).replace(/^@/, '').toLowerCase(), events: [...new Set(events)] };
    if (raw.twitch.channels !== undefined) {
      if (!Array.isArray(raw.twitch.channels) || raw.twitch.channels.length > 20) throw new Error('Höchstens 20 Twitch-Kanäle.');
      c.twitch.channels = raw.twitch.channels.map(channel => {
        if (!/^[\w-]{1,80}$/.test(channel.id || '') || channel.id === 'default') throw new Error('Ungültige Twitch-Kanal-ID.');
        return normalizeTwitchChannel(channel, { id: channel.id });
      });
      if (new Set(c.twitch.channels.map(channel => channel.id)).size !== c.twitch.channels.length || new Set(c.twitch.channels.map(channel => channel.channelName)).size !== c.twitch.channels.length) throw new Error('Twitch-Kanäle müssen eindeutig sein.');
    }
  }
  return c;
}

export async function createApp({ directory = join(root, 'data'), port = 17381, memory = false, core = !memory, fetchImpl = fetch, worldsDirectory, twitchSocketUrl, updateRestart = false, updateRoot = root, translationRunner, translationModelFolder } = {}) {
  const store = new Store(Rooms.initialDirectory(directory, { memory }), { memory }); const session = randomBytes(32).toString('hex');
  const rooms = new Rooms(store, directory, { memory }), vault = new Vault(directory, { memory });
  const presentation = new Presentation(directory, { memory }); let alertPreview;
  const helpLanguage = new HelpLanguage(directory, { memory }), helpTranslator = new HelpTranslator(directory, root, { memory, runBatch: translationRunner, ...(translationModelFolder ? { modelFolder: translationModelFolder } : {}) });
  const ruleLibrary = new RuleLibrary(directory, { memory });
  const library = new GameLibrary(directory, root, { memory, core, folder: worldsDirectory });
  if (worldsDirectory) library.data.folder = worldsDirectory;
  const keyFile = join(directory, 'integration-key.txt');
  const integrationKey = !memory && existsSync(keyFile) ? readFileSync(keyFile, 'utf8').trim() : randomBytes(32).toString('hex');
  if (!memory && !existsSync(keyFile)) { mkdirSync(directory, { recursive: true }); writeFileSync(keyFile, integrationKey, { mode: 0o600 }); }
  let engine; const listeners = new Set(); let updateTimer; const pendingOAuth = new Map();
  const changed = () => { if (!updateTimer) updateTimer = setTimeout(() => { updateTimer = null; for (const response of listeners) response.write('event: change\ndata: {}\n\n'); }, 50); };
  const log = (level, message) => { store.log(level, message); changed(); };
  const updater = new Updater({ root: updateRoot, directory, fetchImpl, getToken: () => vault.get('__application_updates__').githubToken || '', changed, allowInstall: updateRestart });
  const ap = new Archipelago({ log, changed, uuid: store.state.installationId, unsafe: () => engine?.pause() });
  engine = new Engine(store, ap); engine.onChange = changed;
  const ingest = event => engine.ingest(event);
  const charity = new CharitySource({ getConfig: () => store.state.config.charity, ingest, log, changed });
  const twitchSecrets = (id = 'default') => id === 'default' ? vault.get(rooms.id) : vault.get(rooms.id).twitchChannels?.[id] || {};
  function writeTwitchSecrets(id, values) {
    if (id === 'default') vault.update(rooms.id, values);
    else vault.update(rooms.id, { twitchChannels: { ...(vault.get(rooms.id).twitchChannels || {}), [id]: { ...twitchSecrets(id), ...values } } });
  }
  const twitch = new TwitchChannels({ getConfig: () => store.state.config.twitch, getRoom: () => rooms.id, getLegacyAuto: () => store.state.config.autoConnect.twitch,
    getSecrets: twitchSecrets, saveSecrets: (id, values) => { if (store.state.config.rememberConnections) writeTwitchSecrets(id, values); },
    onIdentity: (id, values) => { Object.assign(twitch.config(id), values); store.save(); }, ingest, log, changed, fetchImpl, ...(twitchSocketUrl ? { socketUrl: twitchSocketUrl } : {}) });
  function connectTwitch(token, values, id = 'default') {
    values ||= twitchSecrets(id);
    return twitch.connect(token, { refreshToken: values.twitchRefresh || '', clientSecret: values.twitchSecret || '' }, id);
  }
  function twitchAuto(id, value) { if (id === 'default') store.state.config.autoConnect.twitch = value; else twitch.config(id).autoConnect = value; }
  function resolveTwitchSecret(id, field, value) { return value === undefined || value === '••••••••' ? twitchSecrets(id)[field] || '' : vault.resolve(rooms.id, field, value); }
  function invalidateOAuth(id) { for (const [state, flow] of pendingOAuth) if (id === undefined || flow.channelId === id) pendingOAuth.delete(state); }
  function oauthFlow(state) {
    const flow = typeof state === 'string' && pendingOAuth.get(state);
    if (!flow || flow.room !== rooms.id || flow.expires < Date.now() || twitch.config(flow.channelId).clientId !== flow.clientId) throw new Error('Twitch-Anmeldung ist abgelaufen oder gehört zu einem anderen Raum oder Kanal.');
    return flow;
  }
  function enableRewards(flow) { if (flow.enableRewards) { const config = twitch.config(flow.channelId); config.events = [...new Set([...config.events, TWITCH_REWARDS_EVENT])]; } }
  function ruleContext(id = rooms.id) {
    const room = rooms.require(id);
    const state = id === rooms.id ? store.state : rooms.cache.get(id)?.state || (!memory && existsSync(join(rooms.location(id), 'state.json')) ? JSON.parse(readFileSync(join(rooms.location(id), 'state.json'), 'utf8')) : null);
    if (!state || !Array.isArray(state.rules)) throw new Error('Regeln dieses Raums konnten nicht gelesen werden.');
    return { room, rules: state.rules, config: state.config, players: id === rooms.id ? ap.players.filter(player => player.team === ap.team && player.type === 1) : [] };
  }
  function ruleBundle(data) {
    if (data.presetId) return ruleLibrary.get(data.presetId).bundle;
    if (data.sourceRoomId) return exportRules(ruleContext(data.sourceRoomId));
    if (data.bundle) return data.bundle;
    throw new Error('Einen Raum, eine Vorlage oder eine Regeldatei auswählen.');
  }
  function ruleImportPlan(data) {
    if (data.roomId !== rooms.id) throw new Error('Der Zielraum wurde gewechselt. Import erneut öffnen.');
    const bundle = parseRules(ruleBundle(data));
    return { bundle, plan: planRules(bundle, { players: ruleContext().players, channels: channelIdentities(store.state.config), ids: data.ids }) };
  }
  async function resumeConnections() {
    const config = store.state.config, saved = vault.get(rooms.id);
    if (config.autoConnect.ap && config.ap.url && config.ap.slotName) {
      try { ap.connect(config.ap, saved.roomPassword || '', saved.adminPassword || ''); } catch (e) { log('error', 'AP-Wiederverbindung: ' + e.message); }
    }
    if (config.autoConnect.charity && config.charity.slug) { try { charity.connect(); } catch (e) { log('error', e.message); } }
    await twitch.resume();
  }
  let roomBusy = false;
  async function changeRoom(action) {
    if (roomBusy) throw new Error('Ein Raumwechsel läuft noch.');
    roomBusy = true; try { return await action(); } finally { roomBusy = false; }
  }
  async function switchRoom(id) {
    rooms.require(id, { activeOnly: true }); if (id === rooms.id) return;
    if (engine.busy) throw new Error('Ein Versand läuft noch. Nach dessen Abschluss den Raum wechseln.');
    charity.disconnect(); twitch.reset(); ap.disconnect(); pendingOAuth.clear();
    ap.players = []; ap.catalogs = {}; ap.seed = ''; ap.roomKey = ''; ap.slotInfo = null; ap.networkPlayers = null;
    rooms.activate(id); await resumeConnections(); changed();
  }
  let gameIndex = { games: [], source: '', date: '' };
  try { gameIndex = JSON.parse(readFileSync(join(root, 'assets', 'game-index.json'), 'utf8')); } catch { /* Optional reference catalog. Live catalogs always come from AP. */ }
  if (!store.state.yamlProfiles.length) {
    for (const filename of ['kh2.yaml', 'factorio.yaml', 'stardew.yaml']) try { store.state.yamlProfiles.push(...parseYamlProfiles(readFileSync(join(root, 'examples', filename), 'utf8'))); } catch { /* Examples are not required at runtime. */ }
    store.save();
  }
  function gameEntry(game, sourceId) {
    if (sourceId !== undefined) return library.get(game, sourceId);
    const saved = store.state.yamlSources[game];
    return library.get(game, saved && library.sources(game).some(source => source.id === saved) ? saved : undefined);
  }
  const catalogEntries = () => library.catalogEntries().map(entry => gameEntry(entry.game));
  function gameLibraryList() {
    const result = library.list();
    result.games = catalogEntries().map(({ base, ...entry }) => ({ ...entry, optionCount: entry.options.length }));
    return result;
  }
  function snapshot() {
    const s = store.state;
    return { name: 'AP Chaos Bridge', version: VERSION, session, config: s.config, ap: ap.status(), charity: charity.status(), twitch: twitch.status(),
      appearance: presentation.appearance, language: helpLanguage.language, translation: helpTranslator.status(), updates: updater.snapshot(), rules: s.rules, players: ap.players.map(p => ({ ...p, approval: engine.approval(p), itemCount: Object.keys(ap.items(p.game)).length })),
      rooms: rooms.list(), savedCredentials: vault.status(rooms.id), playerProfiles: s.players, yamlPresets: s.yamlPresets,
      gameLibrary: { importLimits: { ...APWORLD_LIMITS, maxYamlBytes: YAML_IMPORT_LIMIT }, folder: library.data.folder, coreVersion: library.coreVersion || '', games: catalogEntries().map(g => ({ game: g.game, kind: g.kind, source: g.source, sourceId: g.sourceId, sources: g.sources, coreVersion: g.coreVersion, aliases: g.aliases, optionCount: g.options.length, unresolved: g.unresolved })) },
      queue: s.queue, events: s.events, logs: s.logs, profiles: PROFILES, yamlProfiles: s.yamlProfiles, twitchEvents: TWITCH_EVENTS,
      stats: { queued: s.queue.filter(j => j.status === 'queued').length, confirmed: s.queue.filter(j => j.status === 'confirmed').length, uncertain: s.queue.filter(j => j.status === 'uncertain').length, simulated: s.queue.filter(j => j.status === 'simulated').length },
    };
  }
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const actualPort = server.address()?.port;
    const url = new URL(req.url, 'http://127.0.0.1'), path = url.pathname;
    const oauthLanding = req.method === 'GET' && path === '/oauth/callback';
    const hosts = new Set([`127.0.0.1:${actualPort}`, `localhost:${actualPort}`]);
    if (!hosts.has(req.headers.host) || (!oauthLanding && req.headers['sec-fetch-site'] === 'cross-site')) return json(res, { error: 'Nur lokaler Zugriff erlaubt.' }, 403);
    if (!oauthLanding && req.headers.origin && !new Set([`http://127.0.0.1:${actualPort}`, `http://localhost:${actualPort}`]).has(req.headers.origin)) return json(res, { error: 'Fremder Origin abgelehnt.' }, 403);
    try {
      if (oauthLanding && url.searchParams.has('code')) {
        const state = url.searchParams.get('state'), flow = oauthFlow(state); pendingOAuth.delete(state);
        const credentials = twitchSecrets(flow.channelId), room = rooms.id;
        const tokenResponse = await fetchImpl('https://id.twitch.tv/oauth2/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', client_id: flow.clientId, client_secret: credentials.twitchSecret || '', code: url.searchParams.get('code'), redirect_uri: `http://localhost:${actualPort}/oauth/callback` }), signal: AbortSignal.timeout(12000) });
        if (!tokenResponse.ok) throw new Error('Twitch-Code konnte nicht eingelöst werden. Client-ID, Client Secret und Redirect-URL prüfen.');
        const tokens = await tokenResponse.json();
        if (rooms.id !== room) throw new Error('Raum wurde während der Anmeldung gewechselt.');
        enableRewards(flow); await connectTwitch(tokens.access_token, { ...credentials, twitchRefresh: tokens.refresh_token || '' }, flow.channelId);
        twitchAuto(flow.channelId, true); store.save();
        res.writeHead(303, { Location: '/oauth/callback?complete=1' }); res.end(); return;
      }
      if (req.method === 'GET' && path === '/api/state') return json(res, snapshot());
      if (req.method === 'GET' && path === '/api/desktop') return json(res, { name: 'AP Chaos Bridge', version: VERSION, rootId: desktopRootId(root), pid: process.pid, desktopPid: desktopParent() || null, session });
      if (req.method === 'GET' && path === '/api/overlay') {
        const alerts = normalizeAlerts({}, store.state.config.alerts);
        if (alerts.media && !presentation.has(alerts.media)) alerts.media = '';
        const jobs = store.state.queue.filter(j => ['confirmed', 'sent', 'simulated', 'alerted'].includes(j.status)).slice(-100).map(j => ({ id: j.id, item: j.item, effect: j.effect, message: j.message, user: j.user, targetName: j.targetName, status: j.status, dryRun: j.dryRun, finishedAt: j.finishedAt }));
        if (alertPreview?.room === rooms.id && Date.now() - alertPreview.finishedAt < 30000) jobs.push(alertPreview);
        return json(res, { room: rooms.id, appearance: presentation.appearance, alerts, jobs });
      }
      if (req.method === 'GET' && path.startsWith('/alert-media/')) {
        const media = presentation.get(path.slice('/alert-media/'.length));
        if (!media) return json(res, { error: 'Alert-Datei nicht gefunden.' }, 404);
        res.writeHead(200, { 'Content-Type': media.type, 'Content-Length': media.bytes.length }); res.end(media.bytes); return;
      }
      if (req.method === 'GET' && path === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive' });
        res.write('event: change\ndata: {}\n\n'); listeners.add(res); const beat = setInterval(() => res.write(': keepalive\n\n'), 20000);
        req.on('close', () => { clearInterval(beat); listeners.delete(res); }); return;
      }
      if (req.method === 'GET' && path === '/api/catalog') {
        const game = url.searchParams.get('game');
        const candidates = [...new Set([...(PROFILES[game]?.traps || []), ...(library.data.games[game]?.traps || []), ...store.state.yamlProfiles.filter(p => p.game === game).flatMap(p => p.traps)])];
        return json(res, { game, items: Object.keys(ap.items(game)).sort(), candidates, demo: ap.demo });
      }
      if (req.method === 'GET' && path === '/apworlds-manual') { res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': 'attachment; filename=APWORLDS-MANUELL.md' }); res.end(readFileSync(join(root, 'APWORLDS-MANUELL.md'))); return; }
      if (req.method === 'GET' && path === '/api/game-index') {
        const references = new Map(gameIndex.games.map(game => [game.game, game]));
        return json(res, { ...gameIndex, games: catalogEntries().filter(game => ['apworld', 'core', 'yaml'].includes(game.kind)).map(game => ({ ...references.get(game.game), game: game.game, kind: game.kind, source: game.source, sourceId: game.sourceId, sources: game.sources, coreVersion: game.coreVersion, aliases: game.aliases })) });
      }
      if (req.method === 'GET' && path === '/api/game-library') return json(res, gameLibraryList());
      if (req.method === 'GET' && path === '/api/game-settings') { const entry = gameEntry(url.searchParams.get('game'), url.searchParams.get('sourceId') || undefined); return json(res, { ...entry, helpRevision: helpRevision(entry) }); }
      if (req.method === 'GET' && path === '/api/ap/admin-yaml') {
        const file = adminSlotFile();
        res.writeHead(200, { 'Content-Type': 'application/yaml; charset=utf-8', 'Content-Disposition': 'attachment; filename="ADMIN.yaml"' }); res.end(file.content); return;
      }
      if (req.method === 'GET' && path === '/api/twitch/rewards') return json(res, { rewards: await twitch.rewards(url.searchParams.get('channelId') || 'default') });
      if (req.method === 'GET' && path === '/api/rules/library') return json(res, { presets: ruleLibrary.list(), rooms: rooms.list().rooms.map(room => ({ ...room, count: ruleContext(room.id).rules.length })), maxImportBytes: RULE_IMPORT_LIMIT });
      if (req.method === 'GET' && path === '/api/rules/export') {
        const bundle = url.searchParams.has('presetId') ? ruleLibrary.get(url.searchParams.get('presetId')).bundle : exportRules(ruleContext(url.searchParams.get('roomId') || rooms.id), url.searchParams.has('ids') ? url.searchParams.get('ids').split(',') : undefined);
        res.setHeader('Content-Disposition', 'attachment; filename="AP-Chaos-Bridge-Regeln.json"'); return json(res, bundle);
      }
      if (req.method === 'GET' && path === '/api/export') {
        res.setHeader('Content-Disposition', 'attachment; filename="AP-Chaos-Bridge-Konfiguration.json"');
        return json(res, { schema: 1, config: { ...store.state.config, mode: 'test', paused: true, deathLinkArmed: false }, rules: store.state.rules, approvals: store.state.approvals });
      }
      if (req.method === 'GET' && path === '/api/integration') {
        if (!secretEquals(req.headers['x-bridge-session'], session)) return json(res, { error: 'Sitzung fehlt.' }, 403);
        return json(res, { token: integrationKey, url: `http://127.0.0.1:${actualPort}/api/ingest` });
      }
      if (req.method === 'POST') {
        const isExternal = path === '/api/ingest', isCharityHook = path === '/hooks/charity';
        if (isExternal) {
          if (!secretEquals(req.headers.authorization, 'Bearer ' + integrationKey)) return json(res, { error: 'Integration-Token ungültig.' }, 401);
        } else if (!isCharityHook && !secretEquals(req.headers['x-bridge-session'], session)) return json(res, { error: 'Sitzung fehlt. Seite neu laden.' }, 403);
        const raw = await body(req, path === '/api/worlds/upload' ? APWORLD_BASE64_LIMIT + 2048 : path.startsWith('/api/rules/') ? RULE_IMPORT_LIMIT : ['/api/yaml/import', '/api/yaml/generate', '/api/yaml/bundle', '/api/yaml/preset'].includes(path) ? YAML_IMPORT_LIMIT * 6 + 2048 : path === '/api/alerts/media' ? 14 * 1024 * 1024 : 800000);
        if (isCharityHook && !verifyCharity(raw, req.headers['x-signature'])) return json(res, { error: 'Charity-Signatur ungültig.' }, 401);
        let data; try { data = JSON.parse(raw.toString('utf8') || '{}'); } catch { throw new Error('Ungültiges JSON.'); }
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('JSON-Objekt erwartet.');
        if (isCharityHook) return json(res, charity.handleDonation(data));
        if (isExternal) {
          if (!data.id || !Number.isFinite(data.timestamp)) throw new Error('Externe Ereignisse benötigen id und timestamp (Unix-Millisekunden).');
          return json(res, engine.ingest({ ...data, source: 'external' }));
        }
        if (path === '/api/rules/preview') return json(res, ruleImportPlan(data));
        if (path === '/api/rules/import') {
          const { plan } = ruleImportPlan(data), replace = data.mode === 'replace';
          if (data.mode && !['add', 'replace'].includes(data.mode)) throw new Error('Regeln ergänzen oder ersetzen wählen.');
          if (plan.length + (replace ? 0 : store.state.rules.length) > 100) throw new Error('Der Zielraum darf höchstens 100 Regeln enthalten.');
          store.state.rules = [...(replace ? [] : store.state.rules), ...plan.map(entry => entry.rule)];
          if (replace) engine.pause(); store.save(); changed(); return json(res, { count: plan.length, reviewCount: plan.filter(entry => entry.notes.length).length });
        }
        if (path === '/api/rules/presets') {
          if (data.roomId !== rooms.id) throw new Error('Der Raum wurde gewechselt. Vorlage erneut speichern.');
          const preset = ruleLibrary.save({ name: data.name, bundle: exportRules(ruleContext(), data.ids) }); changed(); return json(res, { id: preset.id });
        }
        if (path === '/api/rules/presets/delete') { ruleLibrary.remove(data.id); changed(); return json(res, { ok: true }); }
        if (path === '/api/twitch/rewards/create') { const reward = await twitch.createReward(data.channelId || 'default', data); changed(); return json(res, { reward }); }
        if (path === '/api/language') { const language = helpLanguage.update(data); changed(); return json(res, { language }); }
        if (path === '/api/game-help') {
          const entry = gameEntry(data.game, data.sourceId);
          if (data.revision && data.revision !== helpRevision(entry)) throw new Error('Die Einstellungsquelle wurde geändert. Das Spiel erneut öffnen.');
          return json(res, await helpTranslator.translate(entry, { language: data.language || helpLanguage.language, indices: data.indices }));
        }
        if (path === '/api/appearance') { presentation.update(data); changed(); return json(res, presentation.appearance); }
        if (path === '/api/alerts/media') { const media = presentation.upload(data); changed(); return json(res, media); }
        if (path === '/api/alerts/preview') {
          alertPreview = { id: randomBytes(12).toString('hex'), room: rooms.id, effect: 'alert', message: 'Dein Stream-Alert ist bereit.', user: 'Alert-Vorschau', targetName: 'Nur Anzeige', status: 'preview', dryRun: true, preview: true, finishedAt: Date.now() };
          changed(); return json(res, { ok: true, id: alertPreview.id });
        }
        if (path === '/api/updates/check') return json(res, await updater.check());
        if (path === '/api/updates/download') return json(res, updater.startDownload());
        if (path === '/api/updates/token') {
          updater.assertIdle(); const token = vault.resolve('__application_updates__', 'githubToken', data.token).trim();
          if (/\s/.test(token)) throw new Error('GitHub-Token darf keine Leerzeichen enthalten.');
          vault.update('__application_updates__', { githubToken: token }); changed(); return json(res, { ok: true });
        }
        if (path === '/api/updates/install') {
          engine.pause(); if (engine.busy) throw new Error('Ein Versand läuft noch. Nach dessen Abschluss erneut installieren.');
          const status = await updater.install({ port: actualPort }); json(res, status); setTimeout(() => close(), 200); return;
        }
        if (path === '/api/config') {
          const next = cleanConfig(store.state.config, data);
          if (JSON.stringify(next.charity) !== JSON.stringify(store.state.config.charity)) charity.disconnect();
          if (JSON.stringify(next.twitch) !== JSON.stringify(store.state.config.twitch)) { if (data.twitch?.channels) { twitch.reset(); invalidateOAuth(); } else { twitch.disconnect('default'); invalidateOAuth('default'); } }
          store.state.config = next;
        } else if (path === '/api/rooms/create') {
          const room = rooms.create(data); changed(); return json(res, { room });
        } else if (path === '/api/rooms/rename') { rooms.rename(data); changed(); return json(res, { ok: true });
        } else if (path === '/api/rooms/archive' || path === '/api/rooms/delete') {
          await changeRoom(async () => {
            const room = rooms.require(data.id), deleting = path.endsWith('/delete');
            if (deleting && data.confirmName !== room.name) throw new Error('Zum Löschen den Raumnamen exakt eingeben.');
            if (!deleting && typeof data.archived !== 'boolean') throw new Error('Archivstatus fehlt.');
            if (room.id === rooms.id && (deleting || data.archived)) {
              if (engine.busy) throw new Error('Ein Versand läuft noch. Nach dessen Abschluss den Raum wechseln.');
              await switchRoom(rooms.fallback(room.id).id);
            }
            if (deleting) { rooms.remove(room.id); vault.remove(room.id); } else rooms.archive(room.id, data.archived);
          }); changed(); return json(res, { ok: true });
        } else if (path === '/api/rooms/activate') { await changeRoom(() => switchRoom(data.id)); return json(res, { ok: true });
        } else if (path === '/api/players') {
          if (!Array.isArray(data.players) || data.players.length > 100) throw new Error('Höchstens 100 Spielerprofile.');
          const players = data.players.map(p => ({ id: /^[\w-]{1,80}$/.test(p.id || '') ? p.id : randomBytes(12).toString('hex'), name: text(p.name, 16), game: text(p.game || '', 200) }));
          if (players.some(p => !p.name || /[{}]/.test(p.name)) || new Set(players.map(p => p.name.toLowerCase())).size !== players.length) throw new Error('Eindeutige Slotnamen mit 1 bis 16 Zeichen verwenden.');
          store.state.players = players;
        } else if (path === '/api/worlds/scan') {
          const report = await library.scan(data.folder || library.data.folder); changed(); return json(res, report);
        } else if (path === '/api/worlds/upload') { const result = library.upload(data); changed(); return json(res, result);
        } else if (path === '/api/yaml/import') {
          const result = library.importYaml(data);
          for (const template of result.templates) store.state.yamlSources[template.game] = template.id;
          store.save(); changed(); return json(res, result);
        } else if (path === '/api/yaml/source') {
          const entry = library.get(data.game, data.sourceId); store.state.yamlSources[entry.game] = entry.sourceId;
          store.save(); changed(); return json(res, { ok: true });
        } else if (path === '/api/yaml/remove') {
          const result = library.removeYaml(data); delete store.state.yamlPresets[data.sourceId];
          if (store.state.yamlSources[result.game] === data.sourceId) delete store.state.yamlSources[result.game];
          store.save(); changed(); return json(res, result);
        } else if (path === '/api/yaml/generate' || path === '/api/yaml/bundle' || path === '/api/yaml/preset') {
          const entry = gameEntry(data.game, data.sourceId), playerFiles = library.generate({ ...data, sourceId: entry.sourceId });
          const files = data.includeAdmin === true ? includeAdminSlot(playerFiles, data.players || []) : playerFiles;
          if (path === '/api/yaml/preset') { store.state.yamlPresets[library.presetKey(data.game, entry.sourceId)] = { values: data.values || {}, players: data.players, extra: data.extra || '', sourceId: entry.sourceId, includeAdmin: data.includeAdmin === true }; store.save(); changed(); return json(res, { ok: true }); }
          if (path === '/api/yaml/generate') return json(res, { files });
          res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="Archipelago-Spieler-YAMLs.zip"' }); res.end(writeZip(files)); return;
        } else if (path === '/api/credentials/forget') {
          if (data.source === 'ap') { ap.disconnect(); store.state.config.autoConnect.ap = false; vault.update(rooms.id, { roomPassword: '', adminPassword: '' }); }
          else if (data.source === 'twitch') { const id = data.channelId || 'default'; twitch.config(id); twitch.disconnect(id); invalidateOAuth(id); twitchAuto(id, false); writeTwitchSecrets(id, { twitchToken: '', twitchRefresh: '', twitchSecret: '' }); }
          else throw new Error('Unbekannte Verbindung.');
        } else if (path === '/api/twitch/credentials') {
          const id = data.channelId || 'default'; twitch.config(id);
          const twitchSecret = resolveTwitchSecret(id, 'twitchSecret', data.clientSecret);
          writeTwitchSecrets(id, { twitchSecret });
        } else if (path === '/api/twitch/channel') {
          const id = data.id;
          const existing = id ? { ...twitch.config(id), id, ...(id === 'default' ? { autoConnect: store.state.config.autoConnect.twitch } : {}) } : {};
          const profile = normalizeTwitchChannel(data, existing);
          if (twitch.configs().some(channel => channel.id !== profile.id && channel.channelName?.toLowerCase() === profile.channelName)) throw new Error('Dieser Kanal ist bereits eingetragen.');
          if (id) {
            const changedSettings = existing.clientId !== profile.clientId || existing.channelName !== profile.channelName || JSON.stringify(existing.events) !== JSON.stringify(profile.events);
            if (changedSettings) { twitch.disconnect(id); invalidateOAuth(id); profile.autoConnect = false; if (existing.clientId !== profile.clientId || existing.channelName !== profile.channelName) { profile.broadcasterId = ''; writeTwitchSecrets(id, { twitchToken: '', twitchRefresh: '', twitchSecret: '' }); } }
            if (id === 'default') { Object.assign(store.state.config.twitch, profile); store.state.config.autoConnect.twitch = profile.autoConnect; } else store.state.config.twitch.channels = store.state.config.twitch.channels.map(channel => channel.id === id ? profile : channel);
          } else {
            if (twitch.configs().length >= 20) throw new Error('Höchstens 20 Twitch-Kanäle pro Raum.');
            store.state.config.twitch.channels.push(profile);
          }
          store.save(); changed(); return json(res, { channel: profile });
        } else if (path === '/api/twitch/channel/delete') {
          const id = data.channelId; if (typeof id !== 'string' || !id) throw new Error('Twitch-Kanal auswählen.'); twitch.config(id); twitch.remove(id); invalidateOAuth(id);
          if (id === 'default') { store.state.config.twitch.clientId = ''; store.state.config.twitch.channelName = ''; store.state.config.twitch.broadcasterId = ''; store.state.config.autoConnect.twitch = false; writeTwitchSecrets(id, { twitchToken: '', twitchRefresh: '', twitchSecret: '' }); }
          else { store.state.config.twitch.channels = store.state.config.twitch.channels.filter(channel => channel.id !== id); const secrets = { ...(vault.get(rooms.id).twitchChannels || {}) }; delete secrets[id]; vault.update(rooms.id, { twitchChannels: secrets }); }
        }
        else if (path === '/api/mode') {
          if (!['test', 'live'].includes(data.mode)) throw new Error('Unbekannter Modus.');
          const activeRules = store.state.rules.filter(r => r.enabled), visualOnly = activeRules.length && activeRules.every(r => r.effect === 'alert');
          if (data.mode === 'live' && (!ap.connected || ap.demo) && !visualOnly) throw new Error('Spielaktionen im Live-Modus benötigen einen echten verbundenen AP-Raum.');
          store.state.config.mode = data.mode; store.state.config.paused = false;
        } else if (path === '/api/pause') {
          if (data.paused === false && !ap.connected && !store.state.rules.some(r => r.enabled && r.effect === 'alert')) throw new Error('Zuerst Demo oder AP-Raum verbinden.');
          store.state.config.paused = data.paused !== false;
        } else if (path === '/api/emergency') engine.emergency();
        else if (path === '/api/demo') {
          charity.disconnect(); twitch.disconnect(); ap.loadDemo();
          store.state.config.mode = 'test'; store.state.config.paused = false;
          store.state.approvals[ap.roomKey] = Object.fromEntries(ap.players.map(p => [`${p.team}:${p.slot}`, { enabled: p.game !== 'Kingdom Hearts 2', items: PROFILES[p.game].traps.slice(0, 4), traps: PROFILES[p.game].traps.slice(0, 4) }]));
          log('info', 'Demo geladen. Alle Aktionen bleiben Simulationen.');
        } else if (path === '/api/ap/connect') {
          const config = cleanConfig(store.state.config, { ap: data });
          config.paused = false; config.mode = 'test';
          const roomPassword = vault.resolve(rooms.id, 'roomPassword', data.roomPassword), adminPassword = vault.resolve(rooms.id, 'adminPassword', data.adminPassword);
          ap.connect(config.ap, roomPassword, adminPassword); config.autoConnect.ap = true; store.state.config = config;
          if (config.rememberConnections) vault.update(rooms.id, { roomPassword, adminPassword });
        } else if (path === '/api/ap/disconnect') { ap.disconnect(); store.state.config.autoConnect.ap = false; }
        else if (path === '/api/charity/connect') { charity.connect(); store.state.config.autoConnect.charity = true; }
        else if (path === '/api/charity/disconnect') { charity.disconnect(); store.state.config.autoConnect.charity = false; }
        else if (path === '/api/twitch/connect') { const id = data.channelId || 'default', saved = twitchSecrets(id); await connectTwitch(data.token || saved.twitchToken || '', data.token ? { ...saved, twitchRefresh: '' } : saved, id); twitchAuto(id, true); }
        else if (path === '/api/twitch/disconnect') { const id = data.channelId || 'default'; twitch.config(id); twitch.disconnect(id); invalidateOAuth(id); twitchAuto(id, false); }
        else if (path === '/api/twitch/auth') {
          const channelId = data.channelId || 'default', config = twitch.config(channelId);
          if (!config.clientId || !config.events.length) throw new Error('Client-ID und mindestens ein Ereignis speichern.');
          for (const [state, flow] of pendingOAuth) if (flow.expires < Date.now()) pendingOAuth.delete(state);
          if (pendingOAuth.size >= 20) throw new Error('Zu viele offene Twitch-Anmeldungen. Vorhandene Anmeldung abschließen.');
          const state = randomBytes(24).toString('hex'); pendingOAuth.set(state, { state, expires: Date.now() + 600000, room: rooms.id, channelId, clientId: config.clientId, enableRewards: data.enableRewards === true });
          const auth = new URL('https://id.twitch.tv/oauth2/authorize');
          auth.search = new URLSearchParams({ response_type: twitchSecrets(channelId).twitchSecret ? 'code' : 'token', client_id: config.clientId, redirect_uri: `http://localhost:${actualPort}/oauth/callback`, scope: twitchScopes(config.events, data.enableRewards === true).join(' '), state, force_verify: 'true' });
          return json(res, { url: auth.href });
        } else if (path === '/api/twitch/oauth') {
          const flow = oauthFlow(data.state); pendingOAuth.delete(data.state);
          enableRewards(flow); await connectTwitch(data.token || '', { ...twitchSecrets(flow.channelId), twitchRefresh: '' }, flow.channelId); twitchAuto(flow.channelId, true);
        }
        else if (path === '/api/rule') {
          const rule = normalizeRule(data); const idx = store.state.rules.findIndex(r => r.id === rule.id), existing = store.state.rules[idx];
          if (existing?.reviewNotes?.length && data.reviewed !== true && data.reviewed !== 'on') rule.reviewNotes = existing.reviewNotes;
          if (existing?.reviewNotes?.length && (data.reviewed === true || data.reviewed === 'on')) {
            const players = ruleContext().players;
            if (targetKeys(rule).some(key => !players.some(player => `${player.team}:${player.slot}` === key))) throw new Error('Zielspieler zuerst im verbundenen AP-Raum zuordnen.');
            if (rule.twitchChannelId && !twitch.configs().some(channel => channel.id === rule.twitchChannelId)) throw new Error('Einen Twitch-Kanal dieses Raums oder alle Kanäle wählen.');
            rule.reviewNotes = [];
          }
          if (rule.enabled && rule.reviewNotes.length) throw new Error('Die Zuordnung dieser importierten Regel für den Zielraum bestätigen.');
          rule.targetPlayers = captureTargets({ ...rule, targetPlayers: existing?.targetPlayers || rule.targetPlayers }, ruleContext().players);
          if (idx >= 0) store.state.rules[idx] = rule; else { if (store.state.rules.length >= 100) throw new Error('Höchstens 100 Regeln.'); store.state.rules.push(rule); }
          if (rule.source === 'twitch' && rule.type === 'subscription') twitch.enableSubscriptions(rule.twitchChannelId);
        } else if (path === '/api/rule/toggle') {
          if (data.roomId !== rooms.id) throw new Error('Der Raum wurde gewechselt. Regel im aktuellen Raum erneut auswählen.');
          if (typeof data.enabled !== 'boolean') throw new Error('Aktivierungsstatus fehlt.');
          const rule = store.state.rules.find(rule => rule.id === data.id);
          if (!rule) throw new Error('Regel fehlt.');
          if (data.enabled && rule.reviewNotes?.length) throw new Error('Die Zuordnung dieser importierten Regel zuerst über „Bearbeiten“ prüfen.');
          if (data.enabled && rule.source === 'twitch' && rule.type === 'subscription') twitch.enableSubscriptions(rule.twitchChannelId);
          rule.enabled = data.enabled;
          if (!rule.enabled) for (const job of store.state.queue) if (job.ruleId === rule.id && job.status === 'queued' && !job.dryRun) { job.status = 'cancelled'; job.detail = 'Regel deaktiviert. Noch nicht gesendete Aktion verworfen.'; }
        } else if (path === '/api/rule/delete') store.state.rules = store.state.rules.filter(r => r.id !== data.id);
        else if (path === '/api/test-rule') return json(res, { ok: true, event: engine.runRule(data.id, data.live === true) });
        else if (path === '/api/test-event') return json(res, engine.ingest({ ...data, id: randomBytes(16).toString('hex'), timestamp: Date.now(), test: true }));
        else if (path === '/api/approval') {
          const player = ap.players.find(p => `${p.team}:${p.slot}` === data.targetKey);
          if (!player || player.team !== ap.team || player.type !== 1) throw new Error('Unbekannter Zielslot oder fremdes Team.');
          if (!Array.isArray(data.items) || data.items.length > 20000 || data.items.some(i => typeof i !== 'string' || !Object.hasOwn(ap.items(player.game), i))) throw new Error('Nur bis zu 20000 Items aus dem aktuellen Raumkatalog freigeben.');
          const traps = Array.isArray(data.traps) ? [...new Set(data.traps)] : [];
          if (traps.some(i => !data.items.includes(i))) throw new Error('Zufallspool muss eine Teilmenge der freigegebenen Items sein.');
          store.state.approvals[ap.roomKey] ||= {};
          store.state.approvals[ap.roomKey][data.targetKey] = { enabled: data.enabled === true, items: [...new Set(data.items)], traps };
        } else if (path === '/api/yaml') {
          const profiles = parseYamlProfiles(data.text);
          if (store.state.yamlProfiles.length + profiles.length > 100) throw new Error('Höchstens 100 YAML-Profile.');
          store.state.yamlProfiles.push(...profiles);
        } else if (path === '/api/yaml/delete') store.state.yamlProfiles = store.state.yamlProfiles.filter(p => p.id !== data.id);
        else if (path === '/api/import') {
          if (data.kind === 'ap-chaos-bridge-rules') throw new Error('Regeldateien unter Regeln → Regeln übernehmen importieren.');
          if (data.schema !== 1 || !Array.isArray(data.rules) || data.rules.length > 100) throw new Error('Ungültiges Konfigurationsformat.');
          const rules = data.rules.map(normalizeRule), config = cleanConfig(store.state.config, data.config || {});
          if (new Set(rules.map(r => r.id)).size !== rules.length) throw new Error('Doppelte Regel-IDs.');
          config.mode = 'test'; config.paused = true; config.deathLinkArmed = false;
          twitch.reset(); invalidateOAuth(); config.autoConnect.twitch = false; config.twitch.channels.forEach(channel => { channel.autoConnect = false; });
          store.state.rules = rules; store.state.config = config; store.state.approvals = {};
          // Slot approvals are intentionally re-established against the current room catalog.
          log('info', 'Konfiguration importiert. Slotfreigaben im aktuellen Raum prüfen.');
        } else if (path === '/api/queue/cancel') {
          const job = store.state.queue.find(j => j.id === data.id);
          if (!job || job.status !== 'queued') throw new Error('Nur wartende Aktionen können verworfen werden.');
          job.status = 'cancelled'; job.detail = 'Manuell verworfen.';
        } else if (path === '/api/queue/clear') {
          for (const job of store.state.queue) if (job.status === 'queued') { job.status = 'cancelled'; job.detail = 'Warteschlange geleert.'; }
        } else if (path === '/api/shutdown') {
          engine.pause(); json(res, { ok: true }); setTimeout(() => close(), 150); return;
        } else return json(res, { error: 'Unbekannter Endpunkt.' }, 404);
        store.save(); changed(); return json(res, { ok: true });
      }
      if (req.method === 'GET') {
        const staticFiles = { '/': 'public/index.html', '/app.js': 'public/app.js', '/language.js': 'public/language.js', '/studio.js': 'public/studio.js', '/rules.js': 'public/rules.js', '/rewards.js': 'public/rewards.js', '/appearance.js': 'public/appearance.js', '/alerts.js': 'public/alerts.js', '/updates.js': 'public/updates.js', '/style.css': 'public/style.css', '/icon.svg': 'public/icon.svg', '/overlay': 'public/overlay.html', '/overlay.js': 'public/overlay.js', '/overlay.css': 'public/overlay.css', '/oauth/callback': 'public/oauth.html', '/oauth.js': 'public/oauth.js' };
        const file = staticFiles[path];
        if (file) { if (path === '/overlay') res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'"); const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' }[extname(file)]; res.writeHead(200, { 'Content-Type': type }); res.end(readFileSync(join(root, file))); return; }
      }
      return json(res, { error: 'Nicht gefunden.' }, 404);
    } catch (error) { return json(res, { ok: false, error: error.message }, 400); }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  const tick = setInterval(() => { engine.tick().catch(e => { store.state.config.paused = true; console.error('Warteschlange angehalten:', e.message); }); }, 250);
  tick.unref?.();
  const close = () => {
    clearInterval(tick); clearTimeout(updateTimer); clearTimeout(updateCheck); clearInterval(updateChecks); updater.close(); helpTranslator.close(); charity.disconnect(); twitch.disconnect(); ap.disconnect();
    for (const response of listeners) response.end(); listeners.clear(); server.close(); server.closeIdleConnections();
  };
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  let updateCheck, updateChecks;
  if (!memory && updateRestart) {
    const check = () => { if (!updater.busy && updater.state.phase !== 'ready') void updater.check().catch(() => {}); };
    updateCheck = setTimeout(check, 3000); updateCheck.unref(); updateChecks = setInterval(check, 12 * 60 * 60 * 1000); updateChecks.unref();
  }
  if (!memory) {
    void resumeConnections();
    void library.scan().then(report => { for (const e of report.errors) log('warn', 'Spielekatalog · ' + e.file + ': ' + e.error); if (report.skipped?.length) log('info', `Spielekatalog: ${report.skipped.length} nicht auswertbare Pakete übersprungen. Details im Spielekatalog.`); changed(); }).catch(e => log('warn', 'Spielekatalog: ' + e.message));
  }
  return { server, store, engine, ap, charity, twitch, snapshot, close, integrationKey, rooms, vault, library, ruleLibrary, updater, helpLanguage, helpTranslator, url: `http://127.0.0.1:${server.address().port}` };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.AP_BRIDGE_PORT || 17381);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('AP_BRIDGE_PORT muss zwischen 1024 und 65535 liegen.');
  if (process.platform === 'win32' && !desktopParent() && process.env.AP_BRIDGE_BROWSER !== '1' && existsSync(desktopExecutable(root))) {
    // Old update helpers still launch server.mjs. Keep this proxy alive while
    // the new desktop owns its hidden backend, so their health checks succeed.
    const desktop = spawn(desktopExecutable(root), [], { cwd: root, windowsHide: false, stdio: 'ignore' });
    desktop.once('exit', code => { process.exitCode = code ?? 1; });
    desktop.once('error', error => { console.error(error.message); process.exitCode = 1; });
  } else createApp({ port, updateRestart: true }).then(app => {
    console.log(`AP Chaos Bridge ${VERSION}\nOberfläche: ${app.url}\nStart: Testmodus, Warteschlange ${app.store.state.config.paused ? 'pausiert' : 'bereit'}.\nBeenden: Strg+C oder Einstellungen > Tool beenden.`);
    process.on('SIGINT', () => app.close()); process.on('SIGTERM', () => app.close());
  }).catch(error => { console.error(error.code === 'EADDRINUSE' ? 'Port bereits belegt. Läuft die Bridge schon? http://127.0.0.1:' + port : error.message); process.exitCode = 1; });
}
