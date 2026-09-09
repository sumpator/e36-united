# Approved NEW United Command Center — local implementation

2026-09-09. Starting clean, fetched/synchronized `main`: `df5d13af2c0302995892d65f8805d8a812039d38`. This is the separately authorized NEW presentation task, not a production rollout or unrestricted Stage 4. Earlier rollout facts and the accepted Stage 2 limitation remain historical records.

## Presentation and navigation

Primary reference: NEW_dashboard_settings.png; LAST images only support unobscured dashboard/detail styling. Native modules, existing fonts and repository logo; Admin-only navy surfaces, technical grid, 220px sidebar, 76px desktop header, 24px gutters, 18px gaps and 12-column grid. Existing public Show & Shine image supplies subdued sidebar atmosphere. No private decorative imagery, invented event venue/date/count, notification bell or new framework.

Six primary entries: Přehled; Rezervace (reservation list / Ubytování); Platby; Komunita (Členové, Fotky, Historie & S&S, United Club); Mailing; Nastavení. Community disclosure does not navigate. Both desktop and mobile menu use the same generated entries and existing navigation/history implementation. Historical `section=finance&view=payments|accommodation` and `club` aliases remain valid; `club` still means historical review. New `united-club` uses the paginated canonical member list, opening Member 360 on Club, not a duplicate historical queue or leaderboard. Mailing and selected-event settings retain existing functionality.

## Authoritative badges

All badges share settled summary state, never a fetched page length:

| Badge | Canonical value / scope |
| --- | --- |
| Rezervace | Selected-event overview.statuses.pending |
| Platby | Selected-event attention.payments: overdue OR overpaid union |
| Fotky | Global overview.gallery.pending, user submissions only |
| Historie & S&S | Global overview.history.pending, distinct claims with either component pending |
| Komunita | Photos + distinct historical claims |
| Přehled | Selected-event attention.reservations union + global photos + distinct history |

One pending overpaid reservation is one overview entity, not two. Five proof photos and two pending decisions remain one history claim; Garage is not moderated. Known zero hides a number, unavailable is an em dash, previous values remain marked stale. No all-clear with incomplete/stale summary. Confirmed commands invalidate through the existing coordinator. Removed the history handler's redundant second invalidation; sequential attendance/S&S tests verify one shared summary per successful decision, a fresh revision and the remaining pending component. No second automatic decision or publication of evidence.

## Dashboard and saved layout

Frontend-only `command-model.js` catalog/adapter leaves the shared schema-v1 preference validator and Worker default factory unchanged. NEW is the default only when GET explicitly reports stored:false, or after explicit current-composition reset. Stored legacy choices render unchanged; safe unknown IDs survive without automatic rewrite. There is no bulk migration.

Default: Schvalování 8 + Rezervace & ubytování 4; Platby 8 + Vývoj rezervací 4; Poslední rezervace 12. Optional Mailing is off. Existing analytical choices and quick links remain available. All modules can be hidden, including approvals, without disabling navigation badges. Preparation/onsite are independent compositions, not permissions.

Native modal: one actual prospective grid shares `commandLayout` with the full board; responsive stacking does not write preferences. Accessible checkboxes, up/down, supported sizes, quick links, current-only confirmed reset. Changes stay in a draft until the existing conditional/idempotent save. Cancel/dirty Escape/backdrop, focus trapping/return, UID isolation, read failure, revision conflicts and receipt recovery retain the established safeguards. The preview is deliberately a real arranged miniature rather than NEW's illustrative catalogue of unrelated thumbnails. More controls scroll below it; actions remain reachable.

Cards preserve financial truth: all-status recorded paid/overpayments, active outstanding, overdue case count (not invented overdue amount), zero-charge not debt. Confirmed physical units and pending demand are separate; unlimited has no percentage; no-accommodation is a reservation count. Trend uses genuine created_at/UTC buckets, range and exact table. Recent is latest-created across ALL statuses, not pending-first.

## Connected review and API dependency

One existing reservation drawer/editor: selected owned car photo, actual QR status, member link, stay/capacity/snapshot, financial editor, notes and explicit decisions. Only the visible selected image is loaded; abort/generation/object-URL cleanup prevents cross-detail leakage. Member 360 remains canonical, including its QR view and dirty underlying source/Back behavior. One local Member error avoids stacked resource-ID messages. History retains one expanded claim, private evidence and separate explicit decisions.

Two opt-in local read extensions use `presentation=command`:

- `/api/admin/dashboard?eventId=…`: `presentation:command-v1`, exact five-row `recent`, created_at DESC / id DESC, bounded hydration. Default query/response unchanged.
- `/api/admin/reservations?...&projection=detail&id=…`: reviewContext with selected owned photo path and QR-presence boolean only. No token in this context; no QR generation, new schema, business write or default-list N+1.

Future release **requires separately approved Worker rollout before/dependent on frontend publication**, then bounded authenticated verification under separate authority. Existing clients retain defaults. New frontend against old API shows recent unavailable, selected photo unavailable and QR “Nelze ověřit”; it does not fabricate capability from another list. Shared destinations have changed presentation area labels, but shared preference validation and business policies have not. No new migrations are required. A push alone is NOT a Worker rollout.

## Refresh and incremental local budget

One coordinator, unchanged 60/120/300s policy and hidden/offline/logout/denied suspension. Summary now remains needed over Member/Mailing even when approvals are hidden. Due optional analytics share three periodic slots; a fourth is staggered to the next coordinator tick. No independent widget timer. Detail replaces hidden list/analytics; no whole-list media loading. Own confirmed changes force revalidation; unrelated successful reads do not restamp stale data. Focused/hovered cards avoid disruptive remounts.

Evidence: `admin-command-budget.json` records actual executed SQL/binds/EXPLAIN and LOCAL SQLite 3.53.4 scanstatus on unchanged growth fixtures (500 members / 900 reservations). Analytics before/after: 903/1,518 local visits; 1,505/2,430 conservative operations (+925). Detail: 377/379 local visits; 748/751 estimates; model reserves +6 for possible issued QR probes. Recent LIMIT bounds returned hydration, NOT the 300-row event scan/sort. No new index/storage allowance or production measurement.

Mixed 3-admin × 12h incremental envelope: 288 added summary calls ×4,271; 36 recent increments ×925; 456 detail increments ×6; 96 visible media authorizations ×6. Total **1,266,660**, **1,393,326 including 10% reserve**. Added HTTP data calls: 288 summaries +96 one-time media; recent/detail use existing HTTP calls. Existing explicit action envelope is not subtracted. Adding separately rounded reserves to accepted Stage 2 + Stage 3 4,517,408 gives **5,910,734**, not a new accepted production limit. 24h NEW sensitivity doubles to 2,786,652 with reserve.

Usage mix is unknown: incremental dashboard-only 3h =36,630 with reserve; Member-only 3h =169,132; Member-only 12h =676,527. These are alternative sensitivities, not simultaneous screens or actual weekly/day billing. Optional stored Mailing widget adds 12 requests/hour and a coarse legacy VM-step ceiling of 4,942,503 operations/hour including reserve when enabled on the growth fixture. It is disabled by default; this expensive pre-existing source is explicitly not free or hidden in the factory budget. Optional Planner retains its separately documented existing cost. Small-event local fixtures are not substituted for growth budget evidence.

Reproduce offline: `node scripts/check-admin-command-budget.mjs` compares current SQL/binds/plans and computes envelopes; `SQLITE_SCAN_CLI=<diagnostic shell>` with `node scripts/admin-budget-profile.mjs test-results/admin-command-reprofile.json --command` re-executes scanstatus. `check-admin-dashboard-budget.mjs` remains the prior incremental model. `check-admin-budget.mjs` intentionally exits 1 for the operator-accepted, still UNMET Stage 2 1M target (3,904,805 with reserve). No Stage 2 optimization or cadence change is authorized. Local visits/VM/probe estimates are **not Cloudflare meta.rows_read**; distributions, D1 CPU/billing and unbounded explicit bursts are not certified.

## Validation and visual-review handoff

Change inventory: new Admin modules `command-model.js`, `command-shell.js`, `command-cards.js`, `reservation-media.js` and scoped `command-center.css`; integration in `admin.html`, `admin.js`, `admin-view-model.js`, existing dashboard/navigation/shell/state/member/list/reservation/moderation modules. Remaining Admin imports receive the coherent cache version only, including Mailing; no provider implementation changes. The only Worker changes are the two opt-in reads above. New Node/browser fixtures, budget probe/check and evidence support this scope; existing tests change only superseded presentation/source expectations. Three historical Admin documents receive append-only NEW notes. Public/Member files, the video hotfix, auth policies, DB schema/migrations, deployment configuration, packages and lockfile are unchanged.

The strengthened legacy-history deep-link test also caught server normalization of the default historical year changing the coordinator's captured context. The accepted synchronous history render now aligns its resolved context/cache key without another request. User navigation still invalidates generations; no default-year/filter policy or interval changed. Mobile sheet caption inheritance, dialog maximum width and cramped nested reservation finance columns were corrected from actual screenshots, not just viewport-overflow assertions.

A final WebKit repetition caught a synthetic-clock race: advancing 61 seconds while the explicit 487KB image response was still delivering triggered the unchanged 20-second API timeout/retry. The test now verifies the visible image has fully loaded before advancing the polling clock, and still requires exactly one total image request before and after polling. Eight consecutive focused WebKit repetitions passed. No application networking, timeout, fixture volume or assertion limit was relaxed. An ad-hoc schema probe also initially counted resource-version rows instead of the migration registry; the corrected diagnostic checks schema_migrations and the unchanged four-migration chain matches the canonical schema.

