import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HelpLanguage, HelpTranslator, helpRevision, protectHelpText } from '../lib/help-language.mjs';
import { prepareTranslationModel, modelManifest } from '../scripts/prepare_translation_model.mjs';
import { createApp } from '../server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
function temporary(t) { const directory = mkdtempSync(join(tmpdir(), 'ap-help-')); t.after(() => rmSync(directory, { recursive: true, force: true })); return directory; }
const fixture = description => ({ game: 'Help Fixture', sourceId: 'source-one', options: [{ key: 'enemy_count', label: 'Goal', description, kind: 'range', min: 0, max: 30, default: 10 }] });

test('German is the default and the global help language persists without room or appearance settings', t => {
  const directory = temporary(t), first = new HelpLanguage(directory);
  assert.equal(first.language, 'de'); first.update({ language: 'en' });
  assert.equal(new HelpLanguage(directory).language, 'en');
  assert.throws(() => first.update({ language: 'xx' }), /Deutsch/); assert.equal(first.language, 'en');
  first.update({ language: 'de' }); assert.deepEqual(JSON.parse(readFileSync(join(directory, 'language.json'), 'utf8')), { language: 'de' });
});

test('translation placeholders preserve literal values, URLs, quoted names and more than 26 numbers', () => {
  const original = '`death_link: true` and random-low, DeathLink, https://example.test/docs with ' + Array.from({ length: 40 }, (_, i) => i + 1).join(', ');
  const protectedValue = protectHelpText(original);
  assert.equal(protectedValue.restore(protectedValue.text.replace(/APKEEP[A-Z]+/g, token => token.toLowerCase())), original);
  assert.equal(protectedValue.restore(protectedValue.text), original);
  assert.throws(() => protectedValue.restore(protectedValue.text.replace('APKEEPA', 'missing')), /technischer Wert/);
  assert.throws(() => protectedValue.restore(protectedValue.text + ' APKEEPA'), /technischer Wert/);
});

test('new help text is translated with paragraph and code preservation, cached by content and never changes options', async t => {
  const directory = temporary(t); let batches = 0;
  const translator = new HelpTranslator(directory, root, { runBatch: async texts => { batches++; return texts.map(text => 'Deutsch: ' + text); } }); t.after(() => translator.close());
  const entry = fixture('Choose at least 10 items.\n\n- Set `death_link: true` to enable DeathLink.\n```yaml\nrandom_setting: false\n```');
  const original = structuredClone(entry), result = await translator.translate(entry, { indices: [0] });
  assert.equal(result.options[0].label, 'Ziel'); assert(result.options[0].description.includes('\n\n- '));
  assert(result.options[0].description.includes('```yaml\nrandom_setting: false\n```')); assert(result.options[0].description.includes('`death_link: true`'));
  assert.deepEqual(entry, original); const previous = batches;
  await translator.translate(entry, { indices: [0] }); assert.equal(batches, previous);
  const english = await translator.translate(entry, { language: 'en', indices: [0] }); assert.equal(english.options[0].description, entry.options[0].description); assert.equal(batches, previous);
  const revised = fixture('Choose at least 20 items.'); assert.notEqual(helpRevision(revised), result.revision); await translator.translate(revised, { indices: [0] }); assert(batches > previous);
  const restarted = new HelpTranslator(directory, root, { runBatch: () => { throw new Error('Persisted translation should not be recomputed'); } }); t.after(() => restarted.close());
  assert.equal((await restarted.translate(entry, { indices: [0] })).options[0].description, result.options[0].description);
});

test('lost placeholders fall back to translating prose separately without losing literal settings', async t => {
  const translator = new HelpTranslator(temporary(t), root, { memory: true, runBatch: async texts => texts.map(text => text.includes('APKEEP') ? 'Ein Modell ohne Platzhalter.' : 'Deutsch ' + text) }); t.after(() => translator.close());
  const result = await translator.translate(fixture('Set `death_link: true` to enable DeathLink with 10 items.'), { indices: [0] });
  for (const literal of ['`death_link: true`', 'DeathLink', '10']) assert(result.options[0].description.includes(literal));
  assert(!result.options[0].description.includes('APKEEP'));
});

