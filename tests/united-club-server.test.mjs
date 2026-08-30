import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const migration=readFileSync(new URL('../D1-united-club-v1.sql',import.meta.url),'utf8');
const source=readFileSync(new URL('../cloudflare-worker-media.js',import.meta.url),'utf8');
const worker=await import(`data:text/javascript;base64,${Buffer.from(`${source}\nexport { requireAdmin, submitHistoryClaim, patchAdminHistoryClaim, historyEvidenceMedia, completeMemberHistory, getUnitedClub, patchAdminGallery, deriveMemberRating, deriveUnitedAchievements, getAdminHistoryCounts };`).toString('base64')}`);

function database(){
  const db=new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE events (
      id TEXT PRIMARY KEY, year INTEGER NOT NULL, registration_status TEXT NOT NULL DEFAULT 'closed', is_current INTEGER NOT NULL DEFAULT 0,
      accommodation_capacity INTEGER NOT NULL DEFAULT 0, reservation_capacity INTEGER NOT NULL DEFAULT 0,
      full_weekend_nights INTEGER NOT NULL DEFAULT 2, saturday_only_nights INTEGER NOT NULL DEFAULT 1,
      booking_commitment_czk INTEGER NOT NULL DEFAULT 0, booking_due_at TEXT, booking_paid_czk INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'CZK', payment_deadline TEXT, payment_recipient_name TEXT, payment_account_display TEXT,
      payment_iban TEXT, payment_message_prefix TEXT, payment_test_mode INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE members (
      id TEXT PRIMARY KEY, member_code TEXT NOT NULL UNIQUE, email TEXT NOT NULL, name TEXT NOT NULL, nickname TEXT, phone TEXT,
      role TEXT NOT NULL DEFAULT 'member', status TEXT NOT NULL DEFAULT 'active', email_verified INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE cars (id TEXT PRIMARY KEY, member_id TEXT NOT NULL, nickname TEXT, model TEXT, body TEXT, year INTEGER, color TEXT, is_primary INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE car_photos (id TEXT PRIMARY KEY, car_id TEXT NOT NULL, member_id TEXT NOT NULL, r2_key TEXT NOT NULL);
    CREATE TABLE gallery_submissions (
      id TEXT PRIMARY KEY, member_id TEXT NOT NULL, r2_key TEXT NOT NULL UNIQUE, caption TEXT, status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_at TEXT, review_note TEXT
    );
    CREATE TABLE admin_actions (
      id TEXT PRIMARY KEY, admin_member_id TEXT NOT NULL, action_type TEXT NOT NULL, entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL, old_state_json TEXT, new_state_json TEXT, note TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO members (id,member_code,email,name,role) VALUES
      ('admin','EU-ADMIN','admin@example.test','Admin','admin'),
      ('member-a','EU-A','a@example.test','Member A','member'),
      ('member-b','EU-B','b@example.test','Member B','member');
  `);
  db.exec(migration);
  return db;
}

function d1(db){
  class Statement{
    constructor(sql,bindings=[]){this.sql=sql;this.bindings=bindings}
    bind(...bindings){return new Statement(this.sql,bindings)}
    first(){return db.prepare(this.sql).get(...this.bindings)||null}
    all(){return {results:db.prepare(this.sql).all(...this.bindings)}}
    run(){const result=db.prepare(this.sql).run(...this.bindings);return {meta:{changes:Number(result.changes||0)}}}
  }
  return {prepare(sql){return new Statement(sql)},batch(statements){db.exec('BEGIN IMMEDIATE');try{const results=statements.map(statement=>statement.run());db.exec('COMMIT');return results}catch(error){db.exec('ROLLBACK');throw error}}};
}

function media(){
  const objects=new Map();
  return {objects,async put(key,body,options={}){const bytes=new Uint8Array(await new Response(body).arrayBuffer());objects.set(key,{bytes,options})},async get(key){const found=objects.get(key);if(!found)return null;return {body:found.bytes,httpEtag:'test',writeHttpMetadata(headers){headers.set('Content-Type',found.options?.httpMetadata?.contentType||'image/jpeg')}}},async delete(key){objects.delete(key)}};
}
function env(db){return {DB:d1(db),MEDIA:media()}}
function addEvent(db,id,year,{concluded=true}={}){db.prepare('INSERT INTO events (id,year,event_end_at) VALUES (?,?,?)').run(id,year,concluded?'2025-01-01':null)}
function addClaim(db,{id,member='member-a',event,attendance='pending',sns='not_claimed',category=null,placement=null,bob=0,exhaust=0}){db.prepare(`INSERT INTO united_history_claims (id,member_id,event_id,attendance_status,sns_competed,sns_status,sns_category,sns_placement,sns_best_of_best,sns_best_exhaust) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id,member,event,attendance,sns==='not_claimed'?0:1,sns,category,placement,bob,exhaust)}
function reviewRequest(status,reviewNote=''){return new Request('https://api.e36united.cz/review',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,reviewNote})})}
function claimRequest({eventId,sns=false,category='coupe',placement='',bob=false,exhaust=false,files=1}={}){const form=new FormData();form.set('eventId',eventId);if(sns){form.set('snsCompeted','on');form.set('snsCategory',category);if(placement)form.set('snsPlacement',String(placement));if(bob)form.set('snsBestOfBest','on');if(exhaust)form.set('snsBestExhaust','on')}for(let index=0;index<files;index+=1)form.append('files',new Blob([`evidence-${index}`],{type:'image/jpeg'}),`proof-${index}.jpg`);return new Request('https://api.e36united.cz/api/history/claims',{method:'POST',body:form})}
async function payload(response){return {status:response.status,body:await response.json()}}
function ledger(db,member='member-a'){return db.prepare('SELECT source_key,delta FROM united_points_ledger WHERE member_id=? ORDER BY source_key').all(member)}
function ledgerTotal(db,member='member-a'){return Number(db.prepare('SELECT COALESCE(SUM(delta),0) AS total FROM united_points_ledger WHERE member_id=?').get(member).total)}

