import { readFileSync } from 'node:fs';

// Legacy migration fixtures remain small, but current payment handlers need the
// real append-only ledger and its relationship/snapshot triggers.
export function installReservationPayments(db) {
  const migration = readFileSync(new URL('../../db/migrations/2026-09-30-arrivals.sql', import.meta.url), 'utf8');
  const start = migration.indexOf('CREATE TABLE event_arrivals (');
  const end = migration.indexOf('CREATE TABLE arrival_invitations (');
  db.exec(migration.slice(start, end));
}
