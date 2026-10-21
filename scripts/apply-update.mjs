import { readFile, writeFile, open, rm, cp, readdir, mkdir } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { applyPreparedUpdate, rollbackUpdate, releaseVersion } from '../lib/update-files.mjs';

async function alive(pid) { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } }
async function launch(job) {
  const output = await open(join(job.directory, 'restart.log'), 'a', 0o600);
  try {
    const child = spawn(process.execPath, [join(job.root, 'server.mjs')], { cwd: job.root, env: { ...process.env, AP_BRIDGE_PORT: String(job.port) }, detached: true, windowsHide: true, stdio: ['ignore', output.fd, output.fd] });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); }); child.unref(); return child;
  } finally { await output.close(); }
}
async function health(job, child, expected) {
  for (let i = 0; i < 80; i++) {
    try { const response = await fetch(`http://127.0.0.1:${job.port}/api/state`, { signal: AbortSignal.timeout(700) }); const state = await response.json(); if (response.ok && state.name === 'AP Chaos Bridge' && (!expected || state.version === expected)) return; } catch {}
    if (child.exitCode !== null || child.signalCode !== null) break;
    await delay(250);
  }
  throw new Error('Die aktualisierte Bridge konnte nicht erfolgreich starten.');
}
async function stopChild(child) {
  if (!await alive(child.pid)) return; child.kill();
  for (let i = 0; i < 40 && await alive(child.pid); i++) await delay(100);
  if (await alive(child.pid)) { child.kill('SIGKILL'); for (let i = 0; i < 40 && await alive(child.pid); i++) await delay(100); }
  if (await alive(child.pid)) throw new Error('Der neue Prozess läuft weiter. Vor einer manuellen Wiederherstellung die Bridge vollständig beenden.');
}
async function main() {
  const job = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const stageRelative = relative(job.directory, job.stage), backupRelative = relative(job.directory, job.backup);
  if (!releaseVersion(job.version) || !Number.isInteger(job.parentPid) || job.parentPid < 1 || !Number.isInteger(job.port) || job.port < 1024 || job.port > 65535 || resolve(job.directory) !== resolve(job.root, 'data/updates') || [stageRelative, backupRelative].some(path => !path || path.startsWith('..') || isAbsolute(path))) throw new Error('Ungültiger Update-Auftrag.');
  const saveResult = values => writeFile(join(job.directory, 'result.json'), JSON.stringify({ version: job.version, backup: job.backup, ...values }, null, 2), { mode: 0o600 });
  let transaction, child, dataSaved = false;
  try {
    for (let i = 0; i < 160 && await alive(job.parentPid); i++) await delay(250);
    if (await alive(job.parentPid)) throw new Error('Die laufende Bridge wurde nicht rechtzeitig beendet.');
    await mkdir(join(job.backup, 'saved-data'), { recursive: true }); const data = join(job.root, 'data');
    for (const entry of await readdir(data)) if (entry !== 'updates') await cp(join(data, entry), join(job.backup, 'saved-data', entry), { recursive: true });
    dataSaved = true; transaction = await applyPreparedUpdate(job);
    await saveResult({ phase: 'installed', message: 'Update installiert. Die Bridge wurde im Testmodus und pausiert gestartet.', preserved: transaction.preserved });
    child = await launch(job); await health(job, child, job.version);
    await rm(join(job.directory, 'prepared.json'), { force: true }).catch(() => {}); await rm(job.stage, { recursive: true, force: true }).catch(() => {});
  } catch (error) {
    if (child) { try { await stopChild(child); } catch (stopError) { await saveResult({ phase: 'error', message: stopError.message }); throw stopError; } }
    let message = error.message;
    if (transaction) { try { await rollbackUpdate(job.root, job.backup, transaction.journal); message += ' Die vorherige Version wurde wiederhergestellt.'; } catch (rollbackError) { message += ' Wiederherstellung fehlgeschlagen: ' + rollbackError.message; } }
    if (dataSaved) {
      try { const data = join(job.root, 'data'); for (const entry of await readdir(data)) if (entry !== 'updates') await rm(join(data, entry), { recursive: true, force: true }); for (const entry of await readdir(join(job.backup, 'saved-data'))) await cp(join(job.backup, 'saved-data', entry), join(data, entry), { recursive: true }); }
      catch (dataError) { message += ' Datenwiederherstellung fehlgeschlagen: ' + dataError.message; }
    }
    await saveResult({ phase: 'error', message });
    if (!await alive(job.parentPid)) { try { const previous = await launch(job); await health(job, previous); } catch (restartError) { console.error('Neustart:', restartError.message); } }
    throw error;
  }
}
main().catch(error => { console.error(new Date().toISOString(), error.message); process.exitCode = 1; });
