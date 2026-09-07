-- Forward-only observation from rollout. No historical rows are manufactured.
PRAGMA foreign_keys = ON;

ALTER TABLE events ADD COLUMN venue_name TEXT;

CREATE TABLE public_planner_handoffs (
  draft_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  event_year INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
  member_claimed_at TEXT,
  member_portal_opened_at TEXT,
  reservation_id TEXT REFERENCES reservations(id) ON DELETE SET NULL,
  reservation_created_at TEXT
);
CREATE INDEX public_planner_handoffs_event ON public_planner_handoffs(event_id, created_at);
CREATE INDEX public_planner_handoffs_member ON public_planner_handoffs(member_id);

-- No members FK: this table must also represent a Firebase identity without a D1 profile.
CREATE TABLE member_onboarding (
  firebase_uid TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  firebase_account_seen_at TEXT NOT NULL,
  member_profile_created_at TEXT,
  first_portal_loaded_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX member_onboarding_incomplete ON member_onboarding(member_profile_created_at, firebase_account_seen_at);

INSERT INTO schema_migrations (id, description)
VALUES ('2026-09-07-production-feedback', 'Forward-only onboarding and Planner funnel; optional event venue');
