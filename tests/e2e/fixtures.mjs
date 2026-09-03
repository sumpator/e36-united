import { expect } from '@playwright/test';

export const MEMBER_SESSION_KEY = 'e36UnitedE2eAuthenticated';
const API_BASE = 'https://api.e36united.cz';
const memberId = 'e2e-member-001';
const imageSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#17334d"/></svg>';

export const accommodationOptions = [
  {
    id: 'cabin-standard',
    eventId: 'united-2026',
    name: 'Chatka Standard',
    kind: 'cabin',
    inventoryMode: 'limited',
    unitsTotal: 8,
    freeUnits: 5,
    capacityPerUnit: 4,
    unitPriceCzk: 1_200,
    personPriceCzk: 0,
    beddingFeePerPersonCzk: 120,
    cityTaxPerPersonPerNightCzk: 25,
    active: true,
    soldOut: false,
    sortOrder: 1,
    visual: {
      hasCustomPhoto: true,
      imageUrl: '/api/events/united-2026/accommodation/cabin-standard/photo?v=standard-v1',
      version: 'standard-v1',
    },
  },
  {
    id: 'cabin-premium',
    eventId: 'united-2026',
    name: 'Chatka Premium',
    kind: 'cabin',
    inventoryMode: 'limited',
    unitsTotal: 4,
    freeUnits: 2,
    capacityPerUnit: 3,
    unitPriceCzk: 1_650,
    personPriceCzk: 0,
    beddingFeePerPersonCzk: 120,
    cityTaxPerPersonPerNightCzk: 25,
    active: true,
    soldOut: false,
    sortOrder: 2,
    visual: {
      hasCustomPhoto: true,
      imageUrl: '/api/events/united-2026/accommodation/cabin-premium/photo?v=premium-v1',
      version: 'premium-v1',
    },
  },
];

const currentEvent = {
  id: 'united-2026',
  year: 2026,
  title: 'E36 United 2026',
  registrationOpen: false,
  fullWeekendNights: 2,
  saturdayOnlyNights: 1,
};

const firebaseAppModule = `
const apps = [];
export function getApps() { return apps; }
export function initializeApp(config) { const app = { config, name: '[DEFAULT]' }; apps.push(app); return app; }
`;

const firebaseAuthModule = `
const sessionKey = ${JSON.stringify(MEMBER_SESSION_KEY)};
const listeners = new Set();
const auth = { currentUser: null };
const createUser = () => ({
  uid: ${JSON.stringify(memberId)},
  email: 'eva@example.test',
  displayName: 'Eva Nováková',
  emailVerified: true,
  getIdToken: async () => 'e2e-member-token'
});
const sessionUser = () => localStorage.getItem(sessionKey) === 'true' ? createUser() : null;
const publish = user => { auth.currentUser = user; for (const listener of listeners) listener(user); };
export const browserLocalPersistence = { type: 'LOCAL' };
export function getAuth() { return auth; }
export async function setPersistence() {}
export function onAuthStateChanged(target, next) {
  listeners.add(next);
  queueMicrotask(() => { const user = sessionUser(); target.currentUser = user; next(user); });
  return () => listeners.delete(next);
}
export async function signOut() { localStorage.setItem(sessionKey, 'false'); publish(null); }
export async function signInWithEmailAndPassword() { localStorage.setItem(sessionKey, 'true'); const user = createUser(); publish(user); return { user }; }
export async function createUserWithEmailAndPassword() { const user = createUser(); return { user }; }
export async function updateProfile() {}
export async function sendEmailVerification() {}
export async function sendPasswordResetEmail() {}
`;

function jsonResponse(route, payload, status = 200) {
  return route.fulfill({
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(payload),
  });
}

