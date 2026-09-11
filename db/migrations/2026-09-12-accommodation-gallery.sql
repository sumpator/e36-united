-- Additive accommodation gallery metadata. Existing cover objects stay in R2 unchanged.
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

CREATE INDEX idx_event_accommodation_photos_option_order
ON event_accommodation_photos(option_id, sort_order, id);

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

INSERT INTO schema_migrations(id, description)
VALUES('2026-09-12-accommodation-gallery', 'Add ordered accommodation gallery metadata without moving existing cover media');
