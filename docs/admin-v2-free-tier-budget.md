# Admin v2 Stage 2 — targeted read-budget follow-up

2026-09-08. **Stage 2 + targeted optimization OPERATOR-ACCEPTED; 1M synthetic target formally UNMET. No rollout approval. Stages 3–4 not started.**

## Decision and scope

The requested ceiling is **1,000,000 reads including explicit actions and 10% retries**. Narrow local SQL/duplicate-loading fixes reduce the corrected conservative model from **5,373,090 to 3,549,822**, or **5,910,399 to 3,904,805 with retries** (33.93% reduction). The remaining gap is **2,904,805**. The operator accepts implementation checkpoint `688441b15540623fe416e704b985f04fd2999f9f` and preceding reviewed Stage 2 work for handoff, explicitly accepting that this engineering target is NOT MET. Do not relabel the target as passed or infer Free-tier production headroom.

Operator usage clarification: ordinary use is approximately **3 total visible admin-browser-hours per WEEK**, typically one admin account. Event operation is approximately **two admins for 5–6 hours each**, or **10–12 admin-browser-hours per event day**. Hidden tabs remain idle. The synthetic 3-admin x 12-hour and 24-hour calculations remain stress/sensitivity models, not expected normal usage. A proportional local estimate is not Cloudflare `meta.rows_read`.

The operator accepts the 33.93% saving and existing green safety/concurrency/dirty-state/QR validation without further architectural complexity for this usage. **No further Stage 2 SQL, caching, refresh or architecture optimization is authorized solely to satisfy 1M.** The Stage 2 Free-tier cadence amendment remains authoritative: 60s operational, existing 120s costly lists, 300s analytical. When separately authorized, Stage 3 must measure its own **incremental dashboard/query cost**, reuse the existing coordinator/canonical resources and introduce **no independent widget/chart polling timers**. Do not reopen broad Stage 2 optimization. Tests, semantics and the failing 1M diagnostic remain unchanged.

The historical 5,505,450 estimate and 6,055,995 retry sensitivity are reproduced below, not retroactively called measured facts. The corrected before/after use identical call counts, unchanged fixture volume and a common estimation method. They differ from that historical total because its endpoint envelopes had no per-SQL accounting and its startup/operation allowances were bundled.

These are **local SQLite measurements plus explicitly conservative engineering estimates**, NOT Cloudflare `meta.rows_read`, NOT a production daily bill, and NOT edge CPU measurements. No production sampling, deployment, D1/R2/provider call or email was performed. A successful application regression suite is not a passing budget gate.

Preflight: clean `main`, HEAD `b6923ebaa87d0cceb8c4de10f74cbe25cb780018`; parent `24a1b1447608aeb8c3dd7fdef73d276ba05a907e` (Stage 1), then `fc52f24fbf7b2aa42bf7326f2e7268514568b703` (video). Fetched origin remained fc52f24; two reviewed local commits ahead, no unexpected lineage change. No rebase/reset/amend/merge/history rewrite.

## 1. Reconcile the original 5,505,450

The unchanged historical calculator is `tests/helpers/admin-budget-model.mjs`. Calls below are for all three administrators/12h, not per person. Shared auth was already inside each envelope; do not add it again.

| Resource / original bundle | Calls | Envelope / call | Contribution | Share |
| --- | ---: | ---: | ---: | ---: |
| Summary | 240 | 6,000 | 1,440,000 | 26.16% |
| Reservation list | 276 | 5,000 | 1,380,000 | 25.07% |
| Reservation detail | 456 | 3,000 | 1,368,000 | 24.85% |
| Gallery | 90 | 3,000 | 270,000 | 4.90% |
| Member search | 180 | 5,000 | 900,000 | 16.35% |
| Member header | 1,620 | 20 | 32,400 | 0.59% |
| Member Garage | 720 | 100 | 72,000 | 1.31% |
| Other Member tab | 180 | 100 | 18,000 | 0.33% |
| Mutation / outcome allowance | 60 | 20 | 1,200 | 0.02% |
| Private images + auth | 1,170 | 5 | 5,850 | 0.11% |
| Boot / Funnel allowance | 3 | 6,000 | 18,000 | 0.33% |
| **Total** | | | **5,505,450** | **100%** |

