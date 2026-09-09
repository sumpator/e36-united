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
