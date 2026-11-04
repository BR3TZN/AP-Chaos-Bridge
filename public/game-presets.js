'use strict';
const GamePresetUI = {
  contextKey: '', selected: '', message: '',
  key(entry) { return [S.rooms.active, entry.game, entry.sourceId, entry.presetRevision].join('|'); },
  list() { return (S.gamePresets || []).filter(preset => preset.game === Studio.entry?.game); },
  compatible(preset) { return preset?.sourceRevision === Studio.entry?.presetRevision; },
  current() { return this.list().find(preset => preset.id === this.selected); },
  optionHTML(presets = this.list()) { return '<option value="">Preset auswählen …</option>' + presets.map(preset => `<option value="${esc(preset.id)}" ${preset.id === this.selected ? 'selected' : ''}>${esc(preset.name)}${this.compatible(preset) ? '' : ' · andere Quelle / Version'}</option>`).join(''); },
  panel(entry) {
    const key = this.key(entry); if (key !== this.contextKey) { this.contextKey = key; this.selected = ''; this.message = ''; }
    return `<section class="panel panel-pad section-gap" id="game-presets-panel"><h2>Spiel-Presets · für alle Räume</h2><p class="help">Spieleinstellungen benennen und in jedem Raum wieder laden. Eure Spielernamen bleiben beim Laden erhalten.</p><label class="section-gap">Gespeichertes Preset<select id="game-preset-select">${this.optionHTML()}</select></label><div class="button-row section-gap"><button type="button" data-action="game-preset-load" disabled>Preset laden</button><button type="button" data-action="game-preset-new">Als neues Preset speichern</button><button type="button" class="ghost" data-action="game-preset-update" disabled>Preset aktualisieren</button><button type="button" class="ghost" data-action="game-preset-delete" disabled>Preset löschen</button></div><p class="help" id="game-preset-status" role="status"></p></section>`;
  },
  sync() {
    const panel = document.querySelector('#game-presets-panel'); if (!panel || !Studio.entry || this.contextKey !== this.key(Studio.entry)) return;
    const select = panel.querySelector('#game-preset-select'), presets = this.list();
    if (this.selected && !presets.some(preset => preset.id === this.selected)) this.selected = '';
    const html = this.optionHTML(presets);
    if (select !== document.activeElement && select._presetOptions !== html) { select.innerHTML = html; select._presetOptions = html; }
    if (select !== document.activeElement && select.value !== this.selected) select.value = this.selected;
    const selected = this.current();
    for (const action of ['load', 'update', 'delete']) { const button = panel.querySelector('[data-action="game-preset-' + action + '"]'); const disabled = !selected || action !== 'delete' && !this.compatible(selected); if (button.dataset.busy !== 'true' && button.disabled !== disabled) button.disabled = disabled; }
    setText(panel.querySelector('#game-preset-status'), this.message || (selected && !this.compatible(selected) ? 'Dieses Preset verwendet eine andere Einstellungsquelle oder World-Version. Die passende Quelle wählen.' : presets.length ? 'Laden übernimmt die Einstellungen in den Editor. „Einstellungen speichern“ behält sie zusätzlich in diesem Raum.' : 'Noch keine Spiel-Presets gespeichert.'));
  },
  changed(select) { this.selected = select.value; this.message = ''; this.sync(); },
  context() {
    const entry = Studio.entry, form = document.querySelector('#studio-yaml-form'); if (!entry || !form) throw new Error('Zuerst eine Spielseite öffnen.');
    return { entry, form, room: S.rooms.active, key: this.key(entry), signature: LiveUI.signature(form) };
  },
  valid(context) { return document.querySelector('#studio-yaml-form') === context.form && Studio.entry === context.entry && this.key(Studio.entry) === context.key; },
  payload(context) { return { roomId: context.room, game: context.entry.game, sourceId: context.entry.sourceId, sourceRevision: context.entry.presetRevision }; },
  saveDrawer(update) {
    const context = this.context(), selected = update ? this.current() : null;
    if (update && (!selected || !this.compatible(selected))) throw new Error('Ein passendes Spiel-Preset auswählen.');
    const { values, extra } = Studio.yamlData(); this.saving = { context, values, extra, selected };
    showDrawer(drawerHead(update ? 'Spiel-Preset aktualisieren' : 'Spiel-Preset speichern', context.entry.game + ' · in allen Räumen verfügbar') + `<form id="game-preset-save-form"><div class="drawer-body"><label>Presetname<input name="presetName" required maxlength="100" autocomplete="off" value="${esc(selected?.name || '')}" placeholder="Charity-Run · entspannt"></label><p class="help section-gap">Speichert die aktuellen Spieleinstellungen und Zusatzoptionen. Beim späteren Laden bleiben die Spielernamen des Zielraums erhalten.</p>${selected ? '<p class="help">Die gespeicherten Einstellungen dieses Presets werden ersetzt.</p>' : ''}</div><div class="drawer-foot"><button type="button" class="ghost" data-action="close-drawer">Abbrechen</button><button type="submit" class="primary">Preset speichern</button></div></form>`);
  },
  async click(action, button) {
    if (action === 'game-preset-new' || action === 'game-preset-update') return this.saveDrawer(action === 'game-preset-update');
    const selected = this.current(); if (!selected) throw new Error('Ein Spiel-Preset auswählen.');
    if (action === 'game-preset-delete') {
      this.deleting = selected;
      showDrawer(drawerHead('Spiel-Preset löschen', selected.name) + `<form id="game-preset-delete-form"><div class="drawer-body"><p>„${esc(selected.name)}“ für ${esc(selected.game)} aus den gemeinsamen Presets löschen?</p><p class="help">Bereits in Räumen gespeicherte Einstellungen bleiben erhalten.</p></div><div class="drawer-foot"><button type="button" class="ghost" data-action="close-drawer">Abbrechen</button><button type="submit" class="danger">Preset löschen</button></div></form>`); return;
    }
    if (!this.compatible(selected)) throw new Error('Die passende Einstellungsquelle oder World-Version wählen.');
    const context = this.context(); button.disabled = true; button.dataset.busy = 'true';
    try {
      const preset = await api('game-presets/load', { ...this.payload(context), id: selected.id });
      if (!this.valid(context)) return;
      if (LiveUI.signature(context.form) !== context.signature) throw new Error('Der Entwurf wurde während des Ladens verändert. Preset erneut laden.');
      for (let index = 0; index < context.entry.options.length; index++) {
        const source = document.createElement('div'); source.innerHTML = Studio.field(context.entry.options[index], index, preset.values);
        LiveUI.patch(context.form.querySelector('[data-option-index="' + index + '"]'), source.firstElementChild, true);
      }
      context.form.elements.namedItem('extra').value = preset.extra;
      this.message = '„' + preset.name + '“ geladen. Spielernamen bleiben erhalten; die Einstellungen sind noch nicht als Raumvorlage gespeichert.';
      HelpText.sync(); HelpText.filter(true); this.sync();
    } finally { button.disabled = false; delete button.dataset.busy; this.sync(); }
  },
  async submit(form) {
    if (form.getAttribute('id') === 'game-preset-delete-form') {
      const selected = this.deleting; if (!selected) throw new Error('Spiel-Preset erneut auswählen.');
      await api('game-presets/delete', { id: selected.id, game: selected.game, expectedRevision: selected.revision });
      if (document.querySelector('#game-preset-delete-form') === form) document.querySelector('#drawer').close();
      if (this.selected === selected.id) this.selected = ''; this.message = 'Spiel-Preset gelöscht.'; await refresh(); return;
    }
    const saving = this.saving; if (!saving || !this.valid(saving.context)) throw new Error('Raum oder Spiel wurde gewechselt. Preset erneut speichern.');
    const signature = LiveUI.signature(form), value = { ...this.payload(saving.context), name: form.elements.namedItem('presetName').value, values: saving.values, extra: saving.extra };
    if (saving.selected) { value.id = saving.selected.id; value.expectedRevision = saving.selected.revision; }
    const result = await api('game-presets/save', value);
    if (this.valid(saving.context)) { this.selected = result.id; this.message = 'Spiel-Preset für alle Räume gespeichert.'; }
    if (document.querySelector('#game-preset-save-form') === form && LiveUI.signature(form) === signature) document.querySelector('#drawer').close();
    await refresh();
  },
};
