-- Execute with LIVE writes gated by the schema marker and a verified backup.
-- D1 keeps foreign keys enabled. Remove dependants before rebuilding the parent;
-- copying only live_entries would cascade-delete scores/votes or null the current entry.
CREATE TABLE live_competition_cars (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  model TEXT NOT NULL CHECK(length(trim(model)) BETWEEN 1 AND 120),
  body TEXT NOT NULL CHECK(body IN ('Sedan','Coupé','Touring','Cabrio','Compact','Z3')),
  engine TEXT NOT NULL DEFAULT '',
  original_m INTEGER NOT NULL DEFAULT 0 CHECK(original_m IN (0,1)),
  created_by TEXT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  r2_key TEXT UNIQUE,
  mime_type TEXT,
  size_bytes INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(id,event_id,member_id)
);
CREATE INDEX live_competition_cars_owner ON live_competition_cars(event_id,member_id,id);
CREATE TABLE _live_v2_backup_live_entries AS SELECT * FROM live_entries;
CREATE TABLE _live_v2_backup_live_competition_state AS SELECT * FROM live_competition_state;
CREATE TABLE _live_v2_backup_live_public_votes AS SELECT * FROM live_public_votes;
CREATE TABLE _live_v2_backup_live_judge_scores AS SELECT * FROM live_judge_scores;
CREATE TABLE _live_v2_backup_live_judge_photos AS SELECT * FROM live_judge_photos;
DROP TABLE live_competition_state;
DROP TABLE live_public_votes;
DROP TABLE live_judge_scores;
DROP TABLE live_judge_photos;
DROP TABLE live_entries;
CREATE TABLE live_entries (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  discipline TEXT NOT NULL CHECK(discipline IN ('show_shine','best_exhaust')),
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  car_id TEXT REFERENCES cars(id) ON DELETE RESTRICT,
  competition_car_id TEXT,
  category TEXT,
  original_m_confirmed_by TEXT REFERENCES members(id) ON DELETE RESTRICT,
  presented_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK((car_id IS NOT NULL) <> (competition_car_id IS NOT NULL)),
  FOREIGN KEY(competition_car_id,event_id,member_id)
    REFERENCES live_competition_cars(id,event_id,member_id) ON DELETE RESTRICT,
  UNIQUE(event_id,discipline,car_id),
  UNIQUE(event_id,discipline,competition_car_id)
);
CREATE INDEX live_entries_event ON live_entries(event_id,discipline,presented_at,id);
INSERT INTO live_entries(id,event_id,discipline,member_id,car_id,category,presented_at,created_at)
  SELECT id,event_id,discipline,member_id,car_id,category,presented_at,created_at FROM _live_v2_backup_live_entries;
