# Admin v2 progress

Current Stage 3 status (2026-09-08): implementation, visual review and the complete final local validation gate are complete and PASS. Stage 2 remains operator-accepted with its 1M synthetic target formally UNMET. The latest operator instruction authorizes ONE green Stage 3 commit and then push of current main, but no deployment, production migration/write or Stage 4. Historical local-only records below describe their own earlier checkpoints.

## Stage 2 operator acceptance / documentation-only closeout — 2026-09-08

- Accepted conservative estimates: corrected baseline 5,373,090; optimized 3,549,822; **3,904,805 including 10% reserve**, a 33.93% reduction. The <=1,000,000 synthetic target remains formally unmet; neither its result nor the failing budget diagnostic is reclassified as passing.
- Expected real use: about **3 total visible admin-browser-hours/week**, typically one admin account; event days about **two admins x 5–6 hours = 10–12 admin-browser-hours/day**. Hidden tabs remain idle. The synthetic 3-admin x 12-hour and 24-hour calculations remain stress/sensitivity models, not normal-use forecasts. Local profiling/proportional estimates are not actual Cloudflare `meta.rows_read` or a production billing guarantee.
- The operator accepts the remaining gap given expected usage, the targeted savings and the existing green validation/safety record. No further Stage 2 SQL/cache/refresh/architecture optimization is authorized merely to meet 1M. Preserve the accepted checkpoint and preceding reviewed work; no new cache framework, service or broad rewrite is required for this handoff.
- The Stage 2 Free-tier cadence amendment in contract section 6 remains authoritative: 60s operational, existing 120s costly lists, 300s analytical; safety, concurrency, dirty-state, QR and data semantics remain unchanged.
- When separately authorized, Stage 3 must measure its own **incremental dashboard/query cost** and reuse the existing coordinator/canonical resources. No widget/chart may introduce an independent polling timer or reopen broad Stage 2 optimization. This acceptance does not start Stage 3/4 or authorize rollout.
- This closeout changes documentation only. Prior Node 342/342, Chromium 59/59, WebKit 28/28, syntax/import/migration/FK results remain historical validation of the accepted implementation, not newly rerun results. No full browser rerun is needed for this documentation-only decision. No push, deployment, production writes/migrations, provider changes or email.

Details and unchanged evidence: [admin-v2-free-tier-budget.md](admin-v2-free-tier-budget.md). Closeout commit: `docs: accept admin v2 stage 2 budget boundary` (final SHA reported after commit).

## Stage 1 — complete, local only

- Initial origin and stage start: `66efda1025fd03378fe4f2a26f375b7872f30bb8`.
- Preflight: clean synchronized main after one successful fetch; no other active repository/rollout task found. Historical SMTP2GO SHA was not treated as a reset target.
- Baseline: Node 305/305; syntax 95/95; Chromium 39/39; focused WebKit 8/8; 95-file import graph acyclic; local schema integrity OK / foreign-key check empty.
- Completed: independent metric reconciliation/data map, canonical read-only summary and bounded existing lists, canonical source identities, one active-context refresh/request lifecycle, atomic expected-state commands and durable outcome reconciliation, current-editor drafts/dirty/Back/offline/access-loss protections.
- Stages 2–4 have NOT been implemented. No Member 360, QR identity, dashboard redesign/preferences/graphs or five-area navigation.
- One local checkpoint uses `fix: establish truthful admin data and resilient operations`. Final SHA is reported after commit, not embedded in its own contents.

## Confirmed source issues / fixes

| Source | Verified issue | Stage 1 correction |
| --- | --- | --- |
| admin/api.js | Unbounded token/fetch/body; retry read mutable current user | Finite captured-identity client; same-user 401 only; one transient GET retry; coalescing/cancellation |
| admin.js | Broad loading gate / Promise.all; history-only timer | One visible 10s coordinator; summary + active domain/detail; isolated failures |
| Overview/settings | Background refresh rehydrated editable values | Before-input base capture, dirty/focus protection, changed-field-only settings payload |
| Scope/navigation | Old event/detail data could survive context replacement | Generation + resource identity; clear new-event scope; inert settings until fresh; Back preserves safe list context |
| Admin projections | Active-only paid money; people labelled as units; loaded pages used as totals | All-status recorded receipts, separate active obligations/debts/overpayments, confirmed units/people versus pending demand, exact paginated totals |
| Admin writes | No client expected state or durable outcome | Atomic source CAS, zero-primary assertion, receipt bound to actor/body/base; source triggers cover Member writers |
| Recovery UI | Unknown outcome could be presented as failed save | Same-ID reconciliation/explicit retry; no offline replay; local deltas and pending identity kept separately |
| Overlays | Background refresh/alerts could reset or obscure current work | Protected open drawer/card, sticky stale/conflict status and reachable close/recovery controls |

