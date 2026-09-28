import {test,expect} from '@playwright/test';
import {commandFixture} from './command-fixture.mjs';
import * as live from '../../worker/domains/live.js';
import {readFileSync} from 'node:fs';
const photo=readFileSync(new URL('../../assets/images/showshine/ss_sedan.webp',import.meta.url));
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,OPTIONS'};
const origin='https://e36united.cz',auth={uid:'a'},keys=['overall','condition','cohesion','originality'];
async function fixture(page){
 const c=await commandFixture(page),control={starts:0,closes:0,saves:0,uploads:0,startMode:'',closeMode:'',delay:0,qrDelay:0,readFailure:false,photoFailure:false};
 c.r.db.exec("UPDATE events SET live_enabled=1 WHERE id='e'; UPDATE cars SET body='Sedan'; UPDATE reservations SET car_id='c' WHERE id='r'; INSERT INTO event_member_presence(event_id,member_id,present) VALUES('e','m',1); INSERT INTO member_qr_identities(member_id,token) VALUES('m','123456789012345678901234567890123456789012345678')");
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
 await page.screenshot({path:'test-results/judge-workflow/'+name+'.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(()=>innerWidth+1));
}
for(const width of [390,1440])for(const mode of ['light','dark'])test('judge phases and visuals '+width+' '+mode,async({page})=>{
 const c=await fixture(page);await page.setViewportSize({width,height:900});
 try{
  await c.open();await page.evaluate(mode=>{const select=document.querySelector('[data-appearance-select]');select.value=mode;select.dispatchEvent(new Event('change',{bubbles:true}))},mode);
  await choose(page,width===390);await shot(page,width+'-'+mode+'-confirm');await start(page);await score(page);
  await page.locator('[data-live-overview]').click();await expect(page.locator('[data-live-select-category]:enabled')).toHaveCount(0);await expect(page.locator('[data-live-resume]')).toContainText('Pokračovat');
  await page.locator('[data-live-resume]').click();await expect(page.locator('[name=overall]')).toHaveValue('6');await shot(page,width+'-'+mode+'-rating');
  await page.locator('[data-live-judge-submit]').click();await expect(page.locator('[data-live-judge-summary]')).toContainText('Hodnocení potvrzeno');await expect(page.locator('[data-live-judge-form]')).toHaveCount(0);
  await expect(page.locator('.admin-live-own-points dd')).toHaveText(['6 / 10','7 / 10','8 / 10','9 / 10']);await shot(page,width+'-'+mode+'-confirmed');
  await page.reload();await expect(page.locator('[data-live-judge-summary]')).toBeVisible();await expect(page.locator('[data-live-start]')).toHaveCount(0);
  page.on('dialog',d=>d.accept());await page.locator('[data-live-close-next]').click();await expect(page.locator('[data-live-flow-phase]')).toHaveAttribute('data-live-flow-phase','A');await expect(page.locator('.admin-live-step')).toContainText('Sedan');
  expect(c.r.db.prepare('SELECT voting_closed FROM live_entries').get().voting_closed).toBe(1);expect(c.r.db.prepare('SELECT status FROM live_category_state').get().status).toBe('live');expect(c.control.starts).toBe(1);expect(c.control.closes).toBe(1);
 }finally{await c.finish()}
});
test('standalone Members start rejoins workflow; refresh keeps draft, history never starts',async({page})=>{
 const c=await fixture(page);
 try{await c.open();await page.locator('[data-admin-live-tab=members]').click();await page.locator('[data-live-select-member=m]').click();await start(page);
  await expect(page.locator('[data-admin-live-tab=showshine]')).toHaveAttribute('aria-current','page');await score(page);
  await page.reload();await expect(page.locator('[name=overall]')).toHaveValue('6');await page.locator('[data-live-subview=history]').click();await page.locator('[data-live-edit-score]').click();await expect(page.locator('[data-live-judge-form]')).toHaveCount(0);expect(c.control.starts).toBe(1);
  await page.locator('[data-live-subview=workflow]').click();await expect(page.locator('[name=overall]')).toHaveValue('6');
  let warning='';page.once('dialog',d=>{warning=d.message();return d.dismiss()});await page.locator('[data-live-close-next]').click();expect(warning).toContain('neuložené body');expect(c.control.closes).toBe(0);
  await page.locator('[data-live-judge-submit]').click();await expect(page.locator('[data-live-judge-summary]')).toBeVisible();
  page.once('dialog',d=>d.accept());await page.locator('[data-live-close-entry]').click();await expect(page.locator('[data-live-next-member]')).toBeVisible();await expect(page.locator('[data-live-camera]')).toHaveCount(0);
 }finally{await c.finish()}
});
test('late QR cannot replace overview; unreadable start outcome blocks retry until read confirmation',async({page})=>{
 const c=await fixture(page);
 try{await c.open();await page.locator('[data-live-select-category=Sedan]').click();c.control.qrDelay=300;
  await page.locator('.admin-live-manual summary').click();await page.locator('[data-live-qr] input').fill('E36U1:123456789012345678901234567890123456789012345678');
  const response=page.waitForResponse(r=>r.url().endsWith('/live/qr')&&r.request().method()==='POST');await page.locator('[data-live-qr] button').click();await page.locator('[data-live-overview]').click();await response;
  await expect(page.locator('[data-live-flow-phase]')).toHaveAttribute('data-live-flow-phase','overview');await expect(page.locator('[data-live-start]')).toHaveCount(0);
  await choose(page);c.control.startMode='lost-unreadable';await page.locator('[data-live-start]').click();await expect(page.locator('[data-live-start]')).toBeDisabled();await expect(page.locator('[data-live-flow-phase]')).toHaveAttribute('data-live-flow-phase','B');
  await expect(page.locator('.admin-live-selected')).toContainText('Před dalším pokusem obnov stav');expect(c.control.starts).toBe(1);
  c.control.readFailure=false;await page.locator('.admin-live-selected [data-admin-live-retry]').click();await expect(page.locator('[data-live-judge-form]')).toBeVisible();expect(c.control.starts).toBe(1);
 }finally{await c.finish()}
});
test('selection cancel, new-car warning, discard only own draft',async({page})=>{
 const c=await fixture(page);
 try{await c.open();await choose(page);await page.locator('[data-live-new-car]').click();await page.locator('[data-live-new-car-form] [name=model]').fill('Local car');
  page.once('dialog',d=>d.dismiss());await page.locator('[data-live-cancel-selection]').click();await expect(page.locator('[data-live-new-car-form]')).toBeVisible();
  page.once('dialog',d=>d.accept());await page.locator('[data-live-cancel-selection]').click();await expect(page.locator('[data-live-flow-phase]')).toHaveAttribute('data-live-flow-phase','A');
  await page.locator('[data-live-choose-member]').click();await page.locator('[data-live-select-member=m]').click();await start(page);await score(page);
  await page.locator('[data-live-overview]').click();await page.locator('[data-live-resume]').click();page.once('dialog',d=>d.accept());await page.locator('[data-live-discard-judge]').click();
  await page.locator('[data-live-resume]').click();await expect(page.locator('[name=overall]')).toHaveValue('');expect(c.control.closes).toBe(0);
 }finally{await c.finish()}
});
test('start and close errors, lost replies and double click never advance blindly',async({page})=>{
 const c=await fixture(page);
 try{await c.open();await choose(page);c.control.startMode='reject';await page.locator('[data-live-start]').click();await expect(page.locator('[data-live-start]')).toBeEnabled();await expect(page.locator('[data-live-flow-phase]')).toHaveAttribute('data-live-flow-phase','B');
  c.control.startMode='lost';c.control.delay=200;await page.locator('[data-live-start]').evaluate(button=>{button.click();button.click()});await expect(page.locator('[data-live-judge-form]')).toBeVisible();expect(c.control.starts).toBe(2);
  page.on('dialog',d=>d.accept());c.control.closeMode='reject';await page.locator('[data-live-close-next]').click();await expect(page.locator('[data-live-close-next]')).toBeEnabled();await expect(page.locator('[data-live-flow-phase]')).toHaveAttribute('data-live-flow-phase','C');
  c.control.closeMode='lost';await page.locator('[data-live-close-next]').click();await expect(page.locator('[data-live-next-member]')).toBeVisible();await expect(page.locator('[data-live-camera]')).toHaveCount(0);
  await page.locator('[data-live-next-member]').click();await expect(page.locator('[data-live-flow-phase]')).toHaveAttribute('data-live-flow-phase','A');
 }finally{await c.finish()}
});
test('other admin closes: draft retained read-only; own-car organizer can close',async({page})=>{
 const c=await fixture(page);
 try{await c.open();await choose(page);await start(page);await score(page);
  c.r.db.exec("UPDATE live_entries SET voting_closed=1; UPDATE live_competition_state SET status='idle',current_entry_id=NULL,version=version+1");
  await expect(page.locator('[data-live-judge-form]')).toHaveCount(0,{timeout:10000});await expect(page.locator('[data-live-judge-summary]')).toContainText('Neuložený vlastní koncept');
  await page.locator('[data-live-next-member]').click();
  c.r.db.exec("INSERT INTO cars(id,member_id,model,body) VALUES('own','a','Own BMW','Sedan'); INSERT INTO live_entries(id,event_id,discipline,member_id,car_id,category,presented_at) VALUES('own-entry','e','show_shine','a','own','Sedan',CURRENT_TIMESTAMP); UPDATE live_competition_state SET status='live',current_entry_id='own-entry',version=version+1 WHERE discipline='show_shine'");
  await expect(page.locator('[data-live-flow-phase]')).toHaveAttribute('data-live-flow-phase','C',{timeout:10000});await expect(page.locator('[data-live-judge-form],[data-live-start]')).toHaveCount(0);await expect(page.locator('.admin-live-status--notice')).toContainText('Vlastní auto');
  page.on('dialog',d=>d.accept());await page.locator('[data-live-close-next]').click();await expect(page.locator('[data-live-flow-phase]')).toHaveAttribute('data-live-flow-phase','A');
 }finally{await c.finish()}
});
test('confirmed scores survive partial photo failure; only remaining photo retries',async({page})=>{
 const c=await fixture(page);c.control.photoFailure=true;
 try{await c.open();await choose(page);await start(page);await score(page);await page.locator('[data-live-judge-form] summary').click();
  await page.locator('[name=judgeGallery]').setInputFiles(['one.webp','two.webp'].map(name=>({name,mimeType:'image/webp',buffer:photo})));await page.locator('[data-live-judge-submit]').click();
  await expect(page.locator('[data-live-judge-summary]')).toContainText('Hodnocení potvrzeno');await expect(page.locator('fieldset')).toHaveCount(0);await expect(page.locator('[data-upload-state=error]')).toHaveCount(1);
  await page.getByRole('button',{name:'Odeslat zbývající fotografie'}).click();await expect(page.locator('[data-live-judge-form]')).toHaveCount(0);expect(c.control.saves).toBe(1);expect(c.control.uploads).toBe(3);
 }finally{await c.finish()}
});
test('camera QR joins confirmation and delayed camera permission cannot reopen previous phase',async({page})=>{
 const c=await fixture(page);
 await page.addInitScript(()=>{
  window.qrDetected=false;window.cameraStops=0;
  window.BarcodeDetector=class{async detect(){return window.qrDetected?[{rawValue:'E36U1:123456789012345678901234567890123456789012345678'}]:[]}};
  HTMLMediaElement.prototype.play=async()=>{};
  const stream=()=>{const value=new MediaStream();value.getTracks=()=>[{stop(){window.cameraStops++}}];return value};
  navigator.mediaDevices.getUserMedia=async()=>window.delayCamera?new Promise(resolve=>window.finishCamera=()=>resolve(stream())):stream();
 });
 try{await c.open();await page.locator('[data-live-select-category=Sedan]').click();await page.locator('[data-live-camera]').click();await expect(page.locator('[data-live-camera-box]')).toBeVisible();await page.evaluate(()=>window.qrDetected=true);
  await expect(page.locator('[data-live-flow-phase]')).toHaveAttribute('data-live-flow-phase','B');expect(c.control.starts).toBe(0);await page.locator('[data-live-cancel-selection]').click();
  await page.evaluate(()=>{window.qrDetected=false;window.delayCamera=true});await page.locator('[data-live-camera]').click();await page.locator('[data-live-overview]').click();await page.evaluate(()=>window.finishCamera());
  await expect(page.locator('[data-live-flow-phase]')).toHaveAttribute('data-live-flow-phase','overview');await expect.poll(()=>page.evaluate(()=>window.cameraStops)).toBe(2);
 }finally{await c.finish()}
});
