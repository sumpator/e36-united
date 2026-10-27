-- Additive, separate from members, campaigns, bookings and LIVE. No recipients seeded.
CREATE TABLE private_polls (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES members(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 closed_at TEXT
);
CREATE TABLE private_poll_invitations (
 id TEXT PRIMARY KEY,
 poll_id TEXT NOT NULL REFERENCES private_polls(id),
 recipient_email TEXT NOT NULL COLLATE NOCASE,
 recipient_name TEXT NOT NULL DEFAULT '',
 token_hash TEXT NOT NULL UNIQUE,
 answer TEXT CHECK(answer IN ('yes','no','maybe')),
 score INTEGER CHECK(score IS NULL OR (typeof(score)='integer' AND score BETWEEN 0 AND 10)),
 version INTEGER NOT NULL DEFAULT 0 CHECK(version>=0),
 last_operation_id TEXT,
 updated_at TEXT,
 UNIQUE(poll_id,recipient_email),
 CHECK(score IS NULL OR (answer IS NOT NULL AND answer='yes'))
);
CREATE INDEX private_poll_results ON private_poll_invitations(poll_id,updated_at);
INSERT INTO schema_migrations(id,description) VALUES('2026-10-27-private-polls','Private invitation choices and optional 0-10 score; no mail intents or existing-data changes');
