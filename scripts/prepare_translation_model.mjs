import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const modelManifest = JSON.parse(await readFile(join(root, 'assets/help-translation-model.json'), 'utf8'));
const valid = (bytes, file) => bytes.length === file.size && createHash('sha256').update(bytes).digest('hex') === file.sha256;
export async function prepareTranslationModel({ folder = join(root, 'assets/translation-models'), checkOnly = false, fetchImpl = fetch } = {}) {
  if (!checkOnly) await mkdir(folder, { recursive: true });
  for (const file of modelManifest.files) {
    const target = join(folder, file.name);
    try { if (valid(await readFile(target), file)) continue; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (checkOnly) throw new Error('Übersetzungsmodell fehlt oder ist beschädigt: ' + file.name);
    const url = new URL(file.url);
    if (url.protocol !== 'https:' || url.hostname !== 'firefox-settings-attachments.cdn.mozilla.net') throw new Error('Unbekannte Modellquelle.');
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error('Modell-Download fehlgeschlagen: HTTP ' + response.status);
    const chunks = []; let size = 0;
    for await (const chunk of response.body) { size += chunk.length; if (size > file.size) throw new Error('Modell-Download überschreitet die erwartete Größe.'); chunks.push(chunk); }
    const bytes = Buffer.concat(chunks);
    if (!valid(bytes, file)) throw new Error('SHA256-Prüfung des Übersetzungsmodells fehlgeschlagen: ' + file.name);
    const temporary = target + '.' + randomUUID() + '.tmp';
    try { await writeFile(temporary, bytes); await rename(temporary, target); } finally { await rm(temporary, { force: true }); }
  }
  return { id: modelManifest.id, files: modelManifest.files.length };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(JSON.stringify(await prepareTranslationModel({ checkOnly: process.argv.includes('--check') })));
}
