import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import worker from '../cloudflare-worker-media.js';
import { isProtectedMemberRoute } from '../worker/router.js';

const allowedOrigin = 'https://e36united.cz';
const firebaseJwksUrl = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const memberId = 'phase1b-member';
const now = Math.floor(Date.now() / 1000);
const keys = await crypto.subtle.generateKey({
  name: 'RSASSA-PKCS1-v1_5',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
}, true, ['sign', 'verify']);
const publicJwk = await crypto.subtle.exportKey('jwk', keys.publicKey);
Object.assign(publicJwk, { alg: 'RS256', kid: 'phase1b-test-key', use: 'sig' });

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

const tokenHeader = encodeJson({ alg: 'RS256', kid: publicJwk.kid, typ: 'JWT' });
const tokenPayload = encodeJson({
  aud: 'e36-united',
  iss: 'https://securetoken.google.com/e36-united',
  sub: memberId,
  email: 'phase1b@example.test',
  email_verified: true,
  name: 'Phase 1B Member',
  auth_time: now - 5,
  iat: now - 5,
  exp: now + 3600,
});
const tokenSignature = await crypto.subtle.sign(
  'RSASSA-PKCS1-v1_5',
  keys.privateKey,
  new TextEncoder().encode(`${tokenHeader}.${tokenPayload}`),
);
const firebaseToken = `${tokenHeader}.${tokenPayload}.${Buffer.from(tokenSignature).toString('base64url')}`;
const originalFetch = globalThis.fetch;

test.before(() => {
  globalThis.fetch = async (input, init) => {
    if (String(input) === firebaseJwksUrl) {
      return new Response(JSON.stringify({ keys: [publicJwk] }), {
        headers: { 'Cache-Control': 'max-age=3600', 'Content-Type': 'application/json' },
      });
    }
    return await originalFetch(input, init);
  };
});

test.after(() => {
  globalThis.fetch = originalFetch;
});

function createRuntime(member = null) {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE members (
      id TEXT PRIMARY KEY,
      member_code TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      nickname TEXT,
      phone TEXT,
      role TEXT NOT NULL DEFAULT 'member',
      status TEXT NOT NULL DEFAULT 'active',
      email_verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_login_at TEXT,
      history_completed_at TEXT
    );
    CREATE TABLE events (id TEXT PRIMARY KEY);
    CREATE TABLE cars (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      nickname TEXT,
      model TEXT,
      body TEXT,
      year INTEGER,
      color TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE car_photos (
      id TEXT PRIMARY KEY,
      car_id TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE gallery_submissions (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE united_points_ledger (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      delta INTEGER NOT NULL,
      source_type TEXT NOT NULL,
      source_key TEXT NOT NULL UNIQUE,
      reason TEXT NOT NULL
    );
  `);
  if (member) {
    database.prepare(`
      INSERT INTO members (id, member_code, email, name, nickname, phone, role, status, email_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      memberId,
      'EU-PHASE1B',
      'phase1b@example.test',
      'Phase 1B Member',
      'Guard',
      '',
      member.role || 'member',
      member.status,
      1,
    );
  }

  const queries = [];
  const DB = {
    prepare(sql) {
      queries.push(sql.replace(/\s+/g, ' ').trim());
      const statement = database.prepare(sql);
      let values = [];
      const prepared = {
        bind(...nextValues) {
          values = nextValues;
          return prepared;
        },
        async first() {
          return statement.get(...values) || null;
        },
        async all() {
          return { results: statement.all(...values) };
        },
        async run() {
          const result = statement.run(...values);
          return { meta: { changes: Number(result.changes || 0) } };
        },
      };
      return prepared;
    },
    async batch(statements) {
      return await Promise.all(statements.map(statement => statement.run()));
    },
  };

  return { database, env: { DB, MEDIA: {} }, queries };
}

function authenticatedRequest(path, method = 'GET') {
  return new Request(`https://api.e36united.cz${path}`, {
    method,
    headers: { Authorization: `Bearer ${firebaseToken}`, Origin: allowedOrigin },
  });
}

async function forbiddenBody(response) {
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), allowedOrigin);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: 'active_member_required',
    message: 'Aktivní členství je vyžadováno.',
  });
}

test('route classification covers every explicit protected Member contract and excludes public, bootstrap, Admin and unknown routes', () => {
  const protectedRoutes = [
    ['GET', '/api/navigation-state'],
    ['GET', '/api/united-club'],
    ['POST', '/api/history/claims'],
    ['POST', '/api/history/completed'],
    ['GET', '/api/history/evidence/evidence-1'],
    ['GET', '/api/planner-draft'],
    ['PUT', '/api/planner-draft'],
    ['DELETE', '/api/planner-draft'],
    ['GET', '/api/reservations/current'],
    ['PUT', '/api/reservations/current'],
    ['GET', '/api/cars'],
    ['POST', '/api/cars'],
    ['GET', '/api/cars/media/photo-1'],
    ['PUT', '/api/cars/car-1'],
    ['DELETE', '/api/cars/car-1'],
    ['POST', '/api/cars/car-1/primary'],
    ['POST', '/api/cars/car-1/photos'],
    ['PUT', '/api/cars/car-1/photos'],
    ['POST', '/api/gallery/submissions'],
    ['GET', '/api/gallery/mine'],
    ['GET', '/api/gallery/mine/media/submission-1'],
  ];
  for (const [method, pathname] of protectedRoutes) {
    assert.equal(isProtectedMemberRoute(method, pathname), true, `${method} ${pathname}`);
  }

  const exceptions = [
    ['GET', '/api/health'],
    ['GET', '/api/gallery/approved'],
    ['GET', '/api/events/current'],
    ['GET', '/api/accommodation/media/option-1'],
    ['GET', '/api/gallery/media/submission-1'],
    ['POST', '/api/bootstrap'],
    ['GET', '/api/me'],
    ['GET', '/api/admin/overview'],
    ['GET', '/api/unknown'],
  ];
  for (const [method, pathname] of exceptions) {
    assert.equal(isProtectedMemberRoute(method, pathname), false, `${method} ${pathname}`);
  }
});

