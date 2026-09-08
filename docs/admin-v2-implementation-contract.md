# E36 UNITED — ADMIN V2, IMPLEMENTATION CONTRACT v2.1
## Data truth · live refresh · safe writes · Member 360 · QR foundation · desktop/mobile workflows

This contract REPLACES the earlier Admin v2 prompts, including the previous revised contract. It incorporates the subsequently approved dashboard direction. Do not implement specifications cumulatively.

EXECUTION RULE: this is the shared product contract, not authorization to implement all stages at once. Execute ONLY the stage explicitly authorized by the accompanying stage prompt. There are four separately invoked local implementation tasks. Their sequence and boundaries are defined in section 21.

## 0. Boundaries and starting state

This is LOCAL implementation, divided into four separately authorized tasks and reviewable checkpoints. DO NOT push, deploy, apply production migrations, send email, configure SMTP2GO, modify secrets/DNS, or change live business data.

Reference from the preceding source review (not a fresh repository-state check): `9d1fcd96525f8341ae59e1cfce5fdc3c9860ca3e` (SMTP2GO provider swap).
Last reported baseline: 305 Node tests, 95 first-party JS syntax checks, 39 Chromium cases, 8 focused WebKit cases. These are reference numbers, NOT proof of current runtime state.

Fetch once, inspect local HEAD/origin/main, clean worktree and any unfinished task. Require synchronized main and a completed code checkpoint. Do not interrupt a concurrent SMTP2GO rollout or rewrite someone else's changes. If state differs, report the discrepancy; never reset/rebase/force-push to match this prompt. Do not turn provider account verification into this task.

The synchronized-main requirement applies to Task 1 only. Tasks 2–4 continue from the preceding reviewed LOCAL commit; local main being ahead of origin is then expected. Follow the continuation gates in section 21. No extra push, rollout, or baseline reset is required between stages.

Run the actual current test scripts, syntax, Chromium, focused WebKit, import-cycle checks and local migration checks. Distinguish environment/network failures from application failures; report a blocked suite honestly. Never remove assertions, increase timeouts indiscriminately or whitelist runtime errors to manufacture a green baseline.

The operator does NOT perform CLI troubleshooting. Use the available development tools yourself. A genuinely missing permission is a narrow blocker, not a request for the operator to run PowerShell/curl or prepare JSON.

## 1. Product context and priorities

E36 United is a small community/event application, not an enterprise CRM. Preserve one Worker, D1, private R2, Firebase authentication, native JS modules and the existing free-tier deployment approach.

Desktop priorities: reservations, payments, accommodation, campaign work, reporting and configuration.
Mobile/event-day priorities: finding a member, checking their current states, moderation and practical touch interaction. Future features include QR scanning, entrance/check-in, S&S judging and merch collection. Do not invent those business workflows now.

Priority order:
1. Correct, explainable data and safe state transitions.
2. Fresh data, recovery from poor connectivity, predictable Back/navigation.
3. Member 360 and reusable member/QR identity.
4. Configurable graphical dashboard and clearer navigation/design.

This explicitly permits narrowly scoped backend concurrency/API-envelope improvements needed for safe existing Admin actions. It does NOT permit changing prices, capacity rules, point values, payment meaning, approval policy or mailing transport behavior.

## 2. Agreed information architecture

Primary navigation has only FIVE areas:

- **Přehled** — dashboard.
- **Rezervace & finance** — Rezervace / Ubytování / Platby.
- **Komunita** — Členové / Fotky / United Club.
- **Mailing** — Přehled / Kontakty / Segmenty / Kampaně; delivery remains with its campaign.
- **Nastavení** — Aktuální United / existing event settings.

Show secondary navigation inside the workspace. Do not expand every destination permanently in the main menu. Preserve reachable legacy Admin routes by mapping them to this structure.

Keep the event selector readily accessible. Distinguish the SELECTED event from the event marked CURRENT for the public site, especially in Settings. A historical selected event must never accidentally redirect a mutation into the current event.

Accommodation belongs beside reservations and payments, not in Settings. Future payment sources include reservation, entry and merch; only show sources actually implemented today.

Weekend Planner is transitional. Keep the existing funnel available ONLY as an optional dashboard widget/detail. Do not make it a primary navigation item, default dashboard focus or compulsory attention item. Do not delete the existing tracking.

## 3. Targeted evidence review before implementation

Inspect the actual current files, then record a SHORT issue/source/action map. Start with:

- `admin.js`: broad `Promise.all` loading, global loading flag, event switching, auth callbacks and periodic attention refresh.
- `admin/api.js`: request deadlines, cancellation, captured identity and forced-token retries.
- `admin/modules/dashboard-events.js`: `renderOverview` calling `renderEventSettings`; history refresh versus other counts.
- `admin/shell.js`: view switching, unconditional overlay close/scroll reset and persisted navigation.
- `worker/domains.js`: Admin event/reservation/payment/accommodation/gallery reads and mutations, existing capacity predicates and audit writes.
- Club history/Points modules, reservation projections, Mailing delivery locks, funnel definitions and private media ownership.

Previously inspected code refreshed history attention on focus/visibility and every 60 seconds, not the whole Admin. Some mutation SQL used ID/capacity checks without a client base revision. Gallery results did not include canonical member ID. Treat these as starting observations to reverify, not as license for speculative fixes.

Inspect any existing QR implementation before adding another one. Do not regenerate an already issued QR identity merely to match a preferred filename or format.

Do not spend the task auditing unrelated legacy systems. If a business meaning is genuinely ambiguous, identify the decision and continue independent work; do not invent a rule.