## Final validation

- Node: **326/326 PASS** (21 new request/SQL safety tests).
- First-party JS syntax: **103/103 PASS**.
- Chromium: **50/50 PASS** (39 existing + 11 focused Admin cases).
- Focused desktop WebKit: **19/19 PASS** (8 existing + the same 11 Admin cases).
- Import graph: 103 files, zero missing imports/cycles.
- Exact forward migration on populated predecessor fixtures: PASS; full canonical schema integrity OK; foreign-key violations zero; five migration IDs registered. Reapplication fails honestly.
- Shared contract text matches the attachment delimiters exactly; canonical schema includes the exact new migration.
- Diff whitespace check passed. No dependency/Cloudflare configuration changes or added credential material identified.
- Full Member, Mailing, Points, pricing and capacity regression suites remain included. Provider send/readiness responses in browser tests are synthetic.

Accepted failure/race cases include same-base competing payments (one commit / one conflict), no audit/Points/receipt on zero-row mutation, actual History Points replay idempotence, lost committed response, undelivered request, changed-payload/actor ID reuse, Member-write version invalidation, create identity, old-event/old-record rejection, Back/reload during save, stale draft restore, storage denial, access loss, reconnect without replay and hidden-tab idle behavior.

Existing assertions were changed only where Stage 1 explicitly supersedes behavior: conditional CORS headers; canonical rather than page-derived attention; coordinator-based history refresh; preserving an open review card; loading only the active domain; and sending only edited event fields while verifying untouched form values. Fixture schemas add the exact new guard support. No unrelated behavioral coverage was dropped.

During development, browser failures exposed a first-input baseline race and stale-draft warning overwrite; both were fixed in application code. The additional two-record test initially used an ambiguous single-record selector, then explicitly selected its target. The preflight sandbox blocked an existing YouTube thumbnail and sandbox teardown was unreliable; unchanged outside-sandbox baselines passed. Final suites use the same tests/assertions without blanket runtime-error allowances. Expected injected HTTP/transport failures are matched only to their synthetic failing routes. A non-functional NO_COLOR/FORCE_COLOR warning remains.

## Migration / runtime budget / limitations

Apply `db/migrations/2026-09-08-admin-safe-operations.sql` ONCE, after the existing foundation → editor → production-feedback → mailing-delivery migrations. It adds only revision/receipt tables and source triggers. Tested against synthetic local data only; not applied remotely. Future authorized rollout must migrate before the updated Worker. Old open Admin clients lack required headers and fail closed with 428; they must reload.

Default visible cycle: 10s after completion, 20/40/60s failure backoff, immediate coalesced focus/reconnect/pageshow/invalidation. Summary-only: about 6 HTTP / 12 D1 statements per minute/admin; list + opened reservation detail: 18 / 72. Five admins: 30 / 60 and 90 / 360 respectively. Hidden/logout/denied: zero periodic calls. Full per-context budget and exclusions are in admin-v2.md; these are not billed-row/free-tier guarantees.

Desktop 1440px and mobile 390px synthetic stale/conflict/focused-form screenshots were inspected; browser cases cover drawer/Back and reachable close controls. Screenshots are ignored local test-results artifacts, not production data. Desktop WebKit is NOT physical Safari/iPhone, actual iOS software keyboard, bfcache process-eviction or production edge validation. No production SELECT audit was performed.

External R2 upload/delete semantics are preserved, not falsely included in D1 atomicity. Receipt/tombstone retention is deliberately not automatically purged. Existing Mailing source projections retain documented separate read boundaries; no new provider/sending engine. Cloudflare/D1 guidance informed the single-batch rollback boundary and forward-only local migration validation.

## Handoff / boundaries

- Stage 2 requires a new instruction: Member 360/canonical links/private media and QR foundation.
- Stage 3: five-area navigation, personal dashboard/charts/preferences and exact new drill-downs.
- Stage 4: remaining cross-domain responsive/recovery acceptance.
- No push, deployment, production migration/write, provider configuration/call, email or real-contact import occurred.

