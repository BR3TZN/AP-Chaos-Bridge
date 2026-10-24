import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isAlias, isMap, isScalar, isSeq, parseAllDocuments, visit } from 'yaml';
import { isDeepStrictEqual } from 'node:util';

export const YAML_IMPORT_LIMIT = 2 * 1024 * 1024;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const plain = value => value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const human = key => key.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

function jsonValue(value, depth = 0, budget = { nodes: 0 }) {
  if (depth > 40 || ++budget.nodes > 50000) throw new Error('YAML enthält zu viele oder zu tief verschachtelte Werte.');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) throw new Error('Eine ganze Zahl in der YAML ist zu groß, um sie unverändert zu bearbeiten.');
    return value;
  }
  if (value instanceof Set || Array.isArray(value)) return [...value].map(item => jsonValue(item, depth + 1, budget));
  if (plain(value)) {
    const entries = Object.entries(value);
    if (entries.some(([key]) => forbidden.has(key))) throw new Error('Nicht unterstützter YAML-Schlüssel.');
    return Object.fromEntries(entries.map(([key, item]) => [key, jsonValue(item, depth + 1, budget)]));
  }
  throw new Error('YAML muss normale Texte, Zahlen, Wahrheitswerte, Listen oder Objekte enthalten.');
}

function documents(content) {
  if (typeof content !== 'string' || !content.trim() || Buffer.byteLength(content, 'utf8') > YAML_IMPORT_LIMIT) throw new Error('Eine YAML-Datei mit höchstens 2 MiB auswählen.');
  // Read plain choice words such as off/on/no as text. Export quotes them for AP's
  // YAML 1.1 reader. An explicit version directive in a file is still respected.
  const docs = parseAllDocuments(content, { version: '1.2', uniqueKeys: true, merge: true, strict: true });
  if (!docs.length || docs.length > 20) throw new Error('1 bis 20 Spieler-Dokumente pro YAML-Datei verwenden.');
  for (const doc of docs) {
    if (doc.errors.length || doc.warnings.length) throw new Error('YAML: ' + (doc.errors[0] || doc.warnings[0]).message);
  }
  return docs;
}

