-- One official score set per entry. Duplicate data aborts here; never choose or merge it.
CREATE UNIQUE INDEX live_judge_one_official_set ON live_judge_scores(event_id,entry_id);
ALTER TABLE live_judge_scores ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE live_judge_scores ADD COLUMN updated_by TEXT REFERENCES members(id);
ALTER TABLE live_judge_scores ADD COLUMN correction_reason TEXT;
CREATE TABLE live_judge_score_audit (
 id INTEGER PRIMARY KEY, event_id TEXT NOT NULL, entry_id TEXT NOT NULL,
 author_id TEXT NOT NULL, changed_by TEXT NOT NULL, changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 reason TEXT NOT NULL, before_scores TEXT NOT NULL, after_scores TEXT NOT NULL,
 before_note TEXT, after_note TEXT, from_version INTEGER NOT NULL, to_version INTEGER NOT NULL
);
CREATE TRIGGER live_judge_correction_audit AFTER UPDATE ON live_judge_scores
WHEN OLD.submitted=1 AND NEW.version<>OLD.version
BEGIN
 INSERT INTO live_judge_score_audit(event_id,entry_id,author_id,changed_by,reason,before_scores,after_scores,before_note,after_note,from_version,to_version)
 VALUES(OLD.event_id,OLD.entry_id,OLD.judge_id,NEW.updated_by,NEW.correction_reason,OLD.scores_json,NEW.scores_json,OLD.note,NEW.note,OLD.version,NEW.version);
END;
CREATE TABLE live_car_photos (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), car_id TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES members(id), r2_key TEXT NOT NULL UNIQUE,
 mime_type TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX live_car_photos_vehicle ON live_car_photos(event_id,car_id);
CREATE TRIGGER live_car_photos_revision AFTER INSERT ON live_car_photos
BEGIN
 INSERT INTO live_event_revisions(event_id,revision) VALUES(NEW.event_id,1)
 ON CONFLICT(event_id) DO UPDATE SET revision=revision+1;
END;
INSERT INTO schema_migrations(id,description) VALUES('2026-09-29-live-official-scoring','One official jury set, versioned correction audit and separate competition photography');
