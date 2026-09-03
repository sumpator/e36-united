-- Mailing A foundation. Forward-only and intentionally not applied by this change.
PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mailing_contacts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  normalized_email TEXT NOT NULL UNIQUE,
  name TEXT,
  nickname TEXT,
  current_member_id TEXT UNIQUE,
  privacy_consent_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (privacy_consent_status IN ('yes', 'no', 'unknown')),
  privacy_consent_source TEXT,
  privacy_consent_at TEXT,
  mailing_consent_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (mailing_consent_status IN ('yes', 'no', 'unknown')),
  mailing_consent_source TEXT,
  mailing_consent_at TEXT,
  deliverability_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (deliverability_status IN ('unknown', 'deliverable', 'hard_bounce', 'blocked')),
  suppression_status TEXT NOT NULL DEFAULT 'eligible'
    CHECK (suppression_status IN ('eligible', 'unsubscribed', 'hard_bounce', 'blocked', 'manually_suppressed')),
  possible_duplicate INTEGER NOT NULL DEFAULT 0 CHECK (possible_duplicate IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (current_member_id) REFERENCES members(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS mailing_contact_sources (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('current_member', 'event_registration', 'historical_import', 'manual_admin')),
  source_reference TEXT NOT NULL DEFAULT '',
  event_id TEXT,
  event_year INTEGER CHECK (event_year IS NULL OR event_year BETWEEN 1990 AND 2100),
  source_date TEXT,
  privacy_consent_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (privacy_consent_status IN ('yes', 'no', 'unknown')),
  mailing_consent_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (mailing_consent_status IN ('yes', 'no', 'unknown')),
  consent_source TEXT,
  consent_at TEXT,
  original_record_json TEXT CHECK (original_record_json IS NULL OR json_valid(original_record_json)),
  imported_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contact_id) REFERENCES mailing_contacts(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
  UNIQUE (contact_id, source_type, source_reference)
);

CREATE TABLE IF NOT EXISTS mailing_contact_tags (
  contact_id TEXT NOT NULL,
  tag TEXT NOT NULL COLLATE NOCASE,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (contact_id, tag),
  FOREIGN KEY (contact_id) REFERENCES mailing_contacts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES members(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS mailing_campaigns (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL,
  internal_name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  preheader TEXT NOT NULL DEFAULT '',
  segment_definition_json TEXT NOT NULL CHECK (json_valid(segment_definition_json)),
  recipient_count INTEGER NOT NULL DEFAULT 0 CHECK (recipient_count >= 0),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'prepared', 'sent', 'archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  FOREIGN KEY (created_by) REFERENCES members(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS mailing_campaign_recipients (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  member_id TEXT,
  email TEXT NOT NULL,
  normalized_email TEXT NOT NULL,
  name TEXT,
  source_snapshot_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(source_snapshot_json)),
  eligibility_status TEXT NOT NULL
    CHECK (eligibility_status IN ('eligible', 'ineligible', 'review_required', 'suppressed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES mailing_campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES mailing_contacts(id) ON DELETE RESTRICT,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL,
  UNIQUE (campaign_id, normalized_email)
);

CREATE INDEX IF NOT EXISTS idx_mailing_contacts_member
  ON mailing_contacts(current_member_id);
CREATE INDEX IF NOT EXISTS idx_mailing_contacts_suppression
  ON mailing_contacts(suppression_status, mailing_consent_status);
CREATE INDEX IF NOT EXISTS idx_mailing_contact_sources_contact
  ON mailing_contact_sources(contact_id, event_year);
CREATE INDEX IF NOT EXISTS idx_mailing_contact_sources_event
  ON mailing_contact_sources(event_id, event_year);
CREATE INDEX IF NOT EXISTS idx_mailing_campaigns_status
  ON mailing_campaigns(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_mailing_campaign_recipients_campaign
  ON mailing_campaign_recipients(campaign_id, eligibility_status);

INSERT INTO schema_migrations (id, description)
VALUES ('2026-09-03-mailing-foundation', 'Mailing contact, segmentation and campaign foundation')
ON CONFLICT(id) DO NOTHING;

COMMIT;
