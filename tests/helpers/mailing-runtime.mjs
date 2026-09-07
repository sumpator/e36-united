import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createMailingCampaign } from '../../worker/domains/mailing/campaigns.js';

export function mailingRuntime() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../../db/schema.sql', import.meta.url), 'utf8'));
  db.exec("INSERT INTO members(id,member_code,email,name,role) VALUES('admin','ADMIN','admin@example.invalid','Admin','admin');");
  const prepare = (sql, values = []) => ({
    bind: (...bindings) => prepare(sql, bindings),
    async first() { return db.prepare(sql).get(...values) || null; },
    async all() { return { results: db.prepare(sql).all(...values) }; },
    async run() { return { meta: { changes: Number(db.prepare(sql).run(...values).changes) } }; },
  });
  // Serialize batches like D1, preserving atomic rollback for concurrent request tests.
  let tail = Promise.resolve();
  const env = { DB: { prepare, batch(statements) {
    const run = tail.then(async () => { db.exec('BEGIN'); try { const result=[]; for (const s of statements) result.push(await s.run()); db.exec('COMMIT'); return result; } catch(e) { db.exec('ROLLBACK'); throw e; } });
    tail = run.catch(() => {}); return run;
  } } };
  return { db, env, close: () => db.close() };
}
export function contact(db, id = 'one', suppression = 'eligible', consent = 'yes', deliverability = 'deliverable') {
  db.prepare(`INSERT INTO mailing_contacts(id,email,normalized_email,name,mailing_consent_status,suppression_status,deliverability_status)
    VALUES(?,?,?,?,?,?,?)`).run(id, `${id}@example.invalid`, `${id}@example.invalid`, id, consent, suppression, deliverability);
}
export async function draft(env, { survey = false } = {}) {
  return createMailingCampaign(env, 'admin', { internalName:'Fixture', subject:'Frozen subject', preheader:'Preheader',
    ...(survey ? {} : { content:{template:'e36-default-v1',blocks:[{id:'copy',type:'rich_text',text:'Fixture message.'}]} }),
    segment:{rules:[{type:'all_contacts'}]},
  });
}
export const confirmation = (row, count = 1) => ({ subject: row.subject, updatedAt: row.updatedAt ?? row.updated_at, recipientCount: count });
export function providerMock() {
  const calls=[];
  return { calls,checkReadiness:async()=>({state:'ready',ready:true,monthlyRemaining:10000}),
    sendBatch:async emails=>{calls.push(['batch',emails]);return {requestId:'request-fixture',emailIds:emails.map((_,i)=>`email-${i+1}`)}},
    sendTest:async emails=>{calls.push(['test',emails]);return {requestId:'test-fixture',emailIds:emails.map((_,i)=>`test-${i+1}`)}},
  };
}
