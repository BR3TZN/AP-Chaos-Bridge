import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { GameLibrary } from '../lib/game-library.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const spec = JSON.parse(readFileSync(join(root, 'assets/user-worlds-validation-source.json')));
const library = new GameLibrary('.', root, { memory: true });
const checks = [];
for (const row of spec.worlds) {
  library.importWorld(readFileSync(join(root, 'apworlds', row.file)), row.file);
  for (const game of row.games) for (const variant of ['default', 'changed']) {
    const values = {}, entry = library.get(game);
    if (variant === 'changed') {
      const toggle = entry.options.find(o => o.kind === 'toggle');
      if (toggle) values[toggle.key] = !toggle.default;
      else {
        const range = entry.options.find(o => o.kind === 'range' && o.group !== 'Archipelago');
        if (range) values[range.key] = range.default === range.min ? range.max : range.min;
      }
    }
    checks.push({ file: row.file, game, variant, yaml: library.generate({ game, players: [variant === 'default' ? 'Daniel' : 'Friend'], values })[0].content });
  }
}
const python = library.pythonCommand();
const result = spawnSync(python[0], [...python.slice(1), join(root, 'scripts/validate_user_worlds.py'), ...process.argv.slice(2)], {
  input: JSON.stringify(checks), encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
