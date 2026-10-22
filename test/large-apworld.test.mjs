import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip, writeZip, APWORLD_LIMITS, APWORLD_BASE64_LIMIT } from '../lib/zip.mjs';
import { GameLibrary } from '../lib/game-library.mjs';
import { createApp } from '../server.mjs';
import { parse } from 'yaml';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const worldPath = join(root, 'apworlds/github-com-Cyb3RGER/83a74e2d/bfbb.apworld');
const bundled = existsSync(worldPath);

test('large APworld imports retain archive, expanded-resource and selected-source limits', () => {
  assert(APWORLD_BASE64_LIMIT >= Math.ceil(APWORLD_LIMITS.maxArchiveBytes / 3) * 4);
  assert.throws(() => readZip(Buffer.allocUnsafe(APWORLD_LIMITS.maxArchiveBytes + 1)), /128 MiB/);
  const resources = writeZip([{ name: 'world/data.bin', content: '' }]);
  resources.writeUInt32LE(APWORLD_LIMITS.maxUncompressedBytes + 1, resources.readUInt32LE(resources.length - 22 + 16) + 24);
  assert.throws(() => readZip(resources, { worldOnly: true }), /Entpackte APworld/);
  assert.throws(() => readZip(writeZip([{ name: 'world/too_big.py', content: Buffer.alloc(APWORLD_LIMITS.maxSourceFileBytes + 1, 32) }]), { worldOnly: true }), /Quelldatei/);
  const many = writeZip(Array.from({ length: 5 }, (_, i) => ({ name: `world/file${i}.py`, content: Buffer.alloc(APWORLD_LIMITS.maxSourceFileBytes, 32) })));
  assert.throws(() => readZip(many, { worldOnly: true }), /zusammen zu groß/);
});

test('the original BfBB archive imports without Python after being renamed or scanned from a custom folder', { skip: !bundled }, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'ap-large-')), folder = join(directory, 'worlds'); mkdirSync(folder);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const bytes = readFileSync(worldPath); assert(bytes.length > 40 * 1024 ** 2);
  const files = readZip(bytes, { worldOnly: true }); assert(files.some(f => f.name.endsWith('/Options.py'))); assert(!files.some(f => /\.(dll|exe|so)$/i.test(f.name)));
  writeFileSync(join(folder, 'renamed.apworld'), bytes);
  const library = new GameLibrary(directory, root, { memory: true, folder }); library.pythonCommand = () => { throw new Error('Python must not be invoked'); };
  const report = await library.scan(); assert.deepEqual(report.errors, []);
  const entry = library.get('Battle for Bikini Bottom'); assert.equal(entry.worldVersion, '1.2.5'); assert.equal(entry.minimumAPVersion, '0.6.7'); assert.equal(entry.options.length, 22); assert.deepEqual(entry.unresolved, []);
  const yaml = library.generate({ game: entry.game, players: ['Daniel', 'Friend'], values: { death_link: true, randomize_gate_cost: 'off', required_spatulas: 80 } });
  assert.equal(yaml.length, 2); assert.equal(parse(yaml[1].content, { version: '1.1' }).name, 'Friend'); assert.equal(parse(yaml[0].content, { version: '1.1' })[entry.game].randomize_gate_cost, 'off');
});

test('real HTTP upload accepts the 80 MB BfBB file and exports settings for multiple players', { skip: !bundled }, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'ap-large-http-'));
  const app = await createApp({ memory: true, directory, worldsDirectory: join(directory, 'worlds'), port: 0 });
  t.after(() => { app.close(); rmSync(directory, { recursive: true, force: true }); });
  app.library.pythonCommand = () => { throw new Error('Python must not be invoked'); };
  const response = await fetch(app.url + '/api/worlds/upload', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-Session': app.snapshot().session }, body: JSON.stringify({ name: 'bfbb.apworld', content: readFileSync(worldPath).toString('base64') }) });
  assert.equal(response.status, 200, await response.clone().text()); assert.deepEqual((await response.json()).games, ['Battle for Bikini Bottom']);
  assert.equal(app.snapshot().gameLibrary.importLimits.maxArchiveBytes, APWORLD_LIMITS.maxArchiveBytes);
  const result = await fetch(app.url + '/api/yaml/bundle', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-Session': app.snapshot().session }, body: JSON.stringify({ game: 'Battle for Bikini Bottom', players: ['Daniel', 'Friend'], values: { death_link: true } }) });
  assert.equal(result.status, 200); const documents = readZip(Buffer.from(await result.arrayBuffer())); assert.equal(documents.length, 2); assert(documents.every(f => parse(f.text, { version: '1.1' })['Battle for Bikini Bottom'].death_link === true));
});


