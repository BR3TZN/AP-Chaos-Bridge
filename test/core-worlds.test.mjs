import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { GameLibrary } from '../lib/game-library.mjs';
import { createApp } from '../server.mjs';
import { writeZip } from '../lib/zip.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = JSON.parse(readFileSync(new URL('../assets/core-worlds-source.json', import.meta.url)));
const cache = JSON.parse(readFileSync(new URL('../assets/core-world-settings.json', import.meta.url)));
function temporary(t) { const path = mkdtempSync(join(tmpdir(), 'ap-core-')); t.after(() => rmSync(path, { recursive: true, force: true })); return path; }
const noPython = () => { throw new Error('Core must work without Python'); };

test('all 55 pinned Core worlds export typed multi-player YAML without Python', t => {
  const library = new GameLibrary(temporary(t), root, { memory: true, core: true }); library.pythonCommand = noPython;
  assert.equal(cache.source.commit, source.commit); assert.equal(cache.version, source.version);
  assert.equal(source.worlds.length, 55); assert.equal(library.list().games.length, 55);
  for (const row of source.worlds) {
    const entry = library.get(row.game);
    assert.equal(entry.kind, 'core'); assert.equal(entry.coreVersion, '0.6.8'); assert.equal(entry.options.length, new Set(entry.options.map(o => o.key)).size);
    assert(entry.options.length >= 10); assert.deepEqual(entry.unresolved, []);
    const files = library.generate({ game: entry.game, values: entry.base[entry.game], players: ['Daniel', 'Friend'] });
    for (let i = 0; i < files.length; i++) assert.deepEqual(parse(files[i].content, { version: '1.1' }), { ...entry.base, name: ['Daniel', 'Friend'][i], requires: { version: '0.6.8' } });
  }
  assert(library.get('Timespinner').options.length > 40);
  assert(library.get('Dark Souls III').options.some(o => o.key === 'pool_type'));
  assert(library.get('The Wind Waker').aliases.includes('The Legend of Zelda: The Wind Waker'));
  assert(library.get('Super Mario Land 2').aliases.includes('Super Mario Land 2: The Golden Coins'));
  assert.equal(library.get('Factorio').base.Factorio.world_gen.basic, undefined);
  assert(library.get('Factorio').base.Factorio.world_gen.autoplace_controls);
});

test('Core survives folder changes and restarts; a custom APworld overrides it until removed', async t => {
  const directory = temporary(t), folder = join(directory, 'custom'), second = join(directory, 'empty'); mkdirSync(folder); mkdirSync(second);
  const library = new GameLibrary(directory, root, { folder }); library.pythonCommand = noPython;
  assert.equal(library.list().games.length, 55);
  const scanned = await library.scan(); assert.deepEqual(scanned.errors, []); assert.equal(library.list().games.length, 55);
  // Already analyzed metadata is intentionally provided by a fixture cache here.
  const bytes = writeZip([{ name: 'adventure/__init__.py', content: "class AdventureWorld(World):\n game = 'Adventure'" }]);
  library.bundledSettings().byHash.set((await import('node:crypto')).createHash('sha256').update(bytes).digest('hex'), { worlds: [{ game: 'Adventure', options: [], unresolved: [] }], warnings: [] });
  library.upload({ name: 'adventure.apworld', content: bytes.toString('base64') });
  assert.equal(library.get('Adventure').kind, 'apworld'); assert.equal(library.list().games.length, 55);
  const restarted = new GameLibrary(directory, root); assert.equal(restarted.get('Adventure').kind, 'apworld');
  await library.scan(second); assert.equal(library.get('Adventure').kind, 'core'); assert.equal(library.list().games.length, 55);
  library.save(); assert.equal(new GameLibrary(directory, root).get('Adventure').kind, 'core');
});

test('Core is available through catalog/settings/export HTTP routes with an empty APworld folder', async t => {
  const app = await createApp({ memory: true, core: true, worldsDirectory: temporary(t), port: 0 }); t.after(() => app.close()); app.library.pythonCommand = noPython;
  const catalog = await fetch(app.url + '/api/game-index').then(r => r.json()); assert.equal(catalog.games.length, 55); assert(catalog.games.every(g => g.kind === 'core'));
  assert.equal(app.snapshot().gameLibrary.coreVersion, '0.6.8');
  const settings = await fetch(app.url + '/api/game-settings?game=' + encodeURIComponent('Pokemon Emerald')).then(r => r.json()); assert.equal(settings.kind, 'core');
  const response = await fetch(app.url + '/api/yaml/generate', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-Session': app.snapshot().session }, body: JSON.stringify({ game: 'Pokemon Emerald', players: ['Daniel', 'Friend'] }) });
  assert.equal(response.status, 200, await response.clone().text());
  const result = await response.json(); assert.equal(result.files.length, 2);
  assert.equal(parse(result.files[0].content, { version: '1.1' }).game, 'Pokemon Emerald');
});