## 4. Data truth contract

Create `docs/admin-v2-data-map.md`. For EACH exposed metric record:

- stable metric ID and Czech label;
- canonical tables/projection and unit (members, reservations, people, cars, accommodation units, currency, unique recipients);
- selected-event/global/campaign scope;
- included/excluded statuses;
- timestamp and time-zone semantics for a trend or deadline;
- total versus current page/filter;
- freshness and missing/error behavior;
- exact filtered destination opened by clicking the metric.

Use current behavior as evidence, not an automatic definition of a correct label. Correct misleading projections/labels without changing underlying business rules.

Mandatory distinctions:

- Member accounts are not event reservations or crew/person counts. D1 member count is NOT a complete Firebase account census.
- Incomplete onboarding remains forward-observed identities without a completed D1 profile. Do not redefine it using car/photo/history completeness. Its first observation is not original account creation time.
- Pending reservation demand and approved capacity consumption are different. Show requested versus confirmed occupancy separately where relevant.
- People, beds and physical cabin/tent units must not share an ambiguous occupancy denominator. Unlimited capacity is not zero or 100% occupancy.
- For money, retain integer currency units used by the current model. Sum per-record outstanding amounts and overpayments separately; one member's overpayment must not erase another member's debt.
- Existing manually recorded paid amounts are not proof of bank reconciliation. Payment status and reservation status remain separate. Paid money on a cancelled/rejected reservation must remain visible in an appropriately labelled finance scope rather than disappear from an apparent all-money total.
- Do not add reservation-linked payment projections and the same payment again as separate cash receipts. Expose actual `sourceType/sourceId/memberId/eventId` relationships; future source adapters must avoid double counting.
- S&S interest is not a confirmed competition entry, judged car or score.
- Points are not capped by a reward threshold (e.g. 12). Preserve current balance/rating rules; do not invent separate lifetime/available balances or redemption behavior that the backend does not implement.
- Pending History/S&S counts use the current distinct-claim definition. One claim with two pending components does not automatically become two people/tasks.
- Mailing accepted/processed, delivered, opened, clicked and answered are distinct. Unique recipient metrics are not event-row counts; opens remain approximate. Do not invent response metrics before Mailing D.
- Creation/submission trends use genuine appropriate timestamps. `updated_at` is not registration date or payment receipt date. Do not fabricate past occupancy/cash-flow history from current states.
- Global Community queues stay visible even when a different event is selected. Explicitly label global context.

Cross-check SQL against independent hand-calculated synthetic fixtures, NOT only against another call to the same helper. When scoped production SELECT access exists, read-only reconciliation is authorized; no export of personal records into docs/tests and no correction/backfill of real data.

## 5. Canonical reads and consistency

Dashboard, attention badges, section totals and Member 360 must use shared definitions, not independently drifting frontend formulas. Prefer a compact canonical summary plus bounded domain/detail endpoints, NOT a giant all-data response.

Return actual scope/identity and freshness metadata. Distinguish response generation time from last business update time. A timestamp label alone is not proof of a consistent snapshot.

Related dashboard totals should come from a consistent query/batch boundary. Preserve read-after-write behavior. Direct D1 binding queries currently use the primary unless Sessions are used: do not enable read replication just for this task. If the code already uses replicated sessions, respect first-primary/bookmark consistency for operational reads.

Never calculate a global total from the currently loaded page. Paginate lists, return their filtered totals and explicit limits; Member 360 must not silently truncate “all history” into a falsely complete list.

New Admin member/detail/summary GETs must be read-only. Do not reuse self-Member endpoints that bootstrap a profile, grant Points, allocate a VS or track onboarding. Reuse pure projections and parameterized queries instead.

## 6. Live refresh — measurable, bounded behavior

Implement one small Admin refresh coordinator, not a timer per widget/module.

Stage 2 Free-tier amendment — 2026-09-08: at most THREE human admins. Default visible/authenticated/reachable operational cadence is **60 seconds**; a measured costly resource may use 120 seconds. Expensive aggregates/history use **300 seconds**, explicit opening and relevant invalidation. Another user's change converges on the next successful configured refresh (normally <=75 seconds for a 60-second resource). This is periodic polling, not instantaneous push or a connectivity guarantee. Both future dashboard presets inherit this policy; no 10/30-second mode without a new operator decision.

- On own successful mutation, use the confirmed response and immediately invalidate/refetch affected views; do not wait for the next poll.
- Refresh on focus, visibility return, reconnect, relevant navigation and `pageshow`, including bfcache restoration. Coalesce simultaneous triggers.
- Refresh compact summary plus the active workspace/open detail as needed. Do not fetch every Member 360 tab, every chart or SMTP2GO readiness on every tick.
- Stop periodic work when hidden, logged out, access-denied or known offline. Resume with revalidation, not a burst of missed polls.
- One in-flight request per resource/context; bounded retries/backoff with no busy loops. Respect Retry-After where applicable.
- Show “Aktualizováno …”, “Aktualizuji…”, “Data mohou být zastaralá” or “Bez spojení”. Never keep a misleading live/green indicator after failures.
- Failed refresh preserves last successful data with a stale label, not zeroes. No cached data means an explicit unavailable state.
- Under a dirty editor, update background counts but never replace typed fields. Indicate that newer server data exists.
- Re-evaluate time-dependent overdue states even if no row changed. MAX(updated_at) or admin_actions alone is not a reliable universal change feed.
- A cross-tab invalidation message may be used as a hint; do not transmit personal records/credentials or trust it as data truth. Polling remains sufficient without it.