## Stage 2 — local Member 360 / QR checkpoint, 2026-09-08

### Continuation / preserved history

- Recorded original origin: `66efda1025fd03378fe4f2a26f375b7872f30bb8`.
- Historical reviewed Stage 1: `e6dc108d8f2f6392ae03ec5ee8641a9e67d7b041`.
- Actual Stage 2 starting HEAD: `24a1b1447608aeb8c3dd7fdef73d276ba05a907e`.
- Fetched origin/main once: `fc52f24fbf7b2aa42bf7326f2e7268514568b703`, the reviewed official2026 YouTube hotfix. Its diff was only index.html, galerie.html and main.js (8 insertions/8 deletions), with no Admin/backend/schema changes.
- The previous explicitly authorized hotfix workflow had already rebased Stage 1 over that hotfix. Therefore historical e6dc108 is not literally an ancestor of the current branch; range-diff verified its exact patch-equivalent24a1b14 counterpart. The backup branch still retains e6dc108. This is known reviewed lineage, not new divergence. No history rewrite/rebase/reset/merge/amend was performed in Stage 2.
- Preflight: clean main, one local Stage 1 commit ahead of fetched origin; no concurrent task. Current actual baseline passed Node326, syntax103, Chromium50, focused WebKit19, imports0missing/0cycles, local integrity/FKs/migration checks. No implementation preceded that gate.
- index.html / galerie.html / main.js remain byte-for-byte Git-equivalent to the starting checkpoint. Video cGfcolaqczM /2026 stays unchanged. Package/dependency/Cloudflare configuration files are untouched.

### Implemented / current policy

Canonical Members list/search and one desktop drawer/mobile fullscreen detail; reservation/payment, gallery/history and genuinely linked Mailing buttons share immutable Member IDs. Separate identity/event, reservations/stay/finance, Garage/photos, history/S&S, Points/Club/achievements, actual Mailing history and QR tabs. Bounded page totals and duplicate-name/multi-car tests; no fuzzy ownership. Existing editor links remain read-only navigation. Back/direct entry/reload preserves safe source context and dirty payment text.

Global search: minimum2 meaningful characters,400ms debounce, max20 suggestions, same-query coalescing, actor/event30s cache, cancellation/generation protection, POST resolver for complete QR payload. Media verifies exact member-parent relation; visible-only loading, unchanged blob reuse/revocation and private no-store responses. No private cache survives access loss/logout.

Stable192-bit opaque QR identities, unique token/member constraints, explicit current-fixture provisioning and new-member bootstrap only. Forward migration follows Stage1; no production provisioning endpoint, no read-side generation. Existing profiles/login edits never rotate tokens. Actual rendered SVG decodes independently to the same versioned opaque payload. See admin-v2.md for rollout provisioning boundary and camera extension point; identification is not authentication/payment/check-in.

One existing coordinator now uses60s operational cadence,120s reservation/gallery lists,300s summary/history/analytical Member/stored Mailing. Foreground Member suppresses obscured lists, which become stale on return. Focus/reconnect revalidate visible operational editor/list/header and only due analytical resources; lifecycle storms coalesce. Own mutations retain authoritative immediate result +one existing invalidation/reconciliation. Known offline/hidden/denied/logout produce no periodic requests. Backoff120/240/300s. Actual resource timestamps do not borrow the one-minute coordinator timestamp.

Shared contract changed only within section6, dated2026-09-08; all other text is verified identical to the original shared contract. Stages3–4 inherit the amendment, including the three-human/six-context sensitivity and row-budget gate, not the historical10s/five-admin plan.

### Resource review / unresolved acceptance

See [admin-v2-free-tier-budget.md](admin-v2-free-tier-budget.md) for actual captured SQL plans/response sizes, reproduction, overhead and official limits. Synthetic growth:500members,3events,900reservations,750cars,1,500photos,1,000claims,5,000Points,102contacts,501recipients,1,000receipts. Every periodic/Member/search/QR/media projection was executed with EXPLAIN; active-Admin query included. Read-phase total_changes remained unchanged, no polling writes.

Summary reservation aggregates now share one canonical metrics pass; pending-capacity display shares the same approved usage SUM without changing its original option/event scope or any write predicate. Six justified indexes; an ineffective trial email expression index was removed, not falsely credited. Existing Mailing projection remains expensive; no general segmentation rewrite.

