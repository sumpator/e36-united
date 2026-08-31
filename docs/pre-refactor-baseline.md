# E36 United pre-refactor baseline

Verified on 2026-08-31 against `main` at `8bd711ca6c92682b8bef8a3290f7c09fdff0d575`. The starting working tree was clean and the local HEAD matched the available `origin/main` ref. This document characterizes the current system; it is not a target design.

## Runtime architecture

E36 United is a static, multi-page frontend hosted on Cloudflare Pages. It talks to one Cloudflare Worker, one D1 database, one private R2 bucket, and Firebase Authentication. There is no frontend framework or application build step in the repository.

### Frontend entry points

| Entry point | Current responsibilities |
| --- | --- |
| `index.html` + `main.js` (about 1,438 lines) | Public homepage, navigation, interactive content, Weekend Planner, public current-event/accommodation loading, Planner handoff, and ancillary map/routing UI. |
| `member.html` + `member.js` (about 1,355 lines) | Firebase session/bootstrap, portal navigation, Overview/Action Center, profile/account, Garage and private car media, member gallery, Weekend Planner draft handoff, reservations/payments, history claims, United Points, rating, achievements, and rewards UI. |
| `admin.html` + `admin.js` (about 814 lines) | Firebase Admin login/session, dashboard, events, reservations, payments, accommodation configuration/photos, gallery moderation, history moderation, filters, drawers, lightboxes, and session-persisted view state. |
| `galerie.html` + `gallery.js` | Public approved gallery plus authenticated community uploads. |
| `merch.html` + `merch.js` | Public merch UI plus authenticated United Club benefit state. |
| `o-nas.html` | Static history/about page with shared public behavior from `main.js`. |

Some responsibilities are already in small ES modules: `united-auth.js`, `portal-navigation.js`, `member-portal-state.js`, `planner-state.js`, `member-logout.js`, `public-member-state.js`, `image-upload.js`, `accommodation-visual.js`, and `admin-view-model.js`. The main Member and Admin controllers still coordinate most domains directly.

### Worker

`cloudflare-worker-media.js` is the sole Worker entry point configured by `wrangler.jsonc`. It is about 2,860 lines and contains:

- request routing, CORS, JSON responses, and top-level error handling;
- Firebase JWT/JWKS verification and the Admin role/status check;
- public event, accommodation, gallery, and media endpoints;
- member bootstrap/profile, Planner drafts, reservations, payments, Garage, gallery, history, Points, and achievements;
- Admin dashboards, events, accommodation, reservations/payments, gallery moderation, and history moderation;
- D1 SQL, R2 key construction/streaming, upload validation, pricing, capacity, SPAYD, and response mapping.

The router currently exposes 45 explicit method/path contracts plus shared `OPTIONS` handling. See `docs/api-contract-baseline.md` for the route-level inventory.

### D1

The Worker receives one D1 binding named `DB`, configured for `e36-united-db`. Production metadata was inspected read-only on 2026-08-31 through Wrangler 4.127.1 using `sqlite_master`, `PRAGMA foreign_keys`, and table-valued column/index/foreign-key PRAGMAs.

The verified application schema contains 20 tables, 20 explicit indexes, and two triggers. Cloudflare's internal `_cf_KV` table is not an application object and is deliberately excluded from `db/schema.sql`. The main active domains use `members`, `events`, `cars`, `car_photos`, `gallery_submissions`, `reservations`, `event_accommodation_options`, `reservation_accommodation`, `member_planner_drafts`, `admin_actions`, `united_history_claims`, `united_history_evidence`, and `united_points_ledger`. Additional legacy or currently inactive tables remain part of the production schema and are retained in the snapshot.

Server code remains authoritative for reservation pricing/snapshots, capacity, payment totals and variable symbols, review states, United Points, rating, and achievements.

### R2

The Worker receives one private R2 binding named `MEDIA`, configured for `e36-united-media` in the EU jurisdiction. Current object families are:

- `cars/{uid}/{carId}/...` for owner-private car photos;
- `gallery/{uid}/...` for moderated member gallery submissions;
- `history-proof/{uid}/{claimId}/...` for owner/Admin-only evidence;
- `accommodation/{eventId}/{optionId}/cover` for centrally configured accommodation photos.

Media is served through Worker endpoints after D1 ownership/status/Admin checks. The bucket is not used as a public origin. Approved gallery and accommodation images have public application endpoints; private member and evidence media remain authorized.

### Firebase Authentication

Firebase is the identity provider. Browser code loads Firebase Auth, uses local persistence, and sends Firebase ID tokens as Bearer tokens. The Worker verifies RS256 signatures against Google's Firebase JWKS and validates issuer, audience, expiry, issued-at, auth time, and UID. Firebase UID is the D1 ownership key.

`firestore.rules`, `storage.rules`, and the public `storageBucket` configuration remain in the repository, but current application code does not use Firestore or Firebase Storage as application storage.

## Tests and verification

The repository has 14 `node:test` files under `tests/`. The suite mixes:

- pure helper/state tests;
- source/markup characterization assertions;
- in-memory SQLite domain tests through `node:sqlite`;
- Worker calls with mocked D1/R2 bindings;
- authentication/session unit tests.

Baseline command and result:

```text
node --test tests/*.mjs
182 tests, 182 passed, 0 failed
```

All 17 first-party root JavaScript files also pass `node --check`. There is no real browser runner, Playwright/Cypress configuration, or browser E2E suite; that remains Phase 0B scope.

## Deployment and operations files

- `wrangler.jsonc` identifies the single Worker entry point and its D1/R2 bindings.
- The repository itself is the static Pages payload; there is no build manifest or package manager manifest.
- `MEDIA-DEPLOY.md`, `PAYMENT-DEPLOY.md`, and `PORTAL-SETUP.md` are historical/manual rollout notes and must not override current code or tests where their descriptions have aged.
- `.github/workflows/ci.yml` supplies the Phase 0A test and syntax-only CI baseline. It has no deploy step, secrets, D1 access, or Cloudflare write.

## Current architectural hotspots

| File | Approximate lines | Why it is a hotspot |
| --- | ---: | --- |
| `cloudflare-worker-media.js` | 2,860 | Router, infrastructure, authentication, every business domain, D1 queries, and R2 operations share one module. |
| `main.js` | 1,438 | Public-site interactions and the full Weekend Planner/handoff logic share one script. |
| `member.js` | 1,355 | Session/bootstrap and almost every Member Portal domain are coordinated in one controller. |
| `admin.js` | 814 | All Admin agendas, API access, filters, media lifecycles, and modal/drawer behavior share one controller. |

File size alone is not treated as a defect. These files are recorded because responsibility concentration increases change risk.

## Verified behavior boundaries

- The previously reported mobile accommodation-preview issue is not current. The shared accommodation visual code and `tests/accommodation-visual-system.test.mjs` characterize desktop/mobile preview propagation as working behavior to preserve.
- Current HEAD already implements centrally configured Admin accommodation photos, a shared accommodation visual model, public delivery, and a text-free generated fallback. This Phase 0A work does not modify that feature.
- Phase 0A intentionally makes no production JavaScript, HTML, CSS, API, authentication, reservation, payment, Points, media, or responsive-UI change.
