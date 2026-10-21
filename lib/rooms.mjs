import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store, text } from './model.mjs';

export class Rooms {
  constructor(store, directory, { memory = false } = {}) {
    Object.assign(this, { store, directory, memory }); this.cache = new Map();
    this.path = join(directory, 'rooms.json');
    this.manifest = !memory && existsSync(this.path) ? JSON.parse(readFileSync(this.path, 'utf8')) : { active: 'default', rooms: [{ id: 'default', name: 'Mein Multiworld', game: '' }] };
    if (!this.manifest.rooms.some(r => r.id === this.manifest.active)) throw new Error('Gespeicherter Raum fehlt.');
    this.id = this.manifest.active;
    if (this.id !== 'default') this.install(this.load(this.id));
    this.save();
  }
  location(id) { return id === 'default' ? this.directory : join(this.directory, 'rooms', id); }
  load(id) {
    if (this.memory && this.cache.has(id)) return this.cache.get(id);
    return new Store(this.location(id), { memory: this.memory });
  }
  install(next) { this.store.state = next.state; this.store.directory = next.directory; this.store.path = next.path; }
  save() {
    if (this.memory) return;
    mkdirSync(this.directory, { recursive: true });
    writeFileSync(this.path + '.tmp', JSON.stringify(this.manifest, null, 2), { mode: 0o600 });
    renameSync(this.path + '.tmp', this.path);
  }
  list() { return { active: this.id, rooms: this.manifest.rooms }; }
  create({ name, game = '' }) {
    if (this.manifest.rooms.length >= 100) throw new Error('Höchstens 100 Räume.');
    const room = { id: randomUUID(), name: text(name, 100), game: text(game, 200) };
    if (!room.name) throw new Error('Raumname fehlt.');
    const next = new Store(this.location(room.id), { memory: this.memory });
    this.cache.set(room.id, next); this.manifest.rooms.push(room); this.save(); return room;
  }
  rename({ id, name, game = '' }) {
    const room = this.manifest.rooms.find(r => r.id === id);
    if (!room) throw new Error('Raum fehlt.');
    const nextName = text(name, 100), nextGame = text(game, 200);
    if (!nextName) throw new Error('Raumname fehlt.');
    room.name = nextName; room.game = nextGame;
    this.save(); return room;
  }
  activate(id) {
    if (!this.manifest.rooms.some(r => r.id === id)) throw new Error('Raum fehlt.');
    if (id === this.id) return;
    this.store.save();
    this.cache.set(this.id, { state: this.store.state, directory: this.store.directory, path: this.store.path });
    const next = this.load(id); this.install(next);
    this.store.state.config.mode = 'test'; this.store.state.config.paused = true; this.store.state.config.deathLinkArmed = false;
    this.id = id; this.manifest.active = id; this.store.save(); this.save();
  }
}
