import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { writeZip } from '../lib/zip.mjs';
import { createApp } from '../server.mjs';

async function until(predicate, message, timeout = 1800) {
  const end = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > end) throw new Error(message);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

async function ui(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'ap-chaos-ui-'));
  const app = await createApp({ directory, worldsDirectory: join(directory, 'worlds'), port: 0, ...options });
  app.library.importWorld(writeZip([{ name: 'ui/__init__.py', content: `class Health(Range):\n range_start = 1\n range_end = 9\n default = 3\nclass UIOptions(PerGameCommonOptions):\n health: Health\nclass UIWorld(World):\n game = 'UI Fixture'\n options_dataclass = UIOptions` }]), 'ui.apworld');
  const dom = new JSDOM(readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'), { url: app.url + '/#regeln', runScripts: 'outside-only' });
  const { window } = dom;
  const requests = [];
  window.fetch = (path, init) => {
    requests.push({ path, method: init?.method || 'GET', body: init?.body });
    return fetch(new URL(path, app.url), init);
  };
  window.EventSource = class { addEventListener() {} close() {} };
  window.setInterval = () => 0;
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  window.scrollTo = () => {};
  window.eval(readFileSync(new URL('../public/studio.js', import.meta.url), 'utf8') + '\n' + readFileSync(new URL('../public/updates.js', import.meta.url), 'utf8') + '\n' + readFileSync(new URL('../public/app.js', import.meta.url), 'utf8') + '\nwindow.__bridgeRefresh = refresh;');
  await until(() => window.document.querySelector('[data-action="new-rule"]'), 'Regelseite wurde nicht geladen.');
  t.after(() => { dom.window.close(); app.close(); rmSync(directory, { recursive: true, force: true }); });
  return { app, window, document: window.document, requests, directory };
}

function emulateNamedId(form) {
  // JSDOM 26 does not implement HTMLFormElement's LegacyOverrideBuiltIns named
  // getter. Browsers expose input[name=id] as form.id, even if its value is empty.
  // Supply that specified platform behavior while testing the real UI handlers.
  const input = form.elements.namedItem('id');
  assert(input);
  Object.defineProperty(form, 'id', { configurable: true, get: () => input });
  assert.notEqual(form.id, form.getAttribute('id'));
}

test('UI creates and persists a rule when its hidden id field shadows form.id', async t => {
  const { app, document, requests, directory } = await ui(t);
  const before = app.store.state.rules.length;
  document.querySelector('[data-action="new-rule"]').click();
  const form = document.querySelector('#rule-form');
  emulateNamedId(form);
  form.elements.namedItem('name').value = 'Neue Zuschauerregel';
  assert(form.checkValidity());
  const submit = form.querySelector('[type="submit"]');
  submit.click();
  await until(() => app.store.state.rules.length === before + 1, 'Speichern hat keine neue Regel angelegt.');
  await until(() => !document.querySelector('#drawer').open, 'Dialog wurde nach dem Speichern nicht geschlossen.');
  const stored = JSON.parse(readFileSync(join(directory, 'state.json'), 'utf8'));
  assert.equal(stored.rules.at(-1).name, 'Neue Zuschauerregel');
  assert.equal(stored.rules.at(-1).minimumCents, 1000);
  assert.equal(requests.filter(r => r.path === '/api/rule' && r.method === 'POST').length, 1);
  await until(() => document.querySelector('#main').textContent.includes('Neue Zuschauerregel') && !submit.disabled, 'Neue Regel wurde in der Oberfläche nicht angezeigt.');
});

test('UI edits the existing rule without creating a duplicate despite named id', async t => {
  const { app, document } = await ui(t);
  const before = app.store.state.rules.length, id = app.store.state.rules[0].id;
  document.querySelector(`[data-action="edit-rule"][data-id="${id}"]`).click();
  const form = document.querySelector('#rule-form');
  emulateNamedId(form);
  form.elements.namedItem('name').value = 'Bearbeitete Regel';
  form.elements.namedItem('euros').value = '12.50';
  const submit = form.querySelector('[type="submit"]');
  submit.click();
  await until(() => app.store.state.rules[0].name === 'Bearbeitete Regel', 'Regeländerung wurde nicht gespeichert.');
  await until(() => !document.querySelector('#drawer').open, 'Dialog wurde nach dem Bearbeiten nicht geschlossen.');
  assert.equal(app.store.state.rules.length, before);
  assert.equal(app.store.state.rules[0].id, id);
  assert.equal(app.store.state.rules[0].minimumCents, 1250);
  await until(() => !submit.disabled, 'Bearbeiten wurde nicht abgeschlossen.');
});

