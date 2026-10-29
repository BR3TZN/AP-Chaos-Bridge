import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

export const helpRevision = entry => createHash('sha256').update(JSON.stringify([entry.game, entry.sourceId, entry.options])).digest('hex');
const digest = text => createHash('sha256').update(text).digest('hex');
// Invalidate pre-glossary translations once, including persisted machine output.
export const HELP_GLOSSARY_REVISION = 2;
export function normalizeHelpLanguage(raw) {
  if (!['de', 'en'].includes(raw)) throw new Error('Deutsch oder English für die Spielbeschreibungen auswählen.');
  return raw;
}
export class HelpLanguage {
  constructor(directory, { memory = false } = {}) {
    Object.assign(this, { directory, memory }); this.path = join(directory, 'language.json'); this.language = 'de';
    if (!memory && existsSync(this.path)) this.language = normalizeHelpLanguage(JSON.parse(readFileSync(this.path, 'utf8')).language);
  }
  update(raw) {
    const language = normalizeHelpLanguage(raw.language);
    if (!this.memory) { mkdirSync(this.directory, { recursive: true }); writeFileSync(this.path + '.tmp', JSON.stringify({ language }), { mode: 0o600 }); renameSync(this.path + '.tmp', this.path); }
    return this.language = language;
  }
}

