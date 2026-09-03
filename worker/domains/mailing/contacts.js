const CONSENT_STATUSES = new Set(["yes", "no", "unknown"]);
const SUPPRESSION_STATUSES = new Set(["eligible", "unsubscribed", "hard_bounce", "blocked", "manually_suppressed"]);
const HISTORICAL_SOURCE_TYPES = new Set(["event_registration", "historical_import"]);

export function normalizeMailingEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizeMailingName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function validHistoricalEmail(value) {
  return /^[^\s@]+@[^\s@]+$/.test(value);
}

function consentStatus(value) {
  if (value === true) return "yes";
  if (value === false) return "no";
  const normalized = String(value ?? "unknown").trim().toLowerCase();
  return CONSENT_STATUSES.has(normalized) ? normalized : "unknown";
}

function sourceType(value) {
  const normalized = String(value ?? "historical_import").trim().toLowerCase();
  return ["current_member", "event_registration", "historical_import", "manual_admin"].includes(normalized)
    ? normalized
    : "historical_import";
}

export function mailingEligibility(contact = {}) {
  const suppression = SUPPRESSION_STATUSES.has(contact.suppressionStatus)
    ? contact.suppressionStatus
    : "eligible";
  const deliverability = String(contact.deliverabilityStatus || "unknown");
  const consent = consentStatus(contact.mailingConsent?.status ?? contact.mailingConsentStatus);

  if (suppression !== "eligible") return { status: "suppressed", reason: suppression };
  if (["hard_bounce", "blocked"].includes(deliverability)) return { status: "suppressed", reason: deliverability };
  if (consent === "yes") return { status: "eligible", reason: "explicit_mailing_consent" };
  if (consent === "no") return { status: "ineligible", reason: "mailing_consent_no" };
  return { status: "review_required", reason: "mailing_consent_unknown" };
}

export function planHistoricalContactImport(records = [], existingContacts = []) {
  const existingByEmail = new Map(existingContacts.map(contact => [normalizeMailingEmail(contact.normalizedEmail || contact.email), contact]));
  const plannedByEmail = new Map();
  const rejected = [];

  records.forEach((record, index) => {
    const normalizedEmail = normalizeMailingEmail(record?.email);
    if (!validHistoricalEmail(normalizedEmail)) {
      rejected.push({ index, reason: "invalid_email", email: String(record?.email ?? "") });
      return;
    }

    let contact = plannedByEmail.get(normalizedEmail);
    if (!contact) {
      const existing = existingByEmail.get(normalizedEmail);
      contact = {
        normalizedEmail,
        email: String(record.email).trim(),
        name: String(record.name ?? "").trim(),
        nickname: String(record.nickname ?? "").trim(),
        existingContactId: existing?.id || null,
        possibleDuplicate: !!existing?.possibleDuplicate,
        sources: [],
      };
      plannedByEmail.set(normalizedEmail, contact);
    }

    const eventYear = Number(record.eventYear);
    contact.sources.push({
      sourceType: sourceType(record.sourceType),
      sourceReference: String(record.sourceReference ?? "").trim(),
      eventId: record.eventId == null ? null : String(record.eventId),
      eventYear: Number.isInteger(eventYear) && eventYear >= 1990 && eventYear <= 2100 ? eventYear : null,
      sourceDate: record.sourceDate == null ? null : String(record.sourceDate),
      privacyConsentStatus: consentStatus(record.privacyConsentStatus),
      mailingConsentStatus: consentStatus(record.mailingConsentStatus),
      consentSource: record.consentSource == null ? null : String(record.consentSource),
      consentAt: record.consentAt == null ? null : String(record.consentAt),
      originalRecord: { ...record },
    });
  });

  const contacts = [...plannedByEmail.values()];
  const names = new Map();
  for (const contact of [...existingContacts, ...contacts]) {
    const normalizedName = normalizeMailingName(contact.name);
    if (!normalizedName) continue;
    const emails = names.get(normalizedName) || new Set();
    emails.add(normalizeMailingEmail(contact.normalizedEmail || contact.email));
    names.set(normalizedName, emails);
  }
  const possibleDuplicates = [];
  for (const [normalizedName, emails] of names) {
    const distinctEmails = [...emails].filter(Boolean).sort();
    if (distinctEmails.length < 2) continue;
    possibleDuplicates.push({ normalizedName, emails: distinctEmails });
    const emailSet = new Set(distinctEmails);
    contacts.forEach(contact => {
      if (normalizeMailingName(contact.name) === normalizedName && emailSet.has(contact.normalizedEmail)) contact.possibleDuplicate = true;
    });
  }

  return {
    dryRun: true,
    inputCount: records.length,
    acceptedRowCount: records.length - rejected.length,
    canonicalContactCount: contacts.length,
    sourceCount: contacts.reduce((total, contact) => total + contact.sources.length, 0),
    contacts,
    possibleDuplicates,
    rejected,
  };
}

