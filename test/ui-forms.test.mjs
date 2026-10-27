import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { writeZip } from '../lib/zip.mjs';
import { createApp } from '../server.mjs';
import { WebSocketServer } from 'ws';
import { once } from 'node:events';

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
  if (options.seedRules !== false) app.store.state.rules.push({ id: 'fixture-rule', name: 'Fixture Charity', enabled: false, source: 'charity', type: 'donation', action: 'random-trap', minimumCents: 1000, minimumUnits: 0, rewardId: '', effect: 'random_trap', target: 'random', game: '', item: '', quantity: 1, cooldownSec: 20 });
  app.library.importWorld(writeZip([{ name: 'ui/__init__.py', content: `class Health(Range):\n range_start = 1\n range_end = 9\n default = 3\nclass UIOptions(PerGameCommonOptions):\n health: Health\nclass UIWorld(World):\n game = 'UI Fixture'\n options_dataclass = UIOptions` }]), 'ui.apworld');
  const dom = new JSDOM(readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'), { url: app.url + '/#regeln', runScripts: 'outside-only' });
  const { window } = dom;
  const requests = [], intervals = [];
  window.fetch = (path, init) => {
    requests.push({ path, method: init?.method || 'GET', body: init?.body });
    return fetch(new URL(path, app.url), init);
  };
  window.EventSource = class { constructor() { this.listeners = {}; window.__liveEvents = this; } addEventListener(type, callback) { this.listeners[type] = callback; } close() {} };
  window.setInterval = (callback, delay) => { intervals.push({ callback, delay }); return intervals.length; };
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  window.scrollTo = () => {};
  window.eval(['appearance.js', 'alerts.js', 'studio.js', 'rules.js', 'rewards.js', 'updates.js', 'app.js'].map(file => readFileSync(new URL('../public/' + file, import.meta.url), 'utf8')).join('\n') + '\nwindow.__captureDownload = callback => { Studio.download = callback; }; window.__bridgeRefresh = refresh; window.__bridgeIndexReady = () => Boolean(indexData) && !Studio.indexLoading; window.__bridgeIndexLoaded = () => Boolean(indexData) && !Studio.indexLoading;');
  await until(() => window.document.querySelector('[data-action="new-rule"]'), 'Regelseite wurde nicht geladen.');
  t.after(() => { dom.window.close(); app.close(); rmSync(directory, { recursive: true, force: true }); });
  return { app, window, document: window.document, requests, directory, intervals };
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

test('catalog search survives periodic refresh with and without focus and returning from a game', async t => {
  const { app, window, document, intervals } = await ui(t);
  app.library.importWorld(writeZip([{ name: 'search/__init__.py', content: "class MetroidWorld(World):\n game = 'Metroid Fusion'\nclass OriWorld(World):\n game = 'Ori and the Blind Forest'" }]), 'search.apworld');
  await window.__bridgeRefresh();
  window.location.hash = 'katalog'; await until(() => document.querySelector('#studio-search'), 'Katalog fehlt.');
  await until(() => window.__bridgeIndexReady(), 'Katalogindex fehlt.');
  let search = document.querySelector('#studio-search'); search.value = 'df'; search.dispatchEvent(new window.Event('input', { bubbles: true })); search.focus(); search.setSelectionRange(1, 2);
  const titles = () => [...document.querySelectorAll('#studio-catalog-results h3')].map(el => el.textContent);
  assert.deepEqual(titles(), ['Metroid Fusion', 'Ori and the Blind Forest']);
  await until(() => intervals.some(timer => timer.delay === 15000), 'Status-Timer fehlt.');
  const poll = intervals.find(timer => timer.delay === 15000);
  await poll.callback(); search = document.querySelector('#studio-search');
  assert.equal(search.value, 'df'); assert.equal(document.activeElement, search); assert.equal(search.selectionStart, 1); assert.equal(search.selectionEnd, 2);
  search.blur(); await poll.callback(); assert.equal(document.querySelector('#studio-search').value, 'df'); assert.deepEqual(titles(), ['Metroid Fusion', 'Ori and the Blind Forest']);
  document.querySelector('#studio-catalog-results [data-action="studio-game"]').click();
  await until(() => document.querySelector('#studio-yaml-form'), 'Spielseite fehlt.');
  window.location.hash = 'katalog'; await until(() => document.querySelector('#studio-search'), 'Rückkehr zum Katalog fehlgeschlagen.');
  assert.equal(document.querySelector('#studio-search').value, 'df'); assert.deepEqual(titles(), ['Metroid Fusion', 'Ori and the Blind Forest']);
});

test('late catalog loading retains the active search and expanded results; clearing resets pagination', async t => {
  const { app, window, document } = await ui(t);
  app.library.importWorld(writeZip([{ name: 'many/__init__.py', content: Array.from({ length: 60 }, (_, i) => `class Search${i}World(World):\n game = 'DF Game ${String(i).padStart(2, '0')}'`).join('\n') }]), 'many.apworld');
  await window.__bridgeRefresh();
  const originalFetch = window.fetch; let releaseIndex;
  const indexGate = new Promise(resolve => { releaseIndex = resolve; });
  window.fetch = async (path, init) => { if (path === '/api/game-index') await indexGate; return originalFetch(path, init); };
  window.location.hash = 'katalog'; await until(() => document.querySelector('#studio-search'), 'Katalog fehlt.');
  const originalSearch = document.querySelector('#studio-search');
  try {
    originalSearch.value = 'df'; originalSearch.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(document.querySelectorAll('#studio-catalog-results article').length, 24);
    document.querySelector('[data-action="studio-catalog-more"]').click();
    assert.equal(document.querySelectorAll('#studio-catalog-results article').length, 60);
    originalSearch.focus(); originalSearch.setSelectionRange(2, 2);
  } finally {
    releaseIndex();
    await until(() => window.__bridgeIndexLoaded(), 'Verzögerte Katalog-Aktualisierung fehlt.');
    assert.equal(document.querySelector('#studio-search'), originalSearch);
  }
  let search = document.querySelector('#studio-search');
  assert.equal(search.value, 'df'); assert.equal(document.activeElement, search); assert.equal(search.selectionStart, 2);
  assert.equal(document.querySelectorAll('#studio-catalog-results article').length, 60);
  await window.__bridgeRefresh(); assert.equal(document.querySelectorAll('#studio-catalog-results article').length, 60);
  search = document.querySelector('#studio-search'); search.value = ''; search.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(document.querySelectorAll('#studio-catalog-results article').length, 24);
  search.value = 'df'; search.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(document.querySelectorAll('#studio-catalog-results article').length, 24);
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

test('design page previews and saves a neutral light theme with a custom accent', async t => {
  const { app, window, document } = await ui(t);
  window.location.hash = 'design';
  await until(() => document.querySelector('#appearance-form'), 'Designseite fehlt.');
  document.querySelector('[data-action="appearance-mode"][data-id="light"]').click();
  await until(() => document.documentElement.dataset.theme === 'light', 'Lightmode-Vorschau fehlt.');
  const input = document.querySelector('[name="accent"]'); input.value = '#ff0000'; input.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(document.documentElement.style.getPropertyValue('--accent'), '#ff0000');
  document.querySelector('#appearance-form [type="submit"]').click();
  await until(() => app.snapshot().appearance.mode === 'light' && app.snapshot().appearance.accent === '#ff0000', 'Design wurde nicht gespeichert.');
  await until(() => document.querySelector('#toast')?.textContent.includes('Design gespeichert'), 'Design-Handler wurde nicht abgeschlossen.');
});

test('guided rules get their game filters from connected slots and save custom item pools', async t => {
  const { app, window, document } = await ui(t);
  app.ap.loadDemo();
  app.store.state.approvals[app.ap.roomKey] = Object.fromEntries(app.ap.players.map(p => [`${p.team}:${p.slot}`, { enabled: true, items: Object.keys(app.ap.items(p.game)), traps: [] }]));
  await window.__bridgeRefresh(true); document.querySelector('[data-action="new-rule"]').click();
  const game = document.querySelector('#rule-game'); assert([...game.options].some(o => o.value === 'Factorio'));
  assert(![...game.options].some(o => o.value === 'UI Fixture'));
  game.value = 'Factorio'; game.dispatchEvent(new window.Event('change', { bubbles: true }));
  const recipients = document.querySelector('#rule-recipient-preview'); assert(recipients.textContent.includes('Factorio-Demo')); assert(!recipients.textContent.includes('Stardew-Demo'));
  const effect = document.querySelector('#rule-effect'); assert.equal(effect.options.length, 11);
  effect.value = 'random_choice'; effect.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert(!document.querySelector('#rule-pool-field').hidden);
  const form = document.querySelector('#rule-form'); form.elements.namedItem('name').value = 'Custom Pool'; form.elements.namedItem('itemPool').value = 'Attack Trap\nTeleport Trap'; form.querySelector('[type="submit"]').click();
  await until(() => app.store.state.rules.some(r => r.name === 'Custom Pool'), 'Eigene Zufallsliste wurde nicht gespeichert.');
  await until(() => !document.querySelector('#drawer').open && !form.querySelector('[type=submit]').disabled, 'Regel-Handler wurde nicht abgeschlossen.');
  assert.deepEqual(app.store.state.rules.at(-1).itemPool, ['Attack Trap', 'Teleport Trap']);
});

test('alert preview button calls only the visual preview endpoint', async t => {
  const { app, window, document, requests } = await ui(t);
  window.location.hash = 'alerts'; await until(() => document.querySelector('[data-action="alerts-test"]'), 'Alert-Seite fehlt.');
  const jobs = app.store.state.queue.length; document.querySelector('[data-action="alerts-test"]').click();
  await until(() => requests.some(r => r.path === '/api/alerts/preview'), 'Vorschau wurde nicht angefordert.');
  await until(() => document.querySelector('#toast')?.textContent.includes('Alert-Vorschau'), 'Vorschau-Handler wurde nicht abgeschlossen.');
  assert.equal(app.store.state.queue.length, jobs);
  assert(!requests.some(r => r.path === '/api/test-rule'));
});

test('catalog scan reports successful catalog availability and separate skipped packages', async t => {
  const { app, window, document } = await ui(t);
  app.library.scan = async () => ({ imported: [], unchanged: 771, errors: [], skipped: [{ file: 'known.apworld', reason: 'Keine auswertbare World-Deklaration.' }] });
  window.location.hash = 'katalog'; await until(() => document.querySelector('#studio-scan-form'), 'Katalog fehlt.');
  const submit = document.querySelector('#studio-scan-form [type="submit"]'); submit.click();
  await until(() => document.querySelector('.scan-summary'), 'Einlesebericht fehlt.');
  // Rendering replaces the form. Its new button is enabled before the original
  // submit handler has finished; wait for that handler's own finally block.
  await until(() => !submit.disabled, 'Einlesen wurde nicht abgeschlossen.');
  assert(document.querySelector('.scan-summary').textContent.includes('Spiele bereit'));
  assert(document.querySelector('.scan-report summary').textContent.includes('übersprungen'));
  assert(!document.querySelector('.scan-report details').open);
});

test('APworld chooser accepts a file above the previous 40 MiB limit and explains release ZIP extraction', async t => {
  const { app, window, document } = await ui(t);
  window.location.hash = 'katalog'; await until(() => document.querySelector('[data-action="studio-import"]'), 'Katalog fehlt.');
  document.querySelector('[data-action="studio-import"]').click();
  const form = document.querySelector('#studio-import-form'); assert(form.textContent.includes('128')); assert(document.querySelector('#drawer').textContent.includes('Release-ZIP'));
  const bytes = writeZip([{ name: 'large/__init__.py', content: "class LargeWorld(World):\n game = 'UI Large World'" }]);
  Object.defineProperty(form.elements.namedItem('files'), 'files', { configurable: true, value: [{ name: 'large.apworld', size: 80 * 1024 ** 2, arrayBuffer: async () => bytes }] });
  // JSDOM cannot build a FileList from test files; emulate the browser submit event.
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => app.library.data.games['UI Large World'] && !document.querySelector('#drawer').open && !form.querySelector('[type=submit]').disabled, 'Große Datei wurde in der Oberfläche abgelehnt.').catch(error => { throw new Error(error.message + ' ' + document.querySelector('#toast').textContent + ' ' + document.querySelector('#studio-import-progress')?.textContent); });
});

test('Core search recognizes the table name and opens a versioned dropdown editor with valid YAML', async t => {
  const { window, document } = await ui(t, { core: true });
  window.location.hash = 'katalog'; await until(() => document.querySelector('#studio-search'), 'Core-Katalog fehlt.');
  const search = document.querySelector('#studio-search'); search.value = 'The Golden Coins'; search.dispatchEvent(new window.Event('input', { bubbles: true }));
  await until(() => document.querySelectorAll('#studio-catalog-results article').length === 1, 'Core-Alias wird nicht gefunden.');
  assert(document.querySelector('#studio-catalog-results').textContent.includes('Core 0.6.8'));
  document.querySelector('#studio-catalog-results [data-action="studio-game"]').click();
  await until(() => document.querySelector('#studio-yaml-form'), 'Core-Unterseite fehlt.');
  assert(document.querySelector('#studio-yaml-form').textContent.includes('keine zusätzliche APworld installieren'));
  assert(document.querySelectorAll('#studio-yaml-form select').length > 3);
  document.querySelector('[data-action="studio-yaml-preview"]').click();
  await until(() => document.querySelector('#studio-yaml-preview')?.textContent.includes('version: 0.6.8'), 'Core-YAML-Vorschau fehlt.');
  assert(document.querySelector('#studio-yaml-preview').textContent.includes('game: Super Mario Land 2'));
});

test('Peliarch traps use individual list choices and retain custom values in the real YAML preview', async t => {
  const { app, window, document, requests } = await ui(t);
  app.library.importYaml({ name: 'EldenRing.yaml', content: readFileSync(new URL('../examples/elden-ring-peliarch.yaml', import.meta.url), 'utf8') });
  window.location.hash = 'spiel/Elden%20Ring';
  await until(() => document.querySelector('#studio-yaml-form'), 'Peliarch-Editor fehlt.');
  const entry = app.library.get('Elden Ring'), index = entry.options.findIndex(option => option.key === 'traps');
  const field = document.querySelector('[data-option-search$=" traps"]');
  assert.equal(field.querySelectorAll('input[type=checkbox]').length, 7);
  assert(field.textContent.includes('20 seconds'));
  for (const value of ['rune_thief', 'blackout']) { const checkbox = field.querySelector('input[value="' + value + '"]'); checkbox.checked = true; checkbox.dispatchEvent(new window.Event('change', { bubbles: true })); }
  const extra = field.querySelector('[name="list-extra-' + index + '"]'); extra.value = 'custom_trap\nrune_thief'; extra.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert(field.querySelector('summary').textContent.includes('3 ausgewählt'));
  assert(document.querySelector('[data-option-search$=" spawn_traps"] .option-value-help').textContent.includes('JSON-Liste'));
  assert(document.querySelector('[data-option-search$=" curated_filler"] .option-value-help').textContent.includes('JSON-Objekt'));
  document.querySelector('[data-action="studio-yaml-preview"]').click();
  await until(() => document.querySelector('#studio-yaml-preview')?.textContent.includes('custom_trap'), 'Listenwerte fehlen in der Vorschau.');
  const payload = JSON.parse(requests.filter(request => request.path === '/api/yaml/generate').at(-1).body);
  assert.deepEqual(payload.values.traps, ['rune_thief', 'blackout', 'custom_trap']);
  for (const checkbox of field.querySelectorAll('input[type=checkbox]')) checkbox.checked = false;
  extra.value = ''; const save = document.querySelector('[data-action="studio-yaml-save"]'); save.click();
  await until(() => app.store.state.yamlPresets[entry.sourceId] && !save.disabled && document.querySelector('[data-studio-message]').textContent.includes('gespeichert'), 'Leere Liste wurde nicht gespeichert.');
  assert.deepEqual(app.store.state.yamlPresets[entry.sourceId].values.traps, []);
});

test('APworld set choices preserve existing custom order and free fields explain input formats', async t => {
  const { app, window, document, requests } = await ui(t);
  const entry = app.library.data.games['UI Fixture'];
  entry.options.push({ key: 'allowed', label: 'Allowed', kind: 'set', validKeys: ['A', 'B'], default: ['outside', 'B'] }, { key: 'message', label: 'Message', kind: 'text', default: 'hello' }, { key: 'mapping', label: 'Mapping', kind: 'dict', default: { count: 2 }, validKeys: ['count', 'extra'] }, { key: 'unset', label: 'Unset', kind: 'set', validKeys: ['A', 'B'] });
  Object.assign(entry.base['UI Fixture'], { allowed: ['outside', 'B'], message: 'hello', mapping: { count: 2 } });
  window.location.hash = 'spiel/UI%20Fixture'; await until(() => document.querySelector('#studio-yaml-form'), 'Editor fehlt.');
  const field = document.querySelector('[data-option-search="allowed allowed"]');
  assert.equal(field.querySelector('textarea').value, 'outside');
  assert(field.querySelector('input[value="B"]').checked);
  field.querySelector('input[value="A"]').checked = true;
  assert(document.querySelector('[data-option-search="message message"] .option-value-help').textContent.includes('Text'));
  const mapping = document.querySelector('[data-option-search="mapping mapping"]');
  assert(mapping.querySelector('.option-value-help').textContent.includes('JSON-Objekt'));
  assert(mapping.querySelector('.option-values').textContent.includes('extra'));
  const unset = document.querySelector('[data-option-search="unset unset"]');
  assert(unset.querySelector('fieldset').disabled); assert.equal(unset.querySelectorAll('.option-list input[type=checkbox]').length, 2);
  document.querySelector('[data-action="studio-yaml-preview"]').click();
  await until(() => document.querySelector('#studio-yaml-preview')?.textContent.includes('outside'), 'Set-Vorschau fehlt.');
  const payload = JSON.parse(requests.filter(request => request.path === '/api/yaml/generate').at(-1).body);
  assert.deepEqual(payload.values.allowed, ['outside', 'B', 'A']);
  assert(!Object.hasOwn(payload.values, 'unset'));
});

test('the YAML picker edits all Peliarch fields, switches sources without mixing presets and previews two players', async t => {
  const { app, window, document, requests } = await ui(t);
  const otherWorld = "class Different(Toggle):\n pass\nclass Settings(PerGameCommonOptions):\n unrelated_world_option: Different\nclass OtherWorld(World):\n game = 'Elden Ring'\n options_dataclass = Settings";
  app.library.importWorld(writeZip([{ name: 'other/__init__.py', content: otherWorld }]), 'other.apworld');
  app.library.importWorld(writeZip([{ name: 'other/__init__.py', content: otherWorld.replace("'Elden Ring'", "'EldenRing'") }]), 'original.apworld');
  app.store.state.yamlPresets['Elden Ring'] = { values: { unrelated_world_option: true }, players: ['WorldSlot'], extra: 'world_extra: 1' };
  app.library.pythonCommand = () => { throw new Error('Python must not run for YAML'); };
  window.location.hash = 'katalog'; await until(() => document.querySelector('#studio-search'), 'Katalog fehlt.');
  document.querySelector('[data-action="studio-import"]').click();
  const form = document.querySelector('#studio-import-form'), content = readFileSync(new URL('../examples/elden-ring-peliarch.yaml', import.meta.url), 'utf8');
  assert(form.elements.namedItem('files').accept.includes('.yaml'));
  Object.defineProperty(form.elements.namedItem('files'), 'files', { configurable: true, value: [{ name: 'EldenRing.yaml', size: Buffer.byteLength(content), text: async () => content }] });
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => app.library.yamlTemplates.entries().length && !document.querySelector('#drawer').open && !form.querySelector('[type=submit]').disabled, 'YAML wurde nicht importiert.');
  const search = document.querySelector('#studio-search'); search.value = 'elden'; search.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert(document.querySelector('#studio-catalog-results').textContent.includes('YAML-Vorlage'));
  assert.deepEqual([...document.querySelectorAll('#studio-catalog-results [data-action="studio-game"]')].map(button => button.dataset.id).sort(), ['Elden Ring', 'EldenRing']);
  document.querySelector('#studio-catalog-results [data-action="studio-game"][data-id="Elden Ring"]').click();
  await until(() => document.querySelector('#studio-yaml-form'), 'YAML-Editor fehlt.');
  assert.equal(document.querySelectorAll('.option-field').length, 91);
  const sourceId = app.library.get('Elden Ring').sourceId;
  const field = key => document.querySelector('[data-option-search$="' + key + '"]').querySelector('select, input:not([type=checkbox]), textarea');
  assert.equal(field('num_regions').tagName, 'SELECT'); assert.equal(field('dungeon_sweep').value, 'bosses');
  assert.equal(field('no_equip_load').value, 'off');
  field('num_regions').value = '12'; field('dungeon_sweep').value = 'all'; field('death_link').value = 'true';
  document.querySelector('[name=playerNames]').value = 'Daniel\nFriend';
  const save = document.querySelector('[data-action="studio-yaml-save"]'); save.click();
  await until(() => app.store.state.yamlPresets[sourceId]?.values.num_regions === 12 && !save.disabled, 'YAML-Vorlage wurde nicht gespeichert.');
  document.querySelector('[data-action="studio-yaml-preview"]').click();
  await until(() => document.querySelector('#studio-yaml-preview')?.textContent.includes('Friend'), 'Mehrspieler-Vorschau fehlt.');
  const request = requests.filter(r => r.path === '/api/yaml/generate').at(-1), payload = JSON.parse(request.body);
  assert.equal(payload.sourceId, sourceId); assert.equal(payload.values.num_regions, 12); assert.equal(payload.values.death_link, true);
  assert(!Object.hasOwn(payload.values, 'unrelated_world_option')); assert.equal(payload.extra, '');
  let select = document.querySelector('#studio-source'); select.value = 'world'; select.dispatchEvent(new window.Event('change', { bubbles: true }));
  await until(() => document.querySelector('[data-option-search$="unrelated_world_option"]'), 'APworld-Quelle fehlt.');
  assert.equal(document.querySelector('[name=playerNames]').value, 'WorldSlot');
  select = document.querySelector('#studio-source'); select.value = sourceId; select.dispatchEvent(new window.Event('change', { bubbles: true }));
  await until(() => document.querySelector('[data-option-search$="num_regions"]'), 'YAML-Quelle fehlt nach Wechsel.');
  assert.equal(field('num_regions').value, '12'); assert.equal(document.querySelector('[name=playerNames]').value, 'Daniel\nFriend');
  assert.equal(document.querySelector('[name=extra]').value, '');
  document.querySelector('[data-action="studio-yaml-remove"]').click();
  const remove = document.querySelector('#studio-yaml-remove-form'); remove.querySelector('[type=submit]').click();
  await until(() => app.library.yamlTemplates.entries().length === 0 && !document.querySelector('#drawer').open && !remove.querySelector('[type=submit]').disabled, 'YAML-Vorlage wurde nicht entfernt.');
  assert.equal(app.library.get('Elden Ring').kind, 'apworld'); assert.equal(app.store.state.yamlPresets['Elden Ring'].players[0], 'WorldSlot');
});

test('empty rules stay empty and a rule draft survives periodic, SSE and explicit data refreshes', async t => {
  const { app, window, document, intervals } = await ui(t, { seedRules: false });
  assert.equal(app.store.state.rules.length, 0); assert(document.querySelector('#main').textContent.includes('Keine Regeln'));
  document.querySelector('[data-action="new-rule"]').click();
  const dialog = document.querySelector('#drawer'), form = document.querySelector('#rule-form');
  form.elements.namedItem('name').value = 'My unfinished draft';
  const target = form.elements.namedItem('target'); target.value = 'all'; target.focus();
  const openDetails = form.querySelector('details'); if (openDetails) openDetails.open = true;
  const periodic = intervals.find(interval => interval.delay === 15000); assert(periodic); await periodic.callback();
  assert.equal(document.querySelector('#rule-form'), form); assert(dialog.open); assert.equal(document.activeElement, target);
  window.__liveEvents.listeners.change(); await new Promise(resolve => setTimeout(resolve, 130)); await window.__bridgeRefresh(true);
  assert.equal(form.elements.namedItem('name').value, 'My unfinished draft'); assert.equal(target.value, 'all'); assert(dialog.open);
  if (openDetails) assert(openDetails.open);
  window.location.hash = 'quellen'; await until(() => document.querySelector('#ap-form'), 'Connections missing'); assert(!dialog.open);
});

test('player rows, open disclosures and native dropdown nodes survive background updates while statuses change', async t => {
  const { app, window, document } = await ui(t);
  window.location.hash = 'spielslots'; await until(() => document.querySelector('#studio-player-list-form'), 'Players missing');
  const form = document.querySelector('#studio-player-list-form'), details = form.closest('details'); details.open = true;
  form.querySelector('[data-action="studio-player-add"]').click();
  const row = form.querySelector('[data-player-row]'), name = row.querySelector('[name="playerName"]'); name.value = 'Unsaved friend'; name.blur();
  app.ap.loadDemo(); await window.__bridgeRefresh();
  assert.equal(document.querySelector('#studio-player-list-form'), form); assert.equal(form.querySelector('[data-player-row]'), row); assert.equal(name.value, 'Unsaved friend'); assert(details.open);
  assert(document.querySelector('#connection-pill').textContent.includes('Demo')); assert(document.querySelector('#main').textContent.includes('Stardew-Demo'));
  window.location.hash = 'quellen'; await until(() => document.querySelector('#ap-address-mode'), 'Address fields missing');
  const select = document.querySelector('#ap-address-mode'); select.focus(); select.value = 'custom'; select.dispatchEvent(new window.Event('change', { bubbles: true }));
  const apForm = document.querySelector('#ap-form'); apForm.elements.namedItem('host').value = 'my.unsaved.host';
  await window.__bridgeRefresh(true); assert.equal(document.querySelector('#ap-address-mode'), select); assert.equal(document.activeElement, select); assert.equal(select.value, 'custom'); assert.equal(apForm.elements.namedItem('host').value, 'my.unsaved.host');
});

test('rule fields follow Charity, Twitch and manual triggers and hidden thresholds cannot block saved rules', async t => {
  const { app, window, document } = await ui(t, { seedRules: false });
  document.querySelector('[data-action="new-rule"]').click(); const form = document.querySelector('#rule-form');
  const source = form.elements.namedItem('source'), type = form.elements.namedItem('type');
  assert.equal(form.elements.namedItem('euros').disabled, false); assert(form.elements.namedItem('minimumUnits').disabled); assert(document.querySelector('#rule-type-field').hidden);
  form.elements.namedItem('euros').value = '999'; source.value = 'twitch'; source.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert(form.elements.namedItem('euros').disabled); assert.equal(type.options.length, 7); assert(form.elements.namedItem('minimumUnits').disabled);
  type.value = 'cheer'; type.dispatchEvent(new window.Event('change', { bubbles: true })); assert(!form.elements.namedItem('minimumUnits').disabled); assert(document.querySelector('[data-units-label]').textContent.includes('Bits'));
  form.elements.namedItem('minimumUnits').value = '200'; type.value = 'channel_points'; type.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert(form.elements.namedItem('minimumUnits').disabled); assert(!form.elements.namedItem('rewardId').disabled);
  form.elements.namedItem('rewardId').value = '__custom__'; form.elements.namedItem('rewardId').dispatchEvent(new window.Event('change', { bubbles: true }));
  assert(form.elements.namedItem('customRewardId').required); form.elements.namedItem('customRewardId').value = 'my-reward';
  form.elements.namedItem('name').value = 'Points only'; form.elements.namedItem('effect').value = 'alert'; form.querySelector('[type="submit"]').click();
  await until(() => app.store.state.rules.length === 1, 'Twitch rule missing');
  const saved = app.store.state.rules[0]; assert.equal(saved.minimumCents, 0); assert.equal(saved.minimumUnits, 0); assert.equal(saved.rewardId, 'my-reward');
  document.querySelector('[data-action="new-rule"]').click(); const manual = document.querySelector('#rule-form'); manual.elements.namedItem('source').value = 'manual'; manual.elements.namedItem('source').dispatchEvent(new window.Event('change', { bubbles: true }));
  assert(manual.elements.namedItem('euros').disabled); assert(manual.elements.namedItem('rewardId').disabled); assert.equal(manual.elements.namedItem('type').value, 'manual');
});

test('adding a Twitch colleague in the native window opens OAuth externally and keeps independent channel settings', async t => {
  const { app, window, document } = await ui(t);
  const external = []; window.chrome = { webview: { postMessage: message => external.push(message) } };
  window.location.hash = 'quellen'; await until(() => document.querySelector('[data-action="studio-twitch-add"]'), 'Twitch channels missing');
  document.querySelector('[data-action="studio-twitch-add"]').click(); const form = document.querySelector('#studio-twitch-add-form');
  form.elements.namedItem('channelName').value = 'alice'; form.elements.namedItem('clientId').value = 'shared-app';
  form.querySelector('[type="submit"]').click();
  await until(() => external.length === 1, 'Native OAuth message missing');
  assert.equal(external[0].type, 'openExternal'); assert.equal(new URL(external[0].url).hostname, 'id.twitch.tv');
  await until(() => document.querySelector('.twitch-channel'), 'Channel card missing');
  const channel = app.snapshot().twitch.channels[0]; assert.equal(channel.channelName, 'alice');
  const settings = document.getElementById('twitch-settings-' + channel.id); settings.open = true;
  const savedForm = settings.querySelector('form'); savedForm.elements.namedItem('clientId').value = 'unfinished-edit';
  await window.__bridgeRefresh(); assert.equal(document.getElementById('twitch-settings-' + channel.id), settings); assert(settings.open); assert.equal(savedForm.elements.namedItem('clientId').value, 'unfinished-edit');
});

test('a blurred search in the YAML editor keeps its text and filtered fields during status refreshes', async t => {
  const { window, document } = await ui(t);
  window.location.hash = 'spiel/UI%20Fixture'; await until(() => document.querySelector('#studio-yaml-form'), 'YAML editor missing');
  const form = document.querySelector('#studio-yaml-form'), search = document.querySelector('#studio-option-search');
  search.value = 'no matching field'; search.dispatchEvent(new window.Event('input', { bubbles: true })); search.blur();
  const hidden = form.querySelectorAll('[data-option-search].hidden').length; assert(hidden > 0);
  await window.__bridgeRefresh(); assert.equal(document.querySelector('#studio-yaml-form'), form); assert.equal(search.value, 'no matching field'); assert.equal(form.querySelectorAll('[data-option-search].hidden').length, hidden);
});

test('edits made while a save request is pending remain as a newer draft after the response', async t => {
  const { app, window, document } = await ui(t);
  window.location.hash = 'spielslots'; await until(() => document.querySelector('#studio-player-list-form'), 'Players missing');
  const form = document.querySelector('#studio-player-list-form'); form.querySelector('[data-action="studio-player-add"]').click();
  const name = form.querySelector('[name="playerName"]'); name.value = 'Submitted';
  const originalFetch = window.fetch; let release, sent = false; const gate = new Promise(resolve => { release = resolve; });
  window.fetch = async (path, init) => { if (path === '/api/players' && init?.method === 'POST') { sent = true; await gate; } return originalFetch(path, init); };
  const submit = form.querySelector('[type="submit"]'); submit.click(); await until(() => sent, 'Save request missing');
  name.value = 'Newer draft'; name.blur(); release();
  await until(() => app.store.state.players.length === 1 && !submit.disabled, 'Save response missing');
  assert.equal(app.store.state.players[0].name, 'Submitted'); assert.equal(name.value, 'Newer draft');
  await window.__bridgeRefresh(); assert.equal(document.querySelector('#studio-player-list-form'), form); assert.equal(name.value, 'Newer draft');
});


test('all subscriptions and random hints are selectable and persist through the real rule form', async t => {
  const { app, window, document } = await ui(t, { seedRules: false });
  await fetch(app.url + '/api/demo', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-Session': app.snapshot().session }, body: '{}' }); await window.__bridgeRefresh();
  document.querySelector('[data-action="new-rule"]').click(); const form = document.querySelector('#rule-form');
  const source = form.elements.namedItem('source'); source.value = 'twitch'; source.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(form.elements.namedItem('type').value, 'subscription'); assert(document.querySelector('#rule-source-description').textContent.includes('Stille automatische'));
  form.elements.namedItem('name').value = 'Any sub gives a random hint'; const effect = form.elements.namedItem('effect'); effect.value = 'random_hint'; effect.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert(!form.elements.namedItem('item').required); assert(document.querySelector('#rule-item-field').hidden); assert(document.querySelector('#rule-quantity-field').hidden);
  form.elements.namedItem('target').value = 'all'; form.querySelector('[type="submit"]').click();
  await until(() => app.store.state.rules.length === 1 && document.querySelector('[data-action="test-rule"]'), 'Random hint rule missing');
  assert.equal(app.store.state.rules[0].type, 'subscription'); assert.equal(app.store.state.rules[0].effect, 'random_hint');
  document.querySelector('[data-action="test-rule"]').click(); await until(() => app.store.state.queue.length > 0, 'Random hint simulation missing'); assert(app.store.state.queue.every(job => job.effect === 'hint'));
});

test('rule presets can be saved in the UI and imported into another room as inactive rules', async t => {
  const { app, window, document } = await ui(t);
  document.querySelector('[data-action="rules-preset"]').click(); const preset = document.querySelector('#rules-preset-form'); preset.elements.namedItem('name').value = 'Charity pack'; preset.querySelector('[type="submit"]').click();
  await until(() => app.ruleLibrary.list().length === 1 && !document.querySelector('#drawer').open, 'Preset not saved');
  const response = await fetch(app.url + '/api/rooms/create', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-Session': app.snapshot().session }, body: JSON.stringify({ name: 'New run' }) }); const room = (await response.json()).room;
  await fetch(app.url + '/api/rooms/activate', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-Session': app.snapshot().session }, body: JSON.stringify({ id: room.id }) }); await window.__bridgeRefresh(true);
  document.querySelector('[data-action="rules-import"]').click(); await until(() => document.querySelector('#rules-import-form'), 'Import dialog missing');
  const form = document.querySelector('#rules-import-form'); assert(form.elements.namedItem('source').value.startsWith('preset:'));
  form.querySelector('[data-action="rules-preview"]').click(); await until(() => form.querySelector('[name="ids"]'), 'Import preview missing'); assert.equal(app.store.state.rules.length, 0);
  form.querySelector('[type="submit"]').click(); await until(() => app.store.state.rules.length === 1, 'Preset not imported'); assert.equal(app.store.state.rules[0].enabled, false); assert.equal(app.store.state.rules[0].name, 'Fixture Charity');
});

test('JSON rule import preserves connection settings and invalid JSON leaves the dialog editable', async t => {
  const { app, window, document } = await ui(t);
  app.store.state.config.ap.slotName = 'Keep me';
  document.querySelector('[data-action="rules-import"]').click(); await until(() => document.querySelector('#rules-import-form'), 'Import missing');
  const form = document.querySelector('#rules-import-form'); form.elements.namedItem('source').value = 'file'; form.elements.namedItem('source').dispatchEvent(new window.Event('change', { bubbles: true }));
  const json = form.elements.namedItem('json'); json.value = '{bad'; form.querySelector('[data-action="rules-preview"]').click(); await until(() => document.querySelector('#toast').textContent.includes('gültiges JSON'), 'JSON error missing'); assert(document.querySelector('#drawer').open);
  json.value = JSON.stringify({ schema: 1, config: { ap: { slotName: 'Must not replace' } }, rules: [{ name: 'Imported visual', source: 'charity', type: 'donation', effect: 'alert', enabled: true }] }); json.dispatchEvent(new window.Event('input', { bubbles: true }));
  form.querySelector('[data-action="rules-preview"]').click(); await until(() => form.querySelector('[name="ids"]'), 'Preview missing'); form.elements.namedItem('mode').value = 'replace'; form.querySelector('[type="submit"]').click();
  await until(() => app.store.state.rules[0]?.name === 'Imported visual', 'JSON import missing'); assert.equal(app.store.state.rules.length, 1); assert.equal(app.store.state.rules[0].enabled, false); assert.equal(app.store.state.config.ap.slotName, 'Keep me');
});

test('selected rule export downloads a rules-only JSON file through the real API', async t => {
  const { app, window, document } = await ui(t); window.__captureDownload((blob, name) => { window.__ruleDownload = { blob, name }; });
  document.querySelector('[data-action="rules-export"]').click(); document.querySelector('#rules-export-form [type="submit"]').click();
  await until(() => window.__ruleDownload, 'JSON download missing'); assert.equal(window.__ruleDownload.name, 'AP-Chaos-Bridge-Regeln.json');
  const content = await new Promise(resolve => { const reader = new window.FileReader(); reader.onload = () => resolve(reader.result); reader.readAsText(window.__ruleDownload.blob); });
  const value = JSON.parse(content); assert.equal(value.kind, 'ap-chaos-bridge-rules'); assert.equal(value.rules.length, app.store.state.rules.length); assert.equal(value.config, undefined);
});

async function rewardsUi(t, initialScopes = ['channel:read:redemptions', 'channel:manage:redemptions']) {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 }); await once(wss, 'listening');
  wss.on('connection', socket => socket.send(JSON.stringify({ metadata: { message_type: 'session_welcome' }, payload: { session: { id: 'reward-session', keepalive_timeout_seconds: 120 } } })));
  const created = [], requests = []; let scopes = initialScopes;
  const result = await ui(t, { twitchSocketUrl: `ws://127.0.0.1:${wss.address().port}`, fetchImpl: async (url, init) => {
    if (url.includes('/validate')) return Response.json({ login: 'alice', user_id: '11', client_id: 'test-app', scopes });
    if (url.includes('/eventsub/subscriptions')) return Response.json({}, { status: 202 });
    if (url.includes('/custom_rewards?')) {
      if (init.method === 'POST') { const value = JSON.parse(init.body); requests.push({ url, ...init }); const reward = { id: 'new-reward-' + created.length, ...value }; created.push(reward); return Response.json({ data: [reward] }); }
      return Response.json({ data: [{ id: 'existing-reward', title: 'Existing Bomb', cost: 100 }, ...created] });
    }
    throw new Error('Unexpected Twitch request');
  } });
  t.after(() => { for (const socket of wss.clients) socket.terminate(); wss.close(); });
  const post = (path, data) => fetch(result.app.url + '/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-Session': result.app.snapshot().session }, body: JSON.stringify(data) });
  const channel = (await (await post('twitch/channel', { channelName: 'alice', clientId: 'test-app', events: ['channel.channel_points_custom_reward_redemption.add'] })).json()).channel;
  await post('twitch/connect', { channelId: channel.id, token: 'example-token' }); await until(() => result.app.snapshot().twitch.state === 'connected', 'Twitch not connected'); await result.window.__bridgeRefresh();
  return { ...result, channel, created, requests, post, setScopes: value => { scopes = value; } };
}

