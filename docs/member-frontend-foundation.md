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

## Phase 4A: shell and Overview

Phase 4A adds two native modules without changing the portal markup, styling, routes, requests, session rules, or rendered behavior:

- `member/shell.js` owns the auth/app display transitions, desktop and mobile Member Portal navigation, section switching, main-menu integration, and the authenticated member hero.
- `member/modules/overview.js` owns the Member Card, Overview Points progress, featured Achievements strip, and reservation/Planner Action Center presentation.

`member.js` remains the composition entry. It supplies existing state and callbacks to both modules and retains login/register and logout orchestration plus every domain flow: Garage and car uploads, Weekend Planner, reservations, payments, United Club and history, member photos, and Account. The shared session, refresh, API, state, and UI modules introduced in Phase 3 are unchanged.

Later Phase 4 work may extract those retained domains individually. Phase 4A does not alter default-section behavior, desktop/mobile navigation behavior, Action Center decisions, API/Firebase/session behavior, Worker code, CSS, or business rules.

## Phase 4B: Garage and Member Photos

- `member/modules/garage.js` owns Garage rendering, the shared Add/Edit modal, car mutations, photo upload/replacement, and the private car-photo object-URL lifecycle.
- `member/modules/photos.js` owns the member-submitted photo list, pagination, moderation-state presentation, upload/dropzone selection, lightbox, and its private-media object-URL lifecycle.
- `member/media.js` contains only the image-compression primitive shared by those two upload flows.

Garage connects to Overview and the retained reservation frontend through explicit state and render callbacks; Overview does not import Garage internals. `member.js` remains the composition entry and still owns Weekend Planner, reservations and reservation-only car presentation, payments/QR, United Club, history, Account, authentication orchestration, and cross-domain refresh ordering. Phase 4B changes no markup, CSS, API, Firebase/session, Worker, Admin, or public-site behavior.
