import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { GameLibrary } from '../lib/game-library.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'assets/apworld-downloads.json')));
const uploads = manifest.userImports.filter(row => row.batch === 'catalog-2026-10-22');
const bundled = uploads.length >= 32 && uploads.every(row => existsSync(join(root, 'apworlds', row.file)));
const prepared = { skip: bundled ? false : 'Benötigt den vollständigen APworld-Bestand' };
const noPython = () => { throw new Error('Vorbereitete Nutzer-Worlds dürfen Python nicht aufrufen'); };

test('the complete new upload batch scans under other filenames and exports multiplayer YAML without Python', prepared, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'ap-new-worlds-')), folder = join(directory, 'worlds'); mkdirSync(folder);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const [i, row] of uploads.entries()) copyFileSync(join(root, 'apworlds', row.file), join(folder, `upload-${i}.apworld`));
  const library = new GameLibrary(directory, root, { memory: true, folder }); library.pythonCommand = noPython;
  const result = await library.scan(); assert.deepEqual(result.errors, []); assert.deepEqual(result.skipped, []);
  assert.equal(result.imported.length, uploads.length);
  for (const row of uploads) for (const game of row.games) {
    const entry = library.get(game); assert.deepEqual(entry.unresolved, [], game);
    const values = { ...entry.base[game] }, toggle = entry.options.find(o => o.kind === 'toggle');
    if (toggle) values[toggle.key] = !values[toggle.key];
    const files = library.generate({ game, players: ['Daniel', 'Friend'], values }); assert.equal(files.length, 2);
    files.forEach((file, i) => assert.deepEqual(parse(file.content, { version: '1.1' }), { ...entry.base, name: ['Daniel', 'Friend'][i], [game]: values }, game));
  }
  assert.equal(library.get('Space Engineers').options.find(o => o.key === 'second_world_size').min, 200);
  assert.equal(library.get('Shellipelago').base.Shellipelago.death_link, false);
  assert(Object.keys(library.get('Lingo 2').base['Lingo 2'].trap_weights).length > 0);
  assert(!library.list().games.some(g => g.game === 'Kingdom Hearts 358/2 Days'));
});

test('Grandia and Samus Returns retain the exact attached archives and complete prepared fields', prepared, t => {
  const directory = mkdtempSync(join(tmpdir(), 'ap-attachments-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const library = new GameLibrary(directory, root, { memory: true }); library.pythonCommand = noPython;
  for (const [file, game, sha, fields] of [
    ['grandia.apworld', 'Grandia', 'e80d8e6537a68c9083f6e5679c5cd4e3f42e4ff03637cf563acadef0bca44947', 19],
    ['msr.apworld', 'Metroid: Samus Returns', '41898b8814d81a1fd65ea5f12e35d128d7859fdef43ba4c25e784ba50df21d9a', 31],
  ]) {
    const bytes = readFileSync(join(root, 'apworlds', file)); assert.equal(createHash('sha256').update(bytes).digest('hex'), sha);
    assert.deepEqual(library.importWorld(bytes, 'renamed.apworld'), [game]);
    const entry = library.get(game); assert.equal(entry.options.length, fields); assert.deepEqual(entry.unresolved, []);
    assert.equal(library.generate({ game, players: ['Daniel', 'Friend'] }).length, 2);
  }
});
