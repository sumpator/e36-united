# Worker API contract baseline

Characterized on 2026-08-31 from `cloudflare-worker-media.js` at `8bd711ca6c92682b8bef8a3290f7c09fdff0d575` and the current tests. This records current behavior, including inconsistencies; it is not a redesign.

Phase 1B updates only the authorization layer from verified checkpoint `fb2c9562c34b92e86b1aa24752f3115d0ec3a9da`; endpoint paths, inputs, business responses, and D1/R2 domain behavior remain otherwise unchanged.

## Shared behavior

- JSON responses use `Content-Type: application/json; charset=utf-8` and `Cache-Control: no-store`. Media routes return object metadata/content types and route-specific cache headers.
- `OPTIONS` is handled for any path: `204` for no/allowed Origin and `403` for a non-allowlisted Origin. Allowed CORS methods are `GET, POST, PUT, PATCH, DELETE, OPTIONS`; allowed headers are `Authorization, Content-Type`.
- The five public route families are dispatched before authenticated-Origin enforcement. An unallowlisted browser Origin receives no CORS grant for their response. Other `/api/*` calls with a non-allowlisted Origin receive `403 Origin not allowed`.
- Authenticated routes first require a valid Firebase Bearer token (`401` otherwise). Firebase proves identity, and ownership remains bound to the verified Firebase UID.
- `GET /api/me` is the Firebase-only status exception. It remains available when the UID has no member row or the current member status is not active so the application can discover the profile state and display the existing inactive-member UI.
- `POST /api/bootstrap` is the onboarding exception: a missing UID may create its current `active` profile and an existing active member may keep the established profile-sync behavior. An existing non-active member receives `403 active_member_required`, preventing bootstrap from bypassing protected profile-mutation policy. Bootstrap still preserves an existing role/status.
- Every other explicit non-Admin Member route requires a D1 member row with `status = 'active'`. A missing row or any other status returns `403 { ok: false, error: "active_member_required", message: "Aktivní členství je vyžadováno." }` before domain D1/R2 work.
- Admin routes require the Firebase token and a D1 member with `role = 'admin'` and `status = 'active'`; otherwise they return `403 admin_forbidden`.
- Uncaught handler errors become `500 { ok: false, error: "Internal server error" }`.
- Unknown Admin routes return `404`. An authenticated unknown non-Admin `/api/*` route currently falls through to `200 { ok: true, service: "E36 United API" }`. Non-API unknown paths use the same `200` response.

There are 45 explicit method/path contracts below, plus shared `OPTIONS` handling.

## Public endpoints

| Method and path | Access | Inputs | Important response/status | D1/R2 behavior and checks |
| --- | --- | --- | --- | --- |
| `GET /api/health` | public | none | `200`: `ok`, service name, `database`, event count, media-binding flag, auth type; `500` on binding/query error | D1 `COUNT(events)`; reports whether `MEDIA` is bound. |
| `GET /api/gallery/approved` | public | query `limit` (default 60, clamped 1–100) | `200`: approved `photos[]` with id, caption, author, date, and public image URL | D1 read; only `gallery_submissions.status = 'approved'`. |
| `GET /api/events/current` | public | none | `200`: current `event` or null and active `accommodationOptions[]` | D1 event/options/capacity reads; R2 `head` per option for visual metadata. |
| `GET /api/accommodation/media/:optionId` | public | path option ID; optional query `v` selects immutable caching | `200` image; `404 accommodation_not_found` or `accommodation_photo_not_found` | D1 verifies option; R2 reads stable event/option cover key. No active-option restriction. |
| `GET /api/gallery/media/:submissionId` | public | path submission ID | `200` image; `404` for unavailable row/object | D1 requires approved status; R2 read. |

## Authenticated identity/bootstrap endpoints

These two routes have the shared Firebase token and UID ownership checks. `/api/me` intentionally does not require active membership; `/api/bootstrap` allows a missing member for onboarding but rejects an existing non-active member.

| Method and path | Access | Inputs | Important response/status | D1/R2 side effects and checks |
| --- | --- | --- | --- | --- |
| `POST /api/bootstrap` | Firebase-authenticated onboarding; missing or active member only | JSON `name`, optional `nickname`, `phone`; Firebase email/name may supply defaults | `200` member/profile payload; `400` for missing email or invalid lengths; `403 active_member_required` for an existing non-active member | D1 upserts the UID-owned member, syncs identity/login fields, and attempts idempotent profile-completion Points. Existing role/status are not overwritten. |
| `GET /api/me` | Firebase-authenticated status | none | `200` with Firebase identity and `profileExists: false`, or public member fields including current status | D1 read. If Firebase email/verification changed, this GET updates those D1 fields. No active-status rejection. |

## Protected active-member endpoints

Every route in this section requires both the shared Firebase identity check and centralized active-member authorization described above.

