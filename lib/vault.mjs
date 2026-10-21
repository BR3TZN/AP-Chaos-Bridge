import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

export const SECRET_MASK = '••••••••';
export class Vault {
  constructor(directory, { memory = false } = {}) {
    this.directory = directory; this.memory = memory; this.entries = {};
    if (memory) return;
    mkdirSync(directory, { recursive: true });
    this.path = join(directory, 'connections.enc');
    const keyPath = join(directory, 'connections.key');
    if (!existsSync(keyPath)) {
      if (existsSync(this.path)) throw new Error('Schlüssel für gespeicherte Verbindungen fehlt.');
      writeFileSync(keyPath, randomBytes(32), { mode: 0o600, flag: 'wx' });
    }
    this.key = readFileSync(keyPath);
    if (existsSync(this.path)) {
      try {
        const bytes = readFileSync(this.path), decipher = createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, 12));
        decipher.setAuthTag(bytes.subarray(12, 28));
        this.entries = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString());
      } catch { throw new Error('Gespeicherte Verbindungen konnten nicht entschlüsselt werden.'); }
    }
  }
  get(room) { return this.entries[room] || {}; }
  update(room, values) { this.entries[room] = { ...this.get(room), ...values }; this.save(); }
  save() {
    if (this.memory) return;
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(this.entries)), cipher.final()]);
    writeFileSync(this.path + '.tmp', Buffer.concat([iv, cipher.getAuthTag(), encrypted]), { mode: 0o600 });
    renameSync(this.path + '.tmp', this.path);
  }
  status(room) {
    const e = this.get(room);
    return { roomPassword: Boolean(e.roomPassword), adminPassword: Boolean(e.adminPassword), twitchToken: Boolean(e.twitchToken), twitchRefresh: Boolean(e.twitchRefresh), twitchSecret: Boolean(e.twitchSecret) };
  }
  resolve(room, key, value) {
    if (value === SECRET_MASK || value === undefined) return this.get(room)[key] || '';
    if (typeof value !== 'string' || value.length > 2000 || /[\x00-\x1f\x7f]/.test(value)) throw new Error('Ungültige Zugangsdaten.');
    return value;
  }
}
