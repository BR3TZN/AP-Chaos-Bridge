import test from 'node:test';
import assert from 'node:assert/strict';
import { GameLibrary } from '../lib/game-library.mjs';
import { writeZip } from '../lib/zip.mjs';

function importSource(source, more = []) {
  const library = new GameLibrary('.', process.cwd(), { memory: true });
  library.importWorld(writeZip([{ name: 'guarded/__init__.py', content: source }, ...more]), 'guarded.apworld');
  return library;
}

test('conditional World declarations and archive-root imports are discovered without executing code', () => {
  const library = importSource(`raise RuntimeError('must never run')
if dependencies_loaded:
 from archipelago.Options import Settings
 from worlds.AutoWorld import World
 class GuardedWorld(World):
  game = 'Guarded game'
  options_dataclass = Settings
`, [{ name: 'guarded/archipelago/Options.py', content: `from Options import Range, PerGameCommonOptions
class Count(Range):
 range_start = 0
 range_end = int(1e9)
 default = 10
class Settings(PerGameCommonOptions):
 count: Count
` }]);
  const entry = library.get('Guarded game'); assert.equal(entry.base[entry.game].count, 10); assert.equal(entry.options.find(o => o.key === 'count').max, 1e9);
});

test('try-imported World aliases and declarative copied defaults produce useful fields', () => {
  const library = importSource(`from worlds.AutoWorld import World
try:
 from rule_builder.cached_world import CachedRuleBuilderWorld as WorldParent
except ModuleNotFoundError:
 WorldParent = World
class Data:
 songs = ['Tutorial', 'Bopeebo']
class SongList(OptionList):
 default = Data.songs.copy()
class SelectMode(TextChoice):
 valid_keys = {'Per Song', 'Per Week'}
 default = 'Per Song'
class EntrancePlan(PlandoConnections):
 pass
class Settings(PerGameCommonOptions):
 songs: SongList
 mode: SelectMode
 plando_transitions: EntrancePlan
class GuardedWorld(WorldParent):
 game = 'Aliased game'
 options_dataclass = Settings
`);
  const entry = library.get('Aliased game'); assert.deepEqual(entry.unresolved, []);
  assert.deepEqual(entry.base[entry.game].songs, ['Tutorial', 'Bopeebo']);
  assert.deepEqual(entry.base[entry.game].plando_transitions, []);
  assert.deepEqual(entry.options.find(o => o.key === 'mode').choices.map(c => c.value), ['Per Song', 'Per Week']);
});

test('nested functions, TYPE_CHECKING, false guards and conflicting declarations do not invent games', () => {
  const library = importSource(`if TYPE_CHECKING:
 class TypeWorld(World):
  game = 'Type-only game'
if False:
 class FalseWorld(World):
  game = 'False game'
def factory():
 class NestedWorld(World):
  game = 'Nested game'
if unknown:
 class AmbiguousWorld(World):
  game = 'First guess'
else:
 class AmbiguousWorld(World):
  game = 'Second guess'
class RealWorld(World):
 game = 'Real game'
`);
  assert.deepEqual(library.list().games.map(g => g.game), ['Real game']);
  assert(library.get('Real game').warnings.some(w => w.includes('Mehrere bedingte Deklarationen')));
});
