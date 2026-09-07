import { createBrevoAdapter, BREVO_SENDER } from './provider/brevo.js';
import { MailingDeliveryError } from './delivery-errors.js';
import { campaignRow, frozenRecipients, renderDraft, validDeliveryEmail } from './preparation.js';
import { loadMailingContacts } from './contacts.js';

export function dailySendLimit(env) {
  if (env.MAILING_DAILY_SEND_LIMIT == null || env.MAILING_DAILY_SEND_LIMIT === '') return 300;
  const n = Number(env.MAILING_DAILY_SEND_LIMIT);
  return Number.isSafeInteger(n) && n > 0 ? n : 0; // Invalid explicit configuration fails closed.
}
export function campaignPayload(row, { test = false } = {}) {
  return { name: `${test ? 'E36 TEST' : 'E36'} ${row.id}`, sender: BREVO_SENDER, replyTo: BREVO_SENDER.email,
    subject: test ? row.subject : row.prepared_subject, previewText: test ? row.preheader : row.prepared_preheader,
    htmlContent: test ? renderDraft(row).html : row.prepared_html,
    ...(test ? {} : { recipients: { listIds: [Number(row.provider_list_id)] } }),
  };
}
async function requireReady(provider) {
  const status = await provider.checkReadiness();
  if (!status.ready) throw new MailingDeliveryError(status.state === 'not_configured' ? 'provider_not_configured' : status.state, 503);
}
async function lock(env, row, operation, extra = '', values = []) {
  const token = crypto.randomUUID(), now = new Date().toISOString();
  // Recheck persisted consent/suppression atomically after possibly slow readiness calls.
  const eligibility = operation === 'test' ? '' : `AND NOT EXISTS (
    SELECT 1 FROM mailing_campaign_recipients r LEFT JOIN mailing_contacts c ON c.id=r.contact_id
    WHERE r.campaign_id=mailing_campaigns.id AND (c.id IS NULL OR c.mailing_consent_status<>'yes'
      OR c.suppression_status<>'eligible' OR c.deliverability_status IN ('hard_bounce','blocked'))) `;
  const result = await env.DB.prepare(`UPDATE mailing_campaigns SET delivery_lock=?,delivery_operation=?,delivery_operation_at=?,delivery_error=NULL
    WHERE id=? AND status=? AND delivery_lock IS NULL ${eligibility} ${extra}`).bind(token, operation, now, row.id, row.status, ...values).run();
  if (!result.meta?.changes) {
    if(operation!=='test')await validatePrepared(env,await campaignRow(env,row.id));
    throw new MailingDeliveryError(operation === 'send' ? 'send_limit_exceeded' : 'campaign_busy');
  }
  return token;
}
async function release(env, id, token) {
  await env.DB.prepare('UPDATE mailing_campaigns SET delivery_lock=NULL,delivery_operation=NULL WHERE id=? AND delivery_lock=?').bind(id, token).run();
}
async function failOperation(env, id, token, error) {
  // Unknown outcome or process death stays locked indefinitely; no automatic retry/expiry can duplicate a send.
  await env.DB.prepare(`UPDATE mailing_campaigns SET delivery_error=?,provider_status=?,
    delivery_lock=CASE WHEN ? THEN NULL ELSE delivery_lock END,
    delivery_operation=CASE WHEN ? THEN NULL ELSE delivery_operation END WHERE id=? AND delivery_lock=?`)
    .bind(error.code || 'provider_unavailable', error.definiteRejection ? 'rejected' : 'needs_reconciliation',
      error.definiteRejection ? 1 : 0, error.definiteRejection ? 1 : 0, id, token).run();
}
async function validatePrepared(env, row) {
  if (row.status !== 'prepared') throw new MailingDeliveryError('campaign_not_prepared');
  if (row.delivery_lock) throw new MailingDeliveryError('campaign_busy');
  const recipients = await frozenRecipients(env, row.id);
  if (!recipients.length || recipients.length !== row.recipient_count || !row.prepared_html || !row.preparation_id) throw new MailingDeliveryError('no_eligible_recipients');
  if (row.recipient_count > dailySendLimit(env)) throw new MailingDeliveryError('send_limit_exceeded', 409, { count: row.recipient_count, limit: dailySendLimit(env) });
  if (JSON.parse(row.prepared_content_json).blocks.some(b => b.type === 'survey')) throw new MailingDeliveryError('survey_delivery_not_ready');
  // Frozen identity/content stays immutable, but a later opt-out must veto delivery, including after provider sync.
  const contacts = await loadMailingContacts(env);
  if (recipients.some(r => !contacts.some(c => c.persistedContactId === r.contact_id && c.eligibility.status === 'eligible'))) throw new MailingDeliveryError('recipients_no_longer_eligible');
  return recipients;
}
export async function syncCampaign(env, id, provider = createBrevoAdapter(env)) {
  let row = await campaignRow(env, id);
  const recipients = await validatePrepared(env, row);
  if (row.provider_synced_at) return row;
  await requireReady(provider);
  // Validate required folder before acquiring a persistent mutation lock.
  if (!row.provider_list_id && (!Number.isSafeInteger(Number(env.BREVO_LIST_FOLDER_ID)) || Number(env.BREVO_LIST_FOLDER_ID) <= 0)) throw new MailingDeliveryError('provider_folder_missing', 503);
  const token = await lock(env, row, 'sync', 'AND preparation_id=?', [row.preparation_id]);
  try {
    row = await campaignRow(env, id);
    if (!row.provider_list_id) {
      const listId = await provider.createDeliveryList(`E36 delivery ${id} ${row.preparation_id}`);
      await env.DB.prepare("UPDATE mailing_campaigns SET provider='brevo',provider_list_id=? WHERE id=? AND delivery_lock=?").bind(listId, id, token).run();
      row.provider_list_id = listId;
    }
    await provider.syncRecipients(row.provider_list_id, recipients);
    if (!row.provider_campaign_id) {
      const campaignId = await provider.createCampaign(campaignPayload(row));
      await env.DB.prepare('UPDATE mailing_campaigns SET provider_campaign_id=? WHERE id=? AND delivery_lock=?').bind(campaignId, id, token).run();
    }
    await env.DB.prepare("UPDATE mailing_campaigns SET provider_status='synced',provider_synced_at=? WHERE id=? AND delivery_lock=?")
      .bind(new Date().toISOString(), id, token).run();
    await release(env, id, token);
  } catch (error) { await failOperation(env, id, token, error); throw error; }
  return campaignRow(env, id);
}
export async function sendCampaign(env, id, confirmation, provider = createBrevoAdapter(env)) {
  const row = await campaignRow(env, id);
  await validatePrepared(env, row);
  if (confirmation?.preparationId !== row.preparation_id || confirmation?.recipientCount !== row.recipient_count) throw new MailingDeliveryError('confirmation_required');
  if (!row.provider_synced_at || !row.provider_campaign_id || !row.provider_list_id) throw new MailingDeliveryError('provider_not_synced');
  await requireReady(provider);
  const limit = dailySendLimit(env);
  // Across campaigns, this atomic admission reserves the day's capacity, including uncertain in-flight sends.
  const token = await lock(env, row, 'send', `AND preparation_id=? AND ? >= recipient_count + COALESCE((SELECT SUM(recipient_count)
    FROM mailing_campaigns WHERE id<>? AND (substr(sent_at,1,10)=? OR (delivery_operation='send' AND delivery_lock IS NOT NULL))),0)`,
    [row.preparation_id, limit, id, new Date().toISOString().slice(0, 10)]);
  try {
    await provider.sendNow(row.provider_campaign_id);
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE mailing_campaigns SET status='sent',sent_at=?,provider_status='scheduled',delivery_lock=NULL,delivery_operation=NULL,updated_at=? WHERE id=? AND delivery_lock=?")
        .bind(now, now, id, token),
      env.DB.prepare("UPDATE mailing_campaign_recipients SET sent_at=COALESCE(sent_at,?),delivery_status=CASE WHEN delivery_status='prepared' THEN 'sent' ELSE delivery_status END,updated_at=? WHERE campaign_id=?")
        .bind(now, now, id),
    ]);
  } catch (error) { await failOperation(env, id, token, error); throw error; }
  return campaignRow(env, id);
}
export async function testCampaign(env, id, addresses, provider = createBrevoAdapter(env)) {
  const row = await campaignRow(env, id);
  if (row.status !== 'draft') throw new MailingDeliveryError('campaign_not_draft');
  if (!Array.isArray(addresses) || addresses.length < 1 || addresses.length > 5 || addresses.some(e => !validDeliveryEmail(e))) throw new MailingDeliveryError('invalid_test_addresses', 400);
  const emailTo = [...new Set(addresses.map(e => e.trim().toLowerCase()))];
  const payload = campaignPayload(row, { test: true });
  await requireReady(provider);
  const token = await lock(env, row, 'test', 'AND subject=? AND preheader=? AND content_json=?', [row.subject,row.preheader,row.content_json]);
  try {
    let providerId = row.provider_test_campaign_id;
    if (!providerId) {
      providerId = await provider.createCampaign(payload);
      await env.DB.prepare('UPDATE mailing_campaigns SET provider_test_campaign_id=? WHERE id=? AND delivery_lock=?').bind(providerId, id, token).run();
    } else await provider.updateCampaign(providerId, payload);
    await provider.sendTest(providerId, emailTo);
    await release(env, id, token);
  } catch (error) { await failOperation(env, id, token, error); throw error; }
  return { accepted: true }; // Addresses are never persisted or included in delivery statistics.
}
