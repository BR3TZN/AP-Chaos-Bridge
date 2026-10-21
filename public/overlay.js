let initialized = false, seen = new Set(), queue = [], active = false, loading = false, workspace = '';
async function load() {
  if (loading) return; loading = true;
  try {
    const response = await fetch('/api/state'); const state = await response.json();
    const jobs = state.queue.filter(j => ['confirmed', 'sent', 'simulated'].includes(j.status));
    const room = state.rooms?.active || 'default';
    if (!initialized || workspace !== room) { workspace = room; seen = new Set(jobs.map(j => j.id)); queue = []; initialized = true; document.getElementById('alert').classList.remove('visible'); return; }
    for (const j of jobs) if (!seen.has(j.id)) { seen.add(j.id); if (Date.now() - j.finishedAt < 30000) queue.push(j); }
    queue = queue.slice(-10); show();
  } catch { /* OBS remains transparent if the bridge stops. */ } finally { loading = false; }
}
function show() {
  if (active || !queue.length) return; active = true; const j = queue.shift();
  document.getElementById('label').textContent = j.dryRun ? 'SIMULATION · KEIN SPIELEINGRIFF' : j.status === 'confirmed' ? 'ITEM AM AP-SERVER BESTÄTIGT' : 'DEATHLINK GESENDET';
  document.getElementById('title').textContent = j.item || 'DeathLink · Gruppe';
  document.getElementById('detail').textContent = `${j.user} → ${j.targetName}`;
  document.getElementById('mode').textContent = j.dryRun ? 'TEST' : 'LIVE';
  const el = document.getElementById('alert'); el.classList.add('visible');
  setTimeout(() => { el.classList.remove('visible'); setTimeout(() => { active = false; show(); }, 500); }, 6500);
}
load(); const events = new EventSource('/api/events'); events.addEventListener('change', load); setInterval(load, 10000);
