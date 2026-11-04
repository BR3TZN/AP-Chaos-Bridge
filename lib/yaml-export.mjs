import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parse } from 'yaml';

const marker = '.ap-chaos-bridge.json';
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 8);
export function yamlFolderName(value) {
  let name = String(value).normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '_').replace(/^[. ]+|[. ]+$/g, '').slice(0, 100).replace(/[. ]+$/g, '') || 'Raum';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = '_' + name;
  return name;
}
function normalFile(path) {
  if (!existsSync(path)) {
    // existsSync also returns false for dangling links.
    try { lstatSync(path); throw new Error('YAML-Ziel ist ein Link: ' + path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return false;
  }
  if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error('YAML-Ziel ist keine normale Datei: ' + path);
  return true;
}

export class YamlExport {
  constructor(directory, { memory = false } = {}) {
    Object.assign(this, { directory, memory }); this.path = join(directory, 'yaml-export.json');
    this.settings = !memory && existsSync(this.path) ? JSON.parse(readFileSync(this.path, 'utf8')) : { playersDirectory: '' };
  }
  update({ playersDirectory }) {
    if (typeof playersDirectory !== 'string' || playersDirectory.length > 2048 || /[\x00-\x1f]/.test(playersDirectory)) throw new Error('Einen vollständigen Pfad zum Archipelago-Players-Ordner eingeben.');
    const folder = playersDirectory.trim();
    if (folder && (!isAbsolute(folder) || !existsSync(folder) || !statSync(folder).isDirectory())) throw new Error('Der Players-Ordner muss ein vorhandener Ordner mit vollständigem Pfad sein.');
    const settings = { playersDirectory: folder ? resolve(folder) : '' };
    if (!this.memory) { mkdirSync(this.directory, { recursive: true }); writeFileSync(this.path + '.tmp', JSON.stringify(settings), { mode: 0o600 }); renameSync(this.path + '.tmp', this.path); }
    return this.settings = settings;
  }
  roomDirectory(room) {
    const root = this.settings.playersDirectory;
    if (!root) return '';
    const name = yamlFolderName(room.name);
    for (const candidate of [name, name + ' - ' + hash(room.id)]) {
      const folder = join(root, candidate);
      let info; try { info = lstatSync(folder); } catch (error) { if (error.code === 'ENOENT') return folder; throw error; }
      if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Der Raumordner ist kein normaler Ordner: ' + folder);
      const identity = join(folder, marker);
      if (!readdirSync(folder).length) return folder;
      if (normalFile(identity)) {
        let owner; try { owner = JSON.parse(readFileSync(identity, 'utf8')); } catch { throw new Error('Die Zuordnung des Raumordners ist beschädigt: ' + folder); }
        if (owner.schema === 1 && owner.roomId === room.id) return folder;
      }
    }
    throw new Error('Der Raumordner wird bereits von einem anderen Raum verwendet. Raumnamen ändern.');
  }
  status(room) {
    try { return { ...this.settings, roomDirectory: this.roomDirectory(room), error: '' }; }
    catch (error) { return { ...this.settings, roomDirectory: '', error: error.message }; }
  }
  save(room, files) {
    const root = this.settings.playersDirectory;
    if (!root) throw new Error('Zuerst unter Einstellungen einen Archipelago-Players-Ordner speichern.');
    if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error('Der gespeicherte Players-Ordner ist nicht erreichbar. Speicherort unter Einstellungen prüfen.');
    const folder = this.roomDirectory(room), names = new Set();
    // Stable slot filenames avoid duplicate slots when the player order changes
    // or games are exported separately into the same room.
    const entries = files.map(file => {
      const slot = parse(file.content).name;
      if (typeof slot !== 'string' || !slot) throw new Error('Die erzeugte YAML hat keinen eindeutigen Slotnamen.');
      const stem = yamlFolderName(slot), name = stem + (stem === slot ? '' : '-' + hash(slot)) + '.yaml';
      if (names.has(name.toLowerCase())) throw new Error('Die YAML-Dateinamen sind nicht eindeutig.');
      names.add(name.toLowerCase()); return { name, content: file.content };
    });
    entries.push({ name: marker, content: JSON.stringify({ schema: 1, roomId: room.id }) });
    mkdirSync(folder, { recursive: true });
    const staged = [], committed = [];
    try {
      for (const entry of entries) {
        const target = join(folder, entry.name), previous = normalFile(target) ? readFileSync(target) : null;
        const temp = join(folder, '.ap-' + randomUUID() + '.tmp');
        const item = { ...entry, target, temp, previous }; staged.push(item);
        writeFileSync(temp, entry.content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      }
      for (const item of staged) { renameSync(item.temp, item.target); committed.push(item); }
    } catch (error) {
      for (const item of committed.reverse()) {
        if (item.previous === null) rmSync(item.target, { force: true }); else writeFileSync(item.target, item.previous);
      }
      throw new Error('YAMLs konnten nicht gespeichert werden: ' + error.message, { cause: error });
    } finally { for (const item of staged) rmSync(item.temp, { force: true }); }
    return { directory: folder, files: entries.filter(entry => entry.name !== marker).map(entry => ({ name: entry.name, path: join(folder, entry.name) })) };
  }
}
