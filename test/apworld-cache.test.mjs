import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { GameLibrary } from '../lib/game-library.mjs';
import { writeZip } from '../lib/zip.mjs';
import { createApp } from '../server.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const provenance = join(root, 'assets/apworld-downloads.json');
const uploads = existsSync(provenance) ? JSON.parse(readFileSync(provenance)).userImports || [] : [];
const preparedFiles = uploads.length === 7 && uploads.every(row => existsSync(join(root, 'apworlds', row.file)));
const worldTest = { skip: preparedFiles ? false : 'Benötigt den APworld-Bestand des vollständigen Pakets' };
const noPython = () => { throw new Error('Python darf für vorbereitete Dateien nicht aufgerufen werden'); };
function temporary(t) { const path = mkdtempSync(join(tmpdir(), 'ap-cache-')); t.after(() => rmSync(path, { recursive: true, force: true })); return path; }

test('all seven user APworlds scan under renamed files in a custom folder and export without Python', worldTest, async t => {
  const directory = temporary(t), folder = join(directory, 'my-worlds'), nested = join(folder, 'my-files'); mkdirSync(nested, { recursive: true });
  assert.equal(uploads.length, 7);
  for (const row of uploads) writeFileSync(join(nested, 'copy-' + row.originalName), readFileSync(join(root, 'apworlds', row.file)));
  const library = new GameLibrary(directory, root, { memory: true, folder }); library.pythonCommand = noPython;
  const report = await library.scan();
  assert.deepEqual(report.errors, []); assert.equal(report.imported.length, 7); assert.equal(library.list().games.length, 7);
  for (const row of uploads) {
    const entry = library.get(row.game), files = library.generate({ game: row.game, players: ['Daniel', 'Friend'] });
    assert.equal(entry.source, 'my-files/copy-' + row.originalName); assert(entry.options.length > 20);
    assert.equal(files.length, 2);
    for (let i = 0; i < files.length; i++) assert.deepEqual(parse(files[i].content, { version: '1.1' }), { ...entry.base, name: ['Daniel', 'Friend'][i] });
  }
  assert.equal(library.get('Bloons TD6').worldVersion, '0.8.2');
  assert.equal(library.get('Kingdom Hearts III').worldVersion, '0.16.11');
  assert.equal(library.get('Pokemon Platinum').base['Pokemon Platinum'].hm_reader, 'no');
  assert.equal(library.get('Pokemon Platinum').options.find(o => o.key === 'death_link_group').kind, 'text');
  for (const game of ['Bloons TD6', 'The Binding of Isaac Repentance']) assert.equal(library.get(game).options.find(o => o.key === 'trap_weights').kind, 'dict');
  const second = await library.scan(); assert.equal(second.unchanged, 7); assert.deepEqual(second.errors, []);
});

test('a fresh process loads hash-matched settings from a custom folder without Python', worldTest, t => {
  const directory = temporary(t), folder = join(directory, 'external'); mkdirSync(folder);
  for (const row of uploads) writeFileSync(join(folder, row.originalName), readFileSync(join(root, 'apworlds', row.file)));
  const first = new GameLibrary(directory, root, { folder, core: false }); first.save(); assert.equal(first.list().games.length, 7);
  const restarted = new GameLibrary(directory, root, { core: false }); restarted.pythonCommand = noPython;
  assert.equal(restarted.list().games.length, 7);
  assert.equal(restarted.generate({ game: 'Minecraft', players: ['Daniel'] }).length, 1);
});

test('HTTP upload accepts all seven prepared versions without a Python installation', worldTest, async t => {
  const app = await createApp({ memory: true, port: 0, worldsDirectory: temporary(t) }); t.after(() => app.close());
  app.library.pythonCommand = noPython;
  for (const row of uploads) {
    const response = await fetch(app.url + '/api/worlds/upload', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-Session': app.snapshot().session }, body: JSON.stringify({ name: row.originalName, content: readFileSync(join(root, 'apworlds', row.file)).toString('base64') }) });
    const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body)); assert.deepEqual(body.games, [row.game]);
  }
  assert.equal(app.library.list().games.length, 7);
});

