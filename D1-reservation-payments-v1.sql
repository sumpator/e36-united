-- E36 United: reservation payment identity and event payment instructions.
-- Apply exactly once after a production backup and before deploying the payment Worker.
-- This migration does not change registration state, current event, prices or reservations.

ALTER TABLE events ADD COLUMN payment_recipient_name TEXT;
ALTER TABLE events ADD COLUMN payment_account_display TEXT;
ALTER TABLE events ADD COLUMN payment_iban TEXT;
ALTER TABLE events ADD COLUMN payment_message_prefix TEXT;
ALTER TABLE events ADD COLUMN payment_test_mode INTEGER NOT NULL DEFAULT 1 CHECK (payment_test_mode IN (0, 1));

ALTER TABLE reservations ADD COLUMN payment_vs TEXT;

CREATE UNIQUE INDEX idx_reservations_payment_vs_unique
  ON reservations(payment_vs)
  WHERE payment_vs IS NOT NULL;

-- Test-only payment configuration for the existing United 2026 event.
-- Keep payment_test_mode = 1 until production banking details are deliberately configured.
UPDATE events
SET payment_recipient_name = 'E36 UNITED TEST',
    payment_account_display = '123 / 9999',
    payment_iban = 'CZ5099990000000000000123',
    currency = 'CZK',
    payment_message_prefix = 'E36 UNITED 2026',
    payment_test_mode = 1
WHERE id = 'united-2026';