Changing dashboard presets, widgets or chart ranges MUST reuse this coordinator: no timer per widget, chart or preset. Coalesce repeated metric requests. Slow analytical charts may have a documented longer refresh interval than operational summaries; show their own freshness rather than implying everything was refreshed together.

Document request AND scanned-row D1 budgets for 1 and 3 admins over 2/12/24 hours, plus six visible PC/phone contexts. Target at most three periodic data requests per context/60s across summary + foreground, and <=1,000,000 estimated/measured D1 rows read for representative 3-admin/12h use. Include OPTIONS, retries, search/detail/media, auth, mutation receipt/index writes and shared public/Member/provider traffic; label local estimates honestly. Pause obscured lists, fetch tabs on demand, never add polling writes. Report any unresolved row-budget gap before rollout. No WebSocket/DO/Queue/paid service requirement for this release. Keep the refresh interface replaceable by future push invalidation without replacing domain modules.

## 7. Request lifecycle, identity and stale responses

Each request captures:
`auth identity/session generation + selected event + resource/member ID + request generation`.

Before applying a response, confirm that captured context is still current. Use cancellation for obsolete GETs and a generation check as a second guard.

Required examples:
- A slow event-2026 response cannot overwrite event-2027 UI.
- Member A's late response cannot appear inside Member B's drawer.
- A pre-mutation GET cannot replace a newer confirmed post-mutation value.
- A request started by Admin A cannot retry with Admin B's token after account switching.

Use finite token, fetch and body-read deadlines; release loading states in finally. Reuse sound existing Member reliability primitives where possible without merging distinct auth policies.

GET retries may be bounded for transient network/502/503/504 failures. No blind mutation retry. The existing one-time 401 token refresh must preserve the initiating identity and mutation ID and never become a retry loop.

Keep states distinct: not requested / loading / fresh / stale / empty / unavailable / denied. Authentication failure is not a secondary-domain empty result.

## 8. Safe writes and concurrent admins

A disabled button is only UX, not duplicate/concurrency protection.

Audit and protect existing editable Admin domains: reservation approval/notes, recorded payment amounts, accommodation configuration, event settings, photo moderation, History/S&S review and dashboard preferences.

Use the simplest correct server-enforced optimistic concurrency contract: an expected resource revision or equivalent expected-state token. Enforce it atomically in the write predicate, not as SELECT followed by unconditional UPDATE.

- Every writer of relevant fields, including Member paths where applicable, must participate in revision/expected-state validity.
- Second-resolution timestamps alone are insufficient when two changes occur in the same second.
- A stale base returns a clear 409/412 response with a safe current representation/revision. Do not silently overwrite or auto-merge money, approval decisions or settings.
- Preserve existing capacity/concurrency predicates and enforce business preconditions again at commit time.
- Resolve the target from immutable request context, not whichever event/member happens to be selected when a late callback runs.
- Existing clients missing required preconditions must fail clearly and request an Admin refresh; do not leave an unprotected legacy bypass. Document rollout compatibility rather than silently weakening the contract.

Reuse existing audit/domain protections. Add a small D1 operation receipt mechanism only where needed for a durable outcome of local Admin commands. Avoid a general workflow engine.

For replayable local D1 commands, one stable operation ID is bound to initiating admin, operation, entity/event, base revision and payload fingerprint. Same key/same payload returns the original outcome without repeating effects; same key/different payload is rejected. Authorization is rechecked before returning protected results.

Business change, relevant Points/capacity effects, audit entry and success receipt must agree atomically. IMPORTANT: a conditional UPDATE affecting zero rows is NOT automatically a D1 batch error. Guard dependent statements so conflict cannot still grant Points, insert a success receipt or log a mutation that did not happen. Test this specifically.

Do not rebuild SMTP2GO send locking/reconciliation in this mechanism. External sends/R2 operations are not magically atomic with D1. Preserve their domain-specific safety and disclose ambiguous outcomes honestly.

## 9. Lost connection DURING save

Required mutation UI states:
`idle / dirty / saving / confirmed / conflict / outcome_unknown / rejected`.

If the request times out or the response is lost, the server may already have committed. Show:
“Výsledek uložení zatím nelze ověřit.”

Do not label this automatically as “neuloženo”, automatically re-send, roll back confirmed server state, or create a new operation ID.

Reconcile through an authenticated operation-status/read path. A transient absence of a receipt is not proof a delayed operation will never execute. Reuse the same operation identity for any permitted explicit retry.

Abort or navigation away cancels interest in a response, NOT an already-running database action. Preserve enough same-admin operation context across reload to check the outcome. On returning to the record, show reconciliation before offering another potentially duplicate action.

Only a confirmed server result may show “Uloženo”/“Schváleno” or a final paid state. An action succeeding followed by a summary refresh failing is “uloženo, přehled se nepodařilo obnovit”, not a failed save.

## 10. Back, reload and URL navigation

Use one canonical Admin navigation contract such as:
`admin.html?section=community&view=members&event=<id>&member=<id>&tab=<id>`.
Map legacy destinations. Validate allowlisted views and IDs. Do not place email search text, full Member records, secrets or QR tokens in URLs/history.

Define pushState versus replaceState intentionally. Back should undo the last in-app navigation/opened detail, restoring previous filter/page/scroll where appropriate; direct-entry detail close has a safe parent fallback rather than blindly history.back() out of the app.

