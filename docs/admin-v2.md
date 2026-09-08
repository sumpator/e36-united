# Admin v2 — Stage 1 foundations and Stage 2 Member detail

The historical Stage 1 foundation is recorded first; the dated Stage 2 section below adds Member 360/QR and supersedes its cadence/budget. Shared contract and data map remain authoritative. Stages 3–4 are not implemented; the Stage 2 Free-tier budget remains an unresolved rollout gate.

## Architecture / current contracts

- `worker/admin/summary.js`: compact selected-event finance/reservation/occupancy + global Community summary, one primary SQL statement. `GET /api/admin/summary`; existing `/api/admin/overview` now routes to the same projection. No VS/onboarding/Points/provider writes.
- `worker/admin/lists.js`: parameterized counterparts of existing reservation/payment filters; bounded reservation list + exact count + status counts in one batch. Default 50 / max100; requested page and total explicit. `id` can load one existing reservation even outside the current list page. Gallery default50 and global status counts; History retains its existing max50 pagination and claim semantics.
- Existing Admin DTOs carry canonical member/event/source identities and the source revision. Authentication still verifies Firebase and active Admin role on every command, summary, list and receipt read. No member impersonation.
- `worker/admin/commands.js`: narrow adapter around one existing local domain batch, not a provider/job engine. Covers reservation status/notes, recorded payments, event settings, accommodation config/create, gallery moderation and History/S&S review.
- `admin/request-client.js` + `admin/api.js`: captured user object/session generation/event, no-store, cancellation, finite token/fetch/body deadline (20s per attempt), one forced-token 401 retry under the same user only, one transient GET retry with capped Retry-After, no automatic mutation/network retry. Same-context GETs coalesce; authorization loss clears private UI.
- `admin/refresh.js`: one timer/context, coalesced lifecycle triggers, generation invalidation, independent failures. `admin.js` composes summary + current workspace + optional open reservation detail, not all domains at startup.
- `admin/editors.js`: before-input baseline capture; dirty/saving/conflict/unknown states; minimal same-admin session drafts, pending operation identity separate; guarded current editors.
- `admin/navigation.js`: current seven allowlisted destinations; selected event/reservation IDs only in URL. Push for navigation/detail, safe parent replace for direct entry, Back restores saved non-personal filters/page/scroll. Search text is never put in URL/history by navigation. Open reservation identity is part of the refresh generation; delayed prior-record responses are ignored. An opened record remains available from its last successful projection even when it leaves the loaded list page. Event changes clear event-scoped projections and keep existing settings inert until fresh hydration, so a failed new-event read cannot reuse old-event values. Same-event failures retain their prior successful data. New five-area IA remains Stage 3.
- `admin/lists.js`: current list pagination/filter request contract. `admin-safety.css`: small readable/sticky operational status affordances, not a new dashboard.
- All Admin native-module cache versions move together to prevent mixed state/editor module instances. No frontend dependency/build system change.

## Atomic write / recovery contract

Send `If-Match: <source revision>` and `Idempotency-Key: <stable UUID>`. Missing/invalid preconditions return 428 before executing the domain. Stale revisions return 409 with safe current entity/event/revision metadata. A conflict is never automatically merged.

A sidecar version row is incremented atomically with its expected revision. Its success assertion, original domain statements, primary-row-changed assertion and durable success receipt are one D1 batch. SQLite CHECK constraints deliberately abort the whole batch on zero-row CAS or primary mutation, before dependent audit/Points effects. Original capacity predicates and Points statement order remain in place. A no-op gets an explicit durable receipt without inventing audit/Points effects.

Source INSERT/UPDATE/DELETE triggers on reservations, allocations, options, events, gallery and history advance relevant versions for all writers (including Member writes). Revisions may advance more than one step per command; clients must treat them as opaque monotonic tokens, not assume +1. Event settings share a conservative global revision because switching CURRENT touches another event. Accommodation create uses the parent's catalog revision; its receipt identifies the newly created option. No second-resolution timestamp is used as CAS.

Receipt is bound to authenticated actor, operation, requested target/event, base revision and SHA-256 of method/body. Same ID + same payload returns the original committed identity/revision/status without repeating effects; same ID + different payload/actor is rejected. Receipt status endpoint is actor-scoped and Admin-authorized. No raw body/token/provider secret is stored in D1 receipts.

`GET /api/admin/operations/:id` returns confirmed metadata or outcome_unknown. Absence is not proof an in-flight request never reached the server. No negative acknowledgement is fabricated. The UI reconciles before new work; an explicit retry uses the SAME ID/body/base. Timeout/abort/navigation cancels response interest, not a server transaction. Save success followed by failed refresh remains a confirmed save + stale overview.

Member history resubmission now rechecks locked states in the commit predicate and aborts before replacing evidence if a concurrent review won. It does not change which states are eligible or any attendance/S&S/Points policy.