Preflight reused only exact verified app/config/test/environment equivalence; Node352 rerun passed. Final gate after the last application edit: **Node 359/359; Chromium 78/78; focused WebKit 47/47** (complete unchanged configured browser run: 125 passed, 3.2m). Seven new Node cases and ten new browser scenarios in each engine cover NEW. Syntax **175 files** (116 production +59 diagnostics/tests/config); import graph **116 production modules, zero missing imports/cycles**. Local four-migration forward chain matches canonical schema, integrity OK, zero FK violations, eight migration-registry entries. NEW and Stage 3 incremental budget checks pass; Stage 2's accepted 1M target deliberately remains false. Wrangler 4.129.0 local **--dry-run** bundle passes (310.18 KiB /69.75 KiB gzip), explicitly no upload/deployment. Git diff whitespace check passes. Harmless runner color-variable warnings and Node SQLite experimental warnings remain; no unresolved application failure or ignored browser runtime error.

All screenshots use local **testovací data**, not production people/images/QR. NEW E2E uses real local Worker projections/SQLite, synthetic auth, repository public car imagery standing in for private car images; real media authorization is separately tested. WebKit is emulation, not physical iPhone/Safari certification. No production visual or billing verification is claimed.

Presentation-only legacy assertions now follow generated menus and the modal, legacy factory fixtures explicitly store their old layout, URLs preserve meaning. The old no-summary-above-Member assertion is replaced by exactly one due shared summary with the dirty source idle; fixed clock tests wait for settled reads. Source tests for duplicate history reload now assert one confirmed notification; real browser decisions assert exact convergence. Existing auth/finance/capacity/Points/QR/write-recovery assertions remain. Initial failures exposed these superseded assumptions, an incorrectly reset legacy history deep link and redundant history revalidation; all were resolved within NEW scope. Console, API, revision and write assertions were not suppressed to obtain a pass.

Boundaries: no public/Member UI refactor, schema/migration/config/dependency/provider change, push, deployment, production data access/write, QR provisioning or email. Local synthetic regression fixtures include their established explicit test-only writes. Stop after one local implementation commit for operator visual review.

### Screenshot inventory (local testovací data)

Generated by `tests/e2e/admin-command.spec.mjs`; ignored test artifacts, reproducible with the existing Playwright command. Paths below select Chromium unless stated otherwise; both engines exercise these states. Full-page images intentionally scroll rather than shrink the interface to match illustrative dimensions.

- [Preparation 1440](../test-results/admin-command-NEW-dashboar-e0e6f-w-and-responsive-shell-1440-chromium/NEW-dashboard-1440.png), [viewport](../test-results/admin-command-NEW-dashboar-e0e6f-w-and-responsive-shell-1440-chromium/NEW-dashboard-viewport-1440.png).
- [Settings / actual mini-grid 1440](../test-results/admin-command-NEW-dashboar-e0e6f-w-and-responsive-shell-1440-chromium/NEW-settings-1440.png).
- [Narrow desktop 1280](../test-results/admin-command-NEW-dashboar-6c61b-w-and-responsive-shell-1280-chromium/NEW-dashboard-1280.png).
- [Changed selection saved/reloaded](../test-results/admin-command-NEW-draft-mi-9920f-load-and-independent-onsite-chromium/NEW-saved-reloaded.png), [all hidden](../test-results/admin-command-NEW-draft-mi-9920f-load-and-independent-onsite-chromium/NEW-empty.png).
- [Onsite](../test-results/admin-command-NEW-draft-mi-9920f-load-and-independent-onsite-chromium/NEW-onsite.png).
- [Expanded Community](../test-results/admin-command-NEW-six-dest-bf299-ases-and-canonical-Club-tab-chromium/NEW-community.png).
- [Selected car / QR detail](../test-results/admin-command-NEW-latest-r-8cc8f-ads-QR-without-provisioning-chromium/NEW-reservation.png).
- [History working card](../test-results/admin-command-NEW-empty-da-a217d--its-private-review-context-chromium/NEW-history-review.png), [private evidence](../test-results/admin-command-NEW-empty-da-a217d--its-private-review-context-chromium/NEW-history-evidence.png).
- [Empty event data](../test-results/admin-command-NEW-empty-da-a217d--its-private-review-context-chromium/NEW-empty-data.png).
- [Partial/stale summary](../test-results/admin-command-NEW-partial--cfaaf-or-previously-rendered-data-chromium/NEW-partial.png).
- [Mobile dashboard 390](../test-results/admin-command-NEW-dashboar-3736a-ew-and-responsive-shell-390-chromium/NEW-dashboard-390.png), [mobile menu](../test-results/admin-command-NEW-six-dest-bf299-ases-and-canonical-Club-tab-chromium/NEW-mobile-navigation.png), [mobile settings](../test-results/admin-command-NEW-dashboar-3736a-ew-and-responsive-shell-390-chromium/NEW-settings-390.png).

## NEW polish / visual acceptance follow-up — 2026-09-09

Starts from `90ec77678b6f4ac0514e00f656b60b614e4be475`, clean main, exactly one local commit above origin `df5d13af2c0302995892d65f8805d8a812039d38`, verified after one fetch. This section supersedes the initial presentation descriptions where noted; it does not rewrite the historical NEW/Stage 2/Stage 3 measurements or authorize rollout.

### Presentation and interaction

- Default cards now use concise Czech labels. Metric scope remains keyboard/touch-accessible in native **O údajích** disclosures, not hover-only tooltips. Expanded scope/table state survives revalidation. Recent timestamps use the existing local-date formatter; trend buckets and exact table retain their original meaning.
- Known zero finance is neutral; positive overdue remains emphasized; unknown uses an em dash and dashed treatment. Stale values and incomplete-data warnings remain honest. One primary shell refresh status accompanies the existing manual refresh; per-resource timing is shown only for stale/unavailable data.
- Local outline SVG icons, consistent containers, typography, padding and buttons keep the existing navy/blue 8/4, 8/4, 12 layout. No framework, dependency, large hero chart or business-rule rewrite.
- Desktop settings has one compact real mini-grid and one complete module list: toggle, supported size and up/down in the same row. Every known module appears once; legacy analytical modules and quick links remain available. Unknown IDs survive silently in the draft. Save is primary, Cancel secondary and current-composition reset tertiary.
- At 390px controls come first; the real preview follows the controls/quick links and starts collapsed. The scroll area ends above a non-overlapping footer with safe-area padding. Tests reach the last module control, expand the preview, check overflow, focus trap/return and dirty Escape/backdrop protections. The existing revision, receipt, UID isolation and independent Preparation/Onsite guarantees remain.
- Reservation header now prioritizes status, identity and reference. Czech stay rows show stored arrival/type/person/night information without inventing departure. Selected owned car/media, actual QR status, accommodation, note, finance/VS/deadline and TEST MODE warning remain. Pending actions explicitly say **Schválit rezervaci / Zamítnout rezervaci**; status transitions and the payment editor are unchanged.

The synthetic pending scenario uses the actual existing conditional/idempotent reservation command, not a second approval implementation. Reservation badge **2 → 1**, Overview **5 → 4**, Photos **1 → 1**, History **1 → 1**. A pending/overpaid entity and a cancelled/overpaid entity remain actionable; approval does not settle payments. Exactly one command and one summary revalidation are asserted. This uncovered the reservation handler's redundant `reloadEventData()` after the confirmed-command invalidation: removing only that second reload prevents abort/restart and duplicate reads. History's separate attendance/S&S decisions, private evidence and unique-claim badges remain unchanged.

Recent payment text now uses only exact existing `amount_due_czk / amount_paid_czk`, added to the already opt-in `presentation=command` recent projection in its existing query. It distinguishes no payment, awaiting, partial, paid and overpaid without changing stored status. Old responses fall back to explicitly labelled stored status, not guessed amounts. Default API query/response is unchanged; no extra query, N+1, field migration or payment policy. The separately approved future Worker/frontend rollout dependency still applies.

### Narrow optional Mailing evidence

Unchanged growth fixture: **500 members, 900 reservations, 102 stored contacts**. The enabled widget calls the existing `/api/admin/mailing/overview`, not a provider endpoint. Disabled across a 301-second browser interval: **0 calls**; explicitly enabled: **1 initial call**, then **1 shared-coordinator call** in the next 301 seconds; disabled again: **0 additional calls**. No independent timer or NEW-specific duplicate was found; no Mailing application change was needed.

Actual SQL, binds and EXPLAIN QUERY PLAN are in [admin-mailing-widget-cost.json](admin-mailing-widget-cost.json):

| Executed read per overview request | Local evidence | Conservative fallback contribution |
| --- | --- | ---: |
| Active Admin lookup by member ID | Indexed search, 1 local visit | 2 |
| Existing rich contact-universe projection | Stored contacts UNION projected members; fallback email scan, correlated reservation/car/gallery/history/attendance/source/tag reads and temp sorting | 374,429 |
| Draft campaign count | Covering status index, 1 local visit | 1 |

The contact query's scanstatus display crashes in the existing diagnostic SQLite shell; replaying the **unchanged query** with statistics yields **25,552 Fullscan Steps and 374,429 VM steps**. Total local row visits are therefore **unknown**, not zero. Fullscan Steps omit indexed visits/probes; VM instructions are not row reads. The **374,432/request** mixed fallback, **4,942,503/hour at 12 periodic calls plus 10% reserve**, remains a coarse VM-step/probe ceiling, **not a comparable measured D1 rows-read total and not Cloudflare meta.rows_read**. The browser's initial explicit load is separate from that steady-state hourly ceiling.

The expensive source predates NEW and materializes richer contact facts than these two widget counts need. Keep Mailing off by default. A future separately scoped overview-only projection could be investigated if real usage warrants it; this pass does not restructure contacts, optimize Stage 2, add indexes/cache, change cadence, campaigns, sends or providers.

Reproduce entirely locally:

