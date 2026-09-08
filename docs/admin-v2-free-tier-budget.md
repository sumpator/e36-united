# Admin v2 Stage 2 — conservative Free-tier budget

Dated 2026-09-08. **Local feature checkpoint, NOT a Free-tier acceptance or rollout approval.**

## Decision

The reproducible worked model estimates **5,505,450 D1 rows read for three active contexts / 12h**, including boot/funnel and 12 explicit lifecycle revalidations per context. The engineering target is 1,000,000: **gap 4,505,450 rows**. A 10% read-retry sensitivity is **6,055,995** (gap 5,055,995). Even the earlier base without boot/lifecycle allowance was 4,983,450, too close to the shared hard daily allowance to accept.

These are deliberately conservative plan-derived estimates, **not measured Cloudflare billing**. This cannot establish actual quota exhaustion either; it establishes insufficient evidence/headroom to accept the requested budget. Finish safe independent local work as authorized, but resolve/measure the gap before any rollout. No paid service, aggregate warehouse, cache service, remote test or general Mailing/security rewrite was added to force acceptance.

## Official limits, checked 2026-09-08

- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/): Free 100,000 incoming requests/day, 10ms CPU/request; memory 128MB.
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/): Free 5,000,000 rows read/day, 100,000 rows written/day, 5GB total storage. Returned rows, rows examined and statement count are different; index work counts too.
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/): Standard allowance 10GB-month, 1M Class A and 10M Class B operations/month.

Allowances are shared, not per admin/browser or a dedicated Admin budget. Public/Member/other Worker/webhook traffic, storage and legitimate writes remain additional. No plan/config/provider changes.

## Shared cadence and HTTP

One existing coordinator: operational/header/list 60s; reservation/gallery lists 120s; summary/history/analytical Member tabs/stored Mailing 300s. Header + selected Member tab replaces obscured workspace polling. At most three periodic data requests in a cycle **including** summary; no independent Member timer. Hidden/denied/anonymous/known-offline contexts: zero periodic calls. Failure delays 120/240/300s; no backlog. Focus/visible/reconnect/pageshow coalesce; visible operational resources/editor revalidate, while fresh analytical/tab caches are not broadly invalidated. Own save applies its authoritative result immediately, then existing invalidation/reconciliation.

Table is the ceiling 3 data requests/minute, not measured real traffic. D1 column uses the workload below (therefore is not three worst-case SQL queries every minute).

| Visible contexts | Hours | Polling data requests | With one uncached OPTIONS each | Estimated D1 reads, before retry sensitivity |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 2 | 360 | 720 | 305,859 |
| 1 | 12 | 2,160 | 4,320 | 1,835,150 |
| 1 | 24 | 4,320 | 8,640 | 3,670,300 |
| 3 | 2 | 1,080 | 2,160 | 917,575 |
| 3 | 12 | 6,480 | 12,960 | 5,505,450 |
| 3 | 24 | 12,960 | 25,920 | 11,010,900 |
| 6 | 2 | 2,160 | 4,320 | 1,835,150 |
| 6 | 12 | 12,960 | 25,920 | 11,010,900 |
| 6 | 24 | 25,920 | 51,840 | 22,021,800 |

Three humans can have six visible PC/phone contexts. Hidden tabs are idle; no cross-device/tab leader was added.

Worked 12h explicit overhead per context: 60 searches + up to120 header/tab reads for 60 interactions +20 mutations +20 outcome lookups +60 affected-resource reconciliations +390 visible image loads +4 initial events/summary/funnel/list requests +36 due focus/reconnect requests = **810 requests beyond the polling ceiling**. Lifecycle estimate assumes 12 occasions with up to3 due resources; coalesced lifecycle storms usually do less. Every authenticated data request has its own active-Admin read, included in SQL estimates. OPTIONS returns before auth/SQL, but counts as incoming Worker traffic.

