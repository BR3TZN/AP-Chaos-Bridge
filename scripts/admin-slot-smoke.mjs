// Used only against the temporary official Core server in validate_admin_slot.py.
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { Archipelago } from '../lib/archipelago.mjs';

const url = process.argv[2], clients = [], ap = new Archipelago();
const until = async predicate => { const end = Date.now() + 12000; while (!predicate()) { if (ap.error) throw new Error(ap.error); if (Date.now() > end) throw new Error('Timed out waiting for official Archipelago'); await new Promise(resolve => setTimeout(resolve, 15)); } };
try {
  for (const name of ['Daniel', 'Friend']) {
    const socket = new WebSocket(url, { perMessageDeflate: true }), packets = [];
    const client = { name, socket, packets }; clients.push(client);
    socket.on('message', raw => { for (const packet of JSON.parse(raw.toString())) {
      packets.push(packet);
      if (packet.cmd === 'RoomInfo') socket.send(JSON.stringify([{ cmd: 'Connect', name, password: 'smoke-room', game: 'ChecksFinder', uuid: 'smoke-' + name, version: { major: 0, minor: 6, build: 8, class: 'Version' }, items_handling: 7, tags: ['AP', 'DeathLink'], slot_data: false }]));
      if (packet.cmd === 'Connected') client.slot = packet.slot;
    } });
    await until(() => client.slot);
  }
  const adminPackets = [];
  ap.connect({ url, loginMode: 'admin' }, 'smoke-room', 'smoke-admin');
  ap.socket.on('message', raw => adminPackets.push(...JSON.parse(raw.toString())));
  await until(() => ap.admin && ap.items('ChecksFinder')['Map Width']);
  assert.equal(ap.status().slotName, 'ADMIN'); assert.equal(ap.config.loginMode, 'admin');
  assert(!clients.some(client => client.slot === ap.slot));
  for (const client of clients) {
    assert.equal(client.socket.readyState, WebSocket.OPEN);
    const result = await ap.execute({ roomKey: ap.roomKey, effect: 'item', game: 'ChecksFinder', team: 0, slot: client.slot, targetName: client.name, item: 'Map Width' }); assert.equal(result.status, 'confirmed');
    await until(() => client.packets.some(packet => packet.cmd === 'ReceivedItems' && packet.items?.some(item => item.item === ap.items('ChecksFinder')['Map Width'])));
  }
  await ap.execute({ roomKey: ap.roomKey, effect: 'deathlink', user: 'Smoke' });
  for (const client of clients) await until(() => client.packets.some(packet => packet.cmd === 'Bounced' && packet.tags?.includes('DeathLink')));
  assert(!adminPackets.some(packet => packet.cmd === 'ReceivedItems'));
  console.log(JSON.stringify({ officialServer: true, adminConnected: true, simultaneousGameClients: 2, itemDeliveries: 2, deathLinkRecipients: 2, adminReceivesItems: false }));
} finally { ap.disconnect(); for (const { socket } of clients) socket.close(); }
