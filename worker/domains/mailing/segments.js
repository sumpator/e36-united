import { loadMailingContacts } from "./contacts.js";
import {MAILING_FIELDS} from './segment-fields.js';
import {loadMailingSegmentFacts} from './segment-facts.js';

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
  if(type==='condition')return{type,...normalizeCondition(candidate,'member')};
  if(type==='event'||type==='order'){
    if(!Array.isArray(candidate.conditions)||!candidate.conditions.length||candidate.conditions.length>16)throw new MailingSegmentDefinitionError('Vyber 1–16 podmínek okruhu.');
    const conditions=candidate.conditions.map(c=>normalizeCondition(c,type));
    if(type==='order')return{type,conditions};
    if(!Array.isArray(candidate.eventIds))throw new MailingSegmentDefinitionError('Vyber ročník.');const eventIds=[...new Set(candidate.eventIds)];if(!eventIds.length||eventIds.length>20||eventIds.some(v=>typeof v!=='string'||v.length>128||!v))throw new MailingSegmentDefinitionError('Vyber existující ročník.');
    return{type,eventIds,conditions};
  }
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

function normalizeCondition(candidate,scope){
 const field=String(candidate?.field||''),spec=MAILING_FIELDS[field];if(!spec||spec.scope!==scope)throw new MailingSegmentDefinitionError('Neznámá podmínka výběru.');
 if(['enum','product','variant'].includes(spec.kind)){
  if(!Array.isArray(candidate.values))throw new MailingSegmentDefinitionError('Vyber hodnoty podmínky.');const values=[...new Set(candidate.values)];if(!values.length||values.length>30||values.some(v=>typeof v!=='string'||!v||v.length>128||spec.values&&!spec.values.some(x=>x.value===v)))throw new MailingSegmentDefinitionError('Vyber platnou hodnotu podmínky.');return{field,values};
 }
 if(spec.kind==='text'){const text=String(candidate.text||'').trim();if(!text||text.length>120)throw new MailingSegmentDefinitionError('Napiš hledaný text (nejvýše 120 znaků).');return{field,text};}
 const min=candidate.min??null,max=candidate.max??null;
 if(min===null&&max===null)throw new MailingSegmentDefinitionError('Doplň alespoň jednu mez rozsahu.');
 if(spec.kind==='range'&&[min,max].some(v=>v!==null&&(!Number.isFinite(v)||v<0||v>10000000)))throw new MailingSegmentDefinitionError('Neplatný číselný rozsah.');
 if(spec.kind==='date'&&[min,max].some(v=>v!==null&&(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)))throw new MailingSegmentDefinitionError('Neplatné datum.');
 if(min!==null&&max!==null&&min>max)throw new MailingSegmentDefinitionError('Dolní mez nesmí být vyšší než horní.');return{field,min,max};
}
function conditionMatches(facts,condition){
 const value=facts?.[condition.field];if(value===null||value===undefined)return false;
 if(condition.values)return condition.values.some(v=>Array.isArray(value)?value.includes(v):String(value)===v);
 if(condition.text){const normalize=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();return(Array.isArray(value)?value:[value]).some(v=>normalize(v).includes(normalize(condition.text)));}
 const current=MAILING_FIELDS[condition.field].kind==='date'?String(value).slice(0,10):value;return(condition.min===null||current>=condition.min)&&(condition.max===null||current<=condition.max);
}

export function normalizeSegmentDefinition(candidate = {}) {
  if(candidate.version!==undefined&&candidate.version!==1&&candidate.version!==2)throw new MailingSegmentDefinitionError('Tato verze výběru není podporovaná.');
  const match = candidate.match === "any" ? "any" : "all";
  const rules = Array.isArray(candidate.rules) && candidate.rules.length
    ? candidate.rules.map(normalizeRule)
    : [{ type: candidate.version===2?"all_contacts":"mailing_eligible" }];
  const exclusions = Array.isArray(candidate.exclusions) ? candidate.exclusions.map(normalizeRule) : [];
  if (rules.length > 10 || exclusions.length > 10) throw new MailingSegmentDefinitionError("A segment can contain at most 10 rules and 10 exclusions.");
  const extended=[...rules,...exclusions].some(r=>['condition','event','order'].includes(r.type));
  if(extended&&candidate.version!==2)throw new MailingSegmentDefinitionError('Nové podmínky vyžadují výběr verze 2.');
  return { ...(candidate.version===2?{version:2}:{}),match, rules, exclusions };
}

export function contactMatchesMailingRule(contact, rule) {
  if(rule.type==='condition')return conditionMatches(contact.audience?.member,rule);
  if(rule.type==='event'){const events=contact.audience?.events.filter(e=>rule.eventIds.includes(e.eventId))||[],known=contact.memberId!=null,count=known?events.filter(e=>e.verifiedAttendance).length:null;return events.some(e=>rule.conditions.every(c=>conditionMatches({...e,verifiedInRange:count},c)))}
  if(rule.type==='order')return contact.audience?.orders.some(o=>rule.conditions.every(c=>conditionMatches(o,c)))||false;
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
  const included=contacts.filter(matchesIncluded),excluded=included.filter(contact=>definition.exclusions.some(rule=>contactMatchesMailingRule(contact,rule)));
  const recipients = contacts
    .filter(contact => matchesIncluded(contact) && !definition.exclusions.some(rule => contactMatchesMailingRule(contact, rule)))
    .sort((left, right) => (left.name || left.email).localeCompare(right.name || right.email, "cs"));
  return { definition, recipients, excluded };
}

export async function previewMailingSegment(env, candidate) {
  const definition=normalizeSegmentDefinition(candidate),contacts=await loadMailingContacts(env);
  if(definition.version!==2)return filterMailingSegment(contacts,definition);
  const enriched=await loadMailingSegmentFacts(env,contacts),eventIds=[...definition.rules,...definition.exclusions].filter(r=>r.type==='event').flatMap(r=>r.eventIds),events=(await env.DB.prepare('SELECT id FROM events').all()).results;
  if(eventIds.some(id=>!events.some(e=>e.id===id)))throw new MailingSegmentDefinitionError('Vybraný ročník už neexistuje.');
  return filterMailingSegment(enriched,definition);
}
