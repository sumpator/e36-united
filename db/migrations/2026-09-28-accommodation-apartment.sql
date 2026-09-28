-- Apply as ONE D1 remote file import: D1 isolates the import and rolls it back on failure.
-- Never split into separate requests. Back up and verify the production schema first.
-- Preserve every option, allocation and photo; never reclassify existing records.
PRAGMA defer_foreign_keys = ON;
DROP TRIGGER admin_version_event_accommodation_options_insert;
DROP TRIGGER admin_version_event_accommodation_options_update;
DROP TRIGGER admin_version_event_accommodation_options_delete;
DROP TRIGGER admin_catalog_insert;
DROP TRIGGER admin_allocation_insert;
DROP TRIGGER admin_catalog_update;
DROP TRIGGER admin_allocation_update;
DROP TRIGGER admin_catalog_delete;
DROP TRIGGER admin_accommodation_photos_insert;
DROP TRIGGER admin_accommodation_photos_update;
DROP TRIGGER admin_accommodation_photos_delete;
DROP TRIGGER admin_allocation_delete;
CREATE TABLE _ux28_event_accommodation_options AS SELECT * FROM event_accommodation_options;
CREATE TABLE _ux28_reservation_accommodation AS SELECT * FROM reservation_accommodation;
CREATE TABLE _ux28_event_accommodation_photos AS SELECT * FROM event_accommodation_photos;
DROP TABLE event_accommodation_photos;
DROP TABLE reservation_accommodation;
DROP TABLE event_accommodation_options;
CREATE TABLE event_accommodation_options (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('cabin', 'tent', 'apartment')),
  inventory_mode TEXT NOT NULL CHECK (inventory_mode IN ('limited', 'unlimited')),
  units_total INTEGER NOT NULL DEFAULT 0 CHECK (units_total >= 0),
  capacity_per_unit INTEGER NOT NULL CHECK (capacity_per_unit > 0),
  unit_price_czk INTEGER NOT NULL DEFAULT 0 CHECK (unit_price_czk >= 0),
  person_price_czk INTEGER NOT NULL DEFAULT 0 CHECK (person_price_czk >= 0),
  bedding_fee_per_person_czk INTEGER NOT NULL DEFAULT 0 CHECK (bedding_fee_per_person_czk >= 0),
  city_tax_per_person_per_night_czk INTEGER NOT NULL DEFAULT 0 CHECK (city_tax_per_person_per_night_czk >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id),
  UNIQUE (event_id, name)
);
CREATE TABLE reservation_accommodation (
  reservation_id TEXT PRIMARY KEY,
  option_id TEXT NOT NULL,
  option_name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('cabin', 'tent', 'apartment')),
  people_count INTEGER NOT NULL CHECK (people_count > 0),
  unit_count INTEGER NOT NULL CHECK (unit_count > 0),
  unit_price_czk INTEGER NOT NULL CHECK (unit_price_czk >= 0),
  person_price_czk INTEGER NOT NULL CHECK (person_price_czk >= 0),
  bedding_fee_per_person_czk INTEGER NOT NULL CHECK (bedding_fee_per_person_czk >= 0),
  city_tax_per_person_per_night_czk INTEGER NOT NULL CHECK (city_tax_per_person_per_night_czk >= 0),
  nights INTEGER NOT NULL CHECK (nights >= 0),
  base_total_czk INTEGER NOT NULL CHECK (base_total_czk >= 0),
  person_total_czk INTEGER NOT NULL CHECK (person_total_czk >= 0),
  bedding_total_czk INTEGER NOT NULL CHECK (bedding_total_czk >= 0),
  city_tax_total_czk INTEGER NOT NULL CHECK (city_tax_total_czk >= 0),
  total_czk INTEGER NOT NULL CHECK (total_czk >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
  FOREIGN KEY (option_id) REFERENCES event_accommodation_options(id)
);
CREATE TABLE event_accommodation_photos (
  id TEXT PRIMARY KEY,
  option_id TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 8388608),
  sort_order INTEGER NOT NULL CHECK (sort_order BETWEEN 1 AND 5),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (option_id) REFERENCES event_accommodation_options(id) ON DELETE CASCADE
);
INSERT INTO event_accommodation_options SELECT * FROM _ux28_event_accommodation_options;
INSERT INTO reservation_accommodation SELECT * FROM _ux28_reservation_accommodation;
INSERT INTO event_accommodation_photos SELECT * FROM _ux28_event_accommodation_photos;
-- Fail the entire import before discarding copies if any value or FK differs.
CREATE TABLE _ux28_preservation_assert (ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO _ux28_preservation_assert SELECT CASE WHEN
  NOT EXISTS(SELECT * FROM event_accommodation_options EXCEPT SELECT * FROM _ux28_event_accommodation_options)
  AND NOT EXISTS(SELECT * FROM _ux28_event_accommodation_options EXCEPT SELECT * FROM event_accommodation_options)
  AND NOT EXISTS(SELECT * FROM reservation_accommodation EXCEPT SELECT * FROM _ux28_reservation_accommodation)
  AND NOT EXISTS(SELECT * FROM _ux28_reservation_accommodation EXCEPT SELECT * FROM reservation_accommodation)
  AND NOT EXISTS(SELECT * FROM event_accommodation_photos EXCEPT SELECT * FROM _ux28_event_accommodation_photos)
  AND NOT EXISTS(SELECT * FROM _ux28_event_accommodation_photos EXCEPT SELECT * FROM event_accommodation_photos)
  AND NOT EXISTS(SELECT * FROM pragma_foreign_key_check)
THEN 1 ELSE 0 END;
DROP TABLE _ux28_preservation_assert;
DROP TABLE _ux28_event_accommodation_options;
DROP TABLE _ux28_reservation_accommodation;
DROP TABLE _ux28_event_accommodation_photos;
CREATE INDEX idx_event_accommodation_photos_option_order
ON event_accommodation_photos(option_id, sort_order, id);
CREATE INDEX idx_event_accommodation_event_active
  ON event_accommodation_options(event_id, active, sort_order, name);
CREATE INDEX idx_reservation_accommodation_option
  ON reservation_accommodation(option_id, unit_count);
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
CREATE TRIGGER admin_catalog_delete AFTER DELETE ON event_accommodation_options
BEGIN
  INSERT INTO admin_resource_versions(resource_type, resource_id, revision) VALUES ('accommodation-catalog', OLD.event_id, 1)
  ON CONFLICT(resource_type, resource_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER admin_accommodation_photos_insert AFTER INSERT ON event_accommodation_photos
BEGIN
  INSERT INTO admin_resource_versions(resource_type, resource_id, revision) VALUES ('accommodation', NEW.option_id, 1)
  ON CONFLICT(resource_type, resource_id) DO UPDATE SET revision = revision + 1;
  INSERT INTO admin_resource_versions(resource_type, resource_id, revision)
  SELECT 'accommodation-catalog', event_id, 1 FROM event_accommodation_options WHERE id = NEW.option_id
  ON CONFLICT(resource_type, resource_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER admin_accommodation_photos_update AFTER UPDATE ON event_accommodation_photos
BEGIN
  INSERT INTO admin_resource_versions(resource_type, resource_id, revision) VALUES ('accommodation', NEW.option_id, 1)
  ON CONFLICT(resource_type, resource_id) DO UPDATE SET revision = revision + 1;
  INSERT INTO admin_resource_versions(resource_type, resource_id, revision)
  SELECT 'accommodation-catalog', event_id, 1 FROM event_accommodation_options WHERE id = NEW.option_id
  ON CONFLICT(resource_type, resource_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER admin_accommodation_photos_delete AFTER DELETE ON event_accommodation_photos
BEGIN
  INSERT INTO admin_resource_versions(resource_type, resource_id, revision) VALUES ('accommodation', OLD.option_id, 1)
  ON CONFLICT(resource_type, resource_id) DO UPDATE SET revision = revision + 1;
  INSERT INTO admin_resource_versions(resource_type, resource_id, revision)
  SELECT 'accommodation-catalog', event_id, 1 FROM event_accommodation_options WHERE id = OLD.option_id
  ON CONFLICT(resource_type, resource_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER admin_allocation_delete AFTER DELETE ON reservation_accommodation
BEGIN
  INSERT INTO admin_resource_versions(resource_type, resource_id, revision) VALUES ('reservation', OLD.reservation_id, 1)
  ON CONFLICT(resource_type, resource_id) DO UPDATE SET revision = revision + 1;
END;
INSERT INTO schema_migrations(id,description) VALUES('2026-09-28-accommodation-apartment','Apartment kind; preserve accommodation records and revision triggers');
PRAGMA foreign_key_check;
