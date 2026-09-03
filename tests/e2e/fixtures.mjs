import { expect } from '@playwright/test';
import { createMailingStarterDraft, renderMailingTemplate } from '../../worker/domains/mailing/template.js';

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
  clubPayload = null,
  ignoreConsoleError = () => false,
} = {}) {
  const observations = { pageErrors: [], consoleErrors: [], unhandledApi: [], requests: [], reservationWrites: [], profileWrites: [] };
  let memberProfile = {
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
  };
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
        member: memberProfile,
      });
      return;
    }
    if (url.pathname === '/api/bootstrap' && request.method() === 'POST') {
      const body = request.postDataJSON();
      observations.profileWrites.push(body);
      memberProfile = { ...memberProfile, ...body };
      await jsonResponse(route, { member: memberProfile });
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
        ...(clubPayload || {}),
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

const adminEvent = {
  id: 'united-2026',
  year: 2026,
  title: 'E36 United 2026',
  isCurrent: true,
  registrationStatus: 'open',
  reservationCapacity: 120,
  accommodationCapacity: 12,
  fullWeekendNights: 2,
  saturdayOnlyNights: 1,
  bookingCommitmentCzk: 100_000,
  bookingDueAt: '2026-10-01',
  bookingPaidCzk: 40_000,
  eventEndAt: '2026-09-07',
  paymentTestMode: true,
};

const adminReservation = {
  id: 'reservation-admin-e2e',
  eventId: adminEvent.id,
  eventYear: adminEvent.year,
  member: { name: 'Eva Nováková', nickname: 'Eva', email: 'eva@example.test', memberCode: 'EU036' },
  carSnapshot: { id: 'car-001', nickname: 'Estoril', body: 'Coupé', model: '328i', year: 1996, color: 'Estoril Blau' },
  arrival: 'Sobota',
  crew: 3,
  attendanceType: 'saturday_only',
  accommodation: 'Chatka',
  accommodationUnits: 2,
  accommodationSnapshot: {
    optionId: 'cabin-premium', optionName: 'Chatka Premium', kind: 'cabin', capacityPerUnit: 3,
    peopleCount: 2, unitCount: 1, unitPriceCzk: 1_650, personPriceCzk: 0,
    beddingFeePerPersonCzk: 120, cityTaxPerPersonPerNightCzk: 25, nights: 1,
    baseTotalCzk: 1_650, personTotalCzk: 0, beddingTotalCzk: 240, cityTaxTotalCzk: 50, totalCzk: 1_940,
  },
  showShine: 'Ano',
  note: 'Příjezd po obědě.',
  reviewNote: '',
  status: 'approved',
  changePending: false,
  capacityConflict: false,
  submittedAt: '2026-08-20T09:00:00Z',
  updatedAt: '2026-08-27T10:00:00Z',
  reviewedAt: '2026-08-21T10:00:00Z',
  payment: {
    amountDueCzk: 4_800, amountPaidCzk: 1_200, balanceCzk: 3_600, remainingCzk: 3_600, overpaymentCzk: 0,
    status: 'underpaid', overdue: false, variableSymbol: '2026123456', accountDisplay: '123 / 9999',
    deadline: '2026-12-01', testMode: true, message: 'E36 UNITED 2026 2026123456',
    spayd: 'SPD*1.0*ACC:CZ5099990000000000000123*AM:3600.00*CC:CZK*X-VS:2026123456*MSG:E36 UNITED 2026 2026123456*DT:20261201',
  },
};

export async function prepareAdminE2ePage(page) {
  const observations = { pageErrors: [], consoleErrors: [], unhandledApi: [], requests: [], campaignWrites: [] };
  const mailingStarter=createMailingStarterDraft();
  let mailingCampaigns=[];
  page.on('pageerror', error => observations.pageErrors.push(error.stack || error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    observations.consoleErrors.push({ text: message.text(), url: message.location().url || '' });
  });

  await page.addInitScript(({ key }) => {
    try { localStorage.setItem(key, 'true'); } catch {}
  }, { key: MEMBER_SESSION_KEY });

  await page.route('https://static.wixstatic.com/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: imageSvg }));
  await page.route('https://e36united.cz/united-logo-blue-silver-transparent.png', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: imageSvg }));
  await page.route('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js', route => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: firebaseAppModule }));
  await page.route('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js', route => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: firebaseAuthModule }));

  await page.route(`${API_BASE}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    observations.requests.push(`${request.method()} ${url.pathname}`);
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS' } });
      return;
    }
    if (/\/api\/events\/united-2026\/accommodation\/[^/]+\/photo$/.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: imageSvg });
      return;
    }
    if (url.pathname === '/api/admin/events') {
      await jsonResponse(route, { events: [adminEvent] });
      return;
    }
    if (url.pathname === '/api/admin/overview') {
      await jsonResponse(route, {
        event: adminEvent,
        overview: {
          reservations: 1, people: 3, cars: 1,
          statuses: { pending: 0, approved: 1, rejected: 0, cancelled: 0 },
          attendance: { fullWeekend: 0, saturdayOnly: 1, dayVisit: 0 },
          showShine: { yes: 1, no: 0, maybe: 0 },
          accommodation: { units: 1, cabin: 1, tent: 0, none: 0 },
          payments: { paid: 0, unpaid: 0, underpaid: 1, overpaid: 0, overdue: 0, amountDueCzk: 4_800, amountPaidCzk: 1_200, amountRemainingCzk: 3_600 },
          gallery: { pending: 0 },
          history: { attendancePending: 0, snsPending: 0, pending: 0, approved: 0, rejected: 0, total: 0, latestPendingYear: null, latestYear: null, latestYearPending: 0, olderPending: 0 },
        },
      });
      return;
    }
    if (url.pathname === '/api/admin/reservations') {
      await jsonResponse(route, { reservations: [adminReservation] });
      return;
    }
    if (url.pathname === '/api/admin/accommodation') {
      await jsonResponse(route, { options: [{ ...accommodationOptions[1], approvedUnits: 1, pendingUnits: 0, pendingConflictUnits: 0 }] });
      return;
    }
    if (url.pathname === '/api/admin/gallery') {
      await jsonResponse(route, { photos: [] });
      return;
    }
    if (url.pathname === '/api/admin/history/claims') {
      await jsonResponse(route, {
        claims: [],
        counts: { attendancePending: 0, snsPending: 0, pending: 0, approved: 0, rejected: 0, total: 0, latestPendingYear: null, latestYear: null, latestYearPending: 0, olderPending: 0 },
        facets: { years: [] },
        pagination: { page: 1, pageSize: 24, total: 0, totalPages: 1 },
        filters: { status: url.searchParams.get('status') || 'pending', type: url.searchParams.get('type') || 'all', year: url.searchParams.get('year') || 'all', q: url.searchParams.get('q') || '' },
      });
      return;
    }
    if (url.pathname === '/api/admin/mailing/overview') {
      await jsonResponse(route, {
        overview: { totalContacts: 4, currentMembers: 2, historicalOnly: 1, eligible: 1, suppressed: 1, reviewRequired: 1, campaignDrafts: 1 },
      });
      return;
    }
    if (url.pathname === '/api/admin/mailing/segments/preview' && request.method() === 'POST') {
      const segment=request.postDataJSON()?.segment||{};
      await jsonResponse(route, {
        definition: { match: segment.match||'all', rules: segment.rules||[], exclusions: segment.exclusions||[] },
        count: 1,
        recipients: [{
          id: 'contact-e2e', email: 'eva@example.test', name: 'Eva Nováková', nickname: 'Eva',
          memberId, eventYears: [2026,2025], eligibility: { status: 'eligible', reason: 'explicit_mailing_consent' },
        }],
        truncated: false,
      });
      return;
    }
    if (url.pathname === '/api/admin/mailing/editor-config' && request.method() === 'GET') {
      await jsonResponse(route,{starter:mailingStarter,blockTypes:['hero','heading','rich_text','image','cta','divider','highlight','survey']});
      return;
    }
    if (url.pathname === '/api/admin/mailing/render-preview' && request.method() === 'POST') {
      await jsonResponse(route,{preview:renderMailingTemplate(request.postDataJSON())});
      return;
    }
    if (url.pathname === '/api/admin/mailing/campaigns' && request.method() === 'GET') {
      await jsonResponse(route,{campaigns:mailingCampaigns});
      return;
    }
    if (url.pathname === '/api/admin/mailing/campaigns' && request.method() === 'POST') {
      const body=request.postDataJSON(),now='2026-09-03T18:00:00Z';
      const campaign={id:'campaign-e2e',internalName:body.internalName,subject:body.subject,preheader:body.preheader,templateVersion:body.templateVersion,content:body.content,segment:body.segment,recipientCount:0,status:'draft',createdAt:now,updatedAt:now,sentAt:null};
      mailingCampaigns=[campaign];observations.campaignWrites.push({method:'POST',body});
      await jsonResponse(route,{campaign},201);
      return;
    }
    const mailingCampaignMatch=url.pathname.match(/^\/api\/admin\/mailing\/campaigns\/([^/]+)$/);
    if (mailingCampaignMatch && request.method() === 'PATCH') {
      const body=request.postDataJSON(),current=mailingCampaigns.find(campaign=>campaign.id===mailingCampaignMatch[1]);
      const campaign={...current,...body,id:current.id,recipientCount:0,status:'draft',updatedAt:'2026-09-03T18:05:00Z'};
      mailingCampaigns=mailingCampaigns.map(item=>item.id===campaign.id?campaign:item);observations.campaignWrites.push({method:'PATCH',body});
      await jsonResponse(route,{campaign});
      return;
    }

    observations.unhandledApi.push(`${request.method()} ${url.pathname}`);
    await jsonResponse(route, { message: 'Unhandled Admin E2E API fixture' }, 501);
  });

  return observations;
}

export function expectNoUnexpectedClientErrors(observations) {
  expect(observations.pageErrors, 'uncaught page errors').toEqual([]);
  expect(observations.consoleErrors, 'unexpected browser console errors').toEqual([]);
  expect(observations.unhandledApi, 'API requests missing deterministic fixtures').toEqual([]);
}
