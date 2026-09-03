import { clean } from "../../utils/text.js";
import { normalizeSegmentDefinition, previewMailingSegment } from "./segments.js";

const EDITABLE_STATUSES = new Set(["draft", "prepared", "archived"]);

function publicCampaign(row) {
  let segment = { match: "all", rules: [{ type: "mailing_eligible" }], exclusions: [] };
  try { segment = normalizeSegmentDefinition(JSON.parse(row.segment_definition_json)); } catch {}
  return {
    id: row.id,
    internalName: row.internal_name,
    subject: row.subject || "",
    preheader: row.preheader || "",
    segment,
    recipientCount: Number(row.recipient_count || 0),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sentAt: row.sent_at || null,
  };
}

function campaignFields(candidate, current = {}) {
  const internalName = clean(candidate.internalName ?? current.internal_name).slice(0, 120);
  if (!internalName) throw new Error("campaign_name_required");
  const status = clean(candidate.status ?? current.status ?? "draft");
  if (status === "sent") throw new Error("mailing_delivery_not_available");
  if (!EDITABLE_STATUSES.has(status)) throw new Error("invalid_campaign_status");
  return {
    internalName,
    subject: clean(candidate.subject ?? current.subject).slice(0, 180),
    preheader: clean(candidate.preheader ?? current.preheader).slice(0, 240),
    status,
    segment: normalizeSegmentDefinition(candidate.segment ?? (current.segment_definition_json ? JSON.parse(current.segment_definition_json) : undefined)),
  };
}

export async function listMailingCampaigns(env) {
  const rows = await env.DB.prepare(`
    SELECT id, internal_name, subject, preheader, segment_definition_json,
      recipient_count, status, created_at, updated_at, sent_at
    FROM mailing_campaigns
    ORDER BY updated_at DESC, created_at DESC
  `).all();
  return (rows.results || []).map(publicCampaign);
}

export async function createMailingCampaign(env, adminId, candidate) {
  if (candidate?.status != null && clean(candidate.status) !== "draft") throw new Error("invalid_campaign_status");
  const fields = campaignFields(candidate);
  const preview = await previewMailingSegment(env, fields.segment);
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO mailing_campaigns (
      id, created_by, internal_name, subject, preheader,
      segment_definition_json, recipient_count, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    adminId,
    fields.internalName,
    fields.subject,
    fields.preheader,
    JSON.stringify(fields.segment),
    preview.recipients.length,
    fields.status,
  ).run();
  const row = await env.DB.prepare(`
    SELECT id, internal_name, subject, preheader, segment_definition_json,
      recipient_count, status, created_at, updated_at, sent_at
    FROM mailing_campaigns WHERE id = ? LIMIT 1
  `).bind(id).first();
  return publicCampaign(row);
}

export async function updateMailingCampaign(env, campaignId, candidate) {
  const current = await env.DB.prepare("SELECT * FROM mailing_campaigns WHERE id = ? LIMIT 1").bind(campaignId).first();
  if (!current) return null;
  if (current.status === "sent") throw new Error("sent_campaign_immutable");
  const fields = campaignFields(candidate, current);
  const preview = await previewMailingSegment(env, fields.segment);
  await env.DB.prepare(`
    UPDATE mailing_campaigns
    SET internal_name = ?, subject = ?, preheader = ?, segment_definition_json = ?,
      recipient_count = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status <> 'sent'
  `).bind(
    fields.internalName,
    fields.subject,
    fields.preheader,
    JSON.stringify(fields.segment),
    preview.recipients.length,
    fields.status,
    campaignId,
  ).run();
  const row = await env.DB.prepare(`
    SELECT id, internal_name, subject, preheader, segment_definition_json,
      recipient_count, status, created_at, updated_at, sent_at
    FROM mailing_campaigns WHERE id = ? LIMIT 1
  `).bind(campaignId).first();
  return publicCampaign(row);
}