function hints(comment, key, value, group) {
  const lines = (comment || '').split('\n').map(line => line.trim());
  for (const line of lines) {
    const section = /^-{3,}\s*(.+?)\s*-{3,}$/.exec(line);
    if (section) group = section[1];
  }
  let body = lines.filter(line => !/^[-=]{3}/.test(line));
  // Extra legacy notes may precede the current option's own heading.
  const titles = body.map((line, index) => ({ line, index })).filter(({ line, index }) => line && line.length < 90 && /^[\p{Lu}\d]/u.test(line) && !/[.!?;]$|[`]|^(Values|Names):/i.test(line) && !body[index - 1] && !body[index + 1]);
  if (titles.length) body = body.slice(titles.at(-1).index);
  const first = body.find(line => line && !/^Values:|^Names:/i.test(line));
  const label = first && first.length < 90 && !/[`]|https?:/.test(first) ? first : human(key);
  const option = { key, label, description: body.join('\n').trim(), group, default: value, inferred: true };
  const range = /Values:\s*a whole number from\s+(-?\d+)\s+to\s+(-?\d+)/i.exec(comment || '');
  const choices = /(?:^|\n)\s*Values:\s*([^\n(]+)/i.exec(comment || '')?.[1].trim().split(/\s*,\s*/);
  if (plain(value) || value === null || Array.isArray(value)) option.kind = 'json';
  else if (typeof value === 'boolean') option.kind = 'toggle';
  else if (range && Number.isSafeInteger(+range[1]) && Number.isSafeInteger(+range[2]) && +range[1] <= +range[2] && (Number.isInteger(value) || typeof value === 'string')) {
    option.kind = 'range'; option.min = +range[1]; option.max = +range[2];
    option.special = typeof value === 'string' && !/^random(?:-|$)/.test(value) ? [value] : [];
    option.specialValues = Number.isInteger(value) && (value < option.min || value > option.max) ? [value] : [];
  } else if (typeof value === 'number') option.kind = 'number';
  else if (choices?.length > 1 && choices.length <= 100 && choices.every(choice => /^[\w.+-]+$/.test(choice)) && (choices.includes(value) || value === 'random')) {
    option.kind = 'choice'; option.choices = [...new Set(choices)].map(choice => ({ value: choice, label: human(choice) }));
  } else option.kind = 'text';
  if (Array.isArray(value)) {
    // These are suggestions from comments, never a complete validation schema.
    // Keep the original JSON kind so ordered lists and custom values stay valid.
    const named = body.flatMap(line => /^Names:\s*(.+)/i.exec(line)?.[1].split(/\s*,\s*/).map(value => ({ value: value.trim(), label: value.trim() })) || []);
    const described = body.flatMap(line => {
      const match = /^([a-z][a-z0-9_-]*):\s+(.+)/.exec(line);
      return match ? [{ value: match[1], label: human(match[1]), description: match[2] }] : [];
    });
    const choices = [...named, ...described].filter(choice => choice.value && choice.value.length <= 200 && !forbidden.has(choice.value));
    if (choices.length && choices.length <= 500) option.listChoices = [...new Map(choices.map(choice => [choice.value, choice])).values()];
  }
  return option;
}

function describe(doc, name, index, id) {
  const raw = doc.toJS({ maxAliasCount: 100 }), base = jsonValue(raw);
  if (!plain(base)) throw new Error('Eine Archipelago-Spieler-YAML mit name, game und Spieleinstellungen verwenden.');
  let game = base.game;
  if (plain(game)) {
    const names = Object.entries(game).filter(([, weight]) => typeof weight === 'number' && weight > 0).map(([name]) => name);
    if (names.length !== 1) throw new Error('Pro Vorlage ein Spiel verwenden. YAMLs mit mehreren gewichteten Spielen zuerst aufteilen.');
    game = names[0];
  }
  if (typeof game !== 'string' || !game.trim() || game.length > 200 || /[\x00-\x1f]/.test(game) || forbidden.has(game)) throw new Error('Die YAML benötigt einen eindeutigen Spielnamen unter game.');
  if (Object.hasOwn(base, game) && !plain(base[game])) throw new Error('Einstellungsblock „' + game + ':“ muss ein YAML-Objekt sein.');
  let node = doc.get(game, true); if (isAlias(node)) node = node.resolve(doc);
  let group = 'YAML-Einstellungen';
  const options = Object.entries(base[game] || {}).map(([key, value], fieldIndex) => {
    const pair = isMap(node) ? node.items.find(pair => isScalar(pair.key) && pair.key.value === key) : null;
    const comment = [fieldIndex === 0 ? node?.commentBefore : '', pair?.key?.commentBefore, pair?.value?.commentBefore].filter(Boolean).join('\n');
    const option = hints(comment, key, value, group); group = option.group;
    return option;
  });
  return { game, kind: 'yaml', sourceId: id, source: name, filename: name, documentIndex: index,
    base, options, unresolved: [], traps: [], parser: 'YAML-Vorlage · ohne Python',
    minimumAPVersion: typeof base.requires?.version === 'string' ? base.requires.version : '',
    yamlNotice: 'Werte und Kommentare stammen aus deiner YAML. Auswahlwerte und Zahlenbereiche werden aus eindeutigen Kommentaren übernommen. Weitere Werte bleiben als Text, Zahl oder JSON bearbeitbar. Die zur Vorlage passende APworld muss im Archipelago-Generator installiert sein.',
  };
}

function patch(doc, node, value) {
  if (isAlias(node)) {
    // An edited alias becomes a local value. The shared anchor and its comments
    // remain intact for all other options that use it.
    const next = doc.createNode(value); next.commentBefore = node.commentBefore; next.comment = node.comment; return next;
  }
  if (node?.tag === 'tag:yaml.org,2002:set' && Array.isArray(value)) {
    const result = doc.createNode(new Set(value)); result.commentBefore = node.commentBefore; result.comment = node.comment; return result;
  }
  if (isMap(node) && plain(value)) {
    node.items = node.items.filter(pair => pair.key?.value === '<<' || Object.hasOwn(value, String(pair.key?.value)));
    for (const [key, item] of Object.entries(value)) node.set(key, patch(doc, node.get(key, true), item));
    return node;
  }
  if (isSeq(node) && Array.isArray(value)) { node.items = value.map((item, index) => patch(doc, node.items[index], item)); return node; }
  if (isScalar(node) && (value === null || typeof value !== 'object')) {
    node.value = value;
    delete node.tag;
    return node;
  }
  const next = doc.createNode(value);
  if (node && next) { next.commentBefore = node.commentBefore; next.comment = node.comment; }
  return next;
}

export class YamlTemplates {
  constructor(directory, { memory = false } = {}) {
    Object.assign(this, { directory, memory, path: join(directory, 'yaml-templates.json'), cache: new Map() });
    this.data = !memory && existsSync(this.path) ? JSON.parse(readFileSync(this.path, 'utf8')) : { schema: 1, templates: [], selected: {} };
    if (this.data.schema !== 1 || !Array.isArray(this.data.templates) || !plain(this.data.selected)) throw new Error('Gespeicherte YAML-Vorlagen haben ein ungültiges Format.');
  }
  save(next) {
    const json = JSON.stringify(next, null, 2);
    if (Buffer.byteLength(json) > 32 * 1024 * 1024) throw new Error('Die gespeicherten YAML-Vorlagen überschreiten 32 MiB.');
    if (!this.memory) { mkdirSync(this.directory, { recursive: true }); writeFileSync(this.path + '.tmp', json, { mode: 0o600 }); renameSync(this.path + '.tmp', this.path); }
    this.data = next;
  }
  import({ name, content }) {
    if (typeof name !== 'string' || name.length > 200 || /[\\/\x00-\x1f]/.test(name) || !/\.ya?ml$/i.test(name)) throw new Error('Eine .yaml- oder .yml-Datei auswählen.');
    const added = documents(content).map((doc, index) => {
      const id = 'yaml-' + createHash('sha256').update(content + '\0' + index).digest('hex');
      return { row: { id, name, content, index }, entry: describe(doc, name, index, id) };
    });
    const next = structuredClone(this.data);
    for (const { row, entry } of added) {
      const existing = next.templates.find(existing => existing.id === row.id);
      if (existing) existing.name = row.name; else next.templates.push(row);
      next.selected[entry.game] = row.id;
    }
    if (next.templates.length > 200) throw new Error('Höchstens 200 YAML-Vorlagen speichern.');
    this.save(next); for (const { row, entry } of added) this.cache.set(row.id, entry);
    return { games: [...new Set(added.map(({ entry }) => entry.game))], templates: added.map(({ entry }) => ({ id: entry.sourceId, game: entry.game, name: entry.source, optionCount: entry.options.length })) };
  }
  entry(id) {
    if (this.cache.has(id)) return this.cache.get(id);
    const row = this.data.templates.find(row => row.id === id); if (!row) return null;
    const doc = documents(row.content)[row.index]; if (!doc) throw new Error('YAML-Dokument fehlt.');
    const entry = describe(doc, row.name, row.index, id); this.cache.set(id, entry); return entry;
  }
  entries(game) { return this.data.templates.map(row => this.entry(row.id)).filter(entry => !game || entry.game === game); }
  select(game, sourceId) { this.save({ ...this.data, selected: { ...this.data.selected, [game]: sourceId } }); }
  remove(sourceId) {
    const entry = this.entry(sourceId); if (!entry) throw new Error('YAML-Vorlage fehlt.');
    const next = structuredClone(this.data); next.templates = next.templates.filter(row => row.id !== sourceId);
    if (next.selected[entry.game] === sourceId) {
      const remaining = this.entries(entry.game).filter(other => other.sourceId !== sourceId);
      if (remaining.length) next.selected[entry.game] = remaining.at(-1).sourceId; else delete next.selected[entry.game];
    }
    this.save(next); this.cache.delete(sourceId); return { game: entry.game };
  }
  generate(entry, name, values, extras) {
    const row = this.data.templates.find(row => row.id === entry.sourceId);
    const doc = documents(row.content)[row.index];
    // Detach shared values before changing an anchored option or player name.
    // Otherwise the edit would silently change every alias that refers to it.
    visit(doc, { Alias(key, node) {
      const next = doc.createNode(node.toJS(doc));
      next.commentBefore = node.commentBefore; next.comment = node.comment; return next;
    } });
    doc.setSchema('1.1');
    doc.set('name', name); doc.set('game', entry.game); doc.delete('quantity');
    const changed = { ...values, ...extras };
    for (const [key, value] of Object.entries(changed)) {
      jsonValue(value);
      if (isDeepStrictEqual(value, (entry.base[entry.game] || {})[key])) continue;
      let node = doc.get(entry.game, true);
      if (!node || isAlias(node)) { node = doc.createNode(entry.base[entry.game] || {}); doc.set(entry.game, node); }
      node.set(key, patch(doc, node.get(key, true), value));
    }
    visit(doc, { Scalar(key, node) { if (typeof node.value === 'number' && /e/i.test(String(node.value))) node.tag = 'tag:yaml.org,2002:float'; } });
    return doc.toString({ lineWidth: 110 });
  }
}
