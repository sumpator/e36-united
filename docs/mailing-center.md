# Mailing Center

Mailing A established the isolated contact, consent, segmentation, recipient-preview, and campaign-draft foundation. Mailing B adds structured email composition and a controlled E36 template. Neither phase sends email, integrates a provider, imports production contacts, or exposes public response/unsubscribe mutations.

## Architecture

Worker:

- `worker/domains/mailing/contacts.js` projects the current contact universe and derives consent/suppression eligibility without read-side writes.
- `worker/domains/mailing/segments.js` validates and evaluates the fixed server-side segment vocabulary.
- `worker/domains/mailing/campaigns.js` persists draft metadata, template version, structured content, and the current dynamic recipient count.
- `worker/domains/mailing/template.js` is the only HTML generator. It validates the block model, escapes content, and renders the versioned email-compatible shell.
- `worker/domains/mailing/index.js` exposes the Mailing routes inside the existing Firebase Admin authorization boundary.

Admin:

- `admin/modules/mailing/campaigns.js` loads, creates, updates, and selects campaign drafts.
- `admin/modules/mailing/editor.js` owns structured block editing, ordering, duplication, validation-friendly controls, and save state.
- `admin/modules/mailing/preview.js` requests the server renderer and owns desktop/mobile preview state.
- `admin/modules/mailing/index.js` coordinates Mailing tabs and passes the current dynamic segment to new drafts.

`admin.js` remains bootstrap/session composition only. No new runtime dependency, framework, Worker binding, or storage service was added.

## Campaign model and migration

`db/migrations/2026-09-03-mailing-editor.sql` adds two columns to `mailing_campaigns`:

- `template_version`: stable renderer identity, currently `e36-default-v1`;
- `content_json`: validated structured editable source with a JSON-validity database constraint.

The existing internal name, subject, preheader, segment definition, dynamic recipient count, and draft status remain authoritative. Drafts do not store a second potentially stale HTML copy. Mailing C can render and persist an immutable delivery snapshot from the saved template version and content immediately before preparation/sending.

Existing Mailing A rows receive the current template ID and an empty block model. The migration imports no contacts, creates no recipients, changes no consent, and touches no legacy `mail_*` object.

## Block model

Every draft stores:

```json
{
  "template": "e36-default-v1",
  "blocks": [
    { "id": "...", "type": "hero" },
    { "id": "...", "type": "rich_text" },
    { "id": "...", "type": "survey", "questionId": "...", "answers": [] }
  ]
}
```

Allowed blocks are Hero, Heading, Rich text, Image, CTA, Divider/Spacer, Highlight, and Survey. The server rejects unknown block types, unstable/duplicate IDs, unsafe URLs, more than 30 blocks, and surveys outside the 2–5 answer range.

Rich text is deliberately constrained. It supports paragraphs, simple `- ` lists, `**bold**`, `_italic_`, and `[label](https://…)` links. Arbitrary HTML is escaped; scripts and forms are never emitted.

Survey blocks already have stable block, question, and answer IDs. Mailing B renders visual answer links only. It does not record clicks or responses. Mailing D will replace the placeholder destinations with recipient-specific links and persist one logical response per `campaign + recipient + question`.

## Template and preview flow

The flow is always:

`structured content → Admin-only Worker renderer → final HTML → iframe preview`

`POST /api/admin/mailing/render-preview` returns the same final HTML generator intended for Mailing C. The Admin does not maintain a second visual approximation. Subject and preheader are shown in the preview chrome; the preheader is also embedded as hidden email preview text.

The template uses a 640 px table-based shell, inline critical styles, explicit image widths, absolute URLs, and no JavaScript. Desktop and 390 px mobile preview modes display that exact document. A small media query improves narrow-client spacing without being required for core readability.

The graphical treatment follows the current dark E36 Admin/site language: deep black-blue fallback surfaces, a blue radial atmosphere, subtle technical grid, silver/blue borders, and the real E36 United logo. `bgcolor`, inline `background-color`, and an Outlook conditional VML background preserve readable contrast when gradients are unsupported.

## Starter and images

The starter is `United 2026 — Zbraslavice feedback`. It uses the current website's verified United 2026 Zbraslavice hero asset and the exact survey:

- `SUPER – CHCI TAM UNITED ZNOVU`
- `LÍBILO SE MI – ALE MÍSTO JE MI VLASTNĚ JEDNO`
- `RADIĚJI BYCH LETOS JINAM`

No production draft is created automatically. The starter becomes data only when an Admin explicitly saves it.

Mailing B accepts validated absolute `http(s)` image references and shows controlled placeholders for unfinished image blocks. Campaign image upload is deliberately deferred to a small B2 scope so it can reuse private R2 with dedicated Admin authorization and lifecycle rules rather than broadening this editor rollout.

## Recipient behavior and deferred phases

Draft recipient counts remain dynamic and reuse the saved Mailing A segment. `mailing_campaign_recipients` remains empty until a later explicit preparation/freeze step.

- Mailing C: provider credentials, immutable HTML/recipient snapshot, unsubscribe/suppression operations, delivery, and operational failure handling.
- Mailing D: recipient-specific survey links, immediate click recording, confirmation/change page, and logical response identity.
- Mailing E: later analytics/automation work after consent and delivery policy are approved.
- B2 if approved: authenticated campaign-image upload/reference management in the existing R2 bucket.

