-- E36 United: current event, configurable accommodation and reservation snapshots.
-- Apply exactly once after verifying the production events/reservations columns.
-- No accommodation inventory or prices are seeded by this migration.

ALTER TABLE events ADD COLUMN is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1));
ALTER TABLE events ADD COLUMN full_weekend_nights INTEGER NOT NULL DEFAULT 2 CHECK (full_weekend_nights >= 0);
ALTER TABLE events ADD COLUMN saturday_only_nights INTEGER NOT NULL DEFAULT 1 CHECK (saturday_only_nights >= 0);

-- Preserve an explicitly selected current event. On first application only, select
-- the same newest event the application used before this migration.
UPDATE events
SET is_current = CASE
  WHEN id = (SELECT id FROM events ORDER BY year DESC LIMIT 1) THEN 1
  ELSE 0
END
WHERE NOT EXISTS (SELECT 1 FROM events WHERE is_current = 1);

-- The partial unique index guarantees at most one current event. The UPDATE
-- above establishes one when events exist; the admin switch keeps that
-- application-level invariant by clearing the old flag and setting the new one
-- in a single D1 batch.
CREATE UNIQUE INDEX idx_events_single_current
  ON events(is_current)
  WHERE is_current = 1;

CREATE TABLE event_accommodation_options (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('cabin', 'tent')),
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

CREATE INDEX idx_event_accommodation_event_active
  ON event_accommodation_options(event_id, active, sort_order, name);

CREATE TABLE reservation_accommodation (
  reservation_id TEXT PRIMARY KEY,
  option_id TEXT NOT NULL,
  option_name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('cabin', 'tent')),
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

CREATE INDEX idx_reservation_accommodation_option
  ON reservation_accommodation(option_id, unit_count);