Three contexts: 6,480 + 2,430 = **8,910 data/action/image requests**; conservative uncached preflight doubles to **17,820**. Ten percent safe-read retries, pessimistically applied to all for a simple upper sensitivity, gives approximately **19,602 incoming requests**. An every-read-retries-once scenario with uncached OPTIONS approaches 4x data requests; six contexts/24h polling alone reaches **103,680**, over Workers Free before other traffic. Mutations are NOT automatically retried; same-ID reconciliation is explicit existing behavior. Firebase certificate fetching is an external subrequest on cache miss, not an extra incoming request or a cached authorization bypass.

## Reproduction / dataset

Run `node --test tests/admin-member-budget.test.mjs`. The test executes the actual handlers against local Node SQLite, runs EXPLAIN QUERY PLAN for **each captured SELECT**, and prints GROWTH_QUERY_REPORT with SQL/plans, response bytes, wall time and models. It asserts authorization is included, no read-induced total_changes (including triggers), no FK violations, and bounded response/test invariants. It does **not** assert an unmet cost target as passing.

Fixture: 500 members, 3 events, 300 reservations/event (900 total), 750 cars, 750 car photos +750 gallery photos, 1,000 history/S&S claims, 5,000 Points entries, 102 persisted Mailing contacts (50 linked +52 legacy), 501 campaign recipients, 1,000 operation receipts. Reservations include approved/pending/cancelled/rejected states and real allocation rows. No real user data, import, external provider or remote load.

Latest representative local run (wall time includes handler, serialization and plan inspection; **NOT edge CPU**, and nondeterministic milliseconds):

| Projection | SQL statements incl. auth | Response bytes | Local ms | Plan |
| --- | ---: | ---: | ---: | --- |
| summary | 2 | 1,808 | 36.26 | See scans below |
| reservation-list | 5 | 73,287 | 6.93 | See scans below |
| reservation-detail | 5 | 2,250 | 2.17 | See scans below |
| accommodation | 3 | 836 | 1.13 | Indexed SEARCH only in this fixture |
| gallery | 3 | 12,244 | 1.57 | Indexed SEARCH only in this fixture |
| history-review | 7 | 12,281 | 3.36 | See scans below |
| events | 2 | 1,129 | 0.44 | See scans below |
| funnel | 8 | 268 | 0.83 | See scans below |
| member-list | 3 | 7,359 | 3.45 | See scans below |
| member-search | 3 | 4,971 | 1.7 | See scans below |
| member-qr-resolve | 2 | 162 | 1.31 | Indexed SEARCH only in this fixture |
| member-media | 2 | 15 | 0.41 | Indexed SEARCH only in this fixture |
| member-header | 4 | 954 | 0.84 | Indexed SEARCH only in this fixture |
| member-reservations | 4 | 1,627 | 0.82 | Indexed SEARCH only in this fixture |
| member-garage | 5 | 908 | 0.87 | Indexed SEARCH only in this fixture |
| member-photos | 4 | 849 | 0.51 | Indexed SEARCH only in this fixture |
| member-club | 5 | 640 | 0.83 | Indexed SEARCH only in this fixture |
| member-history | 5 | 915 | 0.79 | Indexed SEARCH only in this fixture |
| member-points | 4 | 1,545 | 0.65 | Indexed SEARCH only in this fixture |
| member-mailing | 5 | 758 | 0.76 | Indexed SEARCH only in this fixture |
| member-qr | 3 | 275 | 0.34 | Indexed SEARCH only in this fixture |
| mailing-overview | 3 | 152 | 20.26 | See scans below |
| mailing-contacts | 2 | 39,356 | 18.4 | See scans below |
| mailing-campaigns | 3 | 451 | 0.78 | See scans below |
| mailing-campaigns/camp/delivery | 7 | 67,536 | 19.91 | See scans below |

SQL plans and access-path interpretation:

