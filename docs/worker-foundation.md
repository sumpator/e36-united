# Worker foundation

Phase 1 separates the Cloudflare Worker foundation from its business domains without changing runtime behavior or API contracts. Wrangler still targets `cloudflare-worker-media.js`; that compatibility entry re-exports the single native module Worker from `worker/index.js`.

## Module structure

```text
cloudflare-worker-media.js   compatibility entry
worker/
  index.js                   fetch bootstrap and unexpected-error boundary
  context.js                 request, environment, URL and Origin context
  router.js                  ordered public/member/Admin route dispatch
  domains.js                 remaining coupled business handlers, D1 SQL and R2 operations
  domains/
    events.js                shared event reads and public Admin event mapping
    accommodation.js         accommodation-photo metadata and R2 delivery/mutations
    gallery.js               approved public gallery feed and media delivery
    media.js                 shared image validation and file-extension mapping
  auth/
    firebase.js              Bearer parsing, Firebase JWT/JWKS verification and cache
    admin.js                 existing active-Admin D1 lookup
    member.js                centralized active-member D1 guard and stable 403 response
  http/
    cors.js                  origin allowlist, CORS headers and OPTIONS responses
    request.js               generic JSON-object parsing response contract
    responses.js             shared JSON response construction
  utils/
    text.js                  shared string normalization
```

`worker/domains.js` remains the compatibility export surface for the router and tests while the extracted modules take ownership of their low-coupling responsibilities.

## Phase 2A domain extraction

Phase 2A mechanically extracts shared event reads, accommodation-photo R2 behavior, generic image validation, and the approved public gallery feed. Existing handler signatures, SQL, R2 keys and metadata, streamed response bodies, cache headers, CORS behavior, status codes, and payload shapes are unchanged.

The current-event response and accommodation option listing remain in `worker/domains.js` because availability fields aggregate approved and pending reservations. Admin accommodation creation and updates also remain because their validation and concurrency checks enforce confirmed capacity. Keeping these paths together avoids pulling reservation and capacity policy into a low-risk extraction.

Also deferred are reservations, pricing, payments and variable symbols, Points and achievements, history and Show & Shine review, Garage ownership, member gallery ownership, Admin moderation, and business-rule changes. Phase 2A does not change route ordering, public/member/Admin classification, the active-member guard, D1 schema, or R2 authorization.

## Request flow

1. `worker/index.js` creates the request context.
2. OPTIONS requests use the preserved allowlist and 204/403 behavior.
3. `worker/router.js` checks public routes in their existing order.
4. Other `/api/*` requests keep the existing Origin check and Firebase verification.
5. `/api/admin/*` keeps its separate active-Admin authorization branch.
6. `GET /api/me` remains Firebase-only so a missing or non-active profile can be discovered and the current UI can display its status. `POST /api/bootstrap` remains available to a missing member for onboarding and to an active member for the established profile sync, but rejects an existing non-active member.
7. The router classifies every explicit protected Member contract and calls the centralized active-member guard before entering its domain handler.
8. Domain handlers receive the same request, bindings, URL, auth payload and Origin values as before.
9. Unknown routes retain their existing fallbacks, and unexpected exceptions retain the existing logged 500 JSON response.

## Authentication flow

`worker/auth/firebase.js` preserves the existing `Bearer ` token format, Firebase project/audience/issuer checks, time validation, RS256 verification, UID interpretation, and JWKS caching. Firebase UID remains the ownership key.

`worker/auth/member.js` adds `requireActiveMember`. For an explicit protected Member route, it resolves the UID-owned member record and permits access only when `status === 'active'`. A missing member or any non-active status receives `403` with `error: "active_member_required"` before domain D1/R2 work. The record is attached to the request-scoped auth payload for downstream reuse; no request state is stored globally.

The same module exposes the low-level authorization-record lookup used by the conditional bootstrap exception. This lets missing users create their current profile without allowing an existing inactive user to mutate profile fields through bootstrap.

`worker/auth/admin.js` remains separate and preserves the requirement that Admin members have both `role = 'admin'` and `status = 'active'`. Firebase verification still happens before either authorization policy.

The current status model has `active` as its sole enabled value. Existing frontend behavior explicitly treats `inactive`, `blocked`, and `suspended` as non-active; the schema has no status CHECK constraint, so the server guard deliberately fails closed for any value other than `active`.

## Preserved behavior

- all 45 explicit method/path contracts and route ordering;
- current request/response shapes and status codes;
- public-route ordering before authenticated-Origin enforcement;
- CORS headers and OPTIONS behavior;
- the authenticated unknown non-Admin API fallback and non-API fallback;
- Firebase, Admin, domain D1 and R2 behavior, including existing GET-side writes; Phase 1B changes only the authorization boundary described above;
- one Worker, one deployment, and the existing `DB` and `MEDIA` binding names.

## Intentionally deferred

- further domain extraction after Phase 2A, especially the coupled domains listed above;
- unknown-route behavior cleanup;
- business-rule, authorization-policy, payload, status-code, schema, D1 or R2 changes.