test('unknown content does not borrow metadata from a known filename', t => {
  const library = new GameLibrary(temporary(t), root, { memory: true }); library.pythonCommand = noPython;
  const different = writeZip([{ name: 'kh3/__init__.py', content: "class WorldVariant(World):\n game = 'Different game'" }]);
  assert.throws(() => library.importWorld(different, 'kh3.apworld'), /Python darf/);
  assert.equal(library.list().games.length, 0);
});

test('AST recognizes option counters and free text without executing world code', t => {
  const library = new GameLibrary(temporary(t), root, { memory: true });
  library.importWorld(writeZip([{ name: 'fixture/__init__.py', content: `raise RuntimeError('never execute this')
from Options import FreeText, OptionCounter
WEIGHTS = {'Bomb Trap': 10, 'Freeze Trap': 2}
class TrapWeights(OptionCounter):
 default = WEIGHTS
 valid_keys = WEIGHTS.keys()
class Group(FreeText):
 default = ''
class ScalarPreset(FreeText):
 default = 5
class Settings(PerGameCommonOptions):
 trap_weights: TrapWeights
 death_link_group: Group
 scalar_preset: ScalarPreset
class FixtureWorld(World):
 game = 'Counter fixture'
 options_dataclass = Settings` }]), 'counter.apworld');
  const entry = library.get('Counter fixture');
  assert.deepEqual(entry.options.find(o => o.key === 'trap_weights').validKeys, ['Bomb Trap', 'Freeze Trap']);
  assert.equal(entry.options.find(o => o.key === 'death_link_group').kind, 'text');
  assert.equal(entry.options.find(o => o.key === 'scalar_preset').kind, 'json');
  assert.equal(entry.base[entry.game].scalar_preset, 5);
  assert.equal(parse(library.generate({ game: entry.game, values: { death_link_group: 'off' }, players: ['Player'] })[0].content, { version: '1.1' })[entry.game].death_link_group, 'off');
});

test('known unsupported packages are skipped without a misleading Python error', worldTest, async t => {
  const directory = temporary(t), folder = join(directory, 'unsupported'); mkdirSync(folder);
  const cache = JSON.parse(readFileSync(join(root, 'assets/apworld-settings.json')));
  assert.equal(cache.errors.length, 1);
  for (let i = 0; i < cache.errors.length; i++) writeFileSync(join(folder, `package-${i}.apworld`), readFileSync(join(root, 'apworlds', cache.errors[i].file)));
  const library = new GameLibrary(directory, root, { memory: true, folder }); library.pythonCommand = noPython;
  const report = await library.scan();
  assert.deepEqual(report.errors, []); assert.equal(report.skipped.length, 1); assert.equal(library.list().games.length, 0);
  assert(report.skipped.every(row => row.reason.includes('Hilfsbibliothek')));
});

test('Donkey Kong 64, Spirit Tracks and FNF expose complete prepared fields without Python', worldTest, t => {
  const library = new GameLibrary(temporary(t), root, { memory: true }); library.pythonCommand = noPython;
  const paths = ['github-com-2dos/814f8f1b/dk64.apworld', 'github-com-DayKat/292752c2/tloz_st.apworld', 'github-com-Z11Coding/e0b3c998/fridaynightfunkin.apworld'];
  for (const path of paths) library.importWorld(readFileSync(join(root, 'apworlds', path)), path);
  for (const game of ['Donkey Kong 64', 'Spirit Tracks', 'Friday Night Funkin']) {
    const entry = library.get(game); assert.deepEqual(entry.unresolved, []); assert(entry.options.length > 40);
    assert.equal(library.generate({ game, players: ['Daniel', 'Friend'] }).length, 2);
  }
  const fnf = library.get('Friday Night Funkin');
  assert.equal(fnf.options.find(o => o.key === 'trapAmount').max, 1e9);
  assert(fnf.base[fnf.game].songList.includes('Tutorial'));
  assert.deepEqual(library.get('Spirit Tracks').base['Spirit Tracks'].plando_transitions, []);
});
