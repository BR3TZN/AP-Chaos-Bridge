import { readFileSync } from 'node:fs';

export const ADMIN_SLOT_NAME = 'ADMIN';
export function adminSlotFile() {
  return { name: ADMIN_SLOT_NAME + '.yaml', content: readFileSync(new URL('../examples/ADMIN.yaml', import.meta.url), 'utf8') };
}

export function includeAdminSlot(files, players) {
  if (players.some(name => name.trim().toUpperCase() === ADMIN_SLOT_NAME)) throw new Error('ADMIN ist für den Zuschauer-Dummy reserviert. Für Spieler bitte einen anderen Slotnamen verwenden oder den zusätzlichen Dummy abwählen.');
  return [...files, adminSlotFile()];
}
