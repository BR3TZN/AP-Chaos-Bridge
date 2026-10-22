'use strict';
let initialized = false, seen = new Set(), queue = [], active = false, loading = false, workspace = '', generation = 0, hideTimer, nextTimer, config;
const element = document.getElementById('alert');
function reset() { generation++; clearTimeout(hideTimer); clearTimeout(nextTimer); queue = []; active = false; element.classList.remove('visible'); document.getElementById('alert-video').pause(); }
function configure(value) {
  config = value; document.body.dataset.position = value.position; element.dataset.animation = value.animation; element.dataset.layout = value.layout;
  document.documentElement.style.setProperty('--media-size', value.mediaSize + 'px');
  document.getElementById('alert-copy').hidden = !value.showText; document.getElementById('mode').hidden = !value.showText;
}
async function load() {
  if (loading) return; loading = true;
  try {
    const response = await fetch('/api/overlay'); if (!response.ok) return; const state = await response.json();
    Appearance.apply(state.appearance); configure(state.alerts);
    if (!initialized || workspace !== state.room) {
      reset(); workspace = state.room; seen = new Set(state.jobs.filter(j => !j.preview).map(j => j.id)); initialized = true;
    }
    if (!config.enabled) { reset(); state.jobs.forEach(j => seen.add(j.id)); return; }
    for (const job of state.jobs) if (!seen.has(job.id)) {
      seen.add(job.id); if (Date.now() - job.finishedAt < 30000 && (job.preview || config.showTests || !job.dryRun)) queue.push(job);
    }
    if (seen.size > 1500) seen = new Set(state.jobs.map(j => j.id));
    queue = queue.slice(-12); show();
  } catch { /* An unreachable bridge leaves the overlay transparent. */ } finally { loading = false; }
}
function show() {
  if (active || !queue.length || !config?.enabled) return; active = true; const job = queue.shift(), current = generation;
  document.getElementById('label').textContent = job.preview ? 'ALERT-VORSCHAU' : job.dryRun ? 'TEST · ZUSCHAUERAKTION' : 'ZUSCHAUERAKTION';
  document.getElementById('title').textContent = job.message || (job.effect === 'hint' ? 'Hinweis: ' + job.item : job.item || 'DeathLink · Gruppe');
  document.getElementById('detail').textContent = `${job.user} → ${job.targetName}`;
  document.getElementById('mode').textContent = job.preview ? 'VORSCHAU' : job.dryRun ? 'TEST' : 'LIVE';
  const image = document.getElementById('alert-image'), video = document.getElementById('alert-video'), mark = document.querySelector('.mark');
  image.hidden = true; video.hidden = true; mark.hidden = Boolean(config.media); video.pause();
  if (config.media) {
    const url = '/alert-media/' + config.media, target = /\.(webm|mp4)$/.test(config.media) ? video : image;
    target.hidden = false; target.src = url;
    target.onerror = () => { target.hidden = true; mark.hidden = false; };
    if (target === video) { video.currentTime = 0; video.play().catch(() => {}); }
  }
  element.classList.add('visible');
  hideTimer = setTimeout(() => {
    if (current !== generation) return; element.classList.remove('visible'); video.pause();
    nextTimer = setTimeout(() => { if (current !== generation) return; active = false; show(); }, 450);
  }, config.durationSec * 1000);
}
load(); const events = new EventSource('/api/events'); events.addEventListener('change', load); setInterval(load, 10000);