Summary's80 calls/person =48 polls +20 mutation reconciliations +12 lifecycle bursts; startup was in the separate 6,000-row bundle. Reservation list 92 =60 polls +20 reconciliations +12 lifecycle. Detail 152 =120+20+12. Header 540 =480 polls +60 explicit openings. Garage 240 and other tab 60 are distinct.

**There is no honest exact per-SQL decomposition of those historical hand-picked envelopes.** No SQL counters were saved for them. Allocating the 6,000 or5,000 arbitrarily among SQL statements would fabricate evidence. The [SQL breakdown](admin-v2-budget-sql.md) instead gives every actual captured statement, bindings/EXPLAIN, measured local loop visits or VM steps, per-call estimated reads, call counts, contribution and share for a corrected before/after. Remaining allowance is explicitly unassigned headroom. Raw evidence: [before](admin-budget-before.json), [after](admin-budget-after.json).

Original HTTP arithmetic had a separate error:60 search +120Member header/tab +20 mutations +20 outcomes +60 reconciliations +390 images +4 initial/entry reads +36 lifecycle = **710**, not 810, requests/person. This does not change the original row-envelope sum above.

## 2. Coordinator/workload audit

The new regression evaluates the **actual task-selection body in admin.js**, the actual Member task builder, `resourceDue` and the existing coordinator with a synthetic clock. No independent test-only polling policy is substituted.

| Time/person | Foreground | Periodic calls/person |
| --- | --- | --- |
| 4h | Member identity / selected event | 240 header |
| 4h | Member Garage | 240 header +240Garage |
| 2h | Reservation list + open source editor | 60 list +120 detail +24 summary |
| 1h | Dashboard | 12 summary |
| 1h | Community gallery | 30 gallery +12 summary |
| **12h** | One active workspace/overlay | **978 data calls** |

Member overlay suppresses the obscured source list, detail and summary. Global Mailing also replaces workspace summary polling; only its visible stored-data projection refreshes every 300s. No full Member archive, inactive tabs, all charts or provider readiness is added to a periodic cycle. Existing Stage 1 already polled legacy summary/lists/detail/Mailing; Stage 2 slowed cadences and introduced Member resources. It did **not** create a new global Mailing poll where none existed. Its newly introduced unconditional `memberhidden` invalidation, however, could reload old endpoints on each short read-only return. This follow-up removes that redundant invalidation.

Intervals remain **60/120/300s**. Operational focus/visible/pageshow/reconnect checks still revalidate even when young; analytical data respects its 300s age. Failed/missing/stale resources reload. Own mutation still invalidates immediately. Hidden/offline/logout/denied: zero periodic requests. The return keeps the real previous fetch timestamp; it does not falsely stamp cached data as newly read.

Explicit workload is unchanged:60 searches,60Member openings/tab interactions,20 own edits +20 outcome checks +20 three-resource reconciliations,390 images,4 initial/first-entry reads and 12 three-resource lifecycle bursts/person. Startup/entry is events+summary+Funnel+Member list across navigation, not four screens simultaneously. The 12 lifecycle bursts conservatively charge list/detail/summary when all are due. The generic 100-row Member-tab envelope covers any one selected tab; the SQL table illustrates ten interactions each for reservations/photos/history/Points/Club/Mailing, not 60 calls to every tab.

Three contexts: **2,934 periodic +2,130 explicit/initial =5,064 requests**. With one uncached OPTIONS for each:10,128; with 10% retry sensitivity: **11,141 incoming requests**. The separate theoretical 3-per-minute polling ceiling is6,480, not an actual-workload count. Adding explicit overhead to that ceiling gives 8,610, not the old 8,910.

OPTIONS dispatches before auth/database and contributes **zero D1 reads**. Each actual protected request rechecks active Admin in D1; that SQL is Q1 in the evidence, including private media and explicit commands. Normal read-profile auth is one index visit plus a conservative table-probe allowance (2), never a permanent cached permission. Firebase certificate network misses are subrequests, not extra D1 rows.

The original scenario did not specify additional standalone Member-close/manual-refresh bursts, prolonged global Mailing use, or many contact-page clicks. We do not silently add their hours to the twelve hours, nor claim they are free. Extra return bursts can cost up to summary+list+detail when due; rapid fresh returns no longer force those reads. These are additional sensitivities, not a reason to accept the failing main budget.

## 3. Corrected endpoint accounting

