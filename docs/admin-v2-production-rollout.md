# Admin V2 Stages 1–3 — production preflight / blocked rollout

**PARTIAL / BLOCKED before production writes.** Verification on 2026-09-09 Europe/Prague (2026-09-08 approximately 22:40–22:52 UTC). This is an operational record, not full production acceptance or authorization to resume automatically.

## Release and local gate

Starting HEAD, approved application and once-fetched origin/main: `1a89afdab10b76c9c6c80a1115bf2bb8ae66dc65`. Clean main, 0 ahead / 0 behind before this documentation-only closeout. Reviewed `688441b15540623fe416e704b985f04fd2999f9f` and `8933c17a4ecbcdb6625b2f8a53af49ae54775768` are ancestors. No other active repository development task was found. No history rewrite or additional fetch.

Existing Node24.19.0, Playwright1.62.1 and cached Wrangler4.129.0 were used without installation/upgrades. Unchanged gate:

- Node **352/352 PASS**, including dashboard/auth/preferences/QR/safe-operation and populated predecessor forward-migration regression tests.
- Chromium **68/68**, focused WebKit **37/37**: one complete 105-test run passed, no retries. The historical WebKit navigation-during-save failure did not recur in this run; this does not prove the intermittent risk fixed.
- Production syntax112 plus53 diagnostic/test files PASS; import graph112, missing0/cycles0.
- Canonical schema/exact Admin migration consistency PASS; eight registry IDs locally, integrity OK/FK0. Contract outside its accepted cadence section unchanged.
- Full Wrangler dry-run PASS:315,988 bytes (308.58KiB), gzip69.19KiB; dependency metafile generated. Only generated dry-run artifacts were moved to a dedicated local temporary directory; no application/config/test changes.

## Verified production baseline

Account `8307102f31af6634e2cf4c5ab6ce5c3a`; Worker `e36-united-api`; zone `e36united.cz`; existing route `api.e36united.cz/*` targets that Worker, fail-open false. No custom Worker domains or schedules. Existing workers.dev and previews enabled.

D1 `e36-united-db` / `b25a2d51-7ae3-4c7a-9933-3fdb907981c4`, binding DB, EU/EEUR, primary reads, replication disabled,512,000 bytes at preflight. MEDIA points to `e36-united-media`, jurisdiction eu; managed public access disabled, no custom public bucket domains.

Compatibility2026-08-22, no flags, standard usage model, logpush false, no tail consumers. Five plain vars match wrangler.jsonc, including existing SMTP2GO EU base,200/day limit and sender/reply values. Existing secret names: SMTP2GO_API_KEY and SMTP2GO_WEBHOOK_SECRET; values were neither printed nor copied. Runtime settings were read only, not changed. Installed deployment code was inspected: absent route configuration does not publish replacement routes; keep-vars preserves extra plain vars, not all configuration by itself.

Previous **and final unchanged** active Worker version: `c8f3bde2-29f6-4668-8d21-37c8b0fa9c1d`,100% traffic. Deployment: `a6c55e90-2221-4cd2-a81d-663e8ded9d99`,2026-09-07T21:04:24.16303Z. Its annotation references earlier66efda1025fd03378fe4f2a26f375b7872f30bb8, not the approved Stage3 release. This live version, not a Git SHA assumption, was recorded as a possible rollback target.

## Migration gate

Registry is schema_migrations, not an assumed Wrangler d1_migrations registry. All four predecessor IDs (Mailing foundation/editor, production-feedback, mailing-delivery) and required objects/constraints match. The mailing_campaigns column-order difference versus canonical schema was reconciled against the exact foundation→editor→delivery SQL; no semantic mismatch or bookkeeping repair.

| Approved migration, dependency order | Observed registry/schema | Outcome |
| --- | --- | --- |
| 2026-09-08-admin-safe-operations | Absent; all24 expected objects absent | First execution rejected before launch; NOT APPLIED |
| 2026-09-08-admin-member-identity | Absent; all7 expected objects absent | NOT ATTEMPTED |
| 2026-09-08-admin-read-budget | Absent; expected index absent | NOT ATTEMPTED |
| 2026-09-08-admin-preferences | Absent; expected table absent | NOT ATTEMPTED |

