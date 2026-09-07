# Production feedback pass

Starting checkpoint: `6b2a87bbf8641f55b87c6d3d4e07748869e073ed`.
Implementation is local only. No rollout date has been set.

## Evidence and reliability

The reported Safari incident cannot be uniquely diagnosed without the affected browser's request/error log. It was **not reproduced against the real user's account**, and no Safari-specific Firebase defect is claimed. Public production was inspected read-only; authenticated scenarios use local fixtures.

Confirmed source failure paths:

- `/api/me` and bootstrap are critical identity/authorization dependencies. Inactive/blocked/suspended identities remain blocked. Secondary 401/403 responses also remain blocking.
- Reservation and Club failures previously rejected the complete startup `Promise.all`. Garage failure became `[]` and looked empty. Gallery and Planner had partial local fallbacks.
- Garage, reservation/payments, saved Planner, Club and Photos now have explicit unavailable/retry states. The shell/account remain usable. Actions depending on unavailable Garage/reservation data are withheld; a valid local handoff remains visible if only saved-draft synchronization fails. Overview does not report unknown data as zero/empty/“everything ready”. Retry reloads the affected domain.
- GET JSON/media requests retry **once**, after 250 ms, only for network failure or 502/503/504. POST/PUT/DELETE are not transient-retried. Existing one-time forced-token 401 recovery remains, but cannot switch to another user's identity. Token acquisition and network/body reads have 20-second deadlines; upload is not silently replayed.
- Image compression lacked decode-error handling, protected canvas callbacks and a deadline. Every reader/decode/context/toBlob/timeout path now settles; 15-second compression timeout and network deadline restore busy state. Failed photo upload keeps the modal, selection and saved car ID for retry (no second car creation). Private object URL ownership/cleanup stays unchanged. Inputs remain JPG/PNG/WebP, maximum 12 MB; no untested HEIC promise.

## Registration

Firebase `email_verified` was synchronized, not an access gate in Member, Admin, bootstrap or reservations. Automatic verification email and its misleading copy are removed; password reset and verification-field synchronization remain. Registration retains the Firebase session and opens the requested section instead of signing out and demanding another login.

`member_onboarding` is written only from authenticated Firebase identity. Seen/profile/portal timestamps are first-write/idempotent; profile completion is verified against D1, not trusted from a client flag. Bootstrap updates a previously observed onboarding row. Tracking failure does not invalidate login or a successfully saved profile.

**Incomplete registration = forward-observed Firebase identity with no successful D1 Member profile completion.** Car count, history completion and photo count are not registration heuristics. An existing identity may first be observed after this release; the seen timestamp is not its original Firebase creation date. Failed tracking requests cannot be counted, so this is operational observation, not an exhaustive Firebase-user census.

## Links and handoff

Canonical contract: `member.html?section=<id>`. Allowed IDs: `overview`, `reservation`, `garage`, `payments`, `club`, `photos`, `account`. Unknown IDs fall back to Overview; legacy `panel` remains accepted when `section` is absent, and `history`/`rewards` alias Club. Navigation updates the query without duplicating the navigation system. Login, registration and reload retain the target.

| Audited source/action | Target |
| --- | --- |
| Public Planner final login/register/continue | `section=reservation&draft=<uuid>` plus encoded fallback; same tab, once |
| Header “Můj United” (home/about/gallery/merch/Admin) | Overview, generic entry |
| Public Gallery login/upload prompt | Photos (corrected) |
| Merch Points/member-benefit prompts | Club (corrected, including legacy `panel`) |
| Member hero and Add/Edit Garage actions | Garage, existing car modal |
| Action Center reservation / waiting-plan / payment actions | Reservation or Payments, existing target |
| Member sidebar/mobile menu Photos, Account, Club/Points | Respective canonical section |
| Member history / rewards aliases and contextual help | Club; existing in-section help remains |
| Public “Chci jet” / “Naplánovat” / next-event CTAs | Public Planner first, then reservation handoff |

