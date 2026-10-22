import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export const DEFAULT_APPEARANCE = { mode: 'dark', accent: '#a3bffa', motion: true };
export const DEFAULT_ALERTS = { enabled: true, showTests: true, showText: true, animation: 'slide', position: 'bottom-left', durationSec: 6.5, mediaSize: 120, media: '', layout: 'card' };
const mediaName = /^[a-f0-9]{64}\.(gif|png|webp|webm|mp4)$/;
export function normalizeAppearance(raw = {}, prior = DEFAULT_APPEARANCE) {
  const mode = raw.mode ?? prior.mode, accent = raw.accent ?? prior.accent;
  if (!['dark', 'light', 'classic'].includes(mode) || !/^#[a-f0-9]{6}$/i.test(accent)) throw new Error('Design: Modus und sechsstellige HEX-Farbe wählen.');
  return { mode, accent: accent.toLowerCase(), motion: raw.motion === undefined ? prior.motion : raw.motion === true };
}
export function normalizeAlerts(raw = {}, prior = DEFAULT_ALERTS) {
  const value = { ...DEFAULT_ALERTS, ...prior };
  for (const key of ['enabled', 'showTests', 'showText']) if (raw[key] !== undefined) value[key] = raw[key] === true;
  for (const [key, choices] of Object.entries({ animation: ['slide', 'fade', 'pop'], position: ['bottom-left', 'bottom-right', 'top-left', 'top-right', 'center'], layout: ['card', 'media'] })) {
    if (raw[key] !== undefined) { if (!choices.includes(raw[key])) throw new Error('Ungültige Alert-Einstellung: ' + key); value[key] = raw[key]; }
  }
  for (const [key, min, max] of [['durationSec', 2, 30], ['mediaSize', 48, 480]]) if (raw[key] !== undefined) {
    const number = Number(raw[key]); if (!Number.isFinite(number) || number < min || number > max) throw new Error(key + ': Wert außerhalb des Bereichs.'); value[key] = number;
  }
  if (raw.media !== undefined) { if (raw.media !== '' && !mediaName.test(raw.media)) throw new Error('Nur hochgeladene Alert-Medien verwenden.'); value.media = raw.media; }
  return value;
}
export class Presentation {
  constructor(directory, { memory = false } = {}) {
    this.directory = directory; this.memory = memory; this.path = join(directory, 'appearance.json'); this.mediaDirectory = join(directory, 'alert-media'); this.media = new Map();
    this.appearance = normalizeAppearance(!memory && existsSync(this.path) ? JSON.parse(readFileSync(this.path, 'utf8')) : {});
  }
  update(raw) {
    this.appearance = normalizeAppearance(raw, this.appearance);
    if (!this.memory) { mkdirSync(this.directory, { recursive: true }); writeFileSync(this.path + '.tmp', JSON.stringify(this.appearance), { mode: 0o600 }); renameSync(this.path + '.tmp', this.path); }
    return this.appearance;
  }
  upload({ content }) {
    if (typeof content !== 'string' || content.length > 14 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(content)) throw new Error('Alert-Datei darf höchstens 10 MiB groß sein.');
    const bytes = Buffer.from(content, 'base64'); if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error('Alert-Datei darf höchstens 10 MiB groß sein.');
    const head = bytes.subarray(0, 16), signature = head.toString('hex'); let extension;
    if (/^GIF8[79]a/.test(head.toString('ascii'))) extension = 'gif';
    else if (signature.startsWith('89504e470d0a1a0a')) extension = 'png';
    else if (head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP') extension = 'webp';
    else if (signature.startsWith('1a45dfa3')) extension = 'webm';
    else if (bytes.length >= 12 && head.toString('ascii', 4, 8) === 'ftyp') extension = 'mp4';
    if (!extension) throw new Error('GIF, PNG/APNG, WebP, WebM oder MP4 auswählen.');
    const name = createHash('sha256').update(bytes).digest('hex') + '.' + extension;
    if (this.memory) this.media.set(name, bytes);
    else { mkdirSync(this.mediaDirectory, { recursive: true }); writeFileSync(join(this.mediaDirectory, name), bytes, { mode: 0o600 }); }
    return { name, url: '/alert-media/' + name, type: this.type(name), bytes: bytes.length };
  }
  type(name) { return { gif: 'image/gif', png: 'image/png', webp: 'image/webp', webm: 'video/webm', mp4: 'video/mp4' }[name.split('.').at(-1)]; }
  has(name) { return mediaName.test(name) && (this.memory ? this.media.has(name) : existsSync(join(this.mediaDirectory, name))); }
  get(name) {
    if (!mediaName.test(name)) return null;
    const bytes = this.memory ? this.media.get(name) : existsSync(join(this.mediaDirectory, name)) ? readFileSync(join(this.mediaDirectory, name)) : null;
    return bytes ? { bytes, type: this.type(name) } : null;
  }
}
