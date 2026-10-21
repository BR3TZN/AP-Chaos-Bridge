import { text, number } from './model.mjs';
import { serverUrl } from './archipelago.mjs';
export function connectionConfig(previous, raw) {
  const config = { ...previous };
  for (const key of ['slotName', 'expectedSeed']) if (raw[key] !== undefined) config[key] = text(raw[key]);
  if (raw.addressMode !== undefined) {
    if (!['local', 'hosted', 'custom'].includes(raw.addressMode)) throw new Error('Unbekannter Hosting-Modus.');
    config.addressMode = raw.addressMode;
    config.port = number(raw.port ?? previous.port, 1, 65535, 38281);
    if (!Number.isInteger(config.port)) throw new Error('Port muss eine ganze Zahl sein.');
    config.host = raw.addressMode === 'local' ? '127.0.0.1' : raw.addressMode === 'hosted' ? 'archipelago.gg' : text(raw.host ?? previous.host ?? '', 300);
    config.secure = raw.secure === true || raw.secure === 'on';
    if (!config.host || /[\s/@?#\\]/.test(config.host)) throw new Error('Nur den Hostnamen oder die IP ohne Protokoll und Port eintragen.');
    config.url = serverUrl(`${config.secure ? 'wss' : 'ws'}://${config.host}:${config.port}`);
  } else if (raw.url !== undefined) {
    config.url = text(raw.url, 500);
    delete config.addressMode; delete config.host; delete config.port; delete config.secure;
  }
  return config;
}
