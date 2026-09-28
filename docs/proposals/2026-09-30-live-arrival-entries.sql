-- PROPOSAL ONLY: additional schema change NOT approved for production.
-- Requires 2026-09-30-arrivals. Execute as one transaction under technical write protection.
-- Existing IDs and values copied verbatim. No inferred arrival, member or car conversion.
PRAGMA defer_foreign_keys=ON;
CREATE TABLE _guest_proposal_live_entries AS SELECT * FROM live_entries;
CREATE TABLE _guest_proposal_live_competition_state AS SELECT * FROM live_competition_state;
CREATE TABLE _guest_proposal_live_public_votes AS SELECT * FROM live_public_votes;
CREATE TABLE _guest_proposal_live_judge_scores AS SELECT * FROM live_judge_scores;
CREATE TABLE _guest_proposal_live_judge_photos AS SELECT * FROM live_judge_photos;
DROP TABLE live_judge_photos;
DROP TABLE live_judge_scores;
DROP TABLE live_public_votes;
DROP TABLE live_competition_state;
DROP TABLE live_entries;
CREATE TABLE live_entries (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  discipline TEXT NOT NULL CHECK(discipline IN ('show_shine','best_exhaust')),
  member_id TEXT REFERENCES members(id) ON DELETE CASCADE,
  car_id TEXT REFERENCES cars(id) ON DELETE RESTRICT,
  competition_car_id TEXT,
  arrival_id TEXT REFERENCES event_arrivals(id) ON DELETE RESTRICT,
  category TEXT,
  original_m_confirmed_by TEXT REFERENCES members(id) ON DELETE RESTRICT,
  presented_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, voting_closed INTEGER NOT NULL DEFAULT 0 CHECK(voting_closed IN (0,1)),
  CHECK((car_id IS NOT NULL)+(competition_car_id IS NOT NULL)+(arrival_id IS NOT NULL)=1),
  CHECK(member_id IS NOT NULL OR arrival_id IS NOT NULL),
  FOREIGN KEY(competition_car_id,event_id,member_id)
    REFERENCES live_competition_cars(id,event_id,member_id) ON DELETE RESTRICT,
  UNIQUE(event_id,discipline,car_id),
  UNIQUE(event_id,discipline,competition_car_id)
);
INSERT INTO live_entries(id,event_id,discipline,member_id,car_id,competition_car_id,category,original_m_confirmed_by,presented_at,created_at,voting_closed) SELECT id,event_id,discipline,member_id,car_id,competition_car_id,category,original_m_confirmed_by,presented_at,created_at,voting_closed FROM _guest_proposal_live_entries;
CREATE TABLE live_competition_state (event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,discipline TEXT NOT NULL CHECK(discipline IN ('show_shine','best_exhaust')),status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','live','paused','closed','published')),current_entry_id TEXT REFERENCES live_entries(id) ON DELETE SET NULL,version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),updated_by TEXT REFERENCES members(id) ON DELETE SET NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(event_id,discipline));
INSERT INTO live_competition_state(event_id,discipline,status,current_entry_id,version,updated_by,updated_at) SELECT event_id,discipline,status,current_entry_id,version,updated_by,updated_at FROM _guest_proposal_live_competition_state;
CREATE TABLE live_public_votes (id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,discipline TEXT NOT NULL CHECK(discipline IN ('show_shine','best_exhaust')),entry_id TEXT NOT NULL REFERENCES live_entries(id) ON DELETE CASCADE,voter_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 10),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(event_id,discipline,entry_id,voter_id));
INSERT INTO live_public_votes(id,event_id,discipline,entry_id,voter_id,score,created_at,updated_at) SELECT id,event_id,discipline,entry_id,voter_id,score,created_at,updated_at FROM _guest_proposal_live_public_votes;
CREATE TABLE live_judge_scores (id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,entry_id TEXT NOT NULL REFERENCES live_entries(id) ON DELETE CASCADE,judge_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,scores_json TEXT NOT NULL CHECK(json_valid(scores_json)),note TEXT,submitted INTEGER NOT NULL DEFAULT 0 CHECK(submitted IN (0,1)),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, version INTEGER NOT NULL DEFAULT 1, updated_by TEXT REFERENCES members(id), correction_reason TEXT,UNIQUE(event_id,entry_id,judge_id));
INSERT INTO live_judge_scores(id,event_id,entry_id,judge_id,scores_json,note,submitted,created_at,updated_at,version,updated_by,correction_reason) SELECT id,event_id,entry_id,judge_id,scores_json,note,submitted,created_at,updated_at,version,updated_by,correction_reason FROM _guest_proposal_live_judge_scores;
CREATE TABLE live_judge_photos (id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,entry_id TEXT NOT NULL REFERENCES live_entries(id) ON DELETE CASCADE,judge_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,r2_key TEXT NOT NULL UNIQUE,mime_type TEXT NOT NULL,size_bytes INTEGER NOT NULL,gallery_submission_id TEXT REFERENCES gallery_submissions(id) ON DELETE SET NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
INSERT INTO live_judge_photos(id,event_id,entry_id,judge_id,r2_key,mime_type,size_bytes,gallery_submission_id,created_at) SELECT id,event_id,entry_id,judge_id,r2_key,mime_type,size_bytes,gallery_submission_id,created_at FROM _guest_proposal_live_judge_photos;
CREATE INDEX live_entries_event ON live_entries(event_id,discipline,presented_at,id);
CREATE UNIQUE INDEX live_judge_one_official_set ON live_judge_scores(event_id,entry_id);
CREATE INDEX live_judge_photos_entry ON live_judge_photos(event_id,entry_id,judge_id,created_at);
CREATE INDEX live_judge_scores_results ON live_judge_scores(event_id,entry_id,submitted);
CREATE INDEX live_public_votes_results ON live_public_votes(event_id,discipline,entry_id);
CREATE TRIGGER live_competition_state_revision_delete AFTER DELETE ON live_competition_state
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
CREATE TRIGGER live_competition_state_write_guard_delete BEFORE DELETE ON live_competition_state
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER live_competition_state_write_guard_insert BEFORE INSERT ON live_competition_state
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER live_competition_state_write_guard_update BEFORE UPDATE ON live_competition_state
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER live_entries_revision_delete AFTER DELETE ON live_entries
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
CREATE TRIGGER live_entries_write_guard_delete BEFORE DELETE ON live_entries
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER live_entries_write_guard_insert BEFORE INSERT ON live_entries
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER live_entries_write_guard_update BEFORE UPDATE ON live_entries
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER live_judge_correction_audit AFTER UPDATE ON live_judge_scores
WHEN OLD.submitted=1 AND NEW.version<>OLD.version
BEGIN
 INSERT INTO live_judge_score_audit(event_id,entry_id,author_id,changed_by,reason,before_scores,after_scores,before_note,after_note,from_version,to_version)
 VALUES(OLD.event_id,OLD.entry_id,OLD.judge_id,NEW.updated_by,NEW.correction_reason,OLD.scores_json,NEW.scores_json,OLD.note,NEW.note,OLD.version,NEW.version);
END;
CREATE TRIGGER live_judge_photos_revision_delete AFTER DELETE ON live_judge_photos
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
CREATE TRIGGER live_judge_photos_write_guard_delete BEFORE DELETE ON live_judge_photos
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER live_judge_photos_write_guard_insert BEFORE INSERT ON live_judge_photos
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER live_judge_photos_write_guard_update BEFORE UPDATE ON live_judge_photos
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER live_judge_scores_revision_delete AFTER DELETE ON live_judge_scores
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
CREATE TRIGGER live_judge_scores_write_guard_delete BEFORE DELETE ON live_judge_scores
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER live_judge_scores_write_guard_insert BEFORE INSERT ON live_judge_scores
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER live_judge_scores_write_guard_update BEFORE UPDATE ON live_judge_scores
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER live_public_votes_revision_delete AFTER DELETE ON live_public_votes
BEGIN
  INSERT INTO live_event_revisions(event_id,revision) SELECT OLD.event_id,1 WHERE EXISTS(SELECT 1 FROM events WHERE id=OLD.event_id)
  ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
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
CREATE TRIGGER live_public_votes_write_guard_delete BEFORE DELETE ON live_public_votes
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER live_public_votes_write_guard_insert BEFORE INSERT ON live_public_votes
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
CREATE TRIGGER live_public_votes_write_guard_update BEFORE UPDATE ON live_public_votes
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;

CREATE UNIQUE INDEX live_entries_arrival ON live_entries(event_id,discipline,arrival_id);
CREATE VIEW live_entry_vehicles AS
SELECT e.id entry_id,e.event_id,COALESCE(a.member_id,e.member_id) member_id,
  COALESCE(a.car_key,e.car_id,e.competition_car_id) car_id,
  COALESCE(a.model,c.model) model,COALESCE(a.body,c.body) body,COALESCE(c.nickname,'') nickname,
  COALESCE(NULLIF(m.nickname,''),NULLIF(a.nickname,''),NULLIF(m.name,''),NULLIF(a.name,''),'Účastník č. '||substr(a.id,-8)) participant_name,
  e.arrival_id
FROM live_entries e
LEFT JOIN event_arrivals a ON a.id=e.arrival_id AND a.event_id=e.event_id
LEFT JOIN live_vehicle_catalog c ON c.id=COALESCE(e.car_id,e.competition_car_id) AND (c.event_id IS NULL OR c.event_id=e.event_id)
LEFT JOIN members m ON m.id=COALESCE(a.member_id,e.member_id);
CREATE TRIGGER live_entry_arrival_identity_insert BEFORE INSERT ON live_entries
BEGIN
 SELECT CASE WHEN NEW.arrival_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM event_arrivals a WHERE a.id=NEW.arrival_id AND a.event_id=NEW.event_id
    AND a.arrived_at IS NOT NULL AND (NEW.member_id IS NULL OR NEW.member_id=a.member_id)
 ) THEN RAISE(ABORT,'confirmed_arrival_identity_required') END;
 SELECT CASE WHEN EXISTS(
  SELECT 1 FROM live_entry_vehicles v WHERE v.entry_id<>NEW.id AND v.event_id=NEW.event_id
    AND v.car_id=COALESCE(NEW.car_id,NEW.competition_car_id,(SELECT car_key FROM event_arrivals WHERE id=NEW.arrival_id))
    AND EXISTS(SELECT 1 FROM live_entries e WHERE e.id=v.entry_id AND e.discipline=NEW.discipline)
 ) THEN RAISE(ABORT,'duplicate_physical_competition_car') END;