Per-call reads include auth. Read-only entries use actual local scanstatus plus the allowances below. Search/Member/explicit mutation envelopes are deliberately retained/increased, not lowered to manufacture success. The pending reservation detail is the heavier reference, not the cheap approved example.

| Resource | Poll calls /3 contexts | Explicit calls | Before → after /call | After contribution | Share |
| --- | ---: | ---: | ---: | ---: | ---: |
| summary | 144 | 99 | 4,271 → 4,271 | 1,037,853 | 29.24% |
| reservation-list | 180 | 96 | 6,522 → 3,483 | 961,308 | 27.08% |
| reservation-detail | 360 | 96 | 2,907 → 748 | 341,088 | 9.61% |
| gallery | 90 | 0 | 1,270 → 1,270 | 114,300 | 3.22% |
| member-header | 1,440 | 180 | 20 → 20 | 32,400 | 0.91% |
| member-garage | 720 | 0 | 100 → 100 | 72,000 | 2.03% |
| member-tab | 0 | 180 | 100 → 100 | 18,000 | 0.51% |
| search | 0 | 180 | 5,000 → 5,000 | 900,000 | 25.35% |
| operation | 0 | 60 | 1,000 → 1,000 | 60,000 | 1.69% |
| receipt | 0 | 60 | 43 → 43 | 2,580 | 0.07% |
| image | 0 | 1,170 | 6 → 6 | 7,020 | 0.20% |
| events | 0 | 3 | 16 → 16 | 48 | 0.00% |
| funnel | 0 | 3 | 513 → 513 | 1,539 | 0.04% |
| member-list | 0 | 3 | 562 → 562 | 1,686 | 0.05% |
| **Total before retries** | | | | **3,549,822** | **100%** |
| **With 10% retry reserve** | | | | **3,904,805** | |

Existing legacy summary/list/detail/gallery/startup/auth costs remain in the total. Added Stage 2 header/Garage/other tabs/search/Member-list cost **1,024,086** before retries under the retained conservative envelopes; it is not the whole Admin cost. Private-image/auth cost includes existing media access, not a new bulk image prefetch. Legacy source-return invalidation is a Stage 2-added multiplier that is now removed without granting a numerical discount for unspecified extra close actions.

All profiled supplemental endpoints, including global Mailing, history review and accommodation, are in the raw SQL/EXPLAIN table with zero main-scenario calls where inactive. Their per-call estimates remain material: summary 4,271; accommodation 733; history-review 8,207; global Mailing overview 374,432 / contacts 374,431 / delivery 376,457 (coarse VM ceilings). Member Mailing is a different, indexed, actually linked projection: local estimate 26 for this sample, inside the 100-row selected-tab allowance. Global Mailing contacts/overview are not accidentally counted as Member Mailing.

A one-hour global Mailing overview sensitivity adds 12x374,432 =4,493,184/person before subtracting the replaced foreground hour; this is a deliberately loose **VM ceiling**, not a row bill. It emphatically does not establish a safe Mailing workload. A member holding all 5,000 Points entries would also invalidate the uniform 100-row tab assumption even though the response is paginated. No fixture was shrunk to avoid either risk.

## 4. Causes and narrow fixes actually retained

1. **Reservation hydration before pagination / global capacity aggregation.** Add one expression-order index and materialize the requested page before member/event/snapshot/revision hydration. Compute approved usage only for the actual option IDs referenced by pending rows on that page. Sum retains the original all-event scope for each option, including legacy cross-event allocation references; no mutation capacity predicate or pricing/payment rule changes.
2. **Detail fetched complete list facets repeatedly.** The source drawer opts into `GET /api/admin/reservations?...&id=...&projection=detail`. Only that combination omits unused event-wide totals/facets. It returns the same record and bounded single-record pagination; legacy/default responses retain all facets. A broad list cannot activate the shortcut merely by sending projection=detail.
3. **Fresh source data invalidated by a read-only Member return.** Remove the blanket `memberhidden` cache-age deletion. The existing per-resource freshness policy, stale/error state, mutation invalidation and visible operational auth revalidation remain. No cache service/framework, permission cache or cadence change.

Measured proof: old list 6,522; **index-only**4,346; final page/option-scoped SQL 3,483. The final plan actually visits 50 reservation index entries for the default first page before hydration and uses `idx_reservation_accommodation_option` instead of `SCAN approved`. We do not infer this from LIMIT/index existence alone. Filters, search, later/out-of-range pages, totals and cross-event option cases compare against captured old SQL on the same populated fixture.

