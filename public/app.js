'use strict';
let S, currentPage = location.hash.slice(1) || 'regie', eventTab = 'queue', indexData, integration, approvalEditor;
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const names = { regie: 'Übersicht', quellen: 'Verbindungen', spielslots: 'Spieler & Effekte', regeln: 'Regeln', ereignisse: 'Protokoll', einrichtung: 'Einstellungen', katalog: 'Spielekatalog', raeume: 'Räume', spiel: 'Spieleinstellungen', design: 'Design', alerts: 'Stream-Alerts' };
const sourceNames = { charity: 'Charity Royale', twitch: 'Twitch', external: 'Externer Trigger', manual: 'Manuell', any: 'Alle Quellen' };
const typeNames = { donation: 'Spende', sub: 'Sub', resub: 'Resub-Nachricht', gift_sub: 'Gift-Sub-Paket', cheer: 'Bits', channel_points: 'Kanalpunkte', manual: 'Manuell', any: 'Alle Ereignisse' };
const effectNames = { random_trap: 'Zufällige Falle', random_nontrap: 'Zufälliges Item ohne markierte Fallen', random_item: 'Zufälliges Item aus allen erlaubten', random_choice: 'Zufälliges Item aus eigener Liste', item: 'Bestimmtes Item senden', hint: 'Hinweis zu einem Item', message: 'Nachricht im AP-Chat', alert: 'Nur Stream-Alert', deathlink: 'DeathLink an die Gruppe', random_action: 'Zufall aus gewählten Aktionen' };
const statusNames = { queued: 'Wartet', dispatching: 'Versand läuft', confirmed: 'AP bestätigt', sent: 'Gesendet', simulated: 'Simuliert', failed: 'Fehlgeschlagen', uncertain: 'Unklar', cancelled: 'Verworfen', expired: 'Abgelaufen', alerted: 'Alert angezeigt' };
const connectionNames = { connected: 'Verbunden', disconnected: 'Getrennt', connecting: 'Verbindet', reconnecting: 'Verbindet erneut', error: 'Fehler', demo: 'Demo' };
const time = at => new Date(at).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const eur = cents => new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const options = (object, selected) => Object.entries(object).map(([value, label]) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`).join('');
const badge = (label, cls = 'neutral') => `<span class="badge ${cls}">${esc(label)}</span>`;
const pill = state => `<span class="pill ${state === 'connected' ? 'good' : ['reconnecting', 'error'].includes(state) ? 'warn' : ''}">${esc(connectionNames[state] || state)}</span>`;
const empty = (heading, description, symbol = '↳') => `<div class="empty"><div class="empty-icon">${symbol}</div><strong>${esc(heading)}</strong>${esc(description)}</div>`;
function toast(message, error = false) {
  const el = $('#toast'); el.textContent = message; el.className = 'visible' + (error ? ' error' : '');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.className = '', error ? 9000 : 4500);
}
async function api(path, data) {
  const response = await fetch('/api/' + path, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-Session': S?.session || '' }, body: JSON.stringify(data) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Anfrage fehlgeschlagen.'); return result;
}
async function refresh(force = false) {
  try { S = await api('state'); render(force); }
  catch { $('#footer-status').textContent = 'Lokale Bridge nicht erreichbar'; $('#connection-pill').textContent = 'Tool offline'; $('#connection-pill').className = 'pill warn'; }
}
function pageHead(kicker, title, description, actions = '') {
  return `<div class="page-head"><div><span class="eyebrow">${esc(kicker)}</span><h1>${esc(title)}</h1><p>${esc(description)}</p></div><div class="button-row page-actions">${actions}</div></div>`;
}
function runButton() { return `<button data-action="pause" class="${S.config.paused ? 'primary' : 'ghost'}">${S.config.paused ? 'Ausführung starten' : 'Pausieren'}</button>`; }
function modeNotice() {
  const demo = S.ap.demo, live = S.config.mode === 'live';
  return `<div class="notice ${live ? 'live' : ''}"><span class="notice-icon">${live ? '↗' : '◇'}</span><div><b>${demo ? 'Demo · ausschließlich Simulationen' : live ? 'LIVE · Aktionen können das Spiel verändern' : 'Testmodus · alle neuen Ereignisse werden simuliert'}</b><p>${S.config.paused ? 'Warteschlange ist pausiert.' : 'Warteschlange wird verarbeitet.'} ${live ? 'Notaus verwirft wartende Aktionen. Bereits gesendete Effekte können weiterwirken.' : 'Ein Moduswechsel wandelt bestehende Simulationen nicht in Live-Aktionen um.'}</p></div><div class="button-row">${runButton()}</div></div>`;
}
function sourceLine(abbr, name, description, state, cls = '') { return `<div class="source-line"><div class="source-icon ${cls}">${abbr}</div><div><div class="name">${name}</div><div class="desc">${esc(description)}</div></div>${pill(state)}</div>`; }
function renderRule(r) {
  const target = r.effect === 'deathlink' ? 'DeathLink-Gruppe' : r.target === 'random' ? 'Zufälliger freigegebener Slot' : r.target === 'all' ? 'Alle geeigneten Slots' : r.target === 'random_selected' ? `Zufällig aus ${r.targetKeys?.length || 0} ausgewählten Spielern` : r.target === 'selected' ? `${r.targetKeys?.length || 0} ausgewählte Spieler` : S.players.find(p => `${p.team}:${p.slot}` === r.target)?.name || 'Slot ' + r.target;
  const min = [r.minimumCents ? `ab ${eur(r.minimumCents)}` : '', r.minimumUnits ? `ab ${r.minimumUnits} Einheiten` : '', r.action ? `Aktion: ${r.action}` : ''].filter(Boolean).join(' · ');
  return `<article class="panel rule-card"><div class="rule-top"><h3>${esc(r.name)}</h3>${badge(r.enabled ? 'Aktiv' : 'Inaktiv', r.enabled ? 'good' : 'neutral')}</div><div class="flow"><div class="flow-cell"><span class="eyebrow">WENN</span><b>${esc(sourceNames[r.source])} · ${esc(typeNames[r.type])}</b><span class="tiny">${esc(min || 'Jedes passende Ereignis')}</span></div><div class="flow-arrow">→</div><div class="flow-cell"><span class="eyebrow">DANN</span><b>${esc(r.effect === 'item' ? r.item : effectNames[r.effect])}</b><span class="tiny">${esc(target)}${r.quantity > 1 ? ' · ' + r.quantity + '×' : ''}</span></div></div><div class="rule-foot"><span class="tiny mono">${r.cooldownSec}s COOLDOWN${r.game ? ' · ' + esc(r.game) : ''}</span><div class="button-row"><button class="small ghost" data-action="test-rule" data-id="${r.id}">Simulieren</button>${S.config.mode === 'live' && !S.ap.demo && r.enabled ? `<button class="small danger" data-action="live-rule" data-id="${r.id}">Live-Test</button>` : ''}<button class="small" data-action="edit-rule" data-id="${r.id}">Bearbeiten</button></div></div></article>`;
}
function queueTable(limit = 200) {
  const jobs = [...S.queue].reverse().slice(0, limit);
  if (!jobs.length) return empty('Noch keine Aktionen', 'Ein passendes Ereignis oder ein Regeltest erzeugt hier einen Auftrag.');
  return `<div class="table-wrap"><table><thead><tr><th>Aktion</th><th>Ziel</th><th>Modus</th><th>Status</th><th>Zeit</th><th></th></tr></thead><tbody>${jobs.map(j => `<tr><td><strong>${esc(j.item || effectNames[j.effect])}</strong><small>${esc(j.ruleName)} · ${esc(j.user)}</small></td><td>${esc(j.targetName)}<small>${esc(j.game || 'Eigenes AP-Team')}</small></td><td>${badge(j.dryRun ? 'Test' : 'LIVE', j.dryRun ? 'neutral' : 'warn')}</td><td>${badge(statusNames[j.status] || j.status, ['uncertain', 'failed'].includes(j.status) ? 'bad' : ['confirmed', 'simulated'].includes(j.status) ? 'good' : 'neutral')}<small>${esc(j.detail || '')}</small></td><td class="mono">${time(j.createdAt)}</td><td>${j.status === 'queued' ? `<button class="small ghost" data-action="cancel-job" data-id="${j.id}">Verwerfen</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}
function dashboard() {
  return pageHead('DEIN RUN IM BLICK', 'Übersicht', 'Verbindungen prüfen, Empfänger freigeben und Zuschaueraktionen steuern.', `<button class="ghost" data-action="demo">Demo öffnen</button><button class="primary" data-action="new-rule">+ Neue Regel</button>`)
    + modeNotice()
    + `<div class="grid metrics"><div class="metric accent"><span class="eyebrow">WARTESCHLANGE</span><div class="number">${S.stats.queued}</div><span class="tiny">${S.config.paused ? 'Ausführung pausiert' : 'Bereit zur Verarbeitung'}</span></div><div class="metric"><span class="eyebrow">AP BESTÄTIGT</span><div class="number">${S.stats.confirmed}</div><span class="tiny">Zusätzliche Items am Server</span></div><div class="metric"><span class="eyebrow">SIMULIERT</span><div class="number">${S.stats.simulated}</div><span class="tiny">Ohne Eingriff in den Run</span></div><div class="metric"><span class="eyebrow">SPIELSLOTS</span><div class="number">${S.players.filter(p => p.team === S.ap.team && p.type === 1 && p.approval.enabled).length}<span class="muted"> / ${S.players.filter(p => p.team === S.ap.team && p.type === 1).length}</span></div><span class="tiny">Für Zuschaueraktionen freigegeben</span></div></div>`
    + `<div class="grid columns"><section class="panel"><div class="panel-head"><div><h2>Verbindungen</h2><p>Trigger empfangen. Regeln auswerten. Effekte zustellen.</p></div><a class="tiny text-link" href="#quellen">Einrichten ↗</a></div>${sourceLine('CR', 'Charity Royale', S.config.charity.slug || 'Streamer-Slug noch nicht eingetragen', S.charity.state)}${sourceLine('TW', 'Twitch EventSub', 'Subs · Gift Subs · Bits · Kanalpunkte', S.twitch.state, 'purple')}${sourceLine('AP', 'Archipelago', S.ap.seed || 'Noch kein Raum verbunden', S.ap.state, 'blue')}</section><section class="panel"><div class="panel-head"><h2>Bis zur ersten Aktion</h2>${badge(S.ap.demo ? 'Demo aktiv' : 'SETUP')}</div><div class="step-list"><div class="step"><span class="step-number">1</span><div><b>Raum & Quellen verbinden</b><p>Bestehenden AP-Slot verwenden. Für zusätzliche Items ist das Server-Adminpasswort nötig.</p></div></div><div class="step"><span class="step-number">2</span><div><b>Slots & Effekte freigeben</b><p>Raumkatalog abgleichen, im Spiel testen, Items und Zufallspool auswählen.</p></div></div><div class="step"><span class="step-number">3</span><div><b>Regeln testen, dann live schalten</b><p>Simulieren prüft den Ablauf. Ein Live-Test prüft den tatsächlichen Spieleingriff.</p></div></div></div></section></div>`
    + `<section class="section-gap"><div class="section-title"><h2>Deine Regeln <span class="muted">${S.rules.length.toString().padStart(2, '0')}</span></h2><a href="#regeln">Alle Regeln →</a></div><div class="grid rules-grid">${S.rules.slice(0, 4).map(renderRule).join('') || empty('Keine Regeln', 'Lege einen Auslöser und eine Aktion an.')}</div></section>`
    + `<section class="panel section-gap"><div class="panel-head"><h2>Letzte Aktionen</h2><a class="tiny text-link" href="#ereignisse">Protokoll ↗</a></div>${queueTable(8)}</section>`;
}
function sourceStatus(key) { const obj = S[key]; return `${pill(obj.state)}${obj.error ? `<p class="connection-error">${esc(obj.error)}</p>` : ''}${key === 'twitch' && obj.rejected?.length ? `<p class="connection-error">${obj.rejected.map(esc).join('<br>')}</p>` : ''}`; }
function sourcesPage() {
  return pageHead('EINGÄNGE & AUSGANG', 'Verbindungen', 'Eine gemeinsame Regel-Engine für Spenden, Stream-Ereignisse und manuelle Tests.')
    + `<div class="grid source-grid"><section class="panel panel-pad"><div class="section-title"><h2>Archipelago-Raum</h2><span class="source-icon blue">AP</span></div><div data-status="ap">${sourceStatus('ap')}</div><form id="ap-form"><div class="form-grid narrow"><label class="full">Serveradresse<input name="url" value="${esc(S.config.ap.url)}" placeholder="ws://archipelago.gg:12345" required autocomplete="off"></label><label class="full">Existierender Slotname<input name="slotName" value="${esc(S.config.ap.slotName)}" placeholder="Name aus dem erzeugten Raum" required autocomplete="off"></label><label>Raumpasswort<input type="password" name="roomPassword" autocomplete="off" placeholder="Falls gesetzt"></label><label>Server-Adminpasswort<input type="password" name="adminPassword" autocomplete="off" placeholder="Für /send nötig"></label><label class="full">Erwartete Seed-ID <span class="muted">(optional)</span><input name="expectedSeed" value="${esc(S.config.ap.expectedSeed)}" placeholder="Bindet die Verbindung an diesen Seed"></label></div><div class="button-row"><button class="primary" type="submit">Raum verbinden</button><button type="button" class="ghost" data-action="disconnect-ap">Trennen</button></div></form><p class="help">Der Spielclient bleibt geöffnet. Die Bridge verbindet sich als zusätzlicher Text-Client und empfängt keine Spielitems. Zugangsdaten werden für diesen Raum lokal gemerkt.</p><p class="help">Items: <code>!admin /send</code> · DeathLink: Gruppe im eigenen AP-Team. <a href="https://archipelago.gg/tutorial/Archipelago/commands_en" target="_blank" rel="noreferrer">AP-Befehle ↗</a></p></section>`
    + `<section class="panel panel-pad"><div class="section-title"><h2>Charity Royale</h2><span class="source-icon">CR</span></div><div data-status="charity">${sourceStatus('charity')}</div><form id="charity-form"><div class="form-grid one"><label>Dein Streamer-Slug<input name="slug" value="${esc(S.config.charity.slug)}" placeholder="Slug aus deiner Spendenseite" required></label><label>Projekt<input name="project" value="${esc(S.config.charity.project)}" required></label></div><div class="button-row"><button class="primary" type="submit">Spenden verbinden</button><button class="ghost" type="button" data-action="disconnect-charity">Trennen</button></div></form><hr class="line"><h3>Spendenbuttons werden zu Aktionen</h3><p class="help">Trage in einer Regel die exakte Button-Aktion ein, etwa <code>random-trap</code>. Die Bridge vergleicht <code>metadata.action</code> und den Netto-Spendenbetrag in Cent.</p><p class="help">Offizielle Testspenden und Ereignisse ohne Spenden-ID bleiben immer Simulationen. WebSocket benötigt keine Portfreigabe.</p><p class="help">Die API liefert nicht in jedem Ereignis das Projekt mit. Entscheidend ist dein exakter Streamer-Slug. <a href="https://streamer.make-a-wish.at/api" target="_blank" rel="noreferrer">API-Dokumentation ↗</a></p></section>`
    + `<section class="panel panel-pad"><div class="section-title"><h2>Twitch EventSub</h2><span class="source-icon purple">TW</span></div><div data-status="twitch">${sourceStatus('twitch')}</div><form id="twitch-form"><div class="form-grid one"><label>Client-ID<input type="password" name="clientId" value="${esc(S.config.twitch.clientId)}" autocomplete="off" required></label><label>Broadcaster-ID <span class="muted">(optional, wird aus dem Token erkannt)</span><input name="broadcasterId" value="${esc(S.config.twitch.broadcasterId)}" autocomplete="off"></label></div>${Object.entries(S.twitchEvents).map(([key, info]) => `<label class="check-label"><input name="event" type="checkbox" value="${esc(key)}" ${S.config.twitch.events.includes(key) ? 'checked' : ''}><span>${esc(info.label)} <span class="tiny mono">${esc(info.scope)}</span></span></label>`).join('')}<div class="button-row section-gap"><button type="submit" class="primary">Mit Twitch anmelden</button><button type="button" class="ghost" data-action="disconnect-twitch">Trennen</button></div><details class="disclosure"><summary>Vorhandenen User Access Token verwenden</summary><label class="section-gap">Access Token<input name="token" type="password" autocomplete="off"></label><button type="button" class="small section-gap" data-action="twitch-token">Mit Token verbinden</button></details></form><p class="help">Eigene Twitch-App vom Typ „Confidential“ registrieren. Redirect-URL: <code>http://localhost:${location.port}/oauth/callback</code>. Client Secret optional für die automatische Token-Erneuerung. Zugangsdaten bleiben lokal und werden nicht exportiert.</p><p class="help">Gift-Pakete lösen einmal aus; zugehörige einzelne Gift-Sub-Events werden ignoriert. Nach Widerruf der Anmeldung erneut autorisieren. <a href="https://dev.twitch.tv/console/apps" target="_blank" rel="noreferrer">Twitch-Konsole ↗</a></p></section>`
    + `<section class="panel panel-pad"><div class="section-title"><h2>Streamer.bot & externe Trigger</h2><span class="source-icon blue">IN</span></div>${badge('Lokaler HTTP-Eingang')}<p class="help section-gap">Andere Anwendungen auf diesem PC können normalisierte Ereignisse an die Bridge senden. Preise, Ziele und Effekte bleiben in deinen Regeln.</p><pre>POST http://127.0.0.1:${location.port}/api/ingest
Authorization: Bearer &lt;Integration-Token&gt;
Content-Type: application/json

{
  "id": "eindeutige-event-id",
  "type": "sub",
  "user": "Zuschauer",
  "units": 1,
  "amountCents": 0,
  "action": "",
  "timestamp": &lt;Unix-Zeit in Millisekunden&gt;
}</pre><button data-action="integration" class="ghost">Integrationsdaten anzeigen</button><p class="help">Ereignisquelle der Regel: „Externer Trigger“. Fertige Streamer.bot-Beispiele liegen im Ordner <code>integrations</code>. Für dieselben Twitch-Ereignisse nur einen Eingang aktiv verwenden.</p></section></div>`;
}
function slotsPage() {
  const players = S.players.filter(p => p.team === S.ap.team && p.type === 1);
  return pageHead('EMPFÄNGER FÜR DEINE REGELN', 'Spieler & Effekte', 'Hier legst du fest, wen eine Aktion treffen darf und welche Items dafür erlaubt sind.', `<button class="primary" data-action="studio-player-add">+ Spieler</button>`)
    + `<div class="info-panel"><b>Spieler aus dem AP-Raum erscheinen automatisch.</b><p>Öffne „Items & Fallen auswählen“, erlaube die gewünschten Items und aktiviere den Spieler. Danach können Regeln ihn gezielt, gemeinsam mit anderen oder zufällig treffen. Eine zusätzliche Bridge-Anmeldung pro Spieler ist nicht nötig.</p></div>`
    + (S.ap.demo ? `<div class="notice"><div><b>Demo · keine Verbindung zu laufenden Spielen</b><p>Mit diesen Beispielspielern kannst du die Bedienung und Regeln testen.</p></div></div>` : '')
    + `<div class="grid rules-grid">${players.map(p => `<article class="panel panel-pad game-card"><div class="game-card-title"><div class="game-mark">${esc(p.game.split(' ').map(x => x[0]).join('').slice(0, 3))}</div><div><h3>${esc(p.name)}</h3><span class="tiny">${esc(p.game)} · AP-Slot ${p.slot}</span></div>${badge(p.approval.enabled ? 'Aktiv' : 'Noch gesperrt', p.approval.enabled ? 'good' : 'neutral')}</div><div class="summary-pills">${badge(`${p.approval.items?.length || 0} erlaubte Items`)}${badge(`${p.approval.traps?.length || 0} als Falle markiert`)}</div><p>${p.approval.enabled ? 'Dieser Spieler kann von passenden Regeln getroffen werden.' : 'Für diesen Spieler sind noch keine Zuschaueraktionen aktiviert.'}</p><button data-action="slot-edit" data-id="${p.team}:${p.slot}">Items & Fallen auswählen</button><p class="help">${p.itemCount} Items im Raumkatalog. Der tatsächliche Effekt wird vom jeweiligen Spielclient ausgeführt.</p></article>`).join('') || `<div class="panel">${empty('Spieler fehlen noch', 'Verbinde unter Verbindungen deinen AP-Raum. Die Bridge liest die Spieler automatisch ein.')}</div>`}</div>`
    + `<details class="panel advanced-section section-gap"><summary>DeathLink · gemeinsame Todesaktion</summary><div class="advanced-body"><p class="help">DeathLink erreicht die dafür aktivierten Clients im eigenen AP-Team. Es ist eine Gruppenaktion, auch wenn eine Regel sonst einzelne Spieler auswählt. DeathLink muss zusätzlich im jeweiligen Spielclient eingeschaltet sein.</p><label class="check-label"><input id="deathlink-armed" type="checkbox" ${S.config.deathLinkArmed ? 'checked' : ''}><span>DeathLink aus der Bridge für diese Sitzung erlauben</span></label></div></details>`
    + `<details class="panel advanced-section section-gap"><summary>Erweitert: Fallen-Vorschläge aus alten YAMLs · optional</summary><div class="advanced-body"><p class="help">Wird für die Spielerzuordnung nicht benötigt. Vorhandene YAMLs können zusätzliche Fallennamen vorschlagen; Spieleinstellungen bearbeitest du im Spielekatalog.</p><button class="small" data-action="yaml-import">Fallenliste aus YAML hinzufügen</button><div class="grid rules-grid section-gap">${S.yamlProfiles.map(p => `<article class="panel panel-pad"><div class="section-title"><h3>${esc(p.game)}</h3><button class="icon-button" data-action="yaml-delete" data-id="${p.id}" aria-label="YAML-Profil entfernen">×</button></div><span class="tiny">${esc(p.name)}</span><p class="help">${p.traps.length} Fallen-Vorschläge · werden mit dem Raumkatalog abgeglichen.</p></article>`).join('')}</div></div></details>`;
}
function rulesPage() { return pageHead('ZUORDNUNGEN', 'Du bestimmst die Wirkung.', 'Quelle, Schwelle, Aktion und Ziel sind je Regel konfigurierbar. Alle passenden Regeln werden ausgewertet.', '<button class="primary" data-action="new-rule">+ Neue Regel</button>') + modeNotice() + `<div class="grid rules-grid">${S.rules.map(renderRule).join('') || `<div class="panel">${empty('Keine Regeln', 'Lege eine Zuordnung für deine erste Zuschaueraktion an.')}</div>`}</div>`; }
function eventsPage() {
  const tabs = { queue: 'Warteschlange', incoming: 'Eingänge', logs: 'Systemprotokoll' };
  let content = '';
  if (eventTab === 'queue') content = queueTable();
  if (eventTab === 'incoming') content = S.events.length ? `<div class="table-wrap"><table><thead><tr><th>Ereignis</th><th>Auslöser</th><th>Zuordnung</th><th>Modus</th><th>Zeit</th></tr></thead><tbody>${S.events.map(e => `<tr><td><strong>${esc(sourceNames[e.source])} · ${esc(typeNames[e.type])}</strong><small>${esc(e.user)} · ${esc(e.id)}</small></td><td>${e.amountCents ? esc(eur(e.amountCents)) : esc(e.units || '—')}<small>${esc(e.action || '')}</small></td><td>${e.jobs || 0} Aufträge<small>${esc(e.matchedRules?.join(', ') || 'Keine passende aktive Regel')}${e.errors?.length ? '<br>' + e.errors.map(esc).join('<br>') : ''}</small></td><td>${badge(e.dryRun ? 'Test' : 'LIVE', e.dryRun ? 'neutral' : 'warn')}</td><td class="mono">${time(e.receivedAt)}</td></tr>`).join('')}</tbody></table></div>` : empty('Noch keine Eingänge', 'Nur tatsächlich empfangene oder lokal simulierte Ereignisse erscheinen hier.');
  if (eventTab === 'logs') content = S.logs.length ? S.logs.map(l => `<div class="activity-row"><span class="activity-dot ${l.level === 'error' ? 'error' : ''}"></span><div class="message">${esc(l.message)}</div><span class="timestamp">${time(l.at)}</span></div>`).join('') : empty('Kein Systemprotokoll', 'Verbindungsinformationen erscheinen nach dem ersten Verbindungsversuch.');
  return pageHead('NACHVOLLZIEHBARKEIT', 'Jede Aktion sichtbar.', '„AP bestätigt“ bedeutet: am Server zugestellt. Ob der Effekt im Spiel ausgeführt wurde, quittiert Archipelago hier nicht.', '<button class="ghost" data-action="clear-queue">Wartende verwerfen</button>') + modeNotice() + `<div class="tabs">${Object.entries(tabs).map(([key, label]) => `<button class="${eventTab === key ? 'active' : ''}" data-action="event-tab" data-id="${key}">${label}</button>`).join('')}</div><section class="panel">${content}</section><p class="help">Unklare Zustellungen werden niemals automatisch wiederholt. Neu erzeugte Ereignisse mit neuer ID können dieselbe Aktion erneut auslösen.</p>`;
}
function settingsPage() {
  return pageHead('DEIN WORKSPACE', 'Einstellungen', 'Programmupdates, Sicherung und erweiterte Einstellungen an einem Ort.')
    + `<div class="grid source-grid"><section class="panel"><a class="setup-link" href="#design"><span class="step-number">◐</span><div><b>Design anpassen</b><small>Darkmode, Lightmode und eigene Akzentfarben</small></div></a><a class="setup-link" href="#alerts"><span class="step-number">✦</span><div><b>Stream-Alerts einrichten</b><small>Optionale OBS-Anzeige mit deiner Animation</small></div></a></section><section class="panel panel-pad"><h2>Konfiguration sichern</h2><p class="help">Regeln und Einstellungen ohne Zugangsdaten exportieren. Nach einem Import beginnt die Bridge im Testmodus; Spielerfreigaben werden erneut geprüft.</p><div class="button-row section-gap"><a class="text-link" href="/api/export" download>Konfiguration exportieren ↓</a><button class="small ghost" data-action="config-import">Importieren</button></div></section></div>`
    + Updates.panel()
    + `<details class="panel advanced-section section-gap"><summary>Erweitert: Warteschlange & Zeitlimits</summary><div class="advanced-body"><form id="limits-form"><div class="form-grid narrow"><label>Abstand zwischen Aktionen (Sekunden)<input type="number" name="globalCooldownSec" min="0" max="3600" step="0.25" value="${S.config.globalCooldownSec}"></label><label>Maximal wartende Aktionen<input type="number" name="maxQueue" min="1" max="1000" value="${S.config.maxQueue}"></label><label>Auftrag gültig (Sekunden)<input type="number" name="queueTtlSec" min="30" max="86400" value="${S.config.queueTtlSec}"></label><label>Ereignis höchstens alt (Sekunden)<input type="number" name="eventMaxAgeSec" min="10" max="3600" value="${S.config.eventMaxAgeSec}"></label></div><button type="submit">Zeitlimits speichern</button></form><p class="help">Die Standards passen für die meisten Runs. Regelpausen und diese Zeitlimits verhindern zu viele gleichzeitig ausgeführte Aktionen.</p></div></details><section class="panel panel-pad section-gap"><h2>Bridge beenden</h2><p class="help">Schließt die Verbindungen und pausiert die Ausführung. Bereits im Spiel zugestellte Effekte bleiben bestehen.</p><button class="danger section-gap" data-action="shutdown">Tool beenden</button></section>`;
}
function render(force = false) {
  if (!S) return;
  const page = currentPage.split('/')[0];
  if (!names[page]) currentPage = 'regie';
  $('#breadcrumb').textContent = names[page] || names.regie;
  Studio.shell();
  Appearance.sync(S.appearance);
  document.querySelectorAll('[data-page]').forEach(a => a.classList.toggle('active', a.dataset.page === currentPage));
  const cp = $('#connection-pill'); cp.textContent = S.ap.demo ? 'AP · Demo' : S.ap.connected ? 'AP verbunden' : 'AP getrennt'; cp.className = 'pill ' + (S.ap.connected ? 'good' : '');
  $('#mode').value = S.config.mode;
  $('#source-count').textContent = [S.charity, S.twitch].filter(x => x.state === 'connected').length;
  $('#footer-status').textContent = S.ap.demo ? 'Demo · keine Spielverbindung' : S.ap.connected ? S.ap.seed + (S.ap.admin ? ' · Admin aktiv' : ' · Admin fehlt') : 'Lokal · kein AP-Raum verbunden';
  document.querySelectorAll('.version, footer b').forEach(el => el.textContent = el.classList.contains('version') ? S.version : 'V' + S.version);
  Updates.sync();
  if (!force && ['quellen', 'einrichtung'].includes(currentPage) && $('#main').children.length) {
    document.querySelectorAll('[data-status]').forEach(el => el.innerHTML = sourceStatus(el.dataset.status));
    const authStatus = $('#ap-form .statusbar');
    if (authStatus) authStatus.innerHTML = badge(S.ap.connected ? 'AP verbunden' : 'AP getrennt', S.ap.connected ? 'good' : '') + badge(S.ap.admin ? 'Admin angemeldet' : 'Admin nicht angemeldet', S.ap.admin ? 'good' : 'warn');
    return;
  }
  if (!force && document.activeElement?.closest('form')) return;
  if (!force && page === 'spiel' && $('#studio-yaml-form')) return;
  const pages = { regie: dashboard, quellen: () => Studio.sourcesPage(sourcesPage()), spielslots: () => slotsPage() + Studio.playersPanel(), design: () => Appearance.page(), alerts: () => Alerts.page(), regeln: rulesPage, ereignisse: () => Studio.eventsPage(eventsPage), einrichtung: settingsPage, katalog: () => Studio.catalogPage(), raeume: () => Studio.roomsPage(), spiel: () => Studio.gamePage() };
  $('#main').innerHTML = (pages[page] || dashboard)();
  Updates.sync();
}
function showDrawer(content) { $('#drawer-content').innerHTML = content; if (!$('#drawer').open) $('#drawer').showModal(); }
const drawerHead = (title, description) => `<div class="drawer-head"><div><h2>${esc(title)}</h2><p>${esc(description)}</p></div><button type="button" class="icon-button" data-action="close-drawer" aria-label="Schließen">×</button></div>`;
function editRule(id) {
  const r = S.rules.find(x => x.id === id) || { name: 'Neue Regel', enabled: false, source: 'charity', type: 'donation', minimumCents: 1000, minimumUnits: 0, action: '', rewardId: '', effect: 'random_trap', target: 'random', quantity: 1, cooldownSec: 20, item: '', game: '', randomEffects: ['random_trap', 'random_nontrap'] };
  const games = [...new Set([...S.players.filter(p => p.team === S.ap.team && p.type === 1).map(p => p.game), r.game])].filter(Boolean).sort();
  const targets = { random: 'Ein zufälliger freigegebener Spieler', all: 'Alle passenden freigegebenen Spieler', ...Object.fromEntries(S.players.filter(p => p.team === S.ap.team && p.type === 1).map(p => [`${p.team}:${p.slot}`, `${p.name} · ${p.game}`])), group: 'Gruppe / Anzeige' };
  const selectedEffects = r.randomEffects?.length ? r.randomEffects : ['random_item', ...(r.includeDeathLink ? ['deathlink'] : [])];
  showDrawer(drawerHead(id ? 'Regel bearbeiten' : 'Neue Regel', 'Lege fest, wann etwas passiert, was passiert und wen es trifft.') + `<form id="rule-form"><div class="drawer-body"><input type="hidden" name="id" value="${esc(r.id || '')}"><label class="section-gap">Name der Regel<input name="name" value="${esc(r.name)}" maxlength="100" required></label>
  <fieldset class="rule-section"><legend><span>1</span>Auslöser</legend><div class="form-grid"><label>Quelle<select name="source">${options(sourceNames, r.source)}</select></label><label>Ereignis<select name="type">${options(typeNames, r.type)}</select></label><label>Mindestens Euro netto<input type="number" name="euros" min="0" max="1000000" step="0.01" value="${r.minimumCents / 100}"></label><label>Mindestens Subs / Bits<input type="number" name="minimumUnits" min="0" max="10000000" value="${r.minimumUnits}"></label></div><details class="disclosure" ${r.action || r.rewardId ? 'open' : ''}><summary>Bestimmten Spendenbutton oder Kanalpunkte-Reward verwenden</summary><label class="section-gap">Button-/Aktionskennung <span class="muted">(leer = alle)</span><input name="action" value="${esc(r.action)}" placeholder="Zum Beispiel random-trap"><span class="help">Wird mit der Aktionskennung des eingehenden Ereignisses verglichen, bei Charity Royale mit metadata.action.</span></label><label class="section-gap">Kanalpunkte-Reward-ID <span class="muted">(optional)</span><input name="rewardId" value="${esc(r.rewardId || '')}"></label></details></fieldset>
  <fieldset class="rule-section"><legend><span>2</span>Aktion</legend><label class="section-gap">Was soll passieren?<select name="effect" id="rule-effect">${options(effectNames, r.effect)}</select></label><div id="rule-effect-description" class="action-description"></div>
  <div class="random-help" id="rule-action-mix"><b class="tiny">Diese Aktionsarten dürfen zufällig gewählt werden</b><div class="mix-options">${Object.entries(effectNames).filter(([key]) => key !== 'random_action').map(([key, label]) => `<label class="check-label"><input type="checkbox" name="randomEffects" value="${key}" ${selectedEffects.includes(key) ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('')}</div><p class="help">Jede aktuell mögliche, ausgewählte Aktionsart hat dieselbe Chance. Ist ein Pool leer oder eine Aktion gesperrt, wird sie ausgelassen. DeathLink braucht zusätzlich die Gruppenfreigabe.</p></div>
  <label class="section-gap" id="rule-item-field">Itemname<input name="item" list="rule-items" value="${esc(r.item || '')}" placeholder="Item aus dem verbundenen Raum wählen"><datalist id="rule-items"></datalist></label><label class="section-gap" id="rule-pool-field">Eigene Zufallsliste · ein Itemname pro Zeile<textarea name="itemPool" rows="5" placeholder="Bomb Trap&#10;Potion">${esc((r.itemPool || []).join('\n'))}</textarea><span class="help">Pro Empfänger werden nur Namen verwendet, die in dessen Raumkatalog stehen und für ihn erlaubt sind.</span></label><label class="section-gap" id="rule-message-field">Text<input name="message" value="${esc(r.message || '')}" maxlength="300" placeholder="{user} hat eine Aktion ausgelöst!"><span class="help">{user} setzt den Zuschauernamen ein, {rule} den Regelnamen. AP-Chatnachrichten erhalten den Präfix [AP Chaos].</span></label></fieldset>
  <fieldset class="rule-section"><legend><span>3</span>Empfänger</legend><div class="form-grid" id="rule-recipient-fields"><label class="full" id="rule-game-field">Nur Spieler dieses Spiels<select name="game" id="rule-game"><option value="">Alle Spiele im verbundenen Raum</option>${options(Object.fromEntries(games.map(g => [g, g])), r.game)}</select><span class="help">Kommt aus der Spielzuordnung der verbundenen AP-Slots. Der Filter prüft das Spiel des Empfängers, nicht das Spiel des Zuschauers und keine YAML-Datei.</span></label><label class="full" id="rule-target-field">Wen soll es treffen?<select name="target" id="rule-target">${options(targets, r.target)}</select></label></div><div id="rule-recipient-preview" class="rule-recipients" role="status"></div><div class="form-grid"><label id="rule-quantity-field">Items je getroffenem Spieler<input type="number" name="quantity" min="1" max="5" value="${r.quantity}"><span class="help">Feste Anzahl pro Ereignis.</span></label><label>Pause dieser Regel (Sekunden)<input type="number" name="cooldownSec" min="0" max="86400" value="${r.cooldownSec}"></label></div></fieldset><label class="check-label"><input type="checkbox" name="enabled" ${r.enabled ? 'checked' : ''}><span>Regel aktivieren</span></label><p class="help">Alle passenden aktiven Regeln werden ausgelöst. Testmodus und „Simulieren“ senden keine Spielaktion.</p>${id ? `<button class="small danger section-gap" type="button" data-action="delete-rule" data-id="${r.id}">Regel löschen</button>` : ''}</div><div class="drawer-foot"><button type="button" class="ghost" data-action="close-drawer">Abbrechen</button><button class="primary" type="submit">Regel speichern</button></div></form>`);
  Studio.extendRule(r); updateRuleCatalog();
}
async function updateRuleCatalog() {
  const form = $('#rule-form'); if (!form) return;
  const generation = updateRuleCatalog.generation = (updateRuleCatalog.generation || 0) + 1, game = form.elements.namedItem('game').value;
  const games = game ? [game] : [...new Set(S.players.filter(p => p.team === S.ap.team && p.type === 1).map(p => p.game))];
  const catalogs = await Promise.all(games.map(g => api('catalog?game=' + encodeURIComponent(g))));
  if (!$('#rule-items') || generation !== updateRuleCatalog.generation) return;
  const items = [...new Set(catalogs.flatMap(c => c.items))].sort();
  $('#rule-items').innerHTML = items.slice(0, 3000).map(i => `<option value="${esc(i)}"></option>`).join('');
}
async function editSlot(key) {
  const p = S.players.find(p => `${p.team}:${p.slot}` === key); const catalog = await api('catalog?game=' + encodeURIComponent(p.game));
  approvalEditor = { key, player: p, catalog, items: new Set(p.approval.items || []), traps: new Set(p.approval.traps || []) };
  showDrawer(drawerHead(p.name, p.game + ' · nur Items aus dem verbundenen Raum') + `<form id="approval-form"><div class="drawer-body"><label class="check-label section-gap"><input name="enabled" type="checkbox" ${p.approval.enabled ? 'checked' : ''}><span>Diesen Slot für Zuschauer-Items freigeben</span></label><p class="help">„Erlaubt“ gibt ein Item für diesen Spieler frei. „Falle“ markiert es für Zufallsfallen und trennt es von den übrigen Items. Teste den tatsächlichen Effekt mit dem passenden Spielclient, bevor bezahlte Ereignisse darauf zugreifen.</p><input id="item-search" class="section-gap" placeholder="Item im Raumkatalog suchen …" aria-label="Items durchsuchen"><div class="button-row section-gap"><button class="small ghost" type="button" data-action="candidate-pool">Vorhandene Fallen-Vorschläge auswählen</button><button class="small ghost" type="button" data-action="empty-pool">Auswahl leeren</button></div><p class="help" id="pool-count"></p><div class="item-list" id="item-results"></div></div><div class="drawer-foot"><button type="button" class="ghost" data-action="close-drawer">Abbrechen</button><button class="primary" type="submit">Freigabe speichern</button></div></form>`);
  renderItemList();
  const all = document.createElement('button'); all.type = 'button'; all.className = 'small ghost'; all.dataset.action = 'studio-all-items'; all.textContent = 'Alle Katalogitems für Zufallsaktionen erlauben'; $('#approval-form .button-row').append(all);
}
function renderItemList() {
  if (!approvalEditor) return; const e = approvalEditor, query = ($('#item-search')?.value || '').toLowerCase();
  const candidates = new Set(e.catalog.candidates);
  const filtered = e.catalog.items.filter(i => i.toLowerCase().includes(query)).sort((a, b) => Number(e.items.has(b)) - Number(e.items.has(a)) || Number(candidates.has(b)) - Number(candidates.has(a)) || a.localeCompare(b));
  $('#pool-count').textContent = `${e.items.size} erlaubt · ${e.traps.size} als Falle markiert · ${filtered.length} Treffer`;
  $('#item-results').innerHTML = `<div class="item-header">${filtered.length > 150 ? 'ERSTE 150 TREFFER · SUCHE EINGRENZEN' : 'ITEM AUS DEM RAUMKATALOG'}</div>` + filtered.slice(0, 150).map(i => `<div class="item-row"><span class="item-name">${esc(i)} ${candidates.has(i) ? '<span class="tiny">· Vorschlag</span>' : ''}</span><label><input type="checkbox" data-item="${esc(i)}" data-kind="items" ${e.items.has(i) ? 'checked' : ''}>Erlaubt</label><label><input type="checkbox" data-item="${esc(i)}" data-kind="traps" ${e.traps.has(i) ? 'checked' : ''}>Falle</label></div>`).join('');
}
async function showIntegration() {
  const response = await fetch('/api/integration', { headers: { 'X-Bridge-Session': S.session } }); integration = await response.json();
  if (!response.ok) throw new Error(integration.error);
  showDrawer(drawerHead('Externe Trigger', 'Lokaler Eingang für Streamer.bot und andere Anwendungen.') + `<div class="drawer-body"><p class="help section-gap">Der Token erlaubt Ereignisse, die deine aktiven Regeln auslösen. Nur in der lokalen Integration hinterlegen.</p><pre>${esc(integration.url)}</pre><label class="section-gap">Integration-Token<div class="key-line"><input type="password" value="${esc(integration.token)}" readonly autocomplete="off"><button type="button" data-action="copy-token">Kopieren</button></div></label><p class="help section-gap">Quelle wird immer als <code>external</code> gesetzt. Derselbe Token wird lokal in <code>data/integration-key.txt</code> gespeichert. Löschen der Datei bei geschlossenem Tool erzeugt einen neuen.</p></div><div class="drawer-foot"><button data-action="close-drawer">Schließen</button></div>`);
}
function importDrawer(kind) {
  const yaml = kind === 'yaml';
  showDrawer(drawerHead(yaml ? 'Fallenliste aus YAML' : 'Konfiguration importieren', yaml ? 'Liest Fallen-Vorschläge und DeathLink-Hinweise. Spieleinstellungen werden im Katalog aus APworlds eingelesen. Mehrere Dokumente mit --- werden unterstützt.' : 'JSON-Export laden. Danach im Testmodus und mit pausierter Warteschlange prüfen.') + `<form id="${yaml ? 'yaml-form' : 'config-form'}"><div class="drawer-body"><label class="section-gap">Datei auswählen<input id="import-file" type="file" accept="${yaml ? '.yaml,.yml' : '.json'}"></label><label class="section-gap">Oder Inhalt einfügen<textarea name="text" required spellcheck="false" rows="10" maxlength="262144"></textarea></label></div><div class="drawer-foot"><button type="button" class="ghost" data-action="close-drawer">Abbrechen</button><button class="primary" type="submit">Importieren</button></div></form>`);
}
async function saveTwitch(form) {
  const d = new FormData(form);
  await api('config', { twitch: { clientId: d.get('clientId'), broadcasterId: d.get('broadcasterId'), events: d.getAll('event') } });
  if (d.has('clientSecret')) await api('twitch/credentials', { clientSecret: d.get('clientSecret') });
}

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]'); if (!button) return; event.preventDefault();
  const action = button.dataset.action, id = button.dataset.id;
  try {
    if (action.startsWith('appearance-')) return await Appearance.click(action, id);
    if (action.startsWith('alerts-')) return await Alerts.click(action);
    if (action.startsWith('update-')) return await Updates.click(action, button);
    if (action.startsWith('studio-')) return await Studio.click(action, id, button);
    if (action === 'close-drawer') { $('#drawer').close(); approvalEditor = null; integration = null; return; }
    if (action === 'new-rule' || action === 'edit-rule') return editRule(id);
    if (action === 'slot-edit') return await editSlot(id);
    if (action === 'yaml-import' || action === 'config-import') return importDrawer(action === 'yaml-import' ? 'yaml' : 'config');
    if (action === 'event-tab') { eventTab = id; return render(true); }
    if (action === 'integration') return await showIntegration();
    if (action === 'copy-token') { await navigator.clipboard.writeText(integration.token); return toast('Token kopiert.'); }
    if (action === 'copy-overlay') { await navigator.clipboard.writeText(location.origin + '/overlay'); return toast('OBS-URL kopiert.'); }
    if (action === 'candidate-pool') { for (const i of approvalEditor.catalog.candidates) if (approvalEditor.catalog.items.includes(i)) { approvalEditor.items.add(i); approvalEditor.traps.add(i); } return renderItemList(); }
    if (action === 'empty-pool') { approvalEditor.items.clear(); approvalEditor.traps.clear(); return renderItemList(); }
    button.disabled = true;
    if (action === 'demo') { await api('demo', {}); toast('Demo geöffnet. Simuliere eine Regel.'); }
    else if (action === 'pause') await api('pause', { paused: !S.config.paused });
    else if (action === 'disconnect-ap') await api('ap/disconnect', {});
    else if (action === 'disconnect-charity') await api('charity/disconnect', {});
    else if (action === 'disconnect-twitch') await api('twitch/disconnect', {});
    else if (action === 'test-rule' || action === 'live-rule') { await api('test-rule', { id, live: action === 'live-rule' }); toast(S.config.paused ? 'Auftrag erstellt. Ausführung ist pausiert.' : 'Auftrag erstellt.'); }
    else if (action === 'delete-rule') { await api('rule/delete', { id }); $('#drawer').close(); }
    else if (action === 'cancel-job') await api('queue/cancel', { id });
    else if (action === 'clear-queue') await api('queue/clear', {});
    else if (action === 'yaml-delete') await api('yaml/delete', { id });
    else if (action === 'twitch-token') { const form = $('#twitch-form'), token = new FormData(form).get('token'); await saveTwitch(form); await api('twitch/connect', { token }); }
    else if (action === 'shutdown') { await api('shutdown', {}); toast('Tool wird beendet.'); return; }
    await refresh(true);
  } catch (error) { toast(error.message, true); }
  finally { button.disabled = false; }
});
document.addEventListener('submit', async event => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  // Named form controls override DOM properties such as form.id in browsers.
  const formId = form.getAttribute('id');
  if (!formId) return;
  event.preventDefault();
  const d = new FormData(form), submit = form.querySelector('[type=submit]');
  const previousError = form.querySelector('[data-form-error]');
  if (previousError) previousError.textContent = '';
  if (submit) submit.disabled = true;
  try {
    if (formId === 'appearance-form') { await Appearance.submit(); return; }
    if (formId === 'alerts-form' || formId === 'alerts-media-form') { await Alerts.submit(form); return; }
    if (formId === 'update-token-form') { await Updates.submit(form); return; }
    if (formId.startsWith('studio-')) { await Studio.submit(form); return; }
    if (formId === 'ap-form') { await api('ap/connect', Object.fromEntries(d)); }
    else if (formId === 'charity-form') { await api('config', { charity: Object.fromEntries(d) }); await api('charity/connect', {}); }
    else if (formId === 'twitch-form') {
      const popup = window.open('about:blank', 'ap-twitch-auth');
      await saveTwitch(form); const result = await api('twitch/auth', {});
      if (popup) { popup.opener = null; popup.location.href = result.url; } else location.href = result.url;
    }
    else if (formId === 'limits-form') await api('config', Object.fromEntries([...d].map(([k, v]) => [k, Number(v)])));
    else if (formId === 'rule-form') {
      const r = Object.fromEntries(d); r.enabled = d.has('enabled'); r.minimumCents = Math.round(Number(d.get('euros')) * 100); r.targetKeys = d.getAll('targetKeys'); r.randomEffects = d.getAll('randomEffects'); r.includeDeathLink = r.randomEffects.includes('deathlink'); r.itemPool = String(d.get('itemPool') || '').split(/\r?\n/).map(v => v.trim()).filter(Boolean);
      if (r.effect === 'random_action' && !r.randomEffects.length) throw new Error('Mindestens eine Zufallsaktion auswählen.');
      await api('rule', r); $('#drawer').close(); toast('Regel gespeichert.');
    } else if (formId === 'approval-form') {
      await api('approval', { targetKey: approvalEditor.key, enabled: d.has('enabled'), items: [...approvalEditor.items], traps: [...approvalEditor.traps] });
      $('#drawer').close(); approvalEditor = null; toast('Slotfreigabe gespeichert.');
    } else if (formId === 'yaml-form') { await api('yaml', { text: d.get('text') }); $('#drawer').close(); toast('YAML importiert.'); }
    else if (formId === 'config-form') { await api('import', JSON.parse(d.get('text'))); $('#drawer').close(); toast('Konfiguration importiert.'); }
    await refresh(true);
  } catch (error) {
    let errorMessage = form.querySelector('[data-form-error]');
    if (!errorMessage) {
      errorMessage = document.createElement('p');
      errorMessage.className = 'inline-error';
      errorMessage.setAttribute('data-form-error', '');
      errorMessage.setAttribute('role', 'alert');
      (form.querySelector('.drawer-body') || form).append(errorMessage);
    }
    errorMessage.textContent = error.message;
    toast(error.message, true);
  }
  finally { if (submit) submit.disabled = false; }
});
document.addEventListener('change', async event => {
  const t = event.target;
  try {
    if (['playerName', 'playerGame'].includes(t.name)) Studio.updatePlayerRow(t);
    if (t.dataset.optionCustom !== undefined) { const input = document.querySelector('[data-custom-input="' + t.dataset.optionCustom + '"]'); input.classList.toggle('hidden', t.value !== '__custom__'); input.disabled = t.value !== '__custom__'; }
    if (t.dataset.optionEnable !== undefined) document.querySelector('[data-option-fieldset="' + t.dataset.optionEnable + '"]').disabled = !t.checked;
    if (t.id === 'room-select') { await api('rooms/activate', { id: t.value }); Studio.entry = null; Studio.loadingGame = ''; Studio.logGame = ''; await refresh(true); }
    if (t.id === 'studio-log-game') { Studio.logGame = t.value; render(true); }
    if (t.id === 'ap-address-mode') $('#ap-host-label').classList.toggle('hidden', t.value !== 'custom');
    if (t.closest('#rule-form')) Studio.ruleVisibility();
    if (t.id === 'mode') { await api('mode', { mode: t.value }); await refresh(true); }
    if (t.id === 'deathlink-armed') { await api('config', { deathLinkArmed: t.checked }); await refresh(); }
    if (t.id === 'rule-game') await updateRuleCatalog();
    if (t.id === 'rule-effect') { if (t.value === 'deathlink') $('#rule-target').value = 'group'; else if ($('#rule-target').value === 'group') $('#rule-target').value = 'random'; }
    if (t.id === 'rule-effect') Studio.ruleVisibility();
    if (t.id === 'import-file' && t.files[0]) { if (t.files[0].size > 262144) throw new Error('Datei ist zu groß.'); t.closest('form').elements.text.value = await t.files[0].text(); }
    if (t.dataset.item && approvalEditor) {
      const e = approvalEditor, item = t.dataset.item;
      if (t.dataset.kind === 'items') { t.checked ? e.items.add(item) : e.items.delete(item); if (!t.checked) e.traps.delete(item); }
      else { t.checked ? e.traps.add(item) : e.traps.delete(item); if (t.checked) e.items.add(item); }
      renderItemList();
    }
  } catch (error) { toast(error.message, true); await refresh(); }
});
document.addEventListener('input', async event => {
  if (event.target.closest('#appearance-form')) { Appearance.draft = Appearance.read(); Appearance.apply(Appearance.draft, false); }
  if (event.target.closest('#rule-form')) Studio.ruleVisibility();
  if (event.target.id === 'studio-search') $('#studio-catalog-results').innerHTML = Studio.catalogCards(event.target.value);
  if (event.target.id === 'studio-option-search') {
    const query = event.target.value.toLowerCase();
    document.querySelectorAll('[data-option-search]').forEach(el => el.classList.toggle('hidden', !el.dataset.optionSearch.includes(query)));
    const common = $('.studio-common'); if (common) common.open = Boolean(query && common.querySelector('[data-option-search]:not(.hidden)'));
  }
  if (event.target.id === 'item-search') renderItemList();
  if (event.target.id === 'catalog-search') {
    try {
      indexData ||= await api('game-index'); const q = event.target.value.toLowerCase();
      const games = q.length >= 2 ? indexData.games.filter(g => g.game.toLowerCase().includes(q)).slice(0, 30) : [];
      $('#catalog-results').innerHTML = games.map(g => `<article class="panel catalog-card"><h3>${esc(g.game)}</h3>${badge(g.stability)}<p>AP-Status aus der Referenzliste. Live-Effekte separat prüfen.</p><button class="small section-gap" data-action="studio-game" data-id="${esc(g.game)}">Einstellungen & YAML</button></article>`).join('') || empty(q.length < 2 ? 'Mindestens 2 Zeichen eingeben' : 'Kein Treffer', `Stand: ${indexData.date || 'unbekannt'} · Kein vollständiger Effektkatalog.`);
    } catch (e) { toast(e.message, true); }
  }
});
$('#emergency').addEventListener('click', async () => { try { await api('emergency', {}); await refresh(true); toast('Notaus aktiv. Wartende Aktionen verworfen.'); } catch (e) { toast(e.message, true); } });
window.addEventListener('hashchange', () => { currentPage = location.hash.slice(1) || 'regie'; render(true); window.scrollTo(0, 0); });
$('#drawer').addEventListener('click', event => { if (event.target === $('#drawer')) { const rect = $('#drawer').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('#drawer').close(); } });
refresh(true).then(() => {
  const events = new EventSource('/api/events'); let timer;
  events.addEventListener('change', () => { clearTimeout(timer); timer = setTimeout(() => refresh(), 100); });
  events.onerror = () => { $('#footer-status').textContent = 'Verbindung zur lokalen Bridge unterbrochen'; };
  setInterval(() => refresh(), 15000);
});
