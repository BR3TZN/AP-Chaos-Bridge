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
    };
    if (!event.id || event.id === 'undefined') throw new Error('Stabile Ereignis-ID erforderlich.');
    if (!['charity', 'twitch', 'external', 'manual'].includes(event.source) || !['donation', 'sub', 'resub', 'gift_sub', 'cheer', 'channel_points', 'manual'].includes(event.type)) throw new Error('Unbekanntes Ereignisformat.');
    for (const val of [event.amountCents, event.units]) if (!Number.isSafeInteger(val) || val < 0 || val > 100000000) throw new Error('Ungültige Cent- oder Einheitenzahl.');
    if (!Number.isFinite(event.timestamp) || event.timestamp > now + 60000 || now - event.timestamp > s.config.eventMaxAgeSec * 1000) return { accepted: false, reason: 'Ereignis abgelaufen oder Zeitstempel ungültig.' };
    const dedupKey = event.source + ':' + event.id;
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
    if (!this.ap.connected) throw new Error('Kein Raum verbunden. Demo oder echten Raum öffnen.');
    if (this.ap.demo && !event.dryRun) throw new Error('Demo erlaubt ausschließlich Simulationen.');
    const base = {
      eventId: `${event.source}:${event.id}`, ruleId: rule.id, ruleName: rule.name, cooldownSec: rule.cooldownSec,
      roomKey: this.ap.roomKey, seed: this.ap.seed, createdAt: this.now(), expiresAt: this.now() + s.config.queueTtlSec * 1000,
      dryRun: event.dryRun, status: 'queued', user: event.user, effect: rule.effect,
    };
    if (rule.effect === 'deathlink') {
      if (!s.config.deathLinkArmed && !event.dryRun) throw new Error('DeathLink-Gruppenaktionen sind gesperrt.');
      return [{ ...base, id: randomUUID(), targetName: 'DeathLink-Gruppe · eigenes AP-Team', targetKey: 'group', detail: 'Alle verbundenen Clients mit aktiviertem DeathLink; keine Einzelziel-Auswahl.' }];
    }
    let players = this.ap.players.filter(p => p.team === this.ap.team && p.type === 1 && this.approval(p).enabled && (!rule.game || p.game === rule.game));
    if (rule.target === 'selected') players = players.filter(p => rule.targetKeys?.includes(`${p.team}:${p.slot}`));
    else if (!['random', 'all'].includes(rule.target)) players = players.filter(p => `${p.team}:${p.slot}` === rule.target);
    const eligible = players.map(player => {
      const approved = this.approval(player).items || [];
      const catalog = this.ap.items(player.game);
      const pool = rule.effect === 'random_trap' ? (this.approval(player).traps || []) : approved;
      const available = approved.filter(item => pool.includes(item) && Object.hasOwn(catalog, item));
      return { player, available: rule.effect === 'item' ? available.filter(i => i === rule.item) : available };
    }).filter(p => p.available.length);
    if (rule.effect === 'random_action') {
      const actions = eligible.flatMap(p => p.available.map(() => 'random_item'));
      if (rule.includeDeathLink && (s.config.deathLinkArmed || event.dryRun)) actions.push('deathlink');
      if (!actions.length) throw new Error('Kein freigegebener Zufallspool verfügbar.');
      return this.plan({ ...rule, effect: this.choose(actions) }, event);
    }
    if (!eligible.length) throw new Error('Kein freigegebener Zielslot mit passendem, freigegebenem Item im Raumkatalog.');
    const targets = rule.target === 'random' ? [this.choose(eligible)] : eligible;
    if (!['all', 'selected'].includes(rule.target) && targets.length !== 1) throw new Error('Zielslot ist nicht eindeutig.');
    return targets.flatMap(({ player, available }) => Array.from({ length: rule.quantity }, () => ({
      ...base, id: randomUUID(), targetKey: `${player.team}:${player.slot}`, targetName: player.name,
      slot: player.slot, team: player.team, game: player.game, item: rule.effect === 'item' ? rule.item : this.choose(available),
      detail: 'Item über AP-Admin /send. Spieleffekt hängt vom verbundenen Spielclient ab.',
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
    if (!this.ap.connected || job.roomKey !== this.ap.roomKey) return;
    this.busy = true;
    try {
      const rule = s.rules.find(r => r.id === job.ruleId);
      if (!rule || (!job.dryRun && !rule.enabled)) throw new Error('Regel wurde deaktiviert oder entfernt.');
      if (!job.dryRun) {
        if (this.ap.demo) throw new Error('Demo kann keine Live-Aktionen ausführen.');
        if (job.effect === 'deathlink') {
          if (!s.config.deathLinkArmed) throw new Error('DeathLink-Gruppenfreigabe wurde entzogen.');
        } else {
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
