-- Stage 3 only: after admin-read-budget. No read-side creation or business backfill.
CREATE TABLE admin_preferences (
  id TEXT PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL CHECK(schema_version=1),
  configuration_json TEXT NOT NULL CHECK(json_valid(configuration_json) AND length(configuration_json)<=32768),
  revision INTEGER NOT NULL CHECK(revision>0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO schema_migrations(id,description) VALUES('2026-09-08-admin-preferences','Per-Admin dashboard compositions; existing expected-revision/receipt boundary');