Approved source detail 926→24; pending 2,907→748. Legacy/default pending detail remains compatible but 1,654 because it still intentionally includes facets. Legacy approved default 930 vs926 adds four local intermediary operations; no claim every shape is cheaper. Arithmetic improvement in the corrected scenario is **1,823,268 before retries**.

A trial full-result materialization for Member substring search increased the common BMW path's work; it was discarded. A trial Mailing materialization was also discarded without sufficient row-profile benefit. No Member search, Mailing/provider logic, summary metrics or permissions were changed. The remaining dominant costs are complete summaries, full list facets and substring search.

## 5. Measurement, reproduction and limits

Unchanged `adminGrowth()`:500 members;3 events;900 reservations (300/event);750 cars;750 car photos +750 gallery photos;1,000 history/S&S claims;5,000Points;102 contacts;501 recipients;1,000 receipts;540 allocation rows. QR fixture provisioning remains the single explicit synthetic identity used by the original growth test. No real data.

- Real handlers run against Node SQLite and record actual SQL/binds and EXPLAIN. Read-phase `total_changes()` and FK assertions remain unchanged.
- A disposable copy runs the same statements in the official SQLite 3.53.4 Windows shell with ENABLE_STMT_SCANSTATUS. Measured visits include reported index/table and intermediate loops, not only returned rows. Non-covering index table probes are added conservatively; the fast Count opcode gets a full-population allowance because it has no scanstatus loop.
- Four stock-shell scanstatus displays fail with exit 3221225477 in 3.53.4; the contact-query failure also reproduced in 3.50.4. Unchanged SQL then runs successfully with statement counters. Raw files mark those profiles null, retain the failure, and use VM-step ceilings instead of inventing row counts. Contact universe:25,552 fullscan steps /374,429 VM steps. See the SQL evidence for this tooling limitation.
- Explicit local payment/outcome statements are executed/captured, including auth/CAS/receipt/audit and trigger programs. VM ceilings 522→550 for the payment,43 for outcome; the scenario retains 1,000 per operation. This does not establish bounds for unrelated high-fanout catalog edits.
- **No Cloudflare meta.rows_read/rows_written, edge CPU, production DB size or R2 billing was measured.** Query planner/runtime differences, data skew, additional human actions and other site traffic remain uncertainty. No deployment was made to obtain counters.

Reproduction (Node runtime on PATH; SQLite executable is an external diagnostic tool, not a new package/dependency):

```powershell
$env:SQLITE_SCAN_CLI = 'C:\path\to\sqlite3.exe'
node scripts/admin-budget-profile.mjs test-results/admin-budget-live.json
node scripts/admin-budget-profile.mjs test-results/admin-budget-before-live.json --replay docs/admin-budget-before.json --before-index
node scripts/check-admin-budget.mjs test-results/admin-budget-live.json
node --test tests/*.mjs
node node_modules/@playwright/test/cli.js test
```

The budget command intentionally exits **1** while targetMet=false. That is not hidden/skipped or called a passing acceptance. Standard Node regressions assert that this gate reports failure honestly. The snapshot SQL-identity test catches changed handler queries against checked-in evidence. Raw reports include full SQL/binds/plans/loops and endpoint contributions; no Cloudflare credentials or PII.