1. `node scripts/check-admin-mailing-widget-cost.mjs` re-executes the authorized SQL, checks current populations/binds/plans against the evidence, verifies zero changes and forbids network/provider fetch.
2. With the existing diagnostic shell supplied as `SQLITE_SCAN_CLI`, run `node scripts/admin-budget-profile.mjs test-results/polish-mailing.json --mailing` for fresh scanstatus/statistics. The filter limits profiling to this endpoint; existing local fixture capture is unchanged.
3. `node scripts/check-admin-command-budget.mjs` and `--command` reprofile verify the two-field recent extension: analytics **1,518 local visits / 2,430 estimate**, unchanged from NEW. The NEW synthetic increment remains **1,393,326 including reserve**. Stage 2's operator-accepted **3,904,805** and formally unmet 1M target are not reopened.

### Final gate and local visual handoff

After final application edits: **Node 361/361, Chromium 80/80, focused WebKit 49/49**. Two added Node cases lock exact payment presentation and neutral/unknown severity; two added browser scenarios per engine cover pending approval and optional Mailing. Existing assertions were adapted only to the single-list controls, explicit data-table disclosure and silent unknown-ID compatibility; security, financial, mutation/recovery and role assertions remain. The dialog test exposed native focus escaping to browser chrome; explicit Tab boundary wrapping fixes the application rather than relaxing the test.

Syntax: **177 files (117 production + 60 diagnostics/tests/config)**; import graph: **117 production modules, no missing imports or cycles**. Local canonical and four-migration forward schemas match with integrity OK, zero FK violations and eight registry entries. NEW/Stage 3 incremental checks and the narrow Mailing diagnostic pass. Worker 4.129.0 **dry-run only** passes, **310.28 KiB / 69.77 KiB gzip**; no upload. Git whitespace check passes. Only existing color-environment/experimental SQLite and Git LF/CRLF warnings remain; no unresolved application regression or ignored unexpected browser error.

Actual Chromium screenshots in the inventory above are regenerated and manually inspected: 1440 dashboard/settings/Community, 390 dashboard/menu/settings, plus stale state. Additional polish evidence:

- [Pending dashboard / badges](../test-results/admin-command-POLISH-pendi-2511c-and-converges-unique-badges-chromium/POLISH-pending-dashboard.png).
- [Pending review BEFORE](../test-results/admin-command-POLISH-pendi-2511c-and-converges-unique-badges-chromium/POLISH-pending-before.png).
- [Same detail AFTER approval](../test-results/admin-command-POLISH-pendi-2511c-and-converges-unique-badges-chromium/POLISH-approved-detail.png).
- [Dashboard AFTER approval](../test-results/admin-command-POLISH-pendi-2511c-and-converges-unique-badges-chromium/POLISH-approved-dashboard.png).
- [390px expanded real preview](../test-results/admin-command-NEW-dashboar-3736a-ew-and-responsive-shell-390-chromium/NEW-settings-expanded-390.png); the existing 390px settings image shows the initial controls-first/collapsed state.

Screenshot artifacts are ignored and reproducible; synthetic identities/data, locally authorized repository test image, no production evidence. Horizontal table scrolling remains contained rather than shrinking all columns. WebKit emulation is not a physical-device certification. The result is handed to the operator for visual review, not self-approved for production.

Exact polish inventory: `admin.html`, `admin.js`; `admin/command-cards.js`, `command-shell.js`, `dashboard.js`, `ui.js`, `modules/reservations-payments.js`; new `command-icons.js`, `command-polish.css`; `worker/admin/dashboard.js`; this document, refreshed `admin-command-budget.json`, new `admin-mailing-widget-cost.json`; `scripts/admin-budget-profile.mjs`, new `check-admin-mailing-widget-cost.mjs`; `tests/admin-command.test.mjs`, `tests/e2e/admin-command.spec.mjs`, `admin-dashboard.spec.mjs`, `command-fixture.mjs`.

No public/Member frontend, video hotfix, schema/migration, auth/business policy, interval, deployment configuration, dependency or provider implementation changed. No push, deploy, production access, production write, QR provisioning or email. Exactly one follow-up local commit; stop for visual review.

## Production release attempt and frontend-only rollback — 2026-09-09

**NEW ADMIN RELEASE ROLLED BACK (frontend only).** This append-only record does not supersede the historical local validation above or authorize an implementation fix/re-release.

