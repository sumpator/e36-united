import { loadMailingContacts } from "./contacts.js";

const RULE_TYPES = new Set([
  "all_contacts",
  "mailing_eligible",
  "active_member",
  "registered_current_event",
  "not_registered_current_event",
  "historical_event_year",
  "incomplete_profile",
  "regular_participant",
  "show_shine_participant",
  "legacy_only",
  "tag",
]);

export class MailingSegmentDefinitionError extends Error {}

function normalizeRule(candidate) {
  const type = String(candidate?.type || "").trim();
  if (!RULE_TYPES.has(type)) throw new MailingSegmentDefinitionError(`Unsupported Mailing segment rule: ${type || "empty"}`);
  if (type === "historical_event_year") {
    const year = Number(candidate.value);
    if (!Number.isInteger(year) || year < 1990 || year > 2100) throw new MailingSegmentDefinitionError("Historical event year must be between 1990 and 2100.");
    return { type, value: year };
  }
  if (type === "regular_participant") {
    const minimum = candidate.value == null || candidate.value === "" ? 2 : Number(candidate.value);
    if (!Number.isInteger(minimum) || minimum < 2 || minimum > 20) throw new MailingSegmentDefinitionError("Regular-participant minimum must be between 2 and 20.");
    return { type, value: minimum };
  }
  if (type === "tag") {
    const tag = String(candidate.value || "").trim().toLowerCase();
    if (!tag || tag.length > 40) throw new MailingSegmentDefinitionError("Tag must contain 1 to 40 characters.");
    return { type, value: tag };
  }
  return { type };
}

export function normalizeSegmentDefinition(candidate = {}) {
  const match = candidate.match === "any" ? "any" : "all";
  const rules = Array.isArray(candidate.rules) && candidate.rules.length
    ? candidate.rules.map(normalizeRule)
    : [{ type: "mailing_eligible" }];
  const exclusions = Array.isArray(candidate.exclusions) ? candidate.exclusions.map(normalizeRule) : [];
  if (rules.length > 10 || exclusions.length > 10) throw new MailingSegmentDefinitionError("A segment can contain at most 10 rules and 10 exclusions.");
  return { match, rules, exclusions };
}

export function contactMatchesMailingRule(contact, rule) {
  if (rule.type === "all_contacts") return true;
  if (rule.type === "mailing_eligible") return contact.eligibility?.status === "eligible";
  if (rule.type === "active_member") return contact.activeMember === true;
  if (rule.type === "registered_current_event") return contact.memberId != null && contact.registeredCurrentEvent === true;
  if (rule.type === "not_registered_current_event") return contact.memberId != null && contact.registeredCurrentEvent !== true;
  if (rule.type === "historical_event_year") return contact.eventYears?.includes(Number(rule.value));
  if (rule.type === "incomplete_profile") return contact.memberId != null && contact.incompleteProfile === true;
  if (rule.type === "regular_participant") return Number(contact.participationCount || 0) >= Number(rule.value || 2);
  if (rule.type === "show_shine_participant") return contact.showShineParticipant === true;
  if (rule.type === "legacy_only") return contact.legacyOnly === true;
  if (rule.type === "tag") return (contact.tags || []).some(tag => String(tag).toLowerCase() === String(rule.value).toLowerCase());
  return false;
}

export function filterMailingSegment(contacts, candidate) {
  const definition = normalizeSegmentDefinition(candidate);
  const matchesIncluded = contact => definition.match === "any"
    ? definition.rules.some(rule => contactMatchesMailingRule(contact, rule))
    : definition.rules.every(rule => contactMatchesMailingRule(contact, rule));
  const recipients = contacts
    .filter(contact => matchesIncluded(contact) && !definition.exclusions.some(rule => contactMatchesMailingRule(contact, rule)))
    .sort((left, right) => (left.name || left.email).localeCompare(right.name || right.email, "cs"));
  return { definition, recipients };
}

export async function previewMailingSegment(env, candidate) {
  return filterMailingSegment(await loadMailingContacts(env), candidate);
}
