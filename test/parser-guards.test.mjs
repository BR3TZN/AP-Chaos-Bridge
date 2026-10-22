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

test('legacy option_definitions resolve imported dictionaries and preserve field types', () => {
  const library = importSource(`from .Options import option_definitions
class LegacyWorld(World):
 game = 'Legacy game'
 option_definitions = option_definitions
`, [{ name: 'guarded/Options.py', content: `from Options import Choice, Range
class Goal(Choice):
 option_short = 0
 option_long = 1
 default = 1
class Distance(Range):
 range_start = 200
 range_end = 10000
 default = 800
option_definitions = {'goal': Goal, 'distance': Distance}
` }]);
  const entry = library.get('Legacy game'); assert.deepEqual(entry.unresolved, []);
  assert.equal(entry.base[entry.game].goal, 'long'); assert.equal(entry.base[entry.game].distance, 800);
  assert.equal(entry.options.find(o => o.key === 'distance').max, 10000);
});

test('bounded declarative comprehensions, DeathLink mixins and removed options export correctly', () => {
  const library = importSource(`from .Options import Settings
class ActualWorld(World):
 game = 'Collection game'
 options_dataclass = Settings
`, [{ name: 'guarded/Options.py', content: `from Options import DeathLinkMixin, OptionCounter, PerGameCommonOptions, Removed
TRAPS = frozenset({'Bomb Trap', 'Freeze Trap'})
class Weights(OptionCounter):
 valid_keys = TRAPS
 default = {name: 1 for name in sorted(TRAPS)}
class Obsolete(Removed):
 pass
class Settings(PerGameCommonOptions, DeathLinkMixin):
 weights: Weights
 obsolete: Obsolete
` }]);
  const entry = library.get('Collection game'); assert.deepEqual(entry.unresolved, []);
  assert.deepEqual(entry.base[entry.game].weights, { 'Bomb Trap': 1, 'Freeze Trap': 1 });
  assert.equal(entry.base[entry.game].death_link, false); assert(!entry.options.some(o => o.key === 'obsolete'));
});

test('Worlds with only common options remain valid while unresolved declarations are reported', () => {
  const library = importSource(`from Options import PerGameCommonOptions
class CommonWorld(World):
 game = 'Common game'
 options_dataclass = PerGameCommonOptions
class DefaultWorld(World):
 game = 'Default game'
class DynamicWorld(World):
 game = 'Dynamic game'
 options_dataclass = make_options()
`);
  for (const game of ['Common game', 'Default game']) assert.deepEqual(library.get(game).unresolved, []);
  assert(library.get('Dynamic game').unresolved.length);
});

test('archived old clients do not invent extra games and identical inherited Worlds are deduplicated', () => {
  const library = new GameLibrary('.', process.cwd(), { memory: true });
  const games = library.importWorld(writeZip([
    { name: 'guarded/__init__.py', content: "class BaseWorld(World):\n game = 'Actual game'\nclass ConcreteWorld(BaseWorld):\n pass" },
    { name: 'guarded/old client/__init__.py', content: "class OldWorld(World):\n game = 'Old game'" },
  ]), 'guarded.apworld');
  assert.deepEqual(games, ['Actual game']);
});
