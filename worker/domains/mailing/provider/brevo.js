import { MailingDeliveryError } from '../delivery-errors.js';

export const BREVO_SENDER = Object.freeze({ name: 'E36 United', email: 'info@e36united.cz' });
export const BREVO_DOMAIN = 'e36united.cz';
const BASE = 'https://api.brevo.com/v3';

export function normalizeProviderError(status) {
  const code = status === 401 || status === 403 ? 'provider_invalid_key' : status === 402 ? 'provider_quota'
    : status === 429 ? 'provider_rate_limit' : status >= 400 && status < 500 ? 'provider_rejected' : 'provider_unavailable';
  const error = new MailingDeliveryError(code, 502);
  error.definiteRejection = status >= 400 && status < 500;
  return error;
}

// fetch is injectable; tests never use live transport. No requests at construction time.
export function createBrevoAdapter(env, { fetchImpl = fetch, timeoutMs = 18000 } = {}) {
  async function request(path, method = 'GET', body) {
    if (!env.BREVO_API_KEY) throw new MailingDeliveryError('provider_not_configured', 503);
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
      // Email is unique in Brevo. Never clear a blacklist, replace unrelated lists, or copy Member data.
      for (const recipient of recipients) await request('/contacts', 'POST', {
        email: recipient.normalized_email, listIds: [Number(listId)], updateEnabled: true,
      });
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
