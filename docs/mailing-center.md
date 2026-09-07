# Mailing Center

The Mailing Center keeps contact consent, segmentation, campaign composition,
preparation, delivery, and event projection inside the existing Worker and D1
database. SMTP2GO is the only active delivery provider. The application does not
maintain a provider-side contact list or campaign object.

## Structure

Worker responsibilities are split under `worker/domains/mailing/`:

- `contacts.js` projects the contact universe and consent/suppression state.
- `segments.js` validates the fixed server-side segment vocabulary.
- `campaigns.js` owns draft metadata and structured content.
- `template.js` validates blocks and renders the canonical email HTML.
- `preparation.js` freezes the immutable campaign and recipient snapshot.
- `delivery.js` owns readiness, test delivery, daily admission, locking, and live
  batch delivery.
- `provider/smtp2go.js` is the isolated bounded SMTP2GO HTTP adapter.
- `tracking.js` authenticates and projects SMTP2GO webhook events.
- `delivery-routes.js` exposes the Admin delivery routes behind the existing
  Firebase and active-Admin authorization boundary.

The Admin modules under `admin/modules/mailing/` retain the draft editor,
server-rendered desktop/mobile preview, preparation confirmation, test form,
send confirmation, delivery state, and aggregate recipient metrics. `admin.js`
continues to own only bootstrap, session orchestration, and cross-domain wiring.

## Draft, template, and preparation model

Campaigns store a versioned structured block model. The server is the only HTML
renderer; Admin previews and delivery therefore use the same validated output.
Arbitrary HTML is escaped, URLs are validated, and the email shell is table-based
with inline critical styles and an opaque preview sandbox.

Preparation atomically freezes the subject, preheader, template/content, exact
canonical HTML, recipient identity/email/name/source/eligibility, and recipient
count. Source edits cannot rewrite a prepared snapshot. Prepared and sent
campaigns cannot be edited. Unprepare is allowed only before live provider
acceptance. A final consent/suppression veto is applied atomically at send
admission without modifying the historical snapshot.

Survey blocks remain intentionally blocked for live delivery until Mailing D.
Test delivery renders harmless placeholder survey links and creates no contact,
recipient, delivery-event, or campaign-status records.

## SMTP2GO transport

Delivery uses the SMTP2GO EU API base `https://eu-api.smtp2go.com/v3` and direct
`POST /email/batch`. One API request carries one independent email object per
frozen recipient. The adapter requires an ordered, complete response and stores
the returned SMTP2GO `email_id` on the matching frozen recipient. The provider
request ID is retained on the campaign when supplied.

Each email uses:

- sender `E36 United <info@e36united.cz>`;
- reply-to `info@e36united.cz`;
- exactly one frozen recipient;
- the immutable prepared subject and HTML;
- a generated plain-text alternative;
- campaign, recipient, and preparation correlation headers.

The footer contains SMTP2GO's `%%UNSUBSCRIBE%%` replacement token. The selected
API key must have its Unsubscribe Footer enabled. Open Tracking and Click
Tracking must also be enabled for the Admin metrics to receive those event types.
The sender domain is `e36united.cz`; the tracking domain is
`link.e36united.cz`.

`SMTP2GO_API_KEY` is a Worker secret. It is never returned to Admin, persisted in
D1, logged, or committed. `SMTP2GO_API_BASE`, sender/reply-to values, and
`MAILING_DAILY_SEND_LIMIT=200` are non-secret Worker configuration.

Readiness performs read-only domain and email-cycle checks. Admin sees only safe
states and counts: configured, domain verification, current cycle usage,
remaining allowance, and the E36 daily admission limit. It never receives API
keys, DNS records, or raw provider responses.

## Send safety and request budget

Live send requires a prepared campaign, a matching positive frozen population,
current consent/suppression eligibility, no Survey block, readiness, sufficient
provider cycle allowance, sufficient E36 daily allowance, and an explicit Admin
confirmation. There is no multi-day scheduler and a campaign above the 200
recipient limit is rejected with a clear count/limit error.

A persistent conditional operation lock prevents concurrent sends. A successful
batch response writes campaign acceptance and every ordered recipient `email_id`
in one D1 batch. Definite local/provider 4xx rejection releases the lock. Network
timeouts, 5xx responses, process death, or malformed/partial/duplicate batch
identity are ambiguous and retain a reconciliation lock; they must not be resent
blindly.

The adapter has an 18-second timeout, refuses redirects, bounds response and
request JSON, and permits at most eight provider fetches per Worker invocation.
Normal readiness plus test/live batch delivery uses three SMTP2GO requests for
1, 50, or 200 recipients. Firebase JWKS refresh can add up to two direct
requests, so the reviewed upper bound is ten, below the Workers Free external
subrequest limit of 50. D1 binding operations are not external HTTP subrequests.

## Webhook and event model

SMTP2GO posts JSON to:

`POST https://api.e36united.cz/api/mailing/smtp2go-webhook`