The sections above describe the historical A/B boundary. Mailing C below supersedes its delivery deferrals; historical import and survey responses remain unimplemented.

## Mailing C — local delivery foundation (not activated)

`preparation.js` validates a saved draft, evaluates the persisted server segment and only eligible persisted contacts, then atomically freezes subject, preheader, template/content, exact canonical HTML, recipient identity/email/name/source/eligibility and count. Zero recipients is rejected. Conditional state updates and a single transactional D1 batch prevent duplicate or partial preparations. Later source edits cannot rewrite history. Prepared and sent campaigns cannot be edited. Unprepare deletes the snapshot only before any live provider list/campaign exists; test campaigns are separate and reusable.

`delivery.js` owns test/sync/send orchestration. `provider/brevo.js` is the isolated direct-fetch Marketing API adapter. `delivery-routes.js` remains behind existing Firebase + active-Admin authorization. `request.js` bounds untrusted JSON. The compact Admin `delivery.js` panel supplies state/readiness, explicit prepare/test/sync/send confirmations and reload coordination. The editor remains primary and becomes read-only for frozen states. Frozen previews use the stored HTML, not a fresh render. The iframe has an opaque sandbox origin and cannot open popups, submit forms or navigate the Admin top-level page. Canonical content is escaped and contains no scripts.

Admin routes: `GET /api/admin/mailing/provider-status`, `GET /api/admin/mailing/campaigns/:id/delivery`, and `POST /api/admin/mailing/campaigns/:id/{prepare,unprepare,test,provider-sync,send}`. Prepare confirmation contains subject/count/updatedAt; send confirmation contains preparationId/frozen count. Direct PATCH to `sent` is still prohibited.

### Provider and send safety

- Secrets (future activation only): `BREVO_API_KEY`, `BREVO_WEBHOOK_SECRET`. Neither is sent to Admin or logged. An absent API key produces `not_configured` with zero provider requests.
- Fixed sender: **E36 United <info@e36united.cz>**, reply-to `info@e36united.cz`, domain `e36united.cz`. Readiness checks `/senders` and `/senders/domains/e36united.cz`; UI only receives safe readiness states, never DNS records or credentials.
- Non-secret `BREVO_LIST_FOLDER_ID` is required for Brevo's create-list API. Configure an explicitly approved E36 folder later; this task creates none. Each prepared campaign owns a dedicated list and Marketing campaign. Only frozen normalized email addresses are upserted with `updateEnabled:true`; blacklist flags, unrelated list memberships and Member attributes are not overwritten.
- Modeled Marketing endpoints: `POST /contacts/lists`, `POST /contacts`, `POST /emailCampaigns`, `PUT /emailCampaigns/:id`, `POST /emailCampaigns/:id/sendTest`, `POST /emailCampaigns/:id/sendNow`. Adapter list deletion exists but is not exposed or automatic: only reconciled E36-owned lists may ever be cleaned up later.
- Draft tests use canonical **current saved draft** content and a separate reusable provider test campaign. Explicit 1–5 addresses are mandatory; an empty Brevo test-address list would target the provider's whole test list, so it is refused. Test addresses are never persisted as contacts/recipients/events and do not affect live stats. Brevo's test quota is provider-enforced; raw provider errors are never shown.
- Live send uses only exact frozen HTML and list ID, requires provider readiness and completed sync, positive matching frozen population, confirmation, and configured quota. Any Survey block refuses live sync/send (`survey_delivery_not_ready`) until Mailing D. Survey test links stay non-destructive placeholders. A post-freeze opt-out vetoes delivery without modifying the historical snapshot.
- `MAILING_DAILY_SEND_LIMIT` defaults to 300; an invalid explicit value fails closed. Per-campaign limits and atomic daily admission include previously accepted and unresolved in-flight sends. This is a conservative E36 admission budget, not a claim about remaining Brevo account quota; external sends/test usage and provider quota must also be checked before activation. No partial/multi-day scheduler exists.
- Persistent per-campaign operation locks prevent simultaneous sends. IDs are stored immediately and reused. Only accepted `sendNow` changes the campaign to sent/scheduled. Finite 18-second timeouts apply to each provider request. No mutating call automatically retries. Definite HTTP 4xx rejections release the lock; ambiguous network/5xx/malformed outcomes or process death retain a reconciliation lock indefinitely. Do not clear it or resend blindly: inspect the stored IDs and Brevo outcome under a separate approved operational procedure.
- Sync performs one contact upsert per frozen recipient. Before activation verify the Worker plan's per-request subrequest budget accommodates the chosen send limit (300 recipients needs more than the Free Workers 50-subrequest allowance). No plan/configuration changes are performed here.

### Additive schema / review boundary

`db/migrations/2026-09-07-mailing-delivery.sql` is **LOCAL ONLY**, forward-only, and registered in the canonical schema. Existing migrations are unchanged. It adds explicit prepared/provider/operation fields, seven recipient projection fields, `mailing_delivery_events`, and campaign/event/operation indexes. Event-table DDL is included in the foundation commit to keep ONE migration; webhook/projection implementation belongs to the tracking commit. The canonical schema retains the existing baseline's migration organization; apply the independent Production Feedback migration when constructing its full deployed schema.

Local fixtures use synthetic addresses and fully mocked provider transport. No provider readiness, domain authentication or production row counts are claimed from these tests. Mailing D response links and Mailing E actual contact imports are deliberately deferred.
