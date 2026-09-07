import { previewMailingSegment } from './segments.js';
import { renderMailingTemplate } from './template.js';
import { MailingDeliveryError } from './delivery-errors.js';

export const validDeliveryEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
export async function campaignRow(env, id) {
  const row = await env.DB.prepare('SELECT * FROM mailing_campaigns WHERE id=?').bind(id).first();
  if (!row) throw new MailingDeliveryError('campaign_not_found', 404);
  return row;
}
export async function frozenRecipients(env, id) {
  return (await env.DB.prepare('SELECT * FROM mailing_campaign_recipients WHERE campaign_id=? ORDER BY normalized_email').bind(id).all()).results || [];
}
export function renderDraft(row) {
  if (!row.subject?.trim()) throw new MailingDeliveryError('invalid_delivery_content', 400);
  const content = JSON.parse(row.content_json);
  if (!content.blocks?.length) throw new MailingDeliveryError('invalid_delivery_content', 400);
  const rendered = renderMailingTemplate({ subject: row.subject, preheader: row.preheader, content });
  if (new TextEncoder().encode(rendered.html).length >= 1000000) throw new MailingDeliveryError('invalid_delivery_content', 400);
  return { content, html: rendered.html };
}
export async function preparationPreview(env, row) {
  const { recipients } = await previewMailingSegment(env, JSON.parse(row.segment_definition_json));
  const seen = new Set();
  return recipients.filter(r => {
    if (!r.persistedContactId || r.eligibility.status !== 'eligible' || !validDeliveryEmail(r.normalizedEmail) || seen.has(r.normalizedEmail)) return false;
    seen.add(r.normalizedEmail); return true;
  });
}
export async function prepareCampaign(env, id, confirmation) {
  const row = await campaignRow(env, id);
  if (row.status !== 'draft') throw new MailingDeliveryError('campaign_not_draft');
  if (row.delivery_lock) throw new MailingDeliveryError('campaign_busy');
  const { html } = renderDraft(row), recipients = await preparationPreview(env, row);
  if (!recipients.length) throw new MailingDeliveryError('no_eligible_recipients');
  if (!confirmation || confirmation.subject !== row.subject || confirmation.recipientCount !== recipients.length || confirmation.updatedAt !== row.updated_at) throw new MailingDeliveryError('confirmation_required');
  const token = crypto.randomUUID(), now = new Date().toISOString();
  const snapshot = recipients.map(r => ({ id: crypto.randomUUID(), contactId: r.persistedContactId, memberId: r.memberId, email: r.email, normalizedEmail: r.normalizedEmail, name: r.name, sources: r.sources }));
  // D1 batch is atomic. A CAS loser cannot insert rows because its unique preparation token never becomes visible.
  const result = await env.DB.batch([
    env.DB.prepare(`UPDATE mailing_campaigns SET status='prepared',prepared_subject=subject,prepared_preheader=preheader,
      prepared_template_version=template_version,prepared_content_json=content_json,prepared_html=?,prepared_at=?,preparation_id=?,
      recipient_count=?,updated_at=? WHERE id=? AND status='draft' AND delivery_lock IS NULL
      AND subject=? AND preheader=? AND content_json=? AND segment_definition_json=? AND updated_at=?
      AND NOT EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN mailing_contacts c ON c.id=json_extract(j.value,'$.contactId')
        WHERE c.id IS NULL OR c.mailing_consent_status<>'yes' OR c.suppression_status<>'eligible' OR c.deliverability_status IN ('hard_bounce','blocked'))`)
      .bind(html, now, token, snapshot.length, now, id, row.subject, row.preheader, row.content_json, row.segment_definition_json, row.updated_at, JSON.stringify(snapshot)),
    env.DB.prepare(`INSERT INTO mailing_campaign_recipients
      (id,campaign_id,contact_id,member_id,email,normalized_email,name,source_snapshot_json,eligibility_status)
      SELECT json_extract(j.value,'$.id'),c.id,json_extract(j.value,'$.contactId'),json_extract(j.value,'$.memberId'),
      json_extract(j.value,'$.email'),json_extract(j.value,'$.normalizedEmail'),json_extract(j.value,'$.name'),
      json_extract(j.value,'$.sources'),'eligible' FROM mailing_campaigns c,json_each(?) j WHERE c.id=? AND c.preparation_id=?`)
      .bind(JSON.stringify(snapshot), id, token),
  ]);
  if (!result[0].meta?.changes) throw new MailingDeliveryError('campaign_changed');
  return campaignRow(env, id);
}
export async function unprepareCampaign(env, id) {
  const row = await campaignRow(env, id);
  if (row.status !== 'prepared') throw new MailingDeliveryError('campaign_not_prepared');
  if (row.delivery_lock) throw new MailingDeliveryError('campaign_busy');
  if (row.provider_list_id || row.provider_campaign_id) throw new MailingDeliveryError('provider_already_used');
  const token = crypto.randomUUID();
  const result = await env.DB.batch([
    env.DB.prepare(`UPDATE mailing_campaigns SET delivery_lock=? WHERE id=? AND status='prepared' AND preparation_id=?
      AND delivery_lock IS NULL AND provider_list_id IS NULL AND provider_campaign_id IS NULL`).bind(token, id, row.preparation_id),
    env.DB.prepare(`DELETE FROM mailing_campaign_recipients WHERE campaign_id=? AND EXISTS
      (SELECT 1 FROM mailing_campaigns WHERE id=? AND delivery_lock=?)`).bind(id, id, token),
    env.DB.prepare(`UPDATE mailing_campaigns SET status='draft',prepared_subject=NULL,prepared_preheader=NULL,prepared_template_version=NULL,
      prepared_content_json=NULL,prepared_html=NULL,prepared_at=NULL,preparation_id=NULL,recipient_count=0,delivery_lock=NULL,
      provider_status=NULL,provider_synced_at=NULL,delivery_error=NULL,updated_at=? WHERE id=? AND delivery_lock=?`)
      .bind(new Date().toISOString(), id, token),
  ]);
  if (!result[0].meta?.changes) throw new MailingDeliveryError('campaign_changed');
  return campaignRow(env, id);
}
