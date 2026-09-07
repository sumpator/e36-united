-- Mailing C. LOCAL ONLY until a separately authorized rollout. No historical rewrite.
PRAGMA foreign_keys = ON;
ALTER TABLE mailing_campaigns ADD COLUMN prepared_subject TEXT;
ALTER TABLE mailing_campaigns ADD COLUMN prepared_preheader TEXT;
ALTER TABLE mailing_campaigns ADD COLUMN prepared_template_version TEXT;
ALTER TABLE mailing_campaigns ADD COLUMN prepared_content_json TEXT CHECK(prepared_content_json IS NULL OR json_valid(prepared_content_json));
ALTER TABLE mailing_campaigns ADD COLUMN prepared_html TEXT;
ALTER TABLE mailing_campaigns ADD COLUMN prepared_at TEXT;
ALTER TABLE mailing_campaigns ADD COLUMN preparation_id TEXT;
ALTER TABLE mailing_campaigns ADD COLUMN provider TEXT;
ALTER TABLE mailing_campaigns ADD COLUMN provider_campaign_id INTEGER;
ALTER TABLE mailing_campaigns ADD COLUMN provider_test_campaign_id INTEGER;
ALTER TABLE mailing_campaigns ADD COLUMN provider_list_id INTEGER;
ALTER TABLE mailing_campaigns ADD COLUMN provider_status TEXT;
ALTER TABLE mailing_campaigns ADD COLUMN provider_synced_at TEXT;
ALTER TABLE mailing_campaigns ADD COLUMN delivery_lock TEXT;
ALTER TABLE mailing_campaigns ADD COLUMN delivery_operation TEXT;
ALTER TABLE mailing_campaigns ADD COLUMN delivery_operation_at TEXT;
ALTER TABLE mailing_campaigns ADD COLUMN delivery_error TEXT;
ALTER TABLE mailing_campaign_recipients ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'prepared';
ALTER TABLE mailing_campaign_recipients ADD COLUMN sent_at TEXT;
ALTER TABLE mailing_campaign_recipients ADD COLUMN delivered_at TEXT;
ALTER TABLE mailing_campaign_recipients ADD COLUMN last_opened_at TEXT;
ALTER TABLE mailing_campaign_recipients ADD COLUMN last_clicked_at TEXT;
ALTER TABLE mailing_campaign_recipients ADD COLUMN updated_at TEXT;
CREATE TABLE mailing_delivery_events (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES mailing_campaigns(id) ON DELETE RESTRICT,
  recipient_id TEXT REFERENCES mailing_campaign_recipients(id) ON DELETE RESTRICT,
  normalized_email TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider='brevo'),
  provider_event_key TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('sent','delivered','opened','click','soft_bounce','hard_bounce','blocked','unsubscribed')),
  occurred_at TEXT NOT NULL,
  clicked_url TEXT,
  provider_payload_json TEXT NOT NULL CHECK(json_valid(provider_payload_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider,provider_event_key)
);
CREATE UNIQUE INDEX idx_mailing_provider_campaign ON mailing_campaigns(provider,provider_campaign_id) WHERE provider_campaign_id IS NOT NULL;
CREATE INDEX idx_mailing_delivery_events_campaign ON mailing_delivery_events(campaign_id,event_type,recipient_id);
CREATE INDEX idx_mailing_delivery_events_recipient ON mailing_delivery_events(recipient_id,occurred_at);
CREATE INDEX idx_mailing_delivery_operation ON mailing_campaigns(delivery_operation,delivery_operation_at);
INSERT INTO schema_migrations(id,description) VALUES('2026-09-07-mailing-delivery','Mailing C preparation, Brevo delivery and tracking');
