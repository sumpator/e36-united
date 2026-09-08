-- Stage 1 only: expected-state versions and durable local Admin outcomes.
-- Apply once after 2026-09-07-mailing-delivery. No explicit transaction wrapper (D1 runner owns it).
CREATE TABLE admin_resource_versions (
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  PRIMARY KEY (resource_type, resource_id)
);
CREATE TABLE admin_operation_receipts (
  operation_id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_id TEXT,
  base_revision INTEGER NOT NULL,
  payload_hash TEXT NOT NULL,
  http_status INTEGER NOT NULL,
  cas_applied INTEGER NOT NULL CHECK (cas_applied = 1),
  primary_applied INTEGER NOT NULL CHECK (primary_applied = 1),
  result_revision INTEGER,
  committed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX admin_receipts_actor ON admin_operation_receipts(actor_id, committed_at);
INSERT INTO admin_resource_versions(resource_type, resource_id) VALUES ('event-settings', '*');
INSERT INTO admin_resource_versions(resource_type, resource_id) SELECT 'accommodation-catalog', id FROM events;
INSERT INTO admin_resource_versions(resource_type, resource_id) SELECT 'reservation', id FROM reservations;
CREATE TRIGGER admin_version_reservations_insert AFTER INSERT ON reservations
BEGIN
  INSERT INTO admin_resource_versions(resource_type, resource_id, revision) VALUES ('reservation', NEW.id, 1)
  ON CONFLICT(resource_type, resource_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER admin_version_reservations_update AFTER UPDATE ON reservations
BEGIN
  INSERT INTO admin_resource_versions(resource_type, resource_id, revision) VALUES ('reservation', NEW.id, 1)
  ON CONFLICT(resource_type, resource_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER admin_version_reservations_delete AFTER DELETE ON reservations
BEGIN
  INSERT INTO admin_resource_versions(resource_type, resource_id, revision) VALUES ('reservation', OLD.id, 1)
  ON CONFLICT(resource_type, resource_id) DO UPDATE SET revision = revision + 1;
END;
INSERT INTO admin_resource_versions(resource_type, resource_id) SELECT 'accommodation', id FROM event_accommodation_options;
CREATE TRIGGER admin_version_event_accommodation_options_insert AFTER INSERT ON event_accommodation_options
BEGIN
  INSERT INTO admin_resource_versions(resource_type, resource_id, revision) VALUES ('accommodation', NEW.id, 1)
  ON CONFLICT(resource_type, resource_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER admin_version_event_accommodation_options_update AFTER UPDATE ON event_accommodation_options
BEGIN
  INSERT INTO admin_resource_versions(resource_type, resource_id, revision) VALUES ('accommodation', NEW.id, 1)
  ON CONFLICT(resource_type, resource_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER admin_version_event_accommodation_options_delete AFTER DELETE ON event_accommodation_options
BEGIN
  INSERT INTO admin_resource_versions(resource_type, resource_id, revision) VALUES ('accommodation', OLD.id, 1)
  ON CONFLICT(resource_type, resource_id) DO UPDATE SET revision = revision + 1;
END;
INSERT INTO admin_resource_versions(resource_type, resource_id) SELECT 'gallery', id FROM gallery_submissions;
CREATE TRIGGER admin_version_gallery_submissions_insert AFTER INSERT ON gallery_submissions
BEGIN
  INSERT INTO admin_resource_versions(resource_type, resource_id, revision) VALUES ('gallery', NEW.id, 1)
  ON CONFLICT(resource_type, resource_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER admin_version_gallery_submissions_update AFTER UPDATE ON gallery_submissions
BEGIN
  INSERT INTO admin_resource_versions(resource_type, resource_id, revision) VALUES ('gallery', NEW.id, 1)
  ON CONFLICT(resource_type, resource_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER admin_version_gallery_submissions_delete AFTER DELETE ON gallery_submissions
BEGIN
  INSERT INTO admin_resource_versions(resource_type, resource_id, revision) VALUES ('gallery', OLD.id, 1)
  ON CONFLICT(resource_type, resource_id) DO UPDATE SET revision = revision + 1;
END;
INSERT INTO admin_resource_versions(resource_type, resource_id) SELECT 'history', id FROM united_history_claims;
CREATE TRIGGER admin_version_united_history_claims_insert AFTER INSERT ON united_history_claims
BEGIN
  INSERT INTO admin_resource_versions(resource_type, resource_id, revision) VALUES ('history', NEW.id, 1)
  ON CONFLICT(resource_type, resource_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER admin_version_united_history_claims_update AFTER UPDATE ON united_history_claims
BEGIN
  INSERT INTO admin_resource_versions(resource_type, resource_id, revision) VALUES ('history', NEW.id, 1)
  ON CONFLICT(resource_type, resource_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER admin_version_united_history_claims_delete AFTER DELETE ON united_history_claims
BEGIN
  INSERT INTO admin_resource_versions(resource_type, resource_id, revision) VALUES ('history', OLD.id, 1)
  ON CONFLICT(resource_type, resource_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER admin_version_events_insert AFTER INSERT ON events
BEGIN
  UPDATE admin_resource_versions SET revision = revision + 1 WHERE resource_type = 'event-settings' AND resource_id = '*';
  INSERT OR IGNORE INTO admin_resource_versions(resource_type, resource_id) VALUES ('accommodation-catalog', NEW.id);
END;
CREATE TRIGGER admin_catalog_insert AFTER INSERT ON event_accommodation_options
BEGIN
  INSERT INTO admin_resource_versions(resource_type, resource_id, revision) VALUES ('accommodation-catalog', NEW.event_id, 1)
  ON CONFLICT(resource_type, resource_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER admin_allocation_insert AFTER INSERT ON reservation_accommodation
BEGIN
  INSERT INTO admin_resource_versions(resource_type, resource_id, revision) VALUES ('reservation', NEW.reservation_id, 1)
  ON CONFLICT(resource_type, resource_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER admin_version_events_update AFTER UPDATE ON events
BEGIN
  UPDATE admin_resource_versions SET revision = revision + 1 WHERE resource_type = 'event-settings' AND resource_id = '*';
  INSERT OR IGNORE INTO admin_resource_versions(resource_type, resource_id) VALUES ('accommodation-catalog', NEW.id);
END;
CREATE TRIGGER admin_catalog_update AFTER UPDATE ON event_accommodation_options
BEGIN
  INSERT INTO admin_resource_versions(resource_type, resource_id, revision) VALUES ('accommodation-catalog', NEW.event_id, 1)
  ON CONFLICT(resource_type, resource_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER admin_allocation_update AFTER UPDATE ON reservation_accommodation
BEGIN
  INSERT INTO admin_resource_versions(resource_type, resource_id, revision) VALUES ('reservation', NEW.reservation_id, 1)
  ON CONFLICT(resource_type, resource_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER admin_version_events_delete AFTER DELETE ON events
BEGIN
  UPDATE admin_resource_versions SET revision = revision + 1 WHERE resource_type = 'event-settings' AND resource_id = '*';
  INSERT OR IGNORE INTO admin_resource_versions(resource_type, resource_id) VALUES ('accommodation-catalog', OLD.id);
END;
CREATE TRIGGER admin_catalog_delete AFTER DELETE ON event_accommodation_options
BEGIN
  INSERT INTO admin_resource_versions(resource_type, resource_id, revision) VALUES ('accommodation-catalog', OLD.event_id, 1)
  ON CONFLICT(resource_type, resource_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER admin_allocation_delete AFTER DELETE ON reservation_accommodation
BEGIN
  INSERT INTO admin_resource_versions(resource_type, resource_id, revision) VALUES ('reservation', OLD.reservation_id, 1)
  ON CONFLICT(resource_type, resource_id) DO UPDATE SET revision = revision + 1;
END;
INSERT INTO schema_migrations (id, description) VALUES ('2026-09-08-admin-safe-operations', 'Admin expected state, atomic operation receipts and all-writer version triggers');