The old public flow opened a new tab and passed an unused `panel=reservation`; restore then unconditionally selected Overview. Final handoff now navigates once in the same tab. The draft is persisted before navigation, carried in the fragment as fallback, and applied before selecting Reservation. If localStorage refuses the draft, the fragment is retained across reload rather than being discarded. An explicit new handoff takes precedence; an ordinary section link is not hijacked by a saved server plan. Existing-reservation keep/apply choice remains intact.

## Forward-only funnel

One additive migration: `db/migrations/2026-09-07-production-feedback.sql`. Apply during a separately authorized rollout **before** the new Worker. It adds `public_planner_handoffs`, `member_onboarding`, indexes, and optional `events.venue_name`. The venue column is included in commit 1 so commit 2 needs no second migration. Earlier migrations and production data are untouched. Local SQLite schema/application checks include `PRAGMA foreign_key_check`.

- Public `POST /api/planner-handoffs`: bounded JSON (4096 bytes), validated draft/event, unique draft ID, no anonymous name/email. Best-effort keepalive POST never waits on analytics before navigating. Duplicate creation does not overwrite the original plan.
- Protected `POST /api/planner-handoffs/claim`: existing active-member guard; claim/open timestamps are idempotent and another member cannot steal a claimed draft. Valid legacy local drafts may create their row here.
- Reservation conversion is an optional post-success linkage, scoped to draft owner, reservation owner and event. A server-owned saved draft is captured before its existing consumption, so a fast reservation submission can close the race with delayed tracking. Analytics failure cannot roll back a successful reservation. Existing reservation batch, prices, snapshots, capacity, payments and variable symbols retain their behavior.
- Authenticated `POST /api/onboarding`: identity only from verified Firebase token. Admin-only `GET /api/admin/funnel` provides counts and at most 50 recent entries per detail list.
- KPIs: all D1 Member accounts; global incomplete registrations; event-scoped created, opened/claimed, unclaimed, converted, and claimed-without-reservation plans. A converted plan counts once even when a reservation is later edited. Opening/claiming is the same Member action, not two invented funnel stages.
- Drill-down: incomplete email/seen time; claimed member email plus plan metadata; unclaimed anonymous metadata only. The existing event selector scopes Planner counts; Member/onboarding totals are explicitly global.
- **Measurement starts at deployment, not at an invented historical date.** No backfill, no inference from old reservations, no Firebase enumeration. Best-effort failures can undercount. Metrics retain first observed claim/conversion timestamps if linked operational records are later deleted.

## Admin attention

Existing History counts already include both attendance and S&S, and review already reloads counts. The confirmed gaps were lack of refresh while Admin remained open and the opaque “Fotky” navigation label. It now reads “Fotky a historie”; focus/visibility and a visible-tab 60-second refresh update authoritative counts without replacing an in-progress moderation editor. Existing post-review refresh remains immediate. Counts are **pending claim rows**, not the sum of component decisions: one row with attendance and S&S pending still counts once.

## Validation and scope

Focused Node tests cover failure classification, timeout/retry, image failures, strict/idempotent tracking, ownership, conversion, migration and event-scoped counts. Chromium adds deep links, registration, storage fallback, upload retry and Admin funnel/moderation regressions. WebKit runs only `feedback-member.spec.mjs` (login/restore/handoff/secondary failure/retry/registration/upload/storage), not the entire Chromium suite. CI installs both engines and runs separate projects; `pnpm test:e2e --project=webkit` is also locally runnable.

Old assertions for unconditional Overview and visible Garage-empty content after failure were replaced with stronger assertions for the **explicitly requested changed behavior**, not deleted to mask regressions. All unrelated assertions remain. Mailing, Points, pricing and payment tests remain in the full regression suite. No new dependencies, email delivery, contact import, production writes, push or deploy.

## Mobile UX

The second local commit will contain the separate homepage/S&S/mobile-navigation presentation changes and their responsive tests; it does not require another migration.