- Summary uses event-indexed reservations and allocation/option/member/revision probes. Its many reservation aggregates now share one metrics CTE instead of repeating the same reservation pass. Still scans global gallery (~750), claims (1,000), member counts (500 twice), and small event/occupancy intermediates. One statement is not one row; thus 300s and a separate genuine timestamp.
- Reservation page/detail: event/payment index or reservation PK; member/event/revision/allocation probes and complete repeated counts. Existing pending-capacity display now uses one materialized approved_usage aggregation, not the same full SUM per pending row. It still scans approved reservations across the original all-event option scope; capacity mutation predicates/formulas are untouched. Paginated LIMIT does not eliminate count/aggregate work.
- Accommodation uses event/option and allocation indexes. Gallery uses status index plus member/revision probes and an independent total. History review scans claims for complete global/year facets and performs indexed pending/count/page/evidence queries; hence 300s.
- Members list uses admin_members_order plus a complete 500-member count. Substring search can examine all500 members twice plus member-indexed car probes (750 cars across the set); no misleading claim that LIMIT20 or LIKE has become an index-only text lookup.
- Member header uses member/event PK + unique member/event reservation + allocation PK. Reservations, Garage, gallery, evidence, history, ledger and recipients are member/parent indexed. QR resolution uses token UNIQUE + member PK; private media uses owner/parent checks then one object GET. QR/GET handlers perform no provisioning.
- Existing Mailing overview/contact/delivery still scans stored/projected contacts and correlated legacy email matching (`SCAN matched`), plus repeated member domain subqueries. It is **not** fully bounded by its outgoing page. A trial normalized-email expression index did not remove this plan's scan and was removed before checkpoint; do not claim it helped. The member/status S&S index does remove the per-contact global S&S scan. No redesign of legacy email segmentation was performed.
- Receipt presence (1,000 rows) does not cause polling scans: outcome reconciliation uses operation identity indexes. Funnel has member/onboarding/handoff queries; boot/lifecycle allowance includes it rather than pretending it is a free derived widget.

Added six indexes: member created_at/id ordering; car photo parent/order; gallery member/status/time; recipient member/time and contact/time; history member/S&S status. QR adds its PK/unique index. Each is a read/write/storage tradeoff, not free performance. Existing owner indexes are reused. There is no new general utils/query framework.

## Conservative row model

`tests/helpers/admin-budget-model.mjs` centralizes assumptions. The following bounds are engineering envelopes for this synthetic distribution, not a SQLite-to-D1 billing conversion:

| Resource | Rows/read envelope | Rationale |
| --- | ---: | --- |
| Summary | 6,000 | Reservation/occupancy joins + global 750/1,000/500 counts + repeated probes/intermediates/auth |
| Reservation list | 5,000 | All900 approved-status scan/allocation group, selected300 joins/counts, page/revision probes |
| Reservation detail | 3,000 | PK row does not remove approved_usage and event-wide tabs/counts |
| Gallery | 3,000 | Up to750 status entries/count, page member/revision/index work |
| History review | 12,000 | Global/year passes over1,000 plus filtered joins/count/page/evidence |
| Accommodation | 2,000 | Selected allocations, options, joined reservations and revisions |
| Member list | 1,000 | Full500 total + ordered page/index/auth allowance |
| Search | 5,000 | Two500-member passes, correlated indexed car checks, sort/count/auth allowance |
| Member header | 20 | PK/unique join probes including auth/event/stored allocation |
| Member tab | 100 | Uniform fixture ~10 Points /2 claims /1.5 cars /3 photos and count/page joins; not a bound for arbitrarily skewed members |
| Existing Mailing projection | 1,000,000 | Pessimistic repeated legacy 52x500 email scans expanded through projected fields/subqueries plus500-member domain probes; old projection materialization is not guaranteed |
| Private image | 5 | Auth plus member/parent/photo probes; object operation separate |

