import { randomUUID, randomInt } from 'node:crypto';
import { matches, text } from './model.mjs';

const pending = job => ['queued', 'dispatching'].includes(job.status);
export class Engine {
  constructor(store, ap, { now = () => Date.now(), choose = list => list[randomInt(list.length)] } = {}) {
    this.store = store; this.ap = ap; this.now = now; this.choose = choose; this.busy = false;
    this.onChange = () => {};
  }
  ingest(raw) {
    const s = this.store.state, now = this.now();
    const event = {
      id: text(String(raw.id), 200), source: text(raw.source, 30), type: text(raw.type, 40),
      user: text(raw.user || 'Anonym', 100), action: text(raw.action || '', 200), rewardId: text(raw.rewardId || '', 200),
      amountCents: raw.amountCents ?? 0, units: raw.units ?? 0, test: raw.test === true, timestamp: raw.timestamp ?? now,
      channelId: text(raw.channelId || '', 80), channel: text(raw.channel || '', 100), broadcasterId: text(raw.broadcasterId || '', 80),
    };
    if (!event.id || event.id === 'undefined') throw new Error('Stabile Ereignis-ID erforderlich.');
    if (!['charity', 'twitch', 'external', 'manual'].includes(event.source) || !['donation', 'sub', 'resub', 'gift_sub', 'cheer', 'channel_points', 'manual'].includes(event.type)) throw new Error('Unbekanntes Ereignisformat.');
    for (const val of [event.amountCents, event.units]) if (!Number.isSafeInteger(val) || val < 0 || val > 100000000) throw new Error('Ungültige Cent- oder Einheitenzahl.');
    if (!Number.isFinite(event.timestamp) || event.timestamp > now + 60000 || now - event.timestamp > s.config.eventMaxAgeSec * 1000) return { accepted: false, reason: 'Ereignis abgelaufen oder Zeitstempel ungültig.' };
    const dedupKey = event.source + ':' + (event.broadcasterId ? event.broadcasterId + ':' : '') + event.id;
    if (s.seen[dedupKey]) return { accepted: false, duplicate: true, reason: 'Bereits verarbeitet.' };
    const receipt = { ...event, roomKey: this.ap.roomKey, receivedAt: now, jobs: 0, errors: [], dryRun: event.test || s.config.mode !== 'live' || this.ap.demo, matchedRules: [] };
    const jobs = [];
    for (const rule of s.rules) if (matches(rule, event)) {
      receipt.matchedRules.push(rule.name);
      try { jobs.push(...this.plan(rule, receipt)); } catch (e) { receipt.errors.push(`${rule.name}: ${e.message}`); }
    }
    if (s.queue.filter(pending).length + jobs.length > s.config.maxQueue) {
      receipt.errors.push('Warteschlange voll. Ereignis protokolliert; keine Teilmenge ausgeführt.');
    } else { s.queue.push(...jobs); receipt.jobs = jobs.length; }
    receipt.games = [...new Set(jobs.map(j => j.game).filter(Boolean))];
    s.seen[dedupKey] = now;
    const cutoff = now - Math.max(86400000, s.config.eventMaxAgeSec * 1000 + 60000);
    for (const [id, at] of Object.entries(s.seen)) if (at < cutoff) delete s.seen[id];
    s.events.unshift(receipt); s.events = s.events.slice(0, 300);
    // Retain every pending action, plus the 500 most recent terminal actions.
    const terminal = s.queue.filter(j => !pending(j)).slice(-500);
    s.queue = [...terminal, ...s.queue.filter(pending)];
    this.store.save(); this.onChange(); return { accepted: true, receipt };
  }
  approval(player) { return this.store.state.approvals[this.ap.roomKey]?.[`${player.team}:${player.slot}`] || { enabled: false, items: [] }; }
  plan(rule, event) {
    const s = this.store.state;
    if (rule.reviewNotes?.length) throw new Error('Importierte Regel zuerst öffnen und ihre Zuordnungen für diesen Raum prüfen.');
    if (rule.effect === 'random_action') {
      const effects = [...new Set(rule.randomEffects?.length ? rule.randomEffects : ['random_item'])];
      if (rule.includeDeathLink && !effects.includes('deathlink')) effects.push('deathlink');
      const plans = [];
      for (const effect of effects) {
        if (!event.dryRun && !['deathlink', 'message', 'alert'].includes(effect) && !this.ap.admin) continue;
        try { plans.push(this.plan({ ...rule, effect }, event)); } catch { /* Only currently available action types enter the draw. */ }
      }
      if (!plans.length) throw new Error('Keine der gewählten Zufallsaktionen ist für diese Empfänger freigegeben.');
      return this.choose(plans);
    }
    if (!this.ap.connected && rule.effect !== 'alert') throw new Error('Kein Raum verbunden. Demo oder echten Raum öffnen.');
    if (this.ap.demo && !event.dryRun) throw new Error('Demo erlaubt ausschließlich Simulationen.');
    const base = {
      eventId: `${event.source}:${event.id}`, ruleId: rule.id, ruleName: rule.name, cooldownSec: rule.cooldownSec,
      roomKey: this.ap.roomKey, seed: this.ap.seed, createdAt: this.now(), expiresAt: this.now() + s.config.queueTtlSec * 1000,
      dryRun: event.dryRun, status: 'queued', user: event.user, effect: rule.effect,
      channel: event.channel || '', channelId: event.channelId || '', source: event.source,
    };
    const message = text((rule.message || rule.name || 'Zuschaueraktion').replaceAll('{user}', () => event.user).replaceAll('{rule}', () => rule.name || 'Regel').replaceAll('{channel}', () => event.channel || ''), 600);
    if (rule.effect === 'alert') return [{ ...base, id: randomUUID(), targetName: 'Stream-Alert', targetKey: 'visual', message, detail: 'Nur Anzeige in OBS. Kein Spieleingriff.' }];
    if (rule.effect === 'message') return [{ ...base, id: randomUUID(), targetName: 'AP-Raumchat', targetKey: 'chat', message, detail: 'Nachricht im Chat des verbundenen AP-Raums.' }];
    if (rule.effect === 'deathlink') {
      if (!s.config.deathLinkArmed && !event.dryRun) throw new Error('DeathLink-Gruppenaktionen sind gesperrt.');
      return [{ ...base, id: randomUUID(), targetName: 'DeathLink-Gruppe · eigenes AP-Team', targetKey: 'group', detail: 'Alle verbundenen Clients mit aktiviertem DeathLink; keine Einzelziel-Auswahl.' }];
    }
    let players = this.ap.players.filter(p => p.team === this.ap.team && p.type === 1 && this.approval(p).enabled && (!rule.game || p.game === rule.game));
    if (['selected', 'random_selected'].includes(rule.target)) players = players.filter(p => rule.targetKeys?.includes(`${p.team}:${p.slot}`));
    else if (!['random', 'all'].includes(rule.target)) players = players.filter(p => `${p.team}:${p.slot}` === rule.target);
    const eligible = players.map(player => {
      const approved = this.approval(player).items || [];
      const catalog = this.ap.items(player.game);
      const traps = this.approval(player).traps || [];
      const pool = rule.effect === 'random_trap' ? traps : rule.effect === 'random_nontrap' ? approved.filter(item => !traps.includes(item)) : rule.effect === 'random_choice' ? rule.itemPool || [] : approved;
      const available = approved.filter(item => pool.includes(item) && Object.hasOwn(catalog, item));
      return { player, available: ['item', 'hint'].includes(rule.effect) ? available.filter(i => i === rule.item) : available };
    }).filter(p => p.available.length);
    if (!eligible.length) throw new Error('Kein freigegebener Zielslot mit passendem, freigegebenem Item im Raumkatalog.');
    const targets = ['random', 'random_selected'].includes(rule.target) ? [this.choose(eligible)] : eligible;
    if (!['all', 'selected'].includes(rule.target) && targets.length !== 1) throw new Error('Zielslot ist nicht eindeutig.');
    const hint = ['hint', 'random_hint'].includes(rule.effect);
    return targets.flatMap(({ player, available }) => Array.from({ length: hint ? 1 : rule.quantity }, () => ({
      ...base, effect: hint ? 'hint' : rule.effect, id: randomUUID(), targetKey: `${player.team}:${player.slot}`, targetName: player.name,
      slot: player.slot, team: player.team, game: player.game, item: ['item', 'hint'].includes(rule.effect) ? rule.item : this.choose(available),
      detail: hint ? 'Hinweis über AP-Admin /hint anfordern.' : 'Item über AP-Admin /send. Spieleffekt hängt vom verbundenen Spielclient ab.',
    })));
  }
  pause() { this.store.state.config.paused = true; this.store.save(); this.onChange(); }
  emergency() {
    this.store.state.config.paused = true; this.store.state.config.mode = 'test'; this.store.state.config.deathLinkArmed = false;
    for (const job of this.store.state.queue) if (job.status === 'queued') { job.status = 'cancelled'; job.detail = 'Durch Notaus verworfen.'; }
    this.store.save(); this.onChange();
  }
  runRule(id, live = false) {
    const s = this.store.state, rule = s.rules.find(r => r.id === id);
    if (!rule) throw new Error('Regel fehlt.');
    if (live && (!rule.enabled || s.config.mode !== 'live' || this.ap.demo)) throw new Error('Live-Test benötigt eine aktive Regel und Live-Modus im echten Raum.');
    const event = { id: randomUUID(), source: 'manual', type: 'manual', user: live ? 'Lokaler Live-Test' : 'Lokaler Regeltest', dryRun: !live, test: !live, receivedAt: this.now(), amountCents: 0, units: 0 };
    const jobs = this.plan(rule, event);
    if (s.queue.filter(pending).length + jobs.length > s.config.maxQueue) throw new Error('Warteschlange voll.');
    event.jobs = jobs.length; event.errors = []; event.matchedRules = [rule.name];
    s.queue.push(...jobs); s.events.unshift(event); s.events = s.events.slice(0, 300);
    this.store.save(); this.onChange(); return event;
  }
  async tick() {
    if (this.busy) return;
    const s = this.store.state, now = this.now();
    let dirty = false;
    for (const j of s.queue) if (j.status === 'queued' && j.expiresAt <= now) { j.status = 'expired'; j.detail = 'Wartezeit überschritten.'; dirty = true; }
    if (dirty) { this.store.save(); this.onChange(); }
    if (s.config.paused || now < s.lastDispatch + s.config.globalCooldownSec * 1000) return;
    const job = s.queue.find(j => j.status === 'queued' && (j.dryRun || s.config.mode === 'live') && now >= (s.cooldowns[j.ruleId] || 0));
    if (!job) return;
    if (job.effect !== 'alert' && (!this.ap.connected || job.roomKey !== this.ap.roomKey)) return;
    this.busy = true;
    try {
      const rule = s.rules.find(r => r.id === job.ruleId);
      if (!rule || rule.reviewNotes?.length || (!job.dryRun && !rule.enabled)) throw new Error('Regel wurde deaktiviert, entfernt oder benötigt eine Zuordnungsprüfung.');
      if (!job.dryRun) {
        if (this.ap.demo) throw new Error('Demo kann keine Live-Aktionen ausführen.');
        if (job.effect === 'deathlink') {
          if (!s.config.deathLinkArmed) throw new Error('DeathLink-Gruppenfreigabe wurde entzogen.');
        } else if (!['message', 'alert'].includes(job.effect)) {
          const player = this.ap.players.find(p => `${p.team}:${p.slot}` === job.targetKey && p.name === job.targetName && p.game === job.game);
          if (!player || !this.approval(player).enabled || !this.approval(player).items?.includes(job.item)) throw new Error('Ziel oder Item ist nicht mehr freigegeben.');
          if (!Object.hasOwn(this.ap.items(job.game), job.item)) throw new Error('Item fehlt im aktuellen Raumkatalog.');
          if (!this.ap.admin) throw new Error('AP-Admin nicht angemeldet.');
        }
      }
      job.status = 'dispatching'; job.dispatchedAt = now;
      s.lastDispatch = now; s.cooldowns[job.ruleId] = now + job.cooldownSec * 1000;
      this.store.save(); this.onChange();
      if (job.dryRun) { job.status = 'simulated'; job.detail = 'Simulation abgeschlossen. Kein Paket an Archipelago gesendet.'; }
      else if (job.effect === 'alert') { job.status = 'alerted'; job.detail = 'Stream-Alert ausgelöst. Kein AP-Paket gesendet.'; }
      else {
        const result = await this.ap.execute(job);
        job.status = result.status; job.detail = result.detail;
      }
    } catch (e) {
      job.status = job.status === 'dispatching' && !e.definitive ? 'uncertain' : 'failed';
      job.detail = e.message;
      if (job.status === 'uncertain') s.config.paused = true;
    } finally { job.finishedAt = this.now(); this.busy = false; this.store.save(); this.onChange(); }
  }
}
