# Admin frontend foundation

Phase 5 keeps the Admin Portal as a native ES-module application with no framework or build step. The visible Admin UI, DOM contracts, Firebase session flow and Worker API contracts are unchanged.

## Module structure

```text
admin.js
admin/
  api.js
  state.js
  shell.js
  ui.js
  modules/
    dashboard-events.js
    accommodation.js
    reservations-payments.js
    moderation.js
```

- `admin.js` owns Firebase bootstrap, Admin session orchestration, refresh-all coordination, module initialization and delegated cross-domain DOM events.
- `admin/api.js` owns authenticated JSON, private-media and upload requests, including the existing single forced-token retry after HTTP 401.
- `admin/state.js` owns the small shared mutable state required across Admin areas and the existing session-backed filter/view defaults.
- `admin/shell.js` owns auth/Admin/denied view switching, loading state, persistent Admin navigation and collapsible sections.
- `admin/ui.js` owns common DOM, escaping, formatting, label, QR, toast and session-preference helpers.
- `admin/modules/dashboard-events.js` owns Dashboard KPIs/action counts, event selection/settings rendering and the existing event update payload.
- `admin/modules/accommodation.js` owns accommodation rendering, configuration mutations and its local photo selection/object-URL lifecycle.
- `admin/modules/reservations-payments.js` owns reservation filters/tables/drawer, payment filters/presentation and the existing reservation/payment mutations.
- `admin/modules/moderation.js` owns Community Gallery plus History/Show & Shine queues, filters, reviews, private-media caches, lightboxes and object-URL cleanup.

## Bootstrap and request flow

1. `admin.js` initializes Firebase Auth and keeps local persistence.
2. The auth observer stores the current Firebase user in shared Admin state.
3. `admin.js` loads events and the current event-scoped Dashboard, reservations and accommodation data alongside the two moderation queues.
4. Domain modules render into the existing `admin.html` IDs, classes and data attributes.
5. Mutations use the shared authenticated request helpers, preserve the existing payloads and trigger the same event-scoped or full refresh paths.
6. A denied Admin response still switches to the existing denied view; logout releases private media and returns to the login view.

## Cross-domain coordination retained in `admin.js`

The composition layer intentionally retains selected-event refresh orchestration, refresh-all ordering, auth-state reset, overlay coordination and delegated DOM routing. Dashboard action counts continue to read the same shared reservation, gallery and history state. Reservations and Payments remain together because they share one authoritative reservation payload and drawer.

No Worker, Member Portal, public-site, CSS, business-rule, Firebase configuration, D1 or R2 behavior was changed by this refactor.
