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
