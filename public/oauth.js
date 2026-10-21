async function complete() {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const query = new URLSearchParams(location.search), error = query.get('error');
  history.replaceState(null, '', '/oauth/callback');
  if (query.get('complete') === '1') { document.getElementById('result').textContent = 'Anmeldung übernommen. Der Verbindungsstatus erscheint in der Bridge. Dieses Fenster kann geschlossen werden.'; return; }
  if (error || !fragment.get('access_token')) throw new Error('Twitch-Anmeldung wurde nicht abgeschlossen.');
  const stateResponse = await fetch('/api/state'); const state = await stateResponse.json();
  const response = await fetch('/api/twitch/oauth', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-Session': state.session }, body: JSON.stringify({ token: fragment.get('access_token'), state: fragment.get('state') }) });
  const result = await response.json(); fragment.delete('access_token');
  if (!response.ok) throw new Error(result.error || 'Anmeldung fehlgeschlagen.');
  document.getElementById('result').textContent = 'Anmeldung übernommen. Der Verbindungsstatus erscheint in der Bridge. Dieses Fenster kann geschlossen werden.';
}
complete().catch(e => { document.getElementById('result').textContent = e.message; });
