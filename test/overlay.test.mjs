import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

async function overlay(t, initial = {}) {
  const state = { room: 'first-room', appearance: { mode: 'dark', accent: '#a3bffa', motion: true }, alerts: { enabled: true, showTests: true, showText: true, animation: 'slide', position: 'bottom-left', durationSec: 6.5, mediaSize: 120, media: '', layout: 'card' }, jobs: [], ...initial };
  const dom = new JSDOM(readFileSync(new URL('../public/overlay.html', import.meta.url), 'utf8'), { url: 'http://localhost/overlay', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const window = dom.window, timers = new Map(); let sequence = 0;
  window.fetch = async path => { assert.equal(path, '/api/overlay'); return { ok: true, json: async () => structuredClone(state) }; };
  window.EventSource = class { addEventListener() {} };
  window.setInterval = () => 0;
  window.setTimeout = (fn, ms) => { const id = ++sequence; timers.set(id, { fn, ms }); return id; };
  window.clearTimeout = id => timers.delete(id);
  window.HTMLMediaElement.prototype.pause = function () {};
  window.HTMLMediaElement.prototype.play = async function () {};
  window.eval(readFileSync(new URL('../public/appearance.js', import.meta.url), 'utf8') + '\n' + readFileSync(new URL('../public/overlay.js', import.meta.url), 'utf8') + '\nwindow.overlayTest = { load };');
  await new Promise(resolve => setImmediate(resolve));
  return { state, window, document: window.document, timers, load: () => window.overlayTest.load(), run(ms) { const found = [...timers].find(([, timer]) => timer.ms === ms); assert(found, 'Expected timer ' + ms); timers.delete(found[0]); found[1].fn(); } };
}
const job = (id, extra = {}) => ({ id, effect: 'item', item: 'Bomb Trap', user: 'Viewer', targetName: 'Player', dryRun: false, finishedAt: Date.now(), ...extra });

test('overlay ignores history, escapes event text and displays consecutive alerts in order', async t => {
  const ui = await overlay(t, { jobs: [job('history')] });
  const alert = ui.document.querySelector('#alert'); assert(!alert.classList.contains('visible'));
  ui.state.jobs.push(job('new', { message: '<img src=x onerror=alert(1)>' }), job('next', { effect: 'hint', item: 'Key' }));
  await ui.load(); assert(alert.classList.contains('visible')); assert.equal(ui.document.querySelector('#title').textContent, '<img src=x onerror=alert(1)>'); assert.equal(ui.document.querySelector('#title img'), null);
  ui.run(6500); assert(!alert.classList.contains('visible')); ui.run(450);
  assert(alert.classList.contains('visible')); assert.equal(ui.document.querySelector('#title').textContent, 'Hinweis: Key');
  ui.run(6500); ui.run(450); await ui.load(); assert(!alert.classList.contains('visible'));
});

test('changing rooms clears active alerts and stale callbacks cannot hide the next room', async t => {
  const ui = await overlay(t); ui.state.jobs.push(job('first')); await ui.load();
  const stale = [...ui.timers.values()].find(timer => timer.ms === 6500).fn;
  ui.state.room = 'second-room'; ui.state.jobs = [job('second-history')]; await ui.load();
  assert(!ui.document.querySelector('#alert').classList.contains('visible'));
  ui.state.jobs.push(job('second-new', { item: 'Fresh Item' })); await ui.load(); stale();
  assert(ui.document.querySelector('#alert').classList.contains('visible')); assert.equal(ui.document.querySelector('#title').textContent, 'Fresh Item');
});

test('hidden tests and disabled alerts still permit an explicit media preview without game actions', async t => {
  const ui = await overlay(t); ui.state.alerts.showTests = false;
  ui.state.jobs.push(job('simulation', { dryRun: true })); await ui.load(); assert(!ui.document.querySelector('#alert').classList.contains('visible'));
  ui.state.alerts.enabled = false; ui.state.jobs.push(job('disabled')); await ui.load(); assert(!ui.document.querySelector('#alert').classList.contains('visible'));
  ui.state.alerts.media = 'a'.repeat(64) + '.gif'; ui.state.jobs.push(job('preview', { preview: true, message: 'Vorschau' })); await ui.load();
  assert(ui.document.querySelector('#alert').classList.contains('visible')); assert.equal(ui.document.querySelector('#label').textContent, 'ALERT-VORSCHAU');
  assert.equal(ui.document.querySelector('#alert-image').hidden, false); assert(ui.document.querySelector('#alert-image').src.endsWith('/alert-media/' + ui.state.alerts.media));
  await ui.load(); assert(ui.document.querySelector('#alert').classList.contains('visible'));
});
