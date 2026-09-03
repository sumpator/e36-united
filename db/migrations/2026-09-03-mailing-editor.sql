-- Mailing B: controlled E36 email template and structured campaign content.
-- Forward-only. No contact import, recipient materialization or delivery state.
PRAGMA foreign_keys = ON;

ALTER TABLE mailing_campaigns
  ADD COLUMN template_version TEXT NOT NULL DEFAULT 'e36-default-v1';

ALTER TABLE mailing_campaigns
  ADD COLUMN content_json TEXT NOT NULL DEFAULT '{"template":"e36-default-v1","blocks":[]}'
    CHECK (json_valid(content_json));

INSERT INTO schema_migrations (id, description)
VALUES ('2026-09-03-mailing-editor', 'Mailing B structured email editor and E36 template')
ON CONFLICT(id) DO NOTHING;
