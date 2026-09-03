-- E36 United application schema snapshot.
-- Production objects were verified read-only on 2026-08-31 from sqlite_master and schema PRAGMAs.
-- Mailing A objects below are pending migration 2026-09-03-mailing-foundation.sql and
-- have NOT been applied to production. Contains schema objects only; no production rows.
-- Cloudflare's internal _cf_KV table and SQLite autoindexes are intentionally omitted.

PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

-- Migration registry begins with the first repository-managed forward migration.
CREATE TABLE schema_migrations (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  member_code TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  nickname TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT,
  history_completed_at TEXT
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL UNIQUE,
  title TEXT NOT NULL,
  starts_on TEXT,
  ends_on TEXT,
  registration_status TEXT NOT NULL DEFAULT 'closed',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  registration_open_at TEXT,
  registration_close_at TEXT,
  event_start_at TEXT,
  event_end_at TEXT,
  early_payment_deadline TEXT,
  payment_deadline TEXT,
  currency TEXT NOT NULL DEFAULT 'CZK',
  accommodation_capacity INTEGER,
  reservation_capacity INTEGER,
  booking_commitment_czk INTEGER NOT NULL DEFAULT 0,
  booking_due_at TEXT,
  booking_paid_czk INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT,
  is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
  full_weekend_nights INTEGER NOT NULL DEFAULT 2 CHECK (full_weekend_nights >= 0),
  saturday_only_nights INTEGER NOT NULL DEFAULT 1 CHECK (saturday_only_nights >= 0),
  payment_recipient_name TEXT,
  payment_account_display TEXT,
  payment_iban TEXT,
  payment_message_prefix TEXT,
  payment_test_mode INTEGER NOT NULL DEFAULT 1 CHECK (payment_test_mode IN (0, 1))
);

CREATE TABLE cars (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  nickname TEXT,
  model TEXT NOT NULL,
  body TEXT,
  year INTEGER,
  color TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE car_photos (
  id TEXT PRIMARY KEY,
  car_id TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  mime_type TEXT,
  size_bytes INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (car_id) REFERENCES cars(id) ON DELETE CASCADE
);

CREATE TABLE gallery_submissions (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  car_id TEXT,
  r2_key TEXT NOT NULL UNIQUE,
  caption TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  reviewed_by TEXT,
  review_note TEXT,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (car_id) REFERENCES cars(id) ON DELETE SET NULL
);

CREATE TABLE reservations (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  car_id TEXT,
  car_model TEXT,
  car_body TEXT,
  car_year INTEGER,
  car_color TEXT,
  car_nickname TEXT,
  arrival TEXT,
  crew INTEGER NOT NULL DEFAULT 1,
  accommodation TEXT,
  show_shine TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TEXT,
  attendance_type TEXT,
  accommodation_units INTEGER NOT NULL DEFAULT 0,
  amount_due_czk INTEGER NOT NULL DEFAULT 0,
  amount_paid_czk INTEGER NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  paid_at TEXT,
  payment_confirmed_by TEXT,
  payment_confirmed_at TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  submitted_at TEXT,
  payment_vs TEXT,
  UNIQUE (member_id, event_id),
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (car_id) REFERENCES cars(id) ON DELETE SET NULL
);

CREATE TABLE event_accommodation_options (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('cabin', 'tent')),
  inventory_mode TEXT NOT NULL CHECK (inventory_mode IN ('limited', 'unlimited')),
  units_total INTEGER NOT NULL DEFAULT 0 CHECK (units_total >= 0),
  capacity_per_unit INTEGER NOT NULL CHECK (capacity_per_unit > 0),
  unit_price_czk INTEGER NOT NULL DEFAULT 0 CHECK (unit_price_czk >= 0),
  person_price_czk INTEGER NOT NULL DEFAULT 0 CHECK (person_price_czk >= 0),
  bedding_fee_per_person_czk INTEGER NOT NULL DEFAULT 0 CHECK (bedding_fee_per_person_czk >= 0),
  city_tax_per_person_per_night_czk INTEGER NOT NULL DEFAULT 0 CHECK (city_tax_per_person_per_night_czk >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id),
  UNIQUE (event_id, name)
);

