import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeRule, text, VERSION } from './model.mjs';

export const RULE_IMPORT_LIMIT = 32 * 1024 * 1024;
export const targetKeys = rule => ['selected', 'random_selected'].includes(rule.target) ? rule.targetKeys || [] : /^\d+:\d+$/.test(rule.target) ? [rule.target] : [];
export function captureTargets(rule, players = []) {
  return targetKeys(rule).map(key => {
    const player = players.find(player => `${player.team}:${player.slot}` === key);
    return player ? { key, name: player.name, game: player.game } : rule.targetPlayers?.find(player => player.key === key) || { key, name: '', game: '' };
  });
}
export function channelIdentities(config) {
  const twitch = config.twitch || {};
  return [...(twitch.clientId || twitch.channelName || twitch.broadcasterId ? [{ ...twitch, id: 'default' }] : []), ...(twitch.channels || [])]
    .map(channel => ({ id: channel.id, channelName: channel.channelName || '', broadcasterId: channel.broadcasterId || '' }));
}
export function exportRules({ rules, config = {}, players = [], room = {} }, ids) {
  if (ids !== undefined && (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => !rules.some(rule => rule.id === id)))) throw new Error('Gültige Regeln für den Export auswählen.');
  const selected = ids ? rules.filter(rule => ids.includes(rule.id)) : rules;
  if (selected.length > 100) throw new Error('Höchstens 100 Regeln pro Vorlage.');
  const normalized = selected.map(rule => normalizeRule({ ...rule, targetPlayers: captureTargets(rule, players) }));
  return { kind: 'ap-chaos-bridge-rules', schema: 1, version: VERSION, exportedAt: Date.now(), room: { id: room.id || '', name: room.name || '' },
    channels: channelIdentities(config).filter(channel => normalized.some(rule => rule.twitchChannelId === channel.id)), rules: normalized };
}
export function parseRules(value) {
  if (!value || value.schema !== 1 || !Array.isArray(value.rules) || !value.rules.length || value.rules.length > 100 || value.kind && value.kind !== 'ap-chaos-bridge-rules') throw new Error('Eine Regelvorlage oder einen Bridge-Konfigurationsexport mit 1 bis 100 Regeln verwenden.');
  const rules = value.rules.map(normalizeRule);
  if (new Set(rules.map(rule => rule.id)).size !== rules.length) throw new Error('Die Vorlage enthält doppelte Regel-IDs.');
  const channels = value.kind === 'ap-chaos-bridge-rules' ? value.channels || [] : channelIdentities(value.config || {});
  if (!Array.isArray(channels) || channels.length > 20) throw new Error('Ungültige Twitch-Kanäle in der Regelvorlage.');
  return { kind: 'ap-chaos-bridge-rules', schema: 1, rules, channels: channels.map(channel => ({ id: text(channel.id, 80), channelName: text(channel.channelName || '', 25), broadcasterId: text(channel.broadcasterId || '', 80) })), room: { name: text(value.room?.name || '', 100) } };
}
export function planRules(value, { players = [], channels = [], ids } = {}) {
  const bundle = parseRules(value);
  if (ids !== undefined && (!Array.isArray(ids) || !ids.length || ids.some(id => !bundle.rules.some(rule => rule.id === id)))) throw new Error('Mindestens eine gültige Regel auswählen.');
  return bundle.rules.filter(rule => !ids || ids.includes(rule.id)).map(rule => {
    const notes = [...rule.reviewNotes], mapped = new Map();
    for (const reference of captureTargets(rule)) {
      const matches = reference.name ? players.filter(player => player.name === reference.name && (!reference.game || reference.game === player.game)) : [];
      if (matches.length === 1) mapped.set(reference.key, `${matches[0].team}:${matches[0].slot}`);
      else notes.push(`Spieler ${reference.name || 'aus Slot ' + reference.key} ist im Zielraum nicht eindeutig zugeordnet. Ziele in der Regel prüfen.`);
    }
    let channelId = rule.twitchChannelId;
    if (channelId) {
      const original = bundle.channels.find(channel => channel.id === channelId);
      const matches = original ? channels.filter(channel => original.broadcasterId && channel.broadcasterId ? channel.broadcasterId === original.broadcasterId : original.channelName && channel.channelName?.toLowerCase() === original.channelName.toLowerCase()) : [];
      if (matches.length === 1) channelId = matches[0].id;
      else { channelId = 'import-' + randomUUID(); notes.push(`Twitch-Kanal ${original?.channelName ? '@' + original.channelName : 'aus der Vorlage'} fehlt im Zielraum. Kanal${rule.rewardId ? ' und Kanalpunkte-Belohnung' : ''} in der Regel zuordnen.`); }
    } else if (rule.rewardId) notes.push('Die Kanalpunkte-Belohnung der Vorlage gilt für ihren ursprünglichen Twitch-Kanal. Belohnung im Zielraum prüfen.');
    const result = normalizeRule({ ...rule, id: randomUUID(), enabled: false, twitchChannelId: channelId,
      target: mapped.get(rule.target) || rule.target, targetKeys: rule.targetKeys.map(key => mapped.get(key) || key), reviewNotes: [...new Set(notes)],
      targetPlayers: rule.targetPlayers.map(player => ({ ...player, key: mapped.get(player.key) || player.key })) });
    return { sourceId: rule.id, rule: result, notes: result.reviewNotes };
  });
}

export class RuleLibrary {
  constructor(directory, { memory = false } = {}) {
    this.directory = directory; this.memory = memory; this.path = join(directory, 'rule-presets.json');
    this.presets = !memory && existsSync(this.path) ? JSON.parse(readFileSync(this.path, 'utf8')).presets : [];
    if (!Array.isArray(this.presets)) throw new Error('Die gespeicherten Regelvorlagen sind beschädigt.');
  }
  list() { return this.presets.map(({ id, name, bundle, updatedAt }) => ({ id, name, count: bundle.rules.length, roomName: bundle.room?.name || '', updatedAt })); }
  get(id) { const preset = this.presets.find(preset => preset.id === id); if (!preset) throw new Error('Regelvorlage fehlt.'); return preset; }
  save({ name, bundle }) {
    const title = text(name, 100); if (!title) throw new Error('Vorlagennamen eintragen.');
    const normalized = parseRules(bundle);
    if (this.presets.length >= 50) throw new Error('Höchstens 50 gespeicherte Regelvorlagen.');
    const preset = { id: randomUUID(), name: title, updatedAt: Date.now(), bundle: normalized };
    this.presets.push(preset); this.persist(); return preset;
  }
  remove(id) { this.get(id); this.presets = this.presets.filter(preset => preset.id !== id); this.persist(); }
  persist() {
    if (this.memory) return; mkdirSync(this.directory, { recursive: true });
    writeFileSync(this.path + '.tmp', JSON.stringify({ schema: 1, presets: this.presets }, null, 2), { mode: 0o600 }); renameSync(this.path + '.tmp', this.path);
  }
}
