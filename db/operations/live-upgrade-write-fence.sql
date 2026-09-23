-- Temporary database-side fence also stops requests still running on the previous Worker.
-- Install AFTER the gated Worker is active; remove by the explicit completion marker.
CREATE TRIGGER IF NOT EXISTS events_live_write_guard BEFORE UPDATE OF live_enabled ON events
WHEN OLD.live_enabled<>NEW.live_enabled AND NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'live_schema_upgrading'); END;
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