- Opening Member 360 from a reservation must retain the originating reservation/list context.
- Do not pile up independent nested modals. One controlled detail/navigation stack.
- Popstate/Back never performs a mutation or replays Save/Send.
- Polling must not close a drawer, scroll to top, reset tabs or render settings fields again.
- On bfcache/pageshow return, revalidate access and data; do not treat the frozen DOM as current authorization/business truth.
- Dirty forms prompt for stay/discard before in-app exit/event change. No automatic save on navigation.
- beforeunload is a supplementary best-effort warning, not the only protection; mobile process termination may bypass it.

## 11. Offline editing and recovery

This release is NOT a full offline event-operation system.

When the backend cannot be reached:
- retain last known data visibly marked stale/offline;
- keep useful local navigation and explicit “Zkusit spojení” available;
- allow supported edits to remain local drafts;
- do not confirm payment, approve attendance, grant Points, submit scoring, mark check-in or send mail offline;
- never auto-submit business mutations merely because connection returns.

`navigator.onLine` is only a hint. Actual authenticated API responses determine reachability; do not permanently disable controls solely because a browser heuristic says offline.

Retain small draft deltas on input/debounce, not only when closing the page. Scope them by admin UID + event + entity + form + base revision. Prefer session-scoped storage, short expiry and graceful denial handling. Do not persist whole member databases, private photos, tokens or payment ledgers for offline use.

On resume: authenticate the same admin, fetch current record, compare base revision, then offer restore/discard. Preserve typed values but do not overwrite newer server data automatically. If storage is unavailable, show the limitation rather than blocking the app. Do not promise recovery after OS/browser deletion of storage.

Persist pending operation IDs separately from unsent drafts. A draft restoration is not authorization to submit. Clear identity-scoped client data on logout/access loss; never restore Admin A's work under Admin B.

## 12. Member 360 and canonical linking

Implement one Member list/search/detail module, with a compact global search reachable from every area.

Use immutable authoritative `memberId` as the link. Do not resolve ownership by nickname, email, shortened display code or guessed matching. Add missing member IDs to Admin DTOs where necessary. Historical/unlinked Mailing contacts must remain unlinked unless an actual relation exists.

Search supported name/nickname/email/full member code and useful car labels with server limits, debounce and stale-response guards. Do not download the entire community into the browser.

Every real member reference should open the same detail: reservations, payments, moderation, history/S&S, Points rows, cars, Members, linked Mailing contacts and later merch.

Desktop: right-hand drawer with underlying context preserved.
Mobile: full-screen detail with clear Back/close, reachable tabs and sticky compact identity/action context.

Member detail is READ-ONLY by default; jump to existing authorized domain editors instead of creating a second edit implementation.

Include currently authoritative data:
- full identity/member code/status;
- selected-event registration, crew, stay/accommodation, relevant car/S&S and finance state;
- all cars and authorized photos;
- history/claims/S&S, current Points/rating/achievements using current semantics;
- community photo states;
- currently supported finance sources with selected-event versus all-history scope;
- actual Mailing linkage/suppression and existing delivery history where supported.

Load sections on demand with independent freshness/error states, pagination and complete counts. One missing domain must not hide the identity or fabricate zero history. Do not include a fake Merch/entry/scoring section when the backend does not exist.

A Member is not the same entity as their car, reservation or event. A member may own several cars and participate in several years.

## 13. Private Admin detail/media authorization

Every new Admin read/write/search/QR/media endpoint uses existing active-Admin authorization on the SERVER. Frontend hiding is not authorization.

Escape user-supplied names, nicknames, notes and captions in HTML; validate IDs/links and use parameterized SQL. Test untrusted text in the new search/detail surfaces. If conditional/idempotency headers are added, narrowly update the existing CORS allow/expose headers and test cross-origin preflight; do not weaken the origin policy.

Member 360 must not impersonate another Firebase UID or loosen existing owner-private Member endpoints. Add narrowly scoped Admin read/media projections where necessary; verify media-to-record relations before private streaming.

Do not expose R2 keys/publicize the bucket or call an external image/QR service. Keep sensitive responses private/no-store, release object URLs on close/reset/logout, and reject late responses after identity changes.

On 401, bounded same-user restoration may run. On definitive 403/access loss, hide protected data, stop refresh and clear private state. A secondary 503 should not be handled as logout. Never log credentials, QR payloads, full provider bodies or personal records merely for diagnostics.

## 14. Unique Member QR foundation

Provide every current and newly created Member a stable unique QR identity. First inspect any already-issued implementation; preserve existing valid identities or report an actual incompatibility before replacing them.

For new tokens use server-generated cryptographic random bytes (at least 128 bits) and a DB uniqueness constraint. Never derive it from email, Firebase UID, shortened member code or mutable attributes. Generate once; ordinary profile edits/logins must not rotate it.

Use the agreed versioned payload, e.g. `E36U1:<opaque-token>`. No embedded name/email/payment/event state. This is pseudonymous identifying data, NOT a password, ticket, payment proof or entitlement.

Targeted one-time provisioning for current Members and generation for future Members are in scope; no broader legacy backfill. Design a safe local-tested migration/provisioning path without read-side token creation, destructive member replacement or changed member codes. Do not make optional tables depend on deleting/recreating existing Members.

Render QR locally with the already-vendored QR generator where suitable; high contrast, quiet zone and readable size. Test actual decoded payload, not just presence of an SVG. Show on Admin Member 360 for now; no unsolicited prominent Member Portal feature.

Admin-only resolver accepts a strict versioned payload in a POST body and returns the canonical Member target. Global search may pass pasted QR to it without putting the raw token in URL/logging. Do not return every member's QR token in list/search DTOs.

