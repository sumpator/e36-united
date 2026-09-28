-- Local proposal only. No historical check-in/payment conversion and no data reset.
ALTER TABLE events ADD COLUMN admission_registered_czk INTEGER CHECK(admission_registered_czk IS NULL OR admission_registered_czk>=0);
ALTER TABLE events ADD COLUMN admission_onsite_czk INTEGER CHECK(admission_onsite_czk IS NULL OR admission_onsite_czk>=0);
ALTER TABLE reservations ADD COLUMN admission_czk INTEGER CHECK(admission_czk IS NULL OR admission_czk>=0);

CREATE TABLE event_arrivals (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  member_id TEXT REFERENCES members(id) ON DELETE RESTRICT,
  reservation_id TEXT UNIQUE REFERENCES reservations(id) ON DELETE RESTRICT,
  name TEXT NOT NULL DEFAULT '', nickname TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
  car_key TEXT NOT NULL,
  garage_car_id TEXT REFERENCES cars(id) ON DELETE RESTRICT,
  competition_car_id TEXT REFERENCES live_competition_cars(id) ON DELETE RESTRICT,
  model TEXT NOT NULL CHECK(length(trim(model)) BETWEEN 1 AND 120),
  body TEXT NOT NULL CHECK(body IN ('Sedan','Coupé','Touring','Cabrio','Compact','Z3')),
  plate TEXT NOT NULL DEFAULT '',
  crew INTEGER NOT NULL CHECK(crew BETWEEN 1 AND 99),
  registered INTEGER NOT NULL CHECK(registered IN (0,1)),
  admission_czk INTEGER NOT NULL CHECK(admission_czk>=0),
  services_czk INTEGER NOT NULL DEFAULT 0 CHECK(services_czk>=0),
  free_reason TEXT, free_by TEXT REFERENCES members(id), free_at TEXT,
  arrived_at TEXT, confirmed_by TEXT REFERENCES members(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id,car_key),
  CHECK((free_reason IS NULL AND free_by IS NULL AND free_at IS NULL) OR (length(trim(free_reason))>0 AND free_by IS NOT NULL AND free_at IS NOT NULL))
);
CREATE UNIQUE INDEX arrivals_plate ON event_arrivals(event_id,plate) WHERE plate<>'';
CREATE INDEX arrivals_member ON event_arrivals(event_id,member_id);

-- One method-aware ledger for reservation and gate payments. No inferred opening balances.
CREATE TABLE event_payments (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  reservation_id TEXT REFERENCES reservations(id) ON DELETE RESTRICT,
  arrival_id TEXT REFERENCES event_arrivals(id) ON DELETE RESTRICT,
  method TEXT NOT NULL CHECK(method IN ('cash','bank')),
  amount_czk INTEGER NOT NULL CHECK(amount_czk<>0),
  actor_id TEXT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK(length(trim(reason))>0),
  reverses_id TEXT UNIQUE REFERENCES event_payments(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(reservation_id IS NOT NULL OR arrival_id IS NOT NULL)
);
CREATE INDEX event_payments_reservation ON event_payments(reservation_id);
CREATE INDEX event_payments_arrival ON event_payments(arrival_id);
CREATE TRIGGER event_payment_relations BEFORE INSERT ON event_payments BEGIN
  SELECT CASE WHEN NEW.reservation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM reservations WHERE id=NEW.reservation_id AND event_id=NEW.event_id) THEN RAISE(ABORT,'payment_event_mismatch') END;
  SELECT CASE WHEN NEW.arrival_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM event_arrivals WHERE id=NEW.arrival_id AND event_id=NEW.event_id AND reservation_id IS NEW.reservation_id) THEN RAISE(ABORT,'payment_arrival_mismatch') END;
  SELECT CASE WHEN NEW.amount_czk<0 AND NOT EXISTS(SELECT 1 FROM event_payments p WHERE p.id=NEW.reverses_id AND p.amount_czk=-NEW.amount_czk AND p.method=NEW.method AND p.event_id=NEW.event_id AND p.reservation_id IS NEW.reservation_id AND (p.arrival_id IS NEW.arrival_id OR p.reservation_id IS NOT NULL) AND p.reverses_id IS NULL) THEN RAISE(ABORT,'invalid_payment_reversal') END;
