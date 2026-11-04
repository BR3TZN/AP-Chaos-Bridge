import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { text } from './model.mjs';

export const GAME_PRESET_LIMIT = 2 * 1024 * 1024;
const FILE_LIMIT = 32 * 1024 * 1024;
const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
export function gamePresetRevision(entry) {
  const optionKeys = ['key', 'kind', 'default', 'min', 'max', 'special', 'specialValues', 'validKeys'];
  const schema = { game: entry.game, kind: entry.kind, coreVersion: entry.coreVersion, worldVersion: entry.worldVersion, minimumAPVersion: entry.minimumAPVersion,
    base: entry.base?.[entry.game], requires: entry.base?.requires,
    options: entry.options.map(option => ({ ...Object.fromEntries(optionKeys.filter(key => Object.hasOwn(option, key)).map(key => [key, option[key]])), choices: option.choices?.map(choice => choice.value), listChoices: option.listChoices?.map(choice => choice.value) })) };
  return createHash('sha256').update(JSON.stringify(ordered(schema))).digest('hex');
}
export class GamePresets {
  constructor(directory, { memory = false } = {}) {
    this.directory = directory; this.memory = memory; this.path = join(directory, 'game-presets.json'); this.presets = [];
    if (!memory && existsSync(this.path)) {
      if (statSync(this.path).size > FILE_LIMIT) throw new Error('Die Spiel-Preset-Datei ist zu groß.');
      const saved = JSON.parse(readFileSync(this.path, 'utf8'));
      if (saved.schema !== 1 || !Array.isArray(saved.presets) || saved.presets.some(preset => !preset.id || !preset.game || !preset.name || !preset.revision || !preset.sourceRevision || !preset.values || typeof preset.extra !== 'string')) throw new Error('Die gespeicherten Spiel-Presets sind beschädigt.');
      this.presets = saved.presets;
    }
  }
  list() { return this.presets.map(({ id, name, game, revision, sourceRevision, sourceId, sourceLabel, sourceKind, updatedAt }) => ({ id, name, game, revision, sourceRevision, sourceId, sourceLabel, sourceKind, updatedAt })).sort((a, b) => a.name.localeCompare(b.name, 'de')); }
  get(id, game) { const preset = this.presets.find(preset => preset.id === id && preset.game === game); if (!preset) throw new Error('Spiel-Preset fehlt. Liste neu laden.'); return structuredClone(preset); }
  compatible(preset, entry) { if (preset.game !== entry.game || preset.sourceRevision !== gamePresetRevision(entry)) throw new Error('Das Preset gehört zu einer anderen Einstellungsquelle oder World-Version. Die passende Quelle wählen oder ein neues Preset speichern.'); }
  checkRevision(preset, revision) { if (preset.revision !== revision) throw new Error('Das Spiel-Preset wurde inzwischen geändert. Liste neu laden und erneut auswählen.'); }
  save({ id, expectedRevision, name, values, extra = '' }, entry) {
    const title = text(name, 100).normalize('NFC'); if (!title) throw new Error('Einen Namen für das Spiel-Preset eintragen.');
    if (!values || typeof values !== 'object' || Array.isArray(values) || typeof extra !== 'string') throw new Error('Ungültige Spieleinstellungen.');
    const sourceRevision = gamePresetRevision(entry), previous = id ? this.get(id, entry.game) : null;
    if (previous) { this.checkRevision(previous, expectedRevision); this.compatible(previous, entry); }
    if (this.presets.some(preset => preset.id !== id && preset.game === entry.game && preset.sourceRevision === sourceRevision && preset.name.toLocaleLowerCase('de') === title.toLocaleLowerCase('de'))) throw new Error('Für dieses Spiel gibt es bereits ein Preset mit diesem Namen. Einen anderen Namen wählen oder das vorhandene Preset aktualisieren.');
    if (!previous && (this.presets.length >= 200 || this.presets.filter(preset => preset.game === entry.game).length >= 50)) throw new Error('Höchstens 50 Presets pro Spiel und 200 insgesamt speichern.');
    const settings = JSON.stringify({ values, extra }); if (Buffer.byteLength(settings) > GAME_PRESET_LIMIT) throw new Error('Ein Spiel-Preset darf höchstens 2 MiB groß sein.');
    const preset = { id: previous?.id || randomUUID(), name: title, game: entry.game, revision: randomUUID(), sourceRevision, sourceId: entry.sourceId, sourceLabel: entry.source || entry.game, sourceKind: entry.kind,
      createdAt: previous?.createdAt || Date.now(), updatedAt: Date.now(), ...JSON.parse(settings) };
    const next = previous ? this.presets.map(value => value.id === id ? preset : value) : [...this.presets, preset];
    this.persist(next); this.presets = next; return structuredClone(preset);
  }
  remove({ id, game, expectedRevision }) { const preset = this.get(id, game); this.checkRevision(preset, expectedRevision); const next = this.presets.filter(preset => preset.id !== id); this.persist(next); this.presets = next; }
  persist(presets) {
    const serialized = JSON.stringify({ schema: 1, presets }); if (Buffer.byteLength(serialized) > FILE_LIMIT) throw new Error('Die Spiel-Presets sind zusammen zu groß. Nicht benötigte Presets löschen.');
    if (this.memory) return; mkdirSync(this.directory, { recursive: true });
    writeFileSync(this.path + '.tmp', serialized, { mode: 0o600 }); renameSync(this.path + '.tmp', this.path);
  }
}