Scanning/resolving only opens Member 360. Future check-in/merch/S&S actions must explicitly choose event and, where relevant, car/order/reservation and revalidate live server state. A copied QR cannot authorize those actions. QR remains stable across years; do not associate it permanently with one reservation.

No camera integration, full offline scanner, scoring rules, reissue UI or check-in mutation in this release. Keep one documented resolver interface for those later features.

## 15. Dashboard and personal preferences

### 15.1 Fixed context, personal content

Three layers remain:
1. Compact selected/current-event context, date/venue/registration state and visible data freshness.
2. Fixed Attention Center.
3. Personal dashboard composition: optional KPI/chart widgets and quick links.

Keep search reachable throughout Admin. Do not rebuild it inside every dashboard layout.

The approved dashboard must be a place to understand the event and reach the right work, not a wall of equal cards. Four primary KPI positions in the default Preparation composition are enough. Other metrics remain available in the catalog.

### 15.2 Two editable starting compositions

Provide TWO named starting compositions over the SAME data/components:

- **Příprava srazu** — management, reservations, accommodation and finance; larger graphs.
- **Na srazu** — member lookup, a few practical shortcuts and compact operational status; graphs below the quick-work area.

These are layouts, NOT roles, separate applications, different permissions or different metric definitions. Selecting “Na srazu” must not enable check-in/scoring/scanning functionality that does not exist.

Use Příprava srazu as the initial composition for an admin with no saved preferences. Switching is explicit. Do not switch automatically based on event date, screen width or registration state. Phone layout is responsive regardless of which composition is selected.

Each admin can customize BOTH compositions independently. Save each composition's ordered widgets, supported sizes and quick links. Returning to a composition restores that admin's saved customization, not the factory defaults. An explicit reset affects only the selected composition and requires confirmation when overwriting saved work.

The last selected composition may be remembered as a preference; it is not a live shared control that suddenly switches another already-open device. Apply server preference changes safely without overwriting an active local preference editor.

### 15.3 Default Preparation composition

Visual order:

1. Compact event context / member search / freshness.
2. Attention Center.
3. Four compact KPI widgets:
   - Rezervace — state population explicitly defined in the data map;
   - Osoby — sum of people for the defined active/confirmed population, not number of accounts;
   - Evidovaně uhrazeno — accurately scoped recorded paid amounts;
   - Zbývá uhradit — sum of per-record outstanding obligations in the defined actionable scope.
4. A wide reservation trend and accommodation occupancy by type.
5. Financial breakdown plus a smaller attendance/S&S overview where data exists.
6. Additional user-selected widgets.

The four KPI widgets are DEFAULT selections, not compulsory cards. The event context and Attention Center are the fixed elements. Do not make total Members, Mailing, Planner or every moderation count another compulsory KPI row.

Money KPI scopes can differ legitimately: all recorded received amounts may include cancelled reservations, while actionable outstanding obligations may exclude them. Label this, expose definitions and matching drill-downs, and do not imply one aggregate is obtained by subtracting the two cards.

### 15.4 Default On-site composition

Put member search and up to four useful quick links immediately within reach. Keep Attention Center prominent and operational summaries compact. Retain accessible graphs lower down rather than deleting them.

Offer only existing actions: member/reservation lookup, recorded-payment verification, photo/Club moderation and existing S&S review. No fake QR-scan, check-in, score-entry or merch-pickup action.

On mobile, prioritize search, identity, status and practical actions in BOTH compositions. Wider graphs use the available width; do not shrink a desktop dashboard into four narrow columns. Choosing a phone viewport must not rewrite stored desktop layout coordinates or reorder the persisted composition.

### 15.5 Attention Center: actionable, honest and stable

Attention counts must be complete and fresh enough to support “Všechno vyřízeno”. If one queue is unavailable, show uncertainty instead of a global all-clear. Preserve visible global moderation versus selected-event operational context.

For each real attention category show its count, a concise reason and, where the source provides a reliable timestamp, oldest pending age. Do not use last arbitrary update time as the start of waiting. No fabricated SLA/deadline/urgency model.

Ordinary not-yet-due payment, overdue payment and overpayment are not interchangeable red errors. Reflect current validated action rules; do not introduce new business deadlines.

Link directly to the exact filtered workspace. Do not label the sum across overlapping payment/reservation/photo/history categories as a unique number of people or “problems”. If a combined number is used anywhere, define the unit explicitly and test overlap handling.

Do not add bulk approval/paid actions to the dashboard. It leads to the existing authorized contextual editor. Refresh may update counts; do not move a control under an active pointer/touch or steal focus to re-sort priorities.

### 15.6 Optional widget catalog

Base the catalog on REAL implemented data. Each widget declares a stable ID, label, metric definitions, scope, supported size, empty/error state and exact drill-down.

Possible widgets:
- total/active Members and genuine member creation trend;
- reservations, people, cars, reservation trend and status distribution;
- recorded paid/outstanding/overpayment values and confirmed accommodation occupancy;
- planned attendance/arrival mix and declared S&S interest;
- Community moderation;
- stored Mailing delivery performance when actual sent-campaign data exists;
- the existing Weekend Planner funnel, OPTIONAL and NOT selected in either factory composition.

No unsupported cash-flow, entry, merch, actual check-in, judging scores or survey-response charts. No invented historical series from current-state snapshots. Missing capability and empty data are different states.

### 15.7 Personal quick links

Allow up to FOUR optional quick links per composition. Use the same canonical navigation/drill-down target registry as Attention Center and charts.

