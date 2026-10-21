import { createReadStream } from 'node:fs';
import { readFile, writeFile, mkdir, lstat, copyFile, rename, rm, chmod } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';

export const MANIFEST = 'release-manifest.json';
const folders = new Set(['lib', 'public', 'scripts', 'assets', 'apworlds', 'examples', 'integrations', 'node_modules', 'test']);
const rootFiles = new Set(['server.mjs', 'package.json', 'package-lock.json', 'Start.cmd', 'start.sh', '.gitignore', 'README.md', 'ANLEITUNG.md', 'VALIDIERUNG.md', 'APWORLDS-MANUELL.md', 'CHANGELOG.md', 'LICENSE', 'LICENSE.md', MANIFEST]);
export const releaseVersion = value => typeof value === 'string' && /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) ? value.replace(/^v/, '') : null;
export function isNewer(candidate, current) {
  const a = releaseVersion(candidate)?.split('.').map(Number), b = releaseVersion(current)?.split('.').map(Number);
  if (!a || !b) throw new Error('Ungültige Release-Version.');
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
export function safeUpdatePath(path) {
  if (typeof path !== 'string' || !path || path.length > 500 || /[\\\x00-\x1f\x7f:<>"|?*]/.test(path)) throw new Error('Ungültiger Update-Dateipfad.');
  const parts = path.split('/');
  if (parts.some(part => !part || part === '..' || (part.startsWith('.') && path !== '.gitignore') || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error('Ungültiger Update-Dateipfad.');
  if (!(parts.length === 1 ? rootFiles.has(path) : folders.has(parts[0]))) throw new Error('Nicht erlaubtes Update-Ziel: ' + path);
  return path;
}
export async function safeTarget(root, path) {
  safeUpdatePath(path); const parts = path.split('/'); let target = resolve(root);
  for (let i = 0; i < parts.length; i++) {
    target = join(target, parts[i]);
    try {
      const info = await lstat(target);
      if (info.isSymbolicLink() || (i < parts.length - 1 ? !info.isDirectory() : !info.isFile())) throw new Error('Update-Ziel ist keine normale Datei: ' + path);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return target;
}
export async function fileHash(path) {
  const hash = createHash('sha256'); for await (const bytes of createReadStream(path)) hash.update(bytes); return hash.digest('hex');
}
export function validateManifest(value, version) {
  if (value?.schema !== 1 || value.name !== 'ap-chaos-bridge' || !releaseVersion(value.version) || value.version !== version || !Array.isArray(value.files) || !value.files.length || value.files.length > 25000) throw new Error('Release-Manifest passt nicht zur ausgewählten Version.');
  const names = new Set(); let total = 0;
  for (const file of value.files) {
    safeUpdatePath(file.path);
    if (file.path === MANIFEST || names.has(file.path.toLowerCase()) || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > 256 * 1024 * 1024 || ![0o644, 0o755].includes(file.mode)) throw new Error('Ungültiger Eintrag im Release-Manifest.');
    names.add(file.path.toLowerCase()); total += file.size;
  }
  if (total > 2 * 1024 ** 3 || !names.has('server.mjs') || !names.has('package.json') || !names.has('node_modules/ws/package.json') || !names.has('node_modules/yaml/package.json') || !names.has('node_modules/yauzl/package.json') || !names.has('scripts/apply-update.mjs') || !names.has('lib/update-files.mjs')) throw new Error('Unvollständiges oder zu großes Programmpaket.');
  return value;
}
export async function verifyPreparedPackage(stage, version, actualFiles) {
  const manifest = validateManifest(JSON.parse(await readFile(join(stage, MANIFEST), 'utf8')), version);
  if (actualFiles && (actualFiles.size !== manifest.files.length + 1 || manifest.files.some(file => !actualFiles.has(file.path)))) throw new Error('Archiv und Release-Manifest enthalten unterschiedliche Dateien.');
  for (const file of manifest.files) {
    const path = await safeTarget(stage, file.path), info = await lstat(path);
    if (info.size !== file.size || await fileHash(path) !== file.sha256) throw new Error('Dateiprüfung fehlgeschlagen: ' + file.path);
  }
  const pkg = JSON.parse(await readFile(join(stage, 'package.json'), 'utf8'));
  if (pkg.name !== 'ap-chaos-bridge' || pkg.version !== version) throw new Error('Programmversion im Update stimmt nicht überein.');
  const minimum = /^>=(\d+)(?:\.\d+(?:\.\d+)?)?$/.exec(pkg.engines?.node || '');
  if (!minimum || Number(process.versions.node.split('.')[0]) < Number(minimum[1])) throw new Error('Vor diesem Update die benötigte Node.js-Version installieren: ' + (pkg.engines?.node || 'unbekannt'));
  return manifest;
}
async function optionalInfo(path) { try { return await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
async function atomicCopy(source, target, mode) {
  await mkdir(dirname(target), { recursive: true }); const temp = target + '.update-' + randomUUID() + '.tmp';
  try { await copyFile(source, temp); if (mode) await chmod(temp, mode & 0o777); await rename(temp, target); }
  finally { await rm(temp, { force: true }); }
}
export async function rollbackUpdate(root, backup, journal) {
  for (const entry of [...journal].reverse()) {
    const target = await safeTarget(root, entry.path);
    if (entry.existed) await atomicCopy(join(backup, 'files', entry.path), target, entry.mode); else await rm(target, { force: true });
  }
}
export async function applyPreparedUpdate({ root, stage, backup, version, onWrite = () => {} }) {
  const manifest = await verifyPreparedPackage(stage, version), oldPath = join(root, MANIFEST); let old = null;
  try { const data = JSON.parse(await readFile(oldPath, 'utf8')); old = validateManifest(data, data.version); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const previous = new Map((old?.files || []).map(file => [file.path, file]));
  const next = new Set(manifest.files.map(file => file.path)), journal = [], preserved = [], changes = [];
  for (const file of manifest.files) {
    const target = await safeTarget(root, file.path), info = await optionalInfo(target), hash = info ? await fileHash(target) : null;
    if (hash === file.sha256) continue;
    if (file.path.startsWith('apworlds/') && info && hash !== previous.get(file.path)?.sha256) { preserved.push(file.path); continue; }
    changes.push({ path: file.path, source: join(stage, file.path), info, mode: file.mode });
  }
  for (const file of previous.values()) {
    if (next.has(file.path)) continue;
    const target = await safeTarget(root, file.path), info = await optionalInfo(target); if (!info) continue;
    if (await fileHash(target) !== file.sha256) { preserved.push(file.path); continue; }
    changes.push({ path: file.path, source: null, info });
  }
  changes.push({ path: MANIFEST, source: join(stage, MANIFEST), info: await optionalInfo(oldPath), mode: 0o644 });
  await mkdir(join(backup, 'files'), { recursive: true });
  try {
    for (const change of changes) {
      const target = await safeTarget(root, change.path), saved = join(backup, 'files', change.path);
      if (change.info) { await mkdir(dirname(saved), { recursive: true }); await copyFile(target, saved); }
      journal.push({ path: change.path, existed: Boolean(change.info), mode: change.info?.mode });
      await writeFile(join(backup, 'journal.json'), JSON.stringify(journal, null, 2), { mode: 0o600 }); await onWrite(change.path);
      if (change.source) await atomicCopy(change.source, target, change.mode); else await rm(target);
    }
    return { journal, preserved, changed: changes.length };
  } catch (error) {
    try { await rollbackUpdate(root, backup, journal); }
    catch (rollbackError) { throw new Error('Update und Wiederherstellung fehlgeschlagen. Sicherung: ' + backup, { cause: rollbackError }); }
    throw error;
  }
}
