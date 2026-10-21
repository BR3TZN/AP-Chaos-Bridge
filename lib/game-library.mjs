import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseAllDocuments, parseDocument, stringify } from 'yaml';
import { text } from './model.mjs';
import { readZip } from './zip.mjs';

const human = key => key.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
const infer = (key, value, description = '') => ({ key, label: human(key), description, group: 'Vorlage', kind: typeof value === 'boolean' ? 'toggle' : typeof value === 'number' ? 'number' : value && typeof value === 'object' ? 'json' : 'text', default: value });
export class GameLibrary {
  constructor(directory, appRoot, { memory = false } = {}) {
    Object.assign(this, { directory, appRoot, memory }); this.path = join(directory, 'game-library.json');
    this.data = !memory && existsSync(this.path) ? JSON.parse(readFileSync(this.path, 'utf8')) : { games: {}, folder: join(appRoot, 'apworlds'), hashes: {} };
    this.data.games = Object.assign(Object.create(null), this.data.games);
    for (const file of ['kh2.yaml', 'factorio.yaml', 'stardew.yaml']) {
      const path = join(appRoot, 'examples', file);
      if (existsSync(path)) this.importYaml(readFileSync(path, 'utf8'), 'Mitgelieferte YAML-Vorlage', false);
    }
  }
  save() {
    if (this.memory) return;
    mkdirSync(this.directory, { recursive: true });
    writeFileSync(this.path + '.tmp', JSON.stringify(this.data, null, 2), { mode: 0o600 }); renameSync(this.path + '.tmp', this.path);
  }
  list() { return { folder: this.data.folder, python: this.python || '', games: Object.values(this.data.games).map(({ base, ...game }) => ({ ...game, optionCount: game.options.length })) }; }
  get(game) { const entry = this.data.games[game]; if (!entry) throw new Error('Für dieses Spiel zuerst eine YAML-Vorlage oder APworld importieren.'); return entry; }
  importYaml(raw, source = 'YAML-Import', replace = true) {
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > 1024 * 1024) throw new Error('YAML-Vorlage ist zu groß.');
    const docs = parseAllDocuments(raw, { uniqueKeys: true, schema: 'core' });
    if (docs.length > 100) throw new Error('Höchstens 100 YAML-Vorlagen gleichzeitig.');
    const pending = [];
    for (const doc of docs) {
      if (doc.errors.length) throw new Error('YAML: ' + doc.errors[0].message);
      const base = doc.toJS({ maxAliasCount: 50 });
      if (!base || typeof base.game !== 'string' || !base.game.trim()) throw new Error('YAML-Vorlage benötigt einen eindeutigen game-Namen.');
      const game = text(base.game), values = base[game] || {};
      if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Spieleinstellungen müssen ein YAML-Objekt sein.');
      if (!replace && this.data.games[game]) continue;
      const prior = this.data.games[game];
      const options = Object.entries(values).map(([key, value]) => prior?.options.find(o => o.key === key) || infer(key, value, doc.getIn([game, key], true)?.commentBefore || ''));
      const traps = Object.keys(values.trap_distribution || {}).filter(x => typeof x === 'string');
      pending.push({ game, base, options, traps, source, unresolved: [], kind: 'yaml', importedAt: Date.now() });
    }
    for (const entry of pending) this.data.games[entry.game] = entry;
    this.save(); return pending.map(x => x.game);
  }
  pythonCommand() {
    if (this.pythonArgs) return this.pythonArgs;
    const candidates = process.env.AP_BRIDGE_PYTHON ? [[process.env.AP_BRIDGE_PYTHON]] : process.platform === 'win32' ? [['py', '-3'], ['python'], ['python3']] : [['python3'], ['python']];
    for (const args of candidates) {
      const result = spawnSync(args[0], [...args.slice(1), '-c', 'import sys;sys.exit(0 if sys.version_info >= (3,10) else 1)'], { timeout: 5000, windowsHide: true });
      if (result.status === 0) { this.python = args.join(' '); return this.pythonArgs = args; }
    }
    throw new Error('APworld-Analyse benötigt Python 3.10 oder neuer. Python installieren und Bridge neu starten; YAML-Vorlagen funktionieren auch ohne Python.');
  }
  importWorld(bytes, filename) {
    const files = readZip(bytes), args = this.pythonCommand();
    const result = spawnSync(args[0], [...args.slice(1), join(this.appRoot, 'scripts', 'inspect_apworld.py')], { input: JSON.stringify({ files }), encoding: 'utf8', timeout: 30000, maxBuffer: 10 * 1024 * 1024, windowsHide: true });
    if (result.error) throw new Error('APworld-Analyse: ' + result.error.message);
    let data; try { data = JSON.parse(result.stdout); } catch { throw new Error('APworld konnte mit diesem Python nicht analysiert werden.'); }
    if (result.status !== 0 || data.error) throw new Error(data.error || 'APworld-Analyse fehlgeschlagen.');
    const embedded = files.filter(f => /\.ya?ml$/i.test(f.name));
    for (const file of embedded) { try { this.importYaml(file.text, filename + ': ' + file.name, false); } catch { /* Only player YAMLs are templates. */ } }
    if (!data.worlds.length) throw new Error('Kein statisch deklarierter World-Spielname gefunden. Eine vom APworld erzeugte YAML-Vorlage importieren.');
    for (const world of data.worlds) {
      const prior = this.data.games[world.game], base = prior?.base || { name: 'Player', game: world.game };
      const defaults = Object.fromEntries(world.options.filter(o => Object.hasOwn(o, 'default')).map(o => [o.key, o.default]));
      base[world.game] = { ...defaults, ...(base[world.game] || {}) };
      this.data.games[world.game] = { ...world, base, traps: [...new Set([...(world.traps || []), ...(prior?.traps || [])])], kind: 'apworld', source: basename(filename), importedAt: Date.now(), warnings: data.warnings };
    }
    this.save(); return data.worlds.map(w => w.game);
  }
  async scan(folder = this.data.folder) {
    const directory = resolve(text(folder, 1000));
    if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
    const files = readdirSync(directory, { withFileTypes: true }).filter(f => f.isFile() && /\.(?:apworld|ya?ml)$/i.test(f.name));
    if (files.length > 500) throw new Error('Höchstens 500 Dateien im APworld-Ordner.');
    const report = { imported: [], unchanged: 0, errors: [] }; this.data.folder = directory;
    for (const file of files) {
      try {
        const bytes = readFileSync(join(directory, file.name));
        const hash = createHash('sha256').update(bytes).digest('hex'), id = join(directory, file.name);
        if (this.data.hashes[id] === hash) { report.unchanged++; continue; }
        const games = /\.apworld$/i.test(file.name) ? this.importWorld(bytes, file.name) : this.importYaml(bytes.toString('utf8'), file.name);
        this.data.hashes[id] = hash; report.imported.push({ file: file.name, games });
      } catch (e) { report.errors.push({ file: file.name, error: e.message }); }
      await new Promise(resolve => setImmediate(resolve));
    }
    this.save(); return report;
  }
  upload({ name, content }) {
    const filename = text(name, 200);
    if (basename(filename) !== filename || !/^[\w .()+-]+\.(apworld|ya?ml)$/i.test(filename)) throw new Error('Dateiname muss auf .apworld oder .yaml enden.');
    if (typeof content !== 'string' || content.length > 56 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(content)) throw new Error('Datei ist zu groß oder ungültig.');
    const bytes = Buffer.from(content, 'base64');
    const games = /\.apworld$/i.test(filename) ? this.importWorld(bytes, filename) : this.importYaml(bytes.toString('utf8'), filename);
    mkdirSync(this.data.folder, { recursive: true }); writeFileSync(join(this.data.folder, filename), bytes);
    this.data.hashes[join(this.data.folder, filename)] = createHash('sha256').update(bytes).digest('hex'); this.save(); return { games };
  }
  generate({ game, values = {}, players, extra = '' }) {
    const entry = this.get(game);
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Spieleinstellungen fehlen.');
    if (!Array.isArray(players) || !players.length || players.length > 100) throw new Error('1 bis 100 Spielernamen eintragen.');
    const names = players.map(name => text(name, 16));
    if (names.some(n => !n || /[{}]/.test(n)) || new Set(names.map(n => n.toLowerCase())).size !== names.length) throw new Error('Eindeutige Slotnamen mit 1 bis 16 Zeichen verwenden; keine Platzhalter.');
    let extras = {};
    if (extra.trim()) {
      const doc = parseDocument(extra, { uniqueKeys: true, schema: 'core' });
      if (doc.errors.length) throw new Error('Zusatzoptionen: ' + doc.errors[0].message);
      extras = doc.toJS({ maxAliasCount: 50 });
      if (!extras || typeof extras !== 'object' || Array.isArray(extras)) throw new Error('Zusatzoptionen müssen ein YAML-Objekt sein.');
    }
    const known = new Map(entry.options.map(o => [o.key, o]));
    for (const [key, value] of Object.entries(values)) {
      const option = known.get(key); if (!option) throw new Error('Unbekannte Formularoption: ' + key);
      if (option.kind === 'toggle' && typeof value !== 'boolean') throw new Error(option.label + ': Ja oder Nein wählen.');
      if (option.kind === 'choice' && !option.choices.some(c => c.value === value) && value !== 'random') throw new Error(option.label + ': ungültige Auswahl.');
      if (option.kind === 'range' && !(typeof value === 'string' && ['random', 'random-low', 'random-middle', 'random-high', ...(option.special || [])].includes(value)) && (!Number.isInteger(value) || value < option.min || value > option.max)) throw new Error(option.label + ': Wert außerhalb des Bereichs.');
      if (['dict', 'set', 'list'].includes(option.kind) && (option.kind === 'dict' ? !value || typeof value !== 'object' || Array.isArray(value) : !Array.isArray(value))) throw new Error(option.label + ': ungültiges JSON-Format.');
    }
    return names.map((name, i) => {
      const base = structuredClone(entry.base); base.name = name; base.game = game; delete base.quantity;
      base[game] = { ...(base[game] || {}), ...values, ...extras };
      return { name: String(i + 1).padStart(2, '0') + '-' + name.replace(/[^\p{L}\p{N}_-]/gu, '_') + '.yaml', content: '# AP Chaos Bridge · ' + entry.source.replace(/[\r\n]/g, ' ') + '\n' + stringify(base, { lineWidth: 110 }) };
    });
  }
}
