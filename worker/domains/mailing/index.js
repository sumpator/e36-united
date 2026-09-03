import { readJsonObject } from "../../http/request.js";
import { json } from "../../http/responses.js";
import { filterMailingContacts, loadMailingContacts } from "./contacts.js";
import { createMailingCampaign, listMailingCampaigns, updateMailingCampaign } from "./campaigns.js";
import { MailingSegmentDefinitionError, previewMailingSegment } from "./segments.js";

function pageNumber(value, fallback = 1) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function errorResponse(error, origin) {
  if (error instanceof MailingSegmentDefinitionError) {
    return json({ ok: false, error: "invalid_segment", message: error.message }, 400, origin);
  }
  const known = {
    campaign_name_required: "Interní název kampaně je povinný.",
    invalid_campaign_status: "Neplatný stav kampaně.",
    mailing_delivery_not_available: "Odesílání e-mailů není v Mailing A dostupné.",
    sent_campaign_immutable: "Odeslanou kampaň nelze měnit.",
  };
  if (known[error?.message]) return json({ ok: false, error: error.message, message: known[error.message] }, 400, origin);
  throw error;
}

async function mailingOverview(env, origin) {
  const [contacts, campaigns] = await Promise.all([
    loadMailingContacts(env),
    env.DB.prepare("SELECT COUNT(*) AS count FROM mailing_campaigns WHERE status = 'draft'").first(),
  ]);
  return json({
    ok: true,
    overview: {
      totalContacts: contacts.length,
      currentMembers: contacts.filter(contact => contact.memberId).length,
      historicalOnly: contacts.filter(contact => contact.legacyOnly).length,
      eligible: contacts.filter(contact => contact.eligibility.status === "eligible").length,
      suppressed: contacts.filter(contact => contact.eligibility.status === "suppressed").length,
      reviewRequired: contacts.filter(contact => contact.eligibility.status === "review_required").length,
      campaignDrafts: Number(campaigns?.count || 0),
    },
  }, 200, origin);
}

async function mailingContacts(env, url, origin) {
  const page = pageNumber(url.searchParams.get("page"));
  const pageSize = Math.min(pageNumber(url.searchParams.get("pageSize"), 50), 100);
  const scope = ["relevant", "current", "historical", "all"].includes(url.searchParams.get("scope")) ? url.searchParams.get("scope") : "relevant";
  const eligibility = ["all", "eligible", "ineligible", "review_required", "suppressed"].includes(url.searchParams.get("eligibility")) ? url.searchParams.get("eligibility") : "all";
  const filtered = filterMailingContacts(await loadMailingContacts(env), {
    query: url.searchParams.get("q") || "",
    scope,
    eligibility,
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  return json({
    ok: true,
    contacts: filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    pagination: { page: safePage, pageSize, total: filtered.length, totalPages },
    filters: { scope, eligibility, q: url.searchParams.get("q") || "" },
  }, 200, origin);
}

async function mailingSegmentPreview(request, env, origin) {
  const parsed = await readJsonObject(request, origin);
  if (parsed.response) return parsed.response;
  try {
    const { definition, recipients } = await previewMailingSegment(env, parsed.body.segment || parsed.body);
    return json({ ok: true, definition, count: recipients.length, recipients: recipients.slice(0, 250), truncated: recipients.length > 250 }, 200, origin);
  } catch (error) {
    return errorResponse(error, origin);
  }
}

async function createCampaign(request, env, auth, origin) {
  const parsed = await readJsonObject(request, origin);
  if (parsed.response) return parsed.response;
  try {
    return json({ ok: true, campaign: await createMailingCampaign(env, auth.uid, parsed.body) }, 201, origin);
  } catch (error) {
    return errorResponse(error, origin);
  }
}

async function patchCampaign(request, env, campaignId, origin) {
  const parsed = await readJsonObject(request, origin);
  if (parsed.response) return parsed.response;
  try {
    const campaign = await updateMailingCampaign(env, campaignId, parsed.body);
    if (!campaign) return json({ ok: false, error: "campaign_not_found", message: "Kampaň nebyla nalezena." }, 404, origin);
    return json({ ok: true, campaign }, 200, origin);
  } catch (error) {
    return errorResponse(error, origin);
  }
}

export async function routeAdminMailing({ request, env, url, auth, origin }) {
  if (!url.pathname.startsWith("/api/admin/mailing")) return null;
  if (url.pathname === "/api/admin/mailing/overview" && request.method === "GET") return mailingOverview(env, origin);
  if (url.pathname === "/api/admin/mailing/contacts" && request.method === "GET") return mailingContacts(env, url, origin);
  if (url.pathname === "/api/admin/mailing/segments/preview" && request.method === "POST") return mailingSegmentPreview(request, env, origin);
  if (url.pathname === "/api/admin/mailing/campaigns" && request.method === "GET") {
    return json({ ok: true, campaigns: await listMailingCampaigns(env) }, 200, origin);
  }
  if (url.pathname === "/api/admin/mailing/campaigns" && request.method === "POST") return createCampaign(request, env, auth, origin);
  const campaignMatch = url.pathname.match(/^\/api\/admin\/mailing\/campaigns\/([^/]+)$/);
  if (campaignMatch && request.method === "PATCH") return patchCampaign(request, env, decodeURIComponent(campaignMatch[1]), origin);
  return json({ ok: false, error: "mailing_not_found", message: "Mailing endpoint neexistuje." }, 404, origin);
}
