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

## Resumed rollout — 2026-09-09, direct operator authorization

**PRODUCTION ROLLOUT VERIFIED within the bounded read-only smoke below.** This later record supersedes the earlier blocked operational status, not its historical evidence. Fresh checks and deployment ran approximately 07:35–07:39 UTC; authenticated smoke and read-back checks approximately 07:40–07:46 UTC (Europe/Prague +02:00).

Starting HEAD `ad17caa062a002533a647654bbc815a9537a7862`, clean main, 1 ahead / 0 behind. Its only difference from approved `1a89afdab10b76c9c6c80a1115bf2bb8ae66dc65` was the two known rollout documentation files. Remote main was read again and remained that approved release. No source/configuration/SQL/test drift or concurrent Worker deployment appeared. The already completed unchanged local gate above was reused as requested: Node352/352, Chromium68/68, focused WebKit37/37, syntax112+53, imports112/missing0/cycles0, ordered migration/FK/integrity tests and full315,988-byte dry-run. No dependency upgrade or repeated browser suite.

Fresh preflight confirmed the same account, Worker, DB, private EU R2, configuration, four predecessor migration IDs, missing Admin objects and business aggregates. Remote foreign_key_check was empty and quick_check was ok. A fresh usable Time Travel bookmark was obtained before the first write, around07:35 UTC; it is not committed here. No restore was attempted. The exact previously active Worker version remained the rollback candidate. Existing explicit-file import execution/failure behavior and concurrency precautions from the completed preflight were retained.

### Applied schema and deployment

All commands used the unchanged original complete SQL files through Wrangler4.129.0 explicit remote D1 file execution, without catch-all migration application, statement splitting or added transaction wrappers. Each command succeeded on its first attempt; schema/registry/FK/quick_check and business aggregates were checked after each file before proceeding.

| Migration, exact dependency order | Before | Outcome / exact schema objects | Cloudflare command rows read / written |
| --- | --- | --- | --- |
| 2026-09-08-admin-safe-operations | Absent, objects absent | Newly applied; 24/24 match | 31 / 84 |
| 2026-09-08-admin-member-identity | Absent, objects absent | Newly applied; 7/7 match | 67 / 39 |
| 2026-09-08-admin-read-budget | Absent, object absent | Newly applied; 1/1 match | 2 / 3 |
| 2026-09-08-admin-preferences | Absent, object absent | Newly applied; 1/1 match | 1 / 5 |

None skipped or failed. These are actual migration-command D1 metadata, not business-row counts and not a replacement for Stage2's estimated workload budget. Registry now has all eight expected IDs; all33 approved objects match canonical DDL, including indexes/constraints/trigger bodies. Removing those new objects from the final schema produces the same pre-existing schema fingerprint as fresh preflight. Every remote FK check returned0 rows and every quick_check returned ok; a separate full remote integrity_check was not run. Database size increased from512,000 to593,920 bytes.

Safe-operations seeded exactly27 technical revision entries: accommodation3, accommodation-catalog6, event-settings1, gallery5, history12; all revision0 after smoke. Receipts0, saved preferences0, issued QR identities0 / existing members missing identity5. No existing-member provisioning was invoked.

Immediately before deployment, the original live deployment was rechecked unchanged. Complete308.58KiB Worker upload (gzip69.19KiB, startup4ms) used existing wrangler.jsonc and keep-vars, without source/config edits. Application source is exactly approved `1a89afdab10b76c9c6c80a1115bf2bb8ae66dc65`, despite the local docs-only descendant.

| Production Worker state | Previous | Final |
| --- | --- | --- |
| Version | c8f3bde2-29f6-4668-8d21-37c8b0fa9c1d | 52a48e0b-3c3b-4ba6-8a2a-37e199e246ef |
| Deployment | a6c55e90-2221-4cd2-a81d-663e8ded9d99 | 45a9b967-8d59-49f3-8f43-e758990bdf6e |
| Created UTC | 2026-09-07T21:04:24.16303Z | 2026-09-09T07:39:08.488334Z |
| Active traffic | 100% | 100% |

Post-deploy configuration read-back matched preflight exactly except the expected release annotation. DB/MEDIA identities, R2 EU/private state, route/domain mappings, workers.dev/previews, five runtime vars including200/day limit, secret names, compatibility date/flags, usage model, logpush, schedules and tail consumers were preserved. Secret values were never read back or published. No new resource, DNS/provider setting or Pages release was created.

