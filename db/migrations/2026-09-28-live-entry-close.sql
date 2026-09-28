-- Local proposal. Apply before the matching Worker; no activation or historical reclassification.
ALTER TABLE live_entries ADD COLUMN voting_closed INTEGER NOT NULL DEFAULT 0 CHECK(voting_closed IN (0,1));
INSERT INTO schema_migrations(id,description) VALUES('2026-09-28-live-entry-close','Explicit per-car voting closure');