Overall periodic ceiling3data requests/context/minute. Worked three-context12h envelope5,505,450rows (target1M; **gap4,505,450**), with10% retry sensitivity6,055,995. These are reproducible local-plan estimates, not Cloudflare meta.rows_read. The budget is **NOT accepted**, including shared hard-limit headroom; a separate authorized measurement/narrow follow-up is required before rollout. Full Member/QR scope was not omitted to hide the gap.

Existing single-size private image storage has no thumbnail derivatives: visible thumbnails fetch the existing original and fullscreen reuses it. No whole archive preload or new media service/R2 writes. Desktop browser emulation/QR matrix decoding is not physical iOS/camera or production CPU/billing validation.

### Validation record

- Final Node: **336/336 PASS**, versus326 preflight (+6 Member/QR tests,+1 growth budget,+1 active-Admin boundary,+2 refresh policy cases).
- Syntax/import graph: **107/107 PASS**, zero missing imports/cycles.
- Local exact forward migration on populated predecessor and canonical schema: PASS; integrity OK, FK violations0, six migration registry entries. Reapplication fails honestly. Existing member rows preserved and tokens provisioned only explicitly in tests.
- Final browser gate: **Chromium 57/57 PASS; focused WebKit 26/26 PASS** (83 total, zero retries, 2.7min). Seven new Member browser cases run in both projects. Complete pre-existing Member/Mailing/Points/pricing/capacity regression remains included.
- Desktop1440x900 and mobile390x844 meaningful Member screenshots inspected: right drawer, full-width mobile, reachable close, identity/context/timestamps, Garage/photo and History. Artifacts: test-results/admin-members-Member-360-d-ea528-y-search-Enter-is-coalesced-chromium/member360-desktop.png; test-results/admin-members-Member-mobil-52125-leanup-preserve-safe-parent-chromium/member360-mobile.png; matching QR and WebKit screenshots are also local ignored test artifacts.
- Existing behavior assertions retained. Only superseded10s/15s timing was updated to60s and a longer hidden interval; fixture additions support the exact QR schema/canonical IDs.
- The initial final browser attempt exposed focus revalidation being too broadly skipped by a fresh cache (conflict warning, stale failure and access-loss tests). Application policy was corrected to revalidate visible operational resources while retaining analytical caching; all11 unchanged Stage1 safety browser cases then passed. The interrupted failing attempt is not counted as a successful final gate.
- No new dependencies/framework/build system, secrets, production data or configuration changes. Existing color-environment warning is nonfunctional.
- One new local commit: `feat: add canonical admin member detail and QR identity`; final SHA is reported after commit rather than embedded in its own content. Expected main is two commits ahead of origin: preserved Stage1 +Stage2.

### Handoff / safety

Stage2 feature work is local and ready for code review, not approved for production on Free-tier estimates. No Stage3 navigation/dashboard/chart/preferences or Stage4 rollout acceptance was implemented. Future widgets must share these canonical resources/cadences, not start extra timers.

No push/deployment, production migration/write/load test, real-contact/user import, SMTP2GO/provider call/configuration, email, secret/DNS change or business-data repair occurred. All fixtures, provisioning, mutations and SQLite executions were local synthetic tests.

## Stage 2 targeted read-budget follow-up — 2026-09-08

Starting HEAD b6923 ebaa 87d0 cceb 8c4de10f74 cbe 25cb780018, clean main. Fetched origin remained fc52f24 fbf 7b2aa42bf7326f2e7268514568b703; expected Stage 1/Stage 2 local lineage verified. No history rewrite. Preflight passed Node 336, syntax 107, Chromium 57 and focused WebKit 26 unchanged.

Retained narrow changes: reservation page-order index; requested-page materialization before hydration; approved usage only for pending page option IDs (original all-event option scope); opt-in source detail without unused list facets; removal of forced fresh-source invalidation on read-only Member return. No Member 360/QR/media/auth/pricing/payment mutation changes, interval changes, cache framework or provider work. Trial search/Mailing materializations were discarded rather than credited without benefit.

New exact forward migration 2026-09-08-admin-read-budget after Stage 2 identity, mirrored in canonical schema, tested on the populated unchanged growth fixture. One index,900 cells,53,248 local bytes; no business-data writes/backfill or QR generation. No production migration.

