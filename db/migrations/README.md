# D1 migration inventory

Inventory verified on 2026-08-31. No migration was executed during Phase 0A.

## Baseline conclusion

The repository's historical SQL is **not sufficient by itself** to construct the current production schema. All five existing files are deltas or optional indexes and assume a pre-existing base containing tables such as `members`, `events`, `cars`, `car_photos`, `gallery_submissions`, `reservations`, and `admin_actions`. No base-schema migration or D1 migration registry is checked in, and production metadata contains no application migration-registry table.

`db/schema.sql` is a production-verified schema snapshot for fresh reproduction/reference. It is not evidence that the historical migrations ran in a particular sequence, and it must not be applied over an existing database.

## Existing SQL files and likely order

Order below is based on Git commit chronology, explicit comments, and object dependencies. It is a likely history, not a claimed execution log.

| Likely order | File | Introduced/affected objects | Dependencies and assumptions | Idempotency/conflict risk | Production comparison |
| ---: | --- | --- | --- | --- | --- |
| prerequisite | **Missing original base schema** | At least `members`, `events`, `cars`, `car_photos`, `gallery_submissions`, `reservations`, `admin_actions`, plus legacy attendance/Points/mail/rewards objects | Must predate every checked-in delta. Exact creation history is unavailable. | Cannot be replayed from repository evidence. | Objects exist remotely and are captured in `db/schema.sql`. |
| 1 | `D1-media-indexes.sql` (committed 2026-08-23) | Intended indexes `idx_car_photos_car_sort`, `idx_gallery_status_created`, `idx_gallery_member_created` | Requires `car_photos` and `gallery_submissions`. Marked optional. | Uses `IF NOT EXISTS`, so repeat-safe by **name**. It can still duplicate an equivalent index under another name. | None of those three names exists remotely. Production has equivalent `idx_gallery_status(status, created_at)`, but no member-created or car-photo sort index. Applying now would add two new indexes and one redundant equivalent index. |
| 2 | `D1-event-accommodation-v1.sql` (committed 2026-08-23) | Adds `events.is_current`, weekend night counts; creates `event_accommodation_options`, `reservation_accommodation`, and two indexes; initializes current event | Requires existing `events` and `reservations`; assumes the three event columns do not exist. Includes a one-time data update selecting the newest event only when none is current. | Not rerunnable: unguarded `ALTER TABLE ADD COLUMN`, table/index creation without `IF NOT EXISTS`, and a one-time state assumption. Duplicate-column/object failures on replay. | All defined columns/tables/indexes match current production metadata. |
| 3 | `D1-reservation-payments-v1.sql` (committed 2026-08-24) | Adds five event payment fields and `reservations.payment_vs`; creates partial unique VS index; writes test payment configuration to `united-2026` | Requires pre-existing finance/event columns documented in `PAYMENT-DEPLOY.md`; assumes new columns absent and specific event ID exists for the one-time update. | Not rerunnable: unguarded `ALTER TABLE`. Replaying also repeats a production-row update. Must never be treated as a generic fresh migration. | Added columns/index are present. Phase 0A did not inspect or copy event row values. |
| 4 | `D1-member-planner-drafts-v1.sql` (committed 2026-08-26) | Creates `member_planner_drafts` and active-draft index | Requires `members` and `events`; assumes table absent. | Not rerunnable because `CREATE TABLE`/`CREATE INDEX` lack `IF NOT EXISTS`. | Table and index match production metadata. |
| 5 | `D1-united-club-v1.sql` (committed 2026-08-30) | Adds `events.event_end_at`, `members.history_completed_at`; creates United history claims/evidence, immutable Points ledger, five indexes, and two no-update/no-delete triggers | Requires `events` and `members`; intentionally does not seed legacy history or Points. | Partially guarded only: tables/indexes/triggers use `IF NOT EXISTS`, but both unguarded `ALTER TABLE` statements make the full file non-rerunnable. | Columns, three tables, five indexes, and both triggers match production metadata. |

## Additional production objects not created by these files

The verified snapshot also contains the original/base and legacy objects below, whose creation migrations are not in current Git history:

- tables: `admin_actions`, `attendance`, `attendance_claims`, `car_photos`, `cars`, `email_outbox`, `events` (base columns), `gallery_submissions`, `mail_campaign_recipients`, `mail_campaigns`, `members`, `points_ledger`, `reservations` (base/finance columns), and `reward_redemptions`;
- explicit indexes: `idx_attendance_claims_status`, `idx_attendance_member`, `idx_cars_member`, `idx_gallery_status`, `idx_mail_campaign_recipients_campaign`, `idx_points_ledger_idempotency`, `idx_points_member`, `idx_reservations_event_status`, `idx_reservations_member`, and `idx_reservations_payment`.

SQLite autoindexes created by primary-key and unique constraints are represented by the table definitions rather than explicit statements. Cloudflare's internal `_cf_KV` table is platform-owned and excluded.

## Safety and future migration requirements

- Do not run any historical file against production merely to make a migration list appear complete.
- Before any future migration, compare the intended change with `db/schema.sql` and read-only production metadata, then take the separately approved backup required by the deployment procedure.
- A future registry must record forward-only migrations and checksums/identities; it must not invent entries for historical executions that cannot be proven.
- Duplicate-column repair, legacy data conversion, refunds/credits, and Points reversal require separate technical or business decisions. They are not Phase 0A migration work.
