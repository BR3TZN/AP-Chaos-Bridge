'use strict';
const Rewards = {
  manager: null, generation: 0, ruleForm: null,
  close() { this.generation++; this.manager = null; this.ruleForm = null; $('#twitch-reward-dialog')?.close(); },
  channel(id) { return (S.twitch.channels || []).find(channel => channel.id === id); },
  async manage(id) {
    this.manager = { id, room: S.rooms.active }; const channel = this.channel(id);
    showDrawer(drawerHead('Kanalpunkte-Belohnungen', channel?.channelName ? '@' + channel.channelName : 'Twitch-Kanal') + `<div class="drawer-body"><div class="button-row"><button data-action="rewards-create" data-id="${esc(id)}" class="primary">+ Belohnung anlegen</button><button data-action="rewards-reload">Liste neu laden</button></div><p class="help">Die Belohnung wird direkt in diesem Twitch-Kanal erstellt. Danach kannst du eine Regel für ihre Einlösungen anlegen.</p><div id="rewards-list" class="section-gap" role="status">Belohnungen werden geladen …</div></div>`);
    await this.reload();
  },
  async reload() {
    const manager = this.manager, generation = ++this.generation; if (!manager) return;
    try {
      const result = await api('twitch/rewards?channelId=' + encodeURIComponent(manager.id));
      if (generation !== this.generation || manager.room !== S.rooms.active || !$('#rewards-list')) return;
      $('#rewards-list').innerHTML = result.rewards.map(reward => `<article class="twitch-channel"><div class="section-title"><h3>${esc(reward.title)}</h3>${badge(reward.cost + ' Punkte')}</div>${reward.prompt ? `<p class="help">${esc(reward.prompt)}</p>` : ''}<p class="help">${reward.enabled ? 'Aktiv bei Twitch' : 'Bei Twitch deaktiviert'}</p><button data-action="rewards-rule" data-id="${esc(reward.id)}" data-title="${esc(reward.title)}">Regel für diese Belohnung</button></article>`).join('') || empty('Noch keine Belohnungen', 'Über „Belohnung anlegen“ direkt in Twitch erstellen.');
    } catch (error) { if (generation === this.generation && $('#rewards-list')) $('#rewards-list').textContent = error.message; }
  },
  create(id, ruleForm = null) {
    const channels = S.twitch.channels || []; if (!channels.length) throw new Error('Unter Verbindungen zuerst einen Twitch-Kanal hinzufügen.');
    this.ruleForm = ruleForm; this.createRoom = S.rooms.active;
    const selected = id || channels.find(channel => channel.state === 'connected')?.id || channels[0].id;
    const dialog = $('#twitch-reward-dialog');
    dialog.innerHTML = drawerHead('Kanalpunkte-Belohnung anlegen', 'Titel und Preis festlegen. Die Belohnung wird direkt in Twitch erstellt.').replace('data-action="close-drawer"', 'data-action="rewards-close"') + `<form id="rewards-create-form"><div class="drawer-body"><label>Twitch-Kanal<select name="channelId">${options(Object.fromEntries(channels.map(channel => [channel.id, channel.channelName ? '@' + channel.channelName : 'Mein Twitch-Kanal'])), selected)}</select></label><div class="notice section-gap"><div><p id="reward-permission" role="status"></p><button type="button" class="small section-gap" data-action="rewards-authorize">Belohnungen freigeben</button></div></div><div class="form-grid section-gap"><label>Titel<input name="title" required maxlength="45" placeholder="Zufällige Falle"></label><label>Kanalpunkte<input name="cost" type="number" min="1" step="1" max="9007199254740991" value="1000" required></label><label class="full">Beschreibung <span class="muted">(optional)</span><input name="prompt" maxlength="200" placeholder="Löst eine Zuschaueraktion aus."></label></div><details class="disclosure"><summary>Weitere Einstellungen</summary><div class="form-grid section-gap"><label>Farbe<input name="color" type="color" value="#a3bffa"></label><label>Abklingzeit in Sekunden<input name="cooldown" type="number" min="0" max="604800" step="1" value="0"><span class="help">0 deaktiviert die Abklingzeit.</span></label><label class="check-label full"><input name="requireInput" type="checkbox"><span>Nachricht von Zuschauern verlangen</span></label><label class="check-label full"><input name="enabled" type="checkbox" checked><span>Belohnung bei Twitch aktivieren</span></label></div></details><p class="help">Twitch erlaubt bis zu 50 Belohnungen je Kanal. Titel müssen in diesem Kanal eindeutig sein.</p></div><div class="drawer-foot"><button type="button" class="ghost" data-action="rewards-close">Abbrechen</button><button type="submit" class="primary">Bei Twitch anlegen</button></div></form>`;
    if (!dialog.open) dialog.showModal(); this.sync();
  },
  sync() {
    const dialog = $('#twitch-reward-dialog'); if (!dialog?.open) return;
    if (S.rooms.active !== this.createRoom) { dialog.close(); return; }
    const form = $('#rewards-create-form'), channel = this.channel(form.elements.namedItem('channelId').value);
    const permitted = channel?.state === 'connected' && channel.canManageRewards && channel.events.includes('channel.channel_points_custom_reward_redemption.add');
    $('#reward-permission').textContent = permitted ? 'Dieser Kanal ist verbunden und darf Belohnungen anlegen.' : 'Diesen Kanal einmal mit der zusätzlichen Berechtigung zum Anlegen von Belohnungen bei Twitch anmelden. Deine Eingaben bleiben offen.';
    $('[data-action="rewards-authorize"]').classList.toggle('hidden', Boolean(permitted));
    const submit = form.querySelector('[type="submit"]'); if (submit.dataset.busy !== 'true') submit.disabled = !permitted;
  },
  async authorize(id) {
    const native = Boolean(window.chrome?.webview?.postMessage), popup = native ? null : window.open('about:blank', 'ap-twitch-rewards-' + id);
    try {
      const result = await api('twitch/auth', { channelId: id, enableRewards: true });
      if (native) window.chrome.webview.postMessage({ type: 'openExternal', url: result.url });
      else if (popup) { popup.opener = null; popup.location.href = result.url; }
      else {
        const link = document.createElement('a'); link.href = result.url; link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = 'Twitch-Freigabe öffnen'; link.dataset.rewardAuthLink = ''; $('#rewards-create-form .notice').append(link);
      }
    } catch (error) { popup?.close(); throw error; }
  },
  async click(action, id) {
    if (action === 'rewards-close') return $('#twitch-reward-dialog').close();
    if (action === 'rewards-manage') return this.manage(id);
    if (action === 'rewards-reload') return this.reload();
    if (action === 'rewards-create') return this.create(id);
    if (action === 'rewards-from-rule') { const form = $('#rule-form'); return this.create(form.elements.namedItem('twitchChannelId').value, form); }
    if (action === 'rewards-authorize') return this.authorize($('#rewards-create-form').elements.namedItem('channelId').value);
    if (action === 'rewards-rule') {
      const button = [...document.querySelectorAll('[data-action="rewards-rule"]')].find(button => button.dataset.id === id);
      editRule(undefined, { name: button?.dataset.title || 'Kanalpunkte-Aktion', source: 'twitch', type: 'channel_points', twitchChannelId: this.manager.id, rewardId: id });
    }
  },
  async submit(form) {
    const room = this.createRoom, d = new FormData(form), channelId = d.get('channelId');
    const result = await api('twitch/rewards/create', { channelId, title: d.get('title'), cost: Number(d.get('cost')), prompt: d.get('prompt'), cooldown: Number(d.get('cooldown')), color: d.get('color'), requireInput: d.has('requireInput'), enabled: d.has('enabled') });
    if (room !== S.rooms.active || !form.isConnected) return;
    const rule = this.ruleForm; $('#twitch-reward-dialog').close();
    if (rule?.isConnected && $('#drawer').open) {
      rule.elements.namedItem('twitchChannelId').value = channelId;
      const select = rule.elements.namedItem('rewardId'); select.add(new Option(result.reward.title, result.reward.id)); select.value = result.reward.id;
      Studio.ruleVisibility(false); void Studio.loadRewards(rule);
    } else if (this.manager) await this.reload();
    toast('Belohnung bei Twitch angelegt. Die Spielaktion legst du in ihrer Regel fest.');
  },
};