See admin-v2-free-tier-budget.md, admin-v2-budget-sql.md and before/after JSON for executed SQL, binds, EXPLAIN, local scanstatus/VM counters, full scenario attribution and uncertainties. Historical 5,505,450 arithmetic reproduces, but the old 810 explicit HTTP requests/person was 710. Corrected before 5,373,090; after 3,549,822; with 10% retries 5,910,399 →3,904,805. **Budget condition remains UNSATISFIED (target 1M)**. These are local conservative estimates, not Cloudflare meta.rows_read. The budget diagnostic exits 1 intentionally; no false acceptance.

Final validation: Node 342/342 (+6 regression/accounting tests); production JS syntax 107 plus 49 diagnostic/test JS/MJS files; import graph 107, missing 0/cycles 0; integrity OK/FKs 0; canonical/exact migration checks pass with 7 registry entries and honest duplicate-apply failure. Chromium 59/59 and focused WebKit 28/28,87 total, zero retries. Two new desktop/mobile cases run in both engines; existing assertions were not altered/removed. New checks preserve dirty source fields on Member return, no redundant fresh reads, mandatory focus/due refresh and no injected writes. Source screenshots 1440px Chromium and 390px WebKit visually inspected; no physical iPhone claim. Original public video files are unchanged.

Warnings: stock SQLite scanstatus display crashes on four complex/empty Mailing statements (exit 3221225477; reproduced 3.50.4/3.53.4). Identical SQL succeeds with statement stats; reports retain null row visits and explicit coarse VM ceilings. No application/test failure is disguised. Existing NO_COLOR/FORCE_COLOR browser-runner warning is harmless. Real D1 billing/edge CPU, skewed members, extra bursts/global Mailing sessions and high-fanout mutations are not certified.

One new local commit: `perf: reduce and document Stage 2 admin read costs`; SHA reported after commit. Stop before wider read-model/cache or behavior changes; proposed options and upper-bound benefits are documented, not authorized or implemented. No Stage 3/4, push, deploy, remote migration/write, provider change/call or email.

## Stage 3 — configurable dashboard / grouped navigation, 2026-09-08

### Continuation and scope

- Actual start: `8933c17a4ecbcdb6625b2f8a53af49ae54775768`, the expected documentation-only acceptance commit after `688441b15540623fe416e704b985f04fd2999f9f`. All reviewed Stage 1/2 work is preserved. Main was clean, four ahead / zero behind after the one preflight fetch.
- Original historical origin: `66efda1025fd03378fe4f2a26f375b7872f30bb8`; actual fetched and pre-push remote main: `fc52f24fbf7b2aa42bf7326f2e7268514568b703` (official2026 video). No new history rewrite/reset/rebase/amend/merge. Video files index.html, galerie.html, main.js remain Git-equivalent to Stage 3 start.
- Preflight: Node342, syntax107 +49 diagnostic/test, import107/zero missing/cycles, ordered local migrations/integrity/FK green; Chromium59. One preflight WebKit navigation-during-save fixture run emitted transient CORS teardown errors; that UNCHANGED test then passed3/3 and the UNCHANGED complete focused WebKit baseline passed28/28 before implementation. No error assertion was disabled.
- Implemented five primary areas, internal destinations, Preparation/Onsite layouts, fixed truthful Attention, six native graphs/exact tables, eight safe quick-link choices, own-UID server preferences and exact scoped list drill-downs. Full catalog/semantics: [admin-v2-dashboard.md](admin-v2-dashboard.md). Member360/search/QR and existing business editors remain canonical.
- Native module cache versions are coherent across the Admin import graph. Mailing/accommodation/Member-detail dependencies changed only their cache-version imports; provider/auth/private-media/business policies did not change. No new dependency or service.
- Existing coordinator remains60/120/300s. No independent widget/chart/composition timer. Factory dashboard uses summary + analytics; optional Planner adds its existing source only when selected. Preferences never poll; reads/navigation create no preference/QR/business rows.
- Back now preserves target history rather than recapturing the outgoing view, owns async scroll restoration and does not inherit public smooth scrolling. This is the narrow dashboard/drill integration, not a Stage 4 operational-page rewrite.

### Validation and visual review

