import { MailingDeliveryError } from '../delivery-errors.js';

export const BREVO_SENDER = Object.freeze({ name: 'E36 United', email: 'info@e36united.cz' });
export const BREVO_DOMAIN = 'e36united.cz';
const BASE = 'https://api.brevo.com/v3';
export const BREVO_REQUEST_BUDGET = 12;
export const BREVO_IMPORT_MAX_BYTES = 8_000_000;

export function bulkImportPayload(listId, recipients) {
  const body = { jsonBody: recipients.map(r => ({ email: r.normalized_email })),
    listIds: [Number(listId)], updateExistingContacts: true, disableNotification: true };
  if (new TextEncoder().encode(JSON.stringify(body)).length > BREVO_IMPORT_MAX_BYTES) {
    throw new MailingDeliveryError('provider_import_too_large', 413);
  }
  return body;
}

export function normalizeProviderError(status) {
  const code = status === 401 || status === 403 ? 'provider_invalid_key' : status === 402 ? 'provider_quota'
    : status === 429 ? 'provider_rate_limit' : status >= 400 && status < 500 ? 'provider_rejected' : 'provider_unavailable';
  const error = new MailingDeliveryError(code, 502);
  error.definiteRejection = status >= 400 && status < 500;
  return error;
}

// fetch is injectable; tests never use live transport. No requests at construction time.
export function createBrevoAdapter(env, { fetchImpl = fetch, timeoutMs = 18000 } = {}) {
  let requests = 0; // One adapter per Worker invocation. Includes readiness and every page/check.
  async function request(path, method = 'GET', body) {
    if (!env.BREVO_API_KEY) throw new MailingDeliveryError('provider_not_configured', 503);
    if (requests >= BREVO_REQUEST_BUDGET) throw new MailingDeliveryError('provider_request_budget', 503);
    requests++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${BASE}${path}`, {
        method, redirect: 'error', signal: controller.signal,
        headers: { 'api-key': env.BREVO_API_KEY, Accept: 'application/json', 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) { await response.body?.cancel(); throw normalizeProviderError(response.status); }
      if (response.status === 204) return null;
      const reader = response.body?.getReader(); let size = 0; const chunks = [];
      if (reader) try {
        for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length;
          if (size > 1024 * 1024) { await reader.cancel(); throw new MailingDeliveryError('provider_malformed', 502); } chunks.push(value); }
      } finally { reader.releaseLock(); }
      if (!size) return null;
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new MailingDeliveryError('provider_malformed', 502); }
    } catch (error) {
      if (error instanceof MailingDeliveryError) throw error;
      throw new MailingDeliveryError(controller.signal.aborted ? 'provider_timeout' : 'provider_unavailable', 502);
    } finally { clearTimeout(timer); }
  }
  async function created(path, body) {
    const result = await request(path, 'POST', body);
    if (!Number.isSafeInteger(result?.id) || result.id <= 0) throw new MailingDeliveryError('provider_malformed', 502);
    return result.id;
  }
  async function getSenderStatus() {
    const result = await request('/senders');
    if (!Array.isArray(result?.senders)) throw new MailingDeliveryError('provider_malformed', 502);
    return { ready: result.senders.some(s => String(s.email).toLowerCase() === BREVO_SENDER.email && s.active === true) };
  }
  async function getDomainStatus() {
    const result = await request(`/senders/domains/${BREVO_DOMAIN}`);
    if (typeof result?.verified !== 'boolean' || typeof result?.authenticated !== 'boolean') throw new MailingDeliveryError('provider_malformed', 502);
    return { verified: result.verified, authenticated: result.authenticated };
  }
  async function checkReadiness() {
    const base = { sender: BREVO_SENDER, replyTo: BREVO_SENDER.email, domain: BREVO_DOMAIN };
    if (!env.BREVO_API_KEY) return { ...base, state: 'not_configured', ready: false, apiConnected: false };
    const sender = await getSenderStatus();
    if (!sender.ready) return { ...base, state: 'sender_missing', ready: false, apiConnected: true };
    const domain = await getDomainStatus();
    const state = !domain.verified ? 'domain_unverified' : !domain.authenticated ? 'domain_unauthenticated' : 'ready';
    return { ...base, state, ready: state === 'ready', apiConnected: true };
  }
  return {
    checkReadiness, getSenderStatus, getDomainStatus,
    createDeliveryList(name) {
      const folderId = Number(env.BREVO_LIST_FOLDER_ID);
      if (!Number.isSafeInteger(folderId) || folderId <= 0) throw new MailingDeliveryError('provider_folder_missing', 503);
      return created('/contacts/lists', { name, folderId });
    },
    async syncRecipients(listId, recipients) {
      // No Member attributes, blacklist resets, notifications, or unrelated list replacement.
      const result = await request('/contacts/import', 'POST', bulkImportPayload(listId, recipients));
      if (!Number.isSafeInteger(result?.processId) || result.processId <= 0) throw new MailingDeliveryError('provider_malformed', 502);
      return result.processId;
    },
    async getImportProcess(id) {
      const result = await request(`/processes/${Number(id)}`);
      if (result?.id !== Number(id) || !['queued', 'processing', 'completed', 'failed'].includes(result?.status)) {
        throw new MailingDeliveryError('provider_malformed', 502);
      }
      return { id: result.id, status: result.status }; // Never expose provider report URLs/payloads.
    },
    async verifyRecipients(listId, recipients) {
      // A completed asynchronous job can still have rejected rows. Verify the dedicated list exactly.
      const expected = new Set(recipients.map(r => r.normalized_email)), seen = new Set();
      for (let offset = 0; offset < recipients.length; offset += 500) {
        const result = await request(`/contacts/lists/${Number(listId)}/contacts?limit=500&offset=${offset}`);
        if (result?.count !== recipients.length || !Array.isArray(result.contacts)
          || result.contacts.length !== Math.min(500, recipients.length - offset)) throw new MailingDeliveryError('provider_import_incomplete', 409);
        for (const contact of result.contacts) {
          const email = String(contact.email || '').trim().toLowerCase();
          if (!expected.has(email) || seen.has(email) || contact.emailBlacklisted === true) throw new MailingDeliveryError('provider_import_incomplete', 409);
          seen.add(email);
        }
      }
    },
    createCampaign: body => created('/emailCampaigns', body),
    updateCampaign: (id, body) => request(`/emailCampaigns/${Number(id)}`, 'PUT', body),
    sendTest: (id, addresses) => {
      if (!Array.isArray(addresses) || !addresses.length || addresses.length > 5) throw new MailingDeliveryError('invalid_test_addresses', 400);
      return request(`/emailCampaigns/${Number(id)}/sendTest`, 'POST', { emailTo: addresses });
    },
    sendNow: id => request(`/emailCampaigns/${Number(id)}/sendNow`, 'POST'),
    // Deliberately not exposed through Admin: only an explicitly reconciled E36-owned list may be cleaned up.
    deleteDeliveryList: id => request(`/contacts/lists/${Number(id)}`, 'DELETE'),
  };
}
