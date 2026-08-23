-- Optional indexes for the existing E36 United D1 schema.
-- Safe to run more than once.
CREATE INDEX IF NOT EXISTS idx_car_photos_car_sort ON car_photos(car_id, sort_order, created_at);
CREATE INDEX IF NOT EXISTS idx_gallery_status_created ON gallery_submissions(status, created_at);
CREATE INDEX IF NOT EXISTS idx_gallery_member_created ON gallery_submissions(member_id, created_at);