test('catalog opens a dedicated game page and previews separate player YAMLs through the real API', async t => {
  const { app, window, document } = await ui(t);
  window.location.hash = 'katalog';
  await until(() => document.querySelector('#studio-search'), 'Spielekatalog wurde nicht geöffnet.');
  const search = document.querySelector('#studio-search'); search.value = 'UI Fixture'; search.dispatchEvent(new window.Event('input', { bubbles: true }));
  await until(() => document.querySelectorAll('#studio-catalog-results article').length === 1, 'Katalogsuche filtert nicht.');
  document.querySelector('#studio-catalog-results [data-action="studio-game"]').click();
  await until(() => document.querySelector('#studio-yaml-form'), 'Spiel-Unterseite wurde nicht geladen.');
  const form = document.querySelector('#studio-yaml-form');
  form.elements.namedItem('playerNames').value = 'Daniel\nFriend';
  document.querySelector('[data-action="studio-yaml-preview"]').click();
  await until(() => document.querySelector('#studio-yaml-preview')?.textContent.includes('name: Friend'), 'Mehrspieler-YAML-Vorschau fehlt.');
  document.querySelector('[data-action="studio-yaml-save"]').click();
  await until(() => app.store.state.yamlPresets['UI Fixture']?.players.length === 2, 'Spielereinstellungen wurden nicht gespeichert.');
  await until(() => document.querySelector('[data-studio-message]')?.textContent.includes('gespeichert'), 'Speicherbestätigung fehlt.');
});

test('UI creates an independent room and persists multiple player profiles', async t => {
  const { app, window, document } = await ui(t);
  window.location.hash = 'raeume';
  await until(() => document.querySelector('[data-action="studio-room-new"]'), 'Raumseite fehlt.');
  document.querySelector('[data-action="studio-room-new"]').click();
  const roomForm = document.querySelector('#studio-room-form'); roomForm.elements.namedItem('name').value = 'Charity Run';
  roomForm.querySelector('[type=submit]').click();
  await until(() => app.rooms.id !== 'default' && !document.querySelector('#drawer').open, 'Neuer Raum wurde nicht geöffnet.');
  assert.equal(app.rooms.manifest.rooms.length, 2);
  window.location.hash = 'spielslots';
  await until(() => document.querySelector('[data-action="studio-players"]'), 'Spielerverwaltung fehlt.');
  document.querySelector('[data-action="studio-players"]').click();
  const players = document.querySelector('#studio-players-form');
  for (const [name, game] of [['Daniel', 'Stardew Valley'], ['Friend', 'Factorio']]) {
    players.querySelector('[data-action="studio-player-add"]').click();
    const row = players.querySelector('[data-player-row]:last-child'); row.querySelector('[name=playerName]').value = name; row.querySelector('[name=playerGame]').value = game;
  }
  players.querySelector('[type=submit]').click();
  await until(() => app.store.state.players.length === 2, 'Mehrere Spieler wurden nicht gespeichert.');
  await until(() => !document.querySelector('#drawer').open && document.querySelector('#studio-player-list-form [name=playerName]')?.value === 'Daniel', 'Gespeicherte Spieler fehlen in der Oberfläche.');
  assert.equal(app.store.state.players[1].game, 'Factorio');
});

test('UI retains masked saved passwords and offers correct local and external address fields', async t => {
  const { app, window, document } = await ui(t);
  app.vault.update('default', { adminPassword: 'never-render-this-password' });
  document.querySelector('#main').innerHTML = '';
  window.location.hash = 'quellen';
  await until(() => document.querySelector('#ap-address-mode'), 'Neue Verbindungsfelder fehlen.');
  // Force the current API snapshot after inserting credentials.
  await window.__bridgeRefresh(true);
  assert.equal(document.querySelector('[name=adminPassword]').value, '••••••••');
  assert(!document.documentElement.outerHTML.includes('never-render-this-password'));
  const mode = document.querySelector('#ap-address-mode'); mode.value = 'local'; mode.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert(document.querySelector('#ap-host-label').classList.contains('hidden'));
  mode.value = 'custom'; mode.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert(!document.querySelector('#ap-host-label').classList.contains('hidden'));
});

test('UI displays a rejected rule inside the open dialog and allows correction', async t => {
  const { app, document } = await ui(t);
  const before = app.store.state.rules.length;
  document.querySelector('[data-action="new-rule"]').click();
  const form = document.querySelector('#rule-form');
  emulateNamedId(form);
  form.elements.namedItem('effect').value = 'item';
  form.querySelector('[type="submit"]').click();
  await until(() => form.querySelector('[data-form-error]')?.textContent.includes('Itemname fehlt.'), 'Serverfehler ist im Regeldialog nicht sichtbar.');
  assert.equal(document.querySelector('#drawer').open, true);
  assert.equal(app.store.state.rules.length, before);
  assert.equal(form.querySelector('[type="submit"]').disabled, false);
  form.elements.namedItem('item').value = 'Darkness Trap';
  form.querySelector('[type="submit"]').click();
  await until(() => app.store.state.rules.length === before + 1, 'Korrigierte Regel konnte nicht gespeichert werden.');
  assert.equal(app.store.state.rules.at(-1).item, 'Darkness Trap');
  await until(() => !form.querySelector('[type="submit"]').disabled, 'Korrektur wurde nicht abgeschlossen.');
});

