import test from 'node:test';
import assert from 'node:assert/strict';
import { mailingRuntime, contact, draft, confirmation } from './helpers/mailing-runtime.mjs';
import { prepareCampaign, campaignRow, frozenRecipients } from '../worker/domains/mailing/preparation.js';
import { syncCampaign, sendCampaign, testCampaign } from '../worker/domains/mailing/delivery.js';
import { createBrevoAdapter, bulkImportPayload, BREVO_IMPORT_MAX_BYTES, BREVO_REQUEST_BUDGET } from '../worker/domains/mailing/provider/brevo.js';

// Entire transport is synthetic. Unexpected endpoints fail; never fall through to real fetch.
function transport(env) {
  const state = { calls: [], status: 'completed', processId: 77, emails: [], checkError: null, importError: null, partial: false, blacklisted: false };
  env.BREVO_API_KEY = 'fixture-only';
  state.adapter = () => createBrevoAdapter(env, { timeoutMs: 10, fetchImpl: async (url, options) => {
    const path = new URL(url).pathname, body = options.body && JSON.parse(options.body);
    state.calls.push({ path, method: options.method, body });
    if (path === '/v3/senders') return Response.json({ senders: [{ email: 'info@e36united.cz', active: true }] });
    if (path === '/v3/senders/domains/e36united.cz') return Response.json({ verified: true, authenticated: true });
    if (path === '/v3/contacts/lists') return Response.json({ id: 11 }, { status: 201 });
    if (path === '/v3/contacts/import') {
      if (state.importError) return Response.json({}, { status: state.importError });
      state.emails = body.jsonBody.map(c => c.email);
      return Response.json({ processId: ++state.processId }, { status: 202 });
    }
    if (path.startsWith('/v3/processes/')) {
      if (state.checkError === 'timeout') return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(Error('fixture timeout'))));
      if (state.checkError === 'malformed') return Response.json({ id: state.processId, status: 'unknown', secret: 'never expose' });
      return Response.json({ id: state.processId, status: state.status });
    }
    if (path === '/v3/contacts/lists/11/contacts') {
      const offset = Number(new URL(url).searchParams.get('offset'));
      const emails = state.partial ? state.emails.slice(1) : state.emails;
      return Response.json({ count: emails.length, contacts: emails.slice(offset, offset + 500).map(email => ({ email, emailBlacklisted: state.blacklisted })) });
    }
    if (path === '/v3/emailCampaigns') return Response.json({ id: 22 }, { status: 201 });
    if (path === '/v3/emailCampaigns/22/sendNow' || path === '/v3/emailCampaigns/22/sendTest') return new Response(null, { status: 204 });
    throw Error(`Unexpected mocked endpoint ${path}`);
  } });
  return state;
}
async function prepared(count = 1) {
  const r = mailingRuntime();
  for (let i = 0; i < count; i++) contact(r.db, `person${i}`);
  contact(r.db, 'suppressed', 'unsubscribed');
  const c = await draft(r.env), row = await prepareCampaign(r.env, c.id, confirmation(c, count));
  return { ...r, c, row, provider: transport(r.env) };
}
const sendConfirmation = r => ({ preparationId: r.row.preparation_id, recipientCount: r.row.recipient_count });
const countPath = (p, path) => p.calls.filter(c => c.path === path).length;

for (const count of [1, 50, 300]) test(`bulk sync ${count}: exactly 7 fetches, 0 repeated-sync fetches, separate send 3`, async () => {
  const r = await prepared(count), p = r.provider;
  try {
    const frozen = await frozenRecipients(r.env, r.c.id);
    contact(r.db, 'added-after-freeze');
    r.db.exec("UPDATE mailing_contacts SET name='Unrelated Member detail'");
    const synced = await syncCampaign(r.env, r.c.id, p.adapter());
    assert.equal(synced.provider_status, 'synced');
    assert.equal(synced.provider_import_process_id, 78);
    assert.equal(p.calls.length, 7);
    assert.ok(p.calls.length < 20 && BREVO_REQUEST_BUDGET < 50);
    const imports = p.calls.filter(c => c.path === '/v3/contacts/import');
    assert.equal(imports.length, 1);
    assert.deepEqual(imports[0].body, { jsonBody: frozen.map(f => ({ email: f.normalized_email })), listIds: [11], updateExistingContacts: true, disableNotification: true });
    assert.equal(imports[0].body.jsonBody.length, count);
    assert.equal(countPath(p, '/v3/contacts'), 0);
    assert.deepEqual(await frozenRecipients(r.env, r.c.id), frozen);
    await syncCampaign(r.env, r.c.id, p.adapter());
    assert.equal(p.calls.length, 7);
    await sendCampaign(r.env, r.c.id, sendConfirmation(r), p.adapter());
    assert.equal(p.calls.length, 10);
    assert.equal(countPath(p, '/v3/emailCampaigns/22/sendNow'), 1);
  } finally { r.close(); }
});

