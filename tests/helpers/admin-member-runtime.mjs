import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export function memberRuntime(){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../../db/schema.sql',import.meta.url),'utf8'));
 const queries=[];let writes=0,mediaReads=0;
 const prepare=(sql,args=[])=>({bind:(...values)=>prepare(sql,values),first:async()=>{queries.push({sql,args});return db.prepare(sql).get(...args)||null},all:async()=>{queries.push({sql,args});return{results:db.prepare(sql).all(...args)}},run:async()=>{queries.push({sql,args});if(/^\s*(SELECT|WITH)/i.test(sql))return{results:db.prepare(sql).all(...args),meta:{changes:0}};const result=db.prepare(sql).run(...args);writes+=Number(result.changes);return{meta:{changes:Number(result.changes)}}}});
 const env={DB:{prepare,async batch(statements){db.exec('BEGIN');try{const rows=[];for(const s of statements)rows.push(await s.run());db.exec('COMMIT');return rows}catch(e){db.exec('ROLLBACK');throw e}}},MEDIA:{async get(){mediaReads++;return{body:'synthetic image',httpMetadata:{contentType:'image/jpeg'}}}}};
 db.exec(`INSERT INTO members(id,member_code,email,name,nickname,role) VALUES('a','EU-ADMIN','admin@example.invalid','Admin',NULL,'admin'),('m','EU-MEMBER','member@example.invalid','Same Name','First','member'),('n','EU-OTHER','other@example.invalid','Same Name','Second','member');
 INSERT INTO events(id,year,title,is_current) VALUES('e',2026,'United 2026',1),('old',2025,'United 2025',0);
 INSERT INTO cars(id,member_id,model,nickname,is_primary) VALUES('c','m','BMW 328i','Blue',1),('c2','m','BMW 325i','Track',0),('cn','n','BMW 318i','Other',1);
 INSERT INTO car_photos(id,car_id,r2_key) VALUES('p','c','private/m/p'),('pn','cn','private/n/p');
 INSERT INTO gallery_submissions(id,member_id,car_id,r2_key,caption,status) VALUES('g','m','c','private/m/g','Synthetic','approved');
 INSERT INTO reservations(id,member_id,event_id,status,amount_due_czk,amount_paid_czk,crew) VALUES('r','m','e','approved',1000,200,2);
 INSERT INTO united_history_claims(id,member_id,event_id,attendance_status,sns_status,sns_competed,sns_placement,sns_category) VALUES('h','m','old','approved','approved',1,1,'Coupe');
 INSERT INTO united_history_evidence(id,claim_id,member_id,r2_key,mime_type,size_bytes) VALUES('hp','h','m','private/m/h','image/jpeg',100);
 INSERT INTO united_points_ledger(id,member_id,delta,source_type,source_key,reason) VALUES('pt','m',4,'fixture','fixture','Synthetic existing points');
 INSERT INTO mailing_contacts(id,email,normalized_email,current_member_id) VALUES('linked','different@example.invalid','different@example.invalid','m'),('legacy','other@example.invalid','other@example.invalid',NULL);
 INSERT INTO mailing_campaigns(id,created_by,internal_name,segment_definition_json) VALUES('camp','a','Synthetic campaign','{}');
 INSERT INTO mailing_campaign_recipients(id,campaign_id,contact_id,member_id,email,normalized_email,eligibility_status) VALUES('rec','camp','linked','m','different@example.invalid','different@example.invalid','eligible');`);
 return{db,env,queries,get writes(){return writes},get mediaReads(){return mediaReads}};
}
