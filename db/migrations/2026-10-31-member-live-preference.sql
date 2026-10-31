-- Additive member opt-in. Existing and new profiles start with LIVE hidden.
ALTER TABLE members ADD COLUMN show_program_live INTEGER NOT NULL DEFAULT 0 CHECK(show_program_live IN (0,1));
INSERT INTO schema_migrations(id,description) VALUES('2026-10-31-member-live-preference','Per-member opt-in visibility of Program LIVE, initially off');