test('creating a reward from an unfinished rule preserves the draft and selects the new reward', async t => {
  const { app, window, document, channel, created } = await rewardsUi(t);
  document.querySelector('[data-action="new-rule"]').click(); const rule = document.querySelector('#rule-form'); rule.elements.namedItem('name').value = 'Unfinished rule';
  rule.elements.namedItem('source').value = 'twitch'; rule.elements.namedItem('source').dispatchEvent(new window.Event('change', { bubbles: true })); rule.elements.namedItem('type').value = 'channel_points'; rule.elements.namedItem('type').dispatchEvent(new window.Event('change', { bubbles: true }));
  document.querySelector('[data-action="rewards-from-rule"]').click(); const form = document.querySelector('#rewards-create-form'); assert(document.querySelector('#twitch-reward-dialog').open); assert(document.querySelector('#drawer').open);
  form.elements.namedItem('title').value = 'Random trap'; form.elements.namedItem('cost').value = '250'; await window.__bridgeRefresh(); assert.equal(form.elements.namedItem('title').value, 'Random trap');
  form.querySelector('[type="submit"]').click(); await until(() => created.length === 1 && !document.querySelector('#twitch-reward-dialog').open, 'Reward not created');
  assert.equal(document.querySelector('#rule-form'), rule); assert.equal(rule.elements.namedItem('name').value, 'Unfinished rule'); assert.equal(rule.elements.namedItem('rewardId').value, created[0].id); assert.equal(rule.elements.namedItem('twitchChannelId').value, channel.id);
  rule.querySelector('[type="submit"]').click(); await until(() => app.store.state.rules.some(rule => rule.name === 'Unfinished rule'), 'Rule not saved'); assert.equal(app.store.state.rules.find(rule => rule.name === 'Unfinished rule').rewardId, created[0].id);
});

