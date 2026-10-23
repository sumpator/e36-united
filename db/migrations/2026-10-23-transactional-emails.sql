-- Additive: no backfill, resend, business-state update or historical outbox rebuild.
BEGIN TRANSACTION;
ALTER TABLE email_outbox ADD COLUMN tx_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE email_outbox ADD COLUMN event_key TEXT;
ALTER TABLE email_outbox ADD COLUMN entity_type TEXT;
ALTER TABLE email_outbox ADD COLUMN entity_id TEXT;
ALTER TABLE email_outbox ADD COLUMN event_id TEXT;
ALTER TABLE email_outbox ADD COLUMN source_outbox_id TEXT;
ALTER TABLE email_outbox ADD COLUMN retry_of TEXT;
ALTER TABLE email_outbox ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE email_outbox ADD COLUMN started_at TEXT;
ALTER TABLE email_outbox ADD COLUMN provider_request_id TEXT;
ALTER TABLE email_outbox ADD COLUMN delivered_at TEXT;
ALTER TABLE email_outbox ADD COLUMN rendered_html TEXT;
ALTER TABLE email_outbox ADD COLUMN rendered_text TEXT;
CREATE UNIQUE INDEX email_transaction_event ON email_outbox(event_key) WHERE event_key IS NOT NULL;
CREATE UNIQUE INDEX email_transaction_source ON email_outbox(source_outbox_id) WHERE source_outbox_id IS NOT NULL;
CREATE UNIQUE INDEX email_transaction_retry ON email_outbox(retry_of) WHERE retry_of IS NOT NULL;
CREATE INDEX email_transaction_pending ON email_outbox(tx_version,status,created_at);
CREATE TABLE transactional_email_events(
 id TEXT PRIMARY KEY, outbox_id TEXT NOT NULL REFERENCES email_outbox(id),
 provider_event_key TEXT NOT NULL UNIQUE, event_type TEXT NOT NULL, occurred_at TEXT NOT NULL
);
CREATE TABLE transactional_email_audit(
 id TEXT PRIMARY KEY, outbox_id TEXT NOT NULL REFERENCES email_outbox(id), actor_id TEXT NOT NULL,
 action TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One server-side switch. Initial deployment never enables delivery.
CREATE TABLE transactional_email_control(
 id INTEGER PRIMARY KEY CHECK(id=1),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(typeof(enabled)='integer' AND enabled IN (0,1)),
 activated_at TEXT,
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0)
);
INSERT INTO transactional_email_control(id) VALUES(1);
CREATE TRIGGER email_transport_control_changed AFTER UPDATE OF enabled ON transactional_email_control
WHEN NEW.enabled<>OLD.enabled BEGIN
 UPDATE transactional_email_control SET activated_at=COALESCE(OLD.activated_at,CASE WHEN NEW.enabled=1 THEN CURRENT_TIMESTAMP END),
 revision=OLD.revision+1 WHERE id=1;
END;
CREATE TRIGGER email_transport_activation_immutable BEFORE UPDATE OF activated_at ON transactional_email_control
WHEN OLD.activated_at IS NOT NULL AND NEW.activated_at IS NOT OLD.activated_at BEGIN
 SELECT RAISE(ABORT,'transactional_activation_is_immutable');
END;
CREATE TRIGGER email_transport_control_retain BEFORE DELETE ON transactional_email_control BEGIN
 SELECT RAISE(ABORT,'transactional_control_must_be_retained');
END;
-- Admission is decided atomically with the business intent, not by wall-clock comparisons.
-- After first activation, pauses retain queued work instead of discarding it.
CREATE TRIGGER email_transport_initial_insert AFTER INSERT ON email_outbox
WHEN NEW.tx_version=1 AND NEW.status='queued' AND NOT EXISTS(SELECT 1 FROM transactional_email_control WHERE id=1 AND activated_at IS NOT NULL) BEGIN
 UPDATE email_outbox SET status='skipped',error_message='before_initial_activation' WHERE id=NEW.id;
END;
CREATE TRIGGER email_transport_initial_promote AFTER UPDATE OF tx_version ON email_outbox
WHEN OLD.tx_version=0 AND NEW.tx_version=1 AND NEW.status='queued' AND NOT EXISTS(SELECT 1 FROM transactional_email_control WHERE id=1 AND activated_at IS NOT NULL) BEGIN
 UPDATE email_outbox SET status='skipped',error_message='before_initial_activation' WHERE id=NEW.id;
END;
-- Also stop older Worker versions which have read an intent but have not claimed it yet.
-- Claims already made before migration can be in flight and must be drained separately.
CREATE TRIGGER email_transport_arrival_claim BEFORE UPDATE OF status ON email_outbox
WHEN NEW.status='sending' AND OLD.status<>'sending' AND (NEW.tx_version=1 OR NEW.template_key='arrival_invitation')
 AND (NEW.tx_version<>1 OR NOT EXISTS(SELECT 1 FROM transactional_email_control WHERE id=1 AND enabled=1 AND activated_at IS NOT NULL)) BEGIN
 SELECT RAISE(IGNORE);
