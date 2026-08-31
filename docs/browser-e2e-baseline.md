# Browser E2E baseline

This Phase 0B baseline uses Playwright 1.62.1 with Chromium. It exercises the existing static frontend through a small local HTTP server; it does not start a Worker or connect to production services.

## Run locally

```text
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test:e2e
```

Playwright starts `tests/e2e/server.mjs` on `127.0.0.1:4173`. Firebase browser modules and `https://api.e36united.cz` requests are intercepted in the browser and answered with deterministic fixtures. The member identity, cars, reservation state, United Club state, gallery state, event, accommodation options, and accommodation images are synthetic. No production credential is required and no production request is allowed to fall through.

## Covered behavior

- Desktop `1440 x 900`: public homepage/navigation smoke, authenticated Member Portal bootstrap on `Přehled`, identity summary, representative Member navigation, session restoration after reload, desktop logout, Garage API failure isolation, and Weekend Planner accommodation preview switching.
- Mobile `390 x 844`: authenticated logout through the main hamburger navigation and Weekend Planner accommodation preview switching in the responsive presentation.
- Critical tests collect uncaught page errors and unexpected console errors. The Garage failure test permits only a browser resource diagnostic tied to its deliberately mocked `/api/cars` 503 response; application warnings remain visible to Playwright but are not treated as fatal console errors.

The Garage fixture failure currently degrades to the ordinary empty-Garage presentation while the authenticated portal, profile, and other navigation remain usable. That conflates “unavailable” with “no cars” and deserves a later domain-state/UX task; the regression test asserts isolation, not the ambiguous fallback copy. Reload currently restores the authenticated session and returns the portal to its default `Přehled` section.

## Deliberate limits

This suite does not cover Admin, real Firebase login/registration, production Worker/D1/R2 behavior, uploads, payments, reservation mutations, Points mutations, moderation, full gallery behavior, email, third-party routing, pixel-level visual regression, or every public page. Those domains remain covered only where the existing Node suite already characterizes them.

No production markup hooks were added: the suite uses existing semantic text, roles, and `data-*` attributes. A later task may add staging-backed contract coverage, but it should remain separate from this deterministic browser safety net.

## CI

GitHub Actions installs the pinned development dependency and Chromium, then runs the same browser suite after the existing Node tests and JavaScript syntax checks. The job uses no production secrets and contains no deployment, D1, or R2 step.
