import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server.mjs';
import { VERSION } from '../lib/model.mjs';
import { writeZip } from '../lib/zip.mjs';
import { Updater, selectRelease, extractRelease, safeReleaseRedirect } from '../lib/updater.mjs';
import { isNewer, applyPreparedUpdate, verifyPreparedPackage } from '../lib/update-files.mjs';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const temp = t => { const path = mkdtempSync(join(tmpdir(), 'ap-updater-')); t.after(() => rmSync(path, { recursive: true, force: true })); return path; };
const save = (path, bytes) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); };
function fixture(version = '0.3.2', extra = {}) {
  const files = {
    'server.mjs': `import {createServer} from 'node:http'; const s=createServer((q,r)=>{r.setHeader('Content-Type','application/json');r.end(JSON.stringify({name:'AP Chaos Bridge',version:'${version}',pid:process.pid}));});s.listen(Number(process.env.AP_BRIDGE_PORT||0),'127.0.0.1',()=>console.log(s.address().port));`,
    'package.json': JSON.stringify({ name: 'ap-chaos-bridge', version, engines: { node: '>=22' } }),
    'node_modules/ws/package.json': '{}', 'node_modules/yaml/package.json': '{}', 'node_modules/yauzl/package.json': '{}',
    'scripts/apply-update.mjs': readFileSync(join(root, 'scripts/apply-update.mjs'), 'utf8'),
    'lib/update-files.mjs': readFileSync(join(root, 'lib/update-files.mjs'), 'utf8'),
    'lib/version.mjs': `export default '${version}';`, 'apworlds/bundled/game.apworld': 'Bundled ' + version, ...extra,
  };
  const manifest = { schema: 1, name: 'ap-chaos-bridge', version, files: Object.entries(files).map(([path, content]) => ({ path, size: Buffer.byteLength(content), sha256: hash(content), mode: 0o644 })) };
  files['release-manifest.json'] = JSON.stringify(manifest);
  const zip = writeZip(Object.entries(files).map(([name, content]) => ({ name: 'AP-Chaos-Bridge/' + name, content })));
  const release = { tag_name: 'v' + version, draft: false, prerelease: false, assets: [{ id: 42, name: `AP-Chaos-Bridge-v${version}.zip`, state: 'uploaded', size: zip.length, digest: 'sha256:' + hash(zip) }] };
  return { files, zip, release, manifest };
}
function putFixture(target, data) { for (const [path, content] of Object.entries(data.files)) save(join(target, path), content); }
test('stable release selection compares numeric versions and requires the full checksummed package', () => {
  assert(isNewer('v0.10.0', '0.9.9')); assert(!isNewer('0.3.1', '0.3.1')); assert(!isNewer('0.1.0', '0.3.1'));
  const data = fixture(); assert.equal(selectRelease(data.release, '0.3.1').version, '0.3.2'); assert.equal(selectRelease({ tag_name: '0.1.0' }, '0.3.1').available, false);
  for (const patch of [{ prerelease: true }, { draft: true }, { tag_name: 'v0.4.0-beta.1' }, { assets: [{ ...data.release.assets[0], digest: null }] }, { assets: [{ ...data.release.assets[0], name: 'source.zip' }] }]) assert.throws(() => selectRelease({ ...data.release, ...patch }, '0.3.1'));
});
test('authenticated release download strips the token on redirects and stages a verified package', async t => {
  const directory = temp(t), data = fixture(), seen = [];
  const updater = new Updater({ root: directory, directory, currentVersion: '0.3.1', getToken: () => 'private-github-token', fetchImpl: async (url, options) => {
    seen.push({ url, authorization: options.headers.Authorization }); if (url.endsWith('/releases/latest')) return Response.json(data.release);
    if (url.endsWith('/releases/assets/42')) return new Response(null, { status: 302, headers: { Location: 'https://release-assets.githubusercontent.com/test.zip' } }); return new Response(data.zip);
  } });
  await updater.check(); updater.startDownload(); await updater.operation;
  assert.equal(updater.state.phase, 'ready'); assert.equal(seen[0].authorization, 'Bearer private-github-token'); assert.equal(seen[1].authorization, 'Bearer private-github-token'); assert.equal(seen[2].authorization, undefined);
  assert(!JSON.stringify(updater.snapshot()).includes('private-github-token')); assert(existsSync(join(updater.directory, updater.prepared.id, 'package', 'server.mjs'))); assert(!existsSync(join(directory, 'server.mjs')));
  for (const url of ['http://github.com/file', 'https://github.com.evil.test/file', 'https://user:secret@github.com/file', 'https://127.0.0.1/file']) assert.throws(() => safeReleaseRedirect(url));
});
test('bad downloads and manifests never modify the installation or become installable', async t => {
  const directory = temp(t), data = fixture(); save(join(directory, 'server.mjs'), 'original'); data.release.assets[0].digest = 'sha256:' + '0'.repeat(64);
  const updater = new Updater({ root: directory, directory, currentVersion: '0.3.1', fetchImpl: async url => url.endsWith('/latest') ? Response.json(data.release) : new Response(data.zip) });
  await updater.check(); updater.startDownload(); assert.throws(() => updater.startDownload(), /bereits/); await updater.operation;
  assert.equal(updater.state.phase, 'error'); assert.match(updater.state.message, /SHA-256/); assert.equal(readFileSync(join(directory, 'server.mjs'), 'utf8'), 'original'); assert(!updater.prepared);
  const stage = join(directory, 'stage'); putFixture(stage, fixture()); save(join(stage, 'server.mjs'), 'tampered'); await assert.rejects(verifyPreparedPackage(stage, '0.3.2'), /Dateiprüfung/);
});
test('release extraction rejects traversal, user data, case collisions and symlinks', async t => {
  const directory = temp(t), cases = [[{ name: 'AP-Chaos-Bridge/../escape.txt', content: 'x' }], [{ name: 'AP-Chaos-Bridge/data/state.json', content: '{}' }], [{ name: 'AP-Chaos-Bridge/lib/Test.mjs', content: 'x' }, { name: 'AP-Chaos-Bridge/lib/test.mjs', content: 'y' }]];
  for (let i = 0; i < cases.length; i++) { const archive = join(directory, i + '.zip'); save(archive, writeZip(cases[i])); await assert.rejects(extractRelease(archive, join(directory, 'out' + i))); }
  const link = writeZip([{ name: 'AP-Chaos-Bridge/lib/link', content: '../../outside' }]), central = link.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); link.writeUInt32LE((0xa1ff << 16) >>> 0, central + 38);
  const archive = join(directory, 'link.zip'); save(archive, link); await assert.rejects(extractRelease(archive, join(directory, 'symlink')), /Links/); assert(!existsSync(join(directory, 'escape.txt')));
});
test('installation preserves rooms and custom worlds, removes obsolete managed files and backs up changes', async t => {
  const directory = temp(t), app = join(directory, 'app'), stage = join(directory, 'stage'), backup = join(directory, 'backup'); putFixture(app, fixture('0.3.1', { 'lib/obsolete.mjs': 'old managed file' })); putFixture(stage, fixture());
  save(join(app, 'data/rooms/demo/state.json'), 'saved room'); save(join(app, 'data/connections.enc'), 'saved credentials'); save(join(app, 'apworlds/own.apworld'), 'user world'); save(join(app, 'apworlds/bundled/game.apworld'), 'modified user world');
  const result = await applyPreparedUpdate({ root: app, stage, backup, version: '0.3.2' });
  assert.match(readFileSync(join(app, 'server.mjs'), 'utf8'), /0.3.2/); assert(!existsSync(join(app, 'lib/obsolete.mjs'))); assert.equal(readFileSync(join(app, 'data/rooms/demo/state.json'), 'utf8'), 'saved room'); assert.equal(readFileSync(join(app, 'data/connections.enc'), 'utf8'), 'saved credentials');
  assert.equal(readFileSync(join(app, 'apworlds/own.apworld'), 'utf8'), 'user world'); assert.equal(readFileSync(join(app, 'apworlds/bundled/game.apworld'), 'utf8'), 'modified user world'); assert(result.preserved.includes('apworlds/bundled/game.apworld')); assert.match(readFileSync(join(backup, 'files/server.mjs'), 'utf8'), /0.3.1/);
});
test('an interrupted write rolls back changed and newly created program files', async t => {
  const directory = temp(t), app = join(directory, 'app'), stage = join(directory, 'stage'), backup = join(directory, 'backup'), previous = fixture('0.3.1'); putFixture(app, previous); putFixture(stage, fixture('0.3.2', { 'lib/new.mjs': 'new file' }));
  await assert.rejects(applyPreparedUpdate({ root: app, stage, backup, version: '0.3.2', onWrite: path => { if (path === 'release-manifest.json') throw new Error('simulated write failure'); } }), /simulated write failure/);
  for (const [path, content] of Object.entries(previous.files)) assert.equal(readFileSync(join(app, path), 'utf8'), content, path); assert(!existsSync(join(app, 'lib/new.mjs')));
});
test('update API protects credentials and stores the repository token outside room exports', async t => {
  const next = VERSION.split('.').map(Number); next[2]++; const directory = mkdtempSync(join(tmpdir(), 'ap-updater-api-')), data = fixture(next.join('.'));
  const app = await createApp({ directory, port: 0, worldsDirectory: join(directory, 'worlds'), fetchImpl: async () => Response.json(data.release) }); t.after(() => { app.close(); rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  const post = (path, data, authorized = true) => fetch(app.url + '/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorized ? { 'X-Bridge-Session': app.snapshot().session } : {}) }, body: JSON.stringify(data) });
  assert.equal((await post('updates/token', { token: 'private-test-token' }, false)).status, 403); assert.equal((await post('updates/token', { token: 'private-test-token' })).status, 200);
  assert.equal((await post('updates/check', {})).status, 200); assert.equal(app.snapshot().updates.available, true); assert.equal(app.snapshot().updates.hasToken, true);
  assert(!JSON.stringify(app.snapshot()).includes('private-test-token')); assert(!(await fetch(app.url + '/api/export').then(r => r.text())).includes('private-test-token')); assert(!readFileSync(join(directory, 'connections.enc')).includes(Buffer.from('private-test-token')));
  const room = app.rooms.create({ name: 'another' }); app.rooms.remove(room.id); assert.equal(app.vault.get('__application_updates__').githubToken, 'private-test-token');
  assert.equal((await post('updates/token', { token: '••••••••' })).status, 200); assert.equal(app.vault.get('__application_updates__').githubToken, 'private-test-token'); assert.equal((await post('updates/token', { token: '' })).status, 200); assert.equal(app.snapshot().updates.hasToken, false);
});
async function helperScenario(t, failStart) {
  const directory = mkdtempSync(join(tmpdir(), 'ap-updater-helper-')), app = join(directory, 'app'), updates = join(app, 'data/updates'), stage = join(updates, 'prepared/package');
  putFixture(app, fixture('0.3.1')); putFixture(stage, fixture('0.3.2', failStart ? { 'server.mjs': "import {writeFileSync} from 'node:fs'; writeFileSync('data/state.json','failed migration'); throw new Error('simulated startup failure');", 'lib/added.mjs': 'new file' } : {})); save(join(app, 'data/state.json'), 'room data'); save(join(app, 'apworlds/own.apworld'), 'own world');
  const previous = spawn(process.execPath, [join(app, 'server.mjs')], { cwd: app, env: { ...process.env, AP_BRIDGE_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] }); let newPid;
  t.after(async () => { try { previous.kill(); } catch {} if (newPid) { try { process.kill(newPid); } catch {} await delay(200); } rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
  const port = Number((await once(previous.stdout, 'data'))[0].toString().trim()); assert(port > 1023);
  const job = { root: app, stage, directory: updates, backup: join(updates, 'backups/test'), version: '0.3.2', parentPid: previous.pid, port }, jobPath = join(updates, 'job.json'); save(jobPath, JSON.stringify(job));
  const helper = spawn(process.execPath, [join(root, 'scripts/apply-update.mjs'), jobPath], { stdio: ['ignore', 'pipe', 'pipe'] }); let errorText = ''; helper.stderr.on('data', bytes => errorText += bytes);
  const done = once(helper, 'exit'); previous.kill(); await once(previous, 'exit'); const timeout = setTimeout(() => helper.kill(), 30000); const [code] = await done; clearTimeout(timeout);
  const state = await fetch(`http://127.0.0.1:${port}/api/state`).then(r => r.json()); newPid = state.pid; assert.equal(state.version, failStart ? '0.3.1' : '0.3.2', errorText); assert.equal(code, failStart ? 1 : 0, errorText);
  const result = JSON.parse(readFileSync(join(updates, 'result.json'), 'utf8')); assert.equal(result.phase, failStart ? 'error' : 'installed'); assert.equal(readFileSync(join(app, 'data/state.json'), 'utf8'), 'room data'); assert.equal(readFileSync(join(app, 'apworlds/own.apworld'), 'utf8'), 'own world'); if (failStart) { assert.match(result.message, /wiederhergestellt/); assert(!existsSync(join(app, 'lib/added.mjs'))); }
}
test('standalone helper installs and restarts a real local process', async t => helperScenario(t, false));
test('standalone helper restores program and data after a failed startup', async t => helperScenario(t, true));
