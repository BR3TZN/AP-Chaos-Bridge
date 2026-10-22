import WebSocket from 'ws';
import { text, PROFILES } from './model.mjs';

export function quoteAP(value) { return '"' + text(value, 300).replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"'; }
export function serverUrl(value) {
  const raw = text(value, 500);
  const explicit = /^(wss?|archipelago):\/\//i.test(raw);
  const url = new URL(explicit ? raw.replace(/^archipelago:\/\//i, 'ws://') : 'ws://' + raw);
  if (!explicit && !url.port) url.port = '38281';
  if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('AP-Adresse als ws:// oder wss:// ohne eingebettete Zugangsdaten eingeben.');
  return url.href;
}
function messageText(packet) { return (packet.data || []).map(p => typeof p.text === 'string' ? p.text : '').join(''); }
export class Archipelago {
  constructor({ log = () => {}, changed = () => {}, unsafe = () => {}, uuid = 'ap-chaos-bridge' } = {}) {
    this.log = log; this.changed = changed; this.unsafe = unsafe; this.uuid = uuid;
    this.connected = false; this.admin = false; this.players = []; this.catalogs = {}; this.state = 'disconnected'; this.demo = false;
    this.roomKey = ''; this.seed = ''; this.team = 0; this.generation = 0; this.pending = null; this.retry = 0;
  }
  status() { return { connected: this.connected, admin: this.admin, state: this.state, demo: this.demo, roomKey: this.roomKey, seed: this.seed, team: this.team, version: this.version, error: this.error || '', catalogGames: Object.keys(this.catalogs) }; }
  items(game) { return this.catalogs[game]?.item_name_to_id || {}; }
  disconnect() {
    this.generation++; this.stopped = true; clearTimeout(this.reconnectTimer); clearInterval(this.heartbeat); clearTimeout(this.handshake);
    this.socket?.close(); this.socket = null; this.connected = false; this.admin = false; this.state = 'disconnected'; this.demo = false;
    this.roomPassword = ''; this.adminPassword = '';
    if (this.pending) { clearTimeout(this.pending.timeout); this.pending.reject(new Error('Verbindung während Versand geschlossen; Zustellung unklar.')); this.pending = null; }
    this.unsafe(); this.changed();
  }
  connect(config, roomPassword = '', adminPassword = '') {
    this.disconnect();
    this.config = { ...config, url: serverUrl(config.url), slotName: text(config.slotName) };
    if (!this.config.slotName) throw new Error('Existierender Spieler-/Slotname fehlt.');
    if (typeof roomPassword !== 'string' || typeof adminPassword !== 'string' || /[\r\n\x00]/.test(roomPassword + adminPassword)) throw new Error('Ungültiges Passwort.');
    this.roomPassword = roomPassword; this.adminPassword = adminPassword; this.stopped = false; this.retry = 0; this.open();
  }
  open() {
    const gen = ++this.generation; this.demo = false; this.connected = false; this.admin = false; this.error = ''; this.state = 'connecting';
    this.players = []; this.catalogs = {}; this.changed();
    const ws = this.socket = new WebSocket(this.config.url, { perMessageDeflate: true, maxPayload: 32 * 1024 * 1024, handshakeTimeout: 12000 });
    this.handshake = setTimeout(() => { if (gen === this.generation && !this.connected) { this.error = 'AP-Handshake hat zu lange gedauert.'; ws.terminate(); } }, 15000);
    let alive = true;
    ws.on('open', () => {
      clearInterval(this.heartbeat);
      this.heartbeat = setInterval(() => { if (!alive) return ws.terminate(); alive = false; ws.ping(); }, 25000);
      this.heartbeat.unref?.();
    });
    ws.on('pong', () => { alive = true; });
    ws.on('message', data => {
      if (gen !== this.generation) return;
      try {
        const packets = JSON.parse(data.toString());
        if (!Array.isArray(packets)) throw new Error('AP-Paket ist keine Liste.');
        for (const p of packets) this.receive(p);
      } catch (e) { this.log('error', 'AP-Paket konnte nicht verarbeitet werden: ' + e.message); }
    });
    ws.on('error', error => { if (gen === this.generation) { this.error = 'AP-Verbindung: ' + error.message; this.changed(); } });
    ws.on('close', () => {
      if (gen !== this.generation) return;
      clearInterval(this.heartbeat); clearTimeout(this.handshake); this.connected = false; this.admin = false;
      if (this.pending) { clearTimeout(this.pending.timeout); this.pending.reject(new Error('AP-Verbindung verloren; Zustellung unklar.')); this.pending = null; }
      this.unsafe();
      if (this.stopped) this.state = 'disconnected';
      else { this.state = 'reconnecting'; this.reconnectTimer = setTimeout(() => this.open(), Math.min(30000, 1000 * 2 ** this.retry++)); }
      this.changed();
    });
  }
  send(packet) {
    if (this.socket?.readyState !== WebSocket.OPEN) throw new Error('AP-WebSocket ist nicht offen.');
    this.socket.send(JSON.stringify([packet]));
  }
  receive(p) {
    if (p.cmd === 'RoomInfo') {
      this.seed = p.seed_name; this.version = p.version; this.serverOffset = typeof p.time === 'number' ? p.time * 1000 - Date.now() : 0;
      if (this.config.expectedSeed && this.config.expectedSeed !== this.seed) {
        this.error = 'Seed stimmt nicht mit der eingetragenen Seed-ID überein.'; this.log('error', this.error); this.stopped = true; this.socket.close(); return;
      }
      this.config.expectedSeed ||= this.seed;
      this.roomKey = this.config.url + '|' + this.seed;
      this.send({ cmd: 'Connect', password: this.roomPassword || null, name: this.config.slotName, game: '', uuid: this.uuid,
        version: { major: 0, minor: 6, build: 8, class: 'Version' }, items_handling: 0, tags: ['TextOnly', 'APChaosBridge'], slot_data: false });
    } else if (p.cmd === 'Connected') {
      clearTimeout(this.handshake); this.team = p.team; this.slot = p.slot; this.connected = true; this.state = 'connected'; this.retry = 0;
      this.updatePlayers(p);
      const games = [...new Set(this.players.map(x => x.game).filter(Boolean))];
      this.send({ cmd: 'GetDataPackage', games });
      if (this.adminPassword) this.send({ cmd: 'Say', text: '!admin login ' + this.adminPassword });
      this.log('info', `AP verbunden · ${this.seed}. Warteschlange bleibt pausiert.`); this.changed();
    } else if (p.cmd === 'ConnectionRefused') {
      this.error = 'AP-Anmeldung abgelehnt: ' + (p.errors || []).join(', '); this.stopped = true; this.log('error', this.error); this.socket?.close();
    } else if (p.cmd === 'RoomUpdate') { this.updatePlayers(p); this.changed(); }
    else if (p.cmd === 'DataPackage') { this.catalogs = { ...this.catalogs, ...(p.data?.games || {}) }; this.changed(); }
    else if (p.cmd === 'PrintJSON') {
      const output = messageText(p);
      if (p.type === 'CommandResult' && output.includes('Login successful.')) { this.admin = true; this.log('info', 'AP-Admin angemeldet.'); this.changed(); }
      if (p.type === 'CommandResult' && /Password incorrect|Remote administration is disabled|must first login|Logout successful/i.test(output)) {
        this.admin = false; this.log('error', 'AP-Admin ist nicht verfügbar: ' + output); this.changed();
      }
      const pending = this.pending;
      if (pending?.kind === 'item' && !p.type && output === pending.expected) {
        clearTimeout(pending.timeout); this.pending = null;
        pending.resolve({ status: 'confirmed', detail: 'AP-Server bestätigt das zusätzliche Item. Ausführung im Spiel ist nicht quittiert.' });
      } else if (pending && ['AdminCommandResult', 'CommandResult'].includes(p.type) && /not find|not recognized|did you mean|must first login|incorrect|disabled|Unknown command|Error|Traceback|usage:/i.test(output)) {
        clearTimeout(pending.timeout); this.pending = null;
        const error = new Error('AP-Server hat abgelehnt: ' + output.slice(0, 400)); error.definitive = true;
        if (/must first login|incorrect|disabled/i.test(output)) this.admin = false;
        pending.reject(error);
      }
    } else if (p.cmd === 'InvalidPacket') {
      this.log('error', `AP lehnt Paket ab: ${p.original_cmd || ''} ${p.text || ''}`);
      if (this.pending) { clearTimeout(this.pending.timeout); const e = new Error('AP-Paket abgelehnt.'); e.definitive = true; this.pending.reject(e); this.pending = null; }
    }
  }
  updatePlayers(p) {
    if (p.slot_info) this.slotInfo = p.slot_info;
    if (p.players) this.networkPlayers = p.players;
    this.players = (this.networkPlayers || []).map(player => {
      const info = this.slotInfo?.[player.slot] || {};
      return { team: player.team, slot: player.slot, name: player.name, alias: player.alias, game: info.game || '', type: info.type ?? 1 };
    });
  }
  execute(job) {
    if (!this.connected || this.demo) throw new Error('Kein echter AP-Raum verbunden.');
    if (job.roomKey !== this.roomKey) throw new Error('Aktion gehört zu einem anderen Raum.');
    if (job.effect === 'message') return new Promise((resolve, reject) => {
      const message = text(job.message, 600);
      this.socket.send(JSON.stringify([{ cmd: 'Say', text: '[AP Chaos] ' + message }]), error => error ? reject(error) : resolve({ status: 'sent', detail: 'Nachricht an den AP-Raumchat gesendet.' }));
    });
    if (job.effect === 'deathlink') {
      return new Promise((resolve, reject) => {
        const packet = { cmd: 'Bounce', tags: ['DeathLink'], data: { time: (Date.now() + (this.serverOffset || 0)) / 1000, source: 'AP Chaos Bridge', cause: 'AP Chaos Bridge: ' + job.user + ' löst eine Zuschaueraktion aus.' } };
        this.socket.send(JSON.stringify([packet]), error => error ? reject(error) : resolve({ status: 'sent', detail: 'DeathLink an eigenes Team gesendet. Keine Bestätigung der Spielclients verfügbar.' }));
      });
    }
    if (!this.admin) { const e = new Error('AP-Admin nicht angemeldet.'); e.definitive = true; throw e; }
    if (!Object.hasOwn(this.items(job.game), job.item)) { const e = new Error('Item fehlt im Raumkatalog.'); e.definitive = true; throw e; }
    if (this.pending) throw new Error('Vorheriger AP-Versand wartet noch auf Bestätigung.');
    const player = this.players.find(p => p.team === job.team && p.slot === job.slot);
    const aliases = this.players.filter(p => p.name.toLowerCase() === job.targetName.toLowerCase());
    if (!player || aliases.length !== 1) { const e = new Error('Zielname nicht eindeutig oder Slot fehlt.'); e.definitive = true; throw e; }
    const expectedName = player.alias && player.alias !== player.name ? `${player.alias} (${player.name})` : player.name;
    if (job.effect === 'hint') return new Promise((resolve, reject) => {
      this.socket.send(JSON.stringify([{ cmd: 'Say', text: `!admin /hint ${quoteAP(job.targetName)} ${quoteAP(job.item)}` }]), error => error ? reject(error) : resolve({ status: 'sent', detail: 'Hinweis für das Item angefordert. Hinweise erscheinen im AP-Client; keine zusätzliche Item-Zustellung.' }));
    });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.pending = null; reject(new Error('Keine eindeutige AP-Serverbestätigung. Zustellung unklar; nicht automatisch wiederholen.')); }, 8000);
      this.pending = { kind: 'item', expected: `Cheat console: sending "${job.item}" to ${expectedName}`, resolve, reject, timeout };
      try { this.send({ cmd: 'Say', text: `!admin /send ${quoteAP(job.targetName)} ${quoteAP(job.item)}` }); }
      catch (error) { clearTimeout(timeout); this.pending = null; reject(error); }
    });
  }
  loadDemo() {
    this.disconnect(); this.demo = true; this.state = 'demo'; this.connected = true; this.seed = 'DEMO-NUR-SIMULATION'; this.roomKey = 'demo|' + this.seed; this.team = 0;
    this.players = Object.keys(PROFILES).map((game, i) => ({ team: 0, slot: i + 1, name: ['Stardew-Demo', 'Factorio-Demo', 'KH2-Demo'][i], alias: '', game, type: 1 }));
    this.catalogs = Object.fromEntries(Object.entries(PROFILES).map(([game, p]) => [game, { item_name_to_id: Object.fromEntries(p.traps.map((item, i) => [item, i + 1])) }]));
    this.changed();
  }
}