test('queued / processing survives reload and each manual check is bounded, completing without another import', async () => {
  const r = await prepared(300), p = r.provider;
  try {
    p.status = 'queued';
    let row = await syncCampaign(r.env, r.c.id, p.adapter());
    assert.equal(p.calls.length, 5); assert.equal(row.provider_status, 'import_queued'); assert.equal(row.delivery_lock, null);
    assert.equal(row.provider_synced_at, null); assert.equal(row.provider_campaign_id, null);
    await assert.rejects(sendCampaign(r.env, r.c.id, sendConfirmation(r), p.adapter()), /provider_not_synced/);
    assert.equal(p.calls.length, 5);
    p.status = 'processing';
    row = await syncCampaign(r.env, r.c.id, p.adapter());
    assert.equal(p.calls.length, 8); assert.equal(row.provider_status, 'import_processing');
    await assert.rejects(sendCampaign(r.env, r.c.id, sendConfirmation(r), p.adapter()), /provider_not_synced/);
    p.status = 'completed';
    row = await syncCampaign(r.env, r.c.id, p.adapter());
    assert.equal(p.calls.length, 13); assert.ok(row.provider_synced_at);
    assert.equal(countPath(p, '/v3/contacts/import'), 1); assert.equal(countPath(p, '/v3/contacts/lists'), 1); assert.equal(countPath(p, '/v3/emailCampaigns'), 1);
  } finally { r.close(); }
});

for (const checkError of ['timeout', 'malformed']) test(`${checkError} process check preserves ID and safely resumes without another import`, async () => {
  const r = await prepared(), p = r.provider;
  try {
    p.checkError = checkError;
    const frozen = await frozenRecipients(r.env, r.c.id);
    await assert.rejects(syncCampaign(r.env, r.c.id, p.adapter()), new RegExp(`provider_${checkError}`));
    const row = await campaignRow(r.env, r.c.id);
    assert.equal(row.provider_status, 'import_check_failed'); assert.equal(row.provider_import_process_id, 78); assert.equal(row.delivery_lock, null);
    await assert.rejects(sendCampaign(r.env, r.c.id, sendConfirmation(r), p.adapter()), /provider_not_synced/);
    p.checkError = null;
    assert.ok((await syncCampaign(r.env, r.c.id, p.adapter())).provider_synced_at);
    assert.equal(countPath(p, '/v3/contacts/import'), 1);
    assert.deepEqual(await frozenRecipients(r.env, r.c.id), frozen);
  } finally { r.close(); }
});

test('failed process blocks send; only explicit matching retry replaces process, reusing the list and snapshot', async () => {
  const r = await prepared(), p = r.provider;
  try {
    const frozen = await frozenRecipients(r.env, r.c.id); p.status = 'failed';
    assert.equal((await syncCampaign(r.env, r.c.id, p.adapter())).provider_status, 'import_failed');
    await assert.rejects(sendCampaign(r.env, r.c.id, sendConfirmation(r), p.adapter()), /provider_not_synced/);
    await syncCampaign(r.env, r.c.id, p.adapter());
    assert.equal(countPath(p, '/v3/contacts/import'), 1);
    await assert.rejects(syncCampaign(r.env, r.c.id, p.adapter(), { retryFailedImport: true, processId: 1 }), /campaign_changed/);
    p.status = 'completed'; const before = p.calls.length;
    const row = await syncCampaign(r.env, r.c.id, p.adapter(), { retryFailedImport: true, processId: 78 });
    assert.equal(p.calls.length - before, 6); assert.ok(row.provider_synced_at); assert.equal(row.provider_import_process_id, 79);
    assert.equal(countPath(p, '/v3/contacts/import'), 2); assert.equal(countPath(p, '/v3/contacts/lists'), 1);
    assert.deepEqual(await frozenRecipients(r.env, r.c.id), frozen);
  } finally { r.close(); }
});