END;
CREATE TRIGGER email_transport_merch_claim BEFORE UPDATE OF status ON merch_outbox
WHEN NEW.status='sending' AND OLD.status<>'sending' AND NOT EXISTS(
 SELECT 1 FROM email_outbox o JOIN transactional_email_control c ON c.id=1
 WHERE o.source_outbox_id=NEW.id AND o.tx_version=1 AND o.status='queued' AND c.enabled=1 AND c.activated_at IS NOT NULL) BEGIN
 SELECT RAISE(IGNORE);
END;

-- Bootstrap inserts last_login_at; fixture/import-only member rows do not represent new logins/accounts.
CREATE TRIGGER email_account_created AFTER INSERT ON members WHEN NEW.last_login_at IS NOT NULL AND NEW.status='active' BEGIN
 INSERT INTO email_outbox(id,member_id,template_key,recipient_email,subject,tx_version,event_key,entity_type,entity_id)
 VALUES(lower(hex(randomblob(16))),NEW.id,'account_created',NEW.email,'Účet Můj United je připravený',1,'account-created:'||NEW.id,'account',NEW.id);
END;
CREATE TRIGGER email_preliminary_created AFTER INSERT ON preliminary_reservations WHEN NEW.status='active' BEGIN
 INSERT INTO email_outbox(id,member_id,template_key,recipient_email,subject,tx_version,event_key,entity_type,entity_id,event_id)
 SELECT lower(hex(randomblob(16))),NEW.member_id,'preliminary_saved',m.email,'Nezávazný plán je uložený',1,'preliminary:'||NEW.id,'preliminary',NEW.id,NEW.event_id FROM members m WHERE m.id=NEW.member_id;
END;
CREATE TRIGGER email_reservation_created AFTER INSERT ON reservations BEGIN
 INSERT INTO email_outbox(id,member_id,reservation_id,template_key,recipient_email,subject,tx_version,event_key,entity_type,entity_id,event_id)
 SELECT lower(hex(randomblob(16))),NEW.member_id,NEW.id,'reservation_submitted',m.email,'Žádost o rezervaci jsme přijali',1,'reservation-created:'||NEW.id,'reservation',NEW.id,NEW.event_id FROM members m WHERE m.id=NEW.member_id;
END;
CREATE TRIGGER email_reservation_status AFTER UPDATE OF status ON reservations WHEN NEW.status<>OLD.status AND NEW.status IN ('pending','approved','rejected','cancelled') BEGIN
 INSERT INTO email_outbox(id,member_id,reservation_id,template_key,recipient_email,subject,tx_version,event_key,entity_type,entity_id,event_id)
 SELECT lower(hex(randomblob(16))),NEW.member_id,NEW.id,
 CASE NEW.status WHEN 'pending' THEN 'reservation_submitted' WHEN 'approved' THEN 'reservation_approved' WHEN 'rejected' THEN 'reservation_rejected' ELSE 'reservation_cancelled' END,
 m.email,'Rozhodnutí rezervace',1,'reservation-status:'||lower(hex(randomblob(16))),'reservation',NEW.id,NEW.event_id FROM members m WHERE m.id=NEW.member_id
 AND NOT EXISTS(SELECT 1 FROM reservation_requests WHERE reservation_id=NEW.id AND status='pending');
END;
CREATE TRIGGER email_reservation_payment AFTER UPDATE OF amount_paid_czk ON reservations WHEN NEW.amount_paid_czk<>OLD.amount_paid_czk BEGIN
 INSERT INTO email_outbox(id,member_id,reservation_id,template_key,recipient_email,subject,tx_version,event_key,entity_type,entity_id,event_id,payload_json)
 SELECT lower(hex(randomblob(16))),NEW.member_id,NEW.id,'reservation_payment',m.email,'Evidence platby rezervace',1,'reservation-payment:'||lower(hex(randomblob(16))),'reservation',NEW.id,NEW.event_id,json_object('deltaCzk',NEW.amount_paid_czk-OLD.amount_paid_czk) FROM members m WHERE m.id=NEW.member_id;
END;
CREATE TRIGGER email_reservation_price AFTER UPDATE OF amount_due_czk ON reservations WHEN NEW.status='approved' AND OLD.status='approved' AND NEW.amount_due_czk<>OLD.amount_due_czk BEGIN
 INSERT INTO email_outbox(id,member_id,reservation_id,template_key,recipient_email,subject,tx_version,event_key,entity_type,entity_id,event_id)
 SELECT lower(hex(randomblob(16))),NEW.member_id,NEW.id,'reservation_changed',m.email,'Potvrzená změna ceny rezervace',1,'reservation-price:'||lower(hex(randomblob(16))),'reservation',NEW.id,NEW.event_id FROM members m WHERE m.id=NEW.member_id
 AND NOT EXISTS(SELECT 1 FROM reservation_requests WHERE reservation_id=NEW.id AND status='pending');