Diagnostic download source: [official SQLite downloads](https://www.sqlite.org/download.html), version 3.53.4 Windows tools. [SQLite query profiling](https://www.sqlite.org/profile.html) describes visits/loops; [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) describes actual rows-read billing. The existing Free allowances remain 5M reads/day,100k writes/day,5GB D1; [Workers](https://developers.cloudflare.com/workers/platform/limits/)100k incoming/day,10ms CPU/request. These are shared allowances, not an Admin reservation.

## 6. Writes, storage and compatibility

One forward-only migration: `2026-09-08-admin-read-budget.sql`, after Stage 2 identity. Canonical schema includes the exact migration. It creates one 900-entry ordering index and one migration registry row; no business data/backfill/token creation. Local index storage: **53,248 bytes (52KiB),900 cells** on this fixture; not production size. Index creation/backfill and future indexed-field updates have real write/storage cost. Plan conservatively for up to two extra index-row operations per affected update (delete/insert), one for insert/delete;60 daily edits would add up to120 to the old 6,000 write allowance if each affects this index. This is not measured Cloudflare rows_written.

Polling/Member/search/QR/media reads: **zero persistent D1 writes**. No schema migration was run remotely. Private media ownership/object-URL lifecycle unchanged; no R2 PUT/DELETE/LIST or image service. Fewer redundant source loads can avoid some existing accommodation HEAD requests; no numerical R2 saving is claimed.

Old clients still receive the default facets. New clients against an old Worker merely receive unused extra facets, not missing data. The query can run without the new index but the improved plan/budget cannot then be assumed. Future rollout must separately review migration ordering; no rollout authorization exists here. Admin HTML only updates the native-module cache version. Public `index.html`, `galerie.html`, `main.js` and video **cGfcolaqczM** remain exact Git-equivalents to starting HEAD.

## 7. Acceptance checklist / stop boundary

| Condition | State |
| --- | --- |
| Expected HEAD, clean preflight, verified lineage/origin | PASS |
| Historical arithmetic + endpoint/SQL/HTTP/auth audit | PASS, old per-SQL allocation explicitly unknown |
| Same fixture volume and 12h/3-admin workload; explicit/retry costs retained | PASS |
| Narrow list/detail/duplicate-loading fixes and actual plans | PASS |
| Read-only Member 360, dirty source editors, media auth, stable QR, resolver identification only | PASS |
| No read-side QR generation or polling writes; lifecycle suspension preserved | PASS |
| Existing assertions unchanged; added 6Node and 2 dual-browser regressions | PASS (validation record below) |
| <=1,000,000 reads including 10% | **FAIL: 3,904,805 conservative estimate** |
| Stage 2 implementation + targeted optimization handoff | **OPERATOR-ACCEPTED with the above target formally unmet** |
| Actual Cloudflare billing/CPU/storage assurance | NOT MEASURED / NOT APPROVED |
| Stage 3/4 and rollout | NOT STARTED / NOT AUTHORIZED |

At least **2,640,732** further pre-retry savings would be required under this model. Do not keep expanding this task into a general cache/read-model architecture to force the checkbox.

Historical options retained for traceability, not a Stage 3/4 prerequisite or authorized further Stage 2 work. The operator has accepted the remaining gap; the benefits below are bounded rather than promised:

- A **targeted conditional/versioned read design for summary + list facets**, including every writer and wall-clock overdue invalidation, could address at most **1,999,161** current reads before retries. Even eliminating both costs entirely leaves 1,550,661 before retries, still too high. Impact: source-version completeness, race/snapshot/auth tests and possibly new trigger/write overhead; existing revision rows are not a complete summary change feed.
- Combine that with a **semantics-preserving substring-search read design** (including two-character/escaped/non-ASCII queries and multiple cars). Search currently reserves 900,000; the optimistic combined ceiling of those three categories is2,899,161 savings, not a verified achievable result. Impact: additional search/index or narrow read-model design, write/storage tradeoff and whole-fixture validation. No FTS policy substitution or feature reduction is approved here.
- Changing polling intervals alone cannot solve this estimate: even removing **all** periodic cost (1,726,344) leaves 1,823,478 before retries. Cadences remain unchanged. A paid plan would not satisfy the 1M engineering target and was not introduced.

Stage 2 is closed by operator acceptance with the budget condition explicitly unmet, **not a claim that no possible small SQL improvement exists**. Further optimization merely to reach 1M is not authorized. Stage 3/4 require their own instruction; no push/deploy/production migration/write/provider change/email is authorized.

## 8. Final validation record

Preflight unchanged: Node 336/336, production syntax 107, Chromium 57/57 and focused WebKit 26/26. Final: **Node 342/342; Chromium 59/59; WebKit 28/28** (87 total, no retries). Production syntax 107 +49 diagnostic/test JS/MJS checks pass; import graph 107 has no missing/circular imports. Exact migration/canonical schema checks pass,7 migration entries, integrity OK, FK violations 0. Existing assertions were not weakened or removed; six new Node tests and two desktop/mobile browser cases (both engines) protect the corrected causes.

Desktop 1440px Chromium and mobile 390px WebKit source-drawer screenshots were inspected after Member return with dirty state retained. No physical iPhone or production browser claim. The separate budget acceptance command exits 1 as required; passing regression tests do **not** override it. Harmless existing NO_COLOR/FORCE_COLOR warning; profiler limitation remains explicitly disclosed above.
