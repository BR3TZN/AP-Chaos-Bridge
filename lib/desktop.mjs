import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

export const desktopExecutable = root => join(root, 'assets/windows/AP-Chaos-Bridge.exe');
export const desktopRootId = root => createHash('sha256').update(process.platform === 'win32' ? resolve(root).toLowerCase() : resolve(root)).digest('hex');
export function desktopParent(env = process.env, parent = process.ppid) {
  const pid = Number(env.AP_BRIDGE_DESKTOP_PID);
  return Number.isSafeInteger(pid) && pid > 0 && pid === parent ? pid : undefined;
}
