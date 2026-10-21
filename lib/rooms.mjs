import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store, text } from './model.mjs';

const validId = id => typeof id === 'string' && /^(?:default|[a-f0-9-]{36})$/.test(id);
export class Rooms {
  static initialDirectory(directory, { memory = false } = {}) {
    const path = join(directory, 'rooms.json');
    if (memory || !existsSync(path)) return directory;
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    if (!validId(manifest.active)) throw new Error('Ungültiger gespeicherter Raum.');
    return manifest.active === 'default' ? directory : join(directory, 'rooms', manifest.active);
  }
  constructor(store, directory, { memory = false } = {}) {
    Object.assign(this, { store, directory, memory }); this.cache = new Map();
    this.path = join(directory, 'rooms.json');
    this.manifest = !memory && existsSync(this.path) ? JSON.parse(readFileSync(this.path, 'utf8')) : { active: 'default', rooms: [{ id: 'default', name: 'Mein Multiworld', game: '', archived: false }] };
    for (const room of this.manifest.rooms) { this.location(room.id); room.archived = room.archived === true; }
    this.id = this.manifest.active; const room = this.require(this.id);
    if (room.archived) { const next = this.fallback(this.id); this.id = this.manifest.active = next.id; }
    if (this.store.directory !== this.location(this.id)) this.install(this.load(this.id));
    this.save();
  }
  require(id, { activeOnly = false } = {}) {
    const room = this.manifest.rooms.find(r => r.id === id);
    if (!room) throw new Error('Raum fehlt.');
    if (activeOnly && room.archived) throw new Error('Archivierten Raum zuerst wiederherstellen.');
    return room;
  }
  location(id) { if (!validId(id)) throw new Error('Ungültige Raum-ID.'); return id === 'default' ? this.directory : join(this.directory, 'rooms', id); }
  load(id) { if (this.memory && this.cache.has(id)) return this.cache.get(id); return new Store(this.location(id), { memory: this.memory }); }
  install(next) { this.store.state = next.state; this.store.directory = next.directory; this.store.path = next.path; }
  save() {
    if (this.memory) return;
    mkdirSync(this.directory, { recursive: true });
    writeFileSync(this.path + '.tmp', JSON.stringify(this.manifest, null, 2), { mode: 0o600 }); renameSync(this.path + '.tmp', this.path);
  }
  list() { return { active: this.id, rooms: this.manifest.rooms }; }
  create({ name, game = '' }) {
    if (this.manifest.rooms.filter(r => !r.archived).length >= 100) throw new Error('Höchstens 100 aktive Räume.');
    const room = { id: randomUUID(), name: text(name, 100), game: text(game, 200), archived: false };
    if (!room.name) throw new Error('Raumname fehlt.');
    const next = new Store(this.location(room.id), { memory: this.memory });
    this.cache.set(room.id, next); this.manifest.rooms.push(room); this.save(); return room;
  }
  rename({ id, name, game = '' }) {
    const room = this.require(id), nextName = text(name, 100), nextGame = text(game, 200);
    if (!nextName) throw new Error('Raumname fehlt.');
    room.name = nextName; room.game = nextGame; this.save(); return room;
  }
  fallback(exclude) { return this.manifest.rooms.find(r => !r.archived && r.id !== exclude) || this.create({ name: 'Neuer Raum' }); }
  archive(id, archived) {
    const room = this.require(id);
    if (typeof archived !== 'boolean') throw new Error('Archivstatus fehlt.');
    if (archived && id === this.id) throw new Error('Geöffneten Raum zuerst wechseln.');
    if (!archived && room.archived && this.manifest.rooms.filter(r => !r.archived).length >= 100) throw new Error('Höchstens 100 aktive Räume.');
    room.archived = archived; if (archived) room.archivedAt = Date.now(); else delete room.archivedAt;
    this.save(); return room;
  }
  remove(id) {
    this.require(id); if (id === this.id) throw new Error('Geöffneten Raum zuerst wechseln.');
    if (!this.memory) {
      if (id === 'default') { for (const file of ['state.json', 'state.json.tmp']) rmSync(join(this.directory, file), { force: true }); }
      else rmSync(this.location(id), { recursive: true, force: true });
    }
    this.cache.delete(id); this.manifest.rooms = this.manifest.rooms.filter(r => r.id !== id); this.save();
  }
  activate(id) {
    this.require(id, { activeOnly: true }); if (id === this.id) return;
    this.store.save(); this.cache.set(this.id, { state: this.store.state, directory: this.store.directory, path: this.store.path });
    this.install(this.load(id));
    this.store.state.config.mode = 'test'; this.store.state.config.paused = true; this.store.state.config.deathLinkArmed = false;
    this.id = id; this.manifest.active = id; this.store.save(); this.save();
  }
}
