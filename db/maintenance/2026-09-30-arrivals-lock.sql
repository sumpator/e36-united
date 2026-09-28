-- Technical cutover only, NOT a migration. Apply atomically before the two migrations.
-- Save the original write marker first; restore it exactly after verified Worker/Pages.
CREATE TRIGGER arrivals_cutover_events_insert BEFORE INSERT ON events
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrivals_cutover_events_update BEFORE UPDATE ON events
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrivals_cutover_events_delete BEFORE DELETE ON events
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrivals_cutover_reservations_insert BEFORE INSERT ON reservations
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrivals_cutover_reservations_update BEFORE UPDATE ON reservations
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrivals_cutover_reservations_delete BEFORE DELETE ON reservations
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrivals_cutover_reservation_accommodation_insert BEFORE INSERT ON reservation_accommodation
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrivals_cutover_reservation_accommodation_update BEFORE UPDATE ON reservation_accommodation
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrivals_cutover_reservation_accommodation_delete BEFORE DELETE ON reservation_accommodation
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrivals_cutover_reservation_requests_insert BEFORE INSERT ON reservation_requests
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrivals_cutover_reservation_requests_update BEFORE UPDATE ON reservation_requests
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrivals_cutover_reservation_requests_delete BEFORE DELETE ON reservation_requests
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrivals_cutover_cars_insert BEFORE INSERT ON cars
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrivals_cutover_cars_update BEFORE UPDATE ON cars
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrivals_cutover_cars_delete BEFORE DELETE ON cars
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrivals_cutover_car_photos_insert BEFORE INSERT ON car_photos
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrivals_cutover_car_photos_update BEFORE UPDATE ON car_photos
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrivals_cutover_car_photos_delete BEFORE DELETE ON car_photos
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrivals_cutover_live_competition_cars_insert BEFORE INSERT ON live_competition_cars
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrivals_cutover_live_competition_cars_update BEFORE UPDATE ON live_competition_cars
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrivals_cutover_live_competition_cars_delete BEFORE DELETE ON live_competition_cars
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrivals_cutover_live_car_photos_insert BEFORE INSERT ON live_car_photos
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrivals_cutover_live_car_photos_update BEFORE UPDATE ON live_car_photos
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrivals_cutover_live_car_photos_delete BEFORE DELETE ON live_car_photos
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrivals_cutover_event_member_presence_insert BEFORE INSERT ON event_member_presence
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrivals_cutover_event_member_presence_update BEFORE UPDATE ON event_member_presence
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrivals_cutover_event_member_presence_delete BEFORE DELETE ON event_member_presence
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrivals_cutover_email_outbox_insert BEFORE INSERT ON email_outbox
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrivals_cutover_email_outbox_update BEFORE UPDATE ON email_outbox
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
CREATE TRIGGER arrivals_cutover_email_outbox_delete BEFORE DELETE ON email_outbox
WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled')
BEGIN SELECT RAISE(ABORT,'arrivals_schema_upgrading'); END;
DELETE FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled';