### Actual production smoke and limits

- Homepage/gallery returned200 and retained video cGfcolaqczM. Admin HTML/admin.js/dashboard JS/CSS, galerie.html and main.js matched approved source after line-ending normalization. The earlier observed Cloudflare email-protection transformation still prevents an exact homepage byte-match claim. Health/current-event returned200 JSON/ok, current event united-2026; registration settings remained closed and unchanged. Protected unauthenticated summary/dashboard/preferences/members returned401 JSON, not a private-data response. OPTIONS returned204 with the correct origin and Authorization, Content-Type, If-Match, Idempotency-Key support; no conditional write was submitted.
- The legitimate existing Chrome Admin session loaded and restored after an intentional reload. Events2021–2026 and selected2026 context loaded. Dashboard summary, trend/attention data and factory preference composition loaded meaningfully with honest zero/empty reservation and financial states; prior unavailable-source banners were no longer observed. GET preferences was exercised by startup; no save/reset, no stored preference row.
- Reservation list and payments displayed0 records; accommodation displayed3 existing options/capacities. No existing reservation detail was available to open, and none was created for testing.
- Member list displayed5 records; search found an existing member. Member360 header and all nine tabs were read: event, reservations/finance, Garage, photos, Club, history/S&S, Points, Mailing and QR. Two Garage images loaded successfully, as did visible private history thumbnails and one full1024px private evidence image. Member history showed6 entries, Points13 entries and Club its existing rating/achievements. QR correctly stated not provisioned rather than transport failure; issued identities cannot be tested for stability because none exist.
- Gallery read showed5 approved photos; history review showed12 existing claims. No moderation button was used. Stored Mailing overview showed5 current-member projections and2 campaign drafts, while persisted mailing_contacts remained0; Member360 correctly showed no explicitly linked persisted contact. No import/sync/readiness/provider/email operation. Event settings read showed the existing closed2026 event without saving.
- A visible coordinator cycle was observed after reload: completion09:44:51 →09:45:51 local, while the summary's load time remained09:44:51. This is bounded UI evidence consistent with the60s coordinator/300s analytical policy, not a production load or precise request-count test. An attempted auxiliary blank tab did not actually hide Admin (document.hidden stayed false), so production hidden-tab behavior is NOT VERIFIED. That temporary tab was closed. Hidden/offline/denied/logout guards remain covered by the unchanged local tests/source; no policy alteration.
- The available browser console-log API returned no captured warn/error entries, and no new visible runtime/unavailable-source error appeared. This tooling exposes no full authenticated network trace; exact per-request HTTP status/CORS/error absence across all authenticated reads is NOT certified. UI success, public status checks, schema checks and local tests are distinct evidence, not interchangeable. Pre-rollout dashboard failure was visually reproduced in the earlier attempt; exact failing authenticated response bodies were not captured then. Dashboard and member unavailability are now resolved in the exercised UI flow.

Final bounded business baseline remained exactly5 members,0 reservations,5 cars,5 car photos,5 gallery submissions,12 history claims,23 Points entries,30 Admin audit entries,0 persisted Mailing contacts,2 campaigns and0 recipients/delivery events. Reservation/payment/allocation aggregates and six-event registration/current/date settings matched fresh preflight. Counts/aggregates and schema fingerprints are not full business-record checksums; they do not rule out every unrelated concurrent value change. No business write path was invoked by this task, and technical revisions/receipts remained unchanged after the reads.

Intentionally not tested: any production mutation, preference save/reset/concurrency, payment/reservation submission, member edits, moderation, provider readiness/email, QR provisioning/resolution of an issued identity, absent existing-reservation detail, physical mobile devices, full browser network capture and a genuinely hidden-tab production interval. These are not silently marked passing. No verified new regression required rollback. Worker-only rollback would leave additive D1 schema in place and can mismatch Stage3 Pages; DB restore/Pages rollback remain separately authorized operations.

Closeout changes only this rollout note and progress documentation, followed by one new local docs-only commit; no Git push. No application/SQL/test/interval edits, redesign/Stage4, business repair/backfill, existing-member QR provisioning, provider/email/configuration change, secret/DNS/binding/billing change, database restore or Pages deployment. Production writes were limited to the four explicitly approved migration files and the approved complete Worker deployment.
