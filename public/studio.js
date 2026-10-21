'use strict';
const Studio = {
  entry: null, loadingGame: '', gameError: '', logGame: '', scanReport: '', indexLoading: false,
  commonKeys: new Set(['progression_balancing', 'accessibility', 'local_items', 'non_local_items', 'start_inventory', 'start_hints', 'start_location_hints', 'exclude_locations', 'priority_locations', 'item_links', 'plando_items']),
  shell() {
    const select = document.querySelector('#room-select');
    if (select && S.rooms) {
      const html = options(Object.fromEntries(S.rooms.rooms.map(r => [r.id, r.name])), S.rooms.active);
      if (select.innerHTML !== html) select.innerHTML = html;
      select.value = S.rooms.active;
    }
  },
  knownGames() { return [...new Set([...(S.gameLibrary?.games || []).map(g => g.game), ...(indexData?.games || []).map(g => g.game), ...S.players.map(p => p.game)])].sort(); },
  async loadIndex() {
    if (indexData || this.indexLoading) return;
    this.indexLoading = true;
    try { indexData = await api('game-index'); if (currentPage === 'katalog') render(true); }
    catch (e) { toast(e.message, true); }
    finally { this.indexLoading = false; }
  },
  roomsPage() {
    return pageHead('RUNS & SPIELE', 'Deine Räume.', 'Jeder Raum behält seine Verbindungen, Regeln, Spielerprofile und Protokolle.', '<button class="primary" data-action="studio-room-new">+ Raum anlegen</button>')
      + `<div class="grid rules-grid">${S.rooms.rooms.map(r => `<article class="panel panel-pad"><div class="section-title"><h2>${esc(r.name)}</h2>${badge(r.id === S.rooms.active ? 'Geöffnet' : 'Gespeichert', r.id === S.rooms.active ? 'good' : '')}</div><p>${esc(r.game || 'Multiworld · mehrere Spiele')}</p><div class="button-row"><button data-action="studio-room-open" data-id="${r.id}" ${r.id === S.rooms.active ? 'disabled' : ''}>Raum öffnen</button><button class="ghost" data-action="studio-room-edit" data-id="${r.id}">Bearbeiten</button></div></article>`).join('')}</div><p class="help">Den zugehörigen Archipelago-Server verbindest du unter Quellen. Beim Raumwechsel werden die Verbindungen des geöffneten Raums wiederhergestellt; die Ausführung beginnt pausiert im Testmodus.</p>`;
  },
  roomDrawer(id) {
    const room = S.rooms.rooms.find(r => r.id === id);
    showDrawer(drawerHead(room ? 'Raum bearbeiten' : 'Raum anlegen', 'Ein eigener Arbeitsbereich für deinen Run.') + `<form id="studio-room-form"><div class="drawer-body"><input type="hidden" name="roomId" value="${esc(id || '')}"><label class="section-gap">Raumname<input name="name" required maxlength="100" value="${esc(room?.name || '')}" placeholder="Stardew · Charity Royale"></label><label class="section-gap">Spiel <span class="muted">(optional, leer für Multiworld)</span><input name="game" list="studio-games" value="${esc(room?.game || '')}"><datalist id="studio-games">${this.knownGames().map(g => `<option value="${esc(g)}"></option>`).join('')}</datalist></label></div><div class="drawer-foot"><button class="ghost" type="button" data-action="close-drawer">Abbrechen</button><button class="primary" type="submit">Speichern</button></div></form>`);
  },
  catalogCards(query = '') {
    const imported = new Map((S.gameLibrary?.games || []).map(g => [g.game, g]));
    const list = new Map([...(indexData?.games || []).map(g => [g.game, g]), ...[...imported.values()].map(g => [g.game, { ...g, stability: 'Eigene Vorlage' }])]);
    const sorted = [...list.values()].filter(g => g.game.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(imported.has(b.game)) - Number(imported.has(a.game)) || a.game.localeCompare(b.game));
    return sorted.slice(0, query ? 60 : 18).map(g => { const entry = imported.get(g.game); return `<article class="panel catalog-card"><div class="section-title"><h3>${esc(g.game)}</h3>${badge(entry ? entry.kind === 'apworld' ? 'APworld' : 'YAML' : g.stability || 'Referenz', entry ? 'good' : '')}</div><p>${entry ? `${entry.optionCount} Einstellungen · ${esc(entry.source)}` : 'YAML-Vorlage oder APworld hinzufügen, um Einstellungen zu bearbeiten.'}</p><button class="small section-gap" data-action="studio-game" data-id="${esc(g.game)}">${entry ? 'Einstellungen & YAML' : 'Spiel öffnen'}</button></article>`; }).join('') || empty('Kein Spiel gefunden', 'Eine eigene YAML-Vorlage oder APworld fügt das Spiel hinzu.');
  },
  catalogPage() {
    void this.loadIndex();
    return pageHead('SPIELEKATALOG', 'Deine Spiele. Deine Settings.', 'Suche ein Spiel, hinterlege seine Einstellungen und exportiere eine YAML für jeden Spieler.', '<button class="primary" data-action="studio-import">+ APworld / YAML hinzufügen</button>')
      + `<section class="panel panel-pad"><form id="studio-scan-form"><label>APworld-Ordner<input name="folder" value="${esc(S.gameLibrary?.folder || '')}" required></label><div class="button-row section-gap"><button type="submit">Ordner neu einlesen</button><span class="tiny">Dateien mit .apworld, .yaml oder .yml</span></div></form><p class="help">Lege deine Dateien in diesen Ordner und lies ihn neu ein. Die APworld-Analyse benötigt Python 3.10 oder neuer. YAML-Vorlagen funktionieren direkt.</p>${this.scanReport ? `<pre role="status">${esc(this.scanReport)}</pre>` : ''}</section>`
      + `<label class="section-gap">Spiel suchen<input id="studio-search" type="search" placeholder="Stardew Valley, Kingdom Hearts …" autocomplete="off"></label><div id="studio-catalog-results" class="grid catalog-grid section-gap">${this.catalogCards()}</div>`;
  },
  importDrawer() {
    showDrawer(drawerHead('APworlds & YAML-Vorlagen', 'Mehrere Dateien auswählen oder deinen APworld-Ordner im Spielekatalog einlesen.') + `<form id="studio-import-form"><div class="drawer-body"><label class="section-gap">Dateien<input name="files" type="file" accept=".apworld,.yaml,.yml" multiple required></label><p class="help">APworlds liefern deklarierte Optionen für den Editor. YAMLs liefern eine bearbeitbare Vorlage. Spielaktionen werden weiterhin mit dem Itemkatalog des verbundenen AP-Raums abgeglichen.</p><div id="studio-import-progress" class="help" role="status"></div></div><div class="drawer-foot"><button type="button" class="ghost" data-action="close-drawer">Abbrechen</button><button class="primary" type="submit">Importieren</button></div></form>`);
  },
  async openGame(game) { this.entry = null; this.loadingGame = ''; this.gameError = ''; location.hash = 'spiel/' + encodeURIComponent(game); if (currentPage === 'spiel/' + encodeURIComponent(game)) render(true); },
  async loadGame(game) {
    if (this.loadingGame === game) return;
    this.loadingGame = game; this.gameError = '';
    try { this.entry = await api('game-settings?game=' + encodeURIComponent(game)); }
    catch (e) { this.entry = null; this.gameError = e.message; }
    if (currentPage === 'spiel/' + encodeURIComponent(game)) render(true);
  },
  field(option, i, values) {
    const value = Object.hasOwn(values, option.key) ? values[option.key] : option.default, name = 'option-' + i;
    let control = '';
    if (option.kind === 'toggle') control = `<select name="${name}">${options({ true: 'Ja', false: 'Nein' }, String(value === true || value === 'true' || value === 1))}</select>`;
    else if (option.kind === 'choice') control = `<select name="${name}">${options(Object.fromEntries([...option.choices.map(c => [c.value, c.label]), ['random', 'Zufällig']]), String(value ?? option.default ?? '__omit__'))}</select>`;
    else if (['dict', 'set', 'list', 'json'].includes(option.kind)) control = `<textarea name="${name}" rows="4" spellcheck="false">${esc(JSON.stringify(value ?? (option.kind === 'dict' ? {} : []), null, 2))}</textarea>`;
    else if (option.kind === 'range') control = `<input name="${name}" value="${esc(value ?? '')}" list="range-${i}" placeholder="${option.min} bis ${option.max}"><datalist id="range-${i}">${['random', 'random-low', 'random-middle', 'random-high', ...(option.special || [])].map(v => `<option value="${esc(v)}"></option>`).join('')}</datalist><span class="tiny">${option.min}–${option.max} · auch random, random-low, random-high</span>`;
    else control = `<input name="${name}" ${option.kind === 'number' ? 'type="number" step="1"' : ''} value="${esc(value ?? '')}">`;
    if (value === undefined) control = `<label class="check-label"><input type="checkbox" name="enable-${i}"><span>Option ausdrücklich setzen</span></label>` + control;
    return `<label class="option-field ${['dict', 'set', 'list', 'json'].includes(option.kind) ? 'full' : ''}" data-option-search="${esc((option.label + ' ' + option.key).toLowerCase())}"><b>${esc(option.label)}</b><span class="tiny mono option-key">${esc(option.key)}</span>${control}${option.description ? `<span class="help option-description">${esc(option.description)}</span>` : ''}</label>`;
  },
  gamePage() {
    let game; try { game = decodeURIComponent(currentPage.slice('spiel/'.length)); } catch { game = ''; }
    const head = pageHead('SPIELEINSTELLUNGEN', game || 'Spiel', 'Einstellungen vor der Seed-Generierung. Deine gespeicherte Vorlage bleibt für den nächsten Run verfügbar.', '<a class="text-link" href="#katalog">Zum Katalog</a>');
    if (this.entry?.game !== game) {
      if (this.loadingGame !== game) void this.loadGame(game);
      return head + `<section class="panel panel-pad">${this.gameError ? `<p>${esc(this.gameError)}</p><button data-action="studio-import">Vorlage hinzufügen</button>` : '<p>Einstellungen werden geladen …</p>'}</section>`;
    }
    const entry = this.entry, preset = S.yamlPresets?.[game], values = { ...(entry.base[game] || {}), ...(preset?.values || {}) };
    const fields = entry.options.map((option, index) => ({ option, index }));
    const gameFields = fields.filter(f => !this.commonKeys.has(f.option.key)), commonFields = fields.filter(f => this.commonKeys.has(f.option.key));
    const playerNames = preset?.players || (S.playerProfiles || []).filter(p => !p.game || p.game === game).map(p => p.name);
    if (!playerNames.length) playerNames.push(S.config.ap.slotName || 'Player1');
    return head + `<form id="studio-yaml-form" data-game="${esc(game)}"><section class="panel panel-pad"><div class="section-title"><h2>Spieler & Vorlage</h2>${badge(entry.kind === 'apworld' ? 'APworld-Optionen' : 'YAML-Vorlage', 'good')}</div><p class="help">Quelle: ${esc(entry.source)}</p><div class="form-grid"><label>Slotnamen · ein Name pro Zeile<textarea name="playerNames" rows="3" required placeholder="Br3tzn&#10;Spieler2">${esc(playerNames.join('\n'))}</textarea><span class="tiny">1–16 Zeichen pro Name. Für jeden Namen wird eine eigene YAML exportiert.</span></label><div><h3>Deine Konfiguration</h3><p class="help">Speichern behält Einstellungen und Namen in diesem Raum. Die YAML-Dateien gehören anschließend in die Archipelago-Generierung.</p><div class="button-row section-gap"><button type="button" class="ghost" data-action="studio-use-players">Gespeicherte Spielernamen übernehmen</button></div></div></div>${entry.unresolved?.length ? `<details class="disclosure"><summary>${entry.unresolved.length} dynamische Angaben nicht automatisch aufgelöst</summary><p class="help">${entry.unresolved.map(esc).join(' · ')}</p><p class="help">Diese Angaben kannst du unten als Zusatzoptionen setzen oder über eine vom APworld erzeugte YAML-Vorlage importieren. Ohne eigenen Wert gelten die Defaults des APworlds.</p></details>` : ''}</section>
      <section class="panel panel-pad section-gap"><div class="section-title"><h2>Spieleinstellungen</h2><span class="tiny">${entry.options.length} Felder</span></div><input id="studio-option-search" type="search" placeholder="Einstellung suchen …" aria-label="Spieleinstellungen durchsuchen"><div class="form-grid option-grid">${gameFields.map(f => this.field(f.option, f.index, values)).join('')}</div>${commonFields.length ? `<details class="disclosure studio-common"><summary>Allgemeine Archipelago-Optionen · ${commonFields.length} Felder</summary><div class="form-grid option-grid">${commonFields.map(f => this.field(f.option, f.index, values)).join('')}</div></details>` : ''}<details class="disclosure"><summary>Erweiterte Zusatzoptionen als YAML</summary><p class="help">Zusätzliche oder dynamische Spieloptionen. Hier gesetzte Werte überschreiben gleichnamige Formularwerte.</p><textarea name="extra" rows="8" spellcheck="false" placeholder="option_name: value">${esc(preset?.extra || '')}</textarea></details><div class="button-row section-gap"><button type="button" data-action="studio-yaml-save">Einstellungen speichern</button><button type="button" class="ghost" data-action="studio-yaml-preview">YAML-Vorschau</button><button class="primary" type="submit">YAMLs herunterladen</button></div><p data-studio-message class="help" role="status"></p><pre id="studio-yaml-preview" class="hidden"></pre></section></form>`;
  },
  yamlData() {
    const form = $('#studio-yaml-form'), entry = this.entry, values = {};
    if (!form || !entry) throw new Error('Spielseite fehlt.');
    for (let i = 0; i < entry.options.length; i++) {
      const option = entry.options[i], enable = form.elements.namedItem('enable-' + i);
      if (enable && !enable.checked) continue;
      const raw = form.elements.namedItem('option-' + i).value;
      let value = raw;
      if (option.kind === 'toggle') value = raw === 'true';
      if (['number', 'range'].includes(option.kind) && /^-?\d+$/.test(raw)) value = Number(raw);
      if (['dict', 'set', 'list', 'json'].includes(option.kind)) { try { value = JSON.parse(raw); } catch { throw new Error(option.label + ': gültiges JSON eingeben.'); } }
      values[option.key] = value;
    }
    return { game: entry.game, values, players: form.elements.namedItem('playerNames').value.split(/\r?\n/).map(x => x.trim()).filter(Boolean), extra: form.elements.namedItem('extra').value };
  },
  playersPanel() {
    return `<section class="panel panel-pad section-gap"><div class="section-title"><h2>Gespeicherte Spieler & Slotnamen</h2><button data-action="studio-players">Spieler bearbeiten</button></div><p class="help">Diese Namen stehen bei der Verbindung und im YAML-Editor zur Auswahl. Tatsächliche Zielslots übernimmt die Bridge aus dem verbundenen AP-Raum.</p><div class="summary-pills">${(S.playerProfiles || []).map(p => badge(p.name + (p.game ? ' · ' + p.game : ''))).join('') || '<span class="tiny">Noch keine Spielerprofile gespeichert.</span>'}</div></section>`;
  },
  playersDrawer() {
    showDrawer(drawerHead('Spieler & Slotnamen', 'Eine Zeile pro Spieler: Slotname oder Slotname | Spiel. Namen müssen im erzeugten AP-Raum genauso heißen.') + `<form id="studio-players-form"><div class="drawer-body"><label class="section-gap">Spieler<textarea name="playersText" rows="9" spellcheck="false" placeholder="Br3tzn | Stardew Valley&#10;Spieler2 | Factorio">${esc((S.playerProfiles || []).map(p => p.name + (p.game ? ' | ' + p.game : '')).join('\n'))}</textarea></label><p class="help">Die Liste speichert deine Spielerprofile. Neue Slotnamen werden bei der nächsten Seed-Generierung über die YAMLs angelegt.</p></div><div class="drawer-foot"><button type="button" class="ghost" data-action="close-drawer">Abbrechen</button><button class="primary" type="submit">Spieler speichern</button></div></form>`);
  },
  sourcesPage(original) {
    const node = document.createElement('div'); node.innerHTML = original;
    const config = S.config.ap, saved = S.savedCredentials || {};
    let parsed; try { parsed = new URL(config.url.includes('://') ? config.url : 'ws://' + config.url); } catch { parsed = new URL('ws://archipelago.gg:38281'); }
    const mode = config.addressMode || (['127.0.0.1', 'localhost'].includes(parsed.hostname) ? 'local' : parsed.hostname === 'archipelago.gg' ? 'hosted' : 'custom');
    const apForm = node.querySelector('#ap-form');
    apForm.innerHTML = `<div class="statusbar">${badge(S.ap.connected ? 'AP verbunden' : 'AP getrennt', S.ap.connected ? 'good' : '')}${badge(S.ap.admin ? 'Admin angemeldet' : 'Admin nicht angemeldet', S.ap.admin ? 'good' : 'warn')}</div><div class="form-grid narrow"><label class="full">Server gehostet<select name="addressMode" id="ap-address-mode">${options({ local: 'Lokal · dieser PC', hosted: 'Extern · archipelago.gg', custom: 'Extern · eigener Host / IP' }, mode)}</select></label><label id="ap-host-label" class="full ${mode === 'custom' ? '' : 'hidden'}">Hostname / IP<input name="host" value="${esc(config.host || parsed.hostname)}" placeholder="ap.example.com"></label><label>Port<input name="port" type="number" min="1" max="65535" value="${config.port || parsed.port || 38281}" required></label><label class="check-label"><input name="secure" type="checkbox" ${config.secure || parsed.protocol === 'wss:' ? 'checked' : ''}><span>TLS / wss verwenden</span></label><label class="full">Existierender Slotname<input name="slotName" list="ap-slot-names" value="${esc(config.slotName)}" required autocomplete="off"><datalist id="ap-slot-names">${[...new Set([...(S.playerProfiles || []).map(p => p.name), ...S.players.map(p => p.name)])].map(name => `<option value="${esc(name)}"></option>`).join('')}</datalist></label><label>Raumpasswort<input type="password" name="roomPassword" autocomplete="off" value="${saved.roomPassword ? '••••••••' : ''}" placeholder="Falls gesetzt"></label><label>Server-Adminpasswort<input type="password" name="adminPassword" autocomplete="off" value="${saved.adminPassword ? '••••••••' : ''}" placeholder="Für zusätzliche Items nötig"></label><label class="full">Erwartete Seed-ID <span class="muted">(optional)</span><input name="expectedSeed" value="${esc(config.expectedSeed || '')}"></label></div><div class="button-row"><button type="submit" class="primary">Raum verbinden</button><button type="button" class="ghost" data-action="disconnect-ap">Trennen</button><button type="button" class="small ghost" data-action="studio-players">Slotnamen verwalten</button></div><p class="help">Lokal: 127.0.0.1 + Port. Bei archipelago.gg genügt der Raumport. Für andere externe Server wird zusätzlich deren Hostname benötigt. Gespeicherte Passwörter bleiben maskiert im Feld.</p><button type="button" class="small ghost section-gap" data-action="studio-forget-ap">Gespeicherte Passwörter vergessen</button>`;
    if (apForm.nextElementSibling) apForm.nextElementSibling.textContent = 'Verbindungen und Zugangsdaten werden für diesen Raum lokal gespeichert und beim nächsten Start wiederhergestellt. Admin-Status und Serververbindung werden getrennt angezeigt.';
    const twitchForm = node.querySelector('#twitch-form');
    const secretLabel = document.createElement('label'); secretLabel.className = 'section-gap'; secretLabel.innerHTML = `Client Secret <span class="muted">(optional, für automatische Token-Erneuerung)</span><input type="password" name="clientSecret" autocomplete="off" value="${saved.twitchSecret ? '••••••••' : ''}" placeholder="Aus deiner Twitch-App">`;
    twitchForm.querySelector('.form-grid').append(secretLabel);
    const help = twitchForm.nextElementSibling;
    if (help) help.innerHTML = `Twitch-App vom Typ „Confidential“. Redirect-URL exakt: <code>http://localhost:${location.port}/oauth/callback</code>. Zugangsdaten werden lokal gespeichert. Mit Client Secret kann die Anmeldung automatisch erneuert werden; ohne Secret bleibt sie bis zum Tokenablauf erhalten.`;
    const guide = document.createElement('details'); guide.className = 'disclosure section-gap'; guide.innerHTML = `<summary>Twitch Schritt für Schritt verbinden</summary><ol class="setup-steps"><li><a href="https://dev.twitch.tv/console/apps" target="_blank" rel="noreferrer">Twitch Developer Console</a> öffnen und eine Anwendung registrieren.</li><li>OAuth Redirect URL: <code>http://localhost:${location.port}/oauth/callback</code>. Typ: <b>Confidential</b>.</li><li>Client-ID hier eintragen. Für dauerhafte Anmeldung zusätzlich ein Client Secret erstellen und eintragen.</li><li>Gewünschte Ereignisse auswählen, „Mit Twitch anmelden“ klicken und dich mit dem sendenden Twitch-Kanal anmelden.</li><li>Nach der Rückleitung zeigt die Bridge „Verbunden“ und gegebenenfalls fehlende Berechtigungen.</li></ol><p class="help">Twitch-Login öffnet ein eigenes Fenster. Die Callback-Seite darf nach erfolgreicher Anmeldung geschlossen werden.</p></details><button type="button" class="small ghost section-gap" data-action="studio-forget-twitch">Gespeicherte Twitch-Anmeldung vergessen</button>`;
    twitchForm.parentElement.append(guide);
    return node.innerHTML;
  },
  extendRule(rule) {
    const form = $('#rule-form');
    const target = form.elements.namedItem('target'); target.add(new Option('Mehrere ausgewählte Slots', 'selected'));
    if (rule.target === 'selected') target.value = 'selected';
    const panel = document.createElement('div'); panel.className = 'full'; panel.id = 'rule-selected-targets';
    panel.innerHTML = `<b class="tiny">Zielslots auswählen</b>${S.players.filter(p => p.team === S.ap.team && p.type === 1).map(p => `<label class="check-label"><input name="targetKeys" type="checkbox" value="${p.team}:${p.slot}" ${rule.targetKeys?.includes(`${p.team}:${p.slot}`) ? 'checked' : ''}><span>${esc(p.name)} · ${esc(p.game)}</span></label>`).join('') || '<p class="help">Zuerst deinen AP-Raum verbinden.</p>'}`;
    form.querySelector('.form-grid').append(panel);
    const note = document.createElement('div'); note.className = 'random-help'; note.innerHTML = `<p class="help">„Zufälliges Item“ wählt aus allen für den Slot erlaubten Items: hilfreiche Items und Fallen. „Zufallsaktion“ kann zusätzlich DeathLink enthalten.</p><label class="check-label"><input name="includeDeathLink" type="checkbox" ${rule.includeDeathLink ? 'checked' : ''}><span>DeathLink in Zufallsaktionen einschließen · Gruppenfreigabe zusätzlich erforderlich</span></label>`;
    form.querySelector('.drawer-body').append(note); this.ruleVisibility();
  },
  ruleVisibility() {
    $('#rule-selected-targets')?.classList.toggle('hidden', $('#rule-target')?.value !== 'selected');
    $('.random-help')?.classList.toggle('hidden', !['random_item', 'random_action'].includes($('#rule-effect')?.value));
    $('.random-help .check-label')?.classList.toggle('hidden', $('#rule-effect')?.value !== 'random_action');
  },
  eventsPage(renderEvents) {
    const original = S;
    const games = [...new Set([...S.players.map(p => p.game), ...S.queue.map(j => j.game)])].filter(Boolean).sort();
    if (this.logGame) S = { ...S, queue: S.queue.filter(j => j.game === this.logGame || j.effect === 'deathlink'), events: S.events.filter(e => e.games?.includes(this.logGame) || e.matchedRules?.some(name => original.rules.some(r => r.name === name && r.game === this.logGame))) };
    let html; try { html = renderEvents(); } finally { S = original; }
    return `<label class="log-game-filter">Spiel im geöffneten Raum<select id="studio-log-game"><option value="">Alle Spiele</option>${options(Object.fromEntries(games.map(g => [g, g])), this.logGame)}</select></label>` + html;
  },
  async click(action, id, button) {
    if (action === 'studio-room-new' || action === 'studio-room-edit') return this.roomDrawer(id);
    if (action === 'studio-players') return this.playersDrawer();
    if (action === 'studio-import') return this.importDrawer();
    if (action === 'studio-game') return this.openGame(id);
    if (action === 'studio-use-players') { const form = $('#studio-yaml-form'); form.elements.namedItem('playerNames').value = (S.playerProfiles || []).filter(p => !p.game || p.game === this.entry.game).map(p => p.name).join('\n'); return; }
    if (action === 'studio-all-items') { approvalEditor.catalog.items.forEach(i => approvalEditor.items.add(i)); return renderItemList(); }
    button.disabled = true;
    try {
      if (action === 'studio-room-open') { await api('rooms/activate', { id }); this.logGame = ''; this.entry = null; this.loadingGame = ''; await refresh(true); }
      else if (action === 'studio-forget-ap' || action === 'studio-forget-twitch') { await api('credentials/forget', { source: action.endsWith('-ap') ? 'ap' : 'twitch' }); await refresh(true); }
      else if (action === 'studio-yaml-save') { await api('yaml/preset', this.yamlData()); await refresh(); $('[data-studio-message]').textContent = 'Einstellungen in diesem Raum gespeichert.'; }
      else if (action === 'studio-yaml-preview') { const result = await api('yaml/generate', this.yamlData()); const pre = $('#studio-yaml-preview'); pre.textContent = result.files.map(f => '# Datei: ' + f.name + '\n' + f.content).join('\n'); pre.classList.remove('hidden'); }
    } finally { button.disabled = false; }
  },
  async submit(form) {
    const id = form.getAttribute('id'), data = new FormData(form);
    if (id === 'studio-room-form') {
      const roomId = data.get('roomId');
      if (roomId) await api('rooms/rename', { id: roomId, name: data.get('name'), game: data.get('game') });
      else { const result = await api('rooms/create', { name: data.get('name'), game: data.get('game') }); await api('rooms/activate', { id: result.room.id }); }
      $('#drawer').close(); this.entry = null; this.loadingGame = ''; await refresh(true);
    } else if (id === 'studio-players-form') {
      const players = data.get('playersText').split(/\r?\n/).map(x => x.trim()).filter(Boolean).map(row => { const [name, ...game] = row.split('|'); return { name: name.trim(), game: game.join('|').trim() }; });
      await api('players', { players }); $('#drawer').close(); await refresh(true);
    } else if (id === 'studio-scan-form') {
      const report = await api('worlds/scan', { folder: data.get('folder') });
      this.scanReport = `${report.imported.length} Dateien eingelesen · ${report.unchanged} unverändert` + report.errors.map(e => '\n' + e.file + ': ' + e.error).join(''); this.entry = null; this.loadingGame = ''; await refresh(true);
    } else if (id === 'studio-import-form') {
      const files = form.elements.namedItem('files').files;
      if (!files.length) throw new Error('Mindestens eine Datei auswählen.');
      const errors = [], games = [];
      for (const file of files) {
        if (file.size > 40 * 1024 * 1024) { errors.push(file.name + ': Datei ist zu groß.'); continue; }
        $('#studio-import-progress').textContent = file.name + ' wird eingelesen …';
        try {
          const bytes = new Uint8Array(await file.arrayBuffer()); let binary = '';
          for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
          const result = await api('worlds/upload', { name: file.name, content: btoa(binary) }); games.push(...result.games);
        } catch (e) { errors.push(file.name + ': ' + e.message); }
      }
      this.entry = null; this.loadingGame = ''; await refresh(true);
      if (errors.length) { $('#studio-import-progress').textContent = games.length + ' Spiele eingelesen.'; throw new Error(errors.join('\n')); }
      $('#drawer').close(); toast(games.length + ' Spiele eingelesen.');
    } else if (id === 'studio-yaml-form') {
      const value = this.yamlData(); await api('yaml/preset', value);
      if (value.players.length === 1) { const result = await api('yaml/generate', value); this.download(new Blob([result.files[0].content], { type: 'application/yaml' }), result.files[0].name); }
      else {
        const response = await fetch('/api/yaml/bundle', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-Session': S.session }, body: JSON.stringify(value) });
        if (!response.ok) throw new Error((await response.json()).error);
        this.download(await response.blob(), 'Archipelago-Spieler-YAMLs.zip');
      }
      await refresh(); $('[data-studio-message]').textContent = value.players.length + ' Spieler-YAMLs erstellt und Einstellungen gespeichert.';
    }
  },
  download(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); },
};
