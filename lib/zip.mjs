import { inflateRawSync } from 'node:zlib';
const crcTable = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
const crc32 = bytes => { let crc = 0xffffffff; for (const b of bytes) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; };
export function readZip(bytes, { worldOnly = false } = {}) {
  if (!Buffer.isBuffer(bytes) || bytes.length > 40 * 1024 * 1024) throw new Error('APworld-Datei ist zu groß.');
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (bytes.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('Keine gültige APworld-/ZIP-Datei.');
  const count = bytes.readUInt16LE(end + 10); let at = bytes.readUInt32LE(end + 16), total = 0;
  if (count > 12000) throw new Error('Zu viele Dateien in der APworld.');
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || bytes.readUInt32LE(at) !== 0x02014b50) throw new Error('Beschädigter ZIP-Katalog.');
    const flags = bytes.readUInt16LE(at + 8), method = bytes.readUInt16LE(at + 10), compressed = bytes.readUInt32LE(at + 20), size = bytes.readUInt32LE(at + 24);
    const nameLength = bytes.readUInt16LE(at + 28), extra = bytes.readUInt16LE(at + 30), comment = bytes.readUInt16LE(at + 32), offset = bytes.readUInt32LE(at + 42);
    const name = bytes.subarray(at + 46, at + 46 + nameLength).toString('utf8').replaceAll('\\', '/'); at += 46 + nameLength + extra + comment;
    if (flags & 1 || /(^|[\\/])\.\.([\\/]|$)|^[\\/]|^[a-z]:/i.test(name)) throw new Error('Ungültiger Dateipfad oder verschlüsseltes Archiv.');
    total += size;
    if (total > 100 * 1024 * 1024) throw new Error('Entpackte APworld ist zu groß.');
    if (!(worldOnly ? /(?:\.py$|(?:^|\/)archipelago\.json$)/i.test(name) : /\.(?:py|ya?ml|json)$/i.test(name)) || name.includes('__pycache__')) continue;
    if (size > 8 * 1024 * 1024) throw new Error('Quelldatei in APworld ist zu groß.');
    if (offset + 30 > bytes.length || bytes.readUInt32LE(offset) !== 0x04034b50) throw new Error('Beschädigter ZIP-Eintrag.');
    const start = offset + 30 + bytes.readUInt16LE(offset + 26) + bytes.readUInt16LE(offset + 28), payload = bytes.subarray(start, start + compressed);
    if (payload.length !== compressed) throw new Error('Unvollständiger ZIP-Eintrag.');
    const content = method === 0 ? payload : method === 8 ? inflateRawSync(payload, { maxOutputLength: Math.max(1, size) }) : null;
    if (!content || content.length !== size || crc32(content) !== bytes.readUInt32LE(at - 46 - nameLength - extra - comment + 16)) throw new Error('ZIP-Prüfsumme oder Kompression ungültig.');
    entries.push({ name, text: content.toString('utf8') });
  }
  return entries;
}
export function writeZip(files) {
  let offset = 0; const chunks = [], central = [];
  for (const file of files) {
    const name = Buffer.from(file.name), content = Buffer.from(file.content), crc = crc32(content);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt32LE(crc, 14); local.writeUInt32LE(content.length, 18); local.writeUInt32LE(content.length, 22); local.writeUInt16LE(name.length, 26);
    chunks.push(local, name, content);
    const header = Buffer.alloc(46); header.writeUInt32LE(0x02014b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(20, 6); header.writeUInt16LE(0x800, 8); header.writeUInt32LE(crc, 16); header.writeUInt32LE(content.length, 20); header.writeUInt32LE(content.length, 24); header.writeUInt16LE(name.length, 28); header.writeUInt32LE(offset, 42);
    central.push(header, name); offset += local.length + name.length + content.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, directory, end]);
}
