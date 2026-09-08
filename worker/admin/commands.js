import { json } from '../http/responses.js';

// Only the existing local JSON/D1 editors participate. Provider sends and R2 do not.
export const COMMAND_RESOURCES = Object.freeze({
  reservation: { table: 'reservations', event: 'event_id', version: 'reservation' },
  payment: { table: 'reservations', event: 'event_id', version: 'reservation' },
  event: { table: 'events', event: 'id', version: 'event-settings', global: true },
  accommodation: { table: 'event_accommodation_options', event: 'event_id', version: 'accommodation' },
  'accommodation-create': { table: 'events', event: 'id', version: 'accommodation-catalog' },
  gallery: { table: 'gallery_submissions', event: null, version: 'gallery' },
  'history-attendance': { table: 'united_history_claims', event: 'event_id', version: 'history' },
  'history-sns': { table: 'united_history_claims', event: 'event_id', version: 'history' },
});

const fail = (code, message, status, origin, extra = {}) => json({ ok: false, error: code, message, ...extra }, status, origin);
const validId = value => typeof value === 'string' && /^[a-z0-9_-]{1,128}$/i.test(value);

export async function resourceRevision(env, type, id) {
  const row = await env.DB.prepare('SELECT revision FROM admin_resource_versions WHERE resource_type = ? AND resource_id = ?').bind(type, id).first();
  return Number(row?.revision || 0);
}