Start with supported targets such as payments requiring attention, pending photos, reservations and Members. Store only allowlisted destinations/filters, not arbitrary external URLs or raw personal searches. Do not build another nested menu or separate quick-action permission system.

Links navigate; they do not mutate data. Hide unsupported future capabilities rather than offering nonfunctional scanner/scoring buttons.

### 15.8 Recent changes — optional, source-dependent

A small optional “Poslední změny” widget can show a bounded set of relevant real audit entries, with an authoritative timestamp, clear action label and canonical member/entity link where available.

Use it ONLY if existing audit data and the core mutation work support a compact, honest projection. Label the actual coverage (for example Admin actions), not “all activity” if Member/provider events are absent. Do not invent timestamps, backfill events or build a universal changelog solely for this widget.

This is lower priority than truthful main graphs. It is not a deployment blocker if unsupported; document its absence. Use the shared refresh coordinator, not another timer.

### 15.9 Persistence and editing

Personal configuration lives in a small `admin_preferences` model keyed by server-authenticated Admin UID, with schema version/revision. Store configurations for both compositions with stable widget IDs, order, compact/wide choices and quick links. A single JSON record per admin is sufficient if coherent with the implementation.

Support show/hide/reorder, practical supported sizes, reset active composition, explicit Save and Cancel. Prefer accessible up/down controls over complex drag/drop. Do not automatically save every move as an independent network mutation.

Keep the same logical preferences across devices with responsive rendering, not absolute pixel coordinates. Preference edits must not overwrite another tab's newer config silently; use Task 1's revision/conflict behavior.

Unknown future widget IDs must not break loading. After network failure, show local unsaved settings or a clearly provisional default; never overwrite server preferences with defaults. Dashboard configuration changes PRESENTATION, never financial truth, event selection, authorization or saved operational filters.

## 16. Graphs, visual refresh and interaction

### 16.1 Approved visual direction

Keep E36's dark graphite automotive identity, slightly lighter working surfaces and restrained blue/silver accents. Preserve attractive graphs, compact strong numbers and clear status badges. Reduce decorative hero height, dead spacing, competing card borders/glows and unnecessary repeated introductions.

Use varied hierarchy: a wide primary trend, medium occupancy/finance cards and compact KPI/supporting cards. Do not make all widgets equal-sized. Keep photographs primarily in Member 360, Garage and moderation, where they help identify content.

Do not turn Admin into a sterile ERP, a generic corporate panel or a public landing page with data fields.

### 16.2 Choose charts for the question

| Purpose | Preferred representation | Truth requirements |
| --- | --- | --- |
| Reservation development | Line for cumulative recorded submissions; optional period bars | Genuine creation/submission timestamps; clearly distinguish cumulative created from current active reservations |
| Accommodation by type | Horizontal bars/progress | Confirmed units versus waiting demand separate; capacity denominator has the same unit; unlimited is not 100% |
| Finance | Explicit values plus comparable bars/progress | Recorded paid, active due/outstanding and overpayments have labelled scopes; cancelled paid remains accessible |
| Reservation statuses | Compact stacked bar with counts | Clearly defined disjoint statuses in one population |
| Planned attendance | Simple bars | Planned crew/person/reservation unit is declared; not actual arrivals/check-in |
| S&S interest | Small bar or simple ring | Declared interest, not competition entries or scores |

Avoid filling every card with a donut. Use simple native SVG/CSS or an existing small local helper; no heavy chart framework.

For a payment completion bar, use applied-to-obligation paid amount and per-record outstanding for the same active obligations. Show overpayments and paid amounts outside that scope separately. Do not stack all recorded cash plus outstanding as though their sum were the active amount due.

Do not call an updated-at/current-state-derived series historical cash flow. If a source lacks the required genuine timestamps/history, omit the chart or show a clearly named current-state representation.

### 16.3 Range controls and exact chart data

Provide a simple chart-specific range control for trends, e.g. 7 dní / 30 dní / Celý ročník, only where meaningful. It affects that trend and its own drill-down, NOT all dashboard totals or older outstanding debts. Make selected event, range, unit and time zone clear.

Provide “Zobrazit data” for graphs: exact values used to render, units/scope and a concise definition. This is a bounded table/expandable view, not a new export/reporting platform. Values and accessible text summary must match the plotted data, including zero/missing distinctions.

Use readable axes/direct labels where practical. Do not require hover for meaning or action; support touch and keyboard. Handle long Czech labels, no data, one point, missing capacity and narrow phones.

### 16.4 Direct, predictable drill-down

Clicking a meaningful series/category opens the correct FILTERED operational view, using the same metric population and event/range where applicable. Examples: pending reservations, outstanding payments, accommodation option's reservations.

No silent cross-filtering of the entire dashboard when clicking one chart. A chart is navigation to explicit detail, not a hidden global filter machine.

Metric card / chart / Attention Center / quick link share one destination contract. Browser Back from destination, and from its Member 360 detail, restores the source composition, chart range and scroll/list context. Navigation itself must never save/approve/pay/send.

Only show a drill-down as actionable when the destination can represent its filter accurately; implement the necessary narrow filter support or make the missing detail capability explicit.

### 16.5 Calm visual refresh

Reuse the central refresh/data lifecycle. Keep existing cards and focus stable while fresh values arrive; no full-page skeleton, rebuilding all widgets, number count-up animation or reanimating graphs from zero every tick.

A changed value may receive a short subtle highlight, respecting reduced-motion preferences. Do not rely on animation/color for status. Avoid touch-target movement during interaction, resize loops and chart flash/reflow.