END;
CREATE TRIGGER email_request_created AFTER INSERT ON reservation_requests BEGIN
 INSERT INTO email_outbox(id,member_id,reservation_id,template_key,recipient_email,subject,tx_version,event_key,entity_type,entity_id,event_id)
 SELECT lower(hex(randomblob(16))),NEW.member_id,NEW.reservation_id,'request_'||NEW.request_type,m.email,'Žádost byla přijata',1,'request-created:'||NEW.id,'request',NEW.id,r.event_id FROM members m JOIN reservations r ON r.id=NEW.reservation_id WHERE m.id=NEW.member_id;
END;
CREATE TRIGGER email_request_decided AFTER UPDATE OF status ON reservation_requests WHEN OLD.status='pending' AND NEW.status IN ('approved','rejected') BEGIN
 INSERT INTO email_outbox(id,member_id,reservation_id,template_key,recipient_email,subject,tx_version,event_key,entity_type,entity_id,event_id)
 SELECT lower(hex(randomblob(16))),NEW.member_id,NEW.reservation_id,
 CASE WHEN NEW.status='approved' AND NEW.request_type='cancellation' THEN 'reservation_cancelled' ELSE 'request_'||NEW.status END,
 m.email,'Žádost byla vyřízena',1,'request-decision:'||NEW.id,'request',NEW.id,r.event_id FROM members m JOIN reservations r ON r.id=NEW.reservation_id WHERE m.id=NEW.member_id;
END;
-- Existing Merch intent stays authoritative. Only NEW intents enter the shared transport.
CREATE TRIGGER email_merch_intent AFTER INSERT ON merch_outbox BEGIN
 INSERT INTO email_outbox(id,member_id,template_key,recipient_email,subject,tx_version,event_key,entity_type,entity_id,source_outbox_id,payload_json)
 SELECT lower(hex(randomblob(16))),o.member_id,COALESCE(json_extract(NEW.payload,'$.template'),CASE WHEN NEW.kind LIKE 'withdraw-%' THEN 'merch_withdraw' WHEN NEW.kind LIKE 'complaint-%' THEN 'merch_complaint' WHEN NEW.kind LIKE 'status-%' THEN 'merch_sent' ELSE 'merch_confirmation' END),json_extract(o.snapshot,'$.address.email'),json_extract(NEW.payload,'$.subject'),1,'merch:'||NEW.id,'merch',NEW.order_id,NEW.id,NEW.payload FROM merch_orders o WHERE o.id=NEW.order_id;
END;
CREATE TRIGGER email_arrival_intent AFTER INSERT ON email_outbox WHEN NEW.template_key='arrival_invitation' AND NEW.tx_version=0 BEGIN
 UPDATE email_outbox SET tx_version=1,event_key='arrival:'||NEW.id,entity_type='arrival',entity_id=json_extract(NEW.payload_json,'$.arrivalId') WHERE id=NEW.id;
END;
CREATE TRIGGER email_event_payment_details AFTER UPDATE OF payment_deadline,payment_recipient_name,payment_account_display,payment_iban ON events
WHEN OLD.payment_deadline IS NOT NEW.payment_deadline OR OLD.payment_recipient_name IS NOT NEW.payment_recipient_name OR OLD.payment_account_display IS NOT NEW.payment_account_display OR OLD.payment_iban IS NOT NEW.payment_iban BEGIN
 INSERT INTO email_outbox(id,member_id,reservation_id,template_key,recipient_email,subject,tx_version,event_key,entity_type,entity_id,event_id)
 SELECT lower(hex(randomblob(16))),r.member_id,r.id,'reservation_changed',m.email,'Potvrzená změna platebních údajů',1,'payment-details:'||lower(hex(randomblob(16))),'reservation',r.id,r.event_id FROM reservations r JOIN members m ON m.id=r.member_id WHERE r.event_id=NEW.id AND r.status='approved' AND r.amount_due_czk>r.amount_paid_czk;
END;
-- During schema -> Worker rollout, a previous Worker may still finish a Merch send.
-- Mirror only linked NEW intents; never re-enqueue or backfill historical messages.
CREATE TRIGGER email_merch_delivery_compat AFTER UPDATE OF status ON merch_outbox BEGIN
 UPDATE email_outbox SET status=CASE NEW.status WHEN 'pending' THEN status WHEN 'sending' THEN CASE WHEN status='queued' THEN 'sending' ELSE status END WHEN 'sent' THEN CASE WHEN status IN ('delivered','failed') THEN status ELSE 'sent' END ELSE CASE WHEN status IN ('queued','sending') THEN NEW.status ELSE status END END,
 started_at=CASE WHEN NEW.status='sending' THEN COALESCE(started_at,CURRENT_TIMESTAMP) ELSE started_at END,
 sent_at=CASE WHEN NEW.status='sent' THEN COALESCE(sent_at,CURRENT_TIMESTAMP) ELSE sent_at END,
 error_message=COALESCE(NEW.error_code,error_message) WHERE source_outbox_id=NEW.id AND tx_version=1;
END;
INSERT INTO schema_migrations(id,description) VALUES('2026-10-23-transactional-emails','Shared transactional delivery metadata and atomic event intents; no historical backfill');
COMMIT;