test('lost import acceptance response stays locked; repeat action never blindly resubmits', async () => {
  const r = await prepared(), p = r.provider;
  try {
    p.importError = 500;
    await assert.rejects(syncCampaign(r.env, r.c.id, p.adapter()), /provider_unavailable/);
    const row = await campaignRow(r.env, r.c.id);
    assert.equal(row.provider_list_id, 11); assert.equal(row.provider_import_process_id, null); assert.ok(row.delivery_lock);
    await assert.rejects(syncCampaign(r.env, r.c.id, p.adapter()), /campaign_busy/);
    assert.equal(countPath(p, '/v3/contacts/import'), 1);
  } finally { r.close(); }
});

for (const kind of ['partial', 'blacklisted']) test(`completed process with ${kind} list cannot enable sending`, async () => {
  const r = await prepared(), p = r.provider;
  try {
    p[kind] = true;
    await assert.rejects(syncCampaign(r.env, r.c.id, p.adapter()), /provider_import_incomplete/);
    await assert.rejects(sendCampaign(r.env, r.c.id, sendConfirmation(r), p.adapter()), /provider_not_synced/);
    assert.equal(countPath(p, '/v3/emailCampaigns'), 0);
    p[kind] = false;
    assert.ok((await syncCampaign(r.env, r.c.id, p.adapter())).provider_synced_at);
    assert.equal(countPath(p, '/v3/contacts/import'), 1);
  } finally { r.close(); }
});

test('concurrent sync never duplicates list, import or campaign', async () => {
  const r = await prepared(), p = r.provider;
  try {
    const results = await Promise.allSettled([syncCampaign(r.env, r.c.id, p.adapter()), syncCampaign(r.env, r.c.id, p.adapter())]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(countPath(p, '/v3/contacts/lists'), 1); assert.equal(countPath(p, '/v3/contacts/import'), 1); assert.equal(countPath(p, '/v3/emailCampaigns'), 1);
  } finally { r.close(); }
});

test('bulk payload has explicit UTF-8 byte cap below 10 MB and rejects before fetch', async () => {
  assert.equal(BREVO_IMPORT_MAX_BYTES, 8_000_000);
  const recipients = [{ normalized_email: 'é'.repeat(BREVO_IMPORT_MAX_BYTES / 2) }];
  assert.throws(() => bulkImportPayload(11, recipients), /provider_import_too_large/);
  let calls = 0;
  const p = createBrevoAdapter({ BREVO_API_KEY: 'mock' }, { fetchImpl: async () => { calls++; throw Error('unexpected'); } });
  await assert.rejects(p.syncRecipients(11, recipients), /provider_import_too_large/); assert.equal(calls, 0);
});

test('hard adapter budget refuses the thirteenth fetch including read-only requests', async () => {
  let calls = 0;
  const p = createBrevoAdapter({ BREVO_API_KEY: 'mock' }, { fetchImpl: async () => { calls++; return Response.json({ id: 78, status: 'queued' }); } });
  assert.equal(BREVO_REQUEST_BUDGET, 12);
  for (let i = 0; i < BREVO_REQUEST_BUDGET; i++) await p.getImportProcess(78);
  await assert.rejects(p.getImportProcess(78), /provider_request_budget/); assert.equal(calls, 12);
});

test('readiness and explicit draft test remain separate 2- and 4-request invocations', async () => {
  const r = mailingRuntime(), p = transport(r.env);
  try {
    await p.adapter().checkReadiness(); assert.equal(p.calls.length, 2);
    const c = await draft(r.env); await testCampaign(r.env, c.id, ['test@example.invalid'], p.adapter());
    assert.equal(p.calls.length, 6); assert.equal(countPath(p, '/v3/contacts/import'), 0);
  } finally { r.close(); }
});