Freshness examples: “Aktualizováno před 8 s”, “Aktualizuji…”, “Bez spojení · poslední data 14:32”. Never describe periodic polling as instantaneous live push. Graphs that refresh less often expose their own age.

Keep the existing view during a failed refresh, visibly stale; do not display a green all-clear or synthetic zero. Refresh cannot overwrite a dirty dashboard configuration, event form or opened record editor.

## 17. Operational screens and mobile event use

Unify title/context → status tabs → search/filters → list/detail.

Desktop may use dense readable tables. Mobile uses concise cards/rows for essential identity, state and actions, not a wide desktop table as the only route to work.

Reservations/Ubytování/Platby stay together. Member identity is always reachable. Existing payment editing remains the recorded total semantics, not an invented “add bank transaction” action. Do not add entry/merch filters until those sources exist.

Komunita separates Členové, Fotky and United Club; preserve existing moderation and distinct-claim counting. Current S&S review works on mobile with photo/context close to controls. Actual live judging is separate unless already implemented; do not invent scoring scales/formulas.

Touch targets around 44px where practical; respect phone safe areas/keyboard, accessible dialogs and focus return. Refresh cannot reorder a control out from under the operator's tap. Freeze the relevant interaction context while acting.

Settings retains existing event configuration only. Do not create unsupported settings or silently write defaults for untouched fields, especially NULL/unknown values.

## 18. Extension boundaries

Keep `admin.js` and `worker/domains.js` as composition, not new monoliths. Use small cohesive Admin data/refresh/navigation/command/member/dashboard modules.

Define practical shared contracts for:
- member links and Member 360 sections;
- metric/widget definitions with scope/freshness;
- payment-source adapters;
- mutation result with committed identity/revision and affected-resource invalidation;
- QR lookup.

Do not build a generic plugin framework or event-sourcing system. New merch/entry/S&S modules should register their concrete adapter and use these boundaries later.

Refresh invalidation must include writes from OTHER origins: Member uploads/claims/reservations, another Admin and SMTP2GO webhooks. Do not watch only local Admin actions. Poll stored D1 delivery projections; never call SMTP2GO repeatedly for a dashboard tick.

Preserve current SMTP2GO transport, secrets, 200/day configured guard, survey live-send block, suppression, recipient/HTML snapshots and ambiguous-send protection. No provider calls or real messages in tests.

## 19. Schema and migration discipline

Use a small number of coherent NEW forward-only D1 migrations. Do not force one giant migration or one migration per trivial change. Document dependencies/order.

Likely needs: Admin preferences, QR field/index/provisioning and minimal revision/operation-receipt support where existing schema is insufficient. Reuse existing audit/history protections; justify each addition.

Do not edit deployed migrations or run schema.sql against production. Respect remote D1 transaction syntax constraints; test the exact migration against the current existing schema and data fixtures, not only an empty SQLite DB.

No general history reconstruction, Points/refund correction, deletion/reset or consent remapping. Existing production users are real data; earlier clean-test-system decisions are not authorization to erase them.

Keep read-only production audit truly read-only. Opening an endpoint with automatic writes is not a read-only substitute. Testing writes uses synthetic local fixtures.

## 20. Required failure/race tests

Use independent fixture expectations and delayed/failing network responses. Include at least:

1. Two admins edit the same payment from the same base: one succeeds; the other sees conflict, no lost update.
2. Save commits but response is lost: reconciliation reports success and no duplicate business/audit/Points effect occurs.
3. Save never reaches the server: no false success; a deliberate same-operation retry follows the documented policy.
4. Same operation ID with a different payload is rejected.
5. A failed CAS causes NO audit-success receipt or dependent Points grant.
6. Back/reload during save does not repeat the mutation; pending outcome can be recovered.
7. Dirty form survives refresh/navigation recovery without being silently replaced; a conflicting draft cannot auto-save.
8. Slow event/member/identity response is ignored after context switching; token refresh cannot switch actors.
9. Reconnect/focus/pageshow/back restores correct route and revalidates data without repeating listeners/timers.
10. Offline/stale lists remain clearly labelled; no “all clear” from a failed dependency; no queued financial send on reconnect.
11. Another browser changes a record; visible list, Member 360, counts and graphs converge within the configured refresh interval. Hidden tabs do not poll.
12. Auth revoked/logout/another login clears private data and drafts and rejects stale replay; bfcache return rechecks access.
13. Member 360 links from reservation/payment/photo/Club/linked Mailing resolve by the same member ID, including duplicate names/different emails and unlinked legacy contacts.
14. Metrics handle cancelled paid reservations, overpayments, pending versus confirmed occupancy, multi-component history claims, pagination and time-bound overdue changes.
15. Preferences are per Admin, versioned and responsive; network failure does not reset them.
16. QR uniqueness/stability/provisioning, decoded payload, Admin-only resolver and no side effect on resolve.
17. Member/private-media ID mismatch fails without exposing another resource.
18. All existing Member, Mailing, capacity, pricing, payment and Points regression suites remain valid.
19. Preparation/On-site compositions save independently per admin; switching never discards customization, changes another device unexpectedly or enables unsupported actions.
20. Factory Preparation has four compact primary KPI selections; Planner is optional and absent from both factory compositions. Quick links use validated destinations and never mutate.
21. A chart range changes only the intended chart. Money/attention totals and older obligations remain in their declared scope. Chart data table matches the drawn values.
22. Chart/category/Attention/quick-link drill-down retains exact scope/filter; Back from Member 360 and the destination restores composition/range/scroll without executing a write.
23. Periodic refresh changes values without remounting the dashboard, resetting graph ranges, overwriting dirty preferences or moving a focused/touched control. Switching compositions creates no duplicate timers.
24. Failed/partial attention loading cannot show all-clear; overlapping categories are not presented as a unique-member count. Oldest pending age uses a verified source timestamp.
25. Missing/unsupported graph sources are honest; recent changes show only real covered audit entries, never a fabricated complete activity feed.