test('reward authorization can be extended while the creation dialog and its input stay open', async t => {
  const { app, window, document, post, setScopes } = await rewardsUi(t, ['channel:read:redemptions']); const external = []; window.chrome = { webview: { postMessage: value => external.push(value) } };
  window.location.hash = 'quellen'; await until(() => document.querySelector('[data-action="rewards-manage"]'), 'Channel controls missing'); document.querySelector('[data-action="rewards-manage"]').click(); await until(() => document.querySelector('[data-action="rewards-create"]'), 'Rewards missing');
  document.querySelector('[data-action="rewards-create"]').click(); const form = document.querySelector('#rewards-create-form'); form.elements.namedItem('title').value = 'Preserve this title'; assert(form.querySelector('[type="submit"]').disabled);
  form.querySelector('[data-action="rewards-authorize"]').click(); await until(() => external.length, 'Authorization URL missing'); const url = new URL(external[0].url); assert(url.searchParams.get('scope').includes('channel:manage:redemptions'));
  setScopes(['channel:read:redemptions', 'channel:manage:redemptions']); assert.equal((await post('twitch/oauth', { state: url.searchParams.get('state'), token: 'example-token' })).status, 200); await until(() => app.snapshot().twitch.state === 'connected', 'Updated Twitch not connected'); await window.__bridgeRefresh();
  assert.equal(form.elements.namedItem('title').value, 'Preserve this title'); assert(document.querySelector('#twitch-reward-dialog').open); assert(!form.querySelector('[type="submit"]').disabled);
});

test('a Twitch reward list can open a prefilled rule for the selected reward and channel', async t => {
  const { window, document, channel } = await rewardsUi(t);
  window.location.hash = 'quellen'; await until(() => document.querySelector('[data-action="rewards-manage"]'), 'Channels missing'); document.querySelector('[data-action="rewards-manage"]').click(); await until(() => document.querySelector('[data-action="rewards-rule"]'), 'Rewards list missing');
  document.querySelector('[data-action="rewards-rule"]').click(); const form = document.querySelector('#rule-form'); assert(form); assert.equal(form.elements.namedItem('type').value, 'channel_points'); assert.equal(form.elements.namedItem('rewardId').value, 'existing-reward'); assert.equal(form.elements.namedItem('twitchChannelId').value, channel.id);
});