## Draft / navigation behavior

Small field deltas are session-scoped to Admin UID + form/entity + event + base revision, two-hour TTL. Record notes/payment input needed for the pending operation are scoped recovery data, not a Member database export. No credentials, private photos or full ledgers are persisted. Pending IDs/body/base are kept separately from unsent drafts.

After reload authenticate, load current record, then offer restore/discard; stale-base restoration stays a conflict and never sends automatically. A pending operation is reconciled through the receipt endpoint. Storage denial is visible; the editor still works but cannot promise reload recovery. Browser/OS deletion of storage remains outside this guarantee. File selections stay memory-only, guarded on in-app exit; they cannot be restored after process death.

Dirty exit/event switch prompts stay/discard. Back/reload during a save never replays it. Explicit logout/access loss clears identity-scoped drafts, pending client state and private media; old responses cannot render under another actor. beforeunload is best-effort, supplementary only. Desktop WebKit is not physical Safari/iPhone validation.

## Historical Stage 1 refresh / cost budget (superseded below)

Successful visible polling: next cycle 10 seconds after completion; normal fixture convergence <=15s. Each cycle re-evaluates deadlines, not just updated_at. Failures back off 20/40/60 seconds; reachable recovery/focus/pageshow/navigation revalidates immediately. One in-flight context and one timer; hidden/anonymous/denied tabs have zero periodic calls. A started request may finish or be aborted; no backlog catch-up burst.

Steady successful budget below excludes initial boot, explicit navigation/focus, GET retries, images and operator commands. D1 counts are **statements**, not billed rows scanned or round trips. Every Admin request includes one active-role lookup; Firebase verification normally uses cached key material.

| Visible context | HTTP/min/admin | D1 statements/min/admin | 5 admins HTTP / D1 per minute |
| --- | ---: | ---: | ---: |
| Summary only (Dashboard) | 6 | 12 | 30 / 60 |
| Reservation/payment list | 12 | 42 | 60 / 210 |
| List + open reservation/member-linked detail | 18 | 72 | 90 / 360 |
| Accommodation | 12 | 30 | 60 / 150 |
| Gallery community | 12 | 30 | 60 / 150 |
| History review | 12 | up to54 | 60 / up to270 |
| Hidden / logged out / denied | 0 | 0 | 0 / 0 |

Reservation/detail reads: auth1 + event1 + list/count/tabs3 each. Summary: auth1 + summary1. History: auth1 + up to6 existing source queries, plus summary2. Accommodation/gallery media are separate reads: reservation visual HEADs now coalesce per distinct option per response (<=50 for default page); gallery can initially hydrate up to50 private images, History <=4 evidence images per opened claim. Object URLs are reused while needed and released on close/reset/logout.

Optional Funnel is fetched on entry/revalidation, not each poll: one HTTP / eight D1 statements including event/auth, bounded detail50. Its own stale warning preserves prior successful data. It is not a required attention item.

Mailing active overview adds one stored projection request (auth + contact projection + draft count); contacts refresh only the active filter; campaigns poll list and selected stored delivery/tracking, never provider-status/readiness. Contacts and campaigns expose bounded pages/totals (default50/max100); campaigns no longer download an unbounded list. Existing Mailing bulk contact projection and bounded delivery detail semantics remain existing implementation limits; no general Mailing query-engine rewrite or new sending engine. Readiness is still an explicit existing detail action, not a periodic poll. At the Stage 1 checkpoint Member 360 was deferred; the Stage 2 implementation below now shares this coordinator.

These are not a Cloudflare free-tier guarantee: cost depends on rows scanned, data growth and active duration. No paid feature or billing/config change was made.

## Migration / compatibility

Forward migration: `db/migrations/2026-09-08-admin-safe-operations.sql`, after existing:
1. 2026-09-03-mailing-foundation
2. 2026-09-03-mailing-editor
3. 2026-09-07-production-feedback
4. 2026-09-07-mailing-delivery

Then Stage 1's version/receipt tables + source triggers. The exact migration is tested on populated predecessor schema, and the full local canonical schema includes it verbatim. No transaction wrapper is embedded in the forward file; the runner owns the transaction. Reapplication fails honestly; it is not made falsely idempotent.

Later authorized rollout must migrate before serving this Worker. Old open Admin clients without revision/operation headers fail closed with 428 and must reload the new module graph. Updated Member history paths also require the new sidecar table. No production migration, push or deployment occurred in this task.

Receipts/tombstone versions are not automatically purged: deleting them could permit ambiguous retry duplication or revision reuse. Operational retention/purge is a later explicitly designed task, not a cron added here.

## Validation / known boundaries