CREATE TABLE live_competition_state (event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,discipline TEXT NOT NULL CHECK(discipline IN ('show_shine','best_exhaust')),status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','live','paused','closed','published')),current_entry_id TEXT REFERENCES live_entries(id) ON DELETE SET NULL,version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),updated_by TEXT REFERENCES members(id) ON DELETE SET NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(event_id,discipline));
INSERT INTO live_competition_state SELECT * FROM _live_v2_backup_live_competition_state;
CREATE TABLE live_public_votes (id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,discipline TEXT NOT NULL CHECK(discipline IN ('show_shine','best_exhaust')),entry_id TEXT NOT NULL REFERENCES live_entries(id) ON DELETE CASCADE,voter_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 10),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(event_id,discipline,entry_id,voter_id));
CREATE INDEX live_public_votes_results ON live_public_votes(event_id,discipline,entry_id);
INSERT INTO live_public_votes SELECT * FROM _live_v2_backup_live_public_votes;
CREATE TABLE live_judge_scores (id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,entry_id TEXT NOT NULL REFERENCES live_entries(id) ON DELETE CASCADE,judge_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,scores_json TEXT NOT NULL CHECK(json_valid(scores_json)),note TEXT,submitted INTEGER NOT NULL DEFAULT 0 CHECK(submitted IN (0,1)),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(event_id,entry_id,judge_id));
CREATE INDEX live_judge_scores_results ON live_judge_scores(event_id,entry_id,submitted);
INSERT INTO live_judge_scores SELECT * FROM _live_v2_backup_live_judge_scores;
CREATE TABLE live_judge_photos (id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,entry_id TEXT NOT NULL REFERENCES live_entries(id) ON DELETE CASCADE,judge_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,r2_key TEXT NOT NULL UNIQUE,mime_type TEXT NOT NULL,size_bytes INTEGER NOT NULL,gallery_submission_id TEXT REFERENCES gallery_submissions(id) ON DELETE SET NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX live_judge_photos_entry ON live_judge_photos(event_id,entry_id,judge_id,created_at);
INSERT INTO live_judge_photos SELECT * FROM _live_v2_backup_live_judge_photos;
DROP TABLE _live_v2_backup_live_competition_state;
DROP TABLE _live_v2_backup_live_public_votes;
DROP TABLE _live_v2_backup_live_judge_scores;
DROP TABLE _live_v2_backup_live_judge_photos;
DROP TABLE _live_v2_backup_live_entries;

-- A cheap monotonic revision: UPDATE of an existing vote/score also invalidates readers.
CREATE TRIGGER IF NOT EXISTS events_live_write_guard BEFORE UPDATE OF live_enabled ON events
WHEN OLD.live_enabled<>NEW.live_enabled AND NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TABLE live_event_revisions (
  event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0)
);
INSERT INTO live_event_revisions(event_id) SELECT id FROM events;
CREATE TRIGGER live_public_votes_revision_insert AFTER INSERT ON live_public_votes
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT NEW.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=NEW.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER live_public_votes_revision_update AFTER UPDATE ON live_public_votes
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT NEW.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=NEW.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER live_public_votes_revision_delete AFTER DELETE ON live_public_votes
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT OLD.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=OLD.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER live_judge_scores_revision_insert AFTER INSERT ON live_judge_scores
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT NEW.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=NEW.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER live_judge_scores_revision_update AFTER UPDATE ON live_judge_scores
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT NEW.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=NEW.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER live_judge_scores_revision_delete AFTER DELETE ON live_judge_scores
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT OLD.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=OLD.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER live_judge_photos_revision_insert AFTER INSERT ON live_judge_photos
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT NEW.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=NEW.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER live_judge_photos_revision_update AFTER UPDATE ON live_judge_photos
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT NEW.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=NEW.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER live_judge_photos_revision_delete AFTER DELETE ON live_judge_photos
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT OLD.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=OLD.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER event_member_presence_revision_insert AFTER INSERT ON event_member_presence
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT NEW.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=NEW.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER event_member_presence_revision_update AFTER UPDATE ON event_member_presence
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT NEW.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=NEW.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER event_member_presence_revision_delete AFTER DELETE ON event_member_presence
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT OLD.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=OLD.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER event_program_items_revision_insert AFTER INSERT ON event_program_items
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT NEW.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=NEW.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER event_program_items_revision_update AFTER UPDATE ON event_program_items
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT NEW.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=NEW.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER event_program_items_revision_delete AFTER DELETE ON event_program_items
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT OLD.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=OLD.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER live_competition_state_revision_insert AFTER INSERT ON live_competition_state
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT NEW.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=NEW.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER live_competition_state_revision_update AFTER UPDATE ON live_competition_state
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT NEW.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=NEW.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER live_competition_state_revision_delete AFTER DELETE ON live_competition_state
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT OLD.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=OLD.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER live_category_state_revision_insert AFTER INSERT ON live_category_state
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT NEW.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=NEW.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER live_category_state_revision_update AFTER UPDATE ON live_category_state
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT NEW.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=NEW.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER live_category_state_revision_delete AFTER DELETE ON live_category_state
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT OLD.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=OLD.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER live_entries_revision_insert AFTER INSERT ON live_entries
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT NEW.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=NEW.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER live_entries_revision_update AFTER UPDATE ON live_entries
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT NEW.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=NEW.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER live_entries_revision_delete AFTER DELETE ON live_entries
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT OLD.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=OLD.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER live_competition_cars_revision_insert AFTER INSERT ON live_competition_cars
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT NEW.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=NEW.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER live_competition_cars_revision_update AFTER UPDATE ON live_competition_cars
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT NEW.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=NEW.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER live_competition_cars_revision_delete AFTER DELETE ON live_competition_cars
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT OLD.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=OLD.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER event_live_judges_revision_insert AFTER INSERT ON event_live_judges
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT NEW.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=NEW.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER event_live_judges_revision_update AFTER UPDATE ON event_live_judges
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT NEW.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=NEW.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER event_live_judges_revision_delete AFTER DELETE ON event_live_judges
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT OLD.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=OLD.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
-- Unified read-only vehicle projection; garage records retain their own identity.
CREATE VIEW live_vehicle_catalog AS
SELECT c.id,c.member_id,NULL event_id,c.model,c.body,c.nickname,c.is_primary,
  NULL engine,0 original_m,'garage' source,
  (SELECT p.id FROM car_photos p WHERE p.car_id=c.id ORDER BY p.sort_order,p.id LIMIT 1) photo_id