The endpoint does not use Firebase or browser Origin. It fails closed when
`SMTP2GO_WEBHOOK_SECRET` is unavailable and requires exactly
`Authorization: Bearer <secret>`, compared using fixed-size SHA-256 digests. The
request body is capped at 64 KiB and 100 events. Raw payloads, authorization
headers, delivery reasons, IP addresses, and credentials are not stored.

The provider `id` is the immutable event deduplication key. Events resolve first
by stored recipient `provider_email_id`; correlation headers provide a bounded
fallback. Unknown recipients/campaigns cannot suppress contacts. Event mapping:

| SMTP2GO event | D1 event/projection |
| --- | --- |
| `processed` | sent |
| `delivered` | delivered |
| `open` | opened |
| `click` | clicked |
| hard `bounce` | hard bounce + permanent suppression |
| soft `bounce` | soft bounce history only |
| `spam` | blocked + permanent suppression |
| `unsubscribe` | unsubscribed + permanent suppression |
| `reject` | rejected history only |
| `resubscribe` | resubscribed history only; no automatic unsuppression |

Recipient projections retain latest delivery/open/click timestamps and terminal
suppression precedence. Later delivery can recover a soft bounce but cannot clear
unsubscribe, hard-bounce, spam, stronger manual suppression, or an already
suppressed contact. No contact is deleted and Member/profile data is untouched.
Open counts are explicitly orientational because privacy proxies can generate
opens.

The SMTP2GO webhook should be JSON, subscribe only to `processed`, `delivered`,
`open`, `click`, `bounce`, `spam`, `unsubscribe`, and `reject`, and send the
Bearer secret. It should preserve the three correlation headers and restrict to
the selected API username where supported. Exactly one E36 webhook should exist.

## Schema boundary

`db/migrations/2026-09-07-mailing-delivery.sql` is a forward-only migration. It
adds prepared/delivery/operation fields, frozen-recipient projections including
`provider_email_id`, delivery events, and supporting indexes. It contains no
provider contact-list, import-process, or remote-campaign fields. The canonical
schema mirrors the migration and keeps foreign keys enabled.

## Deferred work

- Mailing D: recipient-specific Survey response links and logical response
  persistence.
- Mailing E: separately authorized contact import/backfill and later analytics or
  automation.
- Reconciliation/lock clearing after an ambiguous provider outcome requires a
  separate reviewed operational procedure.
- Any increase beyond the 200-recipient limit requires a new payload, CPU,
  provider-quota, and Worker-request-budget review.

No current phase imports provider contacts, creates provider lists/campaigns,
sends an automatic email, changes DNS, or implements Survey persistence.

## Production activation checklist

1. Review and apply only the delivery migration after a D1 Time Travel bookmark
   and read-only pre-counts; verify schema, indexes, migration registration, and
   `PRAGMA foreign_key_check`.
2. Store `SMTP2GO_API_KEY` and an independent random
   `SMTP2GO_WEBHOOK_SECRET` as Worker secrets. Never put them in Git, Admin code,
   screenshots, URLs, logs, or D1.
3. Verify read-only that `e36united.cz` and `link.e36united.cz` are authenticated,
   and that the current email-cycle allowance is compatible with the E36 limit.
4. In the selected SMTP2GO API key settings, enable Unsubscribe Footer, Open
   Tracking, and Click Tracking. Preserve the existing API rate-limit setting.
5. Create or reconcile exactly one E36 webhook with the URL, events, JSON output,
   Bearer authentication, three correlation headers, and API-username restriction
   described above.
6. Deploy the reviewed Worker, verify unauthenticated/Admin auth boundaries and
   wrong-secret webhook rejection, then push the exact reviewed commit so normal
   CI and Pages automation can run.
7. Inspect the production Admin Mailing panel without saving, preparing, testing,
   or sending. A first real test email needs separate explicit authorization.

References: [SMTP2GO regional endpoints](https://developers.smtp2go.com/docs/endpoints),
[batch delivery](https://developers.smtp2go.com/reference/send-email-batch),
[webhook configuration](https://developers.smtp2go.com/reference/add-webhook),
[API-key tracking/footer settings](https://support.smtp2go.com/hc/en-gb/articles/20733554340249-API-Keys),
[unsubscribe footer](https://support.smtp2go.com/hc/en-gb/articles/223087607-Unsubscribe-Footer),
and [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

## Local verification

Mailing C.2 final local verification on 2026-09-07: Node **305/305**,
first-party JavaScript syntax **95/95**, Chromium **39/39**, and focused WebKit
**8/8**. The Admin/Worker static import traversal covers **65 modules** with no
missing relative imports or cycles. The exact unpublished migration executes on
the pre-C schema, preserves existing fixtures, matches the canonical schema, and
passes `PRAGMA foreign_key_check`. Provider transport is fully mocked. The nine
retired list/import/process cases account for the change from the 313-test C.1
baseline; they are replaced by direct batch delivery, ordered provider-ID,
readiness/quota, ambiguity-lock, safe fallback, event-deduplication, and
suppression characterization. No existing application assertion was weakened.
