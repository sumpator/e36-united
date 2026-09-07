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
- Non-secret `BREVO_LIST_FOLDER_ID` is required for Brevo's create-list API. Configure an explicitly approved E36 folder later; this task creates none. Each prepared campaign owns a dedicated list and Marketing campaign. C.1 bulk-imports only frozen normalized email addresses with `updateExistingContacts:true`; no Member attributes, blacklist flags or unrelated list replacements are supplied. Import notifications are disabled.
- Modeled Marketing endpoints: `POST /contacts/lists`, `POST /contacts/import`, `GET /processes/:id`, `GET /contacts/lists/:id/contacts`, `POST /emailCampaigns`, `PUT /emailCampaigns/:id`, `POST /emailCampaigns/:id/sendTest`, `POST /emailCampaigns/:id/sendNow`. Adapter list deletion exists but is not exposed or automatic: only reconciled E36-owned lists may ever be cleaned up later.
- Draft tests use canonical **current saved draft** content and a separate reusable provider test campaign. Explicit 1–5 addresses are mandatory; an empty Brevo test-address list would target the provider's whole test list, so it is refused. Test addresses are never persisted as contacts/recipients/events and do not affect live stats. Brevo's test quota is provider-enforced; raw provider errors are never shown.
- Live send uses only exact frozen HTML and list ID, requires provider readiness and completed sync, positive matching frozen population, confirmation, and configured quota. Any Survey block refuses live sync/send (`survey_delivery_not_ready`) until Mailing D. Survey test links stay non-destructive placeholders. A post-freeze opt-out vetoes delivery without modifying the historical snapshot.
- `MAILING_DAILY_SEND_LIMIT` defaults to 300; an invalid explicit value fails closed. Per-campaign limits and atomic daily admission include previously accepted and unresolved in-flight sends. This is a conservative E36 admission budget, not a claim about remaining Brevo account quota; external sends/test usage and provider quota must also be checked before activation. No partial/multi-day scheduler exists.
- Persistent per-campaign operation locks prevent simultaneous sends. IDs are stored immediately and reused. Only accepted `sendNow` changes the campaign to sent/scheduled. Finite 18-second timeouts apply to each provider request. No mutating call automatically retries. Definite HTTP 4xx rejections release the lock; ambiguous network/5xx/malformed outcomes or process death retain a reconciliation lock indefinitely. Do not clear it or resend blindly: inspect the stored IDs and Brevo outcome under a separate approved operational procedure.
- C.1 replaces the original per-contact upserts with a bounded asynchronous bulk import; see the request-count review below. No plan/configuration changes are performed here.

### Additive schema / review boundary

`db/migrations/2026-09-07-mailing-delivery.sql` is **LOCAL ONLY**, forward-only, and registered in the canonical schema. Existing migrations are unchanged. It adds explicit prepared/provider/operation fields, six recipient projection fields, `mailing_delivery_events`, and campaign/event/operation indexes. Event-table DDL is included in the foundation commit to keep ONE migration; webhook/projection implementation belongs to the tracking commit. The final canonical schema also includes the already-deployed, unchanged Production Feedback schema; its test setup therefore no longer applies that migration twice. No Feedback behavior/assertion is removed.

Local fixtures use synthetic addresses and fully mocked provider transport. No provider readiness, domain authentication or production row counts are claimed from these tests. Mailing D response links and Mailing E actual contact imports are deliberately deferred.

### Tracking and suppression

`POST https://api.e36united.cz/api/mailing/brevo-webhook` is the only public Mailing mutation. It uses **`X-E36-Brevo-Secret`**, not Firebase or browser Origin. Missing server secret fails closed (503); missing/wrong header is 401 before D1 access. Fixed-size secret digests use Workers' timing-safe comparison. JSON is bounded to 64 KiB and at most 100 events; configure ordinary, non-batched marketing events initially. All events are validated before writes. Each event, recipient projection and contact suppression update is one D1 transaction; retries after partial batch processing remain safe. No external calls occur inside tracking.