END;
CREATE TRIGGER event_payment_snapshot AFTER INSERT ON event_payments WHEN NEW.reservation_id IS NOT NULL
BEGIN
  UPDATE reservations SET amount_paid_czk=(SELECT COALESCE(SUM(amount_czk),0) FROM event_payments WHERE reservation_id=NEW.reservation_id),payment_confirmed_by=NEW.actor_id,payment_confirmed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=NEW.reservation_id;
  UPDATE reservations SET payment_status=CASE WHEN amount_paid_czk>amount_due_czk THEN 'overpaid' WHEN amount_due_czk=0 THEN 'not_required' WHEN amount_paid_czk=amount_due_czk THEN 'paid' WHEN amount_paid_czk>0 THEN 'underpaid' ELSE 'unpaid' END,paid_at=CASE WHEN amount_paid_czk>=amount_due_czk AND amount_paid_czk>0 THEN COALESCE(paid_at,CURRENT_TIMESTAMP) ELSE NULL END WHERE id=NEW.reservation_id;
END;
CREATE TRIGGER event_payment_immutable_update BEFORE UPDATE ON event_payments BEGIN SELECT RAISE(ABORT,'payment_is_append_only'); END;
CREATE TRIGGER event_payment_immutable_delete BEFORE DELETE ON event_payments BEGIN SELECT RAISE(ABORT,'payment_reset_requires_explicit_maintenance'); END;

CREATE TABLE arrival_invitations (
  id TEXT PRIMARY KEY,
  arrival_id TEXT NOT NULL UNIQUE REFERENCES event_arrivals(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_by TEXT REFERENCES members(id), consumed_at TEXT, claim_id TEXT UNIQUE,
  outbox_id TEXT NOT NULL UNIQUE REFERENCES email_outbox(id) ON DELETE RESTRICT
);
ALTER TABLE email_outbox ADD COLUMN payload_json TEXT;

-- Preserve legacy rows untouched, but stop using them as an independent check-in.
ALTER TABLE event_member_presence RENAME TO legacy_event_member_presence;
CREATE VIEW event_member_presence AS SELECT event_id,member_id,1 present,MAX(confirmed_by) confirmed_by,MIN(arrived_at) confirmed_at FROM event_arrivals WHERE arrived_at IS NOT NULL AND member_id IS NOT NULL GROUP BY event_id,member_id;
CREATE TRIGGER arrivals_revision_insert AFTER INSERT ON event_arrivals BEGIN
  INSERT INTO live_event_revisions(event_id,revision) VALUES(NEW.event_id,1) ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER arrivals_revision_update AFTER UPDATE ON event_arrivals BEGIN
  INSERT INTO live_event_revisions(event_id,revision) VALUES(NEW.event_id,1) ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER arrival_reservation_price AFTER UPDATE OF amount_due_czk,admission_czk ON reservations WHEN NEW.admission_czk IS NOT NULL BEGIN
  UPDATE event_arrivals SET services_czk=NEW.amount_due_czk-NEW.admission_czk,version=version+1 WHERE reservation_id=NEW.id;
  UPDATE reservations SET payment_status=CASE WHEN amount_paid_czk>amount_due_czk THEN 'overpaid' WHEN amount_due_czk=0 THEN 'not_required' WHEN amount_paid_czk=amount_due_czk THEN 'paid' WHEN amount_paid_czk>0 THEN 'underpaid' ELSE 'unpaid' END WHERE id=NEW.id;
END;
INSERT OR IGNORE INTO admin_resource_versions(resource_type,resource_id,revision) SELECT 'arrivals',id,0 FROM events;
CREATE TRIGGER arrivals_event_version AFTER INSERT ON events BEGIN
  INSERT OR IGNORE INTO admin_resource_versions(resource_type,resource_id,revision) VALUES('arrivals',NEW.id,0);
END;
CREATE TRIGGER event_arrivals_write_guard_insert BEFORE INSERT ON event_arrivals
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER event_arrivals_write_guard_update BEFORE UPDATE ON event_arrivals
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER event_arrivals_write_guard_delete BEFORE DELETE ON event_arrivals
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER event_payments_write_guard_insert BEFORE INSERT ON event_payments
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER event_payments_write_guard_update BEFORE UPDATE ON event_payments
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER event_payments_write_guard_delete BEFORE DELETE ON event_payments
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrival_invitations_write_guard_insert BEFORE INSERT ON arrival_invitations
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrival_invitations_write_guard_update BEFORE UPDATE ON arrival_invitations
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrival_invitations_write_guard_delete BEFORE DELETE ON arrival_invitations
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
INSERT INTO schema_migrations(id,description) VALUES('2026-09-30-arrivals','Car arrivals, explicit admission snapshot and method-aware payments; no legacy conversion');
