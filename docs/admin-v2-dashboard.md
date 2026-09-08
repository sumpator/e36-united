# Admin V2 Stage 3 — dashboard and navigation

Stage 3 starts at 8933c17a4ecbcdb6625b2f8a53af49ae54775768 (documentation acceptance), preserving accepted 688441b15540623fe416e704b985f04fd2999f9f and all preceding reviewed work. Stage 4 is not implemented. A later operator instruction authorizes ONLY the fully green checkpoint push; no deployment, remote migration, production writes, providers/configuration/email or real-contact import.

## Navigation / context

Five primary areas on desktop/mobile: **Přehled; Rezervace & finance; Komunita; Mailing; Nastavení**. Secondary finance: Reservations / Accommodation / Payments. Community: Members / Photos / United Club (existing History/S&S review). Mailing retains Overview / Contacts / Segments / Campaigns; delivery stays in its campaign. Settings reuses the existing event editor. No duplicate editor, search, Member detail, scanner or check-in.

admin/destinations.js owns canonical areas, view IDs, allowlisted drill parameters and navigation-only quick links. Legacy section=dashboard/reservations/payments/accommodation/gallery/members/mailing/event URLs remain supported; canonical grouped URLs use finance/community/settings plus view. Gallery history maps to view=club. No QR payload, arbitrary external URL or personal search enters route/history.

Selected event is independent of public CURRENT. Settings explicitly labels both; selecting a historical event performs no current-event update. Existing safe event command/confirmation is unchanged. Global Stage 2 search and immutable-ID Member 360 remain available throughout Admin. Resolver is identification only; reads never create QR.

## Compositions and widget catalog

admin/dashboard-model.js owns factories/schema validation; dashboard-data.js produces exact chart/table models; dashboard.js renders keyed cards and preferences; dashboard.css provides native responsive layout. No dependency/framework/build-system addition.

| Widget ID | Definition / exact destination | Factory |
| --- | --- | --- |
| reservations | Count pending + approved reservations; active list | Both |
| people | Planned crew SUM pending + approved; same active population, not Member count | Preparation |
| recorded | Recorded Kč across ALL reservation states; paid > 0 list | Preparation |
| outstanding | SUM positive active due-minus-paid; active debt list | Both |
| trend | Cumulative all stored reservations, real UTC created_at; point drills through date including prior base | Both, wide |
| occupancy | Approved physical units / same-unit capacity, pending demand separately; option/status list | Both, wide |
| finance | Active due/applied/remaining, all recorded paid, inactive paid and all-state excess; separate scopes | Preparation |
| statuses | Disjoint pending/approved/rejected/cancelled/draft counts | Both |
| attendance | Declared weekend/Saturday/day visit; active reservation counts, not check-in | Both |
| sns | Declared yes/maybe/no; active reservations, not entries/scoring/results | Both |
| members | Global D1 profiles, not complete Firebase census; canonical Members list | Optional |
| planner | Existing forward-only registration/Planner funnel and capped details | Optional; NEITHER factory |

Preparation has exactly four initial KPI widgets: reservations, people, recorded, outstanding; then wide trend/occupancy and finance/status/attendance/S&S. All widgets can be removed or changed. Onsite places existing search and four quick links before fixed Attention, two compact KPIs, status and graphs. Only context/Attention are fixed. Composition selection is explicit and route-preserved, never automatic by date/device/event. Responsive sizes share one logical layout, not separate mobile preferences.

Quick-link allowlist (maximum four per composition): Members; all reservations; payment attention; active debt; pending Community photos globally; History/S&S review globally; selected-event accommodation; selected-event settings. Onsite default: Members, Reservations, Payment attention, Pending photos. Links navigate only; no arbitrary URL, mutation or future fake feature.

## Graphs / Attention / return

Native SVG line and CSS bars share the EXACT model with keyboard/touch **Zobrazit data** tables: labels, date, values, unit and definition. Incompatible finance populations are not stacked. Unlimited capacity is Bez limitu, never a percentage. Missing values are — / unavailable; known zero stays zero. Empty/one-point trend works; missing/invalid creation dates are counted, not assigned to updated_at. Seven/30/all ranges affect ONLY trend, explicitly including its prior cumulative base. Event and UTC/created_at scope remain explicit.

