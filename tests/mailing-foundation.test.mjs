import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import {
  loadMailingContacts,
  mailingEligibility,
  normalizeMailingEmail,
  planHistoricalContactImport,
} from '../worker/domains/mailing/contacts.js';
import { routeAdminMailing } from '../worker/domains/mailing/index.js';
import { filterMailingSegment } from '../worker/domains/mailing/segments.js';
import { createMailingStarterDraft } from '../worker/domains/mailing/template.js';

const origin='https://e36united.cz';
const migration=readFileSync(new URL('../db/migrations/2026-09-03-mailing-foundation.sql',import.meta.url),'utf8');
const editorMigration=readFileSync(new URL('../db/migrations/2026-09-03-mailing-editor.sql',import.meta.url),'utf8');

function createRuntime(){
  const database=new DatabaseSync(':memory:');
  database.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE members (
      id TEXT PRIMARY KEY, member_code TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL, nickname TEXT, phone TEXT, role TEXT NOT NULL DEFAULT 'member',
      status TEXT NOT NULL DEFAULT 'active', email_verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_login_at TEXT, history_completed_at TEXT
    );
    CREATE TABLE events (id TEXT PRIMARY KEY, year INTEGER NOT NULL UNIQUE, is_current INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE reservations (id TEXT PRIMARY KEY, member_id TEXT NOT NULL, event_id TEXT NOT NULL, status TEXT NOT NULL, show_shine TEXT);
    CREATE TABLE attendance (id TEXT PRIMARY KEY, member_id TEXT NOT NULL, event_id TEXT NOT NULL, status TEXT NOT NULL, winner INTEGER NOT NULL DEFAULT 0, category TEXT);
    CREATE TABLE united_history_claims (id TEXT PRIMARY KEY, member_id TEXT NOT NULL, event_id TEXT NOT NULL, attendance_status TEXT NOT NULL, sns_competed INTEGER NOT NULL DEFAULT 0, sns_status TEXT NOT NULL);
    CREATE TABLE cars (id TEXT PRIMARY KEY, member_id TEXT NOT NULL);
    CREATE TABLE gallery_submissions (id TEXT PRIMARY KEY, member_id TEXT NOT NULL, status TEXT NOT NULL);
  `);
  database.exec(migration);
  database.exec(editorMigration);

  const prepare=sql=>{
    const statement=database.prepare(sql);let values=[];
    const prepared={
      bind(...next){values=next;return prepared},
      async first(){return statement.get(...values)||null},
      async all(){return{results:statement.all(...values)}},
      async run(){const result=statement.run(...values);return{meta:{changes:Number(result.changes||0)}}},
    };
    return prepared;
  };
  return {database,env:{DB:{prepare,async batch(statements){return Promise.all(statements.map(statement=>statement.run()))}}}};
}

function seed(runtime){
  const {database}=runtime;
  const member=database.prepare('INSERT INTO members (id,member_code,email,name,nickname,role,status,history_completed_at) VALUES (?,?,?,?,?,?,?,?)');
  member.run('admin','EU-ADMIN','admin@example.test','United Admin','Admin','admin','active','2026-01-01');
  member.run('member-1','EU-001','member.new@example.test','Eva Nováková','Eva','member','active','2026-01-01');
  member.run('member-2','EU-002','second@example.test','Petr Dvořák','Petr','member','active',null);
  member.run('member-3','EU-003','inactive@example.test','Inactive Member',null,'member','inactive','2026-01-01');
  database.exec(`
    INSERT INTO events VALUES ('event-2024',2024,0),('event-2025',2025,0),('event-2026',2026,1);
    INSERT INTO reservations VALUES ('reservation-1','member-1','event-2026','approved','Ano');
    INSERT INTO attendance VALUES ('attendance-1','member-1','event-2024','verified',0,NULL);
    INSERT INTO united_history_claims VALUES ('history-1','member-1','event-2025','approved',1,'approved');
    INSERT INTO cars VALUES ('car-admin','admin'),('car-1','member-1'),('car-3','member-3');
  `);
  const photo=database.prepare('INSERT INTO gallery_submissions VALUES (?,?,?)');
  for(const memberId of ['admin','member-1','member-3'])for(let index=0;index<5;index++)photo.run(`${memberId}-photo-${index}`,memberId,'approved');

  database.prepare(`INSERT INTO mailing_contacts (
    id,email,normalized_email,name,current_member_id,privacy_consent_status,mailing_consent_status,deliverability_status,suppression_status
  ) VALUES (?,?,?,?,?,?,?,?,?)`).run('contact-member','old@example.test','member.new@example.test','Stale Member Name','member-1','yes','yes','deliverable','eligible');
  database.prepare(`INSERT INTO mailing_contacts (
    id,email,normalized_email,name,current_member_id,privacy_consent_status,mailing_consent_status,deliverability_status,suppression_status
  ) VALUES (?,?,?,?,?,?,?,?,?)`).run('contact-inactive','inactive@example.test','inactive@example.test','Inactive Member','member-3','unknown','yes','deliverable','eligible');
  database.prepare(`INSERT INTO mailing_contacts (
    id,email,normalized_email,name,privacy_consent_status,mailing_consent_status,deliverability_status,suppression_status
  ) VALUES (?,?,?,?,?,?,?,?)`).run('contact-history','legacy@example.test','legacy@example.test','Legacy Driver','yes','unknown','unknown','eligible');
  database.prepare(`INSERT INTO mailing_contacts (
    id,email,normalized_email,name,privacy_consent_status,mailing_consent_status,deliverability_status,suppression_status
  ) VALUES (?,?,?,?,?,?,?,?)`).run('contact-suppressed','stop@example.test','stop@example.test','Stopped Contact','yes','yes','deliverable','unsubscribed');
  const source=database.prepare(`INSERT INTO mailing_contact_sources (
    id,contact_id,source_type,source_reference,event_year,privacy_consent_status,mailing_consent_status,original_record_json
  ) VALUES (?,?,?,?,?,?,?,?)`);
  source.run('source-member','contact-member','current_member','member-1',null,'yes','yes','{}');
  source.run('source-history-2024','contact-history','event_registration','legacy-2024',2024,'yes','unknown','{"row":1}');
  source.run('source-history-2025','contact-history','historical_import','legacy-2025',2025,'yes','unknown','{"row":2}');
  source.run('source-stop','contact-suppressed','manual_admin','manual-stop',null,'yes','yes','{}');
  database.prepare('INSERT INTO mailing_contact_tags (contact_id,tag,created_by) VALUES (?,?,?)').run('contact-history','VIP','admin');
}

function mailingRequest(path,{method='GET',body}={}){
  return new Request(`https://api.e36united.cz${path}`,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
}

test('email normalization is trim/lowercase only and keeps provider aliases intact',()=>{
  assert.equal(normalizeMailingEmail(' User.Name+United@GMAIL.com '),'user.name+united@gmail.com');
  assert.notEqual(normalizeMailingEmail('user.name@gmail.com'),normalizeMailingEmail('username@gmail.com'));
});

test('historical import dry run deduplicates only by email and retains every source',()=>{
  const plan=planHistoricalContactImport([
    {email:' Eva@Example.cz ',name:'Eva Nováková',eventYear:2024,sourceReference:'row-1',privacyConsentStatus:'yes',mailingConsentStatus:'unknown'},
    {email:'eva@example.cz',name:'Eva Nováková',eventYear:2025,sourceReference:'row-2',privacyConsentStatus:'yes',mailingConsentStatus:'yes'},
    {email:'other@example.cz',name:'Eva Novakova',eventYear:2026,sourceReference:'row-3'},
  ]);
  assert.equal(plan.dryRun,true);
  assert.equal(plan.canonicalContactCount,2);
  assert.equal(plan.sourceCount,3);
  assert.deepEqual(plan.contacts.find(contact=>contact.normalizedEmail==='eva@example.cz').sources.map(source=>source.eventYear),[2024,2025]);
  assert.equal(plan.contacts.find(contact=>contact.normalizedEmail==='eva@example.cz').sources[0].privacyConsentStatus,'yes');
  assert.equal(plan.contacts.find(contact=>contact.normalizedEmail==='eva@example.cz').sources[0].mailingConsentStatus,'unknown');
  assert.equal(plan.possibleDuplicates.length,1);
  assert.equal(plan.contacts.every(contact=>contact.possibleDuplicate),true,'matching names with different emails are flagged, never merged');
});

test('privacy consent, mailing consent and suppression remain independent',()=>{
  assert.deepEqual(mailingEligibility({privacyConsent:{status:'yes'},mailingConsent:{status:'unknown'},suppressionStatus:'eligible'}),{status:'review_required',reason:'mailing_consent_unknown'});
  assert.deepEqual(mailingEligibility({privacyConsent:{status:'unknown'},mailingConsent:{status:'yes'},suppressionStatus:'eligible'}),{status:'eligible',reason:'explicit_mailing_consent'});
  assert.deepEqual(mailingEligibility({mailingConsent:{status:'yes'},suppressionStatus:'unsubscribed'}),{status:'suppressed',reason:'unsubscribed'});
  assert.deepEqual(mailingEligibility({mailingConsent:{status:'yes'},suppressionStatus:'eligible',deliverabilityStatus:'hard_bounce'}),{status:'suppressed',reason:'hard_bounce'});
});

test('contact universe dynamically links Members and preserves historical-only sources',async()=>{
  const runtime=createRuntime();seed(runtime);
  const contacts=await loadMailingContacts(runtime.env);
  const linked=contacts.find(contact=>contact.id==='contact-member');
  const projected=contacts.find(contact=>contact.memberId==='member-2');
  const historical=contacts.find(contact=>contact.id==='contact-history');
  assert.equal(linked.name,'Eva Nováková','authoritative current Member name wins over stale contact copy');
  assert.equal(linked.email,'member.new@example.test');
  assert.equal(linked.participationCount,2);
  assert.equal(linked.registeredCurrentEvent,true);
  assert.equal(linked.showShineParticipant,true);
  assert.equal(projected.persisted,false);
  assert.equal(projected.incompleteProfile,true);
  assert.equal(projected.mailingConsent.status,'unknown');
  assert.equal(historical.memberId,null);
  assert.equal(historical.legacyOnly,true);
  assert.deepEqual(historical.eventYears,[2025,2024]);
  assert.equal(historical.sources.length,2);
  runtime.database.close();
});

test('server segment rules support current, historical, participation, tag, AND/OR and exclusions',async()=>{
  const runtime=createRuntime();seed(runtime);const contacts=await loadMailingContacts(runtime.env);
  const emails=result=>result.recipients.map(contact=>contact.email).sort();
  assert.deepEqual(emails(filterMailingSegment(contacts,{rules:[{type:'registered_current_event'}]})),['member.new@example.test']);
  assert.deepEqual(emails(filterMailingSegment(contacts,{rules:[{type:'regular_participant',value:2}]})),['member.new@example.test']);
  assert.deepEqual(emails(filterMailingSegment(contacts,{rules:[{type:'historical_event_year',value:2025}]})),['legacy@example.test','member.new@example.test']);
  assert.deepEqual(emails(filterMailingSegment(contacts,{rules:[{type:'tag',value:'vip'}]})),['legacy@example.test']);
  assert.deepEqual(emails(filterMailingSegment(contacts,{match:'all',rules:[{type:'mailing_eligible'},{type:'active_member'}],exclusions:[{type:'registered_current_event'}]})),[]);
  assert.deepEqual(emails(filterMailingSegment(contacts,{match:'any',rules:[{type:'legacy_only'},{type:'show_shine_participant'}]})),['legacy@example.test','member.new@example.test']);
  runtime.database.close();
});

test('eligible recipient preview excludes unsubscribed and unknown-consent contacts',async()=>{
  const runtime=createRuntime();seed(runtime);
  const request=mailingRequest('/api/admin/mailing/segments/preview',{method:'POST',body:{segment:{rules:[{type:'mailing_eligible'}]}}});
  const response=await routeAdminMailing({request,env:runtime.env,url:new URL(request.url),auth:{uid:'admin'},origin});
  const payload=await response.json();
  assert.equal(response.status,200);
  assert.deepEqual(payload.recipients.map(contact=>contact.email).sort(),['inactive@example.test','member.new@example.test']);
  assert.equal(payload.recipients.some(contact=>contact.email==='stop@example.test'),false);
  assert.equal(payload.recipients.some(contact=>contact.email==='legacy@example.test'),false);
  runtime.database.close();
});

test('campaign foundation creates a draft and cannot mark it sent',async()=>{
  const runtime=createRuntime();seed(runtime);
  const create=mailingRequest('/api/admin/mailing/campaigns',{method:'POST',body:{internalName:'United 2027 interest',subject:'',preheader:'',segment:{rules:[{type:'mailing_eligible'}]}}});
  const createdResponse=await routeAdminMailing({request:create,env:runtime.env,url:new URL(create.url),auth:{uid:'admin'},origin});
  const created=await createdResponse.json();
  assert.equal(createdResponse.status,201);
  assert.equal(created.campaign.status,'draft');
  assert.equal(created.campaign.recipientCount,2);
  assert.equal(created.campaign.templateVersion,'e36-default-v1');
  assert.equal(created.campaign.content.blocks.length,5);
  assert.equal(runtime.database.prepare('SELECT COUNT(*) AS count FROM mailing_campaign_recipients').get().count,0,'recipient snapshot stays unused before delivery preparation');

  const send=mailingRequest(`/api/admin/mailing/campaigns/${created.campaign.id}`,{method:'PATCH',body:{status:'sent'}});
  const sendResponse=await routeAdminMailing({request:send,env:runtime.env,url:new URL(send.url),auth:{uid:'admin'},origin});
  assert.equal(sendResponse.status,400);
  assert.equal((await sendResponse.json()).error,'mailing_delivery_not_available');
  assert.equal(runtime.database.prepare('SELECT status FROM mailing_campaigns WHERE id=?').get(created.campaign.id).status,'draft');

  const delivery=mailingRequest(`/api/admin/mailing/campaigns/${created.campaign.id}/send`,{method:'POST',body:{}});
  const deliveryResponse=await routeAdminMailing({request:delivery,env:runtime.env,url:new URL(delivery.url),auth:{uid:'admin'},origin});
  assert.equal(deliveryResponse.status,404);
  assert.equal((await deliveryResponse.json()).error,'mailing_not_found');
  runtime.database.close();
});

test('campaign draft save/load keeps structured content, template version and segment',async()=>{
  const runtime=createRuntime();seed(runtime);const starter=createMailingStarterDraft();
  const segment={match:'all',rules:[{type:'active_member'}],exclusions:[{type:'registered_current_event'}]};
  const create=mailingRequest('/api/admin/mailing/campaigns',{method:'POST',body:{...starter,segment,status:'draft'}});
  const createdResponse=await routeAdminMailing({request:create,env:runtime.env,url:new URL(create.url),auth:{uid:'admin'},origin});
  const created=(await createdResponse.json()).campaign;
  const changed={...created.content,blocks:created.content.blocks.map(block=>block.id==='copy-zbraslavice'?{...block,text:'Upravený **bezpečný** text.'}:block)};
  const update=mailingRequest(`/api/admin/mailing/campaigns/${created.id}`,{method:'PATCH',body:{internalName:created.internalName,subject:'Upravený předmět',content:changed,templateVersion:'e36-default-v1'}});
  const updatedResponse=await routeAdminMailing({request:update,env:runtime.env,url:new URL(update.url),auth:{uid:'admin'},origin});
  const updated=(await updatedResponse.json()).campaign;
  assert.equal(updatedResponse.status,200);
  assert.equal(updated.subject,'Upravený předmět');
  assert.equal(updated.content.blocks.find(block=>block.id==='copy-zbraslavice').text,'Upravený **bezpečný** text.');
  assert.deepEqual(updated.segment,segment,'omitting segment on edit preserves the saved server definition');
  const stored=runtime.database.prepare('SELECT template_version,content_json FROM mailing_campaigns WHERE id=?').get(created.id);
  assert.equal(stored.template_version,'e36-default-v1');
  assert.deepEqual(JSON.parse(stored.content_json),updated.content);
  assert.equal(runtime.database.prepare('SELECT COUNT(*) AS count FROM mailing_campaign_recipients').get().count,0);
  runtime.database.close();
});

test('migration creates the five isolated Mailing tables without repurposing legacy names',()=>{
  const runtime=createRuntime();
  const tables=runtime.database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'mailing_%' ORDER BY name").all().map(row=>row.name);
  assert.deepEqual(tables,['mailing_campaign_recipients','mailing_campaigns','mailing_contact_sources','mailing_contact_tags','mailing_contacts']);
  assert.equal(runtime.database.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE id='2026-09-03-mailing-foundation'").get().count,1);
  assert.equal(runtime.database.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE id='2026-09-03-mailing-editor'").get().count,1);
  const campaignColumns=runtime.database.prepare('PRAGMA table_info(mailing_campaigns)').all().map(row=>row.name);
  assert.equal(campaignColumns.includes('template_version'),true);
  assert.equal(campaignColumns.includes('content_json'),true);
  assert.equal(/\b(?:send|deliver|webhook)\b/i.test(readFileSync(new URL('../worker/domains/mailing/campaigns.js',import.meta.url),'utf8')),false);
  runtime.database.close();
});

test('canonical schema snapshot remains executable with the pending Mailing foundation',()=>{
  const database=new DatabaseSync(':memory:');
  database.exec(readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'));
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name LIKE 'mailing_%'").get().count,5);
  assert.equal(database.prepare("SELECT description FROM schema_migrations WHERE id='2026-09-03-mailing-foundation'").get().description,'Mailing contact, segmentation and campaign foundation');
  database.close();
});