test('attendance awards +1 per event and one-time +3 milestones at three and five',async()=>{
  const db=database(),runtime=env(db);
  for(let number=1;number<=5;number+=1){addEvent(db,`event-${number}`,2020+number);addClaim(db,{id:`claim-${number}`,event:`event-${number}`});const response=await worker.patchAdminHistoryClaim(reviewRequest('approved'),runtime,{uid:'admin'},`claim-${number}`,'attendance',null);assert.equal(response.status,200);assert.equal(ledgerTotal(db),[1,2,6,7,11][number-1])}
  const repeated=await worker.patchAdminHistoryClaim(reviewRequest('approved'),runtime,{uid:'admin'},'claim-5','attendance',null);assert.equal(repeated.status,200);assert.equal(ledgerTotal(db),11);assert.equal(ledger(db).length,7);
});

test('S&S awards exact placement and combinable accolade values only after approval',async()=>{
  const cases=[{placement:3,total:1},{placement:2,total:2},{placement:1,total:3},{placement:1,bob:1,exhaust:1,total:5},{placement:null,bob:1,total:1},{placement:null,exhaust:1,total:1}];
  for(const [index,item] of cases.entries()){const db=database(),runtime=env(db);addEvent(db,'event',2025);addClaim(db,{id:'claim',event:'event',attendance:'approved',sns:'pending',category:'coupe',placement:item.placement,bob:item.bob||0,exhaust:item.exhaust||0});assert.equal(ledgerTotal(db),0);const response=await worker.patchAdminHistoryClaim(reviewRequest('approved'),runtime,{uid:'admin'},'claim','sns',null);assert.equal(response.status,200,`case ${index}`);assert.equal(ledgerTotal(db),item.total,`case ${index}`);await worker.patchAdminHistoryClaim(reviewRequest('approved'),runtime,{uid:'admin'},'claim','sns',null);assert.equal(ledgerTotal(db),item.total)}
});

