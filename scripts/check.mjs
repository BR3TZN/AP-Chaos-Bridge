import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const files = [];
function walk(directory) { for (const entry of readdirSync(directory, { withFileTypes: true })) { if (['node_modules', 'data', '.git', '.catalog-cache', '__pycache__', 'apworlds'].includes(entry.name)) continue; const p = join(directory, entry.name); if (entry.isDirectory()) walk(p); else files.push(p); } }
walk(root);
for (const p of files.filter(p => /\.(m?js)$/.test(p))) {
  const result = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
  if (result.status !== 0) { console.error(result.stderr); process.exit(1); }
}
for (const p of files.filter(p => /\.json$/.test(p))) JSON.parse(readFileSync(p, 'utf8'));
const localRoutes = { '/app.js': 'public/app.js', '/studio.js': 'public/studio.js', '/style.css': 'public/style.css', '/icon.svg': 'public/icon.svg', '/overlay.js': 'public/overlay.js', '/overlay.css': 'public/overlay.css', '/oauth.js': 'public/oauth.js' };
for (const p of files.filter(p => p.endsWith('.html'))) {
  const html = readFileSync(p, 'utf8');
  for (const match of html.matchAll(/(?:src|href)="(\/[^"#]*)"/g)) if (localRoutes[match[1]] && !existsSync(join(root, localRoutes[match[1]]))) throw new Error('Fehlendes Asset: ' + match[1]);
  if (/<script(?![^>]*\bsrc=)[^>]*>[^<]/i.test(html)) throw new Error('Inline-Skript passt nicht zur CSP: ' + p);
  if (/(?:onclick|onchange|onsubmit)=/i.test(html)) throw new Error('Inline-Handler passt nicht zur CSP: ' + p);
}
for (const name of ['ws', 'yaml']) if (!existsSync(join(root, 'node_modules', name, 'package.json'))) throw new Error('Paket fehlt: ' + name);
console.log(`${files.filter(p => /\.(m?js)$/.test(p)).length} JavaScript-Dateien syntaxgeprüft; JSON, HTML-Assets und Paketabhängigkeiten geprüft.`);