// Preserve values that a user may need to type literally, as well as numbers,
// links and game protocol names. Translate prose, never a YAML document.
const protectedText = /`[^`\r\n]+`|https?:\/\/[^\s<>]+|\{[^{}\r\n]+\}|\b[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+\b|\b(?:[Cc]hecks|[Cc]heckpoints?|[Ss]eeds?|[Ii]tems?|[Rr]andomizers?|APworlds?|YAML|DeathLink|Deathlink|ItemLink|Archipelago|Grainsanity|FLIK|APKEEP[A-Z]+|true|false|null|random(?:-(?:low|middle|high|range(?:-\d+){0,2}))?)\b|\b[Cc]heck\b(?!\s+(?:if|whether|that|this|the|for|your|out)\b)|(?<![A-Za-z0-9])'[^'\r\n]+'(?![A-Za-z0-9])|"[^"\r\n]+"|[+-]?\d+(?:[.,/]\d+)*(?:%|\b)/gi;
const helpTerm = value => ({ check: 'Checkpoint', checks: 'Checkpoints', checkpoint: 'Checkpoint', checkpoints: 'Checkpoints', seed: 'Seed', seeds: 'Seeds', item: 'Item', items: 'Items', randomizer: 'Randomizer', randomizers: 'Randomizers' })[value.toLowerCase()] || value;
const glossaryText = text => text.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/).map((part, index) => index % 2 ? part : part.replace(protectedText, helpTerm)).join('');
export function protectHelpText(text) {
  const values = []; let serial = 0;
  const letters = n => { let out = ''; do { out = String.fromCharCode(65 + n % 26) + out; n = Math.floor(n / 26) - 1; } while (n >= 0); return out; };
  const prepared = text.replace(protectedText, value => { const token = 'APKEEP' + letters(serial++); values.push({ token, value: helpTerm(value) }); return token; });
  return { text: prepared, restore(translated) {
    const tokens = (translated.match(/APKEEP[A-Z]+/gi) || []).map(token => token.toUpperCase());
    for (const { token } of values) if (tokens.filter(found => found === token).length !== 1) throw new Error('Ein technischer Wert konnte in der Übersetzung nicht erhalten werden.');
    return translated.replace(/APKEEP[A-Z]+/gi, token => values.find(item => item.token === token.toUpperCase())?.value ?? token);
  } };
}
const german = text => {
  const de = (text.match(/\b(?:und|nicht|werden|wird|für|einen|einem|diese|dieser|kann|Spieler|aktivieren|aktiviert|wähle)\b/gi) || []).length;
  const en = (text.match(/\b(?:the|this|that|with|when|from|must|enable|changes|will|your|all)\b/gi) || []).length;
  return de >= 2 && de > en || /[äöüß]/i.test(text) && de >= en && (de > 0 || text.trim().split(/\s+/).length <= 3);
};
const worthTranslating = text => /[a-z]{2}/i.test(text) && !german(text);

export class HelpTranslator {
  constructor(directory, appRoot, { memory = false, runBatch, modelFolder = join(appRoot, 'assets/translation-models') } = {}) {
    Object.assign(this, { directory, appRoot, memory, modelFolder }); this.runBatch = runBatch;
    this.manifest = JSON.parse(readFileSync(join(appRoot, 'assets/help-translation-model.json'), 'utf8'));
    this.dictionary = JSON.parse(readFileSync(join(appRoot, 'assets/help-translations.de.json'), 'utf8')).strings;
    this.cache = new Map(); this.cacheBytes = 0; this.pending = new Map(); this.serial = 0; this.queue = Promise.resolve(); this.closed = false;
    this.path = join(directory, 'help-translations.json');
    if (!memory) try { if (statSync(this.path).size <= 12 * 1024 ** 2) { const saved = JSON.parse(readFileSync(this.path, 'utf8')); if (saved.schema === 1 && saved.glossary === HELP_GLOSSARY_REVISION && saved.model === this.manifest.id && Array.isArray(saved.entries)) for (const [key, value] of saved.entries.slice(-8000)) if (/^[a-f0-9]{64}$/.test(key) && typeof value === 'string' && value.length < 30000) this.remember(key, value); } } catch {}
  }
  status() { return { local: true, installed: this.manifest.files.every(file => existsSync(join(this.modelFolder, file.name))), model: this.manifest.id }; }
  async initialize() {
    if (this.runBatch) return;
    if (this.initializing) return this.initializing;
    if (this.worker) return;
    this.initializing = this.startWorker();
    try { return await this.initializing; } finally { this.initializing = null; }
  }
  async startWorker() {
    if (this.closed) throw new Error('Übersetzung wurde beendet.');
    const buffers = {};
    for (const file of this.manifest.files) {
      let bytes; try { bytes = await readFile(join(this.modelFolder, file.name)); } catch { throw new Error('Das lokale Übersetzungsmodell fehlt. Das vollständige Programmpaket installieren oder node scripts/prepare_translation_model.mjs ausführen.'); }
      if (bytes.length !== file.size || digest(bytes) !== file.sha256) throw new Error('Das lokale Übersetzungsmodell ist beschädigt. Das Programmpaket erneut installieren.');
      buffers[file.part] = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
    if (this.closed) throw new Error('Übersetzung wurde beendet.');
    const worker = this.worker = new Worker(new URL('./help-translation-worker.cjs', import.meta.url));
    this.worker.on('message', ({ id, result, error }) => { const request = this.pending.get(id); if (!request) return; this.pending.delete(id); clearTimeout(request.timeout); if (!this.pending.size) worker.unref(); error ? request.reject(new Error(error.message)) : request.resolve(result); });
    const fail = error => { if (this.worker !== worker) return; for (const request of this.pending.values()) { clearTimeout(request.timeout); request.reject(error); } this.pending.clear(); this.worker = null; };
    this.worker.on('error', fail); this.worker.on('exit', code => { if (!this.closed && (code || this.pending.size)) fail(new Error('Die lokale Übersetzungs-Engine wurde beendet.')); });
    this.worker.unref();
    try {
      await this.call('initialize', { cacheSize: 2048, useNativeIntGemm: false });
      await this.call('loadTranslationModel', { from: 'en', to: 'de' }, { model: buffers.model, shortlist: buffers.lex, vocabs: [buffers.vocab] });
    } catch (error) { if (this.worker === worker) { this.worker = null; void worker.terminate(); } throw error; }
  }
  call(name, ...args) {
    if (!this.worker || this.closed) return Promise.reject(new Error('Übersetzungs-Engine ist nicht verfügbar.'));
    this.worker.ref();
    return new Promise((resolve, reject) => { const id = ++this.serial; const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error('Die lokale Übersetzung hat zu lange gedauert.')); void this.worker?.terminate(); this.worker = null; }, 45000); timeout.unref?.(); this.pending.set(id, { resolve, reject, timeout }); this.worker.postMessage({ id, name, args }); });
  }
  async engine(texts) {
    const results = this.runBatch ? await this.runBatch(texts) : (await this.call('translate', { models: [{ from: 'en', to: 'de' }], texts: texts.map(text => ({ text, html: false, qualityScores: false })) })).map(result => result.target.text);
    if (results.length !== texts.length || results.some(result => typeof result !== 'string' || !result.trim())) throw new Error('Die Übersetzungs-Engine hat eine unvollständige Antwort geliefert.');
    return results;
  }
  async translateLines(texts) {
    const prepared = texts.map(protectHelpText), results = await this.engine(prepared.map(item => item.text));
    const restored = [];
    for (let index = 0; index < results.length; index++) {
      try { restored.push(prepared[index].restore(results[index])); }
      catch {
        // If the model drops a placeholder, keep protected fragments outside
        // the model entirely rather than showing altered technical values.
        const source = texts[index], pieces = []; let position = 0;
        for (const match of source.matchAll(protectedText)) { pieces.push({ prose: source.slice(position, match.index) }, { literal: helpTerm(match[0]) }); position = match.index + match[0].length; }
        pieces.push({ prose: source.slice(position) });
        for (const piece of pieces) if (piece.prose && worthTranslating(piece.prose)) {
          const [, before, body, after] = piece.prose.match(/^(\s*)([\s\S]*?)(\s*)$/);
          piece.prose = before + (await this.engine([body]))[0] + after;
        }
        restored.push(pieces.map(piece => piece.literal ?? piece.prose).join(''));
      }
    }
    return restored;
  }
  async text(original) {
    if (!original) return original;
    if (Object.hasOwn(this.dictionary, original)) return glossaryText(this.dictionary[original]);
    if (!worthTranslating(original)) return glossaryText(original);
    const key = digest(original), cached = this.cache.get(key); if (cached !== undefined) return cached;
    const fenced = original.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/);
    if (fenced.length > 1) { for (let index = 0; index < fenced.length; index += 2) fenced[index] = await this.text(fenced[index]); return this.remember(key, fenced.join('')); }
    // Keep paragraph boundaries, indentation and bullet prefixes exactly. Large
    // descriptions are processed in short lines so the CPU worker stays bounded.
    const pieces = original.split(/(\r?\n)/), lines = [], slots = [];
    for (let index = 0; index < pieces.length; index++) if (worthTranslating(pieces[index])) {
      const match = pieces[index].match(/^(\s*(?:[-*•]\s+)?)((?:.|\r)*?)(\s*)$/);
      const body = match[2], chunks = []; let chunk = '';
      for (const word of body.match(/\S+\s*/g) || [body]) { if (chunk && chunk.length + word.length > 900) { chunks.push(chunk); chunk = ''; } chunk += word; }
      if (chunk) chunks.push(chunk);
      slots.push({ index, prefix: match[1], suffix: match[3], start: lines.length, count: chunks.length }); lines.push(...chunks);
    } else pieces[index] = glossaryText(pieces[index]);
    const translated = [];
    if (lines.length) await this.initialize();
    for (let offset = 0; offset < lines.length; offset += 8) translated.push(...await this.translateLines(lines.slice(offset, offset + 8)));
    for (const slot of slots) pieces[slot.index] = slot.prefix + translated.slice(slot.start, slot.start + slot.count).join(' ') + slot.suffix;
    return this.remember(key, pieces.join(''));
  }
  remember(key, value) {
    if (this.cache.has(key)) this.cacheBytes -= Buffer.byteLength(this.cache.get(key)) + 64;
    this.cache.set(key, value); this.cacheBytes += Buffer.byteLength(value) + 64;
    while (this.cache.size > 8000 || this.cacheBytes > 8 * 1024 ** 2) { const oldest = this.cache.keys().next().value; this.cacheBytes -= Buffer.byteLength(this.cache.get(oldest)) + 64; this.cache.delete(oldest); }
    return value;
  }
  translate(entry, { language = 'de', indices } = {}) {
    normalizeHelpLanguage(language);
    if (!Array.isArray(indices) || !indices.length || indices.length > 16 || new Set(indices).size !== indices.length || indices.some(index => !Number.isSafeInteger(index) || index < 0 || index >= entry.options.length)) throw new Error('Bis zu 16 vorhandene Spieleinstellungen zur Übersetzung auswählen.');
    const job = async () => {
      if (this.closed) throw new Error('Übersetzung wurde beendet.');
      const options = [];
      for (const index of indices) {
        const option = entry.options[index], tr = text => language === 'en' ? Promise.resolve(text) : this.text(text);
        options.push({ index, key: option.key, label: await tr(option.label), description: await tr(option.description || ''), listDescriptions: await Promise.all((option.listChoices || []).map(choice => tr(choice.description || ''))) });
      }
      if (!this.memory && this.cache.size) { mkdirSync(this.directory, { recursive: true }); writeFileSync(this.path + '.tmp', JSON.stringify({ schema: 1, model: this.manifest.id, glossary: HELP_GLOSSARY_REVISION, entries: [...this.cache] }), { mode: 0o600 }); renameSync(this.path + '.tmp', this.path); }
      return { revision: helpRevision(entry), language, options };
    };
    const result = this.queue.then(job); this.queue = result.catch(() => {}); return result;
  }
  close() { this.closed = true; for (const request of this.pending.values()) { clearTimeout(request.timeout); request.reject(new Error('Übersetzung wurde beendet.')); } this.pending.clear(); void this.worker?.terminate(); this.worker = null; }
}