| Method and path | Access | Inputs | Important response/status | D1/R2 side effects and checks |
| --- | --- | --- | --- | --- |
| `GET /api/navigation-state` | active member | none | `200`: `hasWaitingPlan`, `hasReservation` | D1 reads current-event reservation and any unexpired UID-owned Planner draft. |
| `GET /api/united-club` | active member | none | `200`: available/lifetime Points, reward threshold, rating, history/evidence URLs, profile completion, achievements; `404 member_not_found` | D1-only reads across member, events/claims, evidence metadata, ledger, cars, and approved gallery count. |
| `POST /api/history/claims` | active member | multipart: `eventId`, 1–4 `files`; optional `snsCompeted`, `snsCategory`, `snsPlacement`, `snsBestOfBest`, `snsBestExhaust` | `201` new or `200` amended claim; `400` invalid form/evidence/S&S; `409` event not concluded or locked/pending claim | Validates concluded event and UID ownership. R2 uploads private evidence; D1 inserts/updates claim and evidence. Rejected resubmission replaces old evidence; cleanup deletes old/new R2 objects as appropriate. |
| `POST /api/history/completed` | active member | body ignored | `200`; `404 member_not_found` | D1 sets `history_completed_at` once and attempts idempotent profile-completion Points. |
| `GET /api/history/evidence/:evidenceId` | active member | path evidence ID | `200` private image; `404 evidence_not_found`/`media_not_found` | D1 requires `evidence.member_id = auth.uid`; R2 read; private/no-store. |
| `GET /api/planner-draft` | active member | none | `200`: normalized active `draft` or null | D1 read of unexpired UID-owned draft. |
| `PUT /api/planner-draft` | active member | JSON `{ draft }`; version-1 Weekend Planner payload | `200`: `accepted` and authoritative draft; `400` malformed/stale/unknown event; `409 member_profile_required` | Requires a member row and known event; D1 conditional upsert prevents an older browser overwriting a newer draft. |
| `DELETE /api/planner-draft` | active member | query `eventId` | `200`: `deleted`; `400 event_id_required` | D1 deletes only matching UID/event draft. |
| `GET /api/reservations/current` | active member | none | `200`: registration state, event/options, reservation/payment and message | D1 reads UID reservation and capacity. May allocate and persist a missing stable payment VS. R2 `head` supplies accommodation visual metadata. |
| `PUT /api/reservations/current` | active member | JSON: optional `reservationId`; `carId`, `arrival`, integer `crew`, `accommodation`, optional `accommodationOptionId`, `accommodationUnits`, `showShine`, optional `note` | `200` saved pending reservation; `400` validation/protected finance fields; `404` ownership/reservation mismatch; `409` closed, existing/edit-required, unavailable option, or capacity conflict | Requires member row and UID-owned car. Server derives attendance, price, units, snapshot, payment state and VS. D1 atomically upserts same reservation identity/snapshot, preserves paid amount, removes consumed Planner draft, and enforces capacity/current event. R2 `head` supplies response visual. |
| `GET /api/cars` | active member | none | `200`: UID-owned cars and photo metadata | D1 ownership-filtered read. |
| `POST /api/cars` | active member | JSON `model`, `body`, optional `nickname`, `year`, `color`, `primary` | `201` car; `400` invalid JSON/required fields/year | D1 inserts UID-owned car, normalizes primary selection, attempts profile Points. The centralized guard now provides the member-row check before domain execution. |
| `GET /api/cars/media/:photoId` | active member | path photo ID | `200` private image; `404` row/object | D1 joins photo to UID-owned car; R2 read; private/no-store. |
| `PUT /api/cars/:carId` | active member | same car fields as create | `200` car; `400` invalid input; `404` not owned | D1 ownership-checked update and primary-car reconciliation. |
| `DELETE /api/cars/:carId` | active member | path car ID | `200`; `404` not owned | D1 verifies ownership/loads photo keys; R2 deletes car objects; D1 deletes car (cascading photo rows) and selects a replacement primary car. |
| `POST /api/cars/:carId/primary` | active member | path car ID | `200`; `404` not owned | D1 verifies ownership then updates all UID-owned primary flags. |
| `POST /api/cars/:carId/photos` | active member | multipart `file` (JPG/PNG/WEBP, 1 byte–8 MiB) | `201` photo; `400` invalid file; `404` car; `409` three-photo limit | D1 verifies UID-owned car/count. R2 put precedes D1 insert; object is deleted if D1 insert fails. |
| `PUT /api/cars/:carId/photos` | active member | multipart `file` with same validation | `200` replacement and replaced IDs; `400`/`404` | D1 verifies ownership. R2 writes new object, D1 replaces all photo rows with one row, then old R2 objects are deleted; failure cleanup preserves prior DB rows. |
| `POST /api/gallery/submissions` | active member | multipart `file`; optional `caption` up to 240 chars | `201` pending submission; `400` invalid file; `429` 24 uploads/24h | D1 enforces per-UID daily count. R2 put then D1 insert; object cleaned up on insert failure. |
| `GET /api/gallery/mine` | active member | query `limit` (1–48, default 24), `offset` (0–10000) | `200`: all own statuses in `submissions[]` plus pagination | D1 UID-owned paginated read. |
| `GET /api/gallery/mine/media/:submissionId` | active member | path submission ID | `200` private image; `404` row/object | D1 requires submission owner UID regardless of moderation status; R2 read; private/no-store. |

## Admin endpoints