Fixed **K vyřízení**: pending reservations; active awaiting payment NOT overdue; approved overdue under existing validated deadline rule; all-state overpayments; global pending photos; global pending History/S&S claims. Reason/scope accompany count. Oldest uses genuine submitted_at or source created_at only; no invented SLA. Categories overlap and have no misleading total. All-clear requires complete finite counts and both resources fresh within policy; unavailable, failed, expired, hidden or offline data cannot imply all-clear. Last known data remains labelled uncertain.

Exact allowlisted/bound-SQL list drills: status/financial scope, option, approved/pending occupancy, planned attendance, S&S interest, UTC creation from/to. Default Stage 2 SQL is unchanged. Filter context/clear action is visible in destination; detail-by-ID still bypasses list filters. Cancelled/rejected cash remains accessible. Navigation never writes business data.

Composition/range/event/drill are in safe route; history retains existing filters/page/scroll. Dashboard → filtered finance → Member 360 → Back restores source/dashboard. Existing source editor/private-media/dirty protection remains canonical. Unchanged chart nodes/details persist; focused cards are not remounted by refresh. Widget order changes only explicitly.

## Personal preferences / safe writes

Forward 2026-09-08-admin-preferences.sql follows admin-read-budget, mirrored exactly in schema. One own-Admin-UID/FK row, version-1 bounded JSON, revision/time. GET returns absent factories in memory, **zero writes**. PUT validates both definitions, unique safe IDs, supported sizes, ≤4 allowlisted links. No event, personal query, finance scope, external URL or pixels stored.

Existing active-Admin router protects GET /api/admin/dashboard and GET/PUT /api/admin/preferences. Existing If-Match/idempotency/CAS/batch/receipt architecture handles writes. First explicit save initializes virtual preference revision in the SAME transaction; competing first saves have one winner/one conflict. Lost response reconciles through existing receipt; only explicit same-ID retry resends. Old clients without preconditions fail closed. Six local SQLite changes on first save include revision/receipt bookkeeping, not business-domain writes.

Normal view has one **Upravit přehled** action. Edit mode: add/hide, up/down, size, quick links, explicit Save/Cancel, confirmed reset of CURRENT composition only. No autosave. Both definitions save under one revision. Shared editor tracks JSON draft rather than transient UI fields. Dirty/saving/unknown/conflicting drafts survive refresh. Failed preference read cannot save factories over stored work. Another device's revision displays an explicit apply notice without switching the live composition. Unknown future widget IDs are preserved, skipped in rendering and labelled in editor; no read-side rewrite. Reload uses existing draft/operation recovery.

## Refresh / boundaries

One existing coordinator: 60s operational; existing 120s expensive lists; 300s summary/new analytics. Most graphs add no periodic query beyond summary. New dashboard endpoint batches genuine daily counts and awaiting/oldest after event probe. Optional Planner uses its existing handler at 300s only when selected. Dashboard periodic fanout is two requests, or three with Planner. Preferences are startup/explicit reads, not a fourth periodic request. No per-widget/chart/composition timer or fast Onsite mode. No inactive domain, provider, private-photo preload or polling-induced writes.

[Incremental budget](admin-v2-free-tier-budget.md#stage-3-incremental-dashboard-budget) / [actual SQL/plans](admin-stage3-budget.json) distinguish local profiles/estimates from Cloudflare meta.rows_read. Stage 2's 1M target stays formally unmet and operator-accepted, not reopened.

Optional Poslední změny omitted: current audit/receipts are not complete Member/provider activity and this lower-priority feature does not justify another query/history model. No event sourcing, history reconstruction, warehouse, background job or production backfill. Stage 4's remaining operational-page overhaul is deferred, not working Stage 3 mobile controls. Desktop WebKit is not physical iPhone Safari. Production migrations/QR provisioning remain separately authorized; none performed.
