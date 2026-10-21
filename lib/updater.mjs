import { createWriteStream, readFileSync, existsSync } from 'node:fs';
import { mkdir, writeFile, copyFile, open, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import { VERSION } from './model.mjs';
import { releaseVersion, isNewer, safeUpdatePath, safeTarget, verifyPreparedPackage } from './update-files.mjs';

export const UPDATE_REPOSITORY = 'BR3TZN/AP-Chaos-Bridge';
const API = `https://api.github.com/repos/${UPDATE_REPOSITORY}`;
const activeStates = new Set(['checking', 'downloading', 'extracting', 'verifying', 'installing']);
export function selectRelease(release, current = VERSION) {
  const version = releaseVersion(release?.tag_name);
  if (!version || release.draft || release.prerelease) throw new Error('Kein stabiles Release mit gültiger Versionsnummer gefunden.');
  if (!isNewer(version, current)) return { version, available: false };
  const asset = release.assets?.find(file => file.name === `AP-Chaos-Bridge-v${version}.zip` && file.state === 'uploaded');
  if (!asset || !Number.isSafeInteger(asset.id) || asset.id <= 0 || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > 1024 ** 3 || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '')) throw new Error('Das neue Release enthält noch kein vollständiges Update-ZIP mit SHA-256-Prüfsumme.');
  return { version, available: true, releaseUrl: `https://github.com/${UPDATE_REPOSITORY}/releases/tag/${encodeURIComponent(release.tag_name)}`, asset: { id: asset.id, name: asset.name, size: asset.size, sha256: asset.digest.slice(7) } };
}
export function safeReleaseRedirect(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !['api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(url.hostname)) throw new Error('Unerwartetes Download-Ziel von GitHub.');
  return url;
}
export async function extractRelease(archive, stage) {
  await mkdir(stage, { recursive: true });
  const zip = await yauzl.openPromise(archive, { strictFileNames: true, validateEntrySizes: true });
  const files = new Set(), lowerNames = new Set(); let total = 0, count = 0;
  try {
    for await (const entry of zip.eachEntry()) {
      if (++count > 26000 || !entry.fileName.startsWith('AP-Chaos-Bridge/')) throw new Error('Unbekanntes oder zu großes Release-Archiv.');
      const type = (entry.externalFileAttributes >>> 16) & 0xf000;
      if (entry.isEncrypted() || (type && type !== 0x8000 && type !== 0x4000)) throw new Error('Links oder verschlüsselte Dateien im Update sind nicht erlaubt.');
      if (entry.fileName.endsWith('/')) continue;
      const name = safeUpdatePath(entry.fileName.slice('AP-Chaos-Bridge/'.length));
      if (lowerNames.has(name.toLowerCase()) || entry.uncompressedSize > 256 * 1024 * 1024 || (total += entry.uncompressedSize) > 2 * 1024 ** 3) throw new Error('Doppelte Dateien oder entpacktes Release zu groß.');
      lowerNames.add(name.toLowerCase()); files.add(name);
      const target = await safeTarget(stage, name); await mkdir(dirname(target), { recursive: true });
      await pipeline(await zip.openReadStreamPromise(entry), createWriteStream(target, { flags: 'wx', mode: 0o600 }));
    }
  } finally { zip.close(); }
  return files;
}
export class Updater {
  constructor({ root, directory, fetchImpl = fetch, getToken = () => '', changed = () => {}, allowInstall = false, currentVersion = VERSION }) {
    this.root = root; this.directory = join(directory, 'updates'); this.fetch = fetchImpl; this.getToken = getToken;
    this.changed = changed; this.allowInstall = allowInstall; this.version = currentVersion;
    this.state = { phase: 'idle', message: 'Noch nicht geprüft.', latestVersion: null, available: false, downloaded: 0, total: 0, checkedAt: null };
    try { this.lastResult = JSON.parse(readFileSync(join(this.directory, 'result.json'), 'utf8')); } catch {}
    try {
      const prepared = JSON.parse(readFileSync(join(this.directory, 'prepared.json'), 'utf8'));
      if (/^[a-f0-9-]{36}$/.test(prepared.id) && releaseVersion(prepared.version) && isNewer(prepared.version, this.version) && existsSync(join(this.directory, prepared.id, 'package', 'release-manifest.json'))) {
        this.prepared = prepared; this.state = { ...this.state, phase: 'ready', latestVersion: prepared.version, available: true, message: 'Update heruntergeladen und geprüft. Bereit zum Installieren.' };
      }
    } catch {}
  }
  snapshot() {
    return { ...this.state, currentVersion: this.version, repository: UPDATE_REPOSITORY, hasToken: Boolean(this.getToken()), installSupported: this.allowInstall,
      lastResult: this.lastResult ? { phase: this.lastResult.phase, version: this.lastResult.version, message: this.lastResult.message, backup: this.lastResult.backup } : null };
  }
  set(values) { Object.assign(this.state, values); this.changed(); }
  assertIdle() { if (this.busy || activeStates.has(this.state.phase)) throw new Error('Ein Update-Vorgang läuft bereits.'); }
  headers(binary = false, authorize = true) {
    const token = authorize ? this.getToken() : '';
    return { Accept: binary ? 'application/octet-stream' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'AP-Chaos-Bridge/' + this.version, ...(token ? { Authorization: 'Bearer ' + token } : {}) };
  }
  async check() {
    this.assertIdle(); this.busy = true; const wasPrepared = this.prepared;
    this.set({ phase: 'checking', message: 'GitHub-Releases werden geprüft.' });
    try {
      const response = await this.fetch(API + '/releases/latest', { headers: this.headers(), signal: AbortSignal.timeout(15000), redirect: 'error' });
      if (!response.ok) {
        if (response.status === 404) throw new Error('Kein Release erreichbar. Bei einem privaten Repo einen GitHub-Token mit Leserecht für dieses Repository speichern.');
        if (response.status === 401) throw new Error('GitHub-Token ist ungültig oder abgelaufen.');
        if (response.status === 403 || response.status === 429) throw new Error('GitHub verweigert die Abfrage oder begrenzt sie vorübergehend. Zugriffsrechte prüfen und später erneut versuchen.');
        throw new Error('GitHub-Releases sind derzeit nicht erreichbar (HTTP ' + response.status + ').');
      }
      const candidate = selectRelease(await response.json(), this.version); this.candidate = candidate;
      const ready = wasPrepared && candidate.available && wasPrepared.version === candidate.version; if (!ready) this.prepared = null;
      this.set({ phase: ready ? 'ready' : candidate.available ? 'available' : 'current', latestVersion: candidate.version, releaseUrl: candidate.releaseUrl || '', available: candidate.available, checkedAt: Date.now(),
        message: ready ? 'Update heruntergeladen und geprüft. Bereit zum Installieren.' : candidate.available ? 'Neue Version verfügbar.' : 'Die installierte Version ist aktuell.' });
      return this.snapshot();
    } catch (error) { this.set({ phase: wasPrepared ? 'ready' : 'error', message: error.name === 'TimeoutError' ? 'Zeitüberschreitung bei GitHub. Später erneut prüfen.' : error.message }); throw error; }
    finally { this.busy = false; }
  }
  startDownload() {
    this.assertIdle(); if (!this.candidate?.available) throw new Error('Zuerst nach einem neuen Release suchen.');
    this.busy = true; this.controller = new AbortController();
    this.set({ phase: 'downloading', downloaded: 0, total: this.candidate.asset.size, message: 'Update wird heruntergeladen.' });
    this.operation = this.prepare(this.candidate).catch(error => this.set({ phase: 'error', message: error.name === 'AbortError' ? 'Update-Download abgebrochen.' : error.message })).finally(() => { this.busy = false; this.controller = null; });
    return this.snapshot();
  }
  async binaryResponse(asset) {
    let url = new URL(API + '/releases/assets/' + asset.id);
    const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(30 * 60 * 1000)]);
    for (let i = 0; i < 6; i++) {
      const response = await this.fetch(url.href, { headers: this.headers(true, url.origin === 'https://api.github.com'), signal, redirect: 'manual' });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location'); await response.body?.cancel(); if (!location) throw new Error('GitHub-Download hat kein Weiterleitungsziel.');
        url = safeReleaseRedirect(new URL(location, url).href); continue;
      }
      if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error('Release-Download fehlgeschlagen (HTTP ' + response.status + ').'); }
      return response;
    }
    throw new Error('Zu viele Download-Weiterleitungen.');
  }
  async prepare(candidate) {
    const id = randomUUID(), folder = join(this.directory, id), archive = join(folder, 'download.zip'), stage = join(folder, 'package'); await mkdir(folder, { recursive: true });
    try {
      const response = await this.binaryResponse(candidate.asset), hash = createHash('sha256'); let bytes = 0, notified = 0;
      const measure = new Transform({ transform: (chunk, encoding, callback) => {
        bytes += chunk.length; if (bytes > candidate.asset.size) return callback(new Error('Release-Download ist größer als angekündigt.'));
        hash.update(chunk); if (Date.now() - notified > 200) { notified = Date.now(); this.set({ downloaded: bytes }); } callback(null, chunk);
      } });
      await pipeline(Readable.fromWeb(response.body), measure, createWriteStream(archive, { flags: 'wx', mode: 0o600 }), { signal: this.controller.signal });
      if (bytes !== candidate.asset.size || hash.digest('hex') !== candidate.asset.sha256) throw new Error('SHA-256 oder Dateigröße des Downloads stimmt nicht. Programmdateien wurden nicht geändert.');
      this.set({ phase: 'extracting', downloaded: bytes, message: 'Release wird entpackt.' }); const files = await extractRelease(archive, stage);
      this.set({ phase: 'verifying', message: 'Programmdateien werden geprüft.' }); await verifyPreparedPackage(stage, candidate.version, files);
      this.prepared = { id, version: candidate.version }; await writeFile(join(this.directory, 'prepared.json'), JSON.stringify(this.prepared), { mode: 0o600 }); await rm(archive, { force: true });
      this.set({ phase: 'ready', message: 'Update heruntergeladen und geprüft. Bereit zum Installieren.' });
    } catch (error) { await rm(folder, { recursive: true, force: true }); throw error; }
  }
  async install({ port }) {
    this.assertIdle(); if (!this.allowInstall) throw new Error('Automatischer Neustart ist nur beim normalen Programmstart verfügbar.');
    if (this.state.phase !== 'ready' || !this.prepared) throw new Error('Zuerst das Update herunterladen und prüfen.'); this.busy = true;
    try {
      const { id, version } = this.prepared, folder = join(this.directory, id), helper = join(folder, 'helper'); await verifyPreparedPackage(join(folder, 'package'), version);
      await mkdir(join(helper, 'lib'), { recursive: true }); await mkdir(join(helper, 'scripts'), { recursive: true });
      await copyFile(join(this.root, 'lib/update-files.mjs'), join(helper, 'lib/update-files.mjs')); await copyFile(join(this.root, 'scripts/apply-update.mjs'), join(helper, 'scripts/apply-update.mjs'));
      const job = { root: this.root, stage: join(folder, 'package'), directory: this.directory, backup: join(this.directory, 'backups', id), version, parentPid: process.pid, port };
      const jobPath = join(folder, 'job.json'); await writeFile(jobPath, JSON.stringify(job), { mode: 0o600 }); const log = await open(join(this.directory, 'install.log'), 'a', 0o600);
      try { const child = spawn(process.execPath, [join(helper, 'scripts/apply-update.mjs'), jobPath], { cwd: this.root, detached: true, windowsHide: true, stdio: ['ignore', log.fd, log.fd] }); await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); }); child.unref(); } finally { await log.close(); }
      this.lastResult = { phase: 'installing', version, backup: job.backup, message: 'Update wird installiert.' }; await writeFile(join(this.directory, 'result.json'), JSON.stringify(this.lastResult), { mode: 0o600 });
      this.set({ phase: 'installing', message: 'Warteschlange pausiert. Die Bridge wird gesichert, aktualisiert und neu gestartet.' }); return this.snapshot();
    } catch (error) { this.set({ phase: 'error', message: error.message }); this.busy = false; throw error; }
  }
  close() { this.controller?.abort(); }
}