function list(value) {
  return String(value || "").split(",").map(item => item.trim()).filter(Boolean);
}

function sourceList(value, memberId) {
  const sources = list(value).map(item => {
    const separator = item.lastIndexOf(":");
    const type = separator === -1 ? item : item.slice(0, separator);
    const yearValue = separator === -1 ? "" : item.slice(separator + 1);
    return { type, year: /^\d{4}$/.test(yearValue) ? Number(yearValue) : null };
  });
  if (memberId && !sources.some(source => source.type === "current_member")) sources.unshift({ type: "current_member", year: null });
  return sources;
}

function mapContact(row) {
  const memberId = row.member_id || null;
  const sources = sourceList(row.source_labels, memberId);
  const eventYears = list(row.historical_years).map(Number).filter(Number.isFinite).sort((a, b) => b - a);
  const contact = {
    id: row.id,
    persistedContactId: row.persisted_contact_id || null,
    persisted: !!row.persisted_contact_id,
    email: row.email || "",
    normalizedEmail: row.normalized_email || normalizeMailingEmail(row.email),
    name: row.name || "",
    nickname: row.nickname || "",
    memberId,
    memberStatus: row.member_status || null,
    privacyConsent: {
      status: consentStatus(row.privacy_consent_status),
      source: row.privacy_consent_source || null,
      at: row.privacy_consent_at || null,
    },
    mailingConsent: {
      status: consentStatus(row.mailing_consent_status),
      source: row.mailing_consent_source || null,
      at: row.mailing_consent_at || null,
    },
    deliverabilityStatus: row.deliverability_status || "unknown",
    suppressionStatus: row.suppression_status || "eligible",
    possibleDuplicate: !!row.possible_duplicate,
    sources,
    eventYears,
    tags: list(row.tags),
    activeMember: !!row.active_member,
    registeredCurrentEvent: !!row.registered_current_event,
    incompleteProfile: !!row.incomplete_profile,
    participationCount: Number(row.participation_count || 0),
    showShineParticipant: !!row.show_shine_participant,
  };
  contact.legacyOnly = !memberId && sources.some(source => HISTORICAL_SOURCE_TYPES.has(source.type));
  contact.eligibility = mailingEligibility(contact);
  return contact;
}

