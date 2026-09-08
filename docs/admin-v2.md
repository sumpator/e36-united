# Admin v2 — Stage 1 operational foundations

This is Stage 1 only. The preserved product contract and data map are authoritative handoff documents; no Stage 2–4 implementation is implied.

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

## Refresh / cost budget

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

Mailing active overview adds one stored projection request (auth + contact projection + draft count); contacts refresh only the active filter; campaigns poll list and selected stored delivery/tracking, never provider-status/readiness. Contacts and campaigns expose bounded pages/totals (default50/max100); campaigns no longer download an unbounded list. Existing Mailing bulk contact projection and bounded delivery detail semantics remain existing implementation limits; no general Mailing query-engine rewrite or new sending engine. Readiness is still an explicit existing detail action, not a periodic poll. Member 360 does not exist yet: Stage 2 must budget its selected tab using this coordinator, not fetch every future tab.

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