- Resumed preflight: clean `main`, HEAD `72af7e299bf7ae73db1724033558f7572bca37fd`, origin and freshly checked remote `df5d13af2c0302995892d65f8805d8a812039d38`, exactly two commits ahead / zero behind. Reviewed release commits: `90ec77678b6f4ac0514e00f656b60b614e4be475` and `72af7e299bf7ae73db1724033558f7572bca37fd`. No additional application edits. Reused the accepted unchanged final gate; fresh release Worker dry-run passed (310.28 KiB / 69.77 KiB gzip).
- Previous active Worker: version `52a48e0b-3c3b-4ba6-8a2a-37e199e246ef`, deployment `45a9b967-8d59-49f3-8f43-e758990bdf6e`, 100%, `2026-09-09T07:39:08.488334Z`; rechecked unchanged before deployment.
- Deployed the exact approved HEAD to existing `e36-united-api`: version `955d4e21-cc80-497f-991e-7e7d77d338d2`, deployment `7cd9eb54-ffb1-4c27-b3e1-3a03123e57e7`, 100%, `2026-09-09T11:59:32.181505Z`. This version remains active after the frontend rollback. DB/MEDIA, EU jurisdiction, compatibility date, five runtime vars including 200/day, and secret binding names were preserved; secret values were not inspected. R2 public development URL remains disabled, with no custom public domains.
- Worker-first backward-compatibility smoke used the actual existing Stage 3 Admin session: restored authentication, dashboard/summary/default preferences load, member list/search/Member 360, two loaded private Garage images, missing QR identity, gallery/history counts and stored Mailing overview all worked. Public health/current event/homepage/gallery returned successful results. No direct authenticated API client or access-token extraction was used.
- After the remote race recheck, normal push advanced `origin/main` to `72af7e299bf7ae73db1724033558f7572bca37fd`; HEAD matched it with a clean tree, zero ahead/behind. No force push or history rewrite.
- [GitHub CI run 34348888947](https://github.com/sumpator/e36-united/actions/runs/34348888947), job `102456994479`: completed/success. Logs confirm Node **361/361**, Chromium **80/80**, WebKit **49/49**; first-party JavaScript syntax step passed. Non-failing action-runtime Node 20/punycode deprecation warnings remain.
- Automatic Pages deployment `bcff8218-de7c-4be9-9182-3dd37de2c003` succeeded at `2026-09-09T12:04:13.524695Z`, exact full release SHA verified in Cloudflare UI. Served admin HTML/entry/card module/polish CSS matched local release content. Existing Pages warning that the Worker configuration is not a Pages configuration did not fail publication. No manual Pages build/deploy was initiated.

### Post-deployment authenticated NEW smoke and blocker

As explicitly amended by the operator, **authenticated NEW opt-in smoke happened only AFTER frontend deployment and CI success, through the actual NEW Admin UI and existing session**. No access token was obtained, copied, logged or requested.

NEW Overview rendered Schvalovani, accommodation, payments, trend and recent cards with truthful zero/empty data. The recent card displayed the successful empty-array state, not its missing-projection/error fallback, providing UI-level evidence for `GET /api/admin/dashboard?eventId=united-2026&presentation=command`. Community expansion, members/search/Member 360, private images, history and United Club loaded. QR remained unissued. The desktop settings dialog showed its real mini-grid, one module list, sizes/order controls and action hierarchy; it was opened and cancelled only. Clickable data disclosures worked; desktop document overflow was absent.

**Reproducible release blocker:** the NEW primary **Rezervace** and **Platby** buttons returned to Overview instead of opening their lists. Repeating the scoped navigation click reproduced it. The recent-card list link did load the empty reservations list, but generated the old `section=finance&view=reservations` URL. This is consistent with a stale, mixed module graph in the warm existing browser session: `admin/shell.js` and `admin/navigation.js` import unversioned `./destinations.js`; the previous module has `ADMIN_AREAS.finance`, whereas NEW requires separate `reservations` and `payments` keys. Missing keys take the shell's dashboard fallback. The public module response has `Cache-Control: public, must-revalidate, max-age=14400`; a fresh HTTP read served the new map while the warm UI behaved according to the old map. Cached browser response bodies were not extracted, so that cache mechanism is a strongly supported diagnosis, not a claimed captured network payload. Fresh-context CI did not cover this observed cross-release warm-session failure. No application fix, cache purge or configuration workaround was made.

The connected browser's viewport override did not change the actual Admin document width (still 2545px after requesting 390px). It was reset. Therefore production mobile dialog/scroll validation was **not completed**; the accepted local and green CI mobile cases remain separate evidence, not a substitute presented as a production measurement. Captured Admin console warnings/errors were empty, but the browser connector exposes no full network trace; no claim of per-request HTTP-status or provider-network capture is made. Read-only source inspection, successful UI data and aggregate checks support the safety assessment.

### Authorized containment and final state

Before rollback, freshly verified no newer production deployment and no foreign remote commit. Used Cloudflare's **Rollback to this deployment** for the freshly recorded immediate predecessor `d6deb284-7576-4731-93db-1d976c110e2a` (source `df5d13af2c0302995892d65f8805d8a812039d38`). This changed only the Pages production target, not D1 or Worker. After rollback, public `/admin` matched previous HTML exactly, and the existing session loaded the original Stage 3 Overview and its working **Rezervace & finance** navigation/list. Worker health remained successful. Homepage/gallery and the video iframe ID `cGfcolaqczM` remained correct. No Worker rollback was required.

Final read-only D1 check: reservations **0**, members **5**, QR identities **0**, preferences **0**, migration registry **8**, matching preflight aggregates. The verification SELECT reported `changes=0`, `changed_db=false`, `rows_written=0`. Aggregate equality is not a row-by-row audit or a claim that unrelated concurrent writes were impossible. Production reservation detail and its opt-in projection were not testable because there are no reservations; accepted local pending-workflow tests/screenshots remain the evidence, without creating production test data.

No migration/schema change, business-data write, preference save/reset, reservation approval/payment, QR provisioning, provider readiness/send, email, DNS/secrets/bindings/billing change or redesign was performed. No Member Portal session smoke was started because its automatic tracking writes are outside this read-only release. No production data or private media URLs are stored in this note.

The reviewed NEW commits remain on GitHub `main`; production Pages deliberately serves the previous frontend while the additive NEW Worker remains active. **Do not automatically push this documentation or another commit: a future push may redeploy NEW again.** A separately authorized cache-safe release fix and warm-session regression gate are needed before re-release. This note is local documentation only; stop after reporting the rollback.

## Cache-safe module graph hotfix — local only, 2026-09-09

Starting point: clean `main` at `c9ab4f713345033f17ca9a787d90f71dc19b1372`, local `origin/main` at `72af7e299bf7ae73db1724033558f7572bca37fd`, 1 ahead / 0 behind. No remote/production access or history rewrite in this hotfix task. The previous rollout/rollback record remains historical and unchanged.

### Audit and narrow correction

The V8 static dependency parser traced `admin.html -> admin.js` through **40 local browser modules and 128 unique importer/specifier edges including the HTML entry**, plus two excluded absolute Firebase SDK imports. Repeated identical imports within one file count as one parser dependency. Of those local edges, **108 used the then-current `20260909-admin-command` token**, **20 were unversioned**, and none used another nonempty token. This includes two unversioned edges to the locally hosted vendor `.mjs` QR module; its implementation is unchanged.

Complete unversioned-edge inventory before the fix:

| Importer | Unversioned specifiers |
| --- | --- |
| `admin/ui.js` | `../vendor/qrcode-generator.mjs` |
| `admin/dashboard.js` | `./dashboard-model.js`, `./command-model.js`, `./command-cards.js`, `./command-icons.js`, `./command-shell.js`, `./destinations.js`, `./dashboard-data.js` |
| `admin/dashboard-model.js` | `./destinations.js` |
| `admin/command-model.js` | `./dashboard-model.js` |
| `admin/command-cards.js` | `./dashboard-data.js`, `./command-icons.js` |
| `admin/member-detail.js` | `../vendor/qrcode-generator.mjs` |
| `admin/command-shell.js` | `./command-model.js`, `./command-icons.js` |
| `admin.js` | `./admin/command-shell.js` |
| `admin/lists.js` | `./destinations.js` |
| `admin/navigation.js` | `./destinations.js` |
| `admin/shell.js` | `./destinations.js` |
| `admin/modules/reservations-payments.js` | `../reservation-media.js` |

All 128 local edges now use **`20260909-admin-command-r2`**, including the HTML entry, nested imports, shared state consumers and the local QR module. No source is reachable under multiple browser URLs/tokens. Absolute Firebase URLs remain untouched. CSS links were reviewed: NEW styles already have their distinct NEW/polish tokens, shared styles are unchanged by this hotfix; no stylesheet or CSS link was edited.

The deterministic negative-control browser test confirms the failure mechanism: serve the old `ADMIN_AREAS.finance` map through the formerly unversioned shell/navigation edges, then click the generated NEW Reservations button. It falls back to Overview because the old map has no `reservations` key. With the current edges restored, an ordinary reload in the same fixture/session reaches Reservations and Payments correctly and never requests the poisoned stable URL. This is a controlled stale-response/URL-identity test; Playwright routing disables HTTP cache, so it is not represented as a measurement of a real four-hour production cache lifetime. No cache clear, incognito workaround, service worker, runtime cache framework or production header change was added.

Direct imports under `worker/` remain byte-identical, including normal imports of `admin/destinations.js` and `admin/dashboard-model.js`; Node/test imports likewise were not mass-versioned. The shared browser-reachable `dashboard-model.js -> destinations.js` edge must carry the browser token. That transitive shared edge also enters the local Worker dry-run bundle: esbuild retains a second copy of pure destination constants alongside the normal server import (313.41 KiB / 69.91 KiB gzip versus 310.28 / 69.77 before). No mutable browser state, SQL, API behavior or server policy was changed. No config alias or server-import rewrite was introduced to hide this small bundle-only consequence.

### Regression gate

- `scripts/check-admin-module-graph.mjs`: V8 `SourceTextModule` parse only, no linking/evaluation/network. Follows static imports, side-effect imports and re-exports; checks entry/current token, exact URL identity, missing sources, duplicate runtime URLs and cycles. Only the reviewed external Firebase imports are excluded. Worker/Node-only roots are not traversed from Admin.
- `tests/admin-module-graph.test.mjs`: six cases cover the actual full graph plus future unversioned side-effect imports, multiline re-exports, mixed versions/fragments, stale HTML entry, inline-module bypass, commented imports, Firebase exclusions, unrelated Worker/Node roots, absolute local imports and missing dependencies.
- Three added browser cases in `tests/e2e/admin-command.spec.mjs`: generated navigation at 1440px and 390px (actual active panels, canonical URLs, Overview hidden, Back/Forward, ordinary reload), plus the stale-response negative control/current-graph request audit. Same canonical fixture and explicit zero-write assertions; no existing assertion was modified or removed.

Reproduce the focused check locally:

```text
node --experimental-vm-modules scripts/check-admin-module-graph.mjs
node --test tests/admin-module-graph.test.mjs tests/admin-command.test.mjs
pnpm exec playwright test --grep "CACHE SAFE"
```

### Exact change inventory

Application files below contain **cache URL changes only**, verified by comparing each full file to the starting commit after stripping the old/new Admin query token. No other application text differs.

- `admin.html`
- `admin.js`
- `admin/api.js`
- `admin/command-cards.js`
- `admin/command-model.js`
- `admin/command-shell.js`
- `admin/dashboard-model.js`
- `admin/dashboard.js`
- `admin/editors.js`
- `admin/lists.js`
- `admin/member-detail.js`
- `admin/modules/accommodation.js`
- `admin/modules/dashboard-events.js`
- `admin/modules/funnel.js`
- `admin/modules/mailing/campaigns.js`
- `admin/modules/mailing/contacts.js`
- `admin/modules/mailing/delivery.js`
- `admin/modules/mailing/editor.js`
- `admin/modules/mailing/index.js`
- `admin/modules/mailing/preview.js`
- `admin/modules/mailing/segments.js`
- `admin/modules/mailing/tracking.js`
- `admin/modules/moderation.js`
- `admin/modules/reservations-payments.js`
- `admin/navigation.js`
- `admin/refresh.js`
- `admin/reservation-media.js`
- `admin/shell.js`
- `admin/state.js`
- `admin/ui.js`

Additional files: `scripts/check-admin-module-graph.mjs` (new), `tests/admin-module-graph.test.mjs` (new), `tests/e2e/admin-command.spec.mjs` (additive tests only), and this append-only documentation note. No dependency changes.

Final local gate: focused Node **15/15**, full Node **367/367**, full Chromium **83/83**, configured WebKit **52/52**. Counts increased only by six Node and three browser regressions per engine. Production syntax **117 files PASS**; production import graph **117 modules, zero missing imports/cycles**; Admin browser graph **40 modules / 128 local edges, zero token errors/cycles**. Worker **dry-run only PASS**, **313.41 KiB / 69.91 KiB gzip**, with the pure-constant duplication described above. Git whitespace check passes. Existing experimental Node/SQLite, color-environment and Git LF/CRLF warnings are non-failing; no unresolved application regression or unexpected browser error remains.

All 30 application-file diffs are cache-URL-only. Worker source, SQL, migrations, API/auth/business rules, CSS/UI, refresh cadence, configuration, dependencies, public/Member frontend and existing test assertions are unchanged. This is one local hotfix commit above the rollback documentation; no push, deployment, production access/write, provider call, email or QR provisioning. This local hotfix does not authorize or perform another rollout.

## Potvrzené zápisy a chráněné Admin editory — lokální oprava, 2026-09-09

Výchozí čistý `main`, HEAD i `origin/main`: `85fe0c861295b71be74c5438a85341f9ae1dfaa2`, ověřeno po jednom fetchi. Práce je pouze na nové lokální větvi `fix/admin-confirmed-render`. Tato poznámka nemění historické rollout výsledky a neschvaluje publikaci. Další publikační krok musí nejprve ověřit opravu v CI na **neprodukční větvi**; tento task nic nepushuje.

### Doložená příčina a hranice důkazu

`updateReservation()` zahazoval částečný potvrzený výsledek a upravoval pouze načtený seznam. Při otevření z dashboardu byl seznam prázdný. Následný GET uložil `approved` do `reservationDetail`, ale `editorProtected()` kvůli čistému fokusu přeskočil celý drawer. Úspěšný GET byl označen jako fresh a neexistovalo dokončení odloženého renderu. Bind navíc mohl převzít novou základní revizi z kanonických dat, přestože vstupy stále zobrazovaly staré hodnoty. `confirmed()` původně označoval všechny právě viditelné hodnoty za uložené, včetně neodeslaného druhého pole a textu napsaného během čekání.

Nový deterministický test před změnou aplikace **selhal** na původní podmínce `[data-review-action="approved"]` count **0**, skutečně **1**, timeout **7000 ms**. Bariéra zadržela pouze detail GET po skutečném lokálním approval commandu; poznámka zůstala čistá a zaměřená. DB i kanonický detail už byly `approved`. Stejná podmínka po opravě prochází bez opuštění pole. Přesný fokus původního GitHub runu `34356170172` zachycen nebyl: tato řízená reprodukce není zpětným záznamem CI.

Doplňující red/green test prokázal stejný problém základní revize v ubytování: dirty první karta blokovala seznam, druhá karta stále zobrazovala starý název, ale bind změnil její `data-base-revision` **1 → 2**. Po opravě zůstává revize **1**, dokud se vstupy skutečně nevykreslí. To brání potvrzení dalších změn proti neviděnému serverovému základu.

### Potvrzení, drafty a render

- Receipt musí odpovídat ID operace, actor UID, typu příkazu, cílové entitě, eventu a CAS base/result revision. Existující request client nadále kontroluje i objekt session, generation a event; pozdní výsledek do zavřeného/přepnutého editoru nespouští další mutation refresh.
- Reservation command aplikuje **vrácenou** částečnou projekci do stejného detailu i již načtené stejné položky seznamu. Neodvozuje stav z odeslaného body. Merge zachovává chybějící `reviewContext`/selected car/QR, finance, člena a media vazby; explicitní nula/null zůstávají autoritativní. Starší revize nepřepíše novější detail ani položku seznamu. Receipt-only/replay nic nevymýšlí a použije stávající řízenou revalidaci. Ztracená odpověď se obnovuje přes receipt, bez druhého zápisu.
- Příkaz uchová neměnný odeslaný body, snapshot ovládacích prvků a přesně odeslaná pole. Potvrzení posune jen jejich základ; nesouvisející a pozdější editace zůstávají draftem. Výslovné „plně uhrazeno“ promítne odeslanou částku jen tehdy, pokud mezitím uživatel pole nezměnil. Cizí konflikt se automaticky nepřebázuje. Starší uložené recovery záznamy bez snapshotu se zpracují konzervativně, nikoli jako potvrzení všech živých vstupů.
- Stav, dostupné akce a read-only finance draweru se aktualizují cíleně. Vstupy, jejich text/selection/fokus, celý article a scroll kontejner se neodstraňují. Čistý fokus není dirty draft, ale může nadále chránit úplný remount. Schválená rezervace už nenabízí Schválit, ani při fokusu v poznámce.
- Vizuální kontrola zachytila posun hlavičky způsobený novou stavovou zprávou v existujícím CSS gridu. Zprávy proto zůstávají uvnitř hlavičky a cílený render zachová jejich DOM uzly. Nový test ověřuje pořadí hlavičky před členskými údaji. CSS ani návrh obrazovky se nemění.
- Malá lokální fronta v existujícím editor modulu uchovává nejnovější relevantní render callback. Dokončí jej po zániku ochrany událostmi input/change/focusout nebo výslovným zahozováním, bez nového timeru či GET. Entity/session/navigace/close/logout/denied kontext frontu zneplatní. Binding nepřevezme novou revizi jen proto, že se povedl GET; renderer jej obnoví až po bezpečné hydrataci.
- GET freshness a render nejsou totéž: při chráněném editoru shell uvádí „Data načtena · chráněný editor čeká na úplné zobrazení“ a editor vlastní vysvětlení. Úspěšný GET není falešnou síťovou chybou. Stav operace a dirty/conflict/recovery informace jsou samostatné. Částečný readonly render nevyžaduje blur, zavření ani reload.
- Potvrzená operace se zpracuje jednou. Rezervace i platba využijí jednu stávající logickou invalidaci; odstraněn byl redundantní payment reload. Při odchodu z kontextu proběhne jeho další běžné čtení, ne pozdní refresh cizího detailu. Žádné nové periodické časovače, serverové endpointy, SQL ani doménové operace.

### Omezený audit browserových call sites

| Oblast | Odložení / uchovaná data | Dokončení renderu | Neodeslané hodnoty |
| --- | --- | --- | --- |
| Rezervace z dashboardu i seznamu | Fokus/dirty/saving/unknown/conflict chrání vstupy; kanonický detail a seznam přijímají potvrzenou projekci monotónně. | Readonly stav/akce ihned; nejnovější celý drawer z fronty po uvolnění. | Poznámka vs. platba i post-send text se potvrzují odděleně. |
| Platba ve stejném draweru | Stejný mechanismus; žádný druhý mutation/refresh, žádný výpočet nových platebních pravidel. | Readonly finance ihned, vstupy bezpečně později. | Uložení platby nepotvrdí jinou poznámku; mark-full nevytvoří falešný draft. |
| History / S&S | Stejná prokázaná sdílená ochrana; přijatá claims/counts data se uchovají, readonly rozhodnutí se aktualizují. | Samostatné existující attendance/S&S příkazy, potom deferred list render; otevřené karty zůstávají zachované. | Attendance note nepotvrdí SNS note. Žádná společná backendová operace ani změna uzamčených výsledků. |
| Ubytování | Seznam může blokovat karta nebo lokální soubor. Nejnovější payload čeká; baseline jiné nevykreslené karty se neposune. | Deferred list po uvolnění ochrany; lokální foto jen dosavadním explicitním discard/upload postupem. | Named-field snapshot; post-send změna nezmizí při confirmed. |
| Ročník | Fokus/dirty chrání formulář. Audit doložil, že samotný aktivní `/events` GET dříve nenavazoval na renderer. | Existující aktivní events read nyní předá data rendereru; deferred hydratace bez dalšího GET. | `changedFields()` a původní CAS konflikt zůstávají. Žádná změna intervalu. |
| Dashboard preferences | Existující configuration draft/pending preferences a CAS/recovery; celý snapshot se potvrzuje samostatně. | Čistý zaměřený editor má deferred příjem; konfliktní koncept nadále vyžaduje dosavadní explicitní porovnání/aplikaci. | Editace po odeslání zůstane otevřená a neuložená, save ji nezavře. |
| Galerie / lightbox | Grid nemá textový editor; lightbox ano. Audit doplnil ochranu jeho textarea při následném potvrzeném renderu. | Potvrzený status/akce cíleně; úplný lightbox po uvolnění, close odstraní vazbu. | Vrácený `photo` výsledek, nikoli domnělý status z body; post-send poznámka zůstává draftem. |

Záměrně beze změny: business/auth pravidla, reversal policy, ceny/VS/QR, provider operace, vzdálená data, cadence 60/120/300 s, ostatní historické refresh volby mimo potvrzenou reservation/payment cestu. Žádná obecná cache, nový event bus nebo framework.

### Cache, testovací kontrakty a CI diagnostika

Celý kontrolovaný Admin import graph a HTML entry používají jednotně **`20260909-admin-command-r3`**. Nový čistý `admin/confirmed-state.js` sdružuje pouze malé merge/snapshot/receipt funkce. Worker source/importy zůstaly beze změny; dry-run ověřuje i existující transitive shared browser token. Navigační CACHE SAFE testy a jejich negativní kontrola zůstávají.

Původní behavioral assertions nebyly odstraněny ani oslabeny. Původní approval count **0 / 7000 ms** zůstává. Testovací opravy doplňují skutečný receipt kontrakt do dvou starších mocks a sjednocují UID syntetického browseru s lokálním Worker actor `a`. Historický badge test navíc ověřuje dokončené první rozhodnutí před druhým příkazem. Command fixture umí volitelnou bariéru až za skutečným lokálním handlerem a používá syntetická media; žádná změna produkční sítě nebo potlačení chyb.

CI zachová dosavadní fail/retries=0. Výstupy Chromium a WebKit jsou v oddělených adresářích včetně run attempt. Failure-only upload ukládá trace, screenshot, error context i HTML report, názvy obsahují engine/run/attempt, retence **5 dní**. Konfigurace vychází z aktuálního [oficiálního upload-artifact v7](https://github.com/actions/upload-artifact) a jeho podporovaných inputů. Žádné `continue-on-error`, další retry, production tokeny ani změny Cloudflare konfigurace. Skutečný upload artefaktů v GitHub Actions v tomto lokálním tasku proveden nebyl.

### Reprodukce a závěrečné ověření

```text
node --test tests/*.mjs
node --experimental-vm-modules scripts/check-admin-module-graph.mjs
pnpm test:e2e tests/e2e/admin-confirmed-render.spec.mjs --project=chromium --project=webkit
pnpm test:e2e --project=chromium --output=test-results/final-chromium
pnpm test:e2e --project=webkit --output=test-results/final-webkit
pnpm test:e2e tests/e2e/admin-confirmed-render.spec.mjs --project=chromium --project=webkit --grep "clean focus keeps|older detail response|lost response recovery" --repeat-each=3 --output=test-results/confirmed-repeat
```

Finální gate nad posledním aplikačním diffem: Node **376/376 PASS**, kompletní Chromium **102/102 PASS**, celá nakonfigurovaná WebKit sada **71/71 PASS**. Přibylo pouze 9 cílených Node testů a 19 deterministických browserových případů v každém enginu; původních 367 / 83 / 52 zůstává zahrnuto. Doplňková tři opakování tří řízených pořadí (delayed GET + čistý fokus, starší GET po commandu, ztracená odpověď + recovery) v obou enginech: **18/18 PASS**, nikoli retry selhání. Existující safe-write, draft, conflict, recovery, access-loss a CACHE SAFE navigační testy jsou součástí zelených sad.

Lokální ověření používá Windows, Node 24.19.0, pnpm 11.19.0, Playwright 1.62.1 a stejné fixtures, jeden worker, retries=0; úplný gate a doplňková opakování používají také `CI=1`. Docker není dostupný a WSL nemá připravenou lokální distribuci. **Nejde o měření Linux GitHub CI ani certifikaci fyzického Safari/iPhonu.** GitHub CI ani upload nových diagnostických artefaktů nebyl spuštěn; musí být ověřen až v samostatně schváleném publikačním kroku na neprodukční větvi.

Lokální čtyřmigrační forward chain odpovídá kanonickému schématu, oba in-memory SQLite DB mají integrity `ok`, nulové FK chyby a 8 registry záznamů. Nešlo o migraci vzdálené D1. Wrangler 4.129.0 **dry-run pouze PASS**, 313.41 KiB / 69.91 KiB gzip; žádný upload. Finální syntax kontrola: **118** first-party production souborů + **64** diagnostických/testových PASS. Produkční import graph včetně lokálního vendor leafu: **119 modulů**, žádné chybějící importy/cykly. Admin cache graf: **41 modulů / 130 lokálních vazeb**, 2 schválené externí Firebase importy, žádné token chyby/cykly. `git diff --check` PASS. Nezávažná upozornění: experimentální Node VM/SQLite, souběžné NO_COLOR/FORCE_COLOR, Git LF/CRLF a dostupná novější verze Wrangleru; závislosti se neaktualizovaly.

Vizuálně ověřený [screenshot schváleného detailu se zachovaným fokusem](../test-results/final-chromium/admin-confirmed-render-CON-3bb9b--status-and-actions-current-chromium/confirmed-focused-detail.png) je reprodukován testem `CONFIRMED dashboard empty list...`. Screenshot i ostatní Playwright artefakty jsou lokální, gitignored a obsahují pouze syntetická data; nejsou součástí commitu. Po odstranění test-results se znovu vytvoří uvedeným testem. Hlavička je nahoře, status Schválená, Schválit chybí a čistá poznámka má stále fokus. Test samostatně ověřuje i zachování caret/selection/scroll při post-send rozepsaném textu.

### Přesný inventář změn a lokální uzavření

Celkem **41 souborů** (3 nové, 38 upravených):

- Funkční oprava: `admin.js`, `admin/editors.js`, `admin/dashboard.js`, `admin/modules/reservations-payments.js`, `admin/modules/moderation.js`, `admin/modules/accommodation.js`, `admin/modules/dashboard-events.js`; nový `admin/confirmed-state.js`.
- Pouze `r2 → r3`, ověřeno porovnáním celého obsahu po normalizaci tokenu a CRLF: `admin.html`, `admin/api.js`, `admin/command-cards.js`, `admin/command-model.js`, `admin/command-shell.js`, `admin/dashboard-model.js`, `admin/lists.js`, `admin/member-detail.js`, `admin/modules/funnel.js`, `admin/modules/mailing/campaigns.js`, `admin/modules/mailing/contacts.js`, `admin/modules/mailing/delivery.js`, `admin/modules/mailing/editor.js`, `admin/modules/mailing/index.js`, `admin/modules/mailing/preview.js`, `admin/modules/mailing/segments.js`, `admin/modules/mailing/tracking.js`, `admin/navigation.js`, `admin/refresh.js`, `admin/reservation-media.js`, `admin/shell.js`, `admin/state.js`, `admin/ui.js`.
- CI/cache diagnostika: `.github/workflows/ci.yml`, `playwright.config.mjs`, `scripts/check-admin-module-graph.mjs` (jen token).
- Testy: nové `tests/admin-confirmed-state.test.mjs`, `tests/e2e/admin-confirmed-render.spec.mjs`; upravené `tests/e2e/fixtures.mjs`, `tests/e2e/command-fixture.mjs`, `tests/e2e/admin-safety.spec.mjs`, `tests/e2e/feedback-admin.spec.mjs`.
- Dokumentace: append-only `docs/admin-new-command-center.md`.

Žádný Worker, SQL/migrace, stylesheet, public/Member aplikace, závislost nebo provider konfigurace se nemění. Výstup je jeden lokální opravný commit `fix: reconcile confirmed admin writes and protected renders` na `fix/admin-confirmed-render`; `main` a `origin/main` zůstávají na výchozím `85fe0c861295b71be74c5438a85341f9ae1dfaa2`. Žádný push, produkční přístup/zápis, vzdálená migrace, QR provisioning, e-mail/provider akce, deployment ani rollback. Tím tento lokální task končí.

## 2026-09-09 — lokální responsive Admin / Member modal (r4)

Navazuje výhradně na ověřený release `632836a283c2f23c4b02302761eac60c9a749549`. Jeden fetch potvrdil nezměněný remote a čistý výchozí strom. Práce probíhá na nové lokální větvi `feat/admin-responsive-member-modal`; main ani origin/main se neposouvají. Nejde o release ani produkční smoke.

### Prezentační rozsah

- Existující 12sloupcový dashboard používá přirozené auto řady a stretch. Vyrovnávají se skuteční sousedé, nikoli pevně zvolené dva moduly nebo všechny řady navzájem. Vnitřní akce Schvalování jsou dole; všechny kapacity zůstávají viditelné, dlouhé názvy se zalamují. Mezery a padding mají malé fluidní rozsahy. Na mobilu je přirozený stacking, bez zoomu/scale či JS měření výšek.
- Header je nyní v běžném toku dokumentu, s vlastní skutečnou výškou. Sidebar je sticky ve stávajícím kontejneru vedle workspace. Není nutný odhad pevného horního offsetu. Ověřeny dlouhé syntetické identity a stresově dlouhý popisek native event selectu; skutečný renderer event selectu nadále používá dosavadní ročník/status, nikoli nový formát titulku.
- Dvě kompozice, preference, pořadí/šířky/viditelnost a mini-náhled se nemění. Test porovnává plán náhledu s reálnými CSS spany po explicitním **lokálním fixture** save. CAS, konflikty, confirmed-render, receipt recovery a ochrany draftů zůstávají.
- Jediný existující native Member dialog je centrovaný, do 1240 px, omezený viewportem. Desktop má svislou navigaci 180 px, na mobilu nativní označený select „Sekce člena“. Hlavní obsah má vlastní scroll; header/close zůstávají dostupné. Delší desktop navigace při velmi krátkém okně může samostatně scrollovat, jednotlivé obsahové karty scroll nemají.
- Native modal zachovává inertní pozadí; stránka je po dobu otevření scroll-locked a po zavření se obnoví. Tab boundary obsluhuje jen horní aktivní dialog. Escape fotografie nezavře člena. Návrat fokusu používá původní ovladač, případně hledání jako náhradní cíl.
- Vizuální kontrola skutečného WebKit snímku odhalila světlé systémové vykreslení mobilního selectu přes tmavé CSS. Omezené `appearance:none` a CSS šipka sjednocují pouze vzhled tohoto native selectu; jeho klávesnice, popisek a nativní výběr zůstávají. Opravený WebKit screenshot byl znovu otevřen a zkontrolován.
- Nový čistý `admin/member-presentation.js` skládá pouze existující data. Monogram není ověřená fotografie; registrace není historické „United od“. Známé enumy mají české popisky, neznámé zůstávají viditelné bez domýšlení. Mailing souhlas, vyloučení a doručitelnost jsou samostatné údaje.

Výchozí `overview` má čtyři karty: vybraný ročník, přesné finance jednotlivé rezervace, serverový Club a profil/kontakt. Nula, chybějící částka, loading, nedostupný zdroj a zastaralé poslední čtení se neztotožňují. Club chyba neodstraní profil/rezervaci. Přepnutí člena zneplatní předchozí lokální projekce; pozdní odpověď A nesmí vykreslit člena B.

Všechny původní sekce zůstávají read-only, s původním stránkováním a autorizovanými médii. Rezervace vedou do původního editoru. Historie ukazuje rozhodnutí účasti a S&S odděleně. QR se čte jen po explicitním otevření, bez provisioningu. Obecný odkaz/QR resolver otevírá Přehled; explicitní `event/club/history/qr` zůstává cílený. Serializer nově ponechá explicitní `tab=event`. Existující router nadále používá **replace** při změně členské sekce: Back vrací zdroj, Forward poslední členskou sekci, nikoli každou mezizáložku.

Při rozšířené navigační validaci se reprodukovalo prázdné okno po Forward: stávající router otevřel Member až po obnově zdroje a během restoring potlačil jeho context event. Nyní po ukončení restore proběhne hydratace přes stejný coordinator a jeho fresh path cache. Nemění se historie jednotlivých tabů, guarding zdrojového editoru ani perioda. WebKit dále prokázal závod při opuštění dosud dekódované privátní fotografie; cleanup před revoke nejprve odpojí její živé img.src. Abort, generation/ownership kontroly i zrušení všech URL zůstávají. Nový all-section test před těmito úpravami selhal a po nich prošel v obou enginech.

### Zdroje, frekvence a náklad

| Existující zdroj | Při otevření Přehledu | Dosavadní perioda |
| --- | --- | --- |
| `GET /api/admin/summary?eventId=…` | sdílený, pouze pokud potřebuje obnovu | 300 s nad Member |
| `GET /api/admin/members/:id?eventId=…` | member-header | 60 s |
| `GET /api/admin/members/:id/club?eventId=…&page=1` | jeden Club read | 300 s |

Při otevření z čerstvého dashboardu test měří přesně **2 GET** (header + Club). Přepnutí Přehled → Club → Přehled s čerstvou cache nepřidá GET. Pět řízených kroků po 61 s měří včetně úvodního otevření **6 header + 2 Club + 1 summary GET**, nejvýše 3 úlohy v jedné obnově. Neaktivní zdrojová doména se neobnovuje. Dosavadní testy dále ověřují hidden/offline/logout/denied a nulové poll writes. Úvodní bootstrap session/events/preferences není nový Member request a není z těchto dvou GET odvozován. OPTIONS se do D1 čtení nepočítá.

Oproti dřívějšímu výchozímu Eventu přibývá pouze existující Club projekce: nejvýše jedno studené čtení a při trvale viditelném Přehledu až 12 periodických čtení za hodinu. Existující handler obsahuje 4 SQL dotazy (identita, historie pro serverovou derivaci, agregace bodů, počet schválených fotografií), header se zvoleným eventem 3; globální DB kontrola Admin oprávnění je zachována navíc. **Počet SQL dotazů ani HTTP requestů není počet účtovaných D1 řádků.** Nové produkční `meta.rows_read` nebylo měřeno a žádný nový celkový D1 budget pass se netvrdí. Přijatá Stage 2 hranice 3 904 805 s rezervou a formálně nesplněný 1M cíl zůstávají autoritativní; tento task je znovu neoptimalizuje.

Dosavadní command/dashboard/mailing-widget budget kontroly PASS nad nezměněnými SQL/plány. Žádný nový endpoint, timer, cache framework, provider nebo globální prefetch. Historie rezervací, Garage, Photos, Mailing a QR se načítají jen po otevření jejich sekce.

### Validace a reprodukce

Nové pokrytí: 8 Node případů a 15 browserových scénářů v každém enginu. Původní assertiony pro confirmed-render/safe-write/recovery/cache zůstaly beze změny. Dva původní prezentační testy pouze následují schválený výchozí Přehled/české názvy; jejich datové a bezpečnostní kontroly zůstávají. V lokální command fixture byla opravena kolize `endsWith('/reservations')`: obecný seznam nyní odpovídá jen přesné `/api/admin/reservations`, zatímco členský endpoint obsluhuje existující Member handler. Backend se tím nemění.

```text
node --test tests/*.mjs
node --experimental-vm-modules scripts/check-admin-module-graph.mjs
node scripts/check-admin-command-budget.mjs
node scripts/check-admin-dashboard-budget.mjs
node scripts/check-admin-mailing-widget-cost.mjs
pnpm test:e2e --project=chromium --output=test-results/responsive-final-chromium-green
pnpm test:e2e --project=webkit --output=test-results/responsive-final-webkit
wrangler deploy --dry-run --outdir test-results/responsive-worker-dry-run
git diff --check
```

Finální úplný browser gate po poslední úpravě: **Chromium 117/117 PASS**, **WebKit 86/86 PASS** (každý 2,7 min, CI=1, jeden worker, retries=0). Node **384/384 PASS**, syntax **119 produkčních + 66 diagnostických/testových souborů PASS**, produkční importy **120 modulů, bez cyklů/chyb**, Admin cache graph **42 modulů / 133 lokálních vazeb, bez cyklů/token chyb**. Jednotný token `20260909-admin-member-modal-r4` zahrnuje HTML entry i všechny kontrolované importy a tři skutečně změněné stylesheet URL. Worker dry-run **313.42 KiB / 69.91 KiB gzip PASS**, pouze lokální bundle, bez uploadu.

Sandboxový průběžný Chromium narazil na `ERR_NETWORK_ACCESS_DENIED` u nezměněného YouTube thumbnailu a testovací proces nedokončil teardown; nejde o aplikační regresi. Finální browser gate proběhl mimo sandbox s nezměněnými baseline assertions, timeouts, fixtures síťovou izolací a retries=0. Opravy nově psaných testů respektují skutečný native select a existující replace-history kontrakt, nikoli změnu aplikace kvůli testu. Lokální Windows/Playwright není GitHub Linux CI ani fyzický Safari/iPhone. 200% ověření je odpovídající CSS reflow 800 × 450, nikoli tvrzení o automatizovaném ovládání chrome zoomu.

### Skutečné lokální screenshoty

Snímky jsou skutečné viewporty syntetických fixtures, nikoli návrhové mockupy ani produkční osobní údaje. Nové testy je při uvedeném kompletním běhu znovu vytvářejí v gitignored `test-results/`; po smazání artefaktů je potřeba reprodukce. Vizuální kontrola zahrnuje všechny cílové rozměry, dlouhé ubytování, mobilní okraje, klávesnici a návrat do draftu.

- [Dashboard 1600 × 900 — prázdný stav a tři skutečné varianty ubytování](../test-results/responsive-final-chromium-green/admin-responsive-member-RE-fbfdb-atural-rows-and-header-1600-chromium/dashboard-empty-three-types.png)
- [Dashboard 1600 × 900 — rezervace a platby](../test-results/responsive-final-chromium-green/admin-responsive-member-RE-fbfdb-atural-rows-and-header-1600-chromium/dashboard-populated-1600.png)
- [Dashboard 1366 × 768](../test-results/responsive-final-chromium-green/admin-responsive-member-RE-ffc5f-atural-rows-and-header-1366-chromium/dashboard-populated-1366.png)
- [Dashboard 1920 × 1080](../test-results/responsive-final-chromium-green/admin-responsive-member-RE-f0bb3-atural-rows-and-header-1920-chromium/dashboard-populated-1920.png)
- [Dashboard 1280 × 720](../test-results/responsive-final-chromium-green/admin-responsive-member-RE-7447d-atural-rows-and-header-1280-chromium/dashboard-populated-1280.png)
- [Dashboard mobil 390 × 844](../test-results/responsive-final-chromium-green/admin-responsive-member-RE-4f996-natural-rows-and-header-390-chromium/dashboard-populated-390.png)
- [Dashboard 800 × 450 — reflow](../test-results/responsive-final-chromium-green/admin-responsive-member-RE-44d19-natural-rows-and-header-800-chromium/dashboard-populated-800.png)
- [Dlouhé názvy a čtyři varianty ubytování](../test-results/responsive-final-chromium-green/admin-responsive-member-RE-fbfdb-atural-rows-and-header-1600-chromium/dashboard-long-capacity.png)
- [Member Přehled — s rezervací](../test-results/responsive-final-chromium-green/admin-responsive-member-RE-8fe06-d-private-nested-image-1600-chromium/member-overview-1600.png)
- [Member Přehled — bez rezervace](../test-results/responsive-final-chromium-green/admin-responsive-member-RE-8fe06-d-private-nested-image-1600-chromium/member-without-reservation-1600.png)
- [Member Garáž](../test-results/responsive-final-chromium-green/admin-responsive-member-RE-8fe06-d-private-nested-image-1600-chromium/member-garage-1600.png)
- [Member United Club](../test-results/responsive-final-chromium-green/admin-responsive-member-RE-8fe06-d-private-nested-image-1600-chromium/member-club-1600.png)
- [Member Přehled — mobil](../test-results/responsive-final-chromium-green/admin-responsive-member-RE-3dc8d-nd-private-nested-image-390-chromium/member-overview-390.png)
- [Mobilní přepínač Sekce člena](../test-results/responsive-final-chromium-green/admin-responsive-member-RE-3dc8d-nd-private-nested-image-390-chromium/member-mobile-section-picker.png)
- [Nastavit zobrazení — změněné pořadí, velikost a viditelnost](../test-results/responsive-final-chromium-green/admin-responsive-member-RE-1d424-still-share-the-actual-grid-chromium/settings-reordered.png)
- [Návrat do zdrojového editoru — fokus](../test-results/responsive-final-chromium-green/admin-responsive-member-RE-cdbde-ion-focus-and-source-scroll-chromium/return-to-dirty-payment.png)
- [Zachovaný neuložený draft 1700 Kč](../test-results/responsive-final-chromium-green/admin-responsive-member-RE-cdbde-ion-focus-and-source-scroll-chromium/return-to-dirty-payment-amount.png)
- [Historie — oddělené rozhodnutí účasti a S&S](../test-results/responsive-final-chromium-green/admin-responsive-member-RE-6745d-ory-and-explicit-deep-links-chromium/member-history-separate-states.png)
- [Nedostupný Club se zachovanou identitou a rezervací](../test-results/responsive-final-chromium-green/admin-responsive-member-RE-f4edc-e-not-empty-or-foreign-data-chromium/member-club-unavailable.png)
- [Dlouhý syntetický e-mail a event popisek](../test-results/responsive-final-chromium-green/admin-responsive-member-RE-db6a9-n-controls-and-modal-scroll-chromium/long-admin-header.png)
- [Member při 200% ekvivalentním reflow](../test-results/responsive-final-chromium-green/admin-responsive-member-RE-db6a9-n-controls-and-modal-scroll-chromium/member-reflow-200-equivalent.png)

### Inventář lokálního diffu a hranice

Celkem **42 souborů (3 nové, 39 upravených)**. Po normalizaci samotného r3/r4 tokenu a CRLF je **27 souborů cache-only**, **15 ostatních**:

- CSS: `admin-members.css`, `admin/command-center.css`, `admin/command-polish.css`.
- Klientská prezentace/navigace: `admin.js`, `admin/member-detail.js`, `admin/navigation.js`, nový `admin/member-presentation.js`.
- `admin.html`: pouze modulový token a URL tří změněných stylesheetů.
- Testy: nové `tests/admin-member-presentation.test.mjs`, `tests/e2e/admin-responsive-member.spec.mjs`; prezentační adaptace `tests/e2e/admin-command.spec.mjs`, `tests/e2e/admin-members.spec.mjs`; přesná shoda endpointu v `tests/e2e/command-fixture.mjs`.
- `playwright.config.mjs`: přidává nový soubor do dosavadní WebKit allowlist; nemění timeouts/retries/workers. Tento append-only dokument.

Cache-only zbytek včetně `scripts/check-admin-module-graph.mjs` mění pouze jednotný release token, nikoli sdílené runtime chování. Žádný nový dependency/framework, Worker/API/auth/SQL/schema/business změna, veřejný web ani Member Portal. Skutečná Cloudflare data, fyzické mobilní zařízení a vzdálené CI nejsou v tomto lokálním tasku ověřovány. Neproběhl push žádné větve, deployment, produkční přístup/zápis, vzdálená migrace, provider/e-mail operace ani produkční QR provisioning. Výsledkem je jediný lokální implementační commit; následuje vizuální kontrola operátora, nikoli automatické pokračování.

## 2026-09-09 — lokální primary-car hero Member 360 (r5)

Follow-up výhradně k `88a886482076048912ac8cc78d00bf997db9271d` na `feat/admin-responsive-member-modal`. Výchozí HEAD/větev i čistý strom byly ověřeny; main a origin/main zůstávají na `632836a283c2f23c4b02302761eac60c9a749549`. Žádný release ani produkční přístup.

### Úzký read kontrakt a výběr

Existující `GET /api/admin/members/:memberId?eventId=…` přidává pouze:

```js
heroCar: null
// nebo
heroCar: { id, model, body, nickname, photo: null }
// nebo photo: { id, version, mediaPath }
```

Identita, event, rezervace, context, freshness i obálka zůstávají; dataVersion nadále otiskuje celý payload. Žádný nový endpoint, R2 key ani kolekce aut/fotek v headeru. Auto musí splnit `member_id=? AND is_primary=1`; při více historicky označených primary je výběr stabilní podle `created_at,id`. Bez primary se nevybírá secondary. Jedna fotografie odpovídá současnému Garage pořadí `sort_order,id`; version je dosavadní `created_at`. MediaPath vede výhradně na stávající `/api/admin/members/{memberId}/media/cars/{carId}/{photoId}`, jehož kontrola vlastnictví a R2 obsluha se nemění.

### SQL / query-plan důkaz

Přesné dva nové dotazy jsou exportované konstanty v `worker/admin/members.js` a test je spouští nad nezměněnou Stage 2 growth fixture: 500 členů, 750 aut, 750 car_photos, 900 rezervací.

```sql
SELECT id,model,body,nickname FROM cars
WHERE member_id=? AND is_primary=1 ORDER BY created_at,id LIMIT 1;

SELECT id,created_at AS version FROM car_photos
WHERE car_id=? ORDER BY sort_order,id LIMIT 1;
```

EXPLAIN QUERY PLAN: `SEARCH cars USING INDEX idx_cars_member (member_id=?)` + `USE TEMP B-TREE FOR ORDER BY`; fotografie: `SEARCH car_photos USING INDEX admin_car_photos_car (car_id=?)`. Žádný full-table SCAN. Každý lookup vrací nejvýše jeden řádek. **LIMIT není důkaz jednoho procházeného řádku:** car index omezí hledání na vozy daného člena; tento subset se filtruje/řadí (ve growth fixture nejvýše 3 vozy/člen). Náklad tohoto subsetu může růst s počtem vlastních aut, ne s celou tabulkou. Photo index pokrývá i požadované pořadí. Žádný nový index/migrace.

Header se zvoleným platným eventem má nyní 5 SQL namísto 3 při existujícím primary, 4 bez primary; tedy +2 nebo +1 lookup. Společná DB kontrola Admin oprávnění zůstává navíc. Media GET má vlastní dosavadní ownership lookup. Nula read-induced writes a R2 čtení při samotném JSON headeru. Toto je **lokální query-plan/fixture důkaz, nikoli Cloudflare meta.rows_read**. Historické budget JSON a přijetí nesplněného 1M cíle se nepřepisují. Regresní kontrola stále vyžaduje všechny původní SQL přesně a navíc právě tyto dva header dotazy se správnými parametry.

### Request budget a private lifecycle

- Otevření Přehledu z čerstvého dashboardu: stejné 2 JSON GET (header + Club); summary zůstává sdílený. **+0 JSON, +nejvýše 1 private hero media GET** pouze pro platný header photo path.
- Bez primary/fotografie žádný media GET. Žádné automatické Garage/Photos/History/Mailing/QR čtení.
- Header 60 s, Club a summary 300 s; coordinator/fanout se nemění. Přehled → Club → Přehled ani header se stejným photo/version nevytváří nové stažení, object URL či nový img node.
- Explicitní Garage stále načítá celý vlastní stránkovaný zdroj a jeho původní viditelná média. Hero má jeden samostatný current-member slot, ne cache celého Garage. Proto otevření Garage může stáhnout její fotografii vedle hero (ve fixture celkem 2 media GET); následný polling nestahuje ani jednu znovu.
- Hero fetch používá stávající autorizovaný apiRequest, AbortController a session/event/member/generation kontrolu před vytvořením URL i po decode. A→B nikdy nesmí vykreslit opožděné A. URL je pouze v paměti a aktuálním modalu.
- Při změně člena, zavření, logout nebo access loss se nejprve odpojí img.src, zruší request a revokuje URL. Tabová média mají zachovaný vlastní cleanup; nested image dialog/fokus se nemění.
- Chybějící R2 objekt, 404 i decode error zůstanou branded fallback bez broken img/JS exception. Neúspěšný klíč se nepokouší znovu stahovat při každém header pollu; nový photo/version nebo znovuotevření umožní nový pokus.

### Vizuál a bezpečnost

Zachován široký native modal, všechny sekce, výchozí čtyřkartový Přehled, mobile select, routing/Back/Forward/reload, source draft/fokus/scroll i confirmed-render/recovery. Pouze hlavička má cover foto s tmavším levým gradientem, drobný chip „Hlavní vůz“ a zachovaný monogram. Fotografie je Garage dekorace, ne profilová identita. Bez ní navy/grid `E36 / UNITED` fallback v CSS, bez staženého stock assetu nebo nové závislosti.

Základní min-height je desktop clamp 180–220 px, mobil 150–180 px. Obsah smí přirozeně zvětšit hlavičku při zalomení (např. WebKit s delším car chipem přibližně 200 px); text se neřeže ani nezmenšuje. Close a „Sekce člena“ zůstávají dostupné a začátek overview je vidět. Syntetická identita/ownership používá existující repository foto `assets/images/showshine/ss_sedan.webp` přes lokální autorizovaný media handler; nejde o tvrzení, komu skutečné vyfotografované auto patří.

### Validace

Přidáno 8 Node a 11 browserových scénářů pro každý engine: vlastnictví/stabilní výběr/absence primary/absence photo/verze/R2 404/oddělený Garage/growth plan; browser foto/fallback/decode/404/A→B/close/logout/denied/počet requestů/refresh/dlouhá mobilní identita.

Původní dvě coordinator E2E adaptace rozlišují nový hero a původní explicitní Garage obrázek před posunem syntetického času. Počet JSON úloh, nula dalších media GET při pollingu, hidden/offline a zero-write assertiony se nesnížily. Starý Node state import je pouze r5 token. Původní responsive request test nyní odděluje přesné dva JSON GET od přesně jednoho povoleného hero GET. Žádné změny timeoutů/retries ani safety assertionů. První úplný Chromium měl 126 PASS / 2 tyto neadaptované testy FAIL; cílený ověřovací běh po adaptaci prošel 4/4 v obou enginech.

Finální gate po všech úpravách: **Node 392/392 PASS, Chromium 128/128 PASS (2,9 min), WebKit 97/97 PASS (3,1 min)**. Žádné retries/skip. `git diff --check` PASS. Syntax 119 produkčních + 68 diagnostických/testových souborů, produkční import graph 120 modulů bez cyklů/chyb. Admin graph 42 modulů / 133 lokálních vazeb, jednotný `20260909-admin-member-hero-r5`, bez token chyb/cyklů. Dosavadní command/dashboard/mailing budget kontroly PASS. Wrangler 4.129.0 dry-run 314.19 KiB / 70.07 KiB gzip PASS, bez uploadu. Aktuální D1 prepare/bind/first signatury ověřeny proti veřejným Workers typům, bez instalace závislostí.

Reprodukce: `node --test tests/*.mjs`; `node --experimental-vm-modules scripts/check-admin-module-graph.mjs`; `pnpm test:e2e --project=chromium --output=test-results/hero-final-chromium-green`; `pnpm test:e2e --project=webkit --output=test-results/hero-final-webkit`; `wrangler deploy --dry-run --outdir test-results/hero-worker-dry-run`; `git diff --check`. Kompletní browser gate používá CI=1, jeden worker, retries=0, lokální fixtures mimo OS sandbox. Nejde o GitHub CI, fyzický Safari/iPhone ani produkční smoke.

Žádný push, deployment, migrace/schema změna, změna business pravidel, QR provisioning, produkční přístup/zápis, provider/e-mail operace. Právě jeden nový lokální follow-up commit; dále pouze vizuální kontrola operátora.

### Skutečné lokální screenshoty r5

Inventář tohoto follow-upu: **43 souborů (41 upravených, 2 nové)**. **31 cache-only** po normalizaci r4/r5 tokenu a CRLF; **12 ostatních**: čtyři aplikační soubory (`admin-members.css`, `admin/member-detail.js`, `admin/member-presentation.js`, `worker/admin/members.js`), šest testových souborů, WebKit allowlist v `playwright.config.mjs` a tento append-only dokument. Nové jsou pouze `tests/admin-member-hero.test.mjs` a `tests/e2e/admin-member-hero.spec.mjs`. Žádný nový produkční modul, CSS soubor, asset, schema soubor nebo dependency.

Všech sedm finálních Chromium snímků bylo otevřeno a vizuálně zkontrolováno; mobilní fotografie byla navíc otevřena z WebKitu. Screenshoty jsou skutečné viewporty, lokální a gitignored, ne mockupy. Při odstranění test-results je obnoví uvedený browser běh.

- [Primary auto bez fotografie — desktop fallback](../test-results/hero-final-chromium-green/admin-member-hero-HERO-branded-fallback-without-photo-1600-chromium/hero-without-photo-1600.png)
- [Mobilní fallback](../test-results/hero-final-chromium-green/admin-member-hero-HERO-branded-fallback-without-photo-390-chromium/hero-without-photo-390.png)
- [Bez primary auta — desktop fallback](../test-results/hero-final-chromium-green/admin-member-hero-HERO-branded-fallback-without-primary-1600-chromium/hero-without-primary-1600.png)
- [Dlouhá mobilní identita](../test-results/hero-final-chromium-green/admin-member-hero-HERO-lon-22c25-ing-close-or-section-picker-chromium/hero-long-mobile.png)
- [Member Přehled 390 × 844 — fotografie](../test-results/hero-final-chromium-green/admin-member-hero-HERO-pho-26c6d-esh-Garage-remains-lazy-390-chromium/hero-photo-390.png)
- [Existující Garáž s automotive hero](../test-results/hero-final-chromium-green/admin-member-hero-HERO-pho-e9e36-sh-Garage-remains-lazy-1600-chromium/hero-garage-1600.png)
- [Member Přehled 1600 × 900 — primary foto](../test-results/hero-final-chromium-green/admin-member-hero-HERO-pho-e9e36-sh-Garage-remains-lazy-1600-chromium/hero-photo-1600.png)
