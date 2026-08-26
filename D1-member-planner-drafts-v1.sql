-- E36 United: authenticated Weekend Planner drafts.
-- Apply exactly once before deploying the Worker version that uses this table.
-- This migration stores plans only; it does not create reservations or change event state.

CREATE TABLE member_planner_drafts (
  member_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  draft_id TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  source_created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (member_id, event_id),
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX idx_member_planner_drafts_active
  ON member_planner_drafts(member_id, expires_at, updated_at);
