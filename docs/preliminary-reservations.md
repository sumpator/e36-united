# Explicit preliminary reservations (local implementation, 2026-09-19)

This is submitted non-binding member interest, not Planner autosave and not a real reservation. No rollout or production data change has been performed.

## Model and boundaries

- `event_preliminary_settings`: explicit per-event opt-in, absent row means disabled. Admin changes use a revision compare-and-set and an atomic `admin_actions` audit record. Registration must also be closed; enabling this flag never changes registration status.
- `preliminary_reservations`: one row per member/event, states `active`, `cancelled`, `converted`, revision, creation/update timestamps and validated preference JSON. A cancelled interest can be explicitly resubmitted with its current revision. No `pending`/`approved`, financial, allocation or QR fields.
- Preferences contain owned car ID, arrival/day visit, crew count (1–5), optional crew text entries, accommodation choice/option/people count, Show & Shine (`Ne`/`Možná`/`Ano`) and note. No future price snapshot. Additional crew descriptions remain in this interest record; the existing actual reservation still uses its unchanged crew-count contract.
- The existing server Planner draft remains a handoff/draft. It is neither migrated nor promoted to interest. An active submitted interest takes precedence when prefilling the member form; a stale handoff must not overwrite it.
- Members with any existing real reservation for the event use that reservation and cannot create a parallel preliminary record. Existing reservations are never rewritten by preliminary CRUD.
- All Member routes use Firebase + the existing active-member guard. All Admin routes use the existing active-Admin guard. Writes recheck closed registration, event opt-in, current event, ownership and absence of a real reservation inside the write statement. Stale revisions fail closed.
- Cancellation remains available to the owner after opt-in is disabled or ordinary registration opens. Reads never convert, allocate, send email or provision QR.

## API and UI

- `GET /api/preliminary-reservations/current`: current event settings and the signed-in member's record.
- `PUT /api/preliminary-reservations/current`: explicit create/edit/resubmit with `eventId` and `revision` (0 only for initial create).
- `DELETE /api/preliminary-reservations/current`: cancel active interest with `eventId` and `revision`.
- `GET /api/admin/preliminary-reservations?eventId=…&page=…`: separate active count and 20-row page of preferences and member identity.
- `PUT /api/admin/events/:id/preliminary-settings`: explicit `enabled` boolean and current settings `revision`.
- Member Reservation section presents both preliminary and real reservations through one status box and one two-panel detail. “Předběžná rezervace” is the only member-facing name for the persisted non-binding interest; Weekend Planner remains the shared modal editor. Optional crew details and cancellation remain available. Sold-out accommodation can be retained only as a preference, never as a capacity guarantee. On reopening reservations, the member must explicitly review and submit the real reservation.
- The existing real-reservation change-result acknowledgement remains authoritative: “Beru na vědomí” hides only the decided request result through its existing API and does not hide the reservation state or Admin message. No parallel notification store or acknowledgement workflow was added.
- Admin Reservations has a separate expandable preliminary overview, event opt-in switch, details and pagination. It is never merged into normal queues, receipts, income, capacity or confirmed-attendance metrics.

## Explicit conversion

The Member submits the existing `PUT /api/reservations/current` with `preliminaryId` and `preliminaryRevision`. All current registration, owned-car, event-option, crew, pricing and capacity validations remain in that handler. The reservation insert rechecks the interest revision/state and absence of an existing real reservation. Only a successful reservation write marks that interest `converted`, in the same D1 batch. Failed validation or concurrent cancellation leaves no partial reservation/allocation. Subsequent payment/VS behavior is the existing real-reservation behavior, not a preliminary side effect. Opening registration alone never converts anything.

## Reads and refresh cost

- Member without an actual reservation: one extra JSON read when loading current reservation state; event lookup + settings lookup + own-record lookup (3 SQL statements), plus the existing authorization lookup. Member with a real reservation does not request this endpoint.
- Admin collapsed: no extra JSON/SQL. Expanded on Reservations: one paginated JSON endpoint, event/settings/count/page = 4 SQL statements plus existing authorization. Count uses the event/status index, page is bounded to 20, no N+1 member reads.
- Admin uses the existing coordinator's 120-second heavy-list cadence and global request cap. No additional timer; hidden/offline/denied behavior remains inherited. Explicit panel open/page/settings action invalidates only this resource. Settings mutation = 2 batch statements (CAS + conditional audit) and a settings read, plus authorization.
- Existing summary, dashboard analytics and reservation query budgets are unchanged. These are query counts, not measured Cloudflare `meta.rows_read`.

## Migration and later rollout

`db/migrations/2026-09-19-preliminary-reservations.sql` creates two tables and one index, mirrored in the canonical local schema. It does not alter or backfill reservations, capacities, prices, payments, QR identities or existing Planner drafts. Default off for every event; United 2026 is not silently enabled.

Before a separately authorized rollout: run remote CI, approve/apply this migration and verify FK integrity, deploy the matching Worker before the frontend, then explicitly enable the desired event through Admin. No future mailing job, provider call or invitation sending is implemented. Future opt-in invitations can select active interest separately without changing its state model.

## Targeted verification

Local Node tests cover migration/FK, auth and active-member/Admin roles, configuration gates, revision/uniqueness, CRUD/day visit, ownership and validation, no financial/capacity/QR side effects, separate normal statistics, no implicit conversion, current pricing and failed capacity/ownership/revision conversion. Chromium scenarios use local SQLite-backed API fixtures for Member desktop/390px and Admin empty/list/settings/count. Existing reservation/payment/draft/Member and module-graph tests are retained.

The first UI pass identified missing resource invalidation after Admin settings save; this was fixed without changing coordinator intervals. Two initial browser runners stalled during automatic local-server shutdown and were interrupted, not counted as successful gates. With the same local server started explicitly (the existing `reuseExistingServer` configuration), the final three scenarios completed with exit 0, no retry. No test infrastructure configuration was changed.

The Member scenarios also include an existing server Planner handoff, verify that submitted interest wins over that draft, and cover create/edit/cancel/resubmit/explicit conversion. A synthetic crew mismatch (one person with two crew descriptions) was correctly rejected; the fixture input was corrected to two people, without weakening validation or assertions. Failed preliminary submissions also retain the edited form rather than reapplying the older handoff.

Successful scoped Node runs: 76/76 reservation/payment/draft/auth/graph checks; 96/96 Member/accommodation/presentation checks; 22/22 budget/graph/preliminary checks; 45/45 coordinator/command/budget/graph/preliminary checks. These sets overlap and are not a cumulative test count. New preliminary-specific coverage is 10/10 Node and 3/3 Chromium (desktop, 390px, Admin), with syntax and diff checks passing. No full browser suite, remote CI, WebKit rerun or production smoke was performed for this local-only implementation.
