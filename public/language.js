'use strict';
const HelpText = {
  records: new WeakMap(), current: null, serial: 0, applied: -1,
  get language() { return S?.language || 'de'; },
  get idle() { return !this.current || this.current.language === 'en' || !this.record(this.current.entry).loading; },
  record(entry) { if (!this.records.has(entry)) this.records.set(entry, { options: new Map(), loading: false, error: '', revision: 0 }); return this.records.get(entry); },
  option(entry, index) { return this.language === 'de' ? this.record(entry).options.get(index) : undefined; },
  settings() {
    return `<section class="panel panel-pad section-gap"><h2>Sprache der Spieleinstellungen</h2><p class="help">Beschreibungen und Überschriften im YAML-Editor auf Deutsch lesen oder die Originaltexte verwenden. Gilt für alle Räume und auch für neu importierte YAMLs und APworlds.</p><form id="language-form"><div class="form-grid narrow"><label>Sprache<select name="language">${options({ de: 'Deutsch', en: 'English · Originaltexte' }, this.language)}</select></label></div><p class="help">Die automatische Übersetzung läuft lokal auf deinem PC. YAML-Schlüssel, eingestellte Werte und die erzeugten Dateien werden nicht übersetzt. Den Originaltext kannst du bei jeder Einstellung aufklappen.</p>${S.translation?.installed === false ? '<p class="connection-error">Das Übersetzungsmodell fehlt. Installiere das vollständige Release-Paket, um alle Beschreibungen auf Deutsch zu lesen.</p>' : ''}<button type="submit" class="section-gap">Sprache speichern</button><p class="help" data-form-error role="alert"></p></form></section>`;
  },
  bar() { return `<div class="help-language-bar"><div><b>Beschreibungen & Hilfetexte</b><p class="help" id="help-language-status" role="status" aria-live="polite"></p></div><div class="button-row"><button type="button" class="small ghost" data-action="help-retry" hidden>Übersetzung erneut laden</button><a class="text-link tiny" href="#einrichtung">Sprache ändern</a></div></div>`; },
  original(option, index) {
    return `<details class="disclosure option-original" data-help-original="${index}" ${this.language === 'en' ? 'hidden' : ''}><summary>Originaltext anzeigen</summary><div class="help" lang="en"><b>${esc(option.label)}</b>${option.description ? `<p>${esc(option.description)}</p>` : ''}${(option.listChoices || []).filter(choice => choice.description).map(choice => `<p><b>${esc(choice.label)}</b><br>${esc(choice.description)}</p>`).join('')}</div></details>`;
  },
  sync() {
    if (!document?.documentElement) { this.current?.controller.abort(); this.current = null; return; }
    let game; try { game = currentPage.startsWith('spiel/') ? decodeURIComponent(currentPage.slice(6)) : ''; } catch { game = ''; }
    const entry = Studio.entry;
    if (!game || !entry || game !== entry.game) { if (this.current) { this.current.controller.abort(); this.record(this.current.entry).loading = false; this.current = null; } return; }
    const same = this.current?.entry === entry && this.current.room === S.rooms.active && this.current.language === this.language;
    if (!same) {
      if (this.current) { this.current.controller.abort(); this.record(this.current.entry).loading = false; }
      this.current = { entry, room: S.rooms.active, language: this.language, token: ++this.serial, controller: new AbortController() }; this.applied = -1;
      if (this.language === 'de' && !this.record(entry).error) void this.load(this.current);
    }
    const record = this.record(entry), revision = LiveUI.revision + ':' + record.revision + ':' + this.language;
    if (this.applied !== revision) { this.applied = revision; this.apply(entry); }
  },
  valid(context) { return document?.documentElement && this.current === context && !context.controller.signal.aborted && S.rooms.active === context.room && this.language === context.language; },
  async load(context) {
    const record = this.record(context.entry); record.loading = true; record.error = ''; record.revision++;
    try {
      const indices = context.entry.options.map((_, index) => index).filter(index => !record.options.has(index));
      for (let offset = 0; offset < indices.length && this.valid(context); offset += 16) {
        const response = await fetch('/api/game-help', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-Session': S.session }, body: JSON.stringify({ game: context.entry.game, sourceId: context.entry.sourceId, revision: context.entry.helpRevision, language: 'de', indices: indices.slice(offset, offset + 16) }), signal: context.controller.signal });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Die Übersetzung konnte nicht geladen werden.');
        if (!this.valid(context) || result.revision !== context.entry.helpRevision || result.language !== 'de') return;
        for (const option of result.options) if (context.entry.options[option.index]?.key === option.key) record.options.set(option.index, option);
        // Reconcile the new display text now, while the translation changes.
        // This also advances LiveUI's desired-HTML cache, so the next unchanged
        // server snapshot cannot strip and reapply the translated help nodes.
        record.revision++; render();
      }
    } catch (error) { if (this.valid(context) && error.name !== 'AbortError') record.error = error.message; }
    finally { if (this.current === context) { record.loading = false; record.revision++; this.sync(); } }
  },
  apply(entry) {
    const record = this.record(entry), german = this.language === 'de';
    for (let index = 0; index < entry.options.length; index++) {
      const original = entry.options[index], translated = this.option(entry, index), title = translated?.label || original.label, description = translated?.description ?? original.description ?? '';
      const field = document.querySelector(`[data-option-index="${index}"]`); if (!field) continue;
      setText(field.querySelector('[data-help-label]'), title);
      const label = field.querySelector('[data-help-label]'); if (label && label.title !== description) label.title = description;
      const help = field.querySelector('[data-help-description]'); setText(help, description);
      if (help && help.lang !== (german && translated ? 'de' : 'en')) help.lang = german && translated ? 'de' : 'en';
      const details = field.querySelector('[data-help-original]'); if (details && details.hidden !== !german) details.hidden = !german;
      field.querySelectorAll('[data-help-list-description]').forEach(element => { const value = translated?.listDescriptions?.[Number(element.dataset.helpListDescription)] ?? original.listChoices[Number(element.dataset.helpListDescription)].description; setText(element, value); });
      const search = [original.key, original.label, original.description || '', title, description].join(' ').toLowerCase();
      if (field.dataset.helpSearch !== search) field.dataset.helpSearch = search;
    }
    const status = !german ? 'English · Originaltexte' : record.error ? 'Übersetzung nicht verfügbar: ' + record.error + ' Die Originaltexte bleiben sichtbar.' : record.loading ? `Deutsch · lokale Übersetzung läuft (${record.options.size}/${entry.options.length})` : 'Deutsch · automatisch übersetzt, Originaltexte aufklappbar';
    setText($('#help-language-status'), status);
    const retry = document.querySelector('[data-action="help-retry"]'); if (retry && retry.hidden !== (!german || !record.error)) retry.hidden = !german || !record.error;
    this.filter();
  },
  filter(explicit = false) {
    const input = $('#studio-option-search'); if (!input) return;
    const query = input.value.toLowerCase();
    document.querySelectorAll('[data-option-search]').forEach(field => { const hidden = !(field.dataset.optionSearch + ' ' + (field.dataset.helpSearch || '')).includes(query); if (field.classList.contains('hidden') !== hidden) field.classList.toggle('hidden', hidden); });
    const common = $('.studio-common'); if (common && (query || explicit)) { const open = Boolean(query && common.querySelector('[data-option-search]:not(.hidden)')); if (common.open !== open) common.open = open; }
  },
  retry() { if (!this.current) return; this.record(this.current.entry).error = ''; this.current.controller.abort(); this.current = null; this.sync(); },
  async submit(form) { await api('language', { language: new FormData(form).get('language') }); await refresh(true); toast('Sprache der Spielbeschreibungen gespeichert.'); },
};
