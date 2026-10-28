/*
 * Node adapter for @browsermt/bergamot-translator 0.4.9 (MPL-2.0).
 * Upstream source: https://github.com/browsermt/bergamot-translator
 * License: assets/TRANSLATION-LICENSE.txt. The upstream source is shipped by npm.
 * Changes: execute its classic worker in CommonJS, supply Node globals, and
 * handle file URLs correctly on Windows and in directories containing spaces.
 */
const { readFileSync } = require('node:fs');
const { dirname } = require('node:path');
const source = require.resolve('@browsermt/bergamot-translator/worker/translator-worker.js');
__dirname = dirname(source);
__filename = source;
global.require = require;
global.__dirname = __dirname;
global.__filename = __filename;
let code = readFileSync(source, 'utf8');
for (const [before, after] of [
  ['readFile(url.pathname)', 'readFile(url)'],
  ['new URL(`file://${__filename}`)', 'require("node:url").pathToFileURL(__filename)'],
]) {
  if (!code.includes(before)) throw new Error('Die Übersetzungs-Engine passt nicht zum Node-Adapter.');
  code = code.replace(before, after);
}
// Only the pinned, installed upstream worker is evaluated. YAML text is passed
// through structured worker messages and never evaluated as JavaScript.
eval(code);