- Final Node **352/352 PASS**, including ten new dashboard/auth cases. Focused dashboard + active-Admin tests **24/24 PASS** (subset, not added again).
- Production JS syntax **112 PASS** plus **53 diagnostic/test files**. Import graph112, zero missing/circular imports. Exact ordered migrations and canonical-schema comparison PASS; eight migration IDs, integrity OK, foreign-key violations0. Shared implementation contract remains unchanged by Stage 3, including authoritative cadence amendment.
- Final browser gate: **Chromium68/68 PASS + focused WebKit37/37 PASS**,105/105 in one complete unchanged run (2.6min). Nine new Stage 3 cases run in both engines; no retries configured.
- During implementation, full regression runs exposed an obsolete Gallery KPI write after removing the old card, a native-details click disturbed by inherited smooth scrolling, and competing router/native Back scroll restoration. These were fixed in application code, not bypassed with error allowances or reduced expectations. The exact Back + chart-stability cases subsequently passed **12/12 repeated checks** before the final full gate.
- Existing assertions changed only where superseded by approved five-area IA/dashboard: primary targets become five areas with all original panels retained; UI clicks follow internal destinations; attention source inspection follows its new module; existing funnel assertions explicitly opt into the now-optional widget. Payment, QR, Member, recovery, moderation, Mailing, capacity, Points and public/Member regressions retain their behavioral checks.
- Inspected synthetic screenshots at1440px and390px: both compositions, non-empty cumulative trend, two accommodation types including unlimited, financial populations/exact tables, actionable Attention, preference editor, stale/partial state. Czech labels/touch controls, responsive contained tables and no dashboard horizontal overflow verified. No physical iPhone/Safari or production-browser claim.
- Artifacts (ignored, synthetic, regenerated by browser suite): `test-results/admin-dashboard-Stage-3-fa-9b80c-igation-and-screenshot-1440-chromium/` and `admin-dashboard-Stage-3-fa-6dad3-vigation-and-screenshot-390-chromium/` contain preparation/onsite viewport and full-page PNGs; preference editor is under `admin-dashboard-Stage-3-pr-781e8--cancel-and-confirmed-reset-chromium/`; stale state under `admin-dashboard-Stage-3-co-78bda-ar-on-stale-partial-sources-chromium/`. Equivalent WebKit artifacts exist.
- One final attempt also reproduced the SAME pre-existing WebKit `admin-safety.spec.mjs:72` navigation-during-save CORS/pageerror failure for summary/reservation GETs. An unchanged five-repeat check produced4PASS/1FAIL; the complete gate was rerun unchanged and passed105/105. This intermittent baseline/browser risk is disclosed, not claimed fixed by Stage 3. No global error allowance, retry setting, network fixture or original test assertion was changed to hide it.
- Existing harmless NO_COLOR/FORCE_COLOR warning remains. Synthetic injected failures are matched only to their intended fixture routes; unexpected browser/runtime errors are not allowed.

### Resource boundary / migration / delivery

- Same growth fixture and actual SQL/binds/EXPLAIN/local scan profiling. Stage 3 analytics:903 local visits, **1,505 conservative operations** including auth per due request. Extra full drills, explicit preference saves/reads/receipt lookup and10% reserve are included separately; OPTIONS affects HTTP only. [Budget/evidence](admin-v2-free-tier-budget.md#stage-3-incremental-dashboard-budget), reproducible `node scripts/check-admin-dashboard-budget.mjs` PASS.
- Increment including reserve: **105,977** normal3h/week; **352,731–423,120** event10–12h/day; **612,603** original mixed3x12h stress; **1,224,027** mixed3x24h sensitivity. Mixed3x12h Stage2+3 estimate **4,517,408**. Local estimates are NOT actual Cloudflare meta.rows_read or billing assurance. Accepted Stage2 **3,904,805** / unmet1M target remains unchanged; no further Stage2 optimization.
- Only new migration: `2026-09-08-admin-preferences.sql`, after admin-read-budget. One bounded own-UID JSON/revision row; explicit first save has six local SQLite changes including existing receipt/version bookkeeping. GET/polling zero writes. Existing populated rows/FKs and fail-closed preconditions verified.
- Future rollout must apply approved pending migrations in order before serving the updated Worker; deployment and production migration/provisioning require separate approval. A Git push is not proof that Worker/schema changes are deployed.
- Optional Poslední změny omitted: audit/receipts do not provide complete cross-domain activity and do not justify another history/query system.
- Required single commit: `feat: add configurable admin dashboard and grouped navigation`; resulting SHA and post-push equality/CI are reported externally after commit, not self-embedded. Latest user amendment authorizes only the green checkpoint push, superseding the original local-only push restriction.
- No deployment, production migration/data write, provider/configuration call/change, email, real-contact import, secrets/DNS change or paid-service activation. Stage4 NOT started; await operator visual/user review.
