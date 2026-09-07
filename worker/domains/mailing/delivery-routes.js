import { json } from '../../http/responses.js';
import { readMailingBody } from './request.js';
import { createBrevoAdapter, BREVO_SENDER } from './provider/brevo.js';
import { MailingDeliveryError, deliveryMessages } from './delivery-errors.js';
import { campaignRow, preparationPreview, prepareCampaign, unprepareCampaign } from './preparation.js';
import { dailySendLimit, sendCampaign, syncCampaign, testCampaign } from './delivery.js';

export function deliveryCampaign(row) {
  return { id: row.id, internalName: row.internal_name, status: row.status, subject: row.prepared_subject ?? row.subject,
    preparedAt: row.prepared_at, preparationId: row.preparation_id, recipientCount: row.recipient_count, updatedAt: row.updated_at,
    providerStatus: row.provider_status, providerListId: row.provider_list_id, providerCampaignId: row.provider_campaign_id,
    providerSyncedAt: row.provider_synced_at, busy: !!row.delivery_lock, error: row.delivery_error, sentAt: row.sent_at };
}
export async function routeMailingDelivery({ request, env, url, origin }) {
  const root = '/api/admin/mailing';
  const match = url.pathname.match(/^\/api\/admin\/mailing\/campaigns\/([^/]+)\/(prepare|unprepare|test|provider-sync|send|delivery)$/);
  const statusRoute = url.pathname === `${root}/provider-status` && request.method === 'GET';
  if (!statusRoute && (!match || request.method !== (match[2] === 'delivery' ? 'GET' : 'POST'))) return null;
  try {
    if (statusRoute) return json({ ok: true, provider: { ...await createBrevoAdapter(env).checkReadiness(), dailyLimit: dailySendLimit(env), folderConfigured: Number(env.BREVO_LIST_FOLDER_ID) > 0 } }, 200, origin);
    const id = decodeURIComponent(match[1]), action = match[2];
    if (action === 'delivery') {
      const row = await campaignRow(env, id), campaign = deliveryCampaign(row);
      if (row.status === 'draft') campaign.recipientCount = (await preparationPreview(env, row)).length;
      return json({ ok: true, campaign, frozenPreview: row.prepared_html ? {html:row.prepared_html,subject:row.prepared_subject,preheader:row.prepared_preheader} : null, sender: BREVO_SENDER, dailyLimit: dailySendLimit(env) }, 200, origin);
    }
    let body;
    try { body = await readMailingBody(request, 4096); if (Array.isArray(body)) throw new Error(); } catch { throw new MailingDeliveryError('confirmation_required', 400); }
    let result;
    if (action === 'prepare') result = deliveryCampaign(await prepareCampaign(env, id, body.confirmation));
    if (action === 'unprepare') result = deliveryCampaign(await unprepareCampaign(env, id));
    if (action === 'provider-sync') result = deliveryCampaign(await syncCampaign(env, id));
    if (action === 'send') result = deliveryCampaign(await sendCampaign(env, id, body.confirmation));
    if (action === 'test') return json({ ok: true, ...await testCampaign(env, id, body.addresses) }, 200, origin);
    return json({ ok: true, campaign: result }, 200, origin);
  } catch (error) {
    if (error instanceof MailingDeliveryError) return json({ ok: false, error: error.code, message: deliveryMessages[error.code] || 'Mailing operace není dostupná.', ...error.details }, error.status, origin);
    // No provider payloads, content, addresses or credentials in responses/logs.
    return json({ ok: false, error: 'mailing_operation_failed', message: 'Mailing operace selhala. Obnov data; neopakuj odeslání bez kontroly stavu.' }, 500, origin);
  }
}
