-- UNITED LIVE v1. Additive event-scoped live program, presence and competition data.
PRAGMA foreign_keys = ON;

ALTER TABLE events ADD COLUMN live_enabled INTEGER NOT NULL DEFAULT 0
  CHECK (live_enabled IN (0,1));

ALTER TABLE gallery_submissions ADD COLUMN event_id TEXT
  REFERENCES events(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX events_single_live
  ON events(live_enabled) WHERE live_enabled = 1;

CREATE TABLE event_program_items (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  title TEXT NOT NULL,
  venue TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK(status IN ('scheduled','changed','cancelled')),
  visible INTEGER NOT NULL DEFAULT 1 CHECK(visible IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX event_program_schedule
  ON event_program_items(event_id,visible,day,starts_at,sort_order,id);

CREATE TABLE event_live_judges (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_by TEXT REFERENCES members(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(event_id,member_id)
);

CREATE TABLE event_member_presence (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  present INTEGER NOT NULL DEFAULT 1 CHECK(present IN (0,1)),
  confirmed_by TEXT REFERENCES members(id) ON DELETE SET NULL,
  confirmed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(event_id,member_id)
);

CREATE TABLE live_entries (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  discipline TEXT NOT NULL CHECK(discipline IN ('show_shine','best_exhaust')),
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  car_id TEXT NOT NULL REFERENCES cars(id) ON DELETE RESTRICT,
  category TEXT,
  presented_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id,discipline,car_id)
);
CREATE INDEX live_entries_event ON live_entries(event_id,discipline,presented_at,id);

CREATE TABLE live_competition_state (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  discipline TEXT NOT NULL CHECK(discipline IN ('show_shine','best_exhaust')),
  status TEXT NOT NULL DEFAULT 'idle'
    CHECK(status IN ('idle','live','paused','closed','published')),
  current_entry_id TEXT REFERENCES live_entries(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  updated_by TEXT REFERENCES members(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(event_id,discipline)
);

CREATE TABLE live_public_votes (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  discipline TEXT NOT NULL CHECK(discipline IN ('show_shine','best_exhaust')),
  entry_id TEXT NOT NULL REFERENCES live_entries(id) ON DELETE CASCADE,
  voter_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 10),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id,discipline,entry_id,voter_id)
);
CREATE INDEX live_public_votes_results ON live_public_votes(event_id,discipline,entry_id);

CREATE TABLE live_judge_scores (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  entry_id TEXT NOT NULL REFERENCES live_entries(id) ON DELETE CASCADE,
  judge_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  scores_json TEXT NOT NULL CHECK(json_valid(scores_json)),
  note TEXT,
  submitted INTEGER NOT NULL DEFAULT 0 CHECK(submitted IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id,entry_id,judge_id)
);
CREATE INDEX live_judge_scores_results ON live_judge_scores(event_id,entry_id,submitted);

CREATE TABLE live_judge_photos (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  entry_id TEXT NOT NULL REFERENCES live_entries(id) ON DELETE CASCADE,
  judge_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  gallery_submission_id TEXT REFERENCES gallery_submissions(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX live_judge_photos_entry ON live_judge_photos(event_id,entry_id,judge_id,created_at);

-- One-time first activation only. A later Admin disable remains authoritative.
UPDATE events SET live_enabled = 1
WHERE is_current = 1
  AND NOT EXISTS (SELECT 1 FROM events WHERE live_enabled = 1);

INSERT INTO schema_migrations(id,description)
VALUES('2026-09-22-united-live','UNITED LIVE event, program, presence, voting, jury and internal media foundation');