test('shared UI submit handler still saves settings forms', async t => {
  const { app, window, document } = await ui(t);
  window.location.hash = '#einrichtung';
  await until(() => document.querySelector('#limits-form'), 'Einstellungsformular fehlt.');
  const form = document.querySelector('#limits-form');
  form.elements.namedItem('globalCooldownSec').value = '2.5';
  form.querySelector('[type="submit"]').click();
  await until(() => app.store.state.config.globalCooldownSec === 2.5, 'Einstellungen wurden nicht gespeichert.');
  await until(() => !form.querySelector('[type="submit"]').disabled, 'Speichern der Einstellungen wurde nicht abgeschlossen.');
});


test('UI archives, restores and deletes a room with explicit name confirmation', async t => {
  const { app, window, document } = await ui(t); window.location.hash = 'raeume';
  await until(() => document.querySelector('[data-action="studio-room-archive"]'), 'Archive action missing');
  document.querySelector('[data-action="studio-room-archive"][data-id="default"]').click();
  await until(() => app.rooms.require('default').archived && app.rooms.id !== 'default', 'Room not archived');
  await until(() => !document.querySelector('[data-action="studio-room-archive"][data-id="default"]'), 'Active filter did not update');
  document.querySelector('[data-action="studio-room-filter"][data-id="archived"]').click();
  document.querySelector('[data-action="studio-room-restore"][data-id="default"]').click();
  await until(() => !app.rooms.require('default').archived, 'Room not restored');
  await until(() => !document.querySelector('[data-action="studio-room-restore"]'), 'Archive filter did not refresh');
  document.querySelector('[data-action="studio-room-filter"][data-id="active"]').click();
  document.querySelector('[data-action="studio-room-delete"][data-id="default"]').click();
  const form = document.querySelector('#studio-room-delete-form'); form.elements.namedItem('confirmName').value = 'wrong'; form.querySelector('[type=submit]').click();
  await until(() => form.querySelector('[data-form-error]'), 'Confirmation rejection missing'); assert(app.rooms.require('default'));
  form.elements.namedItem('confirmName').value = app.rooms.require('default').name; form.querySelector('[type=submit]').click();
  await until(() => !app.rooms.manifest.rooms.some(r => r.id === 'default') && !document.querySelector('#drawer').open, 'Room was not deleted');
  await until(() => !form.querySelector('[type=submit]').disabled, 'Delete handler did not finish');
});
test('UI range dropdown accepts custom values and disables hidden custom input', async t => {
  const { app, window, document } = await ui(t); window.location.hash = 'spiel/UI%20Fixture';
  await until(() => document.querySelector('#studio-yaml-form'), 'Editor missing');
  const form = document.querySelector('#studio-yaml-form'), field = document.querySelector('[data-option-search="health health"]');
  const select = field.querySelector('select'), input = field.querySelector('input'); assert.equal(select.tagName, 'SELECT'); assert(input.disabled);
  select.value = '__custom__'; select.dispatchEvent(new window.Event('change', { bubbles: true })); assert(!input.disabled);
  input.value = '999'; document.querySelector('[data-action="studio-yaml-preview"]').click();
  await until(() => document.querySelector('#toast')?.textContent.includes('Bereich') || document.body.textContent.includes('Wert außerhalb'), 'Out-of-range value accepted');
  select.value = '5'; select.dispatchEvent(new window.Event('change', { bubbles: true })); assert(input.disabled); assert(form.checkValidity());
  select.value = '__custom__'; select.dispatchEvent(new window.Event('change', { bubbles: true })); input.value = '7';
  document.querySelector('[data-action="studio-yaml-save"]').click();
  await until(() => app.store.state.yamlPresets['UI Fixture']?.values.health === 7, 'Custom value not saved');
  await until(() => document.querySelector('[data-studio-message]')?.textContent.includes('gespeichert'), 'Save handler did not finish');
});