export async function prepareE2ePage(page, {
  authenticated = false,
  carsFailure = false,
  memberStatus = 'active',
  registrationOpen = false,
  reservation = null,
  ignoreConsoleError = () => false,
} = {}) {
  const observations = { pageErrors: [], consoleErrors: [], unhandledApi: [], requests: [], reservationWrites: [] };
  page.on('pageerror', error => observations.pageErrors.push(error.stack || error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const entry = { text: message.text(), url: message.location().url || '' };
    if (!ignoreConsoleError(entry)) observations.consoleErrors.push(entry);
  });

  await page.addInitScript(({ key, initialValue }) => {
    try {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, initialValue);
    } catch {}
  }, { key: MEMBER_SESSION_KEY, initialValue: authenticated ? 'true' : 'false' });

  await page.route('https://static.wixstatic.com/**', route => route.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    body: imageSvg,
  }));
  await page.route('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js', route => route.fulfill({
    status: 200,
    contentType: 'text/javascript; charset=utf-8',
    body: firebaseAppModule,
  }));
  await page.route('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js', route => route.fulfill({
    status: 200,
    contentType: 'text/javascript; charset=utf-8',
    body: firebaseAuthModule,
  }));

  await page.route(`${API_BASE}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    observations.requests.push(`${request.method()} ${url.pathname}`);

    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        },
      });
      return;
    }
    if (/\/api\/events\/united-2026\/accommodation\/[^/]+\/photo$/.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: imageSvg });
      return;
    }
    if (url.pathname === '/api/events/current') {
      await jsonResponse(route, { event: currentEvent, accommodationOptions });
      return;
    }
    if (url.pathname === '/api/navigation-state') {
      await jsonResponse(route, { hasWaitingPlan: false, hasReservation: false });
      return;
    }
    if (url.pathname === '/api/me') {
      await jsonResponse(route, {
        profileExists: true,
        member: {
          id: memberId,
          memberCode: 'EU036',
          name: 'Eva Nováková',
          nickname: 'Eva',
          email: 'eva@example.test',
          phone: '+420 700 000 036',
          role: 'member',
          status: memberStatus,
          emailVerified: true,
          createdAt: '2021-06-01T00:00:00.000Z',
        },
      });
      return;
    }
    if (url.pathname === '/api/cars') {
      if (carsFailure) {
        await jsonResponse(route, { message: 'garage_fixture_unavailable' }, 503);
        return;
      }
      await jsonResponse(route, {
        cars: [{
          id: 'car-001',
          nickname: 'Estoril',
          body: 'Coupé',
          model: '328i',
          year: 1996,
          color: 'Estoril Blau',
          primary: true,
          photos: [],
        }],
      });
      return;
    }
    if (url.pathname === '/api/reservations/current') {
      if (request.method() === 'PUT') {
        const body = request.postDataJSON();
        observations.reservationWrites.push(body);
        await jsonResponse(route, {
          registrationOpen,
          event: currentEvent,
          reservation: {
            ...(reservation || {}),
            id: reservation?.id || 'reservation-e2e-created',
            eventId: reservation?.eventId || currentEvent.id,
            eventYear: reservation?.eventYear || currentEvent.year,
            title: reservation?.title || currentEvent.title,
            carId: body.carId,
            arrival: body.arrival,
            crew: body.crew,
            attendanceType: body.attendanceType,
            accommodation: body.accommodation,
            accommodationUnits: body.accommodationUnits,
            showShine: body.showShine,
            note: body.note,
          },
          message: 'Rezervace byla uložena.',
          accommodationOptions,
        });
        return;
      }
      await jsonResponse(route, {
        registrationOpen,
        event: currentEvent,
        reservation,
        message: 'Registrace zatím není otevřená.',
        accommodationOptions,
      });
      return;
    }
    if (url.pathname === '/api/planner-draft') {
      await jsonResponse(route, { draft: null });
      return;
    }
    if (url.pathname === '/api/united-club') {
      await jsonResponse(route, {
        ok: true,
        points: { available: 7, lifetime: 9 },
        rewardThreshold: 12,
        rating: { key: '328i', name: '328i', minPoints: 8 },
        memberSince: '2021',
        historyCompletedAt: null,
        history: [],
        approvedPhotoCount: 0,
        profileCompletion: {},
        achievements: [],
        featuredAchievements: [],
      });
      return;
    }
    if (url.pathname === '/api/gallery/mine') {
      await jsonResponse(route, { submissions: [], pagination: { hasMore: false } });
      return;
    }

    observations.unhandledApi.push(`${request.method()} ${url.pathname}`);
    await jsonResponse(route, { message: 'Unhandled E2E API fixture' }, 501);
  });

  return observations;
}

export function expectNoUnexpectedClientErrors(observations) {
  expect(observations.pageErrors, 'uncaught page errors').toEqual([]);
  expect(observations.consoleErrors, 'unexpected browser console errors').toEqual([]);
  expect(observations.unhandledApi, 'API requests missing deterministic fixtures').toEqual([]);
}
