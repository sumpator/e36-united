-- Stage 2: apply once after admin-safe-operations; provision existing IDs explicitly.
-- No business/profile rewrite or read-side token generation.
CREATE TABLE member_qr_identities (
  member_id TEXT PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE CHECK(length(token)=48 AND token NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX admin_members_order ON members(created_at DESC,id);
CREATE INDEX admin_car_photos_car ON car_photos(car_id,sort_order,id);
CREATE INDEX admin_gallery_member ON gallery_submissions(member_id,status,created_at DESC,id);
CREATE INDEX admin_recipients_member ON mailing_campaign_recipients(member_id,created_at DESC,id);
CREATE INDEX admin_recipients_contact ON mailing_campaign_recipients(contact_id,created_at DESC,id);
CREATE INDEX admin_history_member_sns ON united_history_claims(member_id,sns_status);
INSERT INTO schema_migrations(id,description) VALUES('2026-09-08-admin-member-identity','Canonical Admin member reads and stable QR identities; explicit existing-member provisioning required');