The live provider campaign ID resolves the campaign, then frozen normalized email resolves the recipient. Test IDs and unknown campaigns have no writes. Unknown recipients create a nullable-recipient audit event only, with no contact mutation or unique-recipient counts. Retained metadata is deliberately compact (provider event type, webhook configuration ID, sent timestamp), not raw headers/reasons/IP/profile data. Click URLs are bounded HTTP(S) only and never executed.

Marketing payloads normalize `delivered`, `opened`/`proxy_open`, `click`, `soft_bounce`/`soft_bounced`, `hard_bounce`, `blocked`/`spam`, and `unsubscribe`/`unsubscribed`; `sent`/`requested` is supported if supplied. The marketing `id` is a webhook configuration ID, not an occurrence ID. A SHA-256 key of campaign/email/type/UTC event timestamp/click URL deduplicates retries; same-second identical events may coalesce deliberately. Unique-recipient metrics never count repeated opens/clicks, even at different timestamps. `ts_event` is preferred over `ts`; local date strings are not guessed.

Recipient projections retain latest delivery/open/click timestamps, with terminal unsubscribe > blocked > hard-bounce precedence. A later delivered event can recover a soft bounce; it cannot clear permanent suppression. Unsubscribe sets contact suppression to `unsubscribed`; hard bounce sets suppression/deliverability to `hard_bounce`; spam/blocked sets both to `blocked`. Existing stronger/manual suppression is not downgraded. Soft bounce records history without permanent suppression. No contact is deleted and no Member/profile data changes.

The sent Admin dashboard shows unique recipients, sent (accepted for scheduling), delivered, opened, clicked, bounced/blocked and unsubscribed. Open figures are explicitly orientational because of privacy proxies. Recipient detail is capped at 500 rows; aggregate counts cover the complete population. The E36 footer uses the provider's `{{ unsubscribe }}` destination; there is no separate custom unsubscribe page or survey response handler.

The tracking commit also adds suppression checks directly to preparation/send admission SQL, so an opt-out arriving between evaluation/readiness and the conditional state transition is refused atomically. Delivery after provider acceptance is provider-controlled; D1 cannot retract an already accepted remote send. Reconciliation or provider cancellation must never be inferred as successful locally.

### Later activation checklist — separate authorization required

1. Review all three local Mailing C/C.1 commits; rerun all gates. Confirm the desired Brevo account and actual current production state without assuming zero campaigns.
2. Create/login to Brevo, create an API key, and add/verify `info@e36united.cz` as sender (verification may itself send email; this task does not do it).
3. Add sender domain `e36united.cz`. Copy **only Brevo-generated DNS values** into Cloudflare DNS after explicit approval. Verify both domain `verified` and `authenticated`; do not invent SPF/DKIM/DMARC records or replace existing records blindly.
4. Create/select an approved E36 delivery-list folder; record its numeric ID as Worker configuration `BREVO_LIST_FOLDER_ID`. Set `MAILING_DAILY_SEND_LIMIT` (initially 300), verify Workers subrequest capacity, Brevo remaining daily quota and account sending approval. No lists/contacts need importing at this step.
5. Configure Worker secret `BREVO_API_KEY`. Generate an independent strong random webhook secret and configure `BREVO_WEBHOOK_SECRET`; never put either in Git, screenshots, query strings or Admin code.
6. Back up/review D1; apply **only** `db/migrations/2026-09-07-mailing-delivery.sql` to the intended production database under rollout authorization. Verify migration registry and `PRAGMA foreign_key_check`. Do not execute the canonical schema against production.
7. Deploy the reviewed Worker (same bindings), then explicitly authorized push/automatic Pages rollout. Verify the matching Admin module/cache versions. Neither happens in this task.
8. In Brevo create a webhook with `type=marketing`, `channel=email`, `batched=false`, URL `https://api.e36united.cz/api/mailing/brevo-webhook`, custom header **`X-E36-Brevo-Secret: <same secret>`**, and events **`delivered`, `opened`, `click`, `hardBounce`, `softBounce`, `spam`, `unsubscribed`**. Configuration enum names differ from some payload names. Do not subscribe to contact updates/list additions/SMS. Add proxy-open only if supported in that account's marketing webhook configuration. Do not auto-create a webhook from the application.
9. Verify Admin provider readiness and folder/limit settings; safely check missing/wrong webhook secrets fail closed. Provider connectivity/domain verification are still UNVERIFIED until this activation.
10. With explicit authorization and an explicitly entered recipient, send **one** test email from a saved draft. Verify rendering, sender/reply-to and footer. This test does not create real campaign recipients or inflate live stats; its provider events are deliberately ignored by the live dashboard.
11. Verify live webhook ingestion separately with authorized synthetic/read-only reconciliation checks. A real end-to-end live delivery event requires a separately approved, eligible consented recipient/campaign, not hidden conversion of a test address into a contact. Survey-containing campaigns remain blocked. Verify delivery/opt-out synchronization before enabling any broader real send.
12. Only then approve Mailing D recipient-specific survey responses. Mailing E imports/backfill require their own consent/data authorization. No survey persistence or real contact import is part of C.