Per context/12h: four hours Member header/event; four hours Garage header+tab; two hours reservation list (120s)+editor (60s)+summary (300s); one hour Dashboard summary; one hour Gallery (120s)+summary. Add 60 searches, 60 Member openings/tab interactions, 20 mutation/reconciliation sets, 390 image loads, a6,000-row startup/Funnel allowance and 12 due lifecycle bursts at14,000 rows. Scale duration/context count linearly for sensitivity.

Components/context: Member33,600; reservation804,000; Dashboard72,000; Gallery162,000; search300,000; openings7,200; mutations/reconciliation280,400; image/auth1,950; startup6,000; lifecycle168,000 = **1,835,150**. Three contexts **5,505,450**. At10% repeated-read sensitivity **6,055,995**, above both the engineering target and shared hard daily allowance estimate; no claim of safe headroom.

The worked example contains no prolonged Mailing workspace session. Replacing one hour with12 refreshes of the legacy1M-envelope projection is an explicitly worse sensitivity (up to12M rows/context); exact real cost needs counters, not this intentionally loose upper envelope. A heavily skewed Member with all5,000 ledger entries also breaks the uniform100-row tab assumption: count+page/sum can examine thousands, though JSON remains paginated. This is another reason not to accept the budget solely from the worked average. LIMIT/count/indexes are not a guarantee.

## Writes, R2, storage, CPU

Polling/search/Member/QR resolver: **zero induced D1 writes**, verified both handler write counts and SQLite total_changes before/after actual reads. No last_seen/view/scan counters. Migration and explicit fixture provisioning are separate setup, not polled effects.

For20 own operations/admin/day, use a conservative **100 row/index writes per complex operation** (source UPDATE, source revision triggers, optional allocation/Points/audit, receipt, event/summary revisions, index maintenance):2,000/admin or6,000/three. This is an allowance, not measured rows_written; high-fanout accommodation changes affecting many reservations need separate measurement. QR provisioning500 members is one-time ~500 rows plus PK/token indexes (planning ~1,500 row/index writes), plus backfill cost of six indexes. New-member provisioning inserts one identity/unique entries once. Existing source CAS, operation IDs/receipts and Points grants remain unchanged. Receipt/audit/tombstone retention grows; no automatic deletion is added.

390 visible images/context/12h gives1,170 GETs/three,35,100/month if repeated daily. Existing accommodation projections may issue HEAD per distinct option/page (<=50 default page), separately from Member media: worked2h reservation list+detail180 reads plus20 reconciliations can conservatively reach10,000 HEAD/context/day at50 options,30,000/three,900,000/month. Actual fixture uses few options; no production HEAD measurement. These count as Class B; no periodic LIST/Class A. Whole photo archives are not preloaded. Existing storage has one private original: thumbnail display fetches it only when visible, fullscreen reuses the blob. No invented thumbnail-service/bandwidth saving.

QR/token payloads are tiny (~tens of KB for500 identities before index/page overhead). Six indexes and1,500 photo objects need actual database/object-size measurement; no claim of remaining5GB D1/10GB R2 storage without production metrics. JSON sizes above bound this fixture, not edge CPU. Local36ms summary and18–20ms Mailing wall times are not10ms Workers CPU evidence. Workers CPU must be observed later under an authorized, non-load-test measurement.

## Later read-only measurement / handoff gate

Before rollout acceptance, separately authorize a small read-only sampling plan: existing deployment metrics for CPU/requests, existing D1 usage/database size, and representative currently authorized read endpoints with internal D1 meta.rows_read/rows_written collected without tokens/PII or D1 logging. Compare ordinary/heavy/skewed Member and legacy Mailing cases, report auth/helpers/preflights/R2 HEAD separately. Do not create remote databases, seed real data or load-test production. If counters are unavailable, keep this gate unresolved and review narrower SQL/cadence changes explicitly.

Stages3–4 may consume these resources but cannot introduce independent widget timers, aggregate services or faster on-site presets to bypass this gate. No production operation occurred during this task.