Do not retain old assertions that explicitly conflict with requested new navigation/behavior; replace them with stronger documented expectations, not silent deletion. No hardcoded mock totals masquerading as production truth.

Chromium: complete existing suite plus focused Admin scenarios.
WebKit: retain existing coverage and add focused Back/dirty/offline/dialog/session cases where browser behavior matters. Do not claim physical iPhone validation from desktop Playwright alone.

Visually inspect desktop (~1440px) and mobile (~390px), including long data, loading/stale/conflict states, keyboard-open forms and drawer/back behavior. Include screenshots without personal data/secrets.

## 21. Four separately invoked local tasks

Do NOT execute all stages from this contract alone. The operator supplies a stage prompt to authorize exactly one stage. Within that stage, implement the agreed scope rather than returning only another plan.

1. **Data truth and safe operations** — commit:
   `fix: establish truthful admin data and resilient operations`
   Data map, independently checked canonical projections, request/refresh lifecycle, conflicts/receipts/reconciliation, dirty-state foundations, existing-screen integration and tests. No Admin v2 dashboard redesign, QR or Member 360 feature yet.
2. **Member 360 and QR** — commit:
   `feat: add canonical admin member detail and QR identity`
   Member IDs/links, list/search, drawer/fullscreen, scoped reads/private media, QR and tests. Use Stage 1 safety/navigation foundations; do not invent a second editor/scanner.
3. **Dashboard, charts and navigation** — commit:
   `feat: add configurable admin dashboard and grouped navigation`
   Five-area IA, Settings relocation, both personal compositions, charts/data/drill-downs, Attention Center, quick links, preferences and tests. Implement desktop AND mobile layouts now, not only at Stage 4.
4. **Cross-domain mobile and recovery acceptance** — commit:
   `feat: finish responsive admin workflows and recovery UX`
   Remaining operational-page consistency, integrated Back/draft/offline/concurrent-admin cases, visual/touch review and final documentation. This is not permission to defer working mobile controls or safety from earlier stages.

Each stage ends with its local commit, validation and a report. STOP; do not begin the next stage, push or deploy without a new instruction.

### Checkpoint handoff

Task 1 saves the exact shared product contract as `docs/admin-v2-implementation-contract.md` and creates `docs/admin-v2-progress.md`. The latter records initial origin baseline, stage start SHA, completed scope, tests, migrations/order, verified results and limitations. Final commit SHAs are reported after commit; do not attempt to commit a file containing its own final commit hash.

Tasks 2–4 read both documents and relevant implementation files first. Require a clean local tree at the preceding reviewed stage. Local main being 1/2/3 commits ahead of the captured initial origin is EXPECTED. Fetch and verify that origin has not unexpectedly changed; never push, reset or rebase merely to make HEAD equal origin again. Unknown/divergent work is a narrow stop-and-report condition.

Keep each stage internally usable, coherent and tested against the latest LOCAL schema. Apply NEW migrations in order only to local fixtures; do not reapply one-time ALTERs blindly or fake idempotence. Document any old-open-client incompatibility for later rollout.

No production rollout authorization is implied. No full provider/account audit or new SMTP2GO activation is required to continue Admin work; only avoid concurrent unfinished repository/rollout changes.

## 22. Completion report and acceptance gate

After each task run the current complete Node, syntax, Chromium, focused WebKit, import-cycle and exact migration/FK checks relevant to the resulting tree. Report actual counts, failures and untested conditions honestly. Preserve unrelated regressions; replace only assertions directly superseded by authorized new behavior.

Each stage report includes starting/final HEAD, new commit SHA, clean/ahead state, completed work versus deferred later-stage scope, tests, migrations and blockers. No external write is implied by passing tests.

Final Task 4 report consolidates:
- initial/final HEAD and four local checkpoint SHAs;
- confirmed old-code problems versus hypotheses; metric definitions and independent reconciliation;
- production read audit coverage/limitations, if any;
- actual refresh intervals, stale behavior, request/query budget and other-admin convergence;
- concurrent-edit/operation-receipt mechanism and lost-response test results;
- Back/bfcache/offline/draft/auth-loss behavior and limitations;
- five-area IA; both factory compositions and independent personal preferences;
- four-KPI default hierarchy, widget/quick-link catalog, chart types/ranges/data tables/drill-downs;
- Attention semantics, optional recent-change coverage and calm-refresh behavior;
- mobile screenshots with synthetic data, touch layout and desktop readability;
- Member 360 data/links/private media and unsupported future domains;
- QR generation/provisioning/stability/payload/resolver, actual decoding test and no authorization-by-QR;
- migrations/order and compatibility plan for old open clients;
- full regression results and explicitly changed assertions;
- no push/deploy/production writes/provider changes/emails/real-contact import.

Update `docs/admin-v2.md`, `docs/admin-v2-data-map.md` and the progress document concisely. Record actual limitations, not universal guarantees.

Do not close Admin v2 with only a beautiful dashboard. It is complete only when stale data, competing admins, a lost save response, responsive Member detail and browser Back have deterministic tested behavior.