test('community photo milestones are +1/+1/+3 once and exclude private evidence',async()=>{
  const db=database(),runtime=env(db);addEvent(db,'event',2025);addClaim(db,{id:'proof-claim',event:'event'});
  for(let index=0;index<60;index+=1)db.prepare(`INSERT INTO united_history_evidence (id,claim_id,member_id,r2_key,mime_type,size_bytes) VALUES (?,?,?,?,?,?)`).run(`evidence-${index}`,'proof-claim','member-a',`history-proof/${index}`,'image/jpeg',10);
  db.prepare("INSERT INTO cars (id,member_id,model,body) VALUES ('garage-car','member-a','328i','coupe')").run();db.prepare("INSERT INTO car_photos (id,car_id,member_id,r2_key) VALUES ('garage-photo','garage-car','member-a','cars/private')").run();db.prepare("INSERT INTO gallery_submissions (id,member_id,r2_key,status) VALUES ('rejected-photo','member-a','gallery/rejected','pending')").run();await worker.patchAdminGallery(reviewRequest('rejected','Mimo United.'),runtime,{uid:'admin'},'rejected-photo',null);assert.equal(ledgerTotal(db),0);
  let photoId=0;async function reach(target){const current=Number(db.prepare("SELECT COUNT(*) AS count FROM gallery_submissions WHERE member_id='member-a' AND status='approved'").get().count);let pendingId='';for(let count=current+1;count<=target;count+=1){photoId+=1;pendingId=`photo-${photoId}`;db.prepare(`INSERT INTO gallery_submissions (id,member_id,r2_key,status) VALUES (?,?,?,?)`).run(pendingId,'member-a',`gallery/${photoId}`,count===target?'pending':'approved')}const response=await worker.patchAdminGallery(reviewRequest('approved'),runtime,{uid:'admin'},pendingId,null);assert.equal(response.status,200)}
  await reach(5);assert.equal(ledgerTotal(db),1);await reach(25);assert.equal(ledgerTotal(db),2);await reach(50);assert.equal(ledgerTotal(db),5);await worker.patchAdminGallery(reviewRequest('approved'),runtime,{uid:'admin'},'photo-50',null);assert.equal(ledgerTotal(db),5);assert.equal(ledger(db).filter(row=>row.source_key.startsWith('community-photos:')).length,3);
});

test('profile completion awards +1 once only when all four server criteria are true',async()=>{
  const db=database(),runtime=env(db);assert.equal((await worker.completeMemberHistory(runtime,{uid:'member-a'},null)).status,200);assert.equal(ledgerTotal(db),0,'history alone is incomplete');db.prepare("INSERT INTO cars (id,member_id,model,body) VALUES ('car','member-a','328i','coupe')").run();for(let index=1;index<=4;index+=1)db.prepare("INSERT INTO gallery_submissions (id,member_id,r2_key,status) VALUES (?,?,?,'approved')").run(`p-${index}`,'member-a',`gallery/p-${index}`);await worker.completeMemberHistory(runtime,{uid:'member-a'},null);assert.equal(ledgerTotal(db),0,'four photos are incomplete');db.prepare("INSERT INTO gallery_submissions (id,member_id,r2_key,status) VALUES ('p-5','member-a','gallery/p-5','pending')").run();await worker.patchAdminGallery(reviewRequest('approved'),runtime,{uid:'admin'},'p-5',null);assert.equal(ledgerTotal(db),2,'photo milestone plus profile completion');await worker.patchAdminGallery(reviewRequest('approved'),runtime,{uid:'admin'},'p-5',null);assert.equal(ledgerTotal(db),2);assert.equal(ledger(db).filter(row=>row.source_key==='profile:complete').length,1);assert.doesNotMatch(source.slice(source.indexOf('function profilePointStatement'),source.indexOf('function showShinePointStatements')),/newsletter/i);
});