CREATE TABLE reservation_accommodation (
  reservation_id TEXT PRIMARY KEY,
  option_id TEXT NOT NULL,
  option_name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('cabin', 'tent')),
  people_count INTEGER NOT NULL CHECK (people_count > 0),
  unit_count INTEGER NOT NULL CHECK (unit_count > 0),
  unit_price_czk INTEGER NOT NULL CHECK (unit_price_czk >= 0),
  person_price_czk INTEGER NOT NULL CHECK (person_price_czk >= 0),
  bedding_fee_per_person_czk INTEGER NOT NULL CHECK (bedding_fee_per_person_czk >= 0),
  city_tax_per_person_per_night_czk INTEGER NOT NULL CHECK (city_tax_per_person_per_night_czk >= 0),
  nights INTEGER NOT NULL CHECK (nights >= 0),
  base_total_czk INTEGER NOT NULL CHECK (base_total_czk >= 0),
  person_total_czk INTEGER NOT NULL CHECK (person_total_czk >= 0),
  bedding_total_czk INTEGER NOT NULL CHECK (bedding_total_czk >= 0),
  city_tax_total_czk INTEGER NOT NULL CHECK (city_tax_total_czk >= 0),
  total_czk INTEGER NOT NULL CHECK (total_czk >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
  FOREIGN KEY (option_id) REFERENCES event_accommodation_options(id)
);