See progress document for exact final counts. Real SQLite tests cover same-base competing admins, lost response/no delivery, same-key changed payload/actor, failed primary with no audit/Points/receipt, actual History Points replay, create identity, all-writer invalidation, bounded read totals/no VS write, UTC deadline and independent finance/occupancy/claim overlap. Chromium/WebKit use synthetic delayed/aborted/503/403 responses, Back/reload/drafts/offline/storage denial, true page totals, late previous-record rejection, failed event-switch isolation and hidden polling. Detail read failures show their stale warning inside the open drawer. All earlier Member/Mailing/Points/pricing/capacity regressions remain part of full validation.

Screenshots are generated in ignored test-results directories at 1440x900 and 390x844, without production data. Focused form captures show keyboard focus, not an actual iOS software keyboard. Physical Safari, real iPhone bfcache/process eviction, cloud edge latency and production D1 behavior were not exercised. No production read audit was needed.

External R2 cover uploads/deletes are not atomic D1 commands; existing object semantics are preserved and ambiguous failures require explicit revalidation. SMTP2GO locking, snapshots, daily200 guard, survey send block and ambiguous-send safety are unchanged. No emails/provider calls in validation. No new feature is inferred from a future metric definition.

## Exact next-stage boundaries

- Stage 2: canonical Member 360/list/search/private media links and stable QR identity/resolver; reuse current lifecycle/receipts, no second command engine.
- Stage 3: grouped five-area navigation, configurable dashboard/compositions/charts/preferences, exact operational drill-down support. Optional Planner, not default focus.
- Stage 4: remaining cross-domain mobile/recovery acceptance and physical-device limitations.
- Not introduced: check-in, judging, Merch, refund/credit/payment-policy changes, historical backfills or Mailing D response metrics.

## Stage 2 — Member 360 / QR, local checkpoint (2026-09-08)

This section supersedes the historical Stage 1 cadence/budget above. Shared contract section 6 carries the narrow dated amendment; all revision/operation receipt, finance, authorization and dirty-editor rules remain intact. The feature implementation is local; **Free-tier row-budget acceptance is NOT satisfied**. See [the reproducible budget](admin-v2-free-tier-budget.md) before any rollout.

### Interfaces and composition

- `worker/admin/members.js`: Admin-only bounded list/search and independent read-only Member projections. `GET /api/admin/members?page=1[&q=...]` returns complete totals, 30 members/page or at most 20 search suggestions. Search requires two meaningful Unicode letters/digits, escapes LIKE wildcards, and matches name/nickname/email/full code/car model/nickname. It does not infer identity; duplicate car matches use EXISTS. Order is created_at DESC, immutable ID. SQLite substring search does not promise accent-insensitive linguistic matching.
- `GET /api/admin/members/:memberId?eventId=:eventId`: identity, selected event and its stored reservation/stay/crew/vehicle/finance. No call into bootstrap, VS allocation or owner impersonation.
- Same base plus `reservations|garage|photos|club|history|points|mailing|qr`: separately loaded domains. Lists use 20-row pages and independent complete totals. Club uses existing pure achievement/rating derivation and ledger SUMs, not new rules. Stored payment status is labelled separately from recorded due/paid/debt/overpayment amounts. No payment state is inferred from QR.
- `admin/member-detail.js`: single read-only native dialog, right drawer desktop / full-screen mobile, global debounced search, QR rendering, visible-media loading. `admin.js` owns composition and the one refresh coordinator; `admin/navigation.js` extends the Stage 1 allowlisted URL/Back stack with member/tab IDs. Search text, QR tokens and private records are not stored in URL/history.
- Reservation quick/detailed lists, payment list/drawer, gallery cards/lightbox, History/S&S cards and actually linked Mailing rows use the same canonical button. Existing DTO member.id/memberId are preserved. Mailing adds `canonicalMemberId` from persisted current_member_id or the actual projected member row; legacy email inference remains in the old segmentation projection only and never creates a navigable Member relationship.
- Opening Member over a dirty payment preserves the source editor and list/filter/page/scroll history. Back closes only the Member overlay, without authorizing/discarding the underlying draft. Direct entry/reload has a safe parent. Business actions leave Member for the existing reservation/payment editor or existing History moderation workspace; there is no second write implementation.

### Private data, media and freshness

Every actual request passes existing Firebase verification and active-Admin lookup; ordinary/inactive/blocked roles cannot read/search/resolve/media. JSON uses no-store and private media uses private,no-store. Media paths verify both owner and parent (member/car/photo or member/claim/evidence); gallery also checks a linked car belongs to that member. R2 keys do not appear in the new DTOs.

Only header and current tab are active. Session/event/member/tab/page generation and payload dataVersion reject late data. Closed/obscured resources do not poll; closing Member retains the source resource's real fetch age; missing/stale resources reload, but a fresh read-only return does not invalidate every source endpoint. Cached resource timestamps are retained, not restamped when merely rendered. A failed tab leaves valid identity/other data usable and reports stale/unavailable locally. Logout/access loss clears private DOM, search/data caches, pending media and object URLs.