async function fingerprint(value) {
  const bytes = new TextEncoder().encode(value);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function receiptOutcome(row) {
  return { id: row.operation_id, state: 'confirmed', actorId: row.actor_id, operation: row.operation,
    entityId: row.entity_id, eventId: row.event_id, baseRevision: row.base_revision,
    revision: row.result_revision, committedAt: row.committed_at };
}

export async function getAdminOperation(env, auth, id, origin) {
  if (!validId(id)) return fail('invalid_operation_id', 'Neplatné ID operace.', 400, origin);
  const receipt = await env.DB.prepare('SELECT * FROM admin_operation_receipts WHERE operation_id = ? AND actor_id = ?').bind(id, auth.uid).first();
  // Absence is deliberately not a negative acknowledgement: an old request may still arrive.
  return json({ ok: true, operation: receipt ? receiptOutcome(receipt) : { id, state: 'outcome_unknown' } }, 200, origin);
}

/** Atomically bracket exactly one existing domain batch, preserving statement order.
 * CAS and both assertions are inside that same D1 transaction. A zero-row domain
 * UPDATE aborts before any audit/Points statement; a receipt is never committed alone.
 */
export async function runAdminCommand(request, env, auth, operation, entityId, origin, execute) {
  const resource = COMMAND_RESOURCES[operation];
  if (!resource || !validId(entityId)) return fail('invalid_command', 'Neplatný cíl operace.', 400, origin);
  const operationId = request.headers.get('Idempotency-Key');
  const base = request.headers.get('If-Match');
  if (!validId(operationId) || !/^"?\d+"?$/.test(base || '')) {
    return fail('admin_refresh_required', 'Obnov Admin. Uložení vyžaduje aktuální revizi a ID operace.', 428, origin);
  }
  const baseRevision = Number(base.replaceAll('"', ''));
  if (!Number.isSafeInteger(baseRevision)) return fail('invalid_revision', 'Neplatná revize.', 400, origin);
  const reader=request.clone().body?.getReader(),decoder=new TextDecoder();
  let body='',bytes=0;
  if(reader)for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;
    if(bytes>32_768){void reader.cancel().catch(()=>{});return fail('command_too_large','Požadavek je příliš velký.',413,origin)}
    body+=decoder.decode(value,{stream:true});
  }
  body+=decoder.decode();
  const hash = await fingerprint(JSON.stringify([auth.uid, operation, entityId, baseRevision, request.method, body]));
  const lookup = () => env.DB.prepare('SELECT * FROM admin_operation_receipts WHERE operation_id = ?').bind(operationId).first();
  const replay = row => row.actor_id === auth.uid && row.payload_hash === hash
    ? json({ ok: true, replayed: true, operation: receiptOutcome(row) }, row.http_status, origin)
    : fail('operation_key_reused', 'ID operace už patří jinému požadavku. Původní operace nebyla opakována.', 409, origin);
  const prior = await lookup();
  if (prior) return replay(prior);
  const target = await env.DB.prepare(`SELECT id${resource.event ? `, ${resource.event} AS event_id` : ''} FROM ${resource.table} WHERE id = ?`).bind(entityId).first();
  if (!target) return fail('resource_not_found', 'Záznam nebyl nalezen.', 404, origin);
  const versionId = resource.global ? '*' : entityId;
  const conflict = async () => fail('revision_conflict', 'Data se mezitím změnila. Obnov záznam a porovnej změny.', 409, origin,
    { current: { entityId, eventId: target.event_id || null, revision: await resourceRevision(env, resource.version, versionId) } });
  if (await resourceRevision(env, resource.version, versionId) !== baseRevision) return conflict();
  let committed = false;
  let batchCalled = false;
  const status = operation === 'accommodation-create' ? 201 : 200;
  const commit = async (statements, primaryIndex = 0, createdId = null) => {
    if (batchCalled) throw new Error('Admin command attempted more than one batch');
    batchCalled = true;
    const prefix = [
      env.DB.prepare('UPDATE admin_resource_versions SET revision = revision + 1 WHERE resource_type = ? AND resource_id = ? AND revision = ?').bind(resource.version, versionId, baseRevision),
      env.DB.prepare(`INSERT INTO admin_operation_receipts
        (operation_id, actor_id, operation, entity_id, event_id, base_revision, payload_hash, http_status, cas_applied, primary_applied)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, changes(), 1)`)
        .bind(operationId, auth.uid, operation, entityId, target.event_id || null, baseRevision, hash, status),
    ];
    const bodyStatements = [...statements];
    if (statements.length) bodyStatements.splice(primaryIndex + 1, 0,
      env.DB.prepare('UPDATE admin_operation_receipts SET primary_applied = changes() WHERE operation_id = ?').bind(operationId));
    const results = await env.DB.batch([...prefix, ...bodyStatements,
      env.DB.prepare(`UPDATE admin_operation_receipts SET entity_id = COALESCE(?,entity_id), result_revision =
        (SELECT revision FROM admin_resource_versions WHERE resource_type = ? AND resource_id = ?)
        WHERE operation_id = ?`).bind(createdId, resource.version, versionId, operationId),
    ]);
    committed = true;
    return statements.map((_, index) => results[2 + index + (index > primaryIndex ? 1 : 0)]);
  };
  // Read methods are unchanged; writes outside the single guarded batch fail closed.
  const guardedPrepare = (sql, bindings = []) => {
    const statement = bindings.length ? env.DB.prepare(sql).bind(...bindings) : env.DB.prepare(sql);
    return { bind: (...values) => guardedPrepare(sql, values), first: (...args) => statement.first(...args),
      all: (...args) => statement.all(...args), raw: (...args) => statement.raw(...args),
      run: () => { throw new Error('Admin command attempted a write outside its atomic batch'); },
      commandStatement: statement, commandSql: sql, commandBindings: bindings };
  };
  const commandEnv = { ...env, ADMIN_COMMAND: true, DB: {
    prepare: guardedPrepare,
    batch: statements => {
      // Event switching first clears the old current marker. Both updates remain atomic.
      const primaryIndex = operation === 'event' && /SET is_current = 0/.test(statements[0]?.commandSql || '') ? 1 : 0;
      return commit(statements.map(statement => statement.commandStatement), primaryIndex, operation === 'accommodation-create' ? statements[0]?.commandBindings[0] : null);
    },
  } };
  try {
    const response = await execute(commandEnv);
    if (!response.ok) return response;
    if (!batchCalled) await commit([]); // A confirmed no-op also has a durable, revision-bound outcome.
    const receipt = await lookup();
    return json({ ...await response.json(), operation: receiptOutcome(receipt) }, response.status, origin);
  } catch (error) {
    const receipt = await lookup();
    if (receipt) return replay(receipt);
    if (/CHECK constraint failed|UNIQUE constraint failed/.test(String(error?.message))) return conflict();
    // A post-commit projection can fail; clients reconcile rather than asserting "not saved".
    return fail(committed ? 'outcome_unknown' : 'command_unavailable',
      'Výsledek uložení zatím nelze ověřit.', 503, origin, { operationId });
  }
}
