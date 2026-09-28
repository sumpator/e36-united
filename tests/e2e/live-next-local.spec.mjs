import {test,expect} from '@playwright/test';
import {prepareE2ePage} from './fixtures.mjs';
import {memberRuntime} from '../helpers/admin-member-runtime.mjs';
import {commandFixture} from './command-fixture.mjs';
import * as live from '../../worker/domains/live.js';
import {readFileSync} from 'node:fs';
const photo=readFileSync(new URL('../../assets/images/showshine/ss_sedan.webp',import.meta.url));
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,OPTIONS'};
const origin='https://e36united.cz',auth={uid:'a'},keys=['overall','condition','cohesion','originality'];
async function fixture(page){
 const c=await commandFixture(page),control={starts:0,closes:0,saves:0,uploads:0,startMode:'',closeMode:'',delay:0,qrDelay:0,readFailure:false,photoFailure:false,scoreLost:false,carPhotoFailure:false,carUploads:0};
 c.r.db.exec("UPDATE events SET live_enabled=1,starts_on='2026-06-19',ends_on='2026-06-21' WHERE id='e'; UPDATE cars SET body='Sedan'; UPDATE reservations SET car_id='c' WHERE id='r'; INSERT INTO event_member_presence(event_id,member_id,present) VALUES('e','m',1); INSERT INTO member_qr_identities(member_id,token) VALUES('m','123456789012345678901234567890123456789012345678')");
 const objects=new Map();c.r.env.MEDIA.put=async(key,stream)=>objects.set(key,await new Response(stream).arrayBuffer());c.r.env.MEDIA.delete=async key=>objects.delete(key);
 await page.route('https://api.e36united.cz/api/**',async route=>{
  const q=route.request(),url=new URL(q.url()),p=url.pathname;if(!p.includes('/live'))return route.fallback();
  if(q.method()==='OPTIONS')return route.fulfill({status:204,headers});
  const req=new Request(q.url(),{method:q.method(),headers:q.headers(),...(q.postDataBuffer()?{body:q.postDataBuffer()}:{})});let response;
  if(p==='/api/admin/live'){if(control.readFailure)return route.fulfill({headers,status:503,json:{error:'synthetic_unavailable'}});response=await live.getAdminLive(c.r.env,url,origin)}
  else if(p==='/api/live')response=await live.getMemberLive(c.r.env,auth,origin);
  else if(p==='/api/live/state')response=await live.getLiveState(c.r.env,auth,url,origin);
  else if(p.endsWith('/live/members'))response=await live.searchLiveMembers(c.r.env,'e',url,origin);
  else if(p.endsWith('/live/qr')){if(control.qrDelay)await new Promise(r=>setTimeout(r,control.qrDelay));response=await live.resolveLiveQr(req,c.r.env,'e',origin)}
  else if(p.endsWith('/live/start')){
   control.starts++;if(control.delay)await new Promise(r=>setTimeout(r,control.delay));
   if(control.startMode==='reject')return route.fulfill({headers,status:409,json:{error:'presence_required'}});
   response=await live.startLiveEntry(req,c.r.env,auth,'e',origin);
   if(control.startMode==='lost-unreadable'){control.readFailure=true;return route.abort('failed')}
   if(control.startMode==='lost')return route.abort('failed');
  }else if(p.endsWith('/close')){
   control.closes++;if(control.closeMode==='reject')return route.fulfill({headers,status:503,json:{error:'unavailable'}});
   response=await live.closeLiveEntry(req,c.r.env,auth,p.split('/').at(-2),origin);
   if(control.closeMode==='lost')return route.abort('failed');
  }else if(p.includes('/judge/scores/')){control.saves++;response=await live.saveJudgeScore(req,c.r.env,auth,p.split('/').at(-1),origin);if(control.scoreLost)return route.abort('failed')}
  else if(p.includes('/judge/entries/')&&p.endsWith('/photos')){
   control.uploads++;if(control.photoFailure&&control.uploads===2)return route.fulfill({headers,status:503,json:{error:'synthetic_photo_failure'}});
   response=await live.uploadJudgePhoto(req,c.r.env,auth,p.split('/').at(-2),origin);
  }else if(p.endsWith('/members/m/cars'))response=await live.createCompetitionCar(req,c.r.env,auth,'e','m',origin);
  else if(p.includes('/live/cars/')&&q.method()==='POST'){control.carUploads++;if(control.carPhotoFailure)return route.fulfill({headers,status:503,json:{error:'synthetic_photo_failure'}});response=await live.saveCompetitionPhoto(req,c.r.env,auth,'e',p.split('/').at(-2),origin)}
  else if(p.endsWith('/control'))response=await live.controlLive(req,c.r.env,auth,'e','show_shine',origin);
  else if(p.includes('/live/program')&&q.method()!=='GET')response=await live.saveProgramItem(req,c.r.env,auth,'e',p.endsWith('/program')?null:p.split('/').at(-1),origin);
  else return route.fulfill({headers,contentType:'image/webp',body:photo});
  return route.fulfill({headers,status:response.status,body:await response.text()});
 });
 await page.route('https://api.e36united.cz/api/admin/members/*/media/**',route=>route.fulfill({headers,contentType:'image/webp',body:photo}));
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 return {...c,control,errors,async open(){await page.goto('/admin.html?section=live&event=e');await page.locator('[data-admin-live-entry-confirm]').click();await expect(page.locator('[data-admin-live-mode]')).toBeVisible()},async finish(){expect(errors).toEqual([]);await page.close();c.r.db.close()}};
}
async function choose(page,qr=false){
 await page.locator('[data-live-select-category="Sedan"]').click();
 if(qr){await page.locator('.admin-live-manual summary').click();await page.locator('[data-live-qr] input').fill('E36U1:123456789012345678901234567890123456789012345678');await page.locator('[data-live-qr] button').click()}
 else{await page.locator('[data-live-choose-member]').click();await page.locator('[data-live-select-member="m"]').click()}
 await expect(page.locator('[data-live-flow-phase]')).toHaveAttribute('data-live-flow-phase','B');
 await expect(page.locator('[data-live-camera]')).toHaveCount(0);
}
async function start(page){await page.locator('[data-live-start]').click();await expect(page.locator('[data-live-judge-form]')).toBeVisible();await expect(page.locator('[data-live-rating-focus]')).toBeFocused();await expect(page.locator('[data-live-start],[data-live-car-select],[data-live-new-car]')).toHaveCount(0)}
async function score(page){for(const [i,key] of keys.entries())await page.locator('[data-live-judge-criterion="'+key+'"][data-live-judge-score="'+(6+i)+'"]').click()}
async function shot(page,name){
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))});
 await page.screenshot({path:'test-results/live-next/'+name+'.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(()=>innerWidth+1));
}

async function theme(page,mode){await page.evaluate(mode=>{const s=document.querySelector('[data-appearance-select]');s.value=mode;s.dispatchEvent(new Event('change',{bubbles:true}))},mode);await expect(page.locator('html')).toHaveAttribute('data-theme',mode)}
for(const width of [360,390,1024,1440])test('local Admin next workflow '+width,async({page})=>{
 const c=await fixture(page);await page.setViewportSize({width,height:900});page.on('dialog',d=>d.accept());
 try{
  await c.open();await choose(page);
  await page.locator('[data-live-new-car]').click();await expect(page.locator('[data-live-start],[data-live-car-select]')).toHaveCount(0);
  await page.locator('[name=model]').fill('BMW 328i · lokální soutěžní auto');await page.locator('[name=body]').selectOption('Touring');
  await page.locator('[data-live-car-file][capture]').setInputFiles({name:'camera-simulation.webp',mimeType:'image/webp',buffer:photo});
  await expect(page.locator('[data-live-car-previews] img')).toHaveJSProperty('complete',true);
  for(const mode of ['light','dark']){await theme(page,mode);await shot(page,width+'-'+mode+'-new-car')}
  await page.locator('[data-live-new-car-form] button[type=submit]').click();await expect(page.locator('[data-live-new-car-form]')).toHaveCount(0);
  await expect(page.locator('[data-live-start]')).toBeDisabled();await expect(page.locator('[data-live-switch-category]')).toHaveCount(0);
  expect(c.r.db.prepare('SELECT COUNT(*) n FROM live_car_photos').get().n).toBe(1);expect(c.r.db.prepare('SELECT COUNT(*) n FROM live_judge_photos').get().n).toBe(0);
  await page.locator('[data-live-car-select]').selectOption('c');await start(page);await score(page);await page.locator('[data-live-judge-submit]').click();await expect(page.locator('[data-live-judge-summary]')).toBeVisible();
  await page.locator('[data-live-close-next]').click();await page.locator('[data-live-overview]').click();await page.locator('[data-live-close-category=Sedan]').click();
  await page.locator('[data-live-subview=results]').click();await expect(page.locator('[data-live-subview=history]')).toHaveCount(0);await page.locator('[data-live-edit-score]').click();
  await expect(page.locator('[data-live-judge-form]')).toHaveCount(0);await page.locator('[data-live-edit-own]').click();await expect(page.locator('[name=overall]')).toHaveValue('6');
  await expect(page.locator('.live-correction-warning')).toContainText('Kategorie je uzavřená');
  await page.locator('[name=reason]').fill('Oprava překlepu při společném rozhodnutí poroty');
  await page.locator('[data-live-judge-criterion=overall][data-live-judge-score="9"]').click();
  for(const mode of ['light','dark']){await theme(page,mode);await shot(page,width+'-'+mode+'-correction')}
  await page.locator('[data-live-judge-submit]').click();await expect(page.locator('[data-live-judge-form]')).toHaveCount(0);
  expect(c.r.db.prepare('SELECT COUNT(*) n FROM live_judge_score_audit').get().n).toBe(1);expect(c.r.db.prepare("SELECT status FROM live_category_state WHERE category='Sedan'").get().status).toBe('closed');
  await page.locator('[data-admin-live-tab=program]').click();const f=page.locator('[data-live-program-form]');
  await expect(f.locator('[type=date],[type=datetime-local]')).toHaveCount(0);await f.locator('[name=title]').fill('Nečasovaný bod');await f.locator('button[type=submit]').click();await expect(f.locator('[name=title]')).toHaveValue('');
  await f.locator('[name=title]').fill('Ranní bod');await f.locator('[name=timeFrom]').fill('09:00');await f.locator('button[type=submit]').click();await expect(f.locator('[name=title]')).toHaveValue('');
  await f.locator('[name=title]').fill('Rozepsaný program');
  c.r.db.exec("UPDATE event_program_items SET description='Změna z druhého klienta'");
  await expect(page.locator('.admin-live-history')).toContainText('Změna z druhého klienta',{timeout:10000});await expect(f.locator('[name=title]')).toHaveValue('Rozepsaný program');
  for(const mode of ['light','dark']){await theme(page,mode);await shot(page,width+'-'+mode+'-program')}
 }finally{await c.finish()}
});
async function memberFixture(page){
 await prepareE2ePage(page,{authenticated:true});const r=memberRuntime(),control={writes:0,lost:false,closeOnWrite:false,readFailure:false};
 r.db.exec("UPDATE events SET live_enabled=1,starts_on='2026-06-19',ends_on='2026-06-21' WHERE id='e'; INSERT INTO live_entries(id,event_id,discipline,member_id,car_id,category,presented_at) VALUES('entry','e','show_shine','m','c','Sedan',CURRENT_TIMESTAMP); INSERT INTO live_competition_state(event_id,discipline,status,current_entry_id) VALUES('e','show_shine','live','entry'); INSERT INTO live_category_state(event_id,discipline,category,status) VALUES('e','show_shine','Sedan','live');");
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://api.e36united.cz/api/live**',async route=>{
  const q=route.request(),url=new URL(q.url()),p=url.pathname;if(q.method()==='OPTIONS')return route.fulfill({status:204,headers});
  const req=new Request(q.url(),{method:q.method(),headers:q.headers(),...(q.postDataBuffer()?{body:q.postDataBuffer()}:{})});let response;
  if(p==='/api/live'){if(control.readFailure)return route.fulfill({headers,status:503,json:{error:'synthetic_read_failure'}});response=await live.getMemberLive(r.env,{uid:'n'},origin)}
  else if(p==='/api/live/state')response=await live.getLiveState(r.env,{uid:'n'},url,origin);
  else if(p.includes('/judge/scores/'))response=await live.saveJudgeScore(req,r.env,{uid:'n'},p.split('/').at(-1),origin);
  else if(p.includes('/votes/')){control.writes++;if(control.closeOnWrite)r.db.exec("UPDATE live_category_state SET status='closed'");response=await live.saveLiveVote(req,r.env,{uid:'n'},'entry',origin);if(control.lost)return route.abort('failed')}
  else return route.fulfill({headers,contentType:'image/webp',body:photo});
  return route.fulfill({headers,status:response.status,body:await response.text()});
 });
 return{r,control,errors,async open(){await page.goto('/member.html?section=live');await page.locator('[data-live-entry-confirm]').click();await page.locator('[data-live-tab=showshine]').click()}};
}
for(const width of [360,390,1024,1440])test('local member dialog and category history '+width,async({page})=>{
 const c=await memberFixture(page);await page.setViewportSize({width,height:900});
 try{
  await c.open();await expect(page.locator('[data-live-discipline=best_exhaust]')).toHaveCount(0);await expect(page.locator('[data-live-vote-history]')).toContainText('Zatím nemáš žádné hlasy');
  await page.locator('[data-live-edit-vote]').click();await page.locator('[data-live-score="8"]').click();
  for(const mode of ['light','dark']){await theme(page,mode);await shot(page,width+'-'+mode+'-vote-dialog')}
  await page.locator('[data-live-cancel-vote]').click();await expect(page.locator('[data-live-edit-vote]')).toBeFocused();expect(c.control.writes).toBe(0);
  await page.locator('[data-live-edit-vote]').click();await page.locator('[data-live-score="8"]').click();
  await page.locator('[data-live-vote]').evaluate(f=>{f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))});
  await expect(page.locator('.live-vote-dialog')).toHaveCount(0);await expect(page.locator('.live-score-confirmed')).toContainText('8 / 10');expect(c.control.writes).toBe(1);
  c.r.db.exec("UPDATE live_entries SET voting_closed=1; UPDATE live_competition_state SET status='idle',current_entry_id=NULL,version=version+1");
  await expect(page.locator('.live-rating-card')).toHaveCount(0,{timeout:10000});await page.locator('[data-live-vote-history] [data-live-edit-vote]').click();await expect(page.locator('[name=score]')).toHaveValue('8');
  await page.locator('[data-live-score="9"]').click();await page.locator('[data-live-vote] button[type=submit]').click();await expect(page.locator('.live-vote-dialog')).toHaveCount(0);expect(c.r.db.prepare('SELECT score FROM live_public_votes').get().score).toBe(9);
  await page.locator('[data-live-vote-category] summary').click();c.r.db.exec("UPDATE events SET venue_name='Lokální změna' WHERE id='e'; UPDATE live_event_revisions SET revision=revision+1");
  await expect(page.locator('[data-live-vote-category]')).not.toHaveAttribute('open','');await page.locator('[data-live-vote-category] summary').click();
  await page.locator('[data-live-edit-vote]').click();await page.locator('[data-live-score="3"]').click();c.control.closeOnWrite=true;await page.locator('[data-live-vote] button[type=submit]').click();
  await expect(page.locator('[data-live-vote-error]')).toContainText('Skutečně uložená známka: 9');await expect(page.locator('[data-live-vote] button[type=submit]')).toBeDisabled();await page.locator('[data-live-cancel-vote]').click();
  await expect(page.locator('[data-live-edit-vote]')).toHaveCount(0);
  for(const mode of ['light','dark']){await theme(page,mode);await shot(page,width+'-'+mode+'-history')}
  await page.locator('[data-live-tab=program]').click();await expect(page.locator('[data-live-open-qr]')).toBeVisible();
  for(const mode of ['light','dark']){await theme(page,mode);await shot(page,width+'-'+mode+'-member-program')}
  expect(c.errors).toEqual([]);
 }finally{await page.close();c.r.db.close()}
});