IntersectionObserver loads only visible images. Unchanged media paths/versions reuse authenticated object URLs across ticks; fullscreen is an explicit click. **Existing storage has one image object, not separate thumbnails**: visible thumbnail rendering therefore fetches that existing object; fullscreen reuses it. No new image transformation service/derivatives or R2 writes are introduced. This is not a claim of lower-resolution thumbnail bandwidth savings.

Central configuration `admin/refresh-policy.js`: operational 60s; reservation/gallery heavy lists 120s; summary, History review and Member Club/History/Points/Mailing/QR 300s. Explicit opening loads missing/stale data. Focus/visible/pageshow/reconnect coalesce and revalidate the visible operational resources/editor plus due analytical resources, not every fresh tab. Own mutations show the existing authoritative result immediately and invalidate once. Manual refresh is coalesced. Backoff is 120/240/300s after failures, capped at 300s. Hidden/logged-out/denied/known-offline contexts have zero periodic requests. Displayed summary time is its own last fetch, never the coordinator's successful minute tick.

### Stable QR migration / explicit provisioning

`db/migrations/2026-09-08-admin-member-identity.sql` follows Stage 1 safe-operations, once. Canonical schema contains it exactly. New member_qr_identities has immutable member FK, unique 48-character lowercase hex token and created_at. Six justified read indexes cover member ordering, member gallery, car photos, recipient member/contact and member S&S lookup. Migration copies/changes no member/business records and issues no tokens by itself.

No previously issued member QR identity was found; the existing QR generator was payment-only. `worker/admin/member-qr.js` uses crypto.getRandomValues(24 bytes): 192 bits; payload `E36U1:<48 hex characters>`. Existing fixtures are provisioned explicitly in bounded batches through `provisionMemberQrBatch(env,100)`, repeat until provisioned=0. Unique member conflict retains the original token; an independent token collision fails instead of replacing another identity. Existing login/profile reads/edits never invoke this function. Only genuinely new server-side profile bootstrap adds the token statement to its existing batch; previous Points statement order is preserved.

**A later separately authorized rollout must apply the migration before this Worker, then run the bounded provisioning boundary for every existing real member.** Do not paste tokens into logs. This checkpoint includes only local fixture provisioning; no production command/job/HTTP provisioning endpoint is enabled.

`POST /api/admin/member-qr/resolve` accepts a bounded JSON body `{payload}`, validates version/format, resolves unique token and returns only member ID. No lookup log, timestamp, check-in, entitlement, payment or Points write. Global search recognises pasted QR and opens the same detail. QR is rendered with already vendored qrcode-generator; independent test decoder reads the actual SVG matrix/format/data (fixed version 4/M byte-mode payload). This proves the exact generated payload decodes, not camera/iOS optical reliability. Future camera code may submit a decoded payload to this resolver; future event/car/order actions require separate explicit action APIs, not token semantics. No scanner, rotation/reissue UI, merch/judging/check-in or prominent Member Portal QR was added.

Stages 3–4 remain unimplemented. They must consume these interfaces/cadences, not add widget timers or restore a ten-second event-day preset.

### Stage 2 budget follow-up (local, 2026-09-08)

One forward ordering index plus a materialized reservation page bounds hydration and scopes approved usage to the page's actual pending option IDs (all-event option semantics preserved). The existing source drawer opts into `projection=detail` together with an immutable reservation ID, omitting only unused list facets. Default/old clients retain their contract. No new permission/cache framework or interval change.

See [budget evidence and open gate](admin-v2-free-tier-budget.md): corrected estimate3,549,822 /3contexts/12h;3,904,805 with10% retries. **The1M condition remains unsatisfied.** All figures are local estimates, not Cloudflare billing; no rollout/Stage3/4 authorization is implied.

## Stage 3 — dashboard and grouped navigation

[Stage 3 architecture/catalog](admin-v2-dashboard.md) supersedes earlier unimplemented-dashboard statements without rewriting historical validation. Five areas, two independent explicit responsive layouts, four Preparation KPI defaults, optional-only Planner, fixed truthful Attention, native graphs/exact tables and allowlisted drill destinations. Existing search/Member360/QR/private media/source editors stay canonical. Preferences extend the existing revision/receipt model via one new forward migration after admin-read-budget. Native Admin cache versions move together; no new dependency/framework/business policy.

One coordinator; unchanged 60/120/300s, no per-widget timers. New analytics only in visible dashboard; optional funnel only selected. [Incremental budget](admin-v2-free-tier-budget.md#stage-3-incremental-dashboard-budget) retains Stage 2's accepted-unmet target. Later operator instruction authorizes only fully green checkpoint push; no deployment, production migration/write, provider/configuration/email. Stage 4 not started.
