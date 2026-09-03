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

Brevo, test-send, real send, SPF/DKIM, webhooks, contact import, historical backfill, response persistence, opens, and clicks remain intentionally absent.