All routes in this section require an active Admin member in addition to the Firebase token. Mutations write Admin audit rows where noted.

| Method and path | Access | Inputs | Important response/status | D1/R2 side effects and checks |
| --- | --- | --- | --- | --- |
| `GET /api/admin/overview` | admin | optional query `eventId` | `200`: selected event and reservation/payment/gallery/history aggregates; `404 event_not_found` for explicit bad ID | D1 aggregate reads only. |
| `GET /api/admin/reservations` | admin | optional query `eventId` | `200`: event and full reservation/member/payment/snapshot list; `404` explicit bad event | D1 reads; may persist missing payment VS values. R2 `head` loads accommodation visual metadata. |
| `GET /api/admin/events` | admin | none | `200`: `events[]` settings summaries | D1 read. |
| `GET /api/admin/accommodation` | admin | optional query `eventId` | `200`: event and all options/capacity/visuals; `404` | D1 read; R2 `head` per option. |
| `POST /api/admin/accommodation` | admin | JSON `eventId`, `name`, `kind`, `inventoryMode`, capacities/prices/fees, optional `active`, `sortOrder` | `201` option; `400` invalid fields/values; `404` event; `409` duplicate | D1 inserts option and `admin_actions` row in a batch; response reads R2 visual metadata. |
| `GET /api/admin/gallery` | admin | none | `200`: all pending/approved/rejected photos with member and review metadata | D1 read. |
| `GET /api/admin/history/claims` | admin | query `q`, `status`, `type`, `year`, `page`, `pageSize` | `200`: claims, counts, year facets, filters, pagination; `400` invalid filter | D1 filtered/paginated reads and evidence metadata. |
| `GET /api/admin/history/evidence/:evidenceId` | admin | path evidence ID | `200` private image; `404` row/object | D1 read without owner restriction because Admin guard already passed; R2 read; private/no-store. |
| `PATCH /api/admin/history/claims/:claimId/:component` | admin | `component` is `attendance` or `sns`; JSON `status` (`approved`/`rejected`), optional `reviewNote` (required on rejection) | `200`/unchanged; `400` invalid; `404` claim; `409` S&S dependency/not claimed or approved record locked | D1 updates review, writes audit row, and on first approval adds idempotent Points/profile statements. No update/delete of prior Points. |
| `GET /api/admin/gallery/media/:submissionId` | admin | path submission ID | `200` private image; `404` row/object | D1 permits any known moderation status; R2 read; private/no-store. |
| `PATCH /api/admin/gallery/:submissionId` | admin | JSON `status` (`pending`/`approved`/`rejected`), optional `reviewNote` | `200`/unchanged; `400`; `404` | D1 updates moderation state and audit row; approval attempts idempotent gallery/profile Points. No R2 mutation. |
| `PATCH /api/admin/reservations/:reservationId/payment` | admin | JSON containing only integer `amountPaidCzk` (0–10,000,000) | `200` payment/unchanged; `400`; `404` | May allocate missing VS. D1 atomically updates paid amount/derived status/timestamps and writes audit row. Client-supplied status is rejected. |
| `PATCH /api/admin/reservations/:reservationId` | admin | JSON `status` (`pending`/`approved`/`rejected`/`cancelled`), optional `reviewNote` | `200`/unchanged; `400`; `404`; `409` capacity conflict | D1 atomically checks limited inventory when approving, updates review state, and writes audit row. No refund/credit side effect exists. |
| `PATCH /api/admin/events/:eventId` | admin | JSON subset of `isCurrent`, `registrationStatus`, capacities/night counts, booking fields, `eventEndAt` | `200`/unchanged; `400`; `404` | D1 may clear/set current event, updates settings, and writes audit row in one batch. `isCurrent` can only be set true, not directly cleared. |
| `PATCH /api/admin/accommodation/:optionId` | admin | JSON subset of name/kind/inventory/capacity/prices/fees/active/sort order | `200`/unchanged; `400`; `404`; `409` duplicate or confirmed-capacity conflict | D1 concurrency-aware update and audit row; cannot reduce limited inventory below approved allocation. Response reads R2 visual metadata. |
| `PUT /api/admin/accommodation/:optionId/photo` | admin | multipart `file` (JPG/PNG/WEBP, 1 byte–8 MiB) | `200` visual metadata; `400`; `404` option | D1 verifies option. R2 overwrites the stable cover key with Admin ownership metadata; no D1 media row. |
| `DELETE /api/admin/accommodation/:optionId/photo` | admin | path option ID | `200` fallback visual; `404` option | D1 verifies option; R2 deletes the stable cover key. |

## Contract-level observations

- Ownership keys are Firebase UIDs; email, nickname, car name, and display name are not used for ownership.
- Several nominal GETs can write D1: `/api/me` synchronizes Firebase identity fields, and reservation GETs allocate missing payment variable symbols.
- Public gallery access is moderation-gated; private car/gallery/evidence media is application-authorized.
- Protected Member and Admin routes now both require active status through separate authorization helpers; Admin additionally requires `role = 'admin'`.
- Status/error naming and language are not normalized across older and newer domains. This inventory preserves those differences rather than changing them.
