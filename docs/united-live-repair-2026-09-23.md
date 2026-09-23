# UNITED LIVE: controlled repair and release

## Scope

This implements the completed audit, not a second audit. The operator explicitly
approved separate event competition cars and the necessary controlled rebuild of
`live_entries` (superseding the earlier additive-only constraint).

- C1/C2: Admin events listen on `window`; workflow reads the actual entry category.
  Render/read failures retain an exit/retry path instead of a hidden empty Admin.
- C3: an explicit start may assign a legacy NULL category while retaining entry ID,
  votes, jury scores and photos. Replays do not silently change an assigned category.
- C4: selected-year LIVE settings also exist outside LIVE and show another active
  year. New entry requests read fresh state. Registrations remain independent.
- C5: indexed event revision advances on INSERT/UPDATE/DELETE, including updates
  to an existing score. Existing polling/backoff/hidden/offline policy is retained.
- C6: confirmed score receipts are separate from refresh status; a fresh GET cannot
  coalesce with a pre-write GET. Writes are serialized per context/entry; partial
  photo retries keep files and do not repeat confirmed identical scores.

Active authenticated members may vote without registration/payment/presence.
Own-car, presented-entry, active event and open-voting checks remain. Admins are
judges without separate assignment. Participants still need their existing start
eligibility; public voter eligibility does not relax participant requirements.

Event cars have stable IDs and owner/event FKs, optional private R2 media, and no
automatic garage or reservation update. Registered cars remain first choice.
Original M eligibility requires explicit admin confirmation; body is not rewritten,
and one Show & Shine entry cannot enter two categories. Members exposes QR/manual
code/search; lookup is read-only and presence requires a separate command.

## Verification before release

- Five targeted LIVE Node files: **24/24 PASS**. Includes populated migration/FKs,
  old indexes/uniqueness, original IDs/data, subsequent score read/edit, atomic
  legacy start, independent event cars, M confirmation, own vote prevention,
  revision updates, actual Admin event handler and fresh-request regression.
- `tests/e2e/united-live-repair.spec.mjs`: **2/2 Chromium PASS**, retries 0,
  clean runner exit. Uses isolated SQLite fixtures and real LIVE backend functions.
  Covers click/confirmation/direct entry/reload, failed GET recovery, independent
  global switch, explicit legacy category, score/history edit, second judge update
  preserving draft, confirmed PUT/failed GET/read retry, Members QR, event car
  cancel/save and explicit M confirmation. Final run: 8.3 s.
- JS/MJS syntax, Admin module graph (no errors/cycles), diff check and Worker
  `wrangler deploy --dry-run`: PASS. No full browser suite, WebKit or CI monitoring.
- Production export was rehearsed in isolated in-memory SQLite with FKs enabled:
  migration and scoped rollback preserve all 47 original application tables.
  Original LIVE rows: 2 entries, 2 states, 1 public vote, 1 score, 0 jury photos.
  Populated synthetic migration also includes a jury photo/gallery reference.

Physical phone camera/permissions and real authenticated production judging are
not claimed tested. No production test entries, votes, photos or scores are made.

## Query and write cost

No new timer or JSON polling request. The existing state request adds one indexed
event revision lookup; each LIVE API request adds one small indexed schema-marker
lookup. Full projections are refreshed when revision changes, not computed by the
short state endpoint. Relevant mutations add an event revision upsert per changed
row plus indexed write-fence lookup. Member search still uses one event-scoped
query, not per-member requests. These are code/query counts, not measured billing.

## Production cutover and rollback runbook

Previous Worker: `0f2a2eee-915f-4336-b5d8-5ffe453ab77a` (100%).
Previous frontend main: `7f8b8f5e9cbea0a5bdc1d0ed6f47091b3d4ee93a`.
Previous Pages: `06b3173e-3178-49d0-bc46-23d23de65480`.

1. Commit verified release. Deploy its gated Worker at 100%, preserving config and
   secrets. Before the schema marker, LIVE requests return a maintenance response;
   unrelated API remains available. Do not publish the frontend yet.
2. Execute only `db/operations/live-upgrade-write-fence.sql` against the existing
   production DB. This also rejects in-flight old-Worker LIVE writes. It does not
   change LIVE activation, categories, presence, registrations or business rows.
3. Export a fresh full private SQL backup outside Git while the fence is active;
   record SHA-256 and D1 Time Travel bookmark. Run
   `node scripts/verify-live-upgrade.mjs <backup.sql>`. This checks schema drift,
   migration, all original data, FKs/integrity and creates/rehearses a private
   `live-scoped-rollback.sql` alongside the backup. Stop on any discrepancy.
4. Apply **only** `db/migrations/2026-09-23-live-competition-cars.sql` once via
   `wrangler d1 execute e36-united-db --remote --file ...`. D1 uses an implicit
   transaction. Dependent tables are copied and rebuilt before the parent drop:
   disabling FK validation alone would not prevent CASCADE data loss.
5. Export post-migration state while writes remain fenced. Run
   `node scripts/verify-live-cutover.mjs <before.sql> <after.sql>` and remote
   `PRAGMA foreign_key_check`; verify schema/indexes/triggers. Compare original
   LIVE rows, cars/photos, reservations, event activation/registration settings.
6. Only after success insert the internal schema marker
   `2026-09-23-live-writes-enabled` to release the write fence. No business setting
   is toggled. Push main normally and verify automatic Pages source SHA/files.

Before step 6, the generated scoped rollback is the preferred recovery: it asserts
that writes have not been released and no event cars exist, removes only the new
LIVE objects/guards, and reconstructs the five original LIVE tables/rows/indexes.
It does not restore or delete garage, reservations or unrelated tables. Keep the
new gated Worker active until old schema restoration succeeds; then restore the
recorded previous Worker. A failure before migration needs only removal of the
named LIVE write guards and restoration of the prior Worker, without data import.
Do not apply this old snapshot after reopening writes; re-freeze and assess new
data first. Full D1 Time Travel restore is a last resort requiring coordination
because it would also rewind unrelated writes. Never do it blindly.

Private SQL exports/rollback files and access credentials must not enter Git.
No rollback is planned in the successful path. CI must not be monitored or rerun
for this task, per operator instruction.

References: [D1 foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/),
[D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/).