test('extended: new competition car proceeds to scoring; failed photo retry and lost score receipt',async({page})=>{
 const c=await fixture(page);await page.setViewportSize({width:390,height:844});page.on('dialog',d=>d.accept());
 try{
  await c.open();await choose(page);await page.locator('[data-live-new-car]').click();await page.locator('[name=model]').fill('Nové soutěžní BMW');
  await page.locator('[data-live-car-file][capture]').setInputFiles({name:'simulated-camera.webp',mimeType:'image/webp',buffer:photo});
  await expect(page.locator('[data-live-car-previews] img')).toHaveJSProperty('complete',true);
  await page.locator('[data-live-remove-car-photo]').click();await expect(page.locator('[data-live-car-previews] img')).toHaveCount(0);
  await page.locator('[data-live-car-file]:not([capture])').setInputFiles({name:'gallery.webp',mimeType:'image/webp',buffer:photo});
  c.control.carPhotoFailure=true;await page.locator('[data-live-new-car-form] button[type=submit]').click();await expect(page.locator('[data-live-new-car-form]')).toHaveCount(0);
  expect(c.r.db.prepare('SELECT COUNT(*) n FROM live_competition_cars').get().n).toBe(1);
  await expect(page.locator('[data-live-car-previews] [data-upload-state="error"]')).toBeVisible();
  c.control.carPhotoFailure=false;await page.locator('[data-live-save-car-photo]').click();await expect.poll(()=>c.r.db.prepare('SELECT COUNT(*) n FROM live_car_photos').get().n).toBe(1);
  await expect(page.locator('[data-live-start]')).toBeEnabled();await start(page);
  await expect(page.locator('.admin-live-fixed-photo img')).toBeVisible();
  const entry=c.r.db.prepare('SELECT * FROM live_entries').get();expect(entry.competition_car_id).toBeTruthy();expect(entry.car_id).toBeNull();
  await score(page);c.control.scoreLost=true;await page.locator('[data-live-judge-submit]').click();await expect(page.locator('[data-live-judge-summary]')).toContainText('Hodnocení potvrzeno');
  expect(c.control.saves).toBe(1);expect(c.control.carUploads).toBe(2);expect(c.r.db.prepare("SELECT r2_key FROM car_photos WHERE id='p'").get().r2_key).toBe('private/m/p');
 }finally{await c.finish()}
});
test('extended: confirmed scores retry only failed internal attachments',async({page})=>{
 const c=await fixture(page);c.control.photoFailure=true;
 try{await c.open();await choose(page);await start(page);await score(page);await page.locator('[data-live-judge-form] summary').click();
  await page.locator('[name=judgeGallery]').setInputFiles(['one.webp','two.webp'].map(name=>({name,mimeType:'image/webp',buffer:photo})));await page.locator('[data-live-judge-submit]').click();
  await expect(page.locator('[data-live-judge-summary]')).toContainText('Hodnocení potvrzeno');await expect(page.locator('[data-upload-state=error]')).toHaveCount(1);
  await page.getByRole('button',{name:'Odeslat zbývající fotografie'}).click();await expect(page.locator('[data-live-judge-form]')).toHaveCount(0);expect(c.control.saves).toBe(1);expect(c.control.uploads).toBe(3);
 }finally{await c.finish()}
});
test('extended: member jury correction preserves versioned draft and read-only results',async({page})=>{
 const c=await memberFixture(page);page.on('dialog',d=>d.accept());
 c.r.db.exec("UPDATE members SET role='admin' WHERE id='n'; INSERT INTO live_judge_scores(id,event_id,entry_id,judge_id,scores_json,submitted) VALUES('score','e','entry','a','{\"overall\":6,\"condition\":7,\"cohesion\":8,\"originality\":9}',1); UPDATE live_entries SET voting_closed=1; UPDATE live_category_state SET status='closed'; UPDATE live_competition_state SET status='published',current_entry_id=NULL;");
 try{await c.open();await expect(page.locator('[data-live-judge]')).toHaveCount(0);
  await page.locator('.live-results details>summary').click();await page.locator('[data-live-edit-judge]').click();await expect(page.locator('[name=overall]')).toHaveValue('6');
  await page.locator('[name=reason]').fill('Oprava z členského přístupu porotce');await page.locator('[data-live-judge-score="10"][data-live-judge-criterion=overall]').click();
  await page.locator('[data-judge-submit]').click();await expect(page.locator('[data-live-judge]')).toHaveCount(0);expect(c.r.db.prepare('SELECT judge_id FROM live_judge_scores').get().judge_id).toBe('a');expect(c.r.db.prepare('SELECT changed_by FROM live_judge_score_audit').get().changed_by).toBe('n');
  if(!await page.locator('.live-results details').evaluate(node=>node.open))await page.locator('.live-results details>summary').click();await page.locator('[data-live-edit-judge]').click();await page.locator('[name=reason]').fill('Můj rozepsaný důvod');
  c.r.db.exec("UPDATE live_judge_scores SET version=version+1,updated_by='a',correction_reason='Jiný klient',scores_json='{\"overall\":2,\"condition\":7,\"cohesion\":8,\"originality\":9}'");
  await page.waitForResponse(r=>r.url().endsWith('/api/live'),{timeout:10000});await expect(page.locator('[name=reason]')).toHaveValue('Můj rozepsaný důvod');await expect(page.locator('[name=overall]')).toHaveValue('10');
  await page.locator('[data-judge-submit]').click();await expect(page.locator('[data-live-judge-error]')).toContainText('mezitím změnilo');expect(JSON.parse(c.r.db.prepare('SELECT scores_json FROM live_judge_scores').get().scores_json).overall).toBe(2);
  expect(c.errors).toEqual([]);
 }finally{await page.close();c.r.db.close()}
});
test('extended: public dialog keyboard, lost receipt verified and later refresh failure',async({page})=>{
 const c=await memberFixture(page);
 try{await c.open();await page.locator('[data-live-edit-vote]').click();await page.keyboard.press('Escape');await expect(page.locator('.live-vote-dialog')).toHaveCount(0);await expect(page.locator('[data-live-edit-vote]')).toBeFocused();
  await page.locator('[data-live-edit-vote]').click();await page.locator('[data-live-cancel-vote]').focus();await page.keyboard.press('Tab');expect(await page.evaluate(()=>!!document.activeElement.closest('.live-vote-dialog'))).toBe(true);
  await page.locator('[data-live-score="7"]').click();c.control.lost=true;await page.locator('[data-live-vote] button[type=submit]').click();await expect(page.locator('.live-vote-dialog')).toHaveCount(0);await expect(page.locator('.live-score-confirmed')).toContainText('7 / 10');expect(c.control.writes).toBe(1);
  c.control.readFailure=true;c.r.db.exec('UPDATE live_event_revisions SET revision=revision+1');await page.waitForResponse(r=>r.url().endsWith('/api/live')&&r.status()===503,{timeout:10000});
  await expect(page.locator('.live-score-confirmed')).toContainText('7 / 10');expect(c.errors).toEqual([]);
 }finally{await page.close();c.r.db.close()}
});

