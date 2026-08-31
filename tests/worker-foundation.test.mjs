import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../cloudflare-worker-media.js';
import { optionsResponse } from '../worker/http/cors.js';
import { json } from '../worker/http/responses.js';

const allowedOrigin = 'https://e36united.cz';

test('allowed OPTIONS keeps the existing 204 CORS contract', () => {
  const response = optionsResponse(allowedOrigin);

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), allowedOrigin);
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  assert.equal(response.headers.get('Access-Control-Allow-Headers'), 'Authorization, Content-Type');
  assert.equal(response.headers.get('Vary'), 'Origin');
});

test('disallowed OPTIONS keeps the existing bare 403 response', () => {
  const response = optionsResponse('https://example.com');

  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});

test('JSON helper preserves status, body, cache and allowed-origin headers', async () => {
  const response = json({ ok: false, error: 'characterized' }, 409, allowedOrigin);

  assert.equal(response.status, 409);
  assert.equal(response.headers.get('Content-Type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), allowedOrigin);
  assert.deepEqual(await response.json(), { ok: false, error: 'characterized' });
});

test('public health route still dispatches before authentication', async () => {
  const env = {
    DB: {
      prepare(sql) {
        assert.equal(sql, 'SELECT COUNT(*) AS count FROM events');
        return { first: async () => ({ count: 7 }) };
      },
    },
    MEDIA: {},
  };
  const response = await worker.fetch(new Request('https://api.e36united.cz/api/health', {
    headers: { Origin: allowedOrigin },
  }), env);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    service: 'e36-united-api',
    database: true,
    events: 7,
    media: true,
    auth: 'firebase',
  });
});

test('unknown API route still requires Firebase authentication', async () => {
  const response = await worker.fetch(new Request('https://api.e36united.cz/api/unknown'), {});

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { ok: false, authenticated: false, error: 'Unauthorized' });
});

test('unknown non-API route keeps the existing generic success fallback', async () => {
  const response = await worker.fetch(new Request('https://api.e36united.cz/not-an-api-route'), {});

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: 'E36 United API' });
});
