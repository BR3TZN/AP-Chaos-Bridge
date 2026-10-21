import { randomUUID } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, openSync, writeSync, fsyncSync, closeSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { parseAllDocuments } from 'yaml';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
export const SOURCES = ['charity', 'twitch', 'external', 'manual', 'any'];
export const TYPES = ['donation', 'sub', 'resub', 'gift_sub', 'cheer', 'channel_points', 'manual', 'any'];
export const EFFECTS = ['random_trap', 'random_item', 'random_action', 'item', 'deathlink'];
export const PROFILES = {
  'Stardew Valley': {
    description: 'Fallen aus deinem YAML und dem offiziellen Itemkatalog. Erst im Raum abgleichen und im Spiel testen.',
    traps: ['Babies Trap', 'Bark Trap', 'Benjamin Budton Trap', 'Bomb Trap', 'Burnt Trap', 'Darkness Trap', 'Debris Trap', 'Drought Trap', 'Frozen Trap', 'Inflation Trap', 'Jinxed Trap', 'Meow Trap', 'Monsters Trap', 'Nauseated Trap', 'Nudge Trap', 'Pariah Trap', 'Random Teleport Trap', 'Shuffle Trap', 'Slimed Trap', 'Taxes Trap', 'The Crows Trap', 'Time Flies Trap', 'Weakness Trap'],
    source: 'https://github.com/ArchipelagoMW/Archipelago/blob/0.6.8/worlds/stardew_valley/data/items.csv',
  },
  'Factorio': {
    description: 'AP-Fallen; können dauerhaft die Fabrik oder mehrere Spieler derselben Spielwelt betreffen. YAML-Poolanzahl 0 ist keine Live-Sperre.',
    traps: ['Attack Trap', 'Evolution Trap', 'Teleport Trap', 'Grenade Trap', 'Cluster Grenade Trap', 'Artillery Trap', 'Atomic Rocket Trap', 'Atomic Cliff Remover Trap', 'Inventory Spill Trap'],
    source: 'https://github.com/ArchipelagoMW/Archipelago/blob/0.6.8/worlds/factorio/data/mod_template/control.lua',
  },
  'Kingdom Hearts 2': {
    description: 'Kein belegter Fallenkatalog. Items nur aus dem Raumkatalog wählen. DeathLink benötigt den passenden Client und aktivierte Teilnahme.',
    traps: [],
    source: 'https://github.com/ArchipelagoMW/Archipelago/blob/0.6.8/worlds/kh2/ClientStuff/Client.py',
  },
};

export function initialState() {
  return {
    schema: 1, installationId: randomUUID(),
    config: {
      mode: 'test', paused: true, globalCooldownSec: 5, maxQueue: 200, eventMaxAgeSec: 300, queueTtlSec: 900,
      deathLinkArmed: false,
      ap: { url: '', slotName: '', expectedSeed: '' },
      charity: { slug: '', project: 'charityroyale2026' },
      twitch: { clientId: '', broadcasterId: '', events: ['channel.subscribe', 'channel.subscription.gift', 'channel.cheer', 'channel.channel_points_custom_reward_redemption.add'] },
      rememberConnections: true, autoConnect: { ap: false, charity: false, twitch: false },
    },
    rules: [{ id: randomUUID(), name: 'Charity · Zufällige Falle', enabled: false, source: 'charity', type: 'donation', action: 'random-trap', minimumCents: 1000, minimumUnits: 0, rewardId: '', effect: 'random_trap', target: 'random', game: '', item: '', quantity: 1, cooldownSec: 20 }],
    approvals: {}, queue: [], events: [], logs: [], seen: {}, cooldowns: {}, lastDispatch: 0, yamlProfiles: [], players: [], yamlPresets: {},
  };
}

