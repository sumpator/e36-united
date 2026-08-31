# Worker foundation

Phase 1 separates the Cloudflare Worker foundation from its business domains without changing runtime behavior or API contracts. Wrangler still targets `cloudflare-worker-media.js`; that compatibility entry re-exports the single native module Worker from `worker/index.js`.

## Module structure

```text
cloudflare-worker-media.js   compatibility entry
worker/
  index.js                   fetch bootstrap and unexpected-error boundary
  context.js                 request, environment, URL and Origin context
  router.js                  ordered public/member/Admin route dispatch
  domains.js                 preserved business handlers, D1 SQL and R2 operations
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

`worker/domains.js` is deliberately still large. Splitting reservation, payment, Points, history, Garage, gallery, accommodation, and Admin behavior belongs to Phase 2; this phase only moved that code behind the extracted router.

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

- domain extraction / Phase 2;
- unknown-route behavior cleanup;
- business-rule, authorization-policy, payload, status-code, schema, D1 or R2 changes.
