import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { createApp } from '../server.mjs';

async function until(predicate, message, timeout = 1800) {
  const end = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > end) throw new Error(message);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

async function ui(t) {
  const directory = mkdtempSync(join(tmpdir(), 'ap-chaos-ui-'));
  const app = await createApp({ directory, port: 0 });
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
  window.eval(readFileSync(new URL('../public/studio.js', import.meta.url), 'utf8') + '\n' + readFileSync(new URL('../public/app.js', import.meta.url), 'utf8') + '\nwindow.__bridgeRefresh = refresh;');
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
  const search = document.querySelector('#studio-search'); search.value = 'Stardew'; search.dispatchEvent(new window.Event('input', { bubbles: true }));
  await until(() => document.querySelectorAll('#studio-catalog-results article').length === 1, 'Katalogsuche filtert nicht.');
  document.querySelector('#studio-catalog-results [data-action="studio-game"]').click();
  await until(() => document.querySelector('#studio-yaml-form'), 'Spiel-Unterseite wurde nicht geladen.');
  const form = document.querySelector('#studio-yaml-form');
  form.elements.namedItem('playerNames').value = 'Daniel\nFriend';
  document.querySelector('[data-action="studio-yaml-preview"]').click();
  await until(() => document.querySelector('#studio-yaml-preview')?.textContent.includes('name: Friend'), 'Mehrspieler-YAML-Vorschau fehlt.');
  document.querySelector('[data-action="studio-yaml-save"]').click();
  await until(() => app.store.state.yamlPresets['Stardew Valley']?.players.length === 2, 'Spielereinstellungen wurden nicht gespeichert.');
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
  const players = document.querySelector('#studio-players-form'); players.elements.namedItem('playersText').value = 'Daniel | Stardew Valley\nFriend | Factorio';
  players.querySelector('[type=submit]').click();
  await until(() => app.store.state.players.length === 2, 'Mehrere Spieler wurden nicht gespeichert.');
  await until(() => !document.querySelector('#drawer').open && document.querySelector('#main').textContent.includes('Daniel'), 'Gespeicherte Spieler fehlen in der Oberfläche.');
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
