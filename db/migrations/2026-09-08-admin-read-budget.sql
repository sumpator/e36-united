-- Stage 2 budget follow-up: page order before expensive hydration/capacity joins.
-- Forward-only; apply after 2026-09-08-admin-member-identity, locally first.
CREATE INDEX admin_reservations_page ON reservations (
  event_id,
  CASE status WHEN 'pending' THEN 0 WHEN 'rejected' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END,
  submitted_at DESC, updated_at DESC, id
);
INSERT INTO schema_migrations(id,description) VALUES ('2026-09-08-admin-read-budget','Index reservation page order; no data or policy changes');