Remote foreign_key_check returned no rows; quick_check returned ok. Successful diagnostics reported rows_written0/changed_db false. A compound-SELECT aggregate diagnostic exceeded D1's term limit and was replaced by read-only scalar counts; this was an audit-query error, not an application regression or migration attempt.

A current Time Travel bookmark was obtained around22:47 UTC; recovery details remain outside committed documentation. No restore occurred. A future attempt must obtain a fresh recovery point and recheck migration state, active deployment and concurrent activity. Installed Wrangler explicit-file import behavior was reviewed (whole original file, service unavailable to ordinary queries during ingestion, failure returns original state); no hand splitting or BEGIN/COMMIT wrapper was introduced.

Aggregate baseline:5 members,0 reservations,5 cars,5 car photos,5 gallery submissions,12 History claims,23 United Points entries,30 Admin audit entries,0 persisted Mailing contacts,2 campaigns,0 recipients/delivery events. Accommodation allocations/units/total all0; no reservation/payment rows to aggregate or open as an existing detail. Six events2021–2026, only2026 CURRENT, all registrations closed; current venue/start unset, end2026-06-30, payment test mode1. Counts are a bounded baseline, not a full record checksum or proof that concurrent legitimate activity cannot change values. No business changes were made by this task.

QR table absent, so no Stage2 issued identities can be counted/read yet;5 existing profiles await the separately authorized provisioning follow-up after migration. No QR creation/rotation was attempted.

## Smoke evidence and stop

Public homepage/gallery load200 and retain video cGfcolaqczM. Admin HTML/admin.js/dashboard JS/CSS, galerie.html and main.js match approved source after line-ending normalization. Homepage's observed byte difference is Cloudflare email-protection markup at the contact link, not evidence of a new source commit. Health and current-event JSON return200/ok; current event is united-2026. Unauthenticated summary/dashboard/preferences/members return401 without printing private payloads. These are not authenticated endpoint success claims.

Existing legitimate Admin browser session was available. Its event selector loaded; dashboard summary/analytics/preferences visibly remained unavailable after one explicit read refresh. Members workspace opened but no successful list/detail was established. Browser log API supplied no captured entries, so exact failing authenticated HTTP statuses/response bodies and absence of runtime/network errors are NOT certified. The source/deployment/schema mismatch is substantiated; post-rollout resolution was not tested because rollout did not occur.

The execution approval layer rejected the exact first production migration command: it did not accept attachment-only instructions as trusted authorization for the durable production write. The command never launched. No alternate API/CLI path was used to bypass rejection. A final read confirmed the same four predecessor registry entries and unchanged active deployment.

Not performed: production migrations/deployment/rollback; post-deploy public/Admin smoke; Member360/tab/private media/QR verification; production preference save/concurrency; existing reservation detail (none exists); visible/hidden cadence observation; browser network/console certification; any provider readiness or email call. Existing read handlers were inspected to distinguish safe Admin reads from Member bootstrap/onboarding/VS writes; no Member portal or write workflow was entered.

## Remaining boundary

Resume only after direct chat confirmation resolves the execution approval requirement. Recheck current production state/recovery before applying the four missing files in the order above, then deploy only approved1a89afda with preserved settings and complete bounded read-only smoke. Do not infer a deployed release from this local documentation commit.

No rollback was needed or attempted. Worker rollback would not undo D1 and may leave Stage3 Pages incompatible with the older Worker; DB restore and Pages rollback require separate authorization.

No application/SQL/migration/test/interval changes, redesign/Stage4, business repair/backfill, existing-member QR provisioning, production business writes, provider/email/configuration changes, secret/DNS/binding/billing changes, database restore, Git push or Pages deployment. Stage2's accepted3,904,805 conservative estimate and formally unmet1M target remain unchanged; neither is actual Cloudflare billing.
