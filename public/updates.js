'use strict';
const Updates = {
  restarting: false,
  panel() {
    const u = S.updates; if (!u) return '';
    return `<section class="panel panel-pad section-gap" id="update-panel"><div class="section-title"><div><h2>Programmupdates</h2><p class="help">Installiert: <b>${esc(u.currentVersion)}</b> · Quelle: <a class="text-link" href="https://github.com/${esc(u.repository)}/releases" target="_blank" rel="noreferrer">GitHub-Releases</a></p></div><span id="update-version" class="badge"></span></div><div id="update-status" role="status" aria-live="polite"></div><progress id="update-progress" max="100" value="0" hidden aria-label="Update-Fortschritt"></progress><div class="button-row section-gap"><button data-action="update-check">Nach Updates suchen</button><button data-action="update-download" class="primary" hidden>Update herunterladen</button><button data-action="update-install" class="primary" hidden>Installieren & neu starten</button></div><p class="help">Dieses Projekt ist öffentlich. Updates benötigen keinen GitHub-Token.</p><p class="help">Die Installation pausiert die Ausführung und startet die Bridge neu. Räume, Regeln, gespeicherte Verbindungen und eigene APworlds bleiben erhalten. Sicherungen liegen unter <code>data/updates/backups</code>.</p><details class="disclosure"><summary>GitHub-Zugang für private Repositories</summary><form id="update-token-form" class="section-gap"><label>GitHub-Token<input name="token" type="password" autocomplete="off" maxlength="2000" value="${u.hasToken ? '••••••••' : ''}" placeholder="Für öffentliche Repositories nicht erforderlich"></label><p class="help">Einen Fine-grained Token für <code>${esc(u.repository)}</code> mit <b>Contents: Read-only</b> verwenden. Er wird lokal verschlüsselt gespeichert und nicht exportiert. <a class="text-link" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">Token erstellen</a></p><div class="button-row"><button type="submit">Zugang speichern</button><button type="button" class="ghost" data-action="update-forget-token">Zugang entfernen</button></div><p class="help" data-form-error role="alert"></p></form></details><p id="update-result" class="help"></p></section>`;
  },
  sync() {
    const u = S?.updates, panel = $('#update-panel'); if (!u) return;
    const link = document.querySelector('[data-update-link]'); if (link) link.textContent = u.available ? 'Update ' + u.latestVersion + ' verfügbar' : 'Programmupdates';
    if (!panel) return;
    const busy = ['checking', 'downloading', 'extracting', 'verifying', 'installing'].includes(u.phase) || this.restarting;
    $('#update-status').textContent = u.message; $('#update-status').className = u.phase === 'error' ? 'connection-error' : 'help';
    $('#update-version').textContent = u.latestVersion ? 'Release ' + u.latestVersion : 'Noch nicht geprüft';
    for (const action of ['check', 'download', 'install', 'forget-token']) panel.querySelector(`[data-action="update-${action}"]`).disabled = busy;
    panel.querySelector('[data-action="update-download"]').hidden = !u.available || u.phase === 'ready' || u.phase === 'installing';
    const install = panel.querySelector('[data-action="update-install"]'); install.hidden = u.phase !== 'ready'; install.disabled = busy || !u.installSupported;
    const progress = $('#update-progress'); progress.hidden = !['downloading', 'extracting', 'verifying'].includes(u.phase);
    if (u.phase === 'downloading' && u.total) { progress.value = Math.min(100, u.downloaded / u.total * 100); progress.max = 100; } else progress.removeAttribute('value');
    $('#update-result').textContent = u.lastResult ? u.lastResult.message + (u.lastResult.backup ? ' Sicherung: ' + u.lastResult.backup : '') : '';
    panel.querySelector('#update-token-form [type="submit"]').disabled = busy;
  },
  async click(action, button) {
    button.disabled = true;
    try {
      if (action === 'update-check') await api('updates/check', {});
      if (action === 'update-download') await api('updates/download', {});
      if (action === 'update-forget-token') { await api('updates/token', { token: '' }); toast('GitHub-Zugang entfernt.'); }
      if (action === 'update-install') { const status = await api('updates/install', {}); this.restarting = true; S.updates = status; this.sync(); this.waitForRestart(status.latestVersion); return; }
      await refresh(action === 'update-forget-token'); this.sync();
    } catch (error) { toast(error.message, true); await refresh(); this.sync(); }
    finally { if (!this.restarting) button.disabled = false; }
  },
  async submit(form) { await api('updates/token', { token: new FormData(form).get('token') }); toast('GitHub-Zugang gespeichert.'); await refresh(true); },
  waitForRestart(expected) {
    let attempts = 0, sawOffline = false;
    const poll = async () => {
      try { const state = await api('state'); if (state.version === expected || (state.updates?.lastResult?.phase === 'error' && (sawOffline || state.updates.lastResult.version === expected))) { location.reload(); return; } } catch { sawOffline = true; }
      if (++attempts < 150) { setTimeout(poll, 1000); return; }
      this.restarting = false; toast('Neustart nicht erreichbar. Start.cmd öffnen; Details stehen unter data/updates/install.log und restart.log.', true); await refresh(); this.sync();
    };
    setTimeout(poll, 1000);
  },
};
