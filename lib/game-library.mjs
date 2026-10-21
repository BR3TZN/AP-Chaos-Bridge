import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join, basename, resolve, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseDocument, Document, visit } from 'yaml';
import { text } from './model.mjs';
import { readZip } from './zip.mjs';

const human = key => key.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
export function apworldFiles(directory) {
  const files = [], pending = [{ path: directory, prefix: '', depth: 0 }]; let directories = 0;
  while (pending.length) {
    const next = pending.pop();
    if (++directories > 10000 || next.depth > 12) throw new Error('APworld-Ordner enthält zu viele Unterordner.');
    for (const entry of readdirSync(next.path, { withFileTypes: true })) {
      const name = next.prefix + entry.name, path = join(next.path, entry.name);
      if (entry.isDirectory()) pending.push({ path, prefix: name + '/', depth: next.depth + 1 });
      else if (entry.isFile() && /\.apworld$/i.test(entry.name)) { files.push({ name, path }); if (files.length > 2000) throw new Error('Höchstens 2000 APworld-Dateien.'); }
    }
  }
  return files.sort((a, b) => Number(b.name.includes('/')) - Number(a.name.includes('/')) || a.name.localeCompare(b.name));
}
const hashOf = bytes => createHash('sha256').update(bytes).digest('hex');
function stringifyArchipelago(value) {
  const document = new Document(value, { version: '1.1' });
  // PyYAML needs an explicit float tag for exponent forms such as 9e-7.
  visit(document, { Scalar(key, node) { if (typeof node.value === 'number' && /e/i.test(String(node.value))) node.tag = 'tag:yaml.org,2002:float'; } });
  return document.toString({ lineWidth: 110 });
}
function rangeToken(value, option) {
  if (typeof value !== 'string') return false;
  if (['random', 'random-low', 'random-middle', 'random-high', ...(option.special || [])].includes(value)) return true;
  const match = /^random-range(?:-(?:low|middle|high))?-(-?\d+)-(-?\d+)$/.exec(value);
  return Boolean(match && +match[1] >= option.min && +match[2] <= option.max && +match[1] <= +match[2]);
}
export class GameLibrary {
  constructor(directory, appRoot, { memory = false, folder } = {}) {
    Object.assign(this, { directory, appRoot, memory }); this.path = join(directory, 'game-library.json');
    this.data = !memory && existsSync(this.path) ? JSON.parse(readFileSync(this.path, 'utf8')) : { games: {}, folder: join(appRoot, 'apworlds'), hashes: {} };
    this.data.games = Object.assign(Object.create(null), Object.fromEntries(Object.entries(this.data.games).filter(([, g]) => g.kind === 'apworld')));
    this.data.hashes ||= {}; this.data.fileGames ||= {}; if (folder) this.data.folder = resolve(folder);
    if (!memory && resolve(this.data.folder) === resolve(join(appRoot, 'apworlds'))) this.loadBundled();
  }
  loadBundled() {
    const path = join(this.appRoot, 'assets', 'apworld-settings.json'); if (!existsSync(path)) return;
    const cache = JSON.parse(readFileSync(path, 'utf8')); if (cache.schema !== 1) return;
    for (const [name, data] of Object.entries(cache.files || {}).sort(([a], [b]) => Number(b.includes('/')) - Number(a.includes('/')) || a.localeCompare(b))) {
      if (isAbsolute(name) || /[\\:]/.test(name) || name.split('/').some(p => !p || p === '.' || p === '..') || !/\.apworld$/i.test(name)) continue;
      const file = join(this.data.folder, name); if (!existsSync(file) || hashOf(readFileSync(file)) !== data.sha256) continue;
      for (const world of data.worlds) {
        if ((this.data.games[world.game]?.importedAt || 0) > cache.generatedAt) continue;
        this.data.games[world.game] = this.entry(world, name, data.warnings, cache.generatedAt);
      }
      this.data.hashes[file] = data.sha256; this.data.fileGames[file] = data.worlds.map(world => world.game);
    }
  }
  entry(world, filename, warnings = [], importedAt = Date.now()) {
    const defaults = Object.fromEntries(world.options.filter(o => Object.hasOwn(o, 'default')).map(o => [o.key, o.default]));
    const base = { name: 'Player', game: world.game, [world.game]: defaults };
    if (/^\d+\.\d+\.\d+$/.test(world.minimumAPVersion || '')) base.requires = { version: world.minimumAPVersion };
    return { ...world, base, kind: 'apworld', source: filename.replaceAll('\\', '/'), importedAt, warnings };
  }
  save() {
    if (this.memory) return;
    mkdirSync(this.directory, { recursive: true });
    writeFileSync(this.path + '.tmp', JSON.stringify(this.data, null, 2), { mode: 0o600 }); renameSync(this.path + '.tmp', this.path);
  }
  list() { return { folder: this.data.folder, python: this.python || '', games: Object.values(this.data.games).map(({ base, ...game }) => ({ ...game, optionCount: game.options.length })) }; }
  get(game) { const entry = this.data.games[game]; if (!entry) throw new Error('Für dieses Spiel zuerst die .apworld-Datei hinzufügen.'); return entry; }
  pythonCommand() {
    if (this.pythonArgs) return this.pythonArgs;
    const candidates = process.env.AP_BRIDGE_PYTHON ? [[process.env.AP_BRIDGE_PYTHON]] : process.platform === 'win32' ? [['py', '-3'], ['python'], ['python3']] : [['python3'], ['python']];
    for (const args of candidates) {
      const result = spawnSync(args[0], [...args.slice(1), '-c', 'import sys;sys.exit(0 if sys.version_info >= (3,10) else 1)'], { timeout: 5000, windowsHide: true });
      if (result.status === 0) { this.python = args.join(' '); return this.pythonArgs = args; }
    }
    throw new Error('APworld-Analyse benötigt Python 3.10 oder neuer. Für neue Dateien Python installieren; vorbereitete APworld-Einstellungen funktionieren auch ohne Python.');
  }
  importWorld(bytes, filename) {
    const files = readZip(bytes, { worldOnly: true }), args = this.pythonCommand();
    const result = spawnSync(args[0], [...args.slice(1), '-X', 'utf8', join(this.appRoot, 'scripts', 'inspect_apworld.py')], { input: JSON.stringify({ files }), encoding: 'utf8', timeout: 30000, maxBuffer: 10 * 1024 * 1024, windowsHide: true });
    if (result.error) throw new Error('APworld-Analyse: ' + result.error.message);
    let data; try { data = JSON.parse(result.stdout); } catch { throw new Error('APworld konnte mit diesem Python nicht analysiert werden.'); }
    if (result.status !== 0 || data.error) throw new Error(data.error || 'APworld-Analyse fehlgeschlagen.');
    if (!data.worlds.length) throw new Error('Kein statisch deklarierter World-Spielname gefunden. Diese APworld benötigt eine Erweiterung der Analyse.');
    for (const world of data.worlds) this.data.games[world.game] = this.entry(world, filename, data.warnings);
    this.save(); return data.worlds.map(w => w.game);
  }
  async scan(folder = this.data.folder) {
    const directory = resolve(text(folder, 1000));
    if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
    const files = apworldFiles(directory), fileOrder = new Map(); files.forEach((file, i) => fileOrder.set(file.name, i));
    const report = { imported: [], unchanged: 0, errors: [] }, activeGames = new Set(); this.data.folder = directory;
    for (const [game, entry] of Object.entries(this.data.games)) if (!fileOrder.has(entry.source)) delete this.data.games[game];
    for (const file of files) {
      try {
        const bytes = readFileSync(file.path);
        const hash = createHash('sha256').update(bytes).digest('hex'), id = join(directory, file.name);
        const preferOwn = !file.name.includes('/') && (!this.data.fileGames[id] || this.data.fileGames[id].some(game => (fileOrder.get(this.data.games[game]?.source) ?? -1) < fileOrder.get(file.name)));
        const missingEntry = !this.data.fileGames[id] || this.data.fileGames[id].some(game => !this.data.games[game]);
        if (this.data.hashes[id] === hash && !preferOwn && !missingEntry) { this.data.fileGames[id].forEach(game => activeGames.add(game)); report.unchanged++; continue; }
        const games = this.importWorld(bytes, file.name);
        this.data.hashes[id] = hash; this.data.fileGames[id] = games; games.forEach(game => activeGames.add(game)); report.imported.push({ file: file.name, games });
      } catch (e) {
        for (const [game, entry] of Object.entries(this.data.games)) if (entry.source === file.name) delete this.data.games[game];
        delete this.data.hashes[file.path]; delete this.data.fileGames[file.path];
        report.errors.push({ file: file.name, error: e.message });
      }
      await new Promise(resolve => setImmediate(resolve));
    }
    for (const game of Object.keys(this.data.games)) if (!activeGames.has(game)) delete this.data.games[game];
    this.save(); return report;
  }
  upload({ name, content }) {
    const filename = text(name, 200);
    if (basename(filename) !== filename || !/^[\w .()+-]+\.apworld$/i.test(filename)) throw new Error('Dateiname muss auf .apworld enden.');
    if (typeof content !== 'string' || content.length > 56 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(content)) throw new Error('Datei ist zu groß oder ungültig.');
    const bytes = Buffer.from(content, 'base64');
    const games = this.importWorld(bytes, filename);
    mkdirSync(this.data.folder, { recursive: true }); writeFileSync(join(this.data.folder, filename), bytes);
    this.data.hashes[join(this.data.folder, filename)] = createHash('sha256').update(bytes).digest('hex'); this.data.fileGames[join(this.data.folder, filename)] = games; this.save(); return { games };
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
      if (['choice', 'textchoice'].includes(option.kind) && !(option.kind === 'textchoice' && typeof value === 'string') && !option.choices.some(c => c.value === value) && value !== 'random') throw new Error(option.label + ': ungültige Auswahl.');
      if (option.kind === 'range' && !rangeToken(value, option) && !(option.specialValues || []).includes(value) && (!Number.isInteger(value) || value < option.min || value > option.max)) throw new Error(option.label + ': Wert außerhalb des Bereichs.');
      if (['dict', 'set', 'list'].includes(option.kind) && (option.kind === 'dict' ? !value || typeof value !== 'object' || Array.isArray(value) : !Array.isArray(value))) throw new Error(option.label + ': ungültiges JSON-Format.');
    }
    return names.map((name, i) => {
      const base = structuredClone(entry.base); base.name = name; base.game = game; delete base.quantity;
      base[game] = { ...(base[game] || {}), ...values, ...extras };
      return { name: String(i + 1).padStart(2, '0') + '-' + name.replace(/[^\p{L}\p{N}_-]/gu, '_') + '.yaml', content: '# AP Chaos Bridge · ' + entry.source.replace(/[\r\n]/g, ' ') + '\n' + stringifyArchipelago(base) };
    });
  }
}
