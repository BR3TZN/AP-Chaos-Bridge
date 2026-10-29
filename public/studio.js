'use strict';
const Studio = {
  roomFilter: 'active', catalogLimit: 24, catalogQuery: '', entry: null, loadingGame: '', gameError: '', logGame: '', scanReport: null, indexLoading: false,
  commonKeys: new Set(['progression_balancing', 'accessibility', 'local_items', 'non_local_items', 'start_inventory', 'start_hints', 'start_location_hints', 'exclude_locations', 'priority_locations', 'item_links', 'plando_items']),
  shell() {
    const workspaceName = document.querySelector('#workspace-name'); if (workspaceName) setText(workspaceName, S.rooms?.rooms.find(r => r.id === S.rooms.active)?.name || 'Dein Run');
    const select = document.querySelector('#room-select');
    if (select && S.rooms) {
      const rooms = S.rooms.rooms.filter(r => !r.archived);
      if (select !== document.activeElement && (select.options.length !== rooms.length || rooms.some((room, index) => select.options[index]?.value !== room.id || select.options[index]?.textContent !== room.name))) select.innerHTML = options(Object.fromEntries(rooms.map(r => [r.id, r.name])), S.rooms.active);
      if (select !== document.activeElement && select.value !== S.rooms.active) select.value = S.rooms.active;
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
    const imported = new Map((S.gameLibrary?.games || []).filter(g => ['apworld', 'core', 'yaml'].includes(g.kind)).map(g => [g.game, g]));
    const list = imported;
    const sorted = [...list.values()].filter(g => [g.game, ...(g.aliases || [])].some(name => normalize(name).includes(normalize(query)))).sort((a, b) => a.game.localeCompare(b.game));
    const cards = sorted.slice(0, this.catalogLimit).map(g => { const entry = imported.get(g.game); return `<article class="panel catalog-card"><div class="section-title"><h3>${esc(g.game)}</h3>${badge(entry?.kind === 'core' ? 'Core ' + entry.coreVersion : entry?.kind === 'yaml' ? 'YAML-Vorlage' : 'APworld', 'good')}</div><p>${entry ? `${entry.optionCount} Einstellungen · ${esc(entry.kind === 'core' ? 'In Archipelago enthalten' : entry.source)}` : 'Die .apworld-Datei hinzufügen, um Einstellungen zu bearbeiten.'}</p><button class="small section-gap" data-action="studio-game" data-id="${esc(entry?.game || g.game)}">${entry ? 'Einstellungen & YAML' : 'Spiel öffnen'}</button></article>`; }).join('');
    return cards + (sorted.length > this.catalogLimit ? `<button data-action="studio-catalog-more">Weitere Spiele anzeigen · ${sorted.length - this.catalogLimit} verbleibend</button>` : '') || empty('Kein Spiel gefunden', 'Eine eigene APworld oder Spieler-YAML fügt das Spiel hinzu.');
  },
  catalogPage() {
    void this.loadIndex();
    return pageHead('SPIELEKATALOG', 'Deine Spiele. Deine Settings.', 'Suche ein Spiel, hinterlege seine Einstellungen und exportiere eine YAML für jeden Spieler.', '<button class="primary" data-action="studio-import">+ APworld / YAML hinzufügen</button>')
      + `<section class="panel panel-pad"><form id="studio-scan-form"><label>APworld-Ordner<input name="folder" value="${esc(S.gameLibrary?.folder || '')}" required></label><div class="button-row section-gap"><button type="submit">Ordner neu einlesen</button><span class="tiny">Nur .apworld · Unterordner werden mit eingelesen</span></div></form><p class="help">Vorbereitete APworld-Versionen werden am Dateiinhalt erkannt und funktionieren auch in deinem eigenen Ordner oder nach Umbenennen ohne Python. Für bisher unbekannte Versionen ist Python 3.10 oder neuer nötig. Spieler-YAMLs kannst du oben hinzufügen; sie werden ohne Python als eigene Vorlagen gespeichert und bleiben auch nach einem Ordnerscan erhalten.</p>${S.gameLibrary?.coreVersion ? `<p class="help">Core-Spiele sind direkt vorbereitet für Archipelago ${esc(S.gameLibrary.coreVersion)}. Sie bleiben auch bei einem eigenen APworld-Ordner verfügbar. Eine eigene APworld desselben Spiels hat Vorrang.</p>` : ''}<p class="help">${S.gameLibrary?.games.length || 0} Spiele verfügbar · <a href="/apworlds-manual" download>Liste der manuellen Downloads</a></p>${this.scanReport ? this.scanReportHTML() : ''}</section>`
      + `<label class="section-gap">Spiel suchen<input id="studio-search" type="search" value="${esc(this.catalogQuery)}" placeholder="Stardew Valley, Kingdom Hearts …" autocomplete="off"></label><div id="studio-catalog-results" class="grid catalog-grid section-gap">${this.catalogCards()}</div>`;
  },
  scanReportHTML() {
    const report = this.scanReport;
    return `<div class="scan-report"><div class="scan-summary" role="status">${badge('Einlesen abgeschlossen', 'good')}<span>${S.gameLibrary.games.length} Spiele bereit · ${report.imported.length} neu eingelesen · ${report.unchanged} Dateien unverändert</span></div>${report.skipped?.length ? `<details class="disclosure"><summary>${report.skipped.length} Pakete ohne Spieleinstellungen übersprungen · übriger Katalog ist nutzbar</summary><p class="help">Diese Pakete liefern keine eigenen Spieleinstellungen. Hilfsbibliotheken wie APAPI sind kein zusätzliches Spiel. Details zur jeweiligen Datei stehen unten.</p><ul>${report.skipped.map(e => `<li><code>${esc(e.file)}</code><br>${esc(e.reason)}</li>`).join('')}</ul></details>` : ''}${report.errors.length ? `<details class="disclosure" open><summary>${report.errors.length} Dateien prüfen</summary><ul>${report.errors.map(e => `<li><code>${esc(e.file)}</code><br>${esc(e.error)}</li>`).join('')}</ul></details>` : ''}</div>`;
  },
  importDrawer() {
    showDrawer(drawerHead('APworlds oder YAMLs hinzufügen', 'APworlds liefern Spieldefinitionen; Spieler-YAMLs übernehmen die vorhandenen Werte und Kommentare. Aus einem Release-ZIP zuerst die gewünschte Datei entpacken.') + `<form id="studio-import-form"><div class="drawer-body"><label class="section-gap">Dateien<input name="files" type="file" accept=".apworld,.yaml,.yml" multiple required></label><p class="help">Maximal ${S.gameLibrary?.importLimits?.maxArchiveBytes / 1024 ** 2 || 128} MiB pro APworld, 2 MiB pro YAML. YAML-Dateien benötigen kein Python. Auswahlwerte werden aus eindeutigen Kommentaren übernommen; andere Felder bleiben frei bearbeitbar. Spielaktionen werden weiterhin mit dem Itemkatalog des verbundenen AP-Raums abgeglichen.</p><div id="studio-import-progress" class="help" role="status"></div></div><div class="drawer-foot"><button type="button" class="ghost" data-action="close-drawer">Abbrechen</button><button class="primary" type="submit">Importieren</button></div></form>`);
  },
  async openGame(game) { this.entry = null; this.loadingGame = ''; this.gameError = ''; location.hash = 'spiel/' + encodeURIComponent(game); if (currentPage === 'spiel/' + encodeURIComponent(game)) render(true); },
  async loadGame(game) {
    if (this.loadingGame === game) return;
    const request = this.loadRequest = (this.loadRequest || 0) + 1;
    this.loadingGame = game; this.gameError = '';
    try { const entry = await api('game-settings?game=' + encodeURIComponent(game)); if (request !== this.loadRequest) return; this.entry = entry; }
    catch (e) { if (request !== this.loadRequest) return; this.entry = null; this.gameError = e.message; }
    if (currentPage === 'spiel/' + encodeURIComponent(game)) render(true);
  },
  async selectSource(sourceId) {
    await api('yaml/source', { game: this.entry.game, sourceId });
    this.entry = null; this.loadingGame = ''; this.loadRequest = (this.loadRequest || 0) + 1;
    await refresh(true);
  },
  removeYamlDrawer() {
    showDrawer(drawerHead('YAML-Vorlage entfernen', this.entry.source) + `<form id="studio-yaml-remove-form"><input type="hidden" name="sourceId" value="${esc(this.entry.sourceId)}"><div class="drawer-body"><p>Entfernt diese gespeicherte YAML-Vorlage für alle Räume aus dem Katalog. Du kannst sie anschließend erneut importieren.</p></div><div class="drawer-foot"><button type="button" class="ghost" data-action="close-drawer">Abbrechen</button><button class="primary" type="submit">Vorlage entfernen</button></div></form>`);
  },
  listValue(index, form = $('#studio-yaml-form')) {
    const original = JSON.parse(form.elements.namedItem('option-' + index).value);
    const checked = [...form.querySelectorAll('[data-option-list="' + index + '"][type="checkbox"]:checked')].map(input => input.value);
    const extra = form.elements.namedItem('list-extra-' + index)?.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean) || [];
    const selected = [...new Set([...checked, ...extra])];
    return [...original.filter(value => selected.includes(value)), ...selected.filter(value => !original.includes(value))];
  },
  listSummary(index) {
    const summary = document.querySelector('[data-list-summary="' + index + '"]');
    if (summary) summary.textContent = this.listValue(index).length + ' ausgewählt · Werte auswählen';
  },
  valueHelp(option) {
    const kind = option.kind, value = option.default;
    let format = kind === 'text' ? 'Text' : kind === 'number' ? 'Zahl' : kind === 'dict' ? 'JSON-Objekt mit Schlüssel/Wert-Paaren' : ['list', 'set'].includes(kind) ? 'JSON-Liste' : Array.isArray(value) ? 'JSON-Liste' : value && typeof value === 'object' ? 'JSON-Objekt mit Schlüssel/Wert-Paaren' : 'Gültiger JSON-Wert';
    let example = value === undefined ? '' : JSON.stringify(value);
    if (example?.length > 180) example = example.slice(0, 177) + '…';
    const known = option.validKeys?.length ? `<details class="disclosure"><summary>${option.validKeys.length} dokumentierte Schlüssel / Werte</summary><pre class="option-values">${esc(option.validKeys.join('\n'))}</pre></details>` : '';
    return `<span class="help option-value-help">Erwartet: ${esc(format)}.${example ? ' Vorlagenwert: ' + esc(example) + '.' : ''}${option.inferred ? ' Kommentare liefern Hinweise; eine vollständige Werteliste ist nicht garantiert.' : !option.description && !option.validKeys?.length ? ' Die Quelle gibt keine weiteren Wertehinweise an.' : ''}</span>${known}`;
  },
  field(option, i, values) {
    const value = Object.hasOwn(values, option.key) ? values[option.key] : option.default, name = 'option-' + i;
    const localized = HelpText.option(this.entry, i), translatedLabel = localized?.label || option.label, translatedDescription = localized?.description ?? option.description;
    let control = '', list = false;
    const listChoices = option.listChoices || (option.kind === 'set' ? option.validKeys?.map(value => ({ value, label: value })) : null);
    const listDefault = value === undefined && option.kind === 'set' ? [] : value;
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
    } else if (listChoices?.length && listChoices.length <= 500 && Array.isArray(listDefault) && new Set(listDefault).size === listDefault.length && [...listDefault, ...listChoices.map((choice, choiceIndex) => choice.value)].every(item => typeof item === 'string' && item.trim() === item && item && !/[\r\n]/.test(item))) {
      list = true;
      const extra = listDefault.filter(item => !listChoices.some(choice => choice.value === item));
      control = `<input type="hidden" name="${name}" value="${esc(JSON.stringify(listDefault))}"><details class="option-list"><summary data-list-summary="${i}" aria-labelledby="studio-label-${i}">${listDefault.length} ausgewählt · Werte auswählen</summary><div class="option-list-options">${listChoices.map((choice, choiceIndex) => `<label class="check-label"><input type="checkbox" name="list-${i}" data-option-list="${i}" value="${esc(choice.value)}" ${listDefault.includes(choice.value) ? 'checked' : ''}><span><b>${esc(choice.label)}</b><span class="tiny mono">${esc(choice.value)}</span>${choice.description ? `<span class="help" data-help-list-description="${choiceIndex}">${esc(localized?.listDescriptions?.[choiceIndex] ?? choice.description)}</span>` : ''}</span></label>`).join('')}</div></details><label>Weitere Werte · ein Wert pro Zeile<textarea name="list-extra-${i}" data-option-list="${i}" rows="2" spellcheck="false">${esc(extra.join('\n'))}</textarea></label><span class="help">Mehrere Werte einzeln anklicken. Keine Auswahl ergibt eine leere Liste.${option.inferred ? ' Auswahlhilfen aus den YAML-Kommentaren; weitere Werte bleiben möglich.' : ' Zusätzliche Werte werden vom Archipelago-Generator geprüft.'}</span>`;
    } else if (['dict', 'set', 'list', 'json'].includes(option.kind)) control = `<textarea name="${name}" rows="4" spellcheck="false">${esc(JSON.stringify(value ?? (option.kind === 'dict' ? {} : option.kind === 'json' ? null : []), null, 2))}</textarea>`;
    else control = `<input name="${name}" ${option.kind === 'number' ? 'type="number" step="any"' : ''} value="${esc(value ?? '')}">`;
    if (value === undefined) control = `<label class="check-label"><input type="checkbox" name="enable-${i}" data-option-enable="${i}"><span>Option ausdrücklich setzen</span></label><fieldset class="option-control" data-option-fieldset="${i}" disabled>${control}</fieldset>`;
    const label = list ? `<span id="studio-label-${i}"><b data-help-label="${i}">${esc(translatedLabel)}</b></span>` : `<label for="studio-option-${i}"><b data-help-label="${i}">${esc(translatedLabel)}</b></label>`;
    const help = !list && ['text', 'number', 'dict', 'set', 'list', 'json'].includes(option.kind) ? this.valueHelp(option) : '';
    return `<div class="option-field ${['dict', 'set', 'list', 'json'].includes(option.kind) ? 'full' : ''}" data-option-index="${i}" data-option-search="${esc((option.label + ' ' + option.key).toLowerCase())}">${label}<span class="tiny mono option-key">${esc(option.key)}</span>${control.replace('name="' + name + '"', 'id="studio-option-' + i + '" name="' + name + '"')}${help}${option.description ? `<span class="help option-description" data-help-description="${i}" lang="${localized && HelpText.language === 'de' ? 'de' : 'en'}">${esc(translatedDescription)}</span>` : ''}${HelpText.original(option, i)}</div>`;
  },
  gamePage() {
    let game; try { game = decodeURIComponent(currentPage.slice('spiel/'.length)); } catch { game = ''; }
    const head = pageHead('SPIELEINSTELLUNGEN', game || 'Spiel', 'Einstellungen vor der Seed-Generierung. Deine gespeicherte Vorlage bleibt für den nächsten Run verfügbar.', '<a class="text-link" href="#katalog">Zum Katalog</a>');
    if (this.entry?.game !== game) {
      if (this.loadingGame !== game) void this.loadGame(game);
      return head + `<section class="panel panel-pad">${this.gameError ? `<p>${esc(this.gameError)}</p><button data-action="studio-import">APworld oder YAML hinzufügen</button>` : '<p>Einstellungen werden geladen …</p>'}</section>`;
    }
    const entry = this.entry, preset = S.yamlPresets?.[entry.kind === 'yaml' ? entry.sourceId : game], values = { ...(entry.base[game] || {}), ...(preset?.values || {}) };
    const fields = entry.options.map((option, index) => ({ option, index }));
    const gameFields = fields.filter(f => !this.commonKeys.has(f.option.key)), commonFields = fields.filter(f => this.commonKeys.has(f.option.key));
    const playerNames = preset?.players || (S.playerProfiles || []).filter(p => !p.game || p.game === game).map(p => p.name);
    if (!playerNames.length) playerNames.push(entry.kind === 'yaml' && typeof entry.base.name === 'string' && entry.base.name.length <= 16 && !/[{}]/.test(entry.base.name) ? entry.base.name : (S.config.ap.slotName !== 'ADMIN' && S.config.ap.slotName) || 'Player1');
    return head + `<form id="studio-yaml-form" data-game="${esc(game)}"><section class="panel panel-pad"><div class="section-title"><h2>Spieler & Vorlage</h2>${badge(entry.kind === 'core' ? 'Core ' + entry.coreVersion : entry.kind === 'yaml' ? 'YAML-Vorlage' : 'APworld-Optionen', 'good')}</div><p class="help">Quelle: ${esc(entry.source)}${entry.worldVersion ? ` · World-Version ${esc(entry.worldVersion)}` : ''}${entry.minimumAPVersion ? ` · Archipelago ab ${esc(entry.minimumAPVersion)}` : ''}</p>${entry.kind === 'yaml' ? '<button type="button" class="small ghost section-gap" data-action="studio-yaml-remove">YAML-Vorlage entfernen</button>' : ''}${entry.sources?.length > 1 ? `<label class="section-gap">Einstellungsquelle<select id="studio-source">${options(Object.fromEntries(entry.sources.map(source => [source.id, source.label])), entry.sourceId)}</select><span class="tiny">Jede Quelle behält ihre eigenen Werte und gespeicherten Einstellungen.</span></label>` : ''}${entry.kind === 'core' ? `<p class="help">Für Archipelago ${esc(entry.coreVersion)} vorbereitet. Diese World ist dort bereits enthalten; keine zusätzliche APworld installieren. Die YAML enthält die erforderliche Archipelago-Version. <a href="${esc(entry.sourceURL)}" target="_blank" rel="noreferrer">Offizielle World-Quelle</a></p>` : ''}<div class="form-grid"><label>Slotnamen · ein Name pro Zeile<textarea name="playerNames" rows="3" required placeholder="Br3tzn&#10;Spieler2">${esc(playerNames.join('\n'))}</textarea><span class="tiny">1–16 Zeichen pro Name. Für jeden Namen wird eine eigene YAML exportiert.</span></label><div><h3>Deine Konfiguration</h3><p class="help">Speichern behält Einstellungen und Namen in diesem Raum. Die YAML-Dateien gehören anschließend in die Archipelago-Generierung.</p><div class="button-row section-gap"><button type="button" class="ghost" data-action="studio-use-players">Gespeicherte Spielernamen übernehmen</button></div></div></div>${entry.unresolved?.length ? `<details class="disclosure"><summary>${entry.unresolved.length} dynamische Angaben nicht automatisch aufgelöst</summary><p class="help">${entry.unresolved.map(esc).join(' · ')}</p><p class="help">Diese Angaben kannst du unten als Zusatzoptionen setzen oder die Standards der APworld übernehmen. Ohne eigenen Wert gelten die Defaults des APworlds.</p></details>` : ''}</section>
      <section class="panel panel-pad section-gap">${entry.yamlNotice ? `<p class="help" role="note">${esc(entry.yamlNotice)} ${entry.setupURL ? `<a href="${esc(entry.setupURL)}" target="_blank" rel="noreferrer">Anleitung des Entwicklers</a>` : ''}</p>` : ''}<div class="section-title"><h2>Spieleinstellungen</h2><span class="tiny">${entry.options.length} Felder</span></div>${HelpText.bar()}<input id="studio-option-search" type="search" placeholder="Einstellung suchen …" aria-label="Spieleinstellungen durchsuchen"><div class="form-grid option-grid">${gameFields.map(f => this.field(f.option, f.index, values)).join('')}</div>${commonFields.length ? `<details class="disclosure studio-common"><summary>Allgemeine Archipelago-Optionen · ${commonFields.length} Felder</summary><div class="form-grid option-grid">${commonFields.map(f => this.field(f.option, f.index, values)).join('')}</div></details>` : ''}<details class="disclosure"><summary>Erweiterte Zusatzoptionen als YAML</summary><p class="help">Zusätzliche oder dynamische Spieloptionen. Hier gesetzte Werte überschreiben gleichnamige Formularwerte.</p><textarea name="extra" rows="8" spellcheck="false" placeholder="option_name: value">${esc(preset?.extra || '')}</textarea></details><div class="button-row section-gap"><button type="button" data-action="studio-yaml-save">Einstellungen speichern</button><button type="button" class="ghost" data-action="studio-yaml-preview">YAML-Vorschau</button><button type="button" class="ghost" data-action="studio-admin-yaml">ADMIN.yaml herunterladen</button><button class="primary" type="submit">YAMLs herunterladen</button></div><p class="help">Für den Bridge-Login die ADMIN.yaml einmal zusammen mit den Spieler-YAMLs zum Seed generieren.</p><p data-studio-message class="help" role="status"></p><pre id="studio-yaml-preview" class="hidden"></pre></section></form>`;
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
      if (option.kind === 'range' && /^-?\d+$/.test(raw)) value = Number(raw);
      if (option.kind === 'number') { value = Number(raw); if (!raw.trim() || !Number.isFinite(value)) throw new Error(option.label + ': gültige Zahl eingeben.'); }
      if (form.elements.namedItem('list-extra-' + i)) value = this.listValue(i, form);
      else if (element.multiple) value = [...element.selectedOptions].map(o => o.value);
      else if (['dict', 'set', 'list', 'json'].includes(option.kind)) { try { value = JSON.parse(raw); } catch { throw new Error(option.label + ': gültiges JSON eingeben.'); } }
      values[option.key] = value;
    }
    return { game: entry.game, sourceId: entry.sourceId, values, players: form.elements.namedItem('playerNames').value.split(/\r?\n/).map(x => x.trim()).filter(Boolean), extra: form.elements.namedItem('extra').value };
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
    node.querySelector('#charity-form').closest('section').before(node.querySelector('#twitch-form').closest('section'));
    const config = S.config.ap, saved = S.savedCredentials || {};
    let parsed; try { parsed = new URL(config.url.includes('://') ? config.url : 'ws://' + config.url); } catch { parsed = new URL('ws://archipelago.gg:38281'); }
    const mode = config.addressMode || (['127.0.0.1', 'localhost'].includes(parsed.hostname) ? 'local' : parsed.hostname === 'archipelago.gg' ? 'hosted' : 'custom');
    const apForm = node.querySelector('#ap-form'), adminLogin = (config.loginMode || (config.slotName ? 'slot' : 'admin')) === 'admin';
    apForm.innerHTML = `<div class="statusbar">${badge(S.ap.connected ? 'AP verbunden' : 'AP getrennt', S.ap.connected ? 'good' : '')}${badge(S.ap.admin ? 'Admin angemeldet' : 'Admin nicht angemeldet', S.ap.admin ? 'good' : 'warn')}${S.ap.connected && S.ap.slotName && !S.ap.demo ? badge('Login: ' + S.ap.slotName) : ''}</div><div class="form-grid narrow"><label class="full">Server gehostet<select name="addressMode" id="ap-address-mode">${options({ local: 'Lokal · dieser PC', hosted: 'Extern · archipelago.gg', custom: 'Extern · eigener Host / IP' }, mode)}</select></label><label id="ap-host-label" class="full ${mode === 'custom' ? '' : 'hidden'}">Hostname / IP<input name="host" value="${esc(config.host || parsed.hostname)}" placeholder="ap.example.com"></label><label>Port<input name="port" type="number" min="1" max="65535" value="${config.port || parsed.port || 38281}" required></label><label class="check-label"><input name="secure" type="checkbox" ${config.secure || parsed.protocol === 'wss:' ? 'checked' : ''}><span>TLS / wss verwenden</span></label><label class="full">Bridge-Anmeldung<select name="loginMode" id="ap-login-mode">${options({ admin: 'ADMIN · separater Zuschauer-Dummy', slot: 'Vorhandener Spielslot · Textmodus' }, adminLogin ? 'admin' : 'slot')}</select></label><label class="full">Slotname<input name="slotName" list="ap-slot-names" value="${esc(adminLogin ? 'ADMIN' : config.slotName)}" ${adminLogin ? 'readonly' : ''} required autocomplete="off"><datalist id="ap-slot-names">${[...new Set([...(S.playerProfiles || []).map(p => p.name), ...S.players.map(p => p.name)])].map(name => `<option value="${esc(name)}"></option>`).join('')}</datalist></label><p class="help full" id="ap-admin-help">Für den ADMIN-Dummy <a href="/api/ap/admin-yaml" download="ADMIN.yaml">ADMIN.yaml herunterladen</a> und einmal zusammen mit euren Spieler-YAMLs generieren. Der Slotname ist immer ADMIN; Adminrechte erfordert weiterhin das Server-Adminpasswort. Bereits erzeugte Seeds können keinen zusätzlichen Slot erhalten. Dafür bleibt „Vorhandener Spielslot“ verfügbar.</p><label>Raumpasswort<input type="password" name="roomPassword" autocomplete="off" value="${saved.roomPassword ? '••••••••' : ''}" placeholder="Falls gesetzt"></label><label>Server-Adminpasswort<input type="password" name="adminPassword" autocomplete="off" value="${saved.adminPassword ? '••••••••' : ''}" placeholder="Für zusätzliche Items nötig"></label><label class="full">Erwartete Seed-ID <span class="muted">(optional)</span><input name="expectedSeed" value="${esc(config.expectedSeed || '')}"></label></div><div class="button-row"><button type="submit" class="primary">Raum verbinden</button><button type="button" class="ghost" data-action="disconnect-ap">Trennen</button><button type="button" class="small ghost" data-action="studio-players">Slotnamen verwalten</button></div><p class="help">Lokal: 127.0.0.1 + Port. Bei archipelago.gg genügt der Raumport. Für andere externe Server wird zusätzlich deren Hostname benötigt. Gespeicherte Passwörter bleiben maskiert im Feld.</p><button type="button" class="small ghost section-gap" data-action="studio-forget-ap">Gespeicherte Passwörter vergessen</button>`;
    if (apForm.nextElementSibling) apForm.nextElementSibling.textContent = 'Verbindungen und Zugangsdaten werden für diesen Raum lokal gespeichert und beim nächsten Start wiederhergestellt. Admin-Status und Serververbindung werden getrennt angezeigt.';
    node.querySelector('#twitch-form').parentElement.innerHTML = this.twitchPanel();
    return node.innerHTML;
  },
  twitchForm(channel = {}, adding = false) {
    const events = channel.events || Object.keys(S.twitchEvents);
    return `<form id="${adding ? 'studio-twitch-add-form' : 'studio-twitch-form-' + channel.id}" data-twitch-channel="${esc(channel.id || '')}"><div class="form-grid"><label>Kanalname<input name="channelName" value="${esc(channel.channelName || '')}" placeholder="br3tzn" maxlength="25" required autocomplete="off"><span class="help">Twitch-Name ohne Link.</span></label><label>Client-ID<input name="clientId" value="${esc(channel.clientId || '')}" required autocomplete="off"><span class="help">Die gleiche Twitch-App darf für mehrere Kanäle verwendet werden.</span></label></div><fieldset class="event-selection"><legend>Ereignisse aus diesem Kanal</legend>${Object.entries(S.twitchEvents).map(([event, info]) => `<label class="check-label"><input type="checkbox" name="event" value="${esc(event)}" ${events.includes(event) ? 'checked' : ''}><span>${esc(info.label)}</span></label>`).join('')}</fieldset><details class="disclosure"><summary>Erweitert: automatische Erneuerung oder vorhandener Token</summary><label class="section-gap">Client Secret <span class="muted">(optional)</span><input name="clientSecret" type="password" value="${channel.hasSecret ? '••••••••' : ''}" autocomplete="off"><span class="help">Mit Client Secret kann die Anmeldung über einen Refresh Token automatisch erneuert werden. Ohne Secret bleibt sie bis zum Tokenablauf gültig.</span></label><label class="section-gap">Vorhandener User Access Token <span class="muted">(optional)</span><input type="password" name="token" autocomplete="off"><span class="help">Muss vom angegebenen Kanalbesitzer stammen.</span></label></details><div class="button-row section-gap"><button type="submit" class="primary">${adding ? 'Kanal hinzufügen & anmelden' : 'Einstellungen speichern'}</button>${!adding ? `<button type="button" class="ghost" data-action="studio-twitch-auth" data-id="${esc(channel.id)}">Neu mit Twitch anmelden</button><button type="button" class="small ghost" data-action="studio-twitch-forget" data-id="${esc(channel.id)}">Anmeldung vergessen</button>` : ''}</div></form>`;
  },
  twitchPanel() {
    const channels = S.twitch.channels || [];
    return `<div class="section-title"><h2>Twitch-Kanäle</h2><span class="source-icon purple">TW</span></div><p class="help">Jeder Kanal hat eine eigene Anmeldung. Regeln können auf alle Kanäle oder gezielt auf einen Kollegen reagieren.</p><div class="twitch-channels">${channels.map(channel => `<article class="twitch-channel" data-live-key="twitch-${esc(channel.id)}"><div class="section-title"><h3>${esc(channel.channelName ? '@' + channel.channelName : 'Mein Twitch-Kanal')}</h3>${pill(channel.state)}</div><p class="tiny">${channel.subscriptions.length ? channel.subscriptions.map(event => esc(S.twitchEvents[event]?.label || event)).join(' · ') : 'Noch keine aktiven Ereignisse'}</p>${channel.error ? `<p class="connection-error">${esc(channel.error)}</p>` : ''}${channel.rejected.length ? `<p class="connection-error">${channel.rejected.map(esc).join('<br>')}</p>` : ''}<div class="button-row section-gap">${channel.state === 'connected' || ['connecting', 'reconnecting'].includes(channel.state) ? `<button type="button" class="ghost" data-action="studio-twitch-disconnect" data-id="${esc(channel.id)}">Trennen</button>` : `<button type="button" data-action="${channel.hasToken ? 'studio-twitch-connect' : 'studio-twitch-auth'}" data-id="${esc(channel.id)}">${channel.hasToken ? 'Verbinden' : 'Mit Twitch anmelden'}</button>`}<button type="button" class="small ghost" data-action="studio-twitch-remove" data-id="${esc(channel.id)}">Kanal entfernen</button><button type="button" class="ghost" data-action="rewards-manage" data-id="${esc(channel.id)}">Kanalpunkte-Belohnungen</button></div><details class="disclosure" id="twitch-settings-${esc(channel.id)}"><summary>Verbindungseinstellungen</summary>${this.twitchForm(channel)}</details></article>`).join('') || '<p class="help">Noch kein Twitch-Kanal hinzugefügt.</p>'}</div><button type="button" class="primary section-gap" data-action="studio-twitch-add">+ Twitch-Kanal hinzufügen</button><details class="disclosure"><summary>Twitch einrichten</summary><ol class="setup-steps"><li>Eine Anwendung in der <a href="https://dev.twitch.tv/console/apps" target="_blank" rel="noreferrer">Twitch Developer Console</a> verwenden.</li><li>Redirect-URL exakt: <code>http://localhost:${location.port}/oauth/callback</code>.</li><li>Kanalname und Client-ID eintragen und die gewünschten Ereignisse auswählen.</li><li>Bei Twitch mit genau diesem Kanalbesitzer anmelden. Die Client-ID allein erteilt keine Kontoberechtigung.</li></ol><p class="help">Zugangsdaten bleiben verschlüsselt auf diesem PC und gelten pro Bridge-Raum. Gift-Pakete lösen einmal aus; die einzelnen Geschenk-Abos werden nicht zusätzlich gezählt.</p></details>`;
  },
  twitchAdd() { showDrawer(drawerHead('Twitch-Kanal hinzufügen', 'Name und Client-ID eintragen, danach den Kanalbesitzer bei Twitch anmelden.') + `<div class="drawer-body">${this.twitchForm({}, true)}</div>`); },
  async saveTwitchChannel(form) {
    const d = new FormData(form), id = form.dataset.twitchChannel;
    const channel = await api('twitch/channel', { ...(id ? { id } : {}), channelName: d.get('channelName'), clientId: d.get('clientId'), events: d.getAll('event') });
    await api('twitch/credentials', { channelId: channel.channel.id, clientSecret: d.get('clientSecret') || '' });
    return { id: channel.channel.id, token: d.get('token') || '' };
  },
  async authorizeTwitch(form) {
    const native = Boolean(window.chrome?.webview?.postMessage), popup = native ? null : window.open('about:blank', 'ap-twitch-auth-' + (form.dataset.twitchChannel || 'new'));
    try {
      const result = await this.saveTwitchChannel(form);
      if (result.token) { popup?.close(); await api('twitch/connect', { channelId: result.id, token: result.token }); }
      else {
        const auth = await api('twitch/auth', { channelId: result.id });
        if (native) window.chrome.webview.postMessage({ type: 'openExternal', url: auth.url });
        else if (popup) { popup.opener = null; popup.location.href = auth.url; }
        else { const link = document.createElement('a'); link.href = auth.url; link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = 'Twitch-Anmeldung öffnen'; form.append(link); toast('Popup wurde blockiert. Den Link im Formular öffnen.'); }
      }
      if (form.id === 'studio-twitch-add-form' && (native || popup || result.token)) $('#drawer').close();
      await refresh(true);
    } catch (error) { popup?.close(); throw error; }
  },
  extendRule(rule) {
    const form = $('#rule-form'), target = form.elements.namedItem('target');
    target.add(new Option('Mehrere ausgewählte Spieler', 'selected')); target.add(new Option('Eine zufällige Person aus der Auswahl', 'random_selected'));
    if (['selected', 'random_selected'].includes(rule.target)) target.value = rule.target;
    const panel = document.createElement('div'); panel.className = 'full'; panel.id = 'rule-selected-targets';
    panel.innerHTML = `<b class="tiny">Spieler auswählen</b><button type="button" class="small ghost" data-action="studio-rule-players">Gespeicherte Spieler auswählen</button>${S.players.filter(p => p.team === S.ap.team && p.type === 1).map(p => `<label class="check-label"><input name="targetKeys" type="checkbox" value="${p.team}:${p.slot}" ${rule.targetKeys?.includes(`${p.team}:${p.slot}`) ? 'checked' : ''}><span>${esc(p.name)} · ${esc(p.game)}${p.approval.enabled ? '' : ' · noch nicht freigegeben'}</span></label>`).join('') || '<p class="help">Zuerst deinen AP-Raum verbinden.</p>'}`;
    form.querySelector('#rule-recipient-fields').append(panel); this.ruleVisibility(false); form.dataset.ready = 'true';
  },
  triggerFields(rule) {
    const channels = Object.fromEntries((S.twitch.channels || []).map(channel => [channel.id, channel.channelName ? '@' + channel.channelName : 'Mein Twitch-Kanal']));
    if (rule.twitchChannelId && !channels[rule.twitchChannelId]) channels[rule.twitchChannelId] = 'Nicht verbundener gespeicherter Kanal';
    return `<fieldset class="rule-section"><legend><span>1</span>Auslöser</legend><div class="form-grid"><label>Quelle<select name="source">${options(sourceNames, rule.source)}</select></label><label id="rule-type-field">Ereignis<select name="type">${options(typeNames, rule.type)}</select></label><label class="full" id="rule-channel-field">Twitch-Kanal<select name="twitchChannelId"><option value="">Alle verbundenen Kanäle</option>${options(channels, rule.twitchChannelId || '')}</select></label><label id="rule-amount-field">Mindestens Euro netto<input type="number" name="euros" min="0" max="1000000" step="0.01" value="${rule.minimumCents / 100}"></label><label id="rule-units-field"><span data-units-label>Mindestens Einheiten pro Ereignis</span><input type="number" name="minimumUnits" min="0" max="10000000" step="1" value="${rule.minimumUnits}"><span class="help" data-units-help></span></label><label class="full" id="rule-reward-field">Kanalpunkte-Belohnung<select name="rewardId"><option value="">Alle benutzerdefinierten Belohnungen</option>${rule.rewardId ? `<option value="${esc(rule.rewardId)}" selected>Gespeicherte Belohnung · ${esc(rule.rewardId)}</option>` : ''}<option value="__custom__">Belohnungs-ID selbst eintragen …</option></select><button type="button" class="small ghost" data-action="rewards-from-rule">+ Belohnung bei Twitch anlegen</button><span class="help" id="rule-rewards-help">Verbundene Kanäle liefern die Namen ihrer Belohnungen.</span></label><label class="full" id="rule-custom-reward-field">Belohnungs-ID<input name="customRewardId" value="${esc(rule.rewardId || '')}" placeholder="ID aus Twitch oder deinem Ereignisprotokoll"></label></div><p id="rule-source-description" class="help"></p><details class="disclosure" id="rule-action-filter" ${rule.action ? 'open' : ''}><summary>Optional: bestimmten Button oder externe Aktion filtern</summary><label class="section-gap">Button-/Aktionskennung<input name="action" value="${esc(rule.action || '')}" placeholder="Leer = alle passenden Ereignisse"><span class="help">Nur setzen, wenn dein Spendenbutton oder externer Trigger eine eigene Aktionskennung mitliefert.</span></label></details></fieldset>`;
  },
  reveal(element, visible, animate = true) {
    if (!element) return;
    const old = element._reveal; old?.animation?.cancel();
    const state = element._reveal = { visible };
    const wasVisible = !element.hidden && !element.classList.contains('hidden');
    if (wasVisible === visible && !old?.animation) return;
    const reduced = document.documentElement.dataset.motion === 'off' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const done = () => { if (element._reveal !== state) return; element.hidden = !visible; element.classList.toggle('hidden', !visible); element.style.overflow = ''; state.animation = null; };
    if (!animate || reduced || !element.animate) { done(); return; }
    const height = element.getBoundingClientRect().height || element.scrollHeight;
    element.hidden = false; element.classList.remove('hidden'); element.style.overflow = 'hidden';
    const expanded = element.scrollHeight;
    state.animation = element.animate(visible ? [{ height: '0px', opacity: 0, transform: 'translateY(-4px)' }, { height: expanded + 'px', opacity: 1, transform: 'translateY(0)' }] : [{ height: height + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: visible ? 190 : 140, easing: 'cubic-bezier(.2,.75,.25,1)' });
    state.animation.finished.then(done).catch(() => {});
  },
  triggerVisibility(animate) {
    const form = $('#rule-form'), source = form.elements.namedItem('source').value, type = form.elements.namedItem('type');
    const types = source === 'charity' ? { donation: 'Spende' } : source === 'twitch' ? { subscription: 'Alle Abos · neu, Resub & Geschenk', sub: 'Nur neue Abos', resub: 'Resub-Mitteilung', gift_sub: 'Verschenkte Abo-Pakete', cheer: 'Bits / Cheer', channel_points: 'Kanalpunkte-Belohnung', any: 'Alle Twitch-Ereignisse' } : source === 'manual' ? { manual: 'Manuell' } : typeNames;
    const selected = Object.hasOwn(types, type.value) ? type.value : Object.keys(types)[0];
    if ([...type.options].map(option => option.value + ':' + option.textContent).join('|') !== Object.entries(types).map(([value, label]) => value + ':' + label).join('|')) type.innerHTML = options(types, selected);
    type.value = selected;
    const show = (id, visible) => { const element = $('#' + id); this.reveal(element, visible, animate); element.querySelectorAll('input, select, textarea').forEach(control => { control.disabled = !visible; }); };
    show('rule-type-field', Object.keys(types).length > 1); type.disabled = false;
    show('rule-channel-field', source === 'twitch');
    show('rule-amount-field', source === 'charity' || ['external', 'any'].includes(source) && ['donation', 'any'].includes(type.value));
    show('rule-units-field', source === 'twitch' ? ['cheer', 'gift_sub'].includes(type.value) : ['external', 'any'].includes(source));
    const reward = source === 'twitch' && type.value === 'channel_points';
    show('rule-reward-field', reward); show('rule-custom-reward-field', reward && form.elements.namedItem('rewardId').value === '__custom__');
    form.elements.namedItem('customRewardId').required = reward && form.elements.namedItem('rewardId').value === '__custom__';
    show('rule-action-filter', ['charity', 'external', 'any'].includes(source));
    form.querySelector('[data-units-label]').textContent = type.value === 'cheer' ? 'Mindestens Bits pro Cheer' : type.value === 'gift_sub' ? 'Mindestens verschenkte Abos pro Paket' : 'Mindestens Einheiten pro Ereignis';
    form.querySelector('[data-units-help]').textContent = type.value === 'cheer' ? 'Jeder einzelne Cheer wird mit dieser Anzahl verglichen.' : type.value === 'gift_sub' ? 'Ein Geschenkpaket löst einmal aus. Einzelne Geschenk-Abos werden nicht zusätzlich gezählt.' : 'Vergleich mit units des externen Ereignisses.';
    $('#rule-source-description').textContent = source === 'charity' ? 'Eine Spende ab dem eingetragenen Netto-Betrag löst die Regel aus.' : source === 'twitch' ? type.value === 'subscription' ? 'Neue Abos, geteilte Resub-Nachrichten und Geschenk-Abos lösen dieselbe Regel aus. Geschenkpakete lösen einmal aus. Stille automatische Verlängerungen stellt Twitch nicht als Ereignis bereit.' : type.value === 'sub' ? 'Jedes neue, selbst bezahlte Abo löst einmal aus.' : type.value === 'resub' ? 'Löst aus, wenn ein Zuschauer seine Abo-Verlängerung als Resub-Mitteilung teilt.' : type.value === 'channel_points' ? 'Löst bei Einlösung der ausgewählten benutzerdefinierten Belohnung aus.' : 'Die Regel verarbeitet Ereignisse aus dem gewählten Twitch-Kanal.' : source === 'manual' ? 'Diese Regel wird über den lokalen Regeltest ausgelöst.' : 'Erweiterte Ereignisfilter für externe oder mehrere Quellen.';
    const key = source + '|' + type.value + '|' + form.elements.namedItem('twitchChannelId').value;
    if (form.dataset.triggerKey !== key) { form.dataset.triggerKey = key; if (reward) void this.loadRewards(form); }
  },
  async loadRewards(form) {
    const generation = form._rewardsGeneration = (form._rewardsGeneration || 0) + 1, room = S.rooms.active;
    const selectedChannel = form.elements.namedItem('twitchChannelId').value;
    const channels = (S.twitch.channels || []).filter(channel => channel.state === 'connected' && (!selectedChannel || channel.id === selectedChannel));
    const results = await Promise.allSettled(channels.map(async channel => ({ channel, ...(await api('twitch/rewards?channelId=' + encodeURIComponent(channel.id))) })));
    if (!form.isConnected || room !== S.rooms.active || generation !== form._rewardsGeneration) return;
    const rewards = results.filter(result => result.status === 'fulfilled').flatMap(result => result.value.rewards.map(reward => ({ ...reward, channel: result.value.channel.channelName })));
    const select = form.elements.namedItem('rewardId');
    const apply = () => {
      if (!form.isConnected || room !== S.rooms.active || generation !== form._rewardsGeneration) return;
      const selected = select.value;
      const choices = { '': 'Alle benutzerdefinierten Belohnungen', ...Object.fromEntries(rewards.map(reward => [reward.id, (reward.channel ? '@' + reward.channel + ' · ' : '') + reward.title + ' · ' + reward.cost + ' Punkte'])) };
      if (selected && selected !== '__custom__' && !Object.hasOwn(choices, selected)) choices[selected] = 'Gespeicherte Belohnung · ' + selected;
      choices.__custom__ = 'Belohnungs-ID selbst eintragen …'; select.innerHTML = options(choices, selected);
      $('#rule-rewards-help').textContent = rewards.length ? rewards.length + ' Belohnungen aus verbundenen Kanälen geladen.' : 'Für die Namensauswahl den passenden Twitch-Kanal verbinden. Eine eigene Belohnungs-ID kann auch direkt eingetragen werden.';
    };
    if (select === document.activeElement) select.addEventListener('blur', apply, { once: true }); else apply();
  },
  ruleVisibility(animate = true) {
    const form = $('#rule-form'); if (!form) return;
    this.triggerVisibility(animate && form.dataset.ready === 'true');
    const effect = form.elements.namedItem('effect').value, group = ['deathlink', 'message', 'alert'].includes(effect);
    const mixed = [...form.querySelectorAll('[name="randomEffects"]:checked')].map(e => e.value), has = action => effect === action || effect === 'random_action' && mixed.includes(action);
    const target = form.elements.namedItem('target');
    if (group) target.value = 'group'; else if (target.value === 'group') target.value = 'random';
    const groupOption = [...target.options].find(o => o.value === 'group'); groupOption.hidden = !group;
    this.reveal($('#rule-selected-targets'), !group && ['selected', 'random_selected'].includes(target.value), animate);
    for (const id of ['rule-game-field', 'rule-target-field']) this.reveal($('#' + id), !group, animate);
    this.reveal($('#rule-quantity-field'), !group && !['hint', 'random_hint'].includes(effect), animate);
    this.reveal($('#rule-action-mix'), effect === 'random_action', animate);
    this.reveal($('#rule-item-field'), has('item') || has('hint'), animate);
    this.reveal($('#rule-pool-field'), has('random_choice'), animate);
    this.reveal($('#rule-message-field'), has('message') || has('alert'), animate);
    form.elements.namedItem('item').required = has('item') || has('hint');
    form.elements.namedItem('message').required = has('message');
    const descriptions = {
      random_trap: 'Wählt für jeden getroffenen Spieler zufällig ein erlaubtes Item, das bei ihm als Falle markiert ist.',
      random_nontrap: 'Wählt aus den erlaubten Items, die du nicht als Falle markiert hast. Die Markierung legst du unter Spieler & Effekte fest; die Bridge kann nicht jedes Item automatisch als gut oder schlecht erkennen.',
      random_item: 'Wählt aus allen erlaubten Items des getroffenen Spielers. Fallen können dabei sein.',
      random_choice: 'Wählt aus deiner unten eingetragenen Itemliste. Erlaubte Items und der Raumkatalog des jeweiligen Spielers begrenzen die Auswahl.',
      item: 'Sendet das gewählte zusätzliche Item an die unten festgelegten Spieler. Itemnamen stammen aus eurem verbundenen AP-Raum.',
      random_hint: 'Wählt für jeden getroffenen Spieler zufällig ein Item aus dessen erlaubtem Pool und fordert dazu einen kostenlosen AP-Admin-Hinweis an. Der Hinweis erscheint bei dessen AP-Team; es wird kein Item verschickt. Pro Spieler wird ein Hinweis angefordert.',
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
  apLogin(mode) {
    const form = $('#ap-form'), slot = form.elements.namedItem('slotName');
    if (mode === 'admin') { form.dataset.playerSlot = slot.value === 'ADMIN' ? form.dataset.playerSlot || '' : slot.value; slot.value = 'ADMIN'; slot.readOnly = true; }
    else { slot.readOnly = false; slot.value = form.dataset.playerSlot || (S.config.ap.loginMode === 'slot' ? S.config.ap.slotName : ''); slot.focus(); }
  },
  async click(action, id, button) {
    if (action === 'studio-twitch-add') return this.twitchAdd();
    if (action === 'studio-twitch-auth') return this.authorizeTwitch(document.getElementById('studio-twitch-form-' + id));
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
    if (action === 'studio-yaml-remove') return this.removeYamlDrawer();
    if (action === 'studio-game') return this.openGame(id);
    if (action === 'studio-use-players') { const form = $('#studio-yaml-form'); form.elements.namedItem('playerNames').value = (S.playerProfiles || []).filter(p => !p.game || p.game === this.entry.game).map(p => p.name).join('\n'); return; }
    if (action === 'studio-all-items') { approvalEditor.catalog.items.forEach(i => approvalEditor.items.add(i)); return renderItemList(); }
    button.disabled = true;
    button.dataset.busy = 'true';
    try {
      if (action === 'studio-admin-yaml') {
        const response = await fetch('/api/ap/admin-yaml');
        if (!response.ok) throw new Error((await response.json()).error);
        this.download(await response.blob(), 'ADMIN.yaml');
      }
      else if (action === 'studio-twitch-connect') { await api('twitch/connect', { channelId: id }); await refresh(true); }
      else if (action === 'studio-twitch-disconnect') { await api('twitch/disconnect', { channelId: id }); await refresh(true); }
      else if (action === 'studio-twitch-forget') { await api('credentials/forget', { source: 'twitch', channelId: id }); await refresh(true); }
      else if (action === 'studio-twitch-remove') { await api('twitch/channel/delete', { channelId: id }); await refresh(true); }
      else if (action === 'studio-room-open') { await api('rooms/activate', { id }); this.logGame = ''; this.entry = null; this.loadingGame = ''; await refresh(true); }
      else if (action === 'studio-room-archive' || action === 'studio-room-restore') { await api('rooms/archive', { id, archived: action === 'studio-room-archive' }); this.entry = null; this.loadingGame = ''; this.logGame = ''; await refresh(true); }
      else if (action === 'studio-forget-ap' || action === 'studio-forget-twitch') { await api('credentials/forget', { source: action.endsWith('-ap') ? 'ap' : 'twitch' }); await refresh(true); }
      else if (action === 'studio-yaml-save') { await api('yaml/preset', this.yamlData()); await refresh(); $('[data-studio-message]').textContent = 'Einstellungen in diesem Raum gespeichert.'; }
      else if (action === 'studio-yaml-preview') { const result = await api('yaml/generate', this.yamlData()); const pre = $('#studio-yaml-preview'); pre.textContent = result.files.map(f => '# Datei: ' + f.name + '\n' + f.content).join('\n'); pre.classList.remove('hidden'); }
    } finally { button.disabled = false; delete button.dataset.busy; }
  },
  async submit(form) {
    const id = form.getAttribute('id'), data = new FormData(form);
    if (id === 'studio-twitch-add-form') { await this.authorizeTwitch(form); }
    else if (form.hasAttribute('data-twitch-channel')) {
      const saved = await this.saveTwitchChannel(form); if (saved.token) await api('twitch/connect', { channelId: saved.id, token: saved.token });
      await refresh(true); toast('Twitch-Kanal gespeichert.');
    } else if (id === 'studio-room-delete-form') {
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
        const yaml = /\.ya?ml$/i.test(file.name), limit = yaml ? S.gameLibrary?.importLimits?.maxYamlBytes || 2 * 1024 * 1024 : S.gameLibrary?.importLimits?.maxArchiveBytes || 128 * 1024 * 1024;
        if (file.size > limit) { errors.push(file.name + ': Maximal ' + limit / 1024 ** 2 + ' MiB pro ' + (yaml ? 'YAML' : 'APworld') + '.'); continue; }
        $('#studio-import-progress').textContent = file.name + ' wird eingelesen …';
        try {
          if (yaml) { const result = await api('yaml/import', { name: file.name, content: await file.text() }); games.push(...result.games); continue; }
          const bytes = new Uint8Array(await file.arrayBuffer()); let binary = '';
          for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
          const result = await api('worlds/upload', { name: file.name, content: btoa(binary) }); games.push(...result.games);
        } catch (e) { errors.push(file.name + ': ' + e.message); }
      }
      this.entry = null; this.loadingGame = ''; await refresh(true);
      if (errors.length) { $('#studio-import-progress').textContent = games.length + ' Spiele eingelesen.'; throw new Error(errors.join('\n')); }
      $('#drawer').close(); toast(games.length + ' Spiele eingelesen.');
    } else if (id === 'studio-yaml-remove-form') {
      await api('yaml/remove', { sourceId: data.get('sourceId') }); $('#drawer').close(); this.entry = null; this.loadingGame = ''; this.loadRequest = (this.loadRequest || 0) + 1; location.hash = 'katalog'; await refresh(true);
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
