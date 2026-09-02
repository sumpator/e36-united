# Member frontend foundation

Phase 3 keeps `member.js` as the Member Portal composition entry and moves only shared frontend mechanics into native ES modules. There is no new build step, framework, or runtime dependency.

## Module structure

- `member.js` — application bootstrap, auth-facing DOM transitions, navigation, and all current domain rendering and mutation flows.
- `member/api.js` — authenticated JSON, FormData, and blob requests; bearer headers; response parsing; existing error objects; and the existing single forced-token retry after a 401.
- `member/session.js` — Firebase auth-controller initialization, Firebase context/current-user/auth-flow state, retry coordination, and the existing auth/API error copy.
- `member/state.js` — fresh default Member Portal data and member-profile normalization.
- `member/refresh.js` — parallel initial session loading and the existing Garage/gallery failure fallbacks.
- `member/ui.js` — DOM selectors, toast display, HTML escaping, local IDs, and shared button busy state.

`member.html` continues to load `member.js` as a native module. The script query version was advanced so a future static deployment cannot combine the new HTML with a cached pre-Phase-3 entry file.

## Request and bootstrap flow

1. `member.js` creates the session controller and API client, hydrates any existing Planner handoff, applies the requested login/register tab, and starts Firebase authentication.
2. The session controller delegates to the existing `initUnitedAuth` bootstrap and exposes the resulting Firebase context without changing persistence or auth-state decisions.
3. An authenticated user still passes through `/api/me`, conditional `/api/bootstrap`, UID matching, and inactive/blocked/suspended checks.
4. Cars, current reservation, Planner draft, United Club, and gallery status start in the same parallel batch. Cars and gallery retain their existing local fallbacks; other startup failures still fail session restoration.
5. The assembled state is rendered, the portal opens on `Přehled`, and the Planner draft is applied in the same order as before.

API calls still obtain the token from the current Firebase user, use `cache: 'no-store'`, retry one 401 with `getIdToken(true)`, and preserve the separate JSON, FormData, and blob response behavior.

## State and retained responsibilities

The shared state is intentionally small: Firebase context, current Firebase user, auth-flow activity, default portal data, and member identity normalization. Garage, gallery, reservation, Planner, Club, History, Account, upload, media-object-URL, modal, and rendering state remains in `member.js` because it is domain-specific and belongs to the Phase 4 split.

Login/register form handling, authenticated UI transitions, `/api/me` and `/api/bootstrap` orchestration, and logout success/failure UI also remain composed in `member.js`. Their low-level session state and Firebase initialization now have a shared home, while the behavior and copy remain unchanged.

Post-mutation refresh sequences remain beside their domain mutations because their render order and side effects differ. Phase 3 extracts only the common initial-session coordination and does not introduce polling, focus refresh, cross-tab synchronization, or an error-versus-empty UX distinction. The known Garage failure fallback therefore remains unchanged.

## Phase 4 boundary

Phase 4 may extract Overview, Garage, Photos, Weekend Planner, Reservations, Payments, United Club, History, and Account behind this foundation. It must continue preserving their current contracts and UX. Phase 3 deliberately makes no `main.js`, `admin.js`, Worker, API, Firebase-policy, CSS, or business-rule changes.
