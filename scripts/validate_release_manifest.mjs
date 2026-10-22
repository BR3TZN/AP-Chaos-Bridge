import { readFileSync } from 'node:fs';
import { validateManifest } from '../lib/update-files.mjs';
const manifest = JSON.parse(readFileSync(0, 'utf8'));
validateManifest(manifest, manifest.version);
console.log(JSON.stringify({ manifestVersion: manifest.version, checkedPackageFiles: manifest.files.length }));