test('claim flow allows concluded evidence, independent S&S review and safe amendment',async()=>{
  const db=database(),runtime=env(db);addEvent(db,'past',2024);addEvent(db,'future',2026,{concluded:false});db.prepare('INSERT INTO events (id,year,event_end_at) VALUES (?,?,?)').run('today',2026,new Date().toISOString().slice(0,10));
  assert.equal((await worker.submitHistoryClaim(claimRequest({eventId:'future'}),runtime,{uid:'member-a'},null)).status,409);
  assert.equal((await worker.submitHistoryClaim(claimRequest({eventId:'today'}),runtime,{uid:'member-a'},null)).status,409);
  const submitted=await payload(await worker.submitHistoryClaim(claimRequest({eventId:'past',sns:true,placement:2,bob:true}),runtime,{uid:'member-a'},null));assert.equal(submitted.status,201);assert.equal(db.prepare("SELECT attendance_status,sns_status FROM united_history_claims WHERE id=?").get(submitted.body.claimId).attendance_status,'pending');assert.equal(ledgerTotal(db),0);assert.match([...runtime.MEDIA.objects.keys()][0],/^history-proof\/member-a\//);
  assert.equal((await worker.submitHistoryClaim(claimRequest({eventId:'past'}),runtime,{uid:'member-a'},null)).status,409);
  await worker.patchAdminHistoryClaim(reviewRequest('approved'),runtime,{uid:'admin'},submitted.body.claimId,'attendance',null);assert.equal(ledgerTotal(db),1);
  assert.equal((await worker.patchAdminHistoryClaim(reviewRequest('rejected','Pozdní oprava.'),runtime,{uid:'admin'},submitted.body.claimId,'attendance',null)).status,409);assert.equal(ledgerTotal(db),1);
  assert.equal((await worker.patchAdminHistoryClaim(reviewRequest('rejected'),runtime,{uid:'admin'},submitted.body.claimId,'sns',null)).status,400);
  assert.equal((await worker.patchAdminHistoryClaim(reviewRequest('rejected','Výsledek není doložen.'),runtime,{uid:'admin'},submitted.body.claimId,'sns',null)).status,200);assert.equal(ledgerTotal(db),1);
  const amendment=await worker.submitHistoryClaim(claimRequest({eventId:'past',sns:true,placement:2,bob:true,files:0}),runtime,{uid:'member-a'},null);assert.equal(amendment.status,200);assert.equal(db.prepare('SELECT attendance_status,sns_status FROM united_history_claims').get().attendance_status,'approved');
  await worker.patchAdminHistoryClaim(reviewRequest('approved'),runtime,{uid:'admin'},submitted.body.claimId,'sns',null);assert.equal(ledgerTotal(db),4);
  assert.equal((await worker.patchAdminHistoryClaim(reviewRequest('rejected','Pozdní oprava.'),runtime,{uid:'admin'},submitted.body.claimId,'sns',null)).status,409);assert.equal(ledgerTotal(db),4);
  assert.equal((await worker.submitHistoryClaim(claimRequest({eventId:'past',files:0}),runtime,{uid:'member-a'},null)).status,409);
  assert.equal(Number(db.prepare("SELECT COUNT(*) AS count FROM admin_actions WHERE entity_type='united_history_claim'").get().count),3);
});

test('rejected attendance can be resubmitted with replacement private evidence',async()=>{
  const db=database(),runtime=env(db);addEvent(db,'past',2023);addClaim(db,{id:'claim',event:'past',attendance:'rejected'});db.prepare(`INSERT INTO united_history_evidence (id,claim_id,member_id,r2_key,mime_type,size_bytes) VALUES ('old','claim','member-a','history-proof/old','image/jpeg',4)`).run();runtime.MEDIA.objects.set('history-proof/old',{bytes:new Uint8Array([1]),options:{}});
  const response=await worker.submitHistoryClaim(claimRequest({eventId:'past',files:2}),runtime,{uid:'member-a'},null);assert.equal(response.status,200);assert.equal(db.prepare("SELECT attendance_status FROM united_history_claims WHERE id='claim'").get().attendance_status,'pending');assert.equal(Number(db.prepare("SELECT COUNT(*) AS count FROM united_history_evidence WHERE claim_id='claim'").get().count),2);assert.equal(runtime.MEDIA.objects.has('history-proof/old'),false);
});

test('evidence is owner-private and Admin routes remain behind role authorization',async()=>{
  const db=database(),runtime=env(db);addEvent(db,'past',2024);addClaim(db,{id:'claim',event:'past'});db.prepare(`INSERT INTO united_history_evidence (id,claim_id,member_id,r2_key,mime_type,size_bytes) VALUES ('e','claim','member-a','history-proof/e','image/jpeg',4)`).run();runtime.MEDIA.objects.set('history-proof/e',{bytes:new Uint8Array([1,2]),options:{httpMetadata:{contentType:'image/jpeg'}}});
  assert.equal((await worker.historyEvidenceMedia(runtime,'e','member-a',null)).status,200);assert.equal((await worker.historyEvidenceMedia(runtime,'e','member-b',null)).status,404);assert.equal((await worker.historyEvidenceMedia(runtime,'e',null,null)).status,200);
  assert.equal((await worker.requireAdmin(runtime,{uid:'member-a'})),null);assert.equal((await worker.requireAdmin(runtime,{uid:'admin'})).id,'admin');
  const unauth=await worker.default.fetch(new Request('https://api.e36united.cz/api/admin/history/claims'),{DB:{prepare(){throw new Error('must not query')}},MEDIA:runtime.MEDIA});assert.equal(unauth.status,401);
});

function historyItem(year,{attendance='approved',placement=null,bob=false,exhaust=false,eventId=`event-${year}`}={}){return {eventId,eventYear:year,attendance:{status:attendance},showShine:{status:placement||bob||exhaust?'approved':'not_claimed',category:'coupe',placement,bestOfBest:bob,bestExhaust:exhaust}}}

test('Achievements derive exact attendance, BMW, legacy and event-specific S&S tiers',()=>{
  for(const [count,name] of [[0,'UNITED MEMBER'],[1,'UNITED MEMBER'],[2,'UNITED REGULAR'],[3,'UNITED REGULAR'],[4,'UNITED VETERAN'],[5,'UNITED VETERAN'],[6,'UNITED LEGEND']]){const history=Array.from({length:count},(_,index)=>historyItem(2024+index,{eventId:`e-${index}`}));assert.equal(worker.deriveUnitedAchievements(history,0).achievements.find(item=>item.type==='attendance').name,name)}
  const history=[historyItem(2021,{placement:1,bob:true,exhaust:true}),historyItem(2023,{placement:3}),historyItem(2025,{placement:2})];const result=worker.deriveUnitedAchievements(history,50);const names=result.achievements.map(item=>item.name);assert.ok(names.includes('UNITED FIRST'));assert.ok(names.includes('OLD SCHOOL'));assert.ok(names.includes('BEST OF THE BEST · 2021'));assert.ok(names.includes('NEJ ZVUK VÝFUKU · 2021'));assert.equal(names.filter(name=>name.startsWith('S&S TOP 3')).length,3);assert.equal(result.achievements.find(item=>item.name==='S&S TOP 3 · 2021').eventYear,2021);assert.deepEqual(result.achievements.find(item=>item.name==='BMW PROSPEKT'),{id:'photos-50',type:'community',name:'BMW PROSPEKT',tier:'Gold',condition:'50 schválených komunitních fotek',points:3});
  assert.equal(worker.deriveUnitedAchievements([],5).achievements.find(item=>item.name==='BMW PROSPEKT').tier,'Bronze');assert.equal(worker.deriveUnitedAchievements([],25).achievements.find(item=>item.name==='BMW PROSPEKT').tier,'Silver');assert.deepEqual(result.featured,worker.deriveUnitedAchievements(history,50).featured);assert.equal(result.featured.length,4);assert.equal(result.featured[0].name,'BEST OF THE BEST · 2021');
});

test('rating uses lifetime earned ladder and club keeps available separate',async()=>{
  const expected=[[0,'316i'],[1,'316i'],[2,'318is'],[3,'318is'],[4,'320i'],[5,'320i'],[6,'323i'],[7,'323i'],[8,'325i'],[9,'325i'],[10,'328i'],[11,'328i'],[12,'M POWER'],[99,'M POWER']];for(const [points,name] of expected)assert.equal(worker.deriveMemberRating(points).name,name);
  const db=database(),runtime=env(db);db.prepare(`INSERT INTO united_points_ledger (id,member_id,delta,source_type,source_key,reason) VALUES ('plus','member-a',10,'test','test:plus','test'),('minus','member-a',-4,'redemption','test:minus','future test')`).run();const response=await payload(await worker.getUnitedClub(runtime,{uid:'member-a'},null));assert.equal(response.status,200);assert.deepEqual(response.body.points,{available:6,lifetime:10});assert.equal(response.body.rating.name,'328i');assert.throws(()=>db.prepare("UPDATE united_points_ledger SET delta=9 WHERE id='plus'").run(),/immutable/);assert.throws(()=>db.prepare("DELETE FROM united_points_ledger WHERE id='plus'").run(),/immutable/);
});

test('history attention counts attendance and S&S decisions independently',async()=>{const db=database(),runtime=env(db);addEvent(db,'one',2024);addEvent(db,'two',2025);addClaim(db,{id:'one',event:'one',attendance:'pending',sns:'pending',category:'sedan'});addClaim(db,{id:'two',event:'two',attendance:'approved',sns:'pending',category:'coupe'});assert.deepEqual(await worker.getAdminHistoryCounts(runtime),{attendancePending:1,snsPending:2,pending:3,total:2})});