test('pinned large-world preparation reconstructs a missing file and rejects a different World hash', t => {
  const directory = mkdtempSync(join(tmpdir(), 'ap-large-prepare-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'assets')); mkdirSync(join(directory, '.catalog-cache'));
  writeFileSync(join(directory, 'assets/apworld-import-limits.json'), JSON.stringify(APWORLD_LIMITS));
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const world = writeZip([{ name: 'fixture/__init__.py', content: "class Fixture(World):\n game = 'Pinned fixture'" }]);
  const bundle = writeZip([{ name: 'world.apworld', content: world }]);
  const spec = { file: 'fixture/world.apworld', member: 'world.apworld', bytes: world.length, sha256: hash(world), bundleSha256: hash(bundle), url: 'https://github.com/example/world/releases/download/v1/release.zip' };
  const manifest = join(directory, 'assets/large-apworlds.json');
  writeFileSync(manifest, JSON.stringify({ worlds: [spec] })); writeFileSync(join(directory, '.catalog-cache', hash(bundle) + '.zip'), bundle);
  const args = new GameLibrary(directory, root, { memory: true }).pythonCommand();
  const run = () => spawnSync(args[0], [...args.slice(1), '-X', 'utf8', '-c', "import runpy,sys;from pathlib import Path;runpy.run_path(sys.argv[1])['prepare'](Path(sys.argv[2]))", join(root, 'scripts/prepare_large_apworlds.py'), directory], { encoding: 'utf8', timeout: 30000, windowsHide: true });
  let result = run(); assert.equal(result.status, 0, result.stderr); assert.deepEqual(readFileSync(join(directory, 'apworlds', spec.file)), world);
  rmSync(join(directory, 'apworlds', spec.file)); const changed = Buffer.from(world); changed[changed.length - 1] ^= 1;
  const badBundle = writeZip([{ name: 'world.apworld', content: changed }]); spec.bundleSha256 = hash(badBundle);
  writeFileSync(manifest, JSON.stringify({ worlds: [spec] })); writeFileSync(join(directory, '.catalog-cache', hash(badBundle) + '.zip'), badBundle);
  result = run(); assert.notEqual(result.status, 0); assert(result.stderr.includes('SHA-256 der APworld')); assert(!existsSync(join(directory, 'apworlds', spec.file)));
});

test('pinned direct APworld assets are copied byte-for-byte and checked for exact size', t => {
  const directory = mkdtempSync(join(tmpdir(), 'ap-direct-prepare-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'assets')); mkdirSync(join(directory, '.catalog-cache'));
  writeFileSync(join(directory, 'assets/apworld-import-limits.json'), JSON.stringify(APWORLD_LIMITS));
  const world = writeZip([{ name: 'fixture/__init__.py', content: "class Fixture(World):\n game = 'Direct fixture'" }]);
  const sha256 = createHash('sha256').update(world).digest('hex');
  const spec = { file: 'fixture.apworld', bytes: world.length, sha256, url: 'https://github.com/example/world/releases/download/v1/fixture.apworld' };
  const manifest = join(directory, 'assets/large-apworlds.json');
  writeFileSync(manifest, JSON.stringify({ worlds: [spec] })); writeFileSync(join(directory, '.catalog-cache', sha256 + '.zip'), world);
  const args = new GameLibrary(directory, root, { memory: true }).pythonCommand();
  const run = () => spawnSync(args[0], [...args.slice(1), '-X', 'utf8', '-c', "import runpy,sys;from pathlib import Path;runpy.run_path(sys.argv[1])['prepare'](Path(sys.argv[2]))", join(root, 'scripts/prepare_large_apworlds.py'), directory], { encoding: 'utf8', timeout: 30000, windowsHide: true });
  let result = run(); assert.equal(result.status, 0, result.stderr); assert.deepEqual(readFileSync(join(directory, 'apworlds', spec.file)), world);
  rmSync(join(directory, 'apworlds', spec.file)); spec.bytes++;
  writeFileSync(manifest, JSON.stringify({ worlds: [spec] })); result = run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /Dateigröße/);
  assert(!existsSync(join(directory, 'apworlds', spec.file)));
});
