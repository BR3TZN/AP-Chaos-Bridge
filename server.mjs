import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Store, VERSION, PROFILES, normalizeRule, parseYamlProfiles, text, number } from './lib/model.mjs';
import { Engine } from './lib/engine.mjs';
import { Archipelago } from './lib/archipelago.mjs';
import { CharitySource, TwitchSource, TWITCH_EVENTS, verifyCharity } from './lib/sources.mjs';
import { Vault } from './lib/vault.mjs';
import { Rooms } from './lib/rooms.mjs';
import { GameLibrary } from './lib/game-library.mjs';
import { writeZip, APWORLD_LIMITS, APWORLD_BASE64_LIMIT } from './lib/zip.mjs';
import { connectionConfig } from './lib/address.mjs';
import { Updater } from './lib/updater.mjs';
import { Presentation, normalizeAlerts } from './lib/presentation.mjs';

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
    c.twitch = { clientId: text(raw.twitch.clientId ?? c.twitch.clientId), broadcasterId: text(raw.twitch.broadcasterId ?? c.twitch.broadcasterId), events: [...new Set(events)] };
  }
  return c;
}

export async function createApp({ directory = join(root, 'data'), port = 17381, memory = false, core = !memory, fetchImpl = fetch, worldsDirectory, twitchSocketUrl, updateRestart = false, updateRoot = root } = {}) {
  const store = new Store(Rooms.initialDirectory(directory, { memory }), { memory }); const session = randomBytes(32).toString('hex');
  const rooms = new Rooms(store, directory, { memory }), vault = new Vault(directory, { memory });
  const presentation = new Presentation(directory, { memory }); let alertPreview;
  const library = new GameLibrary(directory, root, { memory, core, folder: worldsDirectory });
  if (worldsDirectory) library.data.folder = worldsDirectory;
  const keyFile = join(directory, 'integration-key.txt');
  const integrationKey = !memory && existsSync(keyFile) ? readFileSync(keyFile, 'utf8').trim() : randomBytes(32).toString('hex');
  if (!memory && !existsSync(keyFile)) { mkdirSync(directory, { recursive: true }); writeFileSync(keyFile, integrationKey, { mode: 0o600 }); }
  let engine; const listeners = new Set(); let updateTimer, pendingOAuth;
  const changed = () => { if (!updateTimer) updateTimer = setTimeout(() => { updateTimer = null; for (const response of listeners) response.write('event: change\ndata: {}\n\n'); }, 50); };
  const log = (level, message) => { store.log(level, message); changed(); };
  const updater = new Updater({ root: updateRoot, directory, fetchImpl, getToken: () => vault.get('__application_updates__').githubToken || '', changed, allowInstall: updateRestart });
  const ap = new Archipelago({ log, changed, uuid: store.state.installationId, unsafe: () => engine?.pause() });
  engine = new Engine(store, ap); engine.onChange = changed;
  const ingest = event => engine.ingest(event);
  const charity = new CharitySource({ getConfig: () => store.state.config.charity, ingest, log, changed });
  const saveTokens = tokens => { if (store.state.config.rememberConnections) vault.update(rooms.id, tokens); };
  const twitch = new TwitchSource({ getConfig: () => store.state.config.twitch, ingest, log, changed, fetchImpl, onTokens: saveTokens, ...(twitchSocketUrl ? { socketUrl: twitchSocketUrl } : {}) });
  function connectTwitch(token, values = vault.get(rooms.id)) {
    return twitch.connect(token, { refreshToken: values.twitchRefresh || '', clientSecret: values.twitchSecret || '' });
  }
  async function resumeConnections() {
    const config = store.state.config, saved = vault.get(rooms.id);
    if (config.autoConnect.ap && config.ap.url && config.ap.slotName) {
      try { ap.connect(config.ap, saved.roomPassword || '', saved.adminPassword || ''); } catch (e) { log('error', 'AP-Wiederverbindung: ' + e.message); }
    }
    if (config.autoConnect.charity && config.charity.slug) { try { charity.connect(); } catch (e) { log('error', e.message); } }
    if (config.autoConnect.twitch && saved.twitchToken) { try { await connectTwitch(saved.twitchToken, saved); } catch (e) { log('error', 'Twitch-Wiederverbindung: ' + e.message); } }
  }
  let roomBusy = false;
  async function changeRoom(action) {
    if (roomBusy) throw new Error('Ein Raumwechsel läuft noch.');
    roomBusy = true; try { return await action(); } finally { roomBusy = false; }
  }
  async function switchRoom(id) {
    rooms.require(id, { activeOnly: true }); if (id === rooms.id) return;
    if (engine.busy) throw new Error('Ein Versand läuft noch. Nach dessen Abschluss den Raum wechseln.');
    charity.disconnect(); twitch.disconnect(); ap.disconnect(); pendingOAuth = null;
    ap.players = []; ap.catalogs = {}; ap.seed = ''; ap.roomKey = ''; ap.slotInfo = null; ap.networkPlayers = null;
    rooms.activate(id); await resumeConnections(); changed();
  }
  let gameIndex = { games: [], source: '', date: '' };
  try { gameIndex = JSON.parse(readFileSync(join(root, 'assets', 'game-index.json'), 'utf8')); } catch { /* Optional reference catalog. Live catalogs always come from AP. */ }
  if (!store.state.yamlProfiles.length) {
    for (const filename of ['kh2.yaml', 'factorio.yaml', 'stardew.yaml']) try { store.state.yamlProfiles.push(...parseYamlProfiles(readFileSync(join(root, 'examples', filename), 'utf8'))); } catch { /* Examples are not required at runtime. */ }
    store.save();
  }
  function snapshot() {
    const s = store.state;
    return { name: 'AP Chaos Bridge', version: VERSION, session, config: s.config, ap: ap.status(), charity: charity.status(), twitch: twitch.status(),
      appearance: presentation.appearance, updates: updater.snapshot(), rules: s.rules, players: ap.players.map(p => ({ ...p, approval: engine.approval(p), itemCount: Object.keys(ap.items(p.game)).length })),
      rooms: rooms.list(), savedCredentials: vault.status(rooms.id), playerProfiles: s.players, yamlPresets: s.yamlPresets,
      gameLibrary: { importLimits: APWORLD_LIMITS, folder: library.data.folder, coreVersion: library.coreVersion || '', games: Object.values(library.data.games).map(g => ({ game: g.game, kind: g.kind, source: g.source, coreVersion: g.coreVersion, aliases: g.aliases, optionCount: g.options.length, unresolved: g.unresolved })) },
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
        const flow = pendingOAuth;
        if (!flow || flow.expires < Date.now() || flow.room !== rooms.id || !secretEquals(url.searchParams.get('state'), flow.state)) throw new Error('Twitch-Anmeldung ist abgelaufen oder gehört zu einem anderen Raum.');
        pendingOAuth = null;
        const credentials = vault.get(rooms.id), room = rooms.id;
        const tokenResponse = await fetchImpl('https://id.twitch.tv/oauth2/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', client_id: store.state.config.twitch.clientId, client_secret: credentials.twitchSecret || '', code: url.searchParams.get('code'), redirect_uri: `http://localhost:${actualPort}/oauth/callback` }), signal: AbortSignal.timeout(12000) });
        if (!tokenResponse.ok) throw new Error('Twitch-Code konnte nicht eingelöst werden. Client-ID, Client Secret und Redirect-URL prüfen.');
        const tokens = await tokenResponse.json();
        if (rooms.id !== room) throw new Error('Raum wurde während der Anmeldung gewechselt.');
        await connectTwitch(tokens.access_token, { ...credentials, twitchRefresh: tokens.refresh_token || '' });
        store.state.config.autoConnect.twitch = true; store.save();
        res.writeHead(303, { Location: '/oauth/callback?complete=1' }); res.end(); return;
      }
      if (req.method === 'GET' && path === '/api/state') return json(res, snapshot());
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
        return json(res, { ...gameIndex, games: library.list().games.filter(game => ['apworld', 'core'].includes(game.kind)).map(game => ({ ...references.get(game.game), game: game.game, kind: game.kind, source: game.source, coreVersion: game.coreVersion, aliases: game.aliases })) });
      }
      if (req.method === 'GET' && path === '/api/game-library') return json(res, library.list());
      if (req.method === 'GET' && path === '/api/game-settings') return json(res, library.get(url.searchParams.get('game')));
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
        const raw = await body(req, path === '/api/worlds/upload' ? APWORLD_BASE64_LIMIT + 2048 : path === '/api/alerts/media' ? 14 * 1024 * 1024 : 800000);
        if (isCharityHook && !verifyCharity(raw, req.headers['x-signature'])) return json(res, { error: 'Charity-Signatur ungültig.' }, 401);
        let data; try { data = JSON.parse(raw.toString('utf8') || '{}'); } catch { throw new Error('Ungültiges JSON.'); }
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('JSON-Objekt erwartet.');
        if (isCharityHook) return json(res, charity.handleDonation(data));
        if (isExternal) {
          if (!data.id || !Number.isFinite(data.timestamp)) throw new Error('Externe Ereignisse benötigen id und timestamp (Unix-Millisekunden).');
          return json(res, engine.ingest({ ...data, source: 'external' }));
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
          if (JSON.stringify(next.twitch) !== JSON.stringify(store.state.config.twitch)) twitch.disconnect();
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
        } else if (path === '/api/yaml/generate' || path === '/api/yaml/bundle' || path === '/api/yaml/preset') {
          const files = library.generate(data);
          if (path === '/api/yaml/preset') { store.state.yamlPresets[data.game] = { values: data.values || {}, players: data.players, extra: data.extra || '' }; store.save(); changed(); return json(res, { ok: true }); }
          if (path === '/api/yaml/generate') return json(res, { files });
          res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="Archipelago-Spieler-YAMLs.zip"' }); res.end(writeZip(files)); return;
        } else if (path === '/api/credentials/forget') {
          if (data.source === 'ap') { ap.disconnect(); store.state.config.autoConnect.ap = false; vault.update(rooms.id, { roomPassword: '', adminPassword: '' }); }
          else if (data.source === 'twitch') { twitch.disconnect(); pendingOAuth = null; store.state.config.autoConnect.twitch = false; vault.update(rooms.id, { twitchToken: '', twitchRefresh: '', twitchSecret: '' }); }
          else throw new Error('Unbekannte Verbindung.');
        } else if (path === '/api/twitch/credentials') {
          const twitchSecret = vault.resolve(rooms.id, 'twitchSecret', data.clientSecret);
          vault.update(rooms.id, { twitchSecret });
        }
        else if (path === '/api/mode') {
          if (!['test', 'live'].includes(data.mode)) throw new Error('Unbekannter Modus.');
          const activeRules = store.state.rules.filter(r => r.enabled), visualOnly = activeRules.length && activeRules.every(r => r.effect === 'alert');
          if (data.mode === 'live' && (!ap.connected || ap.demo) && !visualOnly) throw new Error('Spielaktionen im Live-Modus benötigen einen echten verbundenen AP-Raum.');
          store.state.config.mode = data.mode; store.state.config.paused = true;
        } else if (path === '/api/pause') {
          if (data.paused === false && !ap.connected && !store.state.rules.some(r => r.enabled && r.effect === 'alert')) throw new Error('Zuerst Demo oder AP-Raum verbinden.');
          store.state.config.paused = data.paused !== false;
        } else if (path === '/api/emergency') engine.emergency();
        else if (path === '/api/demo') {
          charity.disconnect(); twitch.disconnect(); ap.loadDemo();
          store.state.config.mode = 'test'; store.state.config.paused = false; store.state.config.deathLinkArmed = false;
          store.state.approvals[ap.roomKey] = Object.fromEntries(ap.players.map(p => [`${p.team}:${p.slot}`, { enabled: p.game !== 'Kingdom Hearts 2', items: PROFILES[p.game].traps.slice(0, 4), traps: PROFILES[p.game].traps.slice(0, 4) }]));
          log('info', 'Demo geladen. Alle Aktionen bleiben Simulationen.');
        } else if (path === '/api/ap/connect') {
          const config = cleanConfig(store.state.config, { ap: data });
          config.paused = true; config.mode = 'test'; config.deathLinkArmed = false;
          const roomPassword = vault.resolve(rooms.id, 'roomPassword', data.roomPassword), adminPassword = vault.resolve(rooms.id, 'adminPassword', data.adminPassword);
          ap.connect(config.ap, roomPassword, adminPassword); config.autoConnect.ap = true; store.state.config = config;
          if (config.rememberConnections) vault.update(rooms.id, { roomPassword, adminPassword });
        } else if (path === '/api/ap/disconnect') { ap.disconnect(); store.state.config.autoConnect.ap = false; }
        else if (path === '/api/charity/connect') { charity.connect(); store.state.config.autoConnect.charity = true; }
        else if (path === '/api/charity/disconnect') { charity.disconnect(); store.state.config.autoConnect.charity = false; }
        else if (path === '/api/twitch/connect') { const saved = vault.get(rooms.id); await connectTwitch(data.token || saved.twitchToken || '', data.token ? { ...saved, twitchRefresh: '' } : saved); store.state.config.autoConnect.twitch = true; }
        else if (path === '/api/twitch/disconnect') { twitch.disconnect(); store.state.config.autoConnect.twitch = false; }
        else if (path === '/api/twitch/auth') {
          const config = store.state.config.twitch;
          if (!config.clientId || !config.events.length) throw new Error('Client-ID und mindestens ein Ereignis speichern.');
          const state = randomBytes(24).toString('hex'); pendingOAuth = { state, expires: Date.now() + 600000, room: rooms.id };
          const auth = new URL('https://id.twitch.tv/oauth2/authorize');
          auth.search = new URLSearchParams({ response_type: vault.get(rooms.id).twitchSecret ? 'code' : 'token', client_id: config.clientId, redirect_uri: `http://localhost:${actualPort}/oauth/callback`, scope: [...new Set(config.events.map(e => TWITCH_EVENTS[e].scope))].join(' '), state, force_verify: 'true' });
          return json(res, { url: auth.href });
        } else if (path === '/api/twitch/oauth') {
          if (!pendingOAuth || pendingOAuth.room !== rooms.id || pendingOAuth.expires < Date.now() || !secretEquals(data.state, pendingOAuth.state)) throw new Error('Twitch-Anmeldung ist abgelaufen oder gehört zu einer anderen Sitzung.');
          pendingOAuth = null; await connectTwitch(data.token || '', { ...vault.get(rooms.id), twitchRefresh: '' }); store.state.config.autoConnect.twitch = true;
        }
        else if (path === '/api/rule') {
          const rule = normalizeRule(data); const idx = store.state.rules.findIndex(r => r.id === rule.id);
          if (idx >= 0) store.state.rules[idx] = rule; else { if (store.state.rules.length >= 100) throw new Error('Höchstens 100 Regeln.'); store.state.rules.push(rule); }
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
          if (data.schema !== 1 || !Array.isArray(data.rules) || data.rules.length > 100) throw new Error('Ungültiges Konfigurationsformat.');
          const rules = data.rules.map(normalizeRule), config = cleanConfig(store.state.config, data.config || {});
          if (new Set(rules.map(r => r.id)).size !== rules.length) throw new Error('Doppelte Regel-IDs.');
          config.mode = 'test'; config.paused = true; config.deathLinkArmed = false;
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
        const staticFiles = { '/': 'public/index.html', '/app.js': 'public/app.js', '/studio.js': 'public/studio.js', '/appearance.js': 'public/appearance.js', '/alerts.js': 'public/alerts.js', '/updates.js': 'public/updates.js', '/style.css': 'public/style.css', '/icon.svg': 'public/icon.svg', '/overlay': 'public/overlay.html', '/overlay.js': 'public/overlay.js', '/overlay.css': 'public/overlay.css', '/oauth/callback': 'public/oauth.html', '/oauth.js': 'public/oauth.js' };
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
    clearInterval(tick); clearTimeout(updateTimer); clearTimeout(updateCheck); clearInterval(updateChecks); updater.close(); charity.disconnect(); twitch.disconnect(); ap.disconnect();
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
  return { server, store, engine, ap, charity, twitch, snapshot, close, integrationKey, rooms, vault, library, updater, url: `http://127.0.0.1:${server.address().port}` };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.AP_BRIDGE_PORT || 17381);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('AP_BRIDGE_PORT muss zwischen 1024 und 65535 liegen.');
  createApp({ port, updateRestart: true }).then(app => {
    console.log(`AP Chaos Bridge ${VERSION}\nOberfläche: ${app.url}\nStart: Testmodus, Warteschlange pausiert.\nBeenden: Strg+C oder Einstellungen > Tool beenden.`);
    process.on('SIGINT', () => app.close()); process.on('SIGTERM', () => app.close());
  }).catch(error => { console.error(error.code === 'EADDRINUSE' ? 'Port bereits belegt. Läuft die Bridge schon? http://127.0.0.1:' + port : error.message); process.exitCode = 1; });
}
