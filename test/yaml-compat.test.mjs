import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { spawnSync } from 'node:child_process';
import { GameLibrary } from '../lib/game-library.mjs';
import { writeZip } from '../lib/zip.mjs';
import { createApp } from '../server.mjs';

const archive = writeZip([
  { name: 'fixture/archipelago.json', content: JSON.stringify({ game: 'YAML Fixture', minimum_ap_version: '0.6.7', world_version: '1.2.3' }) },
  { name: 'fixture/__init__.py', content: `class HMReader(Choice):
 option_no = 0
 option_itempool = 1
 default = 0
class OptionsDict(OptionDict):
 default = {'battle_scene': 'on', 'off': 'no', 'text': 'yes', 'pollution_factor': 9e-7, 'nested': ['on', 'off', 'no', '0123', '2026-10-21']}
class FixtureOptions(PerGameCommonOptions):
 hm_reader: HMReader
 game_options: OptionsDict
class FixtureWorld(World):
 game = 'YAML Fixture'
 options_dataclass = FixtureOptions` },
]);
const temporary = () => mkdtempSync(join(tmpdir(), 'yaml-compat-'));

test('export preserves no/on/off and nested strings under YAML 1.1 and requires the manifest AP version', () => {
  const library = new GameLibrary('.', process.cwd(), { memory: true }); library.importWorld(archive, 'fixture.apworld');
  const entry = library.get('YAML Fixture');
  assert.equal(entry.minimumAPVersion, '0.6.7'); assert.equal(entry.worldVersion, '1.2.3');
  const output = library.generate({ game: entry.game, players: ['Daniel'] })[0].content;
  const loaded = parse(output, { version: '1.1' });
  assert.deepEqual(loaded[entry.game], entry.base[entry.game]);
  assert.equal(loaded[entry.game].hm_reader, 'no'); assert.equal(loaded[entry.game].game_options.battle_scene, 'on');
  assert.equal(loaded.requires.version, '0.6.7');
});

test('deleted world files disappear from the settings catalog after scanning', async t => {
  const directory = temporary(), folder = join(directory, 'worlds'); mkdirSync(folder);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(folder, 'fixture.apworld'), archive);
  const library = new GameLibrary(directory, process.cwd(), { folder }); await library.scan();
  assert.equal(library.list().games.length, 1);
  rmSync(join(folder, 'fixture.apworld')); await library.scan();
  assert.equal(library.list().games.length, 0); assert.throws(() => library.get('YAML Fixture'));
});

test('the catalog endpoint exposes only imported APworld games and excludes sheet-only templates', async t => {
  const app = await createApp({ memory: true, port: 0 }); t.after(() => app.close());
  app.library.importWorld(archive, 'fixture.apworld');
  const index = await fetch(app.url + '/api/game-index').then(response => response.json());
  assert.deepEqual(index.games.map(game => game.game), ['YAML Fixture']); assert(index.games.every(game => game.kind === 'apworld'));
});


test('PyYAML preserves choice words and scientific numbers in generated documents', () => {
  const library = new GameLibrary('.', process.cwd(), { memory: true }); library.importWorld(archive, 'fixture.apworld');
  const entry = library.get('YAML Fixture'), yaml = library.generate({ game: entry.game, players: ['Daniel'] })[0].content;
  const python = library.pythonCommand();
  const result = spawnSync(python[0], [...python.slice(1), 'scripts/validate_yaml_compat.py'], { input: JSON.stringify([{ file: entry.source, game: entry.game, yaml, expected: { ...entry.base, name: 'Daniel' } }]), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