export async function loadMailingContacts(env) {
  const rows = await env.DB.prepare(`
    WITH stored_contacts AS (
      SELECT
        c.id,
        c.id AS persisted_contact_id,
        COALESCE(NULLIF(trim(m.email), ''), c.email) AS email,
        lower(trim(COALESCE(NULLIF(trim(m.email), ''), c.email))) AS normalized_email,
        COALESCE(NULLIF(trim(m.name), ''), c.name, '') AS name,
        COALESCE(NULLIF(trim(m.nickname), ''), c.nickname, '') AS nickname,
        COALESCE(c.current_member_id, m.id) AS member_id,
        c.privacy_consent_status,
        c.privacy_consent_source,
        c.privacy_consent_at,
        c.mailing_consent_status,
        c.mailing_consent_source,
        c.mailing_consent_at,
        c.deliverability_status,
        c.suppression_status,
        c.possible_duplicate
      FROM mailing_contacts c
      LEFT JOIN members m ON m.id = COALESCE(
        c.current_member_id,
        (SELECT matched.id FROM members matched WHERE lower(trim(matched.email)) = c.normalized_email LIMIT 1)
      )
    ),
    projected_members AS (
      SELECT
        'member:' || m.id AS id,
        NULL AS persisted_contact_id,
        m.email,
        lower(trim(m.email)) AS normalized_email,
        m.name,
        COALESCE(m.nickname, '') AS nickname,
        m.id AS member_id,
        'unknown' AS privacy_consent_status,
        NULL AS privacy_consent_source,
        NULL AS privacy_consent_at,
        'unknown' AS mailing_consent_status,
        NULL AS mailing_consent_source,
        NULL AS mailing_consent_at,
        'unknown' AS deliverability_status,
        'eligible' AS suppression_status,
        0 AS possible_duplicate
      FROM members m
      WHERE NOT EXISTS (
        SELECT 1 FROM mailing_contacts c
        WHERE c.current_member_id = m.id OR c.normalized_email = lower(trim(m.email))
      )
    ),
    contact_universe AS (
      SELECT * FROM stored_contacts
      UNION ALL
      SELECT * FROM projected_members
    )
    SELECT
      u.*,
      m.status AS member_status,
      CASE WHEN m.status = 'active' THEN 1 ELSE 0 END AS active_member,
      CASE WHEN m.id IS NOT NULL AND EXISTS (
        SELECT 1 FROM reservations r
        JOIN events current_event ON current_event.id = r.event_id AND current_event.is_current = 1
        WHERE r.member_id = m.id AND r.status IN ('pending', 'approved')
      ) THEN 1 ELSE 0 END AS registered_current_event,
      CASE WHEN m.id IS NOT NULL AND NOT (
        trim(COALESCE(m.name, '')) <> ''
        AND trim(COALESCE(m.email, '')) <> ''
        AND trim(COALESCE(m.member_code, '')) <> ''
        AND m.history_completed_at IS NOT NULL
        AND EXISTS (SELECT 1 FROM cars WHERE member_id = m.id)
        AND (SELECT COUNT(*) FROM gallery_submissions WHERE member_id = m.id AND status = 'approved') >= 5
      ) THEN 1 ELSE 0 END AS incomplete_profile,
      CASE WHEN m.id IS NULL THEN 0 ELSE (
        SELECT COUNT(*) FROM (
          SELECT a.event_id FROM attendance a
          WHERE a.member_id = m.id AND a.status IN ('verified', 'approved')
          UNION
          SELECT h.event_id FROM united_history_claims h
          WHERE h.member_id = m.id AND h.attendance_status = 'approved'
        )
      ) END AS participation_count,
      CASE WHEN m.id IS NOT NULL AND (
        EXISTS (SELECT 1 FROM reservations r WHERE r.member_id = m.id AND r.status IN ('pending', 'approved') AND r.show_shine = 'Ano')
        OR EXISTS (SELECT 1 FROM united_history_claims h WHERE h.member_id = m.id AND h.sns_competed = 1 AND h.sns_status = 'approved')
        OR EXISTS (SELECT 1 FROM attendance a WHERE a.member_id = m.id AND a.status IN ('verified', 'approved') AND (a.winner = 1 OR trim(COALESCE(a.category, '')) <> ''))
      ) THEN 1 ELSE 0 END AS show_shine_participant,
      COALESCE((
        SELECT GROUP_CONCAT(DISTINCT s.source_type || ':' || COALESCE(CAST(s.event_year AS TEXT), ''))
        FROM mailing_contact_sources s WHERE s.contact_id = u.persisted_contact_id
      ), '') AS source_labels,
      COALESCE((
        SELECT GROUP_CONCAT(year) FROM (
          SELECT s.event_year AS year FROM mailing_contact_sources s
          WHERE s.contact_id = u.persisted_contact_id AND s.event_year IS NOT NULL
          UNION
          SELECT e.year FROM attendance a JOIN events e ON e.id = a.event_id
          WHERE a.member_id = u.member_id AND a.status IN ('verified', 'approved')
          UNION
          SELECT e.year FROM united_history_claims h JOIN events e ON e.id = h.event_id
          WHERE h.member_id = u.member_id AND h.attendance_status = 'approved'
        )
      ), '') AS historical_years,
      COALESCE((SELECT GROUP_CONCAT(DISTINCT t.tag) FROM mailing_contact_tags t WHERE t.contact_id = u.persisted_contact_id), '') AS tags
    FROM contact_universe u
    LEFT JOIN members m ON m.id = u.member_id
    ORDER BY CASE WHEN m.id IS NULL THEN 1 ELSE 0 END, lower(COALESCE(u.name, '')), u.normalized_email
  `).all();
  return (rows.results || []).map(mapContact);
}

export function filterMailingContacts(contacts, { query = "", scope = "relevant", eligibility = "all" } = {}) {
  const needle = normalizeMailingName(query);
  return contacts.filter(contact => {
    if (scope === "current" && !contact.memberId) return false;
    if (scope === "historical" && !contact.legacyOnly) return false;
    if (scope === "relevant" && contact.legacyOnly) return false;
    if (eligibility !== "all" && contact.eligibility.status !== eligibility) return false;
    if (!needle) return true;
    return normalizeMailingName([contact.name, contact.nickname, contact.email, ...contact.tags].join(" ")).includes(needle);
  });
}
