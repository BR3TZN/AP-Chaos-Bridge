// Real Windows integration: WebView2 + tray, portable Node replacement, restart,
// data preservation, and the server.mjs entry point used by older updaters.
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile, appendFile, readdir, rm, mkdtemp } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { validateManifest } from '../../lib/update-files.mjs';
import { parse } from 'yaml';
if (process.platform !== 'win32') throw new Error('Dieser Integrationstest benötigt Windows.');
const source = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const folder = await mkdtemp(join(tmpdir(), 'ap-desktop-check-')), root = join(folder, 'app');
const processes = [];
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function until(check, description, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await check(); if (value) return value; await delay(200); }
  throw new Error(description);
}
const socket = createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const env = { ...process.env, AP_BRIDGE_PORT: String(port) }; delete env.AP_BRIDGE_DESKTOP_PID; delete env.AP_BRIDGE_BROWSER;
const base = `http://127.0.0.1:${port}`;
async function state(path = '/api/state') { try { const r = await fetch(base + path, { signal: AbortSignal.timeout(1500) }); return r.ok ? await r.json() : null; } catch { return null; } }
async function post(path, value = {}) {
  const desktop = await state('/api/desktop'); assert(desktop, 'Hintergrunddienst fehlt.');
  const response = await fetch(base + '/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-Session': desktop.session }, body: JSON.stringify(value) });
  const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result)); return result;
}
function launch(executable, args = []) { const child = spawn(executable, args, { cwd: root, env, windowsHide: true, stdio: 'ignore' }); processes.push(child); return child; }
async function files(folder) {
  const result = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) { const path = join(folder, entry.name); if (entry.isDirectory()) result.push(...await files(path)); else result.push(path); }
  return result;
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  await mkdir(root, { recursive: true });
  for (const path of ['lib', 'public', 'scripts', 'node_modules', 'assets/windows']) await cp(join(source, path), join(root, path), { recursive: true });
  for (const path of ['package.json', 'package-lock.json', 'server.mjs', 'assets/core-world-settings.json', 'assets/apworld-import-limits.json']) { await mkdir(dirname(join(root, path)), { recursive: true }); await cp(join(source, path), join(root, path)); }
  const canonical = join(root, 'assets/windows/AP-Chaos-Bridge.exe');
  const smoke = launch(canonical, ['--smoke-test']);
  await until(() => smoke.exitCode !== null, 'Der Fenster-/Tray-Test wurde nicht beendet.', 90000);
  assert.equal(smoke.exitCode, 0, 'Details stehen in desktop-error.log.');
  const smokePath = join(root, 'data/desktop-smoke.json');
  await until(async () => { try { return (await readFile(smokePath, 'utf8')).length > 0; } catch { return false; } }, 'Der native Start hat kein Ergebnis geschrieben.', 10000);
  const result = JSON.parse(await readFile(smokePath, 'utf8'));
  assert.equal(result.ready, true); assert.equal(result.tray, true); assert.equal(result.noConsole, true); assert.equal(result.rules, '0'); assert.equal(result.download, true);
  const yaml = parse(await readFile(join(root, 'data/desktop-download.yaml'), 'utf8')); assert.equal(yaml.game, 'Factorio'); assert.equal(yaml.name, 'SmokePlayer');
  assert((await readFile(join(root, 'AP-Chaos-Bridge.exe'))).length > 10000);
  console.log('Echtes WebView2-Fenster, Schließen in den Tray und versteckter Hintergrunddienst geprüft:', result.runtime);

  const packageInfo = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const next = packageInfo.version.split('.').map(Number); next[2]++; const version = next.join('.');
  const id = randomUUID(), stage = join(root, 'data/updates', id, 'package'); await mkdir(stage, { recursive: true });
  const programFiles = (await files(root)).filter(path => !relative(root, path).startsWith('data' + '\\') && relative(root, path) !== 'AP-Chaos-Bridge.exe');
  for (const file of programFiles) { const target = join(stage, relative(root, file)); await mkdir(dirname(target), { recursive: true }); await cp(file, target); }
  await writeFile(join(stage, 'package.json'), JSON.stringify({ ...packageInfo, version }));
  // Harmless PE overlays make both executables different. This catches Windows
  // file locks even when the real release uses the same Node runtime version.
  for (const path of ['node.exe', 'AP-Chaos-Bridge.exe']) await appendFile(join(stage, 'assets/windows', path), '\nDesktop update fixture\n');
  const manifest = { schema: 1, name: packageInfo.name, version, files: [] };
  for (const path of await files(stage)) { const bytes = await readFile(path); manifest.files.push({ path: relative(stage, path).replaceAll('\\', '/'), size: bytes.length, sha256: hash(bytes), mode: 0o644 }); }
  validateManifest(manifest, version); await writeFile(join(stage, 'release-manifest.json'), JSON.stringify(manifest));
  await writeFile(join(root, 'data/updates/prepared.json'), JSON.stringify({ id, version }));
  await writeFile(join(root, 'data/preserved-test.txt'), 'my room data');
  const desktop = launch(canonical);
  await until(async () => (await state())?.updates.phase === 'ready', 'Vorbereitetes Desktop-Update fehlt.');
  await post('rule', { name: 'Preserved rule', source: 'charity', type: 'donation', effect: 'alert', target: 'random', enabled: false });
  const duplicate = launch(join(root, 'AP-Chaos-Bridge.exe'));
  await until(() => duplicate.exitCode !== null, 'Zweiter Start sollte das vorhandene Fenster öffnen.', 10000);
  assert.equal(duplicate.exitCode, 0); assert.equal(desktop.exitCode, null);
  await post('updates/install');
  await until(() => desktop.exitCode !== null, 'Altes Fenster wurde vor dem Update nicht beendet.', 15000);
  const updated = await until(async () => { const value = await state(); return value?.version === version && value.updates.lastResult?.phase === 'installed' ? value : null; }, 'Desktop-Update oder automatischer Neustart fehlgeschlagen.', 90000);
  const newDesktop = await state('/api/desktop'); assert(newDesktop.desktopPid > 0); processes.push({ pid: newDesktop.desktopPid });
  assert.equal(updated.rules[0].name, 'Preserved rule'); assert.equal(await readFile(join(root, 'data/preserved-test.txt'), 'utf8'), 'my room data');
  assert.equal(hash(await readFile(join(root, 'assets/windows/node.exe'))), manifest.files.find(file => file.path === 'assets/windows/node.exe').sha256);
  await post('shutdown'); await until(() => !alive(newDesktop.desktopPid), 'Das aktualisierte Fenster wurde nicht beendet.', 15000);
  console.log('Desktop-Update ersetzt laufende EXE und portable Node-Laufzeit; Fenster, Regeln und Daten starten korrekt neu.');

  const proxy = launch(join(root, 'assets/windows/node.exe'), [join(root, 'server.mjs')]);
  const compatible = await until(() => state('/api/desktop'), 'Kompatibler Start über server.mjs fehlt.');
  processes.push({ pid: compatible.desktopPid }); assert(compatible.desktopPid > 0); assert.equal(proxy.exitCode, null);
  await post('shutdown'); await until(() => proxy.exitCode !== null, 'Kompatibler Startprozess wurde nicht beendet.', 15000); assert.equal(proxy.exitCode, 0);
  console.log('Ältere Updater öffnen das neue Desktop-Fenster über server.mjs ohne vorzeitigen Prozessabbruch.');
} catch (error) {
  await mkdir(join(source, 'data'), { recursive: true });
  try { for (const path of await files(join(root, 'data'))) if (/\.(log|json)$/.test(path) && /desktop-|install\.log|restart\.log|result\.json/.test(path)) { await cp(path, join(source, 'data', 'verify-' + relative(root, path).replaceAll(/[\\/]/g, '-'))); if (path.endsWith('.log')) console.error(relative(root, path), (await readFile(path, 'utf8')).slice(-8000)); } } catch {}
  throw error;
} finally {
  for (const child of processes) if (child.pid && alive(child.pid)) { const kill = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); await new Promise(resolve => { kill.once('exit', resolve); kill.once('error', resolve); }); }
  await rm(folder, { recursive: true, force: true, maxRetries: 30, retryDelay: 250 });
}