Readiness blockers before a first test: reviewed rollout/migration, configured API key, verified active sender and authenticated domain, available provider test quota, explicit recipient/email authorization. Live delivery additionally needs the folder, sufficient Worker/account quota, consented frozen population, no Survey, completed provider sync, configured/verified webhook and explicit send confirmation.

References: [Brevo Marketing events](https://developers.brevo.com/docs/marketing-webhooks), [webhook configuration](https://developers.brevo.com/reference/create-webhook), [Marketing campaign API](https://developers.brevo.com/reference/create-email-campaign), [explicit test recipients](https://developers.brevo.com/reference/send-test-email), [list folder requirement](https://developers.brevo.com/reference/create-list), [Workers subrequest limits](https://developers.cloudflare.com/workers/platform/limits/).

### Local verification (2026-09-07)

- Pre-flight unchanged suites: Node 241/241, syntax 86 files, Chromium 34/34, focused WebKit 8/8. Both browser suites were rerun successfully outside the sandbox before implementation.
- Final Node: 299/299 (58 focused new preparation/provider/tracking cases); syntax: 95 JavaScript files.
- Chromium: 38/38 (34 existing plus four Mailing C regression cases); focused Member WebKit: 8/8 unchanged. Existing behavioral browser assertions were not relaxed. One new provider-error fixture deliberately expects an HTTP 502 resource error.
- Exact additive migration executes against pre-C plus the unchanged Feedback migration, preserves an existing draft, matches the canonical table/foreign-key definitions, and passes `PRAGMA foreign_key_check`. Rollback tests cover failed preparation and failed event/suppression projection.
- Read-only static import traversal from Admin/Worker entry points: 64 modules, no circular dependencies or missing relative imports. No dependency/configuration changes.
- Existing test adaptations are limited to the newly available guarded send route (draft rejection remains explicit), the sixth Mailing table, additional read-only API fixtures, and avoiding duplicate Feedback migration setup. No existing behavior coverage was dropped.
- All Brevo transport was mocked. No real contact imports, emails, provider objects, secret changes, production D1/R2 writes, push or deployment occurred.

### Mailing C.1 — bulk synchronization and Free Worker budget

The original fresh sync was two readiness GETs, one list POST, **N contact POSTs**, then one campaign POST: **N + 4** (5 / 54 / 304 for 1 / 50 / 300 recipients). Provider-object creation alone contributed two requests inside that invocation. Readiness alone was two; draft test was four (readiness + create/update test campaign + sendTest); real send was three (readiness + sendNow), each in separate Worker invocations. D1 preparation/reads are not external HTTP subrequests.

The replacement is `POST /v3/contacts/import` with `{jsonBody:[{email:<frozen normalized email>}],listIds:[<campaign list ID>],updateExistingContacts:true,disableNotification:true}`. No attributes, blacklist-reset options, remote file URL, notify URL or unrelated list IDs are supplied. The complete UTF-8 JSON payload is capped at **8,000,000 bytes**, below Brevo's documented 10 MB maximum. Oversize input is rejected before creating provider objects. There is no per-recipient HTTP loop.

An accepted positive `processId` is saved as nullable integer `provider_import_process_id`, atomically releasing the submission lock. This one additional field is added to the still-unpublished C migration and canonical schema in a third commit: the existing status/error/lock fields are not repurposed to hide an external identifier. Existing commits are not amended; no migration is applied remotely.

Each explicit synchronization action performs **one** `GET /v3/processes/:id`, with the existing 18-second timeout. `import_queued` and `import_processing` return without campaign creation, synced timestamp or send permission. There are no timers, sleeps, automatic UI polling, cron or queues. The existing Delivery panel shows the process ID/state and offers `Zkontrolovat import`; reload/refresh alone does not submit another sync/import.

Only a `completed` process proceeds to exact dedicated-list verification (500 contacts per page, also bounded by the adapter budget). Missing/extra/duplicate/blacklisted recipients block readiness, since a completed import may contain rejected rows. Provider report URLs are neither followed nor exposed. The existing campaign ID is reused or a single campaign is created with the immutable prepared HTML; only then is `provider_synced_at` set.

Read-only timeout, malformed process response or incomplete-list verification persists `import_check_failed`, retaining the process/list IDs without a mutation lock. An explicit recheck is safe and never reimports. Terminal `failed` is persisted as `import_failed` and blocks send; only an explicitly confirmed retry with `{retryFailedImport:true,processId:<current failed ID>}` starts a replacement import into the same dedicated list. Stale retry confirmations fail closed. Frozen D1 recipients never change. Ambiguous **mutating** failures still retain the original indefinite reconciliation lock; an unknown import-submit response is not retried blindly. Concurrent imports/campaign creation remain protected by conditional mutation locks and process-ID checks.

| Separate Worker invocation | Brevo fetches for 1 / 50 / 300 recipients |
| --- | --- |
| Fresh sync, process immediately complete | **7 / 7 / 7**: readiness 2 + list 1 + import 1 + process 1 + list verification 1 + campaign 1 |
| Fresh sync, process pending | 5 / 5 / 5 |
| Explicit pending recheck | 3 / 3 / 3 |
| Recheck completing an existing import | 5 / 5 / 5 |
| Explicit failed-import retry, immediately complete | 6 / 6 / 6 (existing list reused) |
| Already synchronized | 0 / 0 / 0 |
| Subsequent real send | 3 / 3 / 3 |

One adapter is constructed per delivery route invocation with a hard **12-fetch ceiling**, including readiness, process checks and every verification page; redirects are refused. Normal 300-person sync peaks at seven Brevo fetches. Existing Firebase authentication can additionally fetch JWKS (up to two direct requests on key refresh); no other external requests are made by these routes. Thus the direct request budget is at most **14**, comfortably below Workers Free's 50 external-subrequest limit. D1 is an internal binding, not N extra external requests. Admin reload/readiness calls are separate invocations, not additions to the sync invocation. This is a subrequest-budget proof, not a claim of live provider availability or production load testing. Much larger future audiences must re-review CPU, payload/response size, pagination, provider quota and request budget before changing the send limit; the adapter fails closed at its ceiling.

The Cloudflare Workers guidance informed the per-invocation hard budget and finite asynchronous boundary. No runtime framework, dependency, scheduler, provider configuration or production data changes are part of C.1. Prepare/freeze, daily admission, Survey guard, webhook, unsubscribe/suppression and metrics remain unchanged.

References: [Brevo bulk import and limits](https://developers.brevo.com/reference/import-contacts), [process status](https://developers.brevo.com/reference/get-process), [paginated list verification](https://developers.brevo.com/reference/get-contacts-from-list), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

C.1 local verification (2026-09-07): pre-flight unchanged Node **299/299**, syntax **95/95**, Chromium **38/38**, focused WebKit **8/8**. Final Node **313/313** (14 new bulk/budget/state cases), syntax **95/95**, Chromium **39/39** (one added pending/retry UI regression), WebKit **8/8** unchanged. Import traversal: **64 modules**, no missing relative imports/cycles. Exact unpublished migration/canonical parity, existing-draft preservation and FK checks pass in local in-memory SQLite. Existing assertions remain intact except the deliberately superseded per-contact API payload expectation, replaced with strict bulk-payload and zero-per-contact-call assertions. All provider transport is mocked; no production/provider mutation, email, push or deployment occurred. Browser runs emitted the existing harmless `NO_COLOR`/`FORCE_COLOR` warning.