END;
CREATE TRIGGER live_entry_arrival_identity_update BEFORE UPDATE ON live_entries
BEGIN
 SELECT CASE WHEN NEW.arrival_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM event_arrivals a WHERE a.id=NEW.arrival_id AND a.event_id=NEW.event_id
    AND a.arrived_at IS NOT NULL AND (NEW.member_id IS NULL OR NEW.member_id=a.member_id)
 ) THEN RAISE(ABORT,'confirmed_arrival_identity_required') END;
 SELECT CASE WHEN EXISTS(
  SELECT 1 FROM live_entry_vehicles v WHERE v.entry_id<>NEW.id AND v.event_id=NEW.event_id
    AND v.car_id=COALESCE(NEW.car_id,NEW.competition_car_id,(SELECT car_key FROM event_arrivals WHERE id=NEW.arrival_id))
    AND EXISTS(SELECT 1 FROM live_entries e WHERE e.id=v.entry_id AND e.discipline=NEW.discipline)
 ) THEN RAISE(ABORT,'duplicate_physical_competition_car') END;
END;
CREATE TRIGGER live_arrival_car_immutable BEFORE UPDATE OF car_key,event_id ON event_arrivals
WHEN (NEW.car_key<>OLD.car_key OR NEW.event_id<>OLD.event_id) AND EXISTS(SELECT 1 FROM live_entries WHERE arrival_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'competition_arrival_identity_locked'); END;
DROP TABLE _guest_proposal_live_judge_photos;
DROP TABLE _guest_proposal_live_judge_scores;
DROP TABLE _guest_proposal_live_public_votes;
DROP TABLE _guest_proposal_live_competition_state;
DROP TABLE _guest_proposal_live_entries;
INSERT INTO schema_migrations(id,description) VALUES('2026-09-30-live-arrival-entries','Direct confirmed-arrival competition identity without synthetic member or copied car');