test('missing models keep the original-language editor available and invalid requests do not start a worker', async t => {
  const directory = temporary(t), translator = new HelpTranslator(directory, root, { memory: true, modelFolder: join(directory, 'missing') }); t.after(() => translator.close());
  assert.equal(translator.status().installed, false);
  const entry = fixture('This description has never been translated before.');
  assert.throws(() => translator.translate(entry, { language: 'fr', indices: [0] }), /Deutsch/);
  for (const indices of [[], [10], [0, 0], ['0'], Array.from({ length: 17 }, () => 0)]) assert.throws(() => translator.translate(entry, { indices }));
  assert.equal(translator.worker, undefined);
  assert.equal((await translator.translate(entry, { language: 'en', indices: [0] })).options[0].description, entry.options[0].description);
  await assert.rejects(translator.translate(entry, { indices: [0] }), /Übersetzungsmodell fehlt/);
});

test('the actual offline model translates previously unseen English while preserving thresholds and game protocol values', async t => {
  const translator = new HelpTranslator(temporary(t), root, { memory: true }); t.after(() => translator.close());
  const description = 'This option changes how many enemies appear in every level.\nSet `death_link: true` to enable DeathLink.\nYou must not enable this option unless all players have completed at least 10 levels.';
  const output = (await translator.translate(fixture(description), { indices: [0] })).options[0].description;
  assert.notEqual(output, description); assert.match(output, /Gegner/i); assert.match(output, /(?:aktivieren|aktiviert)/i);
  assert(output.includes('`death_link: true`')); assert(output.includes('DeathLink')); assert(output.includes('10')); assert(!output.includes('APKEEP'));
  assert.equal(translator.status().local, true);
});

test('language and help HTTP routes validate selected sources and leave imported and generated YAML byte-identical', async t => {
  const directory = temporary(t), app = await createApp({ directory, memory: true, port: 0, translationRunner: async texts => texts.map(text => 'Deutsche Erklärung: ' + text) }); t.after(() => app.close());
  const post = (path, value) => fetch(app.url + '/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-Session': app.snapshot().session }, body: JSON.stringify(value) });
  assert.equal(app.snapshot().language, 'de');
  const imported = 'name: Friend\ngame: New Help Game\nNew Help Game:\n  # This option changes the number of enemies.\n  enemy_count: 10\n';
  app.library.importYaml({ name: 'NewHelp.yaml', content: imported });
  const entry = await fetch(app.url + '/api/game-settings?game=New%20Help%20Game').then(response => response.json());
  const before = await post('yaml/generate', { game: entry.game, sourceId: entry.sourceId, players: ['Friend'] }).then(response => response.json());
  const index = entry.options.findIndex(option => option.key === 'enemy_count');
  const translated = await post('game-help', { game: entry.game, sourceId: entry.sourceId, revision: entry.helpRevision, indices: [index] }).then(response => response.json());
  assert.match(translated.options[0].description, /Deutsche Erklärung/);
  assert.equal((await post('game-help', { game: entry.game, revision: 'old-source', indices: [index] })).status, 400);
  assert.equal((await post('language', { language: 'en' })).status, 200);
  const room = app.rooms.create({ name: 'Another room' }); app.rooms.activate(room.id); assert.equal(app.snapshot().language, 'en');
  app.rooms.activate('default');
  const after = await post('yaml/generate', { game: entry.game, sourceId: entry.sourceId, players: ['Friend'] }).then(response => response.json()); assert.deepEqual(after.files, before.files);
  assert.equal(app.library.get(entry.game).options[index].description, entry.options[index].description);
  assert.equal((await post('language', { language: 'invalid' })).status, 400); assert.equal(app.snapshot().language, 'en');
  assert.equal((await fetch(app.url + '/api/language', { method: 'POST', body: JSON.stringify({ language: 'de' }) })).status, 403);
});

test('model preparation verifies pinned bytes and a failed download preserves the previous file', async t => {
  const directory = temporary(t); await mkdir(directory, { recursive: true });
  for (const file of modelManifest.files) writeFileSync(join(directory, file.name), await readFile(join(root, 'assets/translation-models', file.name)));
  await prepareTranslationModel({ folder: directory, fetchImpl: () => { throw new Error('Valid model must not be downloaded again'); } });
  const file = modelManifest.files[0]; writeFileSync(join(directory, file.name), 'previous bytes');
  await assert.rejects(prepareTranslationModel({ folder: directory, fetchImpl: async () => new Response('wrong download') }), /SHA256/);
  assert.equal(readFileSync(join(directory, file.name), 'utf8'), 'previous bytes');
});
