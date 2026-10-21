import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { deepStrictEqual } from 'node:assert';
import { parse } from 'yaml';
import { GameLibrary, apworldFiles } from '../lib/game-library.mjs';
import { readZip } from '../lib/zip.mjs';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cache = JSON.parse(readFileSync(join(root, 'assets/apworld-settings.json')));
const manifest = JSON.parse(readFileSync(join(root, 'assets/apworld-downloads.json')));
const provenance = new Map([...manifest.entries.flatMap(row => row.files || []), ...(manifest.userImports || [])].map(file => [file.file, file]));
const library = new GameLibrary('.', root, { memory: true });
const report = { checkedAt: new Date().toISOString(), files: 0, variants: 0, exportedGames: 0, errors: [], parserErrors: cache.errors };
const games = new Set(), compatibilityChecks = [];
for (const file of apworldFiles(join(root, 'apworlds'))) {
  try {
    const bytes = readFileSync(file.path), hash = createHash('sha256').update(bytes).digest('hex');
    if (!provenance.has(file.name) || provenance.get(file.name).sha256 !== hash) throw new Error('Herkunft oder SHA-256 fehlt');
    readZip(bytes, { worldOnly: true }); report.files++;
    const data = cache.files[file.name]; if (!data) { if (!cache.errors.some(e => e.file === file.name)) throw new Error('Metadaten fehlen'); continue; }
    if (data.sha256 !== hash) throw new Error('Metadaten-Hash stimmt nicht');
    for (const world of data.worlds) {
      const entry = library.entry(world, file.name); library.data.games[world.game] = entry;
      const yaml = library.generate({ game: world.game, values: entry.base[world.game], players: ['Validation'] })[0].content;
      const expected = { ...structuredClone(entry.base), name: 'Validation' };
      deepStrictEqual(parse(yaml, { version: '1.1' }), expected);
      compatibilityChecks.push({ file: file.name, game: world.game, yaml, expected });
      report.variants++; games.add(world.game);
    }
  } catch (error) { report.errors.push({ file: file.name, error: error.message }); }
}
report.exportedGames = games.size;
report.yamlSchema = '1.1'; report.yamlRoundTrips = compatibilityChecks.length;
if (process.argv.includes('--pyyaml')) {
  const python = library.pythonCommand();
  const result = spawnSync(python[0], [...python.slice(1), join(root, 'scripts/validate_yaml_compat.py')], { input: JSON.stringify(compatibilityChecks), encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  try {
    report.pythonYaml = JSON.parse(result.stdout);
    report.errors.push(...report.pythonYaml.errors);
  } catch { report.errors.push({ error: 'PyYAML-Prüfung fehlgeschlagen. Python mit PyYAML installieren. ' + (result.stderr || result.error?.message || '') }); }
}
writeFileSync(join(root, 'assets/apworld-validation.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
if (report.errors.length) process.exitCode = 1;