CREATE TABLE admin_actions (
  id TEXT PRIMARY KEY,
  admin_member_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  old_state_json TEXT,
  new_state_json TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE attendance (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'claimed',
  winner INTEGER NOT NULL DEFAULT 0,
  category TEXT,
  claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at TEXT,
  verified_by TEXT,
  UNIQUE (member_id, event_id),
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE attendance_claims (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  proof_r2_key TEXT NOT NULL UNIQUE,
  proof_mime_type TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (member_id, event_id),
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE points_ledger (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  event_id TEXT,
  source_type TEXT NOT NULL,
  points INTEGER NOT NULL,
  note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_id TEXT,
  idempotency_key TEXT,
  reversed_entry_id TEXT,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
);

CREATE TABLE reward_redemptions (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  reward_type TEXT NOT NULL,
  points_cost INTEGER NOT NULL,
  value_czk INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  reference TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at TEXT,
  redeemed_at TEXT,
  handled_by TEXT,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE mail_campaigns (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT,
  segment_json TEXT,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  FOREIGN KEY (created_by) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE mail_campaign_recipients (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  member_id TEXT,
  reservation_id TEXT,
  email TEXT NOT NULL,
  personalization_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TEXT,
  error_message TEXT,
  FOREIGN KEY (campaign_id) REFERENCES mail_campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL
);

-- Pending Mailing A foundation. The legacy mail_campaigns/mail_campaign_recipients
-- tables above remain unchanged and are not repurposed by this migration.
CREATE TABLE mailing_contacts (
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

CREATE TABLE mailing_contact_sources (
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

CREATE TABLE mailing_contact_tags (
  contact_id TEXT NOT NULL,
  tag TEXT NOT NULL COLLATE NOCASE,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (contact_id, tag),
  FOREIGN KEY (contact_id) REFERENCES mailing_contacts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES members(id) ON DELETE SET NULL
);

CREATE TABLE mailing_campaigns (
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

CREATE TABLE mailing_campaign_recipients (
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

CREATE TABLE email_outbox (
  id TEXT PRIMARY KEY,
  member_id TEXT,
  reservation_id TEXT,
  campaign_id TEXT,
  template_key TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  provider_message_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL
);

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

CREATE TABLE united_history_claims (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  attendance_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (attendance_status IN ('pending', 'approved', 'rejected')),
  attendance_review_note TEXT,
  attendance_reviewed_by TEXT,
  attendance_reviewed_at TEXT,
  sns_competed INTEGER NOT NULL DEFAULT 0 CHECK (sns_competed IN (0, 1)),
  sns_category TEXT,
  sns_placement INTEGER CHECK (sns_placement IN (1, 2, 3)),
  sns_best_of_best INTEGER NOT NULL DEFAULT 0 CHECK (sns_best_of_best IN (0, 1)),
  sns_best_exhaust INTEGER NOT NULL DEFAULT 0 CHECK (sns_best_exhaust IN (0, 1)),
  sns_status TEXT NOT NULL DEFAULT 'not_claimed'
    CHECK (sns_status IN ('not_claimed', 'pending', 'approved', 'rejected')),
  sns_review_note TEXT,
  sns_reviewed_by TEXT,
  sns_reviewed_at TEXT,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (member_id, event_id),
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (attendance_reviewed_by) REFERENCES members(id) ON DELETE SET NULL,
  FOREIGN KEY (sns_reviewed_by) REFERENCES members(id) ON DELETE SET NULL
);

CREATE TABLE united_history_evidence (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (claim_id) REFERENCES united_history_claims(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE united_points_ledger (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  delta INTEGER NOT NULL CHECK (delta <> 0),
  source_type TEXT NOT NULL,
  source_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  event_id TEXT,
  related_object_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (member_id, source_key),
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
);

CREATE INDEX idx_attendance_claims_status
  ON attendance_claims(status, created_at);
CREATE INDEX idx_attendance_member
  ON attendance(member_id);
CREATE INDEX idx_cars_member
  ON cars(member_id);
CREATE INDEX idx_event_accommodation_event_active
  ON event_accommodation_options(event_id, active, sort_order, name);
CREATE UNIQUE INDEX idx_events_single_current
  ON events(is_current) WHERE is_current = 1;
CREATE INDEX idx_gallery_status
  ON gallery_submissions(status, created_at);
CREATE INDEX idx_mail_campaign_recipients_campaign
  ON mail_campaign_recipients(campaign_id, status);

CREATE INDEX idx_mailing_contacts_member
  ON mailing_contacts(current_member_id);

CREATE INDEX idx_mailing_contacts_suppression
  ON mailing_contacts(suppression_status, mailing_consent_status);

CREATE INDEX idx_mailing_contact_sources_contact
  ON mailing_contact_sources(contact_id, event_year);

CREATE INDEX idx_mailing_contact_sources_event
  ON mailing_contact_sources(event_id, event_year);

CREATE INDEX idx_mailing_campaigns_status
  ON mailing_campaigns(status, updated_at);

CREATE INDEX idx_mailing_campaign_recipients_campaign
  ON mailing_campaign_recipients(campaign_id, eligibility_status);

INSERT INTO schema_migrations (id, description)
VALUES ('2026-09-03-mailing-foundation', 'Mailing contact, segmentation and campaign foundation');
CREATE INDEX idx_member_planner_drafts_active
  ON member_planner_drafts(member_id, expires_at, updated_at);
CREATE UNIQUE INDEX idx_points_ledger_idempotency
  ON points_ledger(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_points_member
  ON points_ledger(member_id);
CREATE INDEX idx_reservation_accommodation_option
  ON reservation_accommodation(option_id, unit_count);
CREATE INDEX idx_reservations_event_status
  ON reservations(event_id, status);
CREATE INDEX idx_reservations_member
  ON reservations(member_id);
CREATE INDEX idx_reservations_payment
  ON reservations(event_id, payment_status);
CREATE UNIQUE INDEX idx_reservations_payment_vs_unique
  ON reservations(payment_vs) WHERE payment_vs IS NOT NULL;
CREATE INDEX idx_united_history_claims_attendance
  ON united_history_claims(attendance_status, submitted_at DESC);
CREATE INDEX idx_united_history_claims_member
  ON united_history_claims(member_id, updated_at DESC);
CREATE INDEX idx_united_history_claims_sns
  ON united_history_claims(sns_status, submitted_at DESC);
CREATE INDEX idx_united_history_evidence_claim
  ON united_history_evidence(claim_id, sort_order, created_at);
CREATE INDEX idx_united_points_member
  ON united_points_ledger(member_id, created_at DESC);

CREATE TRIGGER united_points_ledger_no_update
BEFORE UPDATE ON united_points_ledger
BEGIN
  SELECT RAISE(ABORT, 'united_points_ledger is immutable');
END;

CREATE TRIGGER united_points_ledger_no_delete
BEFORE DELETE ON united_points_ledger
BEGIN
  SELECT RAISE(ABORT, 'united_points_ledger is immutable');
END;

COMMIT;
