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
 const c=await commandFixture(page),control={starts:0,closes:0,saves:0,uploads:0,startMode:'',closeMode:'',delay:0,qrDelay:0,readFailure:false,photoFailure:false};
 c.r.db.exec("UPDATE events SET live_enabled=1 WHERE id='e'; UPDATE cars SET body='Sedan'; UPDATE reservations SET car_id='c' WHERE id='r'; INSERT INTO member_qr_identities(member_id,token) VALUES('m','123456789012345678901234567890123456789012345678')");
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
  }else if(p.includes('/judge/scores/')){control.saves++;response=await live.saveJudgeScore(req,c.r.env,auth,p.split('/').at(-1),origin)}
  else if(p.includes('/judge/entries/')&&p.endsWith('/photos')){
   control.uploads++;if(control.photoFailure&&control.uploads===2)return route.fulfill({headers,status:503,json:{error:'synthetic_photo_failure'}});
   response=await live.uploadJudgePhoto(req,c.r.env,auth,p.split('/').at(-2),origin);
  }else return route.fulfill({headers,contentType:'image/webp',body:photo});
  return route.fulfill({headers,status:response.status,body:await response.text()});
 });
 await page.route('https://api.e36united.cz/api/admin/members/*/media/**',route=>route.fulfill({headers,contentType:'image/webp',body:photo}));
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 return {...c,control,errors,async open(){await page.goto('/admin.html?section=live&event=e');await page.locator('[data-admin-live-entry-confirm]').click();await expect(page.locator('[data-admin-live-mode]')).toBeVisible()},async finish(){expect(errors).toEqual([]);await page.close();c.r.db.close()}};
}

