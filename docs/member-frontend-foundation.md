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

## Phase 4C: Weekend Planner, reservations and payments

- `member/modules/planner/index.js` owns Weekend Planner handoff/draft state, reservation loading and saving, attendance/stay, crew, accommodation selection and price preview, Planner Show & Shine choice, reservation-specific car presentation, saved-reservation rendering, and the existing post-save coordination.
- `member/modules/planner/reservation.js` owns only the existing reservation, accommodation snapshot and payment response normalization.
- `member/modules/planner/payments.js` owns payment/balance presentation, server-provided variable-symbol instructions, and QR rendering from the existing SPAYD value.

Garage continues to own cars and private car-photo URLs; the Planner receives both through explicit state and callback boundaries and does not import Garage internals. Overview continues to own the Action Center; the Planner supplies the same reservation/window state through a render callback and Overview does not import Planner internals.

`member.js` remains the application composition entry and continues to own authentication/session orchestration, member profile and Account, United Club, history, Points/Achievements, shared contextual help, and cross-domain module wiring. Phase 4C changes no Planner options, reservation payloads, pricing or payment rules, DOM/CSS, Firebase/API behavior, Worker/Admin/public-site code, or deployment strategy.

## Phase 4D: United Club, history and Account

- `member/modules/club/index.js` owns United Club loading/normalization and composes its Points and History submodules behind explicit state, refresh and Overview-render callbacks.
- `member/modules/club/points.js` owns the existing server-authoritative Points and reward-progress presentation, Achievements catalog/details, shared Club/Member Card contextual help, and the existing Points/attendance/member-since presentation selectors.
- `member/modules/club/history.js` owns History/attendance rendering, the stateful year editor, Show & Shine category/placement/accolade presentation, claim payload construction, mutation refreshes, and private evidence object-URL lifecycle.
- `member/modules/account.js` owns Account/profile rendering and the existing `/api/bootstrap` profile-update flow. Account logout buttons continue to invoke the one shared logout implementation bound by `member.js`.

`member.js` is now the application composition layer: it initializes the session and domain modules, assembles initial state, preserves auth/login/logout orchestration, keeps the established render order, and coordinates cross-domain refresh callbacks. Overview still receives Points and featured-Achievement rendering through explicit callbacks; it does not import Club internals.

The final Member Portal module structure is:

```text
member.js
member/
  api.js
  media.js
  refresh.js
  session.js
  shell.js
  state.js
  ui.js
  modules/
    account.js
    garage.js
    overview.js
    photos.js
    club/
      index.js
      history.js
      points.js
    planner/
      index.js
      payments.js
      reservation.js
```

Phase 4 Member frontend modularization is complete. Phase 4D changes no visible markup or styling beyond the native-module cache version, no API/Firebase/Worker behavior, no Club/Points/History/Show & Shine/Account rules, and introduces no Rewards/Merch functionality.
