'use strict';
const Appearance = {
  defaults: { mode: 'dark', accent: '#a3bffa', motion: true }, draft: null,
  presets: { '#a3bffa': 'Blau', '#fb7185': 'Rot', '#c8eea1': 'Grün', '#f7c66b': 'Gold', '#c2a3ff': 'Violett', '#66d6d0': 'Türkis' },
  rgb(hex) { return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); },
  hex(rgb) { return '#' + rgb.map(n => Math.round(n).toString(16).padStart(2, '0')).join(''); },
  mix(a, b, part) { return this.hex(this.rgb(a).map((n, i) => n * part + this.rgb(b)[i] * (1 - part))); },
  luminance(hex) { return this.rgb(hex).map(n => { const c = n / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0); },
  contrast(a, b) { const x = this.luminance(a), y = this.luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); },
  readable(color, background) {
    const toward = this.luminance(background) > .4 ? '#111111' : '#ffffff';
    for (let p = 0; p <= 1; p += .025) { const candidate = this.mix(toward, color, p); if (this.contrast(candidate, background) >= 4.5) return candidate; }
    return toward;
  },
  palette(value) {
    const light = value.mode === 'light', classic = value.mode === 'classic', accent = value.accent;
    const tint = (color, part) => classic ? this.mix(accent, color, part) : color;
    const bg = light ? '#f3f4f7' : tint('#101216', .035), panel = light ? '#ffffff' : tint('#191c22', .055);
    return { bg, panel, panel2: light ? '#f7f8fb' : tint('#22262e', .065), line: light ? '#d9dce5' : tint('#343a45', .07), text: light ? '#202532' : '#f0f2f7', muted: light ? '#545d6e' : '#a7afbd', accent,
      'on-accent': this.contrast(accent, '#000000') >= this.contrast(accent, '#ffffff') ? '#000000' : '#ffffff',
      'accent-text': this.readable(accent, light ? bg : panel), 'accent-soft': this.mix(accent, panel, light ? .14 : .11), 'accent-border': this.mix(accent, panel, .38),
      field: light ? '#ffffff' : tint('#11151b', .035), sidebar: light ? '#fbfcfe' : tint('#13161c', .045),
      success: light ? '#14643c' : '#95e3b1', 'success-bg': light ? '#e8f5ec' : '#183025',
      danger: light ? '#a42d24' : '#ffb2a2', 'danger-bg': light ? '#fff0ec' : '#38251f',
      orange: light ? '#79500a' : '#f4cd8c', 'warn-bg': light ? '#fff5df' : '#332a1b',
    };
  },
  apply(raw, persist = true) {
    const value = { ...this.defaults, ...raw };
    if (!['dark', 'light', 'classic'].includes(value.mode) || !/^#[a-f0-9]{6}$/i.test(value.accent)) return;
    const signature = JSON.stringify(value);
    if (persist && signature !== this.persisted) try { localStorage.setItem('ap-bridge-appearance', signature); this.persisted = signature; } catch {}
    if (signature === this.applied) return; this.applied = signature;
    const element = document.documentElement; element.dataset.theme = value.mode; element.dataset.motion = value.motion ? 'on' : 'off';
    element.style.colorScheme = value.mode === 'light' ? 'light' : 'dark';
    for (const [key, color] of Object.entries(this.palette(value))) element.style.setProperty('--' + key, color);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', this.palette(value).bg);
    window.chrome?.webview?.postMessage({ type: 'appearance', background: this.palette(value).bg });
  },
  sync(value) { this.apply(this.draft && currentPage === 'design' ? this.draft : value); },
  page() {
    const value = this.draft || S.appearance || this.defaults;
    return pageHead('DEIN WORKSPACE', 'Design', 'Wähle die Oberfläche, in der du dich wohlfühlst. Dein Design gilt für alle Räume.')
      + `<form id="appearance-form"><section class="panel panel-pad"><h2>Oberfläche</h2><p class="help">Neutraler Darkmode, klarer Lightmode oder der bisherige farbig getönte Look.</p><div class="theme-options section-gap">${Object.entries({ dark: ['Dark', 'Neutral und zurückhaltend'], light: ['Light', 'Hell und kontrastreich'], classic: ['Getönt', 'Der bisherige Look in deiner Farbe'] }).map(([key, [title, description]]) => `<button type="button" class="theme-card ${value.mode === key ? 'selected' : ''}" data-action="appearance-mode" data-id="${key}" aria-pressed="${value.mode === key}"><span class="theme-sample sample-${key}"><i></i><i></i><i></i></span><b>${title}</b><span>${description}</span></button>`).join('')}</div><input type="hidden" name="mode" value="${value.mode}"><hr class="line"><h2>Akzentfarbe</h2><p class="help">Die Farbe verändert Buttons und Hervorhebungen. Im getönten Look färbt sie auch die Flächen dezent ein.</p><div class="accent-options section-gap">${Object.entries(this.presets).map(([color, name]) => `<button type="button" class="accent-option accent-${name.toLowerCase()} ${value.accent === color ? 'selected' : ''}" data-action="appearance-accent" data-id="${color}" aria-label="Akzentfarbe ${name}" aria-pressed="${value.accent === color}"><span></span>${name}</button>`).join('')}</div><div class="form-grid"><label>Eigene Farbe<input name="accent" type="color" value="${esc(value.accent)}"></label><div><span class="help">Vorschau</span><div class="button-row section-gap"><button type="button" class="primary" disabled>Primärer Button</button><span class="badge good">Verbunden</span><span class="badge warn">Pausiert</span></div></div></div><label class="check-label"><input type="checkbox" name="motion" ${value.motion ? 'checked' : ''}><span>Dezente Animationen und Übergänge</span></label><p class="help">Die Systemeinstellung für reduzierte Bewegung wird berücksichtigt. Statusfarben bleiben unabhängig von deiner Akzentfarbe erkennbar.</p><div class="button-row section-gap"><button class="primary" type="submit">Design speichern</button><button class="ghost" type="button" data-action="appearance-original">Bisheriges Grün</button><button class="ghost" type="button" data-action="appearance-reset">Zurücksetzen</button></div><p class="help" role="status" id="appearance-status">Änderungen werden sofort als Vorschau gezeigt. „Design speichern“ übernimmt sie dauerhaft.</p></section></form>`;
  },
  read() { const form = document.querySelector('#appearance-form'); return form ? { mode: form.elements.namedItem('mode').value, accent: form.elements.namedItem('accent').value, motion: form.elements.namedItem('motion').checked } : { ...S.appearance }; },
  async click(action, id) {
    if (action === 'appearance-toggle') { await api('appearance', { ...S.appearance, mode: S.appearance?.mode === 'light' ? 'dark' : 'light' }); this.draft = null; await refresh(true); return; }
    this.draft = this.read();
    if (action === 'appearance-mode') this.draft.mode = id;
    if (action === 'appearance-accent') this.draft.accent = id;
    if (action === 'appearance-original') this.draft = { mode: 'classic', accent: '#c8eea1', motion: true };
    if (action === 'appearance-reset') this.draft = { ...this.defaults };
    this.apply(this.draft, false); render(true);
  },
  async submit() { await api('appearance', this.read()); this.draft = null; await refresh(true); toast('Design gespeichert.'); },
};
try { Appearance.apply(JSON.parse(localStorage.getItem('ap-bridge-appearance') || 'null') || Appearance.defaults); } catch { Appearance.apply(Appearance.defaults); }