export class Store {
  constructor(directory, { memory = false } = {}) {
    this.directory = directory; this.memory = memory; this.path = join(directory, 'state.json');
    if (!memory) mkdirSync(directory, { recursive: true });
    if (!memory && existsSync(this.path)) {
      try { this.state = JSON.parse(readFileSync(this.path, 'utf8')); }
      catch { throw new Error('data/state.json ist beschädigt. Start abgebrochen; Datei für Wiederherstellung sichern.'); }
      if (this.state.schema !== 1) throw new Error('Unbekannte Datenversion. Bestehende Daten wurden nicht verändert.');
    } else this.state = initialState();
    this.state.players ||= []; this.state.yamlPresets = Object.assign(Object.create(null), this.state.yamlPresets || {});
    this.state.config.rememberConnections ??= true;
    this.state.config.autoConnect ||= { ap: false, charity: false, twitch: false };
    this.state.config.mode = 'test'; this.state.config.paused = true; this.state.config.deathLinkArmed = false;
    for (const job of this.state.queue) if (job.status === 'dispatching') {
      job.status = 'uncertain'; job.detail = 'Neustart während Versand. Keine automatische Wiederholung.';
    }
    this.save();
  }
  save() {
    if (this.memory) return;
    const tmp = this.path + '.tmp'; const fd = openSync(tmp, 'w', 0o600);
    try { writeSync(fd, JSON.stringify(this.state, null, 2)); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(tmp, this.path);
  }
  log(level, message) {
    this.state.logs.unshift({ id: randomUUID(), at: Date.now(), level, message: String(message).slice(0, 1500) });
    this.state.logs = this.state.logs.slice(0, 300); this.save();
  }
}

export function number(value, min, max, fallback) {
  const n = Number(value ?? fallback);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Zahl muss zwischen ${min} und ${max} liegen.`);
  return n;
}
export function text(value, max = 200) {
  if (typeof value !== 'string') throw new Error('Text erwartet.');
  if (value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw new Error('Text ist zu lang oder enthält Steuerzeichen.');
  return value.trim();
}
export function normalizeRule(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Ungültige Regel.');
  const r = {
    id: typeof raw.id === 'string' && /^[\w-]{1,80}$/.test(raw.id) ? raw.id : randomUUID(),
    name: text(raw.name || 'Neue Regel', 100), enabled: raw.enabled === true,
    source: raw.source, type: raw.type, action: text(raw.action || ''),
    minimumCents: number(raw.minimumCents, 0, 100000000, 0), minimumUnits: number(raw.minimumUnits, 0, 10000000, 0),
    rewardId: text(raw.rewardId || ''), effect: raw.effect, target: text(raw.target || 'random', 100),
    game: text(raw.game || ''), item: text(raw.item || '', 300), quantity: number(raw.quantity, 1, 5, 1),
    cooldownSec: number(raw.cooldownSec, 0, 86400, 20),
    targetKeys: Array.isArray(raw.targetKeys) ? [...new Set(raw.targetKeys.map(k => text(k, 30)))] : [],
    includeDeathLink: raw.includeDeathLink === true,
  };
  if (!SOURCES.includes(r.source) || !TYPES.includes(r.type) || !EFFECTS.includes(r.effect)) throw new Error('Unbekannte Ereignisquelle, Ereignisart oder Aktion.');
  if (!Number.isInteger(r.quantity) || !Number.isInteger(r.minimumCents) || !Number.isInteger(r.minimumUnits)) throw new Error('Menge, Cent und Einheiten müssen ganze Zahlen sein.');
  if (r.effect === 'item' && !r.item) throw new Error('Itemname fehlt.');
  if (r.effect === 'deathlink') { r.target = 'group'; r.quantity = 1; }
  else if (!['random', 'all', 'selected', 'random_selected'].includes(r.target) && !/^\d+:\d+$/.test(r.target)) throw new Error('Ungültiger Zielslot.');
  if (r.targetKeys.length > 100 || r.targetKeys.some(k => !/^\d+:\d+$/.test(k)) || (['selected', 'random_selected'].includes(r.target) && !r.targetKeys.length)) throw new Error('Mindestens einen gültigen Zielslot wählen.');
  return r;
}
export function matches(rule, event) {
  return rule.enabled && (rule.source === 'any' || rule.source === event.source)
    && (rule.type === 'any' || rule.type === event.type)
    && (!rule.action || rule.action === event.action)
    && (!rule.rewardId || rule.rewardId === event.rewardId)
    && event.amountCents >= rule.minimumCents && event.units >= rule.minimumUnits;
}
export function parseYamlProfiles(source) {
  if (typeof source !== 'string' || Buffer.byteLength(source) > 262144) throw new Error('YAML darf höchstens 256 KB groß sein.');
  const documents = parseAllDocuments(source, { uniqueKeys: true, schema: 'core', customTags: [] });
  if (documents.length > 20) throw new Error('Höchstens 20 YAML-Dokumente pro Import.');
  return documents.map(doc => {
    if (doc.errors.length) throw new Error('YAML: ' + doc.errors[0].message.slice(0, 200));
    const d = doc.toJS({ maxAliasCount: 50 });
    if (!d || typeof d !== 'object') throw new Error('YAML benötigt name und game.');
    let game = d.game;
    if (game && typeof game === 'object') {
      const choices = Object.entries(game).filter(([, w]) => Number(w) > 0);
      if (choices.length !== 1) throw new Error('Gewichtete Spielauswahl: endgültiges Spiel erst nach der Generierung festlegen. Keine automatische Auswahl.');
      game = choices[0][0];
    }
    game = text(game, 200);
    const name = typeof d.name === 'string' ? text(d.name) : '(gewichteter Name; im Raum zuordnen)';
    const opts = d[game] || {}; const death = opts.death_link ?? opts.DeathLink ?? opts.deathlink;
    const deathLink = death == null ? 'unknown' : (typeof death === 'object' ? 'weighted' : (/^(true|1|on|enabled)$/i.test(String(death)) ? 'on' : (/^(false|0|off|disabled)$/i.test(String(death)) ? 'off' : 'unknown')));
    const distribution = opts.trap_distribution;
    const traps = distribution && typeof distribution === 'object' ? Object.keys(distribution).slice(0, 200).map(x => text(x, 300)) : PROFILES[game]?.traps || [];
    return { id: randomUUID(), name, game, deathLink, traps, hasGenerationTriggers: Boolean(opts.triggers || d.triggers), weightedName: typeof d.name !== 'string' || /[{}]/.test(name), quantity: d.quantity ?? 1, importedAt: Date.now() };
  });
}
