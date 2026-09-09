import {prepareAdminE2ePage} from './fixtures.mjs';
import {memberRuntime} from '../helpers/admin-member-runtime.mjs';
import {getAdminDashboard,getAdminPreferences,saveAdminPreferences} from '../../worker/admin/dashboard.js';
import {getAdminSummary} from '../../worker/admin/summary.js';
import {getAdminEvents,getAdminReservations,getAdminGallery,getAdminHistoryClaims} from '../../worker/domains.js';
import {getAdminMember,listAdminMembers,adminMemberMedia} from '../../worker/admin/members.js';
import {readFileSync} from 'node:fs';
import {patchAdminReservation,patchAdminReservationPayment,getAdminAccommodation,patchAdminAccommodation,patchAdminEvent,patchAdminGallery,adminGalleryMedia} from '../../worker/domains.js';
import {routeAdminMailing} from '../../worker/domains/mailing/index.js';
import {getAdminOperation} from '../../worker/admin/commands.js';
import {factoryPreferences} from '../../admin/dashboard-model.js';
import {runAdminCommand} from '../../worker/admin/commands.js';
import {patchAdminHistoryClaim,historyEvidenceMedia} from '../../worker/domains/club/history.js';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type, If-Match, Idempotency-Key','Access-Control-Allow-Methods':'GET, PUT, OPTIONS'};
export async function commandFixture(page,{legacy=false}={}){
 const observations=await prepareAdminE2ePage(page,{authUid:'a'}),r=memberRuntime(),calls=[],writes=[],failures=new Set();let mode='',tail=Promise.resolve();
 // Show the actual repository logo in NEW screenshots, not the generic baseline image stub.
 await page.route('https://e36united.cz/united-logo-blue-silver-transparent.png',route=>route.fulfill({status:200,contentType:'image/png',body:readFileSync(new URL('../../united-logo-blue-silver-transparent.png',import.meta.url))}));
 const batch=r.env.DB.batch;r.env.DB.batch=ss=>{const next=tail.then(()=>batch(ss));tail=next.catch(()=>{});return next};
 const getMedia=r.env.MEDIA.get;r.env.MEDIA.get=async(...args)=>{const object=await getMedia(...args);return object&&{...object,writeHttpMetadata:headers=>headers.set('Content-Type',object.httpMetadata.contentType)}};
 r.db.exec("UPDATE reservations SET created_at='2026-08-01 12:00:00',submitted_at='2026-08-02',attendance_type='full_weekend',show_shine='Ano'; INSERT INTO reservations(id,member_id,event_id,status,crew,amount_due_czk,amount_paid_czk,created_at,submitted_at,attendance_type,show_shine) VALUES('pending','n','e','pending',3,1000,1300,'2026-09-07','2026-09-07','saturday_only','Možná'),('cancelled','a','e','cancelled',5,0,400,'2026-08-15','2026-08-15','day_visit','Ne'); INSERT INTO event_accommodation_options(id,event_id,name,kind,inventory_mode,units_total,capacity_per_unit) VALUES('cab','e','Chatka','cabin','limited',8,4),('tent','e','Stan','tent','unlimited',0,2); INSERT INTO reservation_accommodation(reservation_id,option_id,people_count,unit_count,option_name,kind,unit_price_czk,person_price_czk,bedding_fee_per_person_czk,city_tax_per_person_per_night_czk,nights,base_total_czk,person_total_czk,bedding_total_czk,city_tax_total_czk,total_czk) VALUES('r','cab',2,1,'Chatka','cabin',0,0,0,0,2,0,0,0,0,0),('pending','tent',3,2,'Stan','tent',0,0,0,0,2,0,0,0,0,0);");
 if(legacy){r.db.prepare("INSERT INTO admin_preferences(id,schema_version,configuration_json,revision) VALUES('a',1,?,1)").run(JSON.stringify(factoryPreferences()));r.db.exec("INSERT INTO admin_resource_versions(resource_type,resource_id,revision) VALUES('preferences','a',1)");}
 const env={...r.env,ADMIN_READ:true},origin='https://e36united.cz';
 await page.route('https://api.e36united.cz/api/admin/**',async route=>{
  const q=route.request(),url=new URL(q.url()),path=url.pathname;
  if(q.method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(!/\/(dashboard|preferences|summary|events|accommodation|reservations|members|operations|gallery|mailing\/overview|history\/(claims|evidence))(\/|$)/.test(path))return route.fallback();
  calls.push(q.method()+' '+url.pathname+url.search);
  if(mode==='denied'||mode==='unavailable'&&path.endsWith('/dashboard')||mode==='summary-unavailable'&&path.endsWith('/summary')||mode==='preferences-unavailable'&&path.endsWith('/preferences')){failures.add(q.url());return route.fulfill({status:mode==='denied'?403:503,headers,json:{message:'Synthetic controlled failure'}});}
  let response;
  if(path.endsWith('/preferences')){
   if(q.method()==='PUT'){
    writes.push({key:q.headers()['idempotency-key'],revision:q.headers()['if-match'],body:q.postDataJSON()});
    if(mode==='undelivered'){failures.add(q.url());return route.abort('connectionfailed');}
    response=await saveAdminPreferences(new Request(q.url(),{method:'PUT',headers:q.headers(),body:q.postData()}),env,{uid:'a'},origin);
    if(mode==='lost'){failures.add(q.url());return route.abort('connectionfailed');}
   }else response=await getAdminPreferences(env,{uid:'a'},origin);
  }else if(path.endsWith('/dashboard'))response=await getAdminDashboard(env,url,origin,new Date('2026-09-08T12:00:00Z'));
  else if(path.endsWith('/summary'))response=await getAdminSummary(env,url,origin,new Date('2026-09-08T12:00:00Z'));
  else if(path.endsWith('/events'))response=await getAdminEvents(env,origin);
  else if(path.endsWith('/accommodation'))response=await getAdminAccommodation(env,url,origin);
  else if(/\/(accommodation|events|gallery)\/[^/]+$/.test(path)&&q.method()==='PATCH'){
   const [resource,id]=path.split('/').slice(-2),component=resource==='events'?'event':resource,handler={event:patchAdminEvent,accommodation:patchAdminAccommodation,gallery:patchAdminGallery}[component];
   const request=new Request(q.url(),{method:q.method(),headers:q.headers(),body:q.postData()});writes.push({component,revision:q.headers()['if-match']});
   response=await runAdminCommand(request,env,{uid:'a'},component,id,origin,commandEnv=>handler(request,commandEnv,{uid:'a'},id,origin));
  }
  else if(/\/reservations\/[^/]+\/payment$/.test(path)&&q.method()==='PATCH'){
   const id=path.split('/').at(-2),request=new Request(q.url(),{method:q.method(),headers:q.headers(),body:q.postData()});writes.push({component:'payment',revision:q.headers()['if-match']});
   response=await runAdminCommand(request,env,{uid:'a'},'payment',id,origin,commandEnv=>patchAdminReservationPayment(request,commandEnv,{uid:'a'},id,origin));
  }
  else if(/\/reservations\/[^/]+$/.test(path)&&q.method()==='PATCH'){
   const id=path.split('/').at(-1),request=new Request(q.url(),{method:q.method(),headers:q.headers(),body:q.postData()});writes.push({component:'reservation',revision:q.headers()['if-match']});
   response=await runAdminCommand(request,env,{uid:'a'},'reservation',id,origin,commandEnv=>patchAdminReservation(request,commandEnv,{uid:'a'},id,origin));
  }
  else if(path.endsWith('/mailing/overview'))response=await routeAdminMailing({request:new Request(q.url()),env,url,auth:{uid:'a'},origin});
  else if(path==='/api/admin/reservations')response=await getAdminReservations(env,url,origin);
  else if(path.includes('/operations/'))response=await getAdminOperation(env,{uid:'a'},path.split('/').at(-1),origin);
  else if(path.endsWith('/gallery'))response=await getAdminGallery(env,origin,url);
  else if(path.includes('/gallery/media/')){
   response=await adminGalleryMedia(env,path.split('/').at(-1),origin);
   if(response.status===200)return route.fulfill({status:200,headers,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#123d59"/></svg>'});
  }
  else if(path.endsWith('/history/claims'))response=await getAdminHistoryClaims(env,url,origin);
  else if(path.includes('/history/evidence/')){
   response=await historyEvidenceMedia(env,path.split('/').at(-1),null,origin);
   if(response.status===200)return route.fulfill({status:200,headers,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#123d59"/><text x="80" y="250" fill="white" font-size="38">TESTOVACÍ SOUKROMÝ DŮKAZ</text></svg>'});
  }
  else if(/\/history\/claims\/[^/]+\/(attendance|sns)$/.test(path)){
   const [id,component]=path.split('/').slice(-2),request=new Request(q.url(),{method:q.method(),headers:q.headers(),body:q.postData()});
   writes.push({component,revision:q.headers()['if-match']});
   response=await runAdminCommand(request,env,{uid:'a'},'history-'+component,id,origin,commandEnv=>patchAdminHistoryClaim(request,commandEnv,{uid:'a'},id,component,origin));
  }
  else if(path.endsWith('/members'))response=await listAdminMembers(env,url,origin);
  else if(path.includes('/members/')){const parts=path.split('/');if(parts[5]==='media'){response=await adminMemberMedia(env,parts[4],parts[6],parts[7],parts[8]||parts[7],origin);if(response.status===200)return route.fulfill({status:200,headers,contentType:'image/webp',body:readFileSync(new URL('../../assets/images/showshine/ss_sedan.webp',import.meta.url))});}else response=await getAdminMember(env,url,parts[4],parts[5],origin);}
  else return route.fallback();
  // Optional deterministic barriers run AFTER the real local handler, before delivery.
  // Existing fixtures are unchanged when no hook is installed.
  if(control.response){const result=await control.response({request:q,response});if(result===null){failures.add(q.url());return route.abort('connectionfailed')}if(result)response=result;}
  if(response.status>=400)failures.add(q.url());
  return route.fulfill({status:response.status,headers,body:await response.text()});
 });
 const control={r,calls,writes,observations,failures,response:null,get mode(){return mode},set mode(v){mode=v},stored(){const row=r.db.prepare("SELECT * FROM admin_preferences WHERE id='a'").get();return row?{revision:row.revision,value:JSON.parse(row.configuration_json)}:null},otherDevice(value){const row=this.stored();r.db.prepare("INSERT INTO admin_preferences(id,schema_version,configuration_json,revision) VALUES('a',1,?,?) ON CONFLICT(id) DO UPDATE SET configuration_json=excluded.configuration_json,revision=excluded.revision").run(JSON.stringify(value),(row?.revision||0)+1);r.db.prepare("INSERT INTO admin_resource_versions(resource_type,resource_id,revision) VALUES('preferences','a',1) ON CONFLICT(resource_type,resource_id) DO UPDATE SET revision=revision+1").run();}};
 return control;
}