for(const width of [360,390])test('program content '+width+': all event days, untimed items and live refresh',async({page})=>{
 await page.setViewportSize({width,height:900});const c=await memberFixture(page);
 c.r.db.exec("INSERT INTO event_program_items(id,event_id,day,starts_at,title) VALUES('fri','e','2026-06-19','2026-06-19T09:00','Páteční program'),('sat','e','2026-06-20','2026-06-20T10:00','Sobotní program'),('sun','e','2026-06-21','','Nedělní setkání');");
 try{await c.open();await page.locator('[data-live-tab=program]').click();
  for(const [day,title] of [['2026-06-19','Páteční program'],['2026-06-20','Sobotní program'],['2026-06-21','Nedělní setkání']]){await page.locator('[data-live-day="'+day+'"]').click();await expect(page.locator('.live-program-list')).toContainText(title)}
  await expect(page.locator('.live-program-item time')).toHaveText('');
  c.r.db.exec("UPDATE event_program_items SET description='Aktuální informace' WHERE id='sun'");
  await expect(page.locator('.live-program-list')).toContainText('Aktuální informace',{timeout:10000});
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  for(const theme of ['light','dark']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.screenshot({path:'test-results/live-next/'+width+'-'+theme+'-member-program-content.png',fullPage:true})}
  expect(c.errors).toEqual([]);
 }finally{await page.close();c.r.db.close()}
});
