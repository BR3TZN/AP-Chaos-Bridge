import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { GameLibrary } from '../lib/game-library.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const library = new GameLibrary('.', root, { memory: true, core: true });
const checks = [];
for (const game of library.list().games) {
  for (const variant of ['default', 'changed']) {
    const values = {};
    if (variant === 'changed') { const option = game.options.find(o => o.kind === 'toggle'); if (option) values[option.key] = !option.default; }
    const yaml = library.generate({ game: game.game, players: [variant === 'default' ? 'Daniel' : 'Friend'], values })[0].content;
    checks.push({ file: game.game + '-' + variant + '.yaml', game: game.game, yaml });
  }
}
const python = library.pythonCommand();
const result = spawnSync(python[0], [...python.slice(1), join(root, 'scripts/validate_core_worlds.py'), ...process.argv.slice(2)], {
  input: JSON.stringify(checks), encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
