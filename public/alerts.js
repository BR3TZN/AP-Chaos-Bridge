'use strict';
const Alerts = {
  page() {
    const a = S.config.alerts;
    return pageHead('OPTIONAL FÜR DEINEN STREAM', 'Stream-Alerts', 'Zeige eine kurze Animation, wenn eine Aktion ausgeführt wurde. Die Spielaktionen funktionieren auch ohne OBS.')
      + `<div class="grid alert-columns"><section class="panel panel-pad"><h2>So kommt der Alert in den Stream</h2><ol class="setup-steps"><li>In OBS eine <b>Browserquelle</b> hinzufügen.</li><li>Diese URL eintragen; Größe <b>1920 × 1080</b> verwenden.</li><li>„Alert testen“ zeigt die Vorschau, ohne etwas im Spiel auszulösen.</li></ol><pre>${esc(location.origin)}/overlay</pre><div class="button-row"><button data-action="copy-overlay">OBS-URL kopieren</button><button class="primary" data-action="alerts-test">Alert testen</button></div><p class="help">Die Quelle hat einen transparenten Hintergrund. OBS muss die Bridge auf diesem Computer erreichen können.</p><hr class="line"><h3>Vorschau</h3><div class="alert-preview"><iframe src="/overlay?embedded=1" title="Stream-Alert-Vorschau"></iframe></div><p class="help">Eine Vorschau erzeugt nur eine Anzeige, keine AP-Aktion. Die Reihenfolge mehrerer Alerts wird automatisch abgearbeitet.</p></section>
      <section class="panel panel-pad"><form id="alerts-form"><h2>Darstellung</h2><label class="check-label"><input name="enabled" type="checkbox" ${a.enabled ? 'checked' : ''}><span>Stream-Alerts anzeigen</span></label><div class="form-grid"><label>Anzeige<select name="layout">${options({ card: 'Karte mit Animation und Text', media: 'Freie Animation' }, a.layout)}</select></label><label>Einblenden<select name="animation">${options({ slide: 'Sanft einschieben', fade: 'Ein- und ausblenden', pop: 'Leicht vergrößern' }, a.animation)}</select></label><label>Position<select name="position">${options({ 'bottom-left': 'Unten links', 'bottom-right': 'Unten rechts', 'top-left': 'Oben links', 'top-right': 'Oben rechts', center: 'Mitte' }, a.position)}</select></label><label>Anzeigedauer (Sekunden)<input name="durationSec" type="number" min="2" max="30" step="0.5" value="${a.durationSec}"></label><label>Animationsgröße (Pixel)<input name="mediaSize" type="number" min="48" max="480" step="1" value="${a.mediaSize}"></label></div><label class="check-label"><input name="showText" type="checkbox" ${a.showText ? 'checked' : ''}><span>Aktion, Zuschauer und Empfänger als Text anzeigen</span></label><label class="check-label"><input name="showTests" type="checkbox" ${a.showTests ? 'checked' : ''}><span>Auch simulierte Spielaktionen anzeigen</span></label><div class="button-row section-gap"><button class="primary" type="submit">Alert-Einstellungen speichern</button></div><p class="help" data-form-error role="alert"></p></form><hr class="line"><h2>Deine Animation</h2><p class="help">Eigenes GIF, animiertes WebP/PNG oder Video hochladen. WebM und MP4 werden stumm abgespielt. Maximal 10 MiB.</p><form id="alerts-media-form"><label class="section-gap">Datei<input name="mediaFile" type="file" accept=".gif,.png,.apng,.webp,.webm,.mp4" required></label><div class="button-row section-gap"><button type="submit">Animation hochladen</button><button type="button" class="ghost" data-action="alerts-reset-media" ${a.media ? '' : 'disabled'}>Standardanimation</button></div><p class="help">${a.media ? 'Eigene Animation gespeichert. Sie bleibt beim Programmupdate erhalten.' : 'Aktuell: integrierte AP-Animation.'}</p><p class="help" data-form-error role="alert"></p></form></section></div>`;
  },
  read() {
    const form = document.querySelector('#alerts-form'), d = new FormData(form);
    return { enabled: d.has('enabled'), showTests: d.has('showTests'), showText: d.has('showText'), layout: d.get('layout'), animation: d.get('animation'), position: d.get('position'), durationSec: Number(d.get('durationSec')), mediaSize: Number(d.get('mediaSize')) };
  },
  async click(action) {
    if (action === 'alerts-test') { await api('alerts/preview', {}); toast('Alert-Vorschau ausgelöst. Kein Spieleingriff.'); return; }
    if (action === 'alerts-reset-media') { await api('config', { alerts: { media: '' } }); await refresh(true); toast('Standardanimation ausgewählt.'); }
  },
  async submit(form) {
    if (form.getAttribute('id') === 'alerts-media-form') {
      const file = form.elements.namedItem('mediaFile').files[0]; if (!file || file.size > 10 * 1024 * 1024) throw new Error('Datei mit höchstens 10 MiB auswählen.');
      const content = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
      const uploaded = await api('alerts/media', { content }); await api('config', { alerts: { media: uploaded.name } });
    } else await api('config', { alerts: this.read() });
    await refresh(true); toast('Alert-Einstellungen gespeichert.');
  },
};
