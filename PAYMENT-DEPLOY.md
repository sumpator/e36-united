# Reservation payments: production deployment order

The payment code is intentionally prepared for a migration-first rollout. The Worker must not be deployed before `D1-reservation-payments-v1.sql` has completed successfully.

1. Keep United 2026 reservations closed and verify the public site still reports them as closed.
2. Export a production D1 backup.
3. Verify the expected pre-migration columns:
   - `PRAGMA table_info(events);` includes `currency` and `payment_deadline`.
   - `PRAGMA table_info(reservations);` includes `amount_due_czk`, `amount_paid_czk`, `payment_status`, `paid_at`, `payment_confirmed_by` and `payment_confirmed_at`.
   - `PRAGMA table_info(admin_actions);` includes `admin_member_id`, `old_state_json` and `new_state_json`.
4. Apply `D1-reservation-payments-v1.sql` once to production D1.
5. Verify `PRAGMA table_info(events);`, `PRAGMA table_info(reservations);` and `PRAGMA index_list(reservations);`, then confirm only `united-2026` received the test payment configuration and `registration_status` is still `closed`.
6. Deploy the updated Worker manually.
7. Smoke-test an approved test reservation: stable VS, test warning, remaining amount, SPAYD and admin payment update/audit.
8. Publish the frontend through the normal Pages deployment only after the Worker smoke test passes.
9. Keep reservations closed. Opening reservations is a separate explicit operation outside this phase.

Rollback before the Worker deploy is simply to leave the old Worker/frontend running. SQLite cannot drop these columns safely as an emergency action; restore the backup only if the migration itself fails and D1 is left inconsistent.
