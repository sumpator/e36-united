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
4. Other `/api/*` requests keep the existing Origin check, Firebase verification, and member/Admin route order.
5. Domain handlers receive the same request, bindings, URL, auth payload and Origin values as before.
6. Unknown routes retain their existing fallbacks, and unexpected exceptions retain the existing logged 500 JSON response.

## Authentication flow

`worker/auth/firebase.js` preserves the existing `Bearer ` token format, Firebase project/audience/issuer checks, time validation, RS256 verification, UID interpretation, and JWKS caching. Firebase UID remains the ownership key. `worker/auth/admin.js` preserves the existing requirement that Admin members have both `role = 'admin'` and `status = 'active'`.

No member lookup or status check was added to ordinary authenticated requests, and authentication still occurs at the same route boundary.

## Preserved behavior

- all 45 explicit method/path contracts and route ordering;
- current request/response shapes and status codes;
- public-route ordering before authenticated-Origin enforcement;
- CORS headers and OPTIONS behavior;
- the authenticated unknown non-Admin API fallback and non-API fallback;
- Firebase, Admin, D1 and R2 behavior, including existing GET-side writes;
- one Worker, one deployment, and the existing `DB` and `MEDIA` binding names.

## Intentionally deferred

- active-member guard / Phase 1B;
- domain extraction / Phase 2;
- unknown-route behavior cleanup;
- business-rule, authorization-policy, payload, status-code, schema, D1 or R2 changes.
