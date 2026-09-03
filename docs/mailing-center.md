# Mailing Center

Mailing A adds an isolated contact, segmentation, recipient-preview, and campaign-draft foundation. It does not send email, integrate an email provider, import production contacts, or expose public response/unsubscribe routes.

## Architecture

- `worker/domains/mailing/contacts.js` owns safe email normalization, contact projection, consent-derived eligibility, filtering, and the deterministic historical-import dry-run planner.
- `worker/domains/mailing/segments.js` owns the fixed server-authoritative rule vocabulary plus AND/OR/exclusion evaluation.
- `worker/domains/mailing/campaigns.js` owns draft list/create/update persistence. It deliberately rejects a transition to `sent`.
- `worker/domains/mailing/index.js` exposes the small Admin-only Mailing route surface through the existing Worker Admin authorization boundary.
- `admin/modules/mailing/` owns the Mailing overview, contacts, segment preview, and campaign-draft UI. `admin.js` only initializes/resets the domain.

The Worker still uses the existing `DB` D1 binding and Firebase Admin authorization. No new runtime dependency or binding is introduced.

## Tables and migration status

Pending migration `db/migrations/2026-09-03-mailing-foundation.sql` starts the forward-only `schema_migrations` identity registry and creates:

- `mailing_contacts`: canonical normalized-email identity, optional current Member link, separate privacy/mailing consent metadata, deliverability, suppression, and possible-duplicate flag.
- `mailing_contact_sources`: multiple retained source relationships, source reference/date, optional event/year, original consent metadata, and an optional original-record JSON snapshot.
- `mailing_contact_tags`: small manual label vocabulary.
- `mailing_campaigns`: draft metadata and a stored server segment definition/count. Phase B will add the body/editor model.
- `mailing_campaign_recipients`: future immutable recipient identities/snapshots. Phase A creates no rows in this table.

The migration is review-only and has **not** been applied to production. It contains no contact backfill or historical import. Existing legacy `mail_campaigns`, `mail_campaign_recipients`, and `email_outbox` objects remain untouched and are not used by Mailing A.

## Contact identity and sources

Email identity is deterministic: trim, then lowercase. Provider-specific transformations (Gmail dot removal or `+` alias removal) are never applied. Equal normalized emails resolve to one planned canonical contact with multiple sources. Different emails are never merged by name; an exact normalized-name collision can only set a possible-duplicate review flag.

Current Member fields and participation facts are dynamically derived from `members`, current reservations, verified/approved attendance/history, cars, gallery submissions, and Show & Shine state. A stored contact can link through `current_member_id`; an unmaterialized Member appears as a stable `member:<uid>` projection without a read-side database write. Historical contacts can exist without a Member account and retain every source/year. A later controlled import must materialize canonical/source rows before they can become immutable campaign recipients.

`planHistoricalContactImport()` is deterministic and always returns `dryRun: true`. It reports accepted/rejected rows, planned contacts, retained sources, and exact-name/different-email review groups; it never writes D1.

## Consent and suppression

Privacy consent and mailing consent each support `yes`, `no`, and `unknown`, with source/date metadata. Mailing eligibility is derived conservatively:

- explicit mailing consent `yes` plus no suppression/block is `eligible`;
- mailing consent `no` is `ineligible`;
- mailing consent `unknown` is `review_required`;
- `unsubscribed`, `hard_bounce`, `blocked`, or `manually_suppressed` always produces `suppressed`.

Privacy consent alone never implies mailing eligibility. Historical unknowns are retained and excluded from the eligible-recipient segment.

## Segmentation and Admin flow

Supported rules are: all contacts, mailing-eligible, active Member, registered/not registered for the current event, historical event year, incomplete profile (using currently supported profile-completion facts), participation at a configurable minimum of two events, Show & Shine participation, legacy-only, and exact manual tag. Up to ten inclusion rules can use AND or OR, followed by up to ten exclusion rules. The API accepts only this vocabulary, not arbitrary SQL.

Admin routes:

- `GET /api/admin/mailing/overview`
- `GET /api/admin/mailing/contacts`
- `POST /api/admin/mailing/segments/preview`
- `GET|POST /api/admin/mailing/campaigns`
- `PATCH /api/admin/mailing/campaigns/:id`

The Admin Mailing view defaults contacts to current/relevant records, with historical-only contacts behind an explicit filter. Recipient preview shows the current count, identity, Member/historical relationship, source years, and eligibility state. Campaigns support basic draft metadata only; there is no editor, send, test-send, provider, webhook, or public mutation route.

## Planned phases and decisions

- Before historical import: approve source-file mapping, stable source references, the legal interpretation of each historical consent field, duplicate-review handling, and a separately controlled backup/dry-run/apply procedure.
- Mailing B: define the E36 template/body snapshot model, editor blocks, preview behavior, and whether draft segment counts should be refreshed or frozen during preparation.
- Mailing C: provider integration, immutable recipient materialization, suppression/unsubscribe flow, delivery state, and operational failure handling.
- Mailing D: questions and responses keyed by stable `campaign + recipient + question`, including first-click and final-confirmed values/timestamps without duplicate logical responses.