FROM cars c
UNION ALL
SELECT id,member_id,event_id,model,body,'' nickname,0 is_primary,
  engine,original_m,'competition' source,CASE WHEN r2_key IS NOT NULL THEN id END photo_id
FROM live_competition_cars;
CREATE TRIGGER IF NOT EXISTS live_entries_write_guard_insert BEFORE INSERT ON live_entries
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER IF NOT EXISTS live_entries_write_guard_update BEFORE UPDATE ON live_entries
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER IF NOT EXISTS live_entries_write_guard_delete BEFORE DELETE ON live_entries
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER IF NOT EXISTS live_competition_state_write_guard_insert BEFORE INSERT ON live_competition_state
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER IF NOT EXISTS live_competition_state_write_guard_update BEFORE UPDATE ON live_competition_state
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER IF NOT EXISTS live_competition_state_write_guard_delete BEFORE DELETE ON live_competition_state
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER IF NOT EXISTS live_public_votes_write_guard_insert BEFORE INSERT ON live_public_votes
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER IF NOT EXISTS live_public_votes_write_guard_update BEFORE UPDATE ON live_public_votes
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER IF NOT EXISTS live_public_votes_write_guard_delete BEFORE DELETE ON live_public_votes
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER IF NOT EXISTS live_judge_scores_write_guard_insert BEFORE INSERT ON live_judge_scores
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER IF NOT EXISTS live_judge_scores_write_guard_update BEFORE UPDATE ON live_judge_scores
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER IF NOT EXISTS live_judge_scores_write_guard_delete BEFORE DELETE ON live_judge_scores
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER IF NOT EXISTS live_judge_photos_write_guard_insert BEFORE INSERT ON live_judge_photos
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER IF NOT EXISTS live_judge_photos_write_guard_update BEFORE UPDATE ON live_judge_photos
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER IF NOT EXISTS live_judge_photos_write_guard_delete BEFORE DELETE ON live_judge_photos
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER IF NOT EXISTS live_category_state_write_guard_insert BEFORE INSERT ON live_category_state
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER IF NOT EXISTS live_category_state_write_guard_update BEFORE UPDATE ON live_category_state
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER IF NOT EXISTS live_category_state_write_guard_delete BEFORE DELETE ON live_category_state
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER IF NOT EXISTS event_program_items_write_guard_insert BEFORE INSERT ON event_program_items
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER IF NOT EXISTS event_program_items_write_guard_update BEFORE UPDATE ON event_program_items
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER IF NOT EXISTS event_program_items_write_guard_delete BEFORE DELETE ON event_program_items
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER IF NOT EXISTS event_live_judges_write_guard_insert BEFORE INSERT ON event_live_judges
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER IF NOT EXISTS event_live_judges_write_guard_update BEFORE UPDATE ON event_live_judges
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER IF NOT EXISTS event_live_judges_write_guard_delete BEFORE DELETE ON event_live_judges
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER IF NOT EXISTS event_member_presence_write_guard_insert BEFORE INSERT ON event_member_presence
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER IF NOT EXISTS event_member_presence_write_guard_update BEFORE UPDATE ON event_member_presence
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER IF NOT EXISTS event_member_presence_write_guard_delete BEFORE DELETE ON event_member_presence
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER IF NOT EXISTS live_competition_cars_write_guard_insert BEFORE INSERT ON live_competition_cars
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER IF NOT EXISTS live_competition_cars_write_guard_update BEFORE UPDATE ON live_competition_cars
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER IF NOT EXISTS live_competition_cars_write_guard_delete BEFORE DELETE ON live_competition_cars
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
INSERT INTO schema_migrations(id,description) VALUES('2026-09-23-live-competition-cars','Preserve LIVE identities and related records; separate event cars and monotonic read revision');
