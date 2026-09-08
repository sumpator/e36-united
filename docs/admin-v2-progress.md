# Admin v2 progress

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
