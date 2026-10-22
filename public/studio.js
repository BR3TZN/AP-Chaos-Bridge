'use strict';
const Studio = {
  roomFilter: 'active', catalogLimit: 24, catalogQuery: '', entry: null, loadingGame: '', gameError: '', logGame: '', scanReport: null, indexLoading: false,
  commonKeys: new Set(['progression_balancing', 'accessibility', 'local_items', 'non_local_items', 'start_inventory', 'start_hints', 'start_location_hints', 'exclude_locations', 'priority_locations', 'item_links', 'plando_items']),
  shell() {
    const workspaceName = document.querySelector('#workspace-name'); if (workspaceName) workspaceName.textContent = S.rooms?.rooms.find(r => r.id === S.rooms.active)?.name || 'Dein Run';
    const select = document.querySelector('#room-select');
    if (select && S.rooms) {
      const html = options(Object.fromEntries(S.rooms.rooms.filter(r => !r.archived).map(r => [r.id, r.name])), S.rooms.active);
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
    const rooms = S.rooms.rooms.filter(r => this.roomFilter === 'all' || (this.roomFilter === 'archived' ? r.archived : !r.archived));
    return pageHead('RUNS & SPIELE', 'Deine Räume.', 'Jeder Raum behält seine Verbindungen, Regeln, Spielerprofile und Protokolle.', '<button class="primary" data-action="studio-room-new">+ Raum anlegen</button>')
      + `<div class="button-row section-gap">${Object.entries({ active: 'Aktive Räume', archived: 'Archiviert', all: 'Alle' }).map(([id, label]) => `<button data-action="studio-room-filter" data-id="${id}" ${this.roomFilter === id ? 'disabled' : ''}>${label}</button>`).join('')}</div><div class="grid rules-grid section-gap">${rooms.map(r => `<article class="panel panel-pad"><div class="section-title"><h2>${esc(r.name)}</h2>${badge(r.archived ? 'Archiviert' : r.id === S.rooms.active ? 'Geöffnet' : 'Gespeichert', r.id === S.rooms.active ? 'good' : '')}</div><p>${esc(r.game || 'Multiworld · mehrere Spiele')}</p><div class="button-row">${r.archived ? `<button data-action="studio-room-restore" data-id="${r.id}">Wiederherstellen</button>` : `<button data-action="studio-room-open" data-id="${r.id}" ${r.id === S.rooms.active ? 'disabled' : ''}>Raum öffnen</button><button data-action="studio-room-archive" data-id="${r.id}">Archivieren</button>`}<button class="ghost" data-action="studio-room-edit" data-id="${r.id}">Bearbeiten</button><button class="ghost" data-action="studio-room-delete" data-id="${r.id}">Löschen</button></div></article>`).join('') || empty('Keine Räume in dieser Ansicht', 'Du kannst einen Raum anlegen oder den Filter wechseln.')}</div><p class="help">Archivierte Räume behalten alle lokalen Daten und Verbindungen. Beim Archivieren des geöffneten Raums wird ein anderer Raum geöffnet; die Ausführung beginnt pausiert im Testmodus.</p>`;
  },
  deleteRoomDrawer(id) {
    const room = S.rooms.rooms.find(r => r.id === id); if (!room) throw new Error('Raum fehlt.');
    showDrawer(drawerHead('Raum endgültig löschen', room.name) + `<form id="studio-room-delete-form"><div class="drawer-body"><input type="hidden" name="roomId" value="${esc(id)}"><p class="help">Löscht die lokalen Regeln, Protokolle, Spielerprofile, YAML-Voreinstellungen und gespeicherten Zugangsdaten dieses Raums. Der gemeinsame Spielekatalog bleibt erhalten.</p><label>Zur Bestätigung den Raumnamen exakt eingeben: <b>${esc(room.name)}</b><input name="confirmName" required autocomplete="off"></label></div><div class="drawer-foot"><button type="button" class="ghost" data-action="close-drawer">Abbrechen</button><button class="primary" type="submit">Endgültig löschen</button></div></form>`);
  },
  roomDrawer(id) {
    const room = S.rooms.rooms.find(r => r.id === id);
    showDrawer(drawerHead(room ? 'Raum bearbeiten' : 'Raum anlegen', 'Ein eigener Arbeitsbereich für deinen Run.') + `<form id="studio-room-form"><div class="drawer-body"><input type="hidden" name="roomId" value="${esc(id || '')}"><label class="section-gap">Raumname<input name="name" required maxlength="100" value="${esc(room?.name || '')}" placeholder="Stardew · Charity Royale"></label><label class="section-gap">Spiel <span class="muted">(optional, leer für Multiworld)</span><input name="game" list="studio-games" value="${esc(room?.game || '')}"><datalist id="studio-games">${this.knownGames().map(g => `<option value="${esc(g)}"></option>`).join('')}</datalist></label></div><div class="drawer-foot"><button class="ghost" type="button" data-action="close-drawer">Abbrechen</button><button class="primary" type="submit">Speichern</button></div></form>`);
  },
  catalogCards(query = this.catalogQuery) {
    if (query !== this.catalogQuery) { this.catalogQuery = query; this.catalogLimit = 24; }
    const normalize = name => name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const imported = new Map((S.gameLibrary?.games || []).filter(g => ['apworld', 'core'].includes(g.kind)).map(g => [normalize(g.game), g]));
    const list = imported;
    const sorted = [...list.values()].filter(g => [g.game, ...(g.aliases || [])].some(name => normalize(name).includes(normalize(query)))).sort((a, b) => Number(imported.has(normalize(b.game))) - Number(imported.has(normalize(a.game))) || a.game.localeCompare(b.game));
    const cards = sorted.slice(0, this.catalogLimit).map(g => { const entry = imported.get(normalize(g.game)); return `<article class="panel catalog-card"><div class="section-title"><h3>${esc(g.game)}</h3>${badge(entry?.kind === 'core' ? 'Core ' + entry.coreVersion : 'APworld', 'good')}</div><p>${entry ? `${entry.optionCount} Einstellungen · ${esc(entry.kind === 'core' ? 'In Archipelago enthalten' : entry.source)}` : 'Die .apworld-Datei hinzufügen, um Einstellungen zu bearbeiten.'}</p><button class="small section-gap" data-action="studio-game" data-id="${esc(entry?.game || g.game)}">${entry ? 'Einstellungen & YAML' : 'Spiel öffnen'}</button></article>`; }).join('');
    return cards + (sorted.length > this.catalogLimit ? `<button data-action="studio-catalog-more">Weitere Spiele anzeigen · ${sorted.length - this.catalogLimit} verbleibend</button>` : '') || empty('Kein Spiel gefunden', 'Eine eigene APworld fügt das Spiel hinzu.');
  },
  catalogPage() {
    void this.loadIndex();
    return pageHead('SPIELEKATALOG', 'Deine Spiele. Deine Settings.', 'Suche ein Spiel, hinterlege seine Einstellungen und exportiere eine YAML für jeden Spieler.', '<button class="primary" data-action="studio-import">+ APworld hinzufügen</button>')
      + `<section class="panel panel-pad"><form id="studio-scan-form"><label>APworld-Ordner<input name="folder" value="${esc(S.gameLibrary?.folder || '')}" required></label><div class="button-row section-gap"><button type="submit">Ordner neu einlesen</button><span class="tiny">Nur .apworld · Unterordner werden mit eingelesen</span></div></form><p class="help">Vorbereitete APworld-Versionen werden am Dateiinhalt erkannt und funktionieren auch in deinem eigenen Ordner oder nach Umbenennen ohne Python. Für bisher unbekannte Versionen ist Python 3.10 oder neuer nötig.</p>${S.gameLibrary?.coreVersion ? `<p class="help">Core-Spiele sind direkt vorbereitet für Archipelago ${esc(S.gameLibrary.coreVersion)}. Sie bleiben auch bei einem eigenen APworld-Ordner verfügbar. Eine eigene APworld desselben Spiels hat Vorrang.</p>` : ''}<p class="help">${S.gameLibrary?.games.length || 0} Spiele verfügbar · <a href="/apworlds-manual" download>Liste der manuellen Downloads</a></p>${this.scanReport ? this.scanReportHTML() : ''}</section>`
      + `<label class="section-gap">Spiel suchen<input id="studio-search" type="search" value="${esc(this.catalogQuery)}" placeholder="Stardew Valley, Kingdom Hearts …" autocomplete="off"></label><div id="studio-catalog-results" class="grid catalog-grid section-gap">${this.catalogCards()}</div>`;
  },
  scanReportHTML() {
    const report = this.scanReport;
    return `<div class="scan-report"><div class="scan-summary" role="status">${badge('Einlesen abgeschlossen', 'good')}<span>${S.gameLibrary.games.length} Spiele bereit · ${report.imported.length} neu eingelesen · ${report.unchanged} Dateien unverändert</span></div>${report.skipped?.length ? `<details class="disclosure"><summary>${report.skipped.length} Pakete ohne Spieleinstellungen übersprungen · übriger Katalog ist nutzbar</summary><p class="help">Diese Pakete liefern keine eigenen Spieleinstellungen. Hilfsbibliotheken wie APAPI sind kein zusätzliches Spiel. Details zur jeweiligen Datei stehen unten.</p><ul>${report.skipped.map(e => `<li><code>${esc(e.file)}</code><br>${esc(e.reason)}</li>`).join('')}</ul></details>` : ''}${report.errors.length ? `<details class="disclosure" open><summary>${report.errors.length} Dateien prüfen</summary><ul>${report.errors.map(e => `<li><code>${esc(e.file)}</code><br>${esc(e.error)}</li>`).join('')}</ul></details>` : ''}</div>`;
  },
  importDrawer() {
    showDrawer(drawerHead('APworlds hinzufügen', 'Aus einem Release-ZIP zuerst die enthaltenen .apworld-Dateien entpacken. Danach hier auswählen oder den Ordner einlesen.') + `<form id="studio-import-form"><div class="drawer-body"><label class="section-gap">Dateien<input name="files" type="file" accept=".apworld" multiple required></label><p class="help">Maximal ${S.gameLibrary?.importLimits?.maxArchiveBytes / 1024 ** 2 || 128} MiB pro Datei. APworlds liefern deklarierte Optionen für den Editor. Spielaktionen werden weiterhin mit dem Itemkatalog des verbundenen AP-Raums abgeglichen.</p><div id="studio-import-progress" class="help" role="status"></div></div><div class="drawer-foot"><button type="button" class="ghost" data-action="close-drawer">Abbrechen</button><button class="primary" type="submit">Importieren</button></div></form>`);
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
    else if (['choice', 'textchoice', 'range'].includes(option.kind)) {
      const choices = option.kind === 'range' ? [
        ...(option.max - option.min <= 200 ? Array.from({ length: option.max - option.min + 1 }, (_, j) => ({ value: option.min + j, label: String(option.min + j) })) : []),
        ...['random', 'random-low', 'random-middle', 'random-high', ...(option.special || [])].map(v => ({ value: v, label: v })),
        ...(option.specialValues || []).map(v => ({ value: v, label: String(v) })),
      ] : [...(option.choices || []), { value: 'random', label: 'Zufällig' }];
      if (option.kind === 'range' && typeof value === 'string' && value.startsWith('random-range')) choices.push({ value, label: value });
      const custom = option.kind !== 'choice', present = choices.some(c => String(c.value) === String(value));
      if (custom) choices.push({ value: '__custom__', label: option.kind === 'range' ? 'Eigener Wert / Zufallsbereich …' : 'Eigener Text …' });
      control = `<select name="${name}" ${custom ? `data-option-custom="${i}"` : ''}>${options(Object.fromEntries(choices.map(c => [c.value, c.label])), present ? String(value) : custom ? '__custom__' : String(choices[0]?.value))}</select>`;
      if (custom) control += `<input name="custom-${i}" data-custom-input="${i}" class="${present ? 'hidden' : ''}" ${present ? 'disabled' : ''} value="${esc(value ?? '')}" placeholder="${option.kind === 'range' ? option.min + ' bis ' + option.max + ' oder random-range-1-5' : 'Eigener Text'}">`;
      if (option.kind === 'range') control += `<span class="tiny">${option.min}–${option.max} · Zufallswerte oder eigener Wert möglich</span>`;
    } else if (option.kind === 'set' && option.validKeys?.length && option.validKeys.length <= 500) {
      control = `<select multiple name="${name}" size="6">${option.validKeys.map(k => `<option value="${esc(k)}" ${Array.isArray(value) && value.includes(k) ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select><span class="tiny">Mehrfachauswahl mit Strg / Cmd</span>`;
    } else if (['dict', 'set', 'list', 'json'].includes(option.kind)) control = `<textarea name="${name}" rows="4" spellcheck="false">${esc(JSON.stringify(value ?? (option.kind === 'dict' ? {} : option.kind === 'json' ? null : []), null, 2))}</textarea>`;
    else control = `<input name="${name}" ${option.kind === 'number' ? 'type="number" step="1"' : ''} value="${esc(value ?? '')}">`;
    if (value === undefined) control = `<label class="check-label"><input type="checkbox" name="enable-${i}" data-option-enable="${i}"><span>Option ausdrücklich setzen</span></label><fieldset class="option-control" data-option-fieldset="${i}" disabled>${control}</fieldset>`;
    return `<div class="option-field ${['dict', 'set', 'list', 'json'].includes(option.kind) ? 'full' : ''}" data-option-search="${esc((option.label + ' ' + option.key).toLowerCase())}"><label for="studio-option-${i}"><b>${esc(option.label)}</b></label><span class="tiny mono option-key">${esc(option.key)}</span>${control.replace('name="' + name + '"', 'id="studio-option-' + i + '" name="' + name + '"')}${option.description ? `<span class="help option-description">${esc(option.description)}</span>` : ''}</div>`;
  },
  gamePage() {
    let game; try { game = decodeURIComponent(currentPage.slice('spiel/'.length)); } catch { game = ''; }
    const head = pageHead('SPIELEINSTELLUNGEN', game || 'Spiel', 'Einstellungen vor der Seed-Generierung. Deine gespeicherte Vorlage bleibt für den nächsten Run verfügbar.', '<a class="text-link" href="#katalog">Zum Katalog</a>');
    if (this.entry?.game !== game) {
      if (this.loadingGame !== game) void this.loadGame(game);
      return head + `<section class="panel panel-pad">${this.gameError ? `<p>${esc(this.gameError)}</p><button data-action="studio-import">APworld hinzufügen</button>` : '<p>Einstellungen werden geladen …</p>'}</section>`;
    }
    const entry = this.entry, preset = S.yamlPresets?.[game], values = { ...(entry.base[game] || {}), ...(preset?.values || {}) };
    const fields = entry.options.map((option, index) => ({ option, index }));
    const gameFields = fields.filter(f => !this.commonKeys.has(f.option.key)), commonFields = fields.filter(f => this.commonKeys.has(f.option.key));
    const playerNames = preset?.players || (S.playerProfiles || []).filter(p => !p.game || p.game === game).map(p => p.name);
    if (!playerNames.length) playerNames.push(S.config.ap.slotName || 'Player1');
    return head + `<form id="studio-yaml-form" data-game="${esc(game)}"><section class="panel panel-pad"><div class="section-title"><h2>Spieler & Vorlage</h2>${badge(entry.kind === 'core' ? 'Core ' + entry.coreVersion : 'APworld-Optionen', 'good')}</div><p class="help">Quelle: ${esc(entry.source)}${entry.worldVersion ? ` · World-Version ${esc(entry.worldVersion)}` : ''}${entry.minimumAPVersion ? ` · Archipelago ab ${esc(entry.minimumAPVersion)}` : ''}</p>${entry.kind === 'core' ? `<p class="help">Für Archipelago ${esc(entry.coreVersion)} vorbereitet. Diese World ist dort bereits enthalten; keine zusätzliche APworld installieren. Die YAML enthält die erforderliche Archipelago-Version. <a href="${esc(entry.sourceURL)}" target="_blank" rel="noreferrer">Offizielle World-Quelle</a></p>` : ''}<div class="form-grid"><label>Slotnamen · ein Name pro Zeile<textarea name="playerNames" rows="3" required placeholder="Br3tzn&#10;Spieler2">${esc(playerNames.join('\n'))}</textarea><span class="tiny">1–16 Zeichen pro Name. Für jeden Namen wird eine eigene YAML exportiert.</span></label><div><h3>Deine Konfiguration</h3><p class="help">Speichern behält Einstellungen und Namen in diesem Raum. Die YAML-Dateien gehören anschließend in die Archipelago-Generierung.</p><div class="button-row section-gap"><button type="button" class="ghost" data-action="studio-use-players">Gespeicherte Spielernamen übernehmen</button></div></div></div>${entry.unresolved?.length ? `<details class="disclosure"><summary>${entry.unresolved.length} dynamische Angaben nicht automatisch aufgelöst</summary><p class="help">${entry.unresolved.map(esc).join(' · ')}</p><p class="help">Diese Angaben kannst du unten als Zusatzoptionen setzen oder die Standards der APworld übernehmen. Ohne eigenen Wert gelten die Defaults des APworlds.</p></details>` : ''}</section>
      <section class="panel panel-pad section-gap">${entry.yamlNotice ? `<p class="help" role="note">${esc(entry.yamlNotice)} <a href="${esc(entry.setupURL)}" target="_blank" rel="noreferrer">Anleitung des Entwicklers</a></p>` : ''}<div class="section-title"><h2>Spieleinstellungen</h2><span class="tiny">${entry.options.length} Felder</span></div><input id="studio-option-search" type="search" placeholder="Einstellung suchen …" aria-label="Spieleinstellungen durchsuchen"><div class="form-grid option-grid">${gameFields.map(f => this.field(f.option, f.index, values)).join('')}</div>${commonFields.length ? `<details class="disclosure studio-common"><summary>Allgemeine Archipelago-Optionen · ${commonFields.length} Felder</summary><div class="form-grid option-grid">${commonFields.map(f => this.field(f.option, f.index, values)).join('')}</div></details>` : ''}<details class="disclosure"><summary>Erweiterte Zusatzoptionen als YAML</summary><p class="help">Zusätzliche oder dynamische Spieloptionen. Hier gesetzte Werte überschreiben gleichnamige Formularwerte.</p><textarea name="extra" rows="8" spellcheck="false" placeholder="option_name: value">${esc(preset?.extra || '')}</textarea></details><div class="button-row section-gap"><button type="button" data-action="studio-yaml-save">Einstellungen speichern</button><button type="button" class="ghost" data-action="studio-yaml-preview">YAML-Vorschau</button><button class="primary" type="submit">YAMLs herunterladen</button></div><p data-studio-message class="help" role="status"></p><pre id="studio-yaml-preview" class="hidden"></pre></section></form>`;
  },
  yamlData() {
    const form = $('#studio-yaml-form'), entry = this.entry, values = {};
    if (!form || !entry) throw new Error('Spielseite fehlt.');
    for (let i = 0; i < entry.options.length; i++) {
      const option = entry.options[i], enable = form.elements.namedItem('enable-' + i);
      if (enable && !enable.checked) continue;
      const element = form.elements.namedItem('option-' + i);
      const raw = element.value === '__custom__' ? form.elements.namedItem('custom-' + i).value : element.value;
      let value = raw;
      if (option.kind === 'toggle') value = raw === 'true';
      if (['number', 'range'].includes(option.kind) && /^-?\d+$/.test(raw)) value = Number(raw);
      if (element.multiple) value = [...element.selectedOptions].map(o => o.value);
      else if (['dict', 'set', 'list', 'json'].includes(option.kind)) { try { value = JSON.parse(raw); } catch { throw new Error(option.label + ': gültiges JSON eingeben.'); } }
      values[option.key] = value;
    }
    return { game: entry.game, values, players: form.elements.namedItem('playerNames').value.split(/\r?\n/).map(x => x.trim()).filter(Boolean), extra: form.elements.namedItem('extra').value };
  },
  teamPlayers() { return S.players.filter(p => p.team === S.ap.team && p.type === 1); },
  playerStatus(player) {
    const match = this.teamPlayers().find(p => p.name === player.name && (!player.game || p.game === player.game));
    return match ? `AP-Slot ${match.slot} · ${match.approval.enabled ? 'für Aktionen freigegeben' : 'Items unter Spieler & Effekte auswählen'}` : player.name ? 'Wird beim Verbinden mit einem passenden AP-Slot verknüpft.' : 'Slotnamen aus eurem AP-Raum eintragen.';
  },
  playerRow(player, index, prefix) {
    return `<fieldset class="player-row" data-player-row><legend>Spieler ${index + 1}</legend><input type="hidden" name="playerId" value="${esc(player.id || '')}"><div class="form-grid"><label>Slotname<input name="playerName" value="${esc(player.name || '')}" list="${prefix}-names" maxlength="16" required autocomplete="off" placeholder="Exakter Name im AP-Raum"></label><label>Spiel <span class="muted">(optional)</span><input name="playerGame" value="${esc(player.game || '')}" list="${prefix}-games" placeholder="Spiel auswählen"></label></div><div class="button-row"><span class="help" data-player-status>${esc(this.playerStatus(player))}</span><button type="button" class="small ghost" data-action="studio-player-remove">Spieler entfernen</button></div></fieldset>`;
  },
  playerFields(prefix) {
    return `<datalist id="${prefix}-names">${this.teamPlayers().map(p => `<option value="${esc(p.name)}">${esc(p.game)}</option>`).join('')}</datalist><datalist id="${prefix}-games">${this.knownGames().map(g => `<option value="${esc(g)}"></option>`).join('')}</datalist><p data-empty-players class="help ${(S.playerProfiles || []).length ? 'hidden' : ''}">Noch keine Spieler gespeichert. Mit „+ Spieler“ fügt ihr den nächsten Teilnehmer hinzu.</p><div data-player-rows>${(S.playerProfiles || []).map((p, i) => this.playerRow(p, i, prefix)).join('')}</div><button type="button" class="section-gap" data-action="studio-player-add">+ Spieler</button>`;
  },
  playersPanel() {
    return `<details class="panel saved-player-list section-gap"><summary>Optional: Namen für YAMLs und Spielerauswahl merken</summary><p class="help">Verbundene Spieler erscheinen bereits oben. Diese Namensliste ist eine Hilfe vor der Generierung und für wiederkehrende Mitspieler.</p><button class="small" data-action="studio-players">Spielerliste öffnen</button><form id="studio-player-list-form" data-player-prefix="studio-player-list">${this.playerFields('studio-player-list')}<div class="button-row section-gap"><button class="primary" type="submit">Spieler speichern</button></div><p class="help">Die Liste bleibt in diesem Raum gespeichert und steht auch für die Verbindung und den YAML-Export bereit. Items und Fallen werden oben beim jeweiligen Spieler ausgewählt.</p></form></details>`;
  },
  playersDrawer(add = false) {
    showDrawer(drawerHead('Eure Spieler & Slots', 'Mit + Spieler für jeden Teilnehmer eine eigene Zeile hinzufügen.') + `<form id="studio-players-form" data-player-prefix="studio-player-drawer"><div class="drawer-body">${this.playerFields('studio-player-drawer')}<p class="help">Die Slotnamen müssen mit eurem AP-Raum übereinstimmen. Über die Regeln lassen sich einzelne, mehrere, alle oder zufällige Spieler auswählen.</p></div><div class="drawer-foot"><button type="button" class="ghost" data-action="close-drawer">Abbrechen</button><button class="primary" type="submit">Spieler speichern</button></div></form>`);
    if (add) this.addPlayerRow($('#studio-players-form'));
  },
  syncPlayerRows(form) {
    const rows = [...form.querySelectorAll('[data-player-row]')];
    rows.forEach((row, i) => { row.querySelector('legend').textContent = 'Spieler ' + (i + 1); });
    form.querySelector('[data-empty-players]').classList.toggle('hidden', rows.length > 0);
  },
  addPlayerRow(form) {
    const rows = [...form.querySelectorAll('[data-player-row]')]; if (rows.length >= 100) throw new Error('Höchstens 100 Spieler.');
    const used = new Set(rows.map(row => row.querySelector('[name="playerName"]').value.trim().toLowerCase()));
    const next = this.teamPlayers().find(p => !used.has(p.name.toLowerCase())) || {};
    form.querySelector('[data-player-rows]').insertAdjacentHTML('beforeend', this.playerRow({ name: next.name || '', game: next.game || '' }, rows.length, form.dataset.playerPrefix));
    this.syncPlayerRows(form); form.querySelector('[data-player-row]:last-child [name="playerName"]').focus();
  },
  updatePlayerRow(input) {
    const row = input.closest('[data-player-row]'); if (!row) return;
    const name = row.querySelector('[name="playerName"]'), game = row.querySelector('[name="playerGame"]');
    const match = this.teamPlayers().find(p => p.name === name.value.trim());
    if (input === name && match && !game.value.trim()) game.value = match.game;
    row.querySelector('[data-player-status]').textContent = this.playerStatus({ name: name.value.trim(), game: game.value.trim() });
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
    const form = $('#rule-form'), target = form.elements.namedItem('target');
    target.add(new Option('Mehrere ausgewählte Spieler', 'selected')); target.add(new Option('Eine zufällige Person aus der Auswahl', 'random_selected'));
    if (['selected', 'random_selected'].includes(rule.target)) target.value = rule.target;
    const panel = document.createElement('div'); panel.className = 'full'; panel.id = 'rule-selected-targets';
    panel.innerHTML = `<b class="tiny">Spieler auswählen</b><button type="button" class="small ghost" data-action="studio-rule-players">Gespeicherte Spieler auswählen</button>${S.players.filter(p => p.team === S.ap.team && p.type === 1).map(p => `<label class="check-label"><input name="targetKeys" type="checkbox" value="${p.team}:${p.slot}" ${rule.targetKeys?.includes(`${p.team}:${p.slot}`) ? 'checked' : ''}><span>${esc(p.name)} · ${esc(p.game)}${p.approval.enabled ? '' : ' · noch nicht freigegeben'}</span></label>`).join('') || '<p class="help">Zuerst deinen AP-Raum verbinden.</p>'}`;
    form.querySelector('#rule-recipient-fields').append(panel); this.ruleVisibility();
  },
  ruleVisibility() {
    const form = $('#rule-form'); if (!form) return;
    const effect = form.elements.namedItem('effect').value, group = ['deathlink', 'message', 'alert'].includes(effect);
    const mixed = [...form.querySelectorAll('[name="randomEffects"]:checked')].map(e => e.value), has = action => effect === action || effect === 'random_action' && mixed.includes(action);
    const target = form.elements.namedItem('target');
    if (group) target.value = 'group'; else if (target.value === 'group') target.value = 'random';
    const groupOption = [...target.options].find(o => o.value === 'group'); groupOption.hidden = !group;
    $('#rule-selected-targets').classList.toggle('hidden', group || !['selected', 'random_selected'].includes(target.value));
    for (const id of ['rule-game-field', 'rule-target-field']) $('#' + id).hidden = group;
    $('#rule-quantity-field').hidden = group || effect === 'hint';
    $('#rule-action-mix').classList.toggle('hidden', effect !== 'random_action');
    $('#rule-item-field').hidden = !has('item') && !has('hint');
    $('#rule-pool-field').hidden = !has('random_choice');
    $('#rule-message-field').hidden = !has('message') && !has('alert');
    form.elements.namedItem('item').required = has('item') || has('hint');
    form.elements.namedItem('message').required = has('message');
    const descriptions = {
      random_trap: 'Wählt für jeden getroffenen Spieler zufällig ein erlaubtes Item, das bei ihm als Falle markiert ist.',
      random_nontrap: 'Wählt aus den erlaubten Items, die du nicht als Falle markiert hast. Die Markierung legst du unter Spieler & Effekte fest; die Bridge kann nicht jedes Item automatisch als gut oder schlecht erkennen.',
      random_item: 'Wählt aus allen erlaubten Items des getroffenen Spielers. Fallen können dabei sein.',
      random_choice: 'Wählt aus deiner unten eingetragenen Itemliste. Erlaubte Items und der Raumkatalog des jeweiligen Spielers begrenzen die Auswahl.',
      item: 'Sendet das gewählte zusätzliche Item an die unten festgelegten Spieler. Itemnamen stammen aus eurem verbundenen AP-Raum.',
      hint: 'Fordert einen kostenlosen Admin-Hinweis zum Item des gewählten Spielers an. Der Hinweis erscheint bei dessen AP-Team. Es wird kein zusätzliches Item gesendet.',
      message: 'Sendet einmal eine Nachricht in den Chat des AP-Raums. Dafür ist keine Admin-Anmeldung nötig.',
      alert: 'Zeigt nur einen Stream-Alert. Dabei wird kein Spielitem, Chatbefehl oder DeathLink gesendet.',
      deathlink: 'Sendet einmal DeathLink an die teilnehmenden Clients deines AP-Teams. Einzelspieler- und Spielfilter begrenzen diese Gruppenaktion nicht.',
      random_action: 'Wählt zuerst eine der unten aktivierten, aktuell möglichen Aktionsarten. Danach wird die Aktion für die passenden Empfänger ausgeführt.',
    };
    $('#rule-effect-description').textContent = descriptions[effect] || '';
    const game = form.elements.namedItem('game').value;
    let players = this.teamPlayers().filter(p => p.approval.enabled && (!game || p.game === game));
    if (['selected', 'random_selected'].includes(target.value)) { const keys = [...form.querySelectorAll('[name="targetKeys"]:checked')].map(e => e.value); players = players.filter(p => keys.includes(`${p.team}:${p.slot}`)); }
    else if (!['random', 'all', 'group'].includes(target.value)) players = players.filter(p => `${p.team}:${p.slot}` === target.value);
    const groupDescription = effect === 'deathlink' ? 'Alle verbundenen DeathLink-Teilnehmer deines AP-Teams; nur mit Gruppenfreigabe.' : effect === 'message' ? 'Einmal im AP-Raumchat, unabhängig vom Spiel der Teilnehmer.' : 'Einmal als Stream-Alert; kein Empfänger im Spiel.';
    $('#rule-recipient-preview').innerHTML = group ? `<strong>Wirkung</strong>${esc(groupDescription)}` : `<strong>${players.length} passende freigegebene Spieler</strong>${players.length ? players.map(p => esc(p.name) + ' · ' + esc(p.game)).join('<br>') : 'Noch kein passender Spieler. Raum verbinden, Spielfilter prüfen und Effekte für einen Spieler freigeben.'}${['random', 'random_selected'].includes(target.value) && players.length ? '<br>Pro Ereignis wird eine dieser Personen zufällig gewählt.' : ''}${effect === 'random_action' && mixed.includes('deathlink') ? '<br>Bei DeathLink ist die ganze teilnehmende AP-Teamgruppe betroffen.' : ''}${effect === 'random_action' && mixed.some(e => ['message', 'alert'].includes(e)) ? '<br>Chatnachricht und Stream-Alert werden einmal ausgelöst; die Spielerauswahl begrenzt diese Aktionen nicht.' : ''}`;
  },
  eventsPage(renderEvents) {
    const original = S;
    const games = [...new Set([...S.players.map(p => p.game), ...S.queue.map(j => j.game)])].filter(Boolean).sort();
    if (this.logGame) S = { ...S, queue: S.queue.filter(j => j.game === this.logGame || j.effect === 'deathlink'), events: S.events.filter(e => e.games?.includes(this.logGame) || e.matchedRules?.some(name => original.rules.some(r => r.name === name && r.game === this.logGame))) };
    let html; try { html = renderEvents(); } finally { S = original; }
    return `<label class="log-game-filter">Spiel im geöffneten Raum<select id="studio-log-game"><option value="">Alle Spiele</option>${options(Object.fromEntries(games.map(g => [g, g])), this.logGame)}</select></label>` + html;
  },
  async click(action, id, button) {
    if (action === 'studio-player-add') { const form = button.closest('form[data-player-prefix]'); if (form) this.addPlayerRow(form); else this.playersDrawer(true); return; }
    if (action === 'studio-player-remove') { const form = button.closest('form'); button.closest('[data-player-row]').remove(); this.syncPlayerRows(form); return; }
    if (action === 'studio-rule-players') {
      const profiles = S.playerProfiles || []; if (!profiles.length) throw new Error('Zuerst eure Spieler unter Spieler & Effekte speichern.');
      const keys = new Set(this.teamPlayers().filter(p => profiles.some(saved => saved.name === p.name && (!saved.game || saved.game === p.game))).map(p => `${p.team}:${p.slot}`));
      $('#rule-form').querySelectorAll('[name="targetKeys"]').forEach(input => { input.checked = keys.has(input.value); }); return;
    }

    if (action === 'studio-room-filter') { this.roomFilter = id; render(true); return; }
    if (action === 'studio-room-delete') return this.deleteRoomDrawer(id);
    if (action === 'studio-catalog-more') { this.catalogLimit += 48; $('#studio-catalog-results').innerHTML = this.catalogCards(this.catalogQuery); return; }

    if (action === 'studio-room-new' || action === 'studio-room-edit') return this.roomDrawer(id);
    if (action === 'studio-players') return this.playersDrawer();
    if (action === 'studio-import') return this.importDrawer();
    if (action === 'studio-game') return this.openGame(id);
    if (action === 'studio-use-players') { const form = $('#studio-yaml-form'); form.elements.namedItem('playerNames').value = (S.playerProfiles || []).filter(p => !p.game || p.game === this.entry.game).map(p => p.name).join('\n'); return; }
    if (action === 'studio-all-items') { approvalEditor.catalog.items.forEach(i => approvalEditor.items.add(i)); return renderItemList(); }
    button.disabled = true;
    try {
      if (action === 'studio-room-open') { await api('rooms/activate', { id }); this.logGame = ''; this.entry = null; this.loadingGame = ''; await refresh(true); }
      else if (action === 'studio-room-archive' || action === 'studio-room-restore') { await api('rooms/archive', { id, archived: action === 'studio-room-archive' }); this.entry = null; this.loadingGame = ''; this.logGame = ''; await refresh(true); }
      else if (action === 'studio-forget-ap' || action === 'studio-forget-twitch') { await api('credentials/forget', { source: action.endsWith('-ap') ? 'ap' : 'twitch' }); await refresh(true); }
      else if (action === 'studio-yaml-save') { await api('yaml/preset', this.yamlData()); await refresh(); $('[data-studio-message]').textContent = 'Einstellungen in diesem Raum gespeichert.'; }
      else if (action === 'studio-yaml-preview') { const result = await api('yaml/generate', this.yamlData()); const pre = $('#studio-yaml-preview'); pre.textContent = result.files.map(f => '# Datei: ' + f.name + '\n' + f.content).join('\n'); pre.classList.remove('hidden'); }
    } finally { button.disabled = false; }
  },
  async submit(form) {
    const id = form.getAttribute('id'), data = new FormData(form);
    if (id === 'studio-room-delete-form') {
      await api('rooms/delete', { id: data.get('roomId'), confirmName: data.get('confirmName') }); $('#drawer').close(); this.entry = null; this.loadingGame = ''; this.logGame = ''; await refresh(true);
    } else if (id === 'studio-room-form') {
      const roomId = data.get('roomId');
      if (roomId) await api('rooms/rename', { id: roomId, name: data.get('name'), game: data.get('game') });
      else { const result = await api('rooms/create', { name: data.get('name'), game: data.get('game') }); await api('rooms/activate', { id: result.room.id }); }
      $('#drawer').close(); this.entry = null; this.loadingGame = ''; await refresh(true);
    } else if (id === 'studio-players-form' || id === 'studio-player-list-form') {
      const players = [...form.querySelectorAll('[data-player-row]')].map(row => ({ id: row.querySelector('[name="playerId"]').value, name: row.querySelector('[name="playerName"]').value.trim(), game: row.querySelector('[name="playerGame"]').value.trim() }));
      await api('players', { players }); if (id === 'studio-players-form') $('#drawer').close(); await refresh(true); toast('Spieler in diesem Raum gespeichert.');
    } else if (id === 'studio-scan-form') {
      const report = await api('worlds/scan', { folder: data.get('folder') });
      this.scanReport = report; this.entry = null; this.loadingGame = ''; await refresh(true);
    } else if (id === 'studio-import-form') {
      const files = form.elements.namedItem('files').files;
      if (!files.length) throw new Error('Mindestens eine Datei auswählen.');
      const errors = [], games = [];
      for (const file of files) {
        if (file.size > (S.gameLibrary?.importLimits?.maxArchiveBytes || 128 * 1024 * 1024)) { errors.push(file.name + ': Maximal ' + (S.gameLibrary?.importLimits?.maxArchiveBytes || 128 * 1024 * 1024) / 1024 ** 2 + ' MiB pro APworld.'); continue; }
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