test('valid Firebase identity with an active member reaches a protected Garage route', async () => {
  const runtime = createRuntime({ status: 'active' });
  const response = await worker.fetch(authenticatedRequest('/api/cars'), runtime.env);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, cars: [] });
  assert.equal(runtime.queries.some(sql => sql.includes('FROM members')), true);
  assert.equal(runtime.queries.some(sql => sql.includes('FROM cars c')), true);
  runtime.database.close();
});

for (const [status, path] of [
  ['inactive', '/api/cars'],
  ['blocked', '/api/reservations/current'],
  ['suspended', '/api/history/evidence/evidence-1'],
]) {
  test(`${status} member is denied before the protected domain handler`, async () => {
    const runtime = createRuntime({ status });
    const response = await worker.fetch(authenticatedRequest(path), runtime.env);

    await forbiddenBody(response);
    assert.equal(runtime.queries.length, 1);
    assert.equal(runtime.queries[0].includes('FROM members'), true);
    runtime.database.close();
  });
}

test('authenticated Firebase identity without a member row is denied protected Planner access', async () => {
  const runtime = createRuntime();
  const response = await worker.fetch(authenticatedRequest('/api/planner-draft'), runtime.env);

  await forbiddenBody(response);
  assert.equal(runtime.queries.length, 1);
  assert.equal(runtime.queries[0].includes('FROM members'), true);
  runtime.database.close();
});

test('public health remains accessible without Firebase or active-member authorization', async () => {
  const runtime = createRuntime();
  runtime.database.prepare("INSERT INTO events (id) VALUES ('event-1')").run();
  const response = await worker.fetch(new Request('https://api.e36united.cz/api/health', {
    headers: { Origin: allowedOrigin },
  }), runtime.env);

  assert.equal(response.status, 200);
  assert.equal((await response.json()).events, 1);
  assert.equal(runtime.queries.some(sql => sql.includes('FROM members')), false);
  runtime.database.close();
});

test('inactive member can still use /api/me to discover the current status', async () => {
  const runtime = createRuntime({ status: 'inactive' });
  const response = await worker.fetch(authenticatedRequest('/api/me'), runtime.env);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.profileExists, true);
  assert.equal(payload.member.id, memberId);
  assert.equal(payload.member.status, 'inactive');
  runtime.database.close();
});

test('missing member can still use bootstrap to create the current active profile', async () => {
  const runtime = createRuntime();
  const response = await worker.fetch(new Request('https://api.e36united.cz/api/bootstrap', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${firebaseToken}`,
      'Content-Type': 'application/json',
      Origin: allowedOrigin,
    },
    body: JSON.stringify({ name: 'Phase 1B Member', nickname: 'Guard' }),
  }), runtime.env);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.profileExists, true);
  assert.equal(payload.member.id, memberId);
  assert.equal(payload.member.status, 'active');
  runtime.database.close();
});

test('existing inactive member cannot use bootstrap as a profile-mutation bypass', async () => {
  const runtime = createRuntime({ status: 'blocked' });
  const response = await worker.fetch(authenticatedRequest('/api/bootstrap', 'POST'), runtime.env);

  await forbiddenBody(response);
  assert.equal(runtime.queries.length, 1);
  assert.equal(runtime.queries[0].includes('FROM members'), true);
  runtime.database.close();
});

test('Admin authorization stays separate from the Member guard', async () => {
  const activeAdmin = createRuntime({ role: 'admin', status: 'active' });
  const activeResponse = await worker.fetch(authenticatedRequest('/api/admin/unknown'), activeAdmin.env);
  assert.equal(activeResponse.status, 404);
  assert.equal((await activeResponse.json()).error, 'not_found');
  activeAdmin.database.close();

  const blockedAdmin = createRuntime({ role: 'admin', status: 'blocked' });
  const blockedResponse = await worker.fetch(authenticatedRequest('/api/admin/unknown'), blockedAdmin.env);
  assert.equal(blockedResponse.status, 403);
  assert.equal((await blockedResponse.json()).error, 'admin_forbidden');
  blockedAdmin.database.close();
});

test('Mailing routes stay behind the existing active-Admin authorization boundary', async () => {
  const activeAdmin = createRuntime({ role: 'admin', status: 'active' });
  const activeResponse = await worker.fetch(authenticatedRequest('/api/admin/mailing/unknown'), activeAdmin.env);
  assert.equal(activeResponse.status, 404);
  assert.equal((await activeResponse.json()).error, 'mailing_not_found');
  activeAdmin.database.close();

  const blockedAdmin = createRuntime({ role: 'admin', status: 'blocked' });
  const blockedResponse = await worker.fetch(authenticatedRequest('/api/admin/mailing/unknown'), blockedAdmin.env);
  assert.equal(blockedResponse.status, 403);
  assert.equal((await blockedResponse.json()).error, 'admin_forbidden');
  blockedAdmin.database.close();
});
