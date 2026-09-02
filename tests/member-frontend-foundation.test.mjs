import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemberApiClient } from '../member/api.js';
import { loadMemberSessionSnapshot } from '../member/refresh.js';
import { apiError, authError, authOrApiError } from '../member/session.js';
import { createMemberData, normalizeMember } from '../member/state.js';

const jsonResponse = (status, payload) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

test('Member API JSON requests preserve auth, serialization, cache and response parsing', async () => {
  const calls = [];
  const user = { getIdToken: async () => 'member-token' };
  const api = createMemberApiClient({
    baseUrl: 'https://api.e36united.cz',
    getCurrentUser: () => user,
    fetchRequest: async (url, options) => { calls.push({ url, options }); return jsonResponse(200, { ok: true }); },
  });

  assert.deepEqual(await api.request('/api/bootstrap', { method: 'POST', body: { nickname: 'Driver' } }), { ok: true });
  assert.equal(calls[0].url, 'https://api.e36united.cz/api/bootstrap');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(calls[0].options.headers, { Authorization: 'Bearer member-token', 'Content-Type': 'application/json' });
  assert.equal(calls[0].options.body, JSON.stringify({ nickname: 'Driver' }));
  assert.equal(calls[0].options.cache, 'no-store');
});

test('Member API retries one 401 with a forced fresh token and preserves the request', async () => {
  const tokenCalls = [], requests = [];
  const user = { getIdToken: async force => { tokenCalls.push(force); return force ? 'fresh-token' : 'old-token'; } };
  const api = createMemberApiClient({
    baseUrl: 'https://api.e36united.cz',
    getCurrentUser: () => user,
    fetchRequest: async (url, options) => {
      requests.push({ url, options });
      return requests.length === 1 ? jsonResponse(401, { error: 'unauthorized' }) : jsonResponse(200, { ok: true });
    },
  });

  assert.deepEqual(await api.request('/api/me'), { ok: true });
  assert.deepEqual(tokenCalls, [undefined, true]);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer old-token');
  assert.equal(requests[1].options.headers.Authorization, 'Bearer fresh-token');
});

test('Member API keeps FormData and blob request behavior distinct from JSON requests', async () => {
  const calls = [], form = new FormData();
  form.append('caption', 'United');
  const user = { getIdToken: async () => 'member-token' };
  const api = createMemberApiClient({
    baseUrl: 'https://api.e36united.cz',
    getCurrentUser: () => user,
    fetchRequest: async (url, options) => {
      calls.push({ url, options });
      return calls.length === 1 ? jsonResponse(200, { ok: true }) : new Response(new Blob(['photo']), { status: 200 });
    },
  });

  assert.deepEqual(await api.requestForm('/api/gallery/submissions', form), { ok: true });
  assert.equal(calls[0].options.body, form);
  assert.deepEqual(calls[0].options.headers, { Authorization: 'Bearer member-token' });
  assert.equal(await (await api.requestBlob('/api/cars/media/photo-1')).text(), 'photo');
  assert.equal(calls[1].options.method, undefined);
  assert.equal(calls[1].options.cache, 'no-store');
});

test('Member startup refresh preserves domain fallbacks and returns the original session snapshot', async () => {
  const failures = [];
  const snapshot = await loadMemberSessionSnapshot({
    loadCars: async () => { throw new Error('cars_down'); },
    loadReservation: async () => ({ id: 'reservation-1' }),
    loadPlannerDraft: async () => ({ available: true, draft: { draftId: 'draft-1' } }),
    loadClub: async () => ({ points: { available: 3 } }),
    loadGallery: async () => { throw new Error('gallery_down'); },
    onCarsError: error => failures.push(error.message),
    onGalleryError: error => failures.push(error.message),
  });

  assert.deepEqual(snapshot, {
    cars: [],
    reservation: { id: 'reservation-1' },
    plannerDraftResult: { available: true, draft: { draftId: 'draft-1' } },
    club: { points: { available: 3 } },
  });
  assert.deepEqual(failures, ['cars_down', 'gallery_down']);
});

test('Member state creates isolated defaults and preserves profile normalization fallbacks', () => {
  const first = createMemberData(), second = createMemberData();
  first.cars.push({ id: 'car-1' });
  assert.deepEqual(second.cars, []);
  assert.deepEqual(normalizeMember({ profile: { uid: 'uid-1', member_code: 'E36-1', email_verified: 1 } }, { email: 'driver@example.com' }), {
    id: 'uid-1',
    memberCode: 'E36-1',
    name: 'driver',
    nickname: 'Driver',
    email: 'driver@example.com',
    phone: '',
    role: 'member',
    status: 'active',
    emailVerified: true,
    createdAt: '',
    updatedAt: '',
  });
});

test('Member session error copy keeps existing Firebase and API classifications', () => {
  assert.equal(authError({ code: 'auth/invalid-credential' }), 'E-mail nebo heslo nesedí.');
  assert.equal(apiError({ message: 'member_inactive' }), 'Tento členský účet není aktivní.');
  assert.equal(authOrApiError({ status: 403 }), 'Z této domény se do Můj United nelze připojit.');
  assert.equal(authOrApiError({ code: 'auth/weak-password' }), 'Heslo musí mít alespoň 6 znaků.');
});
