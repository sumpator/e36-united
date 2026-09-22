-- UNITED LIVE category state. Existing entries are intentionally not categorized by guesswork.
PRAGMA foreign_keys = ON;

CREATE TABLE live_category_state (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  discipline TEXT NOT NULL DEFAULT 'show_shine' CHECK(discipline = 'show_shine'),
  category TEXT NOT NULL CHECK(category IN ('Sedan','Coupé','Touring','Cabrio','Compact','Z3','///M Power')),
  status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','live','closed')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  updated_by TEXT REFERENCES members(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(event_id,discipline,category)
);

CREATE INDEX live_category_state_overview
  ON live_category_state(event_id,discipline,status,category);

INSERT INTO schema_migrations(id,description)
VALUES('2026-09-22-united-live-categories','Server-owned Show & Shine category lifecycle without guessing legacy entries');
