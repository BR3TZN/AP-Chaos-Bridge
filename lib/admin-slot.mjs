import { readFileSync } from 'node:fs';

export const ADMIN_SLOT_NAME = 'ADMIN';
export function adminSlotFile() {
  return { name: ADMIN_SLOT_NAME + '.yaml', content: readFileSync(new URL('../examples/ADMIN.yaml', import.meta.url), 'utf8') };
}