test('navigation, QR, email, confirmed score and next car',async({page})=>{
 test.setTimeout(120000);const c=await fixture(page);page.on('dialog',d=>d.accept());
 try{
  await page.setViewportSize({width:390,height:844});await c.open();
  await expect(page.locator('[data-live-discipline]')).toHaveCount(2);
  await page.locator('[data-live-discipline=show_shine]').click();await expect(page.locator('[data-live-discipline]')).toHaveCount(0);
  await page.locator('[data-live-select-category=Sedan]').click();await page.locator('[data-live-choose-member]').click();
  await expect(page.locator('[data-live-select-member="car:c"]')).toBeVisible();await page.goBack();await expect(page.locator('[data-live-camera]')).toBeVisible();
  await page.goForward();await expect(page.locator('[data-live-member-search]')).toBeVisible();await page.goBack();
  await page.locator('.admin-live-manual summary').click();await page.locator('[data-live-qr] input').fill('E36U1:123456789012345678901234567890123456789012345678');await page.locator('[data-live-qr] button').click();
  await expect(page.locator('[data-live-select-member="car:c2"]')).toBeVisible();await page.locator('[data-live-select-member="car:c"]').click();
  await expect(page.locator('[data-live-start]')).toBeEnabled();await page.goBack();await expect(page.locator('[data-live-camera]')).toBeVisible();
  await page.locator('[data-live-choose-member]').click();await page.locator('[data-live-member-search] input').fill('member@example.invalid');await page.locator('[data-live-member-search] button').click();
  await expect(page.locator('[data-live-select-member="car:c"]')).toBeVisible();await page.locator('[data-live-select-member="car:c"]').click();
  const input=page.locator('[data-live-car-file][capture]');expect((await input.boundingBox()).width).toBeLessThan(2);
  await page.screenshot({path:'test-results/live-navigation/confirmation.png',fullPage:true});
  await page.locator('[data-live-start]').click();await expect(page.locator('[data-live-judge-form]')).toBeVisible();
  for(const key of keys)await page.locator('[data-live-judge-criterion='+key+'][data-live-judge-score="8"]').click();
  await page.locator('[data-live-judge-form] summary').click();await page.locator('[name=note]').fill('Lokální koncept — otočení a návrat');
  await page.locator('[data-admin-live-more-toggle]').click();await page.locator('[data-live-subview=results]').click();await expect(page.locator('[data-live-subview=workflow]')).toBeVisible();
  await page.goBack();await expect(page.locator('[name=note]')).toHaveValue('Lokální koncept — otočení a návrat');
  for(const [name,width,height] of [['360',360,800],['390',390,844],['landscape',844,390],['tablet',820,1180],['tablet-wide',1180,820],['desktop',1440,1000]]){
   await page.setViewportSize({width,height});
   for(const mode of ['light','dark']){
    await page.evaluate(mode=>{const s=document.querySelector('[data-appearance-select]');s.value=mode;s.dispatchEvent(new Event('change',{bubbles:true}))},mode);
    await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'test-results/live-navigation/'+name+'-'+mode+'.png',fullPage:true});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await expect(page.locator('[name=overall]')).toHaveValue('8');
   }
  }
  await page.locator('[data-live-overview]').click();await expect(page.locator('[data-live-resume]')).toBeVisible();await page.locator('[data-live-resume]').click();
  await expect(page.locator('[name=overall]')).toHaveValue('8');await page.locator('[data-live-judge-submit]').click();
  await expect(page.locator('[data-live-judge-summary]')).toContainText('Hodnocení potvrzeno');expect(c.control.saves).toBe(1);
  await page.locator('[data-live-close-entry]').click();await expect(page.locator('[data-live-next-member]')).toBeVisible();
  await page.locator('[data-live-next-member]').click();await expect(page.locator('[data-live-camera]')).toBeVisible();
  await page.locator('[data-live-choose-member]').click();await page.locator('[data-live-select-member="car:c2"]').click();await page.locator('[data-live-start]').click();
  await expect(page.locator('[data-live-judge-form]')).toBeVisible();await page.locator('[data-live-close-next]').click();await expect(page.locator('[data-live-camera]')).toBeVisible();
  expect(c.r.db.prepare('SELECT COUNT(*) n FROM event_arrivals').get().n).toBe(0);
  expect(c.r.db.prepare("SELECT status FROM live_category_state WHERE category='Sedan'").get().status).toBe('live');
  await page.reload();await expect(page.locator('[data-admin-live-mode]')).toBeVisible();await expect(page.locator('[data-live-start]')).toHaveCount(0);
 }finally{await c.finish()}
});
test('published start blocked visibly; category mismatch remains disabled',async({page})=>{
 const c=await fixture(page);try{
  c.r.db.exec("INSERT INTO live_competition_state(event_id,discipline,status,version) VALUES('e','show_shine','published',28); UPDATE cars SET body='Touring' WHERE id='c2'");
  await c.open();await page.locator('[data-live-discipline=show_shine]').click();
  await expect(page.locator('[data-live-flow-phase]')).toContainText('Výsledky Show & Shine jsou zveřejněné');
  await page.locator('[data-live-select-category=Sedan]').click();await page.locator('[data-live-choose-member]').click();await page.locator('[data-live-select-member="car:c2"]').click();
  await expect(page.locator('[data-live-start]')).toBeDisabled();await expect(page.locator('[data-live-start]')).toHaveText('Jiná kategorie');
  expect(c.control.starts).toBe(0);
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

test('extra member real Back Forward, cancel and saved dialog',async({page})=>{
 const c=await memberFixture(page);try{
  await page.setViewportSize({width:390,height:844});await c.open();
  await page.locator('[data-live-edit-vote]').click();await page.locator('[data-live-score="8"]').click();
  await page.goBack();await expect(page.locator('.live-vote-dialog')).toHaveCount(0);expect(c.control.writes).toBe(0);
  await page.goForward();await expect(page.locator('.live-vote-dialog')).toBeVisible();await page.locator('[data-live-cancel-vote]').click();await expect(page.locator('.live-vote-dialog')).toHaveCount(0);
  await page.locator('[data-live-edit-vote]').click();
  for(const mode of ['light','dark']){
   await page.setViewportSize({width:844,height:390});await page.evaluate(mode=>{const s=document.querySelector('[data-appearance-select]');s.value=mode;s.dispatchEvent(new Event('change',{bubbles:true}))},mode);
   await page.screenshot({path:'test-results/live-navigation/member-landscape-'+mode+'.png'});
   await page.locator('[data-live-cancel-vote]').scrollIntoViewIfNeeded();const b=await page.locator('[data-live-cancel-vote]').boundingBox();expect(b.y+b.height).toBeLessThanOrEqual(390);
  }
  await page.locator('[data-live-score="9"]').click();await page.locator('[data-live-vote] button[type=submit]').click();
  await expect(page.locator('.live-vote-dialog')).toHaveCount(0);await expect(page.locator('.live-score-confirmed')).toContainText('9 / 10');expect(c.control.writes).toBe(1);
  await page.locator('[data-live-tab=program]').click();await page.locator('[data-live-open-qr]').click();await page.goBack();await expect(page.locator('[data-live-qr-dialog]')).toBeHidden();
  expect(c.errors).toEqual([]);
 }finally{await page.close();c.r.db.close()}
});
test('extra Admin real back from judge, exit and interrupted QR',async({page})=>{
 const c=await fixture(page);page.on('dialog',d=>d.accept());try{
  await c.open();await page.locator('[data-live-discipline=show_shine]').click();await page.locator('[data-live-select-category=Sedan]').click();
  c.control.qrDelay=500;
  await page.locator('.admin-live-manual summary').click();await page.locator('[data-live-qr] input').fill('E36U1:123456789012345678901234567890123456789012345678');await page.locator('[data-live-qr] button').click();
  await page.goBack();await expect(page.locator('[data-live-select-category]')).toHaveCount(7);
  await page.waitForTimeout(650);await expect(page.locator('[data-live-start]')).toHaveCount(0);await expect(page.locator('[data-live-member-search]')).toHaveCount(0);
  await page.locator('[data-live-select-category=Sedan]').click();await page.locator('[data-live-choose-member]').click();await page.locator('[data-live-select-member="car:c"]').click();await page.locator('[data-live-start]').click();
  await expect(page.locator('[data-live-judge-form]')).toBeVisible();await page.goBack();await expect(page.locator('[data-live-resume]')).toBeVisible();
  await page.goBack();await expect(page.locator('[data-live-discipline]')).toHaveCount(2);
  await page.goBack();await expect(page.locator('.live-exit-dialog')).toBeVisible();await page.locator('[data-live-stay]').click();await expect(page.locator('[data-live-discipline]')).toHaveCount(2);
  await page.goBack();await page.locator('[data-live-leave]').click();await expect(page.locator('[data-admin-live-mode]')).toBeHidden();
 }finally{await c.finish()}
});
test('edge simulated camera release, lost start and failed close',async({page})=>{
 const c=await fixture(page);page.on('dialog',d=>d.accept());try{
  await page.addInitScript(()=>{
   window.__stopped=0;window.BarcodeDetector=class{async detect(){return []}};
   navigator.mediaDevices.getUserMedia=async()=>{
    await new Promise(r=>setTimeout(r,180));const canvas=document.createElement('canvas');canvas.width=100;canvas.height=100;
    const stream=canvas.captureStream(1);for(const track of stream.getTracks()){const stop=track.stop.bind(track);track.stop=()=>{window.__stopped++;stop()}}return stream;
   };
  });
  await c.open();await page.locator('[data-live-discipline=show_shine]').click();await page.locator('[data-live-select-category=Sedan]').click();
  await page.locator('[data-live-camera]').click();await page.goBack();await expect.poll(()=>page.evaluate(()=>window.__stopped)).toBe(1);await expect(page.locator('[data-live-camera-box]')).toBeHidden();
  await page.locator('[data-live-choose-member]').click();await page.locator('[data-live-select-member="car:c"]').click();
  c.control.startMode='lost';await page.locator('[data-live-start]').click();await expect(page.locator('[data-live-judge-form]')).toBeVisible();expect(c.control.starts).toBe(1);
  c.control.closeMode='reject';await page.locator('[data-live-close-next]').click();await expect(page.locator('[data-live-close-next]')).toBeEnabled();await expect(page.locator('[data-live-camera]')).toHaveCount(0);
  c.control.closeMode='';await page.locator('[data-live-close-next]').click();await expect(page.locator('[data-live-camera]')).toBeVisible();
  await page.goBack();await expect(page.locator('[data-live-select-category]')).toHaveCount(7);
 }finally{await c.finish()}
});
test('edge confirmed score keeps attachment queue through history, retry only failed photo',async({page})=>{
 const c=await fixture(page);page.on('dialog',d=>d.accept());try{
  await c.open();await page.locator('[data-live-discipline=show_shine]').click();await page.locator('[data-live-select-category=Sedan]').click();await page.locator('[data-live-choose-member]').click();await page.locator('[data-live-select-member="car:c"]').click();await page.locator('[data-live-start]').click();
  await expect(page.locator('[data-live-judge-form]')).toBeVisible();for(const key of keys)await page.locator('[data-live-judge-criterion='+key+'][data-live-judge-score="7"]').click();
  await page.locator('[data-live-judge-form] summary').click();await page.locator('[name=judgeGallery]').setInputFiles(['first.webp','second.webp'].map(name=>({name,mimeType:'image/webp',buffer:photo})));
  await expect(page.locator('[data-live-judge-previews] img')).toHaveCount(2);
  await page.locator('[data-admin-live-more-toggle]').click();await page.locator('[data-live-subview=results]').click();await page.goBack();await expect(page.locator('[data-live-judge-previews] img')).toHaveCount(2);
  c.control.photoFailure=true;await page.locator('[data-live-judge-submit]').click();await expect(page.locator('[data-live-judge-summary]')).toContainText('Hodnocení potvrzeno');
  await expect(page.locator('[data-upload-state=error]')).toHaveCount(1);await page.getByRole('button',{name:'Odeslat zbývající fotografie'}).click();await expect(page.locator('[data-live-judge-form]')).toHaveCount(0);
  expect(c.control.saves).toBe(1);expect(c.control.uploads).toBe(3);
  await page.setViewportSize({width:844,height:390});await page.locator('[data-live-close-entry]').scrollIntoViewIfNeeded();const b=await page.locator('[data-live-close-entry]').boundingBox(),nav=await page.locator('.admin-live-tabs').boundingBox();
  // The action can be scrolled above the fixed navigation with room left below it.
  await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await page.screenshot({path:'test-results/live-navigation/landscape-actions.png'});
  expect((await page.locator('[data-live-close-entry]').boundingBox()).y+(await page.locator('[data-live-close-entry]').boundingBox()).height).toBeLessThan(nav.y);
 }finally{await c.finish()}
});
test('visual member final popup without writes',async({page})=>{
 const c=await memberFixture(page);try{
  await c.open();await page.locator('[data-live-edit-vote]').click();
  await expect(page.locator('.live-vote-dialog img')).toBeVisible();
  for(const [name,width,height] of [['portrait',390,844],['landscape',844,390]]){
   await page.setViewportSize({width,height});
   for(const mode of ['light','dark']){
    await page.evaluate(mode=>{const s=document.querySelector('[data-appearance-select]');s.value=mode;s.dispatchEvent(new Event('change',{bubbles:true}))},mode);
    await page.locator('.live-vote-dialog').evaluate(node=>node.scrollTop=0);
    await page.screenshot({path:'test-results/live-navigation/final-member-'+name+'-'+mode+'.png'});
    await page.locator('[data-live-cancel-vote]').scrollIntoViewIfNeeded();
    const b=await page.locator('[data-live-cancel-vote]').boundingBox();expect(b.y+b.height).toBeLessThanOrEqual(height);
   }
  }
  expect(c.control.writes).toBe(0);expect(c.errors).toEqual([]);
 }finally{await page.close();c.r.db.close()}
});

test('visual final layouts and inputs without business writes',async({page})=>{
 const c=await fixture(page);try{
  c.r.db.exec("INSERT INTO live_entries(id,event_id,discipline,member_id,car_id,category,presented_at) VALUES('visual-entry','e','show_shine','m','c','Sedan',CURRENT_TIMESTAMP); INSERT INTO live_competition_state(event_id,discipline,status,current_entry_id) VALUES('e','show_shine','live','visual-entry'); INSERT INTO live_category_state(event_id,discipline,category,status) VALUES('e','show_shine','Sedan','live')");
  await c.open();await page.locator('[data-live-discipline=show_shine]').click();await page.locator('[data-live-resume]').click();
  for(const [name,width,height] of [['360',360,800],['390',390,844],['landscape',844,390],['tablet',820,1180],['tablet-wide',1180,820],['desktop',1440,1000]]){
   await page.setViewportSize({width,height});
   for(const mode of ['light','dark']){
    await page.evaluate(mode=>{const s=document.querySelector('[data-appearance-select]');s.value=mode;s.dispatchEvent(new Event('change',{bubbles:true}))},mode);await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:'test-results/live-navigation/final-'+name+'-'+mode+'.png',fullPage:true});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   }
  }
  await page.locator('[data-live-judge-form] summary').click();await page.setViewportSize({width:844,height:390});
  for(const selector of ['[name=judgePhoto]','[name=judgeGallery]'])expect((await page.locator(selector).boundingBox()).width).toBe(1);
  await page.locator('[name=judgePhoto]').locator('..').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/live-navigation/final-photo-controls.png'});
  expect(c.control.saves+c.control.starts+c.control.closes+c.control.uploads).toBe(0);
 }finally{await c.finish()}
});
