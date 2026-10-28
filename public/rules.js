'use strict';
const RuleTools = {
  preview: null, generation: 0,
  toolbar() { return `<button class="ghost" data-action="rules-import">Importieren / Raum kopieren</button><button class="ghost" data-action="rules-export" ${S.rules.length ? '' : 'disabled'}>JSON exportieren</button><button class="ghost" data-action="rules-preset" ${S.rules.length ? '' : 'disabled'}>Als Vorlage speichern</button>`; },
  reset() { this.generation++; this.preview = null; },
  choices() { return S.rules.map(rule => `<label class="check-label"><input type="checkbox" name="ids" value="${esc(rule.id)}" checked><span>${esc(rule.name)}<span class="help">${esc(sourceNames[rule.source])} · ${esc(typeNames[rule.type])} → ${esc(effectNames[rule.effect])}</span></span></label>`).join(''); },
  exportDrawer(preset) {
    showDrawer(drawerHead(preset ? 'Regeln als Vorlage speichern' : 'Regeln exportieren', preset ? 'Vorlagen stehen in allen deinen Bridge-Räumen zur Verfügung.' : 'Speichert nur die ausgewählten Regeln mit ihren Zuordnungen als JSON-Datei.') + `<form id="rules-${preset ? 'preset' : 'export'}-form"><div class="drawer-body">${preset ? '<label>Vorlagenname<input name="name" required maxlength="100" placeholder="Charity · gemeinsame Regeln"></label>' : ''}<fieldset class="event-selection"><legend>Regeln auswählen</legend>${this.choices()}</fieldset><p class="help">Verbindungen, Passwörter und Slot-Freigaben werden nicht übertragen.</p></div><div class="drawer-foot"><button type="button" class="ghost" data-action="close-drawer">Abbrechen</button><button type="submit" class="primary">${preset ? 'Vorlage speichern' : 'JSON herunterladen'}</button></div></form>`);
  },
  async importDrawer() {
    this.reset(); const generation = this.generation, room = S.rooms.active;
    const catalog = await api('rules/library'); if (generation !== this.generation || room !== S.rooms.active) return;
    const rooms = catalog.rooms.filter(candidate => candidate.id !== room && candidate.count);
    showDrawer(drawerHead('Regeln übernehmen', 'Aus einem anderen Raum, einer gespeicherten Vorlage oder einer JSON-Datei übernehmen.') + `<form id="rules-import-form"><div class="drawer-body"><label>Quelle<select name="source"><optgroup label="Gespeicherte Vorlagen">${catalog.presets.map(preset => `<option value="preset:${esc(preset.id)}">${esc(preset.name)} · ${preset.count} Regeln</option>`).join('')}</optgroup><optgroup label="Andere Räume">${rooms.map(candidate => `<option value="room:${esc(candidate.id)}">${esc(candidate.name)}${candidate.archived ? ' (archiviert)' : ''} · ${candidate.count} Regeln</option>`).join('')}</optgroup><option value="file">JSON-Datei / eingefügter JSON-Inhalt</option></select></label><div id="rules-file-fields" class="section-gap"><label>Regeldatei<input name="file" type="file" accept=".json,application/json"></label><details class="disclosure"><summary>JSON direkt einfügen</summary><label class="section-gap">JSON-Inhalt<textarea name="json" rows="6" spellcheck="false"></textarea></label></details><p class="help">Regeldateien und bestehende Bridge-Konfigurationsexporte werden unterstützt. Es werden ausschließlich die Regeln übernommen. Maximal ${Math.round(catalog.maxImportBytes / 1024 ** 2)} MiB.</p></div><div class="button-row section-gap"><button type="button" data-action="rules-preview">Regeln anzeigen</button><button type="button" class="small ghost hidden" data-action="rules-preset-delete">Gewählte Vorlage löschen</button></div><div id="rules-import-preview" class="section-gap"></div><label class="section-gap">Im aktuellen Raum<select name="mode"><option value="add">Zu vorhandenen Regeln hinzufügen</option><option value="replace">Vorhandene Regeln ersetzen</option></select></label><p class="help">Alle übernommenen Regeln beginnen inaktiv. Fehlende Spieler- oder Kanalzuordnungen müssen vor dem Aktivieren geprüft werden. Beim Ersetzen wird die Ausführung pausiert.</p></div><div class="drawer-foot"><button type="button" class="ghost" data-action="close-drawer">Abbrechen</button><button type="submit" class="primary" disabled>Ausgewählte Regeln übernehmen</button></div></form>`);
    this.sourceChanged();
  },
  sourceChanged() {
    this.reset(); const form = $('#rules-import-form'); if (!form) return;
    Studio.reveal($('#rules-file-fields'), form.elements.namedItem('source').value === 'file', false);
    form.querySelector('[data-action="rules-preset-delete"]').classList.toggle('hidden', !form.elements.namedItem('source').value.startsWith('preset:'));
    $('#rules-import-preview').textContent = ''; form.querySelector('[type="submit"]').disabled = true;
  },
  async request(form) {
    const source = form.elements.namedItem('source').value, roomId = S.rooms.active;
    if (source.startsWith('room:')) return { sourceRoomId: source.slice(5), roomId };
    if (source.startsWith('preset:')) return { presetId: source.slice(7), roomId };
    const file = form.elements.namedItem('file').files[0]; let content = form.elements.namedItem('json').value.trim();
    if (file) {
      if (file.size > 32 * 1024 ** 2) throw new Error('Die Regeldatei darf höchstens 32 MiB groß sein.');
      content = file.text ? await file.text() : await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Die Regeldatei konnte nicht gelesen werden.')); reader.readAsText(file); });
    }
    if (!content) throw new Error('Eine JSON-Regeldatei auswählen oder JSON-Inhalt einfügen.');
    let bundle; try { bundle = JSON.parse(content); } catch { throw new Error('Die Regeldatei enthält kein gültiges JSON.'); }
    return { roomId, bundle };
  },
  async click(action, id, button) {
    if (action === 'rules-export' || action === 'rules-preset') return this.exportDrawer(action === 'rules-preset');
    if (action === 'rules-import') return this.importDrawer();
    const form = $('#rules-import-form'); if (!form) return;
    button.disabled = true;
    try {
      if (action === 'rules-preset-delete') {
        await api('rules/presets/delete', { id: form.elements.namedItem('source').value.slice(7) }); await this.importDrawer(); return;
      }
      if (action === 'rules-preview') {
        const generation = ++this.generation, room = S.rooms.active, request = await this.request(form);
        const result = await api('rules/preview', request);
        if (generation !== this.generation || room !== S.rooms.active || !form.isConnected || !$('#drawer').open) return;
        this.preview = { form, request: { roomId: request.roomId, bundle: result.bundle } };
        $('#rules-import-preview').innerHTML = `<fieldset class="event-selection"><legend>${result.plan.length} Regeln auswählen</legend>${result.plan.map(entry => `<label class="check-label"><input name="ids" type="checkbox" value="${esc(entry.sourceId)}" checked><span>${esc(entry.rule.name)}<span class="help">${esc(sourceNames[entry.rule.source])} · ${esc(typeNames[entry.rule.type])} → ${esc(effectNames[entry.rule.effect])}</span>${entry.notes.length ? `<span class="connection-error">${entry.notes.map(esc).join('<br>')}</span>` : '<span class="help">Zuordnungen können übernommen werden.</span>'}</span></label>`).join('')}</fieldset>`;
        form.querySelector('[type="submit"]').disabled = false;
      }
    } finally { button.disabled = false; }
  },
  async submit(form) {
    const data = new FormData(form), ids = data.getAll('ids'); if (!ids.length) throw new Error('Mindestens eine Regel auswählen.');
    if (form.getAttribute('id') === 'rules-export-form') {
      const bundle = await api('rules/export?ids=' + encodeURIComponent(ids.join(',')));
      Studio.download(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }), 'AP-Chaos-Bridge-Regeln.json');
    } else if (form.getAttribute('id') === 'rules-preset-form') {
      await api('rules/presets', { name: data.get('name'), roomId: S.rooms.active, ids }); toast('Regelvorlage für alle Räume gespeichert.');
    } else {
      if (this.preview?.form !== form) throw new Error('Zuerst „Regeln anzeigen“ wählen.');
      const result = await api('rules/import', { ...this.preview.request, ids, mode: data.get('mode') });
      toast(`${result.count} Regeln inaktiv übernommen.${result.reviewCount ? ' ' + result.reviewCount + ' Zuordnungen prüfen.' : ''}`);
    }
    $('#drawer').close(); this.reset(); await refresh(true);
  },
};