test('plus adds the next AP player and inline rows retain identities when saved and removed', async t => {
  const { app, window, document } = await ui(t);
  await fetch(app.url + '/api/demo', { method: 'POST', headers: { 'X-Bridge-Session': app.snapshot().session, 'Content-Type': 'application/json' }, body: '{}' });
  await window.__bridgeRefresh(true); window.location.hash = 'spielslots';
  await until(() => document.querySelector('#studio-player-list-form'), 'Player list missing');
  let form = document.querySelector('#studio-player-list-form');
  form.querySelector('[data-action="studio-player-add"]').click(); form.querySelector('[data-action="studio-player-add"]').click();
  const rows = [...form.querySelectorAll('[data-player-row]')];
  assert.deepEqual(rows.map(row => row.querySelector('[name=playerName]').value), ['Stardew-Demo', 'Factorio-Demo']);
  assert.equal(rows[1].querySelector('[name=playerGame]').value, 'Factorio'); assert(rows[0].textContent.includes('AP-Slot 1'));
  form.querySelector('[type=submit]').click();
  await until(() => app.store.state.players.length === 2 && !form.querySelector('[type=submit]').disabled, 'Players not saved');
  const ids = app.store.state.players.map(p => p.id); assert(ids.every(Boolean));
  form = document.querySelector('#studio-player-list-form'); form.querySelectorAll('[data-player-row]')[1].querySelector('[data-action="studio-player-remove"]').click();
  assert.equal(form.querySelectorAll('[data-player-row]').length, 1); form.querySelector('[type=submit]').click();
  await until(() => app.store.state.players.length === 1 && !form.querySelector('[type=submit]').disabled, 'Removal not saved');
  assert.equal(app.store.state.players[0].id, ids[0]);
});
test('rule UI saves a random recipient from the stored player group', async t => {
  const { app, window, document } = await ui(t);
  await fetch(app.url + '/api/demo', { method: 'POST', headers: { 'X-Bridge-Session': app.snapshot().session, 'Content-Type': 'application/json' }, body: '{}' });
  app.store.state.players = [{ id: 'saved-a', name: 'Stardew-Demo', game: 'Stardew Valley' }, { id: 'saved-b', name: 'Factorio-Demo', game: 'Factorio' }]; app.store.save();
  await window.__bridgeRefresh(true); document.querySelector('[data-action="new-rule"]').click();
  const form = document.querySelector('#rule-form'), target = form.elements.namedItem('target');
  target.value = 'random_selected'; target.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert(!document.querySelector('#rule-selected-targets').classList.contains('hidden'));
  document.querySelector('[data-action="studio-rule-players"]').click();
  assert.deepEqual([...form.querySelectorAll('[name=targetKeys]:checked')].map(input => input.value), ['0:1', '0:2']);
  form.elements.namedItem('name').value = 'Eine Person aus unserer Gruppe'; form.querySelector('[type=submit]').click();
  await until(() => app.store.state.rules.some(r => r.name === 'Eine Person aus unserer Gruppe') && !form.querySelector('[type=submit]').disabled, 'Group rule not saved');
  const rule = app.store.state.rules.find(r => r.name === 'Eine Person aus unserer Gruppe'); assert.equal(rule.target, 'random_selected'); assert.deepEqual(rule.targetKeys, ['0:1', '0:2']);
  const jobs = app.engine.plan(rule, { id: 'group-test', source: 'manual', user: 'Test', dryRun: true }); assert.equal(jobs.length, 1); assert(rule.targetKeys.includes(jobs[0].targetKey));
});

test('update UI masks private access and displays a new release through the real API', async t => {
  const { VERSION } = await import('../lib/model.mjs'); const next = VERSION.split('.').map(Number); next[2]++; const version = next.join('.');
  const release = { tag_name: 'v' + version, assets: [{ id: 123, name: `AP-Chaos-Bridge-v${version}.zip`, state: 'uploaded', size: 1000, digest: 'sha256:' + '1'.repeat(64) }] };
  const { app, window, document } = await ui(t, { fetchImpl: async () => Response.json(release) });
  window.location.hash = 'einrichtung'; await until(() => document.querySelector('#update-token-form'), 'Updatebereich fehlt.');
  document.querySelector('#update-token-form input').value = 'only-test-github-token'; document.querySelector('#update-token-form [type="submit"]').click();
  await until(() => app.snapshot().updates.hasToken, 'Zugang nicht gespeichert.'); await until(() => document.querySelector('#update-token-form input').value === '••••••••', 'Zugang nicht maskiert.');
  assert(!document.documentElement.innerHTML.includes('only-test-github-token'));
  document.querySelector('[data-action="update-check"]').click(); await until(() => document.querySelector('#update-version').textContent === 'Release ' + version, 'Neue Version fehlt.');
  assert.equal(document.querySelector('[data-action="update-download"]').hidden, false); assert.equal(document.querySelector('[data-action="update-install"]').hidden, true); assert(document.querySelector('[data-update-link]').textContent.includes(version));
});
