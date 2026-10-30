import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {prepareE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';
import {commandFixture} from './command-fixture.mjs';
import {arrivalsRuntime,seedArrivals,EVENT} from '../helpers/arrivals-runtime.mjs';
import * as live from '../../worker/domains/live.js';
import {memberRuntime} from '../helpers/admin-member-runtime.mjs';
import * as garage from '../../worker/domains/garage.js';
import {getPlannerDraft,putPlannerDraft,deletePlannerDraft} from '../../worker/domains.js';
import {getCurrentReservation} from '../../worker/domains/reservations/index.js';
import {getPreliminaryReservation} from '../../worker/domains/reservations/preliminary.js';
import {privateMemberGalleryMedia} from '../../worker/domains/member-gallery.js';
import {waitForScreenshotContent} from './screenshot-readiness.mjs';
const photo=readFileSync(new URL('../../assets/images/showshine/ss_sedan.webp',import.meta.url));
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS'};
const incoming=q=>new Request(q.url(),{method:q.method(),headers:q.headers(),...(q.method()==='GET'?{}:{body:q.postDataBuffer()})});

for(const source of ['other-event handoff','other-event local handoff','legacy other-year local handoff','other-event editor','obsolete saved baseline','current editor'])test('restoration respects event and saved baseline '+source,async({page})=>{
 const c=await plannerFixture(page);try{
  const now=Date.now(),other=source.startsWith('other-event')||source.startsWith('legacy other-year'),local=source.includes('local handoff'),draft={version:1,source:'weekend-planner',draftId:crypto.randomUUID(),eventId:source.startsWith('legacy')?null:other?'old':'e',eventYear:other?2025:2026,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+86400000).toISOString(),arrival:'Sobota',departure:'Neděle',nights:1,attendanceType:'saturday_only',crew:5,accommodation:'Bez ubytování',accommodationOptionId:null,accommodationUnits:0,showShine:'Ano'};
  if(!source.includes('handoff'))draft.editor={accountId:'m',mode:'plan',baseKey:source==='obsolete saved baseline'?'old saved state':'["plan","",0]',carId:'c2',note:'Soukromý koncept',crewDetails:[]};
  if(!local){const response=await putPlannerDraft(new Request('https://local.test/api/planner-draft',{method:'PUT',body:JSON.stringify({draft})}),c.r.env,{uid:'m'},'https://local.test');expect(response.status).toBe(200);}
  const before=c.r.db.prepare('SELECT * FROM member_planner_drafts').all();await c.open(local?'&draft='+draft.draftId+'#handoff='+Buffer.from(JSON.stringify(draft)).toString('base64url'):'');const form=page.locator('[data-reservation-form]');
  if(source==='current editor'){await expect(form.locator('[name=note]')).toHaveValue('Soukromý koncept');await expect(form.locator('[name=carId]')).toHaveValue('c2');await expect(form.locator('[name=crew]')).toHaveValue('5')}
  else{await expect(form.locator('[name=note]')).toHaveValue('');await expect(form.locator('[name=crew]')).not.toHaveValue('5');await expect(page.locator('[data-member-plan-open]')).toContainText('Vyplnit předběžnou registraci')}
  expect(c.r.db.prepare('SELECT * FROM member_planner_drafts').all()).toEqual(before);expect(c.r.db.prepare('SELECT COUNT(*) n FROM preliminary_reservations').get().n).toBe(0);expect(c.r.db.prepare('SELECT COUNT(*) n FROM reservations').get().n).toBe(0);expectNoUnexpectedClientErrors(c.observations);
 }finally{await page.close();c.r.db.close()}
});

for(const outcome of ['ok','failed','lost'])test('selected competition photograph is confirmed before start and propagates to another client '+outcome,async({page,browser},info)=>{
 // WebKit's intercepted multipart body omits file bytes. Serialize that SAME
 // browser-prepared request as bytes for the route bridge, never substitute a
 // success response or a different image. Both engines use the identical bridge.
 await page.addInitScript(()=>{const original=window.fetch;window.fetch=async(input,init)=>{if(String(input).endsWith('/live/cars/car-paid/media')&&init?.body instanceof FormData){const file=init.body.get('file');window.__competitionUploadProof={fileBytes:file?.size,type:file?.type};const request=new Request(input,init),body=await request.arrayBuffer();return original(input,{...init,headers:request.headers,body})}return original(input,init)}});
 const r=arrivalsRuntime();await seedArrivals(r);r.db.exec('UPDATE events SET is_current=0');r.db.prepare('UPDATE events SET live_enabled=1,is_current=1 WHERE id=?').run(EVENT);
 const c=await commandFixture(page,{runtime:r}),objects=new Map(),seen=[],uploadReady=Promise.withResolvers(),release=Promise.withResolvers();let hold=true,attempts=0;const uploadIds=[];
 r.env.MEDIA.put=async(key,bytes)=>objects.set(key,Buffer.from(await new Response(bytes).arrayBuffer()));r.env.MEDIA.delete=async key=>objects.delete(key);r.env.MEDIA.get=async key=>objects.has(key)?{body:objects.get(key),writeHttpMetadata:h=>h.set('Content-Type','image/jpeg')}:null;
 const routeFor=async(target,admin)=>target.route('https://api.e36united.cz/api/**',async route=>{
  const q=route.request(),u=new URL(q.url()),p=u.pathname;if(!p.includes('/live'))return route.fallback();if(q.method()==='OPTIONS')return route.fulfill({status:204,headers});
  let result;
  if(p==='/api/admin/live')result=await live.getAdminLive(r.env,u,u.origin);
  else if(p==='/api/live')result=await live.getMemberLive(r.env,{uid:admin?'a':'n'},u.origin);
  else if(p==='/api/live/state')result=await live.getLiveState(r.env,{uid:admin?'a':'n'},u,u.origin);
  else if(p.endsWith('/members'))result=await live.searchLiveMembers(r.env,EVENT,u,u.origin);
  else if(p.endsWith('/start')){seen.push('start');result=await live.startLiveEntry(incoming(q),r.env,{uid:'a'},EVENT,u.origin)}
  else if(p.endsWith('/cars/car-paid/media')&&q.method()==='POST'){
   seen.push('upload');attempts++;uploadIds.push((await incoming(q).formData()).get('uploadId'));if(hold){uploadReady.resolve();await release.promise;hold=false}if(outcome==='failed'&&attempts===1)return route.fulfill({headers,status:503,json:{error:'synthetic_upload_failure'}});result=await live.saveCompetitionPhoto(incoming(q),r.env,{uid:'a'},EVENT,'car-paid',u.origin);if(outcome==='lost'&&attempts===1)return route.abort('failed');
  }else if(/\/cars\/[^/]+\/media$/.test(p)){const carId=p.split('/').at(-2);if(carId!=='car-paid')return route.fulfill({headers,contentType:'image/webp',body:photo});result=await live.competitionCarMedia(r.env,EVENT,carId,u.origin);}
  else if(/\/entries\/[^/]+\/media$/.test(p))result=await live.liveEntryMedia(r.env,{uid:'n'},p.split('/').at(-2),u.origin);
  else return route.fulfill({status:501,headers,json:{error:'unhandled_continuity',path:p}});
  return route.fulfill({status:result.status,headers,body:Buffer.from(await result.arrayBuffer())});
 });
 await routeFor(page,true);let viewer;
 try{
  await page.goto('/admin.html?section=live&event='+EVENT);await page.locator('[data-admin-live-entry-confirm]').click();await page.locator('[data-live-discipline=show_shine]').click();await page.locator('[data-live-select-category=Sedan]').click();await page.locator('[data-live-choose-member]').click();await page.locator('[data-live-select-member="car:car-paid"]').click();
  await page.locator('[data-live-car-file][capture]').setInputFiles({name:'competition.webp',mimeType:'image/webp',buffer:photo});
  await page.locator('[data-live-start]').click();
  // This fails before the fix: start goes straight to the handler, without upload.
  await expect.poll(()=>seen[0]).toBe('upload');await uploadReady.promise;expect(seen).toEqual(['upload']);expect(r.db.prepare('SELECT COUNT(*) n FROM live_entries').get().n).toBe(0);
  const proof=await page.evaluate(()=>window.__competitionUploadProof);expect(proof.fileBytes).toBeGreaterThan(0);expect(proof.type).toBe('image/jpeg');await info.attach('browser-upload-before-route-bridge',{body:JSON.stringify(proof),contentType:'application/json'});
  release.resolve();if(outcome!=='ok'){await expect(page.locator('[data-live-car-previews] [data-upload-state=error]')).toBeVisible();expect(seen).toEqual(['upload']);expect(r.db.prepare('SELECT COUNT(*) n FROM live_entries').get().n).toBe(0);await page.locator('[data-live-start]').click();}await expect(page.locator('[data-live-judge-form]')).toBeVisible();expect(seen).toEqual(outcome==='ok'?['upload','start']:['upload','upload','start']);if(outcome!=='ok')expect(uploadIds[1]).toBe(uploadIds[0]);expect(r.db.prepare('SELECT COUNT(*) n FROM live_car_photos').get().n).toBe(1);
  const viewerContext=await browser.newContext({baseURL:'http://127.0.0.1:4173'});viewer=await viewerContext.newPage();await prepareE2ePage(viewer,{authenticated:true});await routeFor(viewer,false);await viewer.goto('/member.html?section=live');await viewer.locator('[data-live-entry-confirm]').click();await viewer.locator('[data-live-tab=showshine]').click();await expect(viewer.locator('.live-rating-media img')).toBeVisible();const first=await viewer.locator('.live-rating-media img').getAttribute('src');
  // Replace via the real handler; the second client's existing LIVE poll must notice.
  const data=new FormData();data.set('file',new File([photo],'replacement.webp',{type:'image/webp'}));data.set('uploadId',crypto.randomUUID());const response=await live.saveCompetitionPhoto(new Request('https://api.e36united.cz/api/local',{method:'POST',body:data}),r.env,{uid:'a'},EVENT,'car-paid','https://e36united.cz');expect(response.status).toBe(201);
  await expect(viewer.locator('.live-rating-media img')).not.toHaveAttribute('src',first);await expect(viewer.locator('.live-rating-media img')).toBeVisible();
  await viewer.screenshot({path:info.outputPath('competition-photo-second-client.png')});expect(c.observations.pageErrors).toEqual([]);expect(c.observations.unhandledApi).toEqual([]);
  const expectedLostUrl=`https://api.e36united.cz/api/admin/events/${EVENT}/live/cars/car-paid/media`;
  const expectedFirefoxAbort=error=>outcome==='lost'&&error.url===''&&error.text.includes(expectedLostUrl+'. (Reason: CORS request did not succeed). Status code: (null).')&&error.text.startsWith('[JavaScript Error: "Cross-Origin Request Blocked: The Same Origin Policy disallows reading the remote resource at ');
  // Firefox reports the explicitly aborted POST as a CORS network error with
  // an empty location; accept only that exact injected endpoint and lost branch.
  expect(c.observations.consoleErrors.filter(error=>!expectedFirefoxAbort(error)&&!((outcome==='failed'?/503/:outcome==='lost'?/ERR_FAILED/:/never-allowed/).test(error.text)&&error.url.endsWith('/cars/car-paid/media')))).toEqual([]);
 }finally{release.resolve();await viewer?.context().close();await page.close();r.db.close()}
});

async function plannerFixture(page,{empty=false}={}){
 const observations=await prepareE2ePage(page,{authenticated:true,member:{id:'m'},registrationOpen:false,preliminaryEnabled:true,cars:[]}),r=memberRuntime();
 r.db.exec("DELETE FROM reservations;INSERT INTO event_preliminary_settings(event_id,enabled,write_token) VALUES('e',1,'local');UPDATE cars SET body='Cabrio' WHERE id='c';");if(empty)r.db.exec("DELETE FROM car_photos WHERE car_id IN ('c','c2');DELETE FROM cars WHERE member_id='m'");
 let failRefresh=false,draftResponse=null;const calls=[];
 await page.route('https://api.e36united.cz/api/**',async route=>{
  const q=route.request(),u=new URL(q.url()),p=u.pathname,method=q.method();if(!['/api/cars','/api/planner-draft','/api/reservations/current','/api/preliminary-reservations/current'].includes(p)&&!p.startsWith('/api/cars/'))return route.fallback();
  if(method==='OPTIONS')return route.fulfill({status:204,headers});calls.push(method+' '+p);let response;
  if(p==='/api/cars'&&method==='GET'){if(failRefresh)return route.fulfill({status:503,headers,json:{error:'synthetic_refresh_failure'}});response=await garage.listCars(r.env,{uid:'m'},u.origin);}
  else if(p==='/api/cars'&&method==='POST')response=await garage.createCar(incoming(q),r.env,{uid:'m'},u.origin);
  else if(p.startsWith('/api/cars/media/'))return route.fulfill({headers,contentType:'image/webp',body:photo});
  else if(p.startsWith('/api/cars/')&&method==='PUT')response=await garage.updateCar(incoming(q),r.env,{uid:'m'},p.split('/').at(-1),u.origin);
  else if(p==='/api/planner-draft')response=method==='GET'?await getPlannerDraft(r.env,{uid:'m'},u.origin):method==='DELETE'?await deletePlannerDraft(r.env,{uid:'m'},u,u.origin):await putPlannerDraft(incoming(q),r.env,{uid:'m'},u.origin);
  else if(p==='/api/reservations/current'&&method==='GET')response=await getCurrentReservation(r.env,{uid:'m'},u.origin);
  else if(p==='/api/preliminary-reservations/current'&&method==='GET')response=await getPreliminaryReservation(r.env,{uid:'m'},u.origin);
  else return route.fulfill({headers,status:501,json:{error:'unhandled_planner_continuity',path:p,method}});
  const body=await response.text();if(p==='/api/planner-draft'&&method==='PUT'&&draftResponse)await draftResponse(q.postDataJSON().draft);return route.fulfill({headers,status:response.status,body});
 });
 const open=async(suffix='')=>{await page.goto('/member.html?section=reservation'+suffix);await expect(page.locator('[data-app-view]')).toBeVisible();const intro=page.locator('[data-onboarding-intro-modal]');if(await intro.isVisible())await intro.locator('[data-onboarding-intro-close]').last().click();await page.locator('[data-member-plan-open]').click();await expect(page.locator('[data-member-planner-modal]')).toBeVisible()};
 return {r,observations,calls,open,failNextRefresh:()=>{failRefresh=true},restoreReads:()=>{failRefresh=false},holdDraftResponse:callback=>{draftResponse=callback}};
}

// Hold only the garage's initial-focus callback, not the page's animation frames.
// The same regression also covers synchronous focus (there is then nothing queued).
async function holdGarageInitialFocus(page){
 await page.addInitScript(()=>{
  const raf=window.requestAnimationFrame.bind(window),held=[];
  window.__garageInitialFocus={captured:0,release(){const callbacks=held.splice(0);for(const callback of callbacks)callback(performance.now());return callbacks.length}};
  window.requestAnimationFrame=callback=>{
   if(/carForm\.elements\.nickname\?\.focus\(\)/.test(Function.prototype.toString.call(callback))){window.__garageInitialFocus.captured++;held.push(callback);return 0}
   return raf(callback);
  };
 });
}

for(const state of ['another field','closed','reopened'])test('garage initial focus cannot take over '+state,async({page},info)=>{
 await holdGarageInitialFocus(page);const c=await plannerFixture(page,{empty:true});try{
  await page.setViewportSize({width:390,height:844});await c.open();const planner=page.locator('[data-member-planner-modal]'),car=page.locator('[data-car-modal]');
  await planner.locator('[data-member-planner-add-car]').click();
  if(state!=='another field'){
   await car.getByRole('button',{name:'Zavřít formulář auta',exact:true}).click();await expect(car).toBeHidden();
   if(state==='reopened')await planner.locator('[data-member-planner-add-car]').click();
  }
  const field=state==='closed'?planner.locator('[name=note]'):car.locator('[name=model]');
  if(state!=='closed')await car.locator('[name=nickname]').fill('Nová E36');
  await field.fill('328i');await field.evaluate(node=>node.setSelectionRange(2,2));
  const released=await page.evaluate(()=>({released:window.__garageInitialFocus.release(),captured:window.__garageInitialFocus.captured}));
  await info.attach('held-garage-focus',{body:JSON.stringify(released),contentType:'application/json'});
  await expect(field).toBeFocused();await expect(field).toHaveValue('328i');expect(await field.evaluate(node=>[node.selectionStart,node.selectionEnd])).toEqual([2,2]);
  await page.keyboard.insertText('X');await expect(field).toHaveValue('32X8i');
  if(state==='closed')await expect(car).toBeHidden();else await expect(car.locator('[name=nickname]')).toHaveValue('Nová E36');
  await page.screenshot({path:info.outputPath('garage-focus-'+state.replace(' ','-')+'.png')});expectNoUnexpectedClientErrors(c.observations);
 }finally{await page.close();c.r.db.close()}
});

test('garage initial focus is available for creating and editing a car',async({page},info)=>{
 const c=await plannerFixture(page);try{
  await c.open();const planner=page.locator('[data-member-planner-modal]'),car=page.locator('[data-car-modal]');
  await planner.locator('[data-member-planner-add-car]').click();await expect(car.locator('[name=nickname]')).toBeFocused();
  await page.keyboard.type('Nová E36');await car.locator('[name=model]').fill('328i');await expect(car.locator('[name=nickname]')).toHaveValue('Nová E36');await expect(car.locator('[name=model]')).toHaveValue('328i');
  await car.getByRole('button',{name:'Zavřít formulář auta',exact:true}).click();await planner.getByRole('button',{name:'Zavřít Planner',exact:true}).click();await page.locator('.member-sidebar [data-member-section=garage]').click();
  const before=c.r.db.prepare("SELECT * FROM cars WHERE id='c'").get();await page.locator('[data-edit-car="c"]').click();await expect(car.locator('[name=nickname]')).toBeFocused();await expect(car.locator('[name=nickname]')).toHaveValue(before.nickname);await expect(car.locator('[name=model]')).toHaveValue(before.model);await expect(car).toHaveAttribute('data-car-id','c');
  await page.screenshot({path:info.outputPath('garage-edit-focus.png')});await car.getByRole('button',{name:'Zavřít formulář auta',exact:true}).click();expect(c.r.db.prepare("SELECT * FROM cars WHERE id='c'").get()).toEqual(before);expect(c.calls.some(value=>value.startsWith('POST /api/cars')||value.startsWith('PUT /api/cars/'))).toBe(false);expectNoUnexpectedClientErrors(c.observations);
 }finally{await page.close();c.r.db.close()}
});

for(const empty of [true,false])test('Planner keeps confirmed new car and draft through refresh '+(empty?'empty garage':'existing primary'),async({page},info)=>{
 const c=await plannerFixture(page,{empty});try{
  await c.open();const modal=page.locator('[data-member-planner-modal]');await modal.locator('[data-member-stay="2"]').click();await modal.locator('[name=note]').fill('Rozpracované údaje zůstávají');await modal.locator('[data-member-crew-plus]').click();
  await modal.locator('[data-member-planner-add-car]').click();const car=page.locator('[data-car-modal]');await expect(car.locator('[name=primary]')).toBeChecked({checked:empty});await car.locator('[name=nickname]').fill('Nová E36');await car.locator('[name=model]').fill('328i');c.failNextRefresh();await car.locator('button[type=submit]').click();
  await expect(page.locator('.member-toast')).toContainText('Uložení se nepodařilo dokončit');const id=c.r.db.prepare("SELECT id FROM cars WHERE nickname='Nová E36'").get().id;
  c.restoreReads();await car.locator('button[type=submit]').click();await expect(car).toBeHidden();await expect(modal.locator('[name=carId]')).toHaveValue(id);await expect(modal.locator('[name=note]')).toHaveValue('Rozpracované údaje zůstávají');await expect(modal.locator('[data-planner-draft-status]')).toContainText('Rozpracovaný plán uložen');
  expect(c.calls.filter(value=>value==='POST /api/cars')).toHaveLength(1);expect(c.r.db.prepare("SELECT is_primary FROM cars WHERE id=?").get(empty?id:'c').is_primary).toBe(1);expect(c.r.db.prepare('SELECT COUNT(*) n FROM reservations').get().n).toBe(0);expect(c.r.db.prepare('SELECT COUNT(*) n FROM preliminary_reservations').get().n).toBe(0);
  await modal.getByRole('button',{name:'Zavřít Planner',exact:true}).click();await expect(page.locator('[data-member-plan-open]')).toContainText('Dokončit předběžnou registraci');await c.open();await expect(modal.locator('[name=carId]')).toHaveValue(id);await expect(modal.locator('[name=note]')).toHaveValue('Rozpracované údaje zůstávají');await page.screenshot({path:info.outputPath('planner-restored.png')});
  expect(c.observations.pageErrors).toEqual([]);expect(c.observations.unhandledApi).toEqual([]);expect(c.observations.consoleErrors.filter(error=>!/Failed to load resource/.test(error.text)||!error.url.endsWith('/api/cars'))).toEqual([]);
 }finally{await page.close();c.r.db.close()}
});

for(const empty of [true,false])test('Garage defaults primary from the current car list '+(empty?'first car':'additional car'),async({page})=>{
 const c=await plannerFixture(page,{empty});try{
  await c.open();await page.locator('[data-member-planner-modal]').getByRole('button',{name:'Zavřít Planner',exact:true}).click();await page.locator('.member-sidebar [data-member-section=garage]').click();
  const before=c.r.db.prepare("SELECT count(*) n FROM cars WHERE member_id='m'").get().n;
  await page.locator('[data-open-car]').click();const modal=page.locator('[data-car-modal]');await expect(modal.locator('[name=primary]')).toBeChecked({checked:empty});await modal.locator('[name=nickname]').fill('Garage E36');await modal.locator('[name=model]').fill('328i');await modal.locator('[type=submit]').click();await expect(modal).toBeHidden();
  expect(c.r.db.prepare("SELECT count(*) n FROM cars WHERE member_id='m'").get().n).toBe(before+1);expect(c.r.db.prepare("SELECT is_primary FROM cars WHERE nickname='Garage E36'").get().is_primary).toBe(empty?1:0);if(!empty)expect(c.r.db.prepare("SELECT is_primary FROM cars WHERE id='c'").get().is_primary).toBe(1);expectNoUnexpectedClientErrors(c.observations);
 }finally{await page.close();c.r.db.close()}
});

test('account modes preserve Planner return',async({page})=>{
 const o=await prepareE2ePage(page);await page.goto('/member.html?draft=11111111-1111-4111-8111-111111111111&returnTo=%2Findex.html%23planner');await expect(page.locator('[data-auth-form=register]')).toBeVisible();await page.locator('[data-auth-switch=login]').click();await expect(page.locator('[data-auth-form=login]')).toBeVisible();expect(new URL(page.url()).searchParams.get('draft')).toBe('11111111-1111-4111-8111-111111111111');await page.reload();await expect(page.locator('[data-auth-form=login]')).toBeVisible();expectNoUnexpectedClientErrors(o);
});

test('serialized autosave cannot restore an abandoned Planner or overwrite newer typing',async({page})=>{
 const c=await plannerFixture(page,{empty:true}),ready=Promise.withResolvers(),release=Promise.withResolvers();let held=false;
 try{await c.open();c.holdDraftResponse(async draft=>{if(draft.editor.note==='První koncept'&&!held){held=true;ready.resolve();await release.promise}});const modal=page.locator('[data-member-planner-modal]');await modal.locator('[data-member-stay="2"]').click();await modal.locator('[name=note]').fill('První koncept');await ready.promise;
  await modal.locator('[name=note]').fill('Novější koncept');await modal.getByRole('button',{name:'Zavřít Planner',exact:true}).click();await page.locator('.member-sidebar [data-member-section=garage]').click();release.resolve();await expect.poll(()=>JSON.parse(c.r.db.prepare('SELECT payload_json FROM member_planner_drafts').get().payload_json).editor.note).toBe('Novější koncept');await expect(modal).toBeHidden();await expect(page.locator('[data-member-panel=garage]')).toBeVisible();expect(c.r.db.prepare('SELECT COUNT(*) n FROM preliminary_reservations').get().n).toBe(0);expect(c.r.db.prepare('SELECT COUNT(*) n FROM event_payments').get().n).toBe(0);expectNoUnexpectedClientErrors(c.observations);
 }finally{release.resolve();await page.close();c.r.db.close()}
});
test('onboarding fits short visual viewport and mobile logout remains available',async({page},info)=>{
 const c=await plannerFixture(page,{empty:true});try{
  await page.setViewportSize({width:390,height:420});await page.goto('/member.html');const dialog=page.locator('[data-onboarding-intro-modal] [role=dialog]');await expect(dialog).toBeVisible();const box=await dialog.boundingBox();expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(420);await dialog.locator('.united-onboarding-club li').last().scrollIntoViewIfNeeded();await expect(dialog.locator('.united-onboarding-club li').last()).toBeInViewport();await page.screenshot({path:info.outputPath('onboarding-short.png')});await dialog.getByRole('button',{name:'Zavřít úvod'}).click();
  // A browser that has just used an account returns to login after logout.
  await page.locator('.member-bottom-nav [data-mobile-menu]').click();await page.locator('.united-mobile-menu [data-menu-logout]').click();await expect(page.locator('[data-auth-form=login]')).toBeVisible();await expect(page.locator('[data-auth-form=register]')).toBeHidden();
 }finally{await page.close();c.r.db.close()}
});

for(const theme of ['light','dark'])test('onboarding primary action fits iPhone reading area '+theme,async({page},info)=>{
 const c=await plannerFixture(page,{empty:true});try{
  await page.addInitScript(theme=>localStorage.setItem('e36UnitedAppearance',theme),theme);await page.setViewportSize({width:390,height:724});await page.goto('/member.html');const dialog=page.locator('[data-onboarding-intro-modal] [role=dialog]');await expect(dialog).toBeVisible();await expect(dialog.locator('[data-onboarding-reservation] strong')).toHaveText('Registruj se na sraz!');await expect(dialog.locator('[data-onboarding-reservation-state]')).toHaveText('Připravit plán →');await expect(dialog.locator('[data-onboarding-reservation]')).toBeInViewport();await expect(dialog.getByRole('button',{name:'Zavřít úvod'})).toBeInViewport();await expect(dialog.locator('h2 em')).toHaveCSS('-webkit-text-stroke-width','0px');await page.screenshot({path:info.outputPath('onboarding-initial-'+theme+'.png')});expect(c.r.db.prepare('SELECT count(*) n FROM reservations').get().n).toBe(0);expectNoUnexpectedClientErrors(c.observations);
 }finally{await page.close();c.r.db.close()}
});

for(const [width,height,theme] of [[360,800,'light'],[390,844,'dark'],[820,980,'light'],[1440,900,'light'],[1440,900,'dark'],[844,390,'dark']])test(`registration and LIVE visual ${width} ${height} ${theme}`,async({page},info)=>{
 const c=await plannerFixture(page);try{
  await page.setViewportSize({width,height});await page.addInitScript(theme=>localStorage.setItem('e36UnitedAppearance',theme),theme);await c.open();await page.locator('[data-member-planner-modal]').getByRole('button',{name:'Zavřít Planner',exact:true}).click();
  await waitForScreenshotContent(page,{label:'registration-entry'});await page.screenshot({path:info.outputPath('registration-entry.png')});
  c.r.db.exec("UPDATE events SET live_enabled=1 WHERE id='e';INSERT INTO live_competition_state(event_id,discipline,status,version) VALUES('e','show_shine','live',1);INSERT INTO live_category_state(event_id,discipline,category,status) VALUES('e','show_shine','Sedan','live'),('e','show_shine','Cabrio','closed');INSERT INTO gallery_submissions(id,member_id,event_id,r2_key,caption,status) VALUES('own-wait','m','e','local-photo-wait','','pending'),('own-yes','m','e','local-photo-yes','Dlouhý popisek k fotografii auta na United','approved'),('own-no','m','e','local-photo-no','','rejected');");
  c.r.env.MEDIA.get=async()=>({body:photo,httpMetadata:{contentType:'image/webp'},writeHttpMetadata:h=>h.set('Content-Type','image/webp')});
  await page.route('https://api.e36united.cz/api/**',async route=>{const q=route.request(),u=new URL(q.url()),p=u.pathname;if(q.method()!=='GET')return route.fallback();let response;if(p==='/api/live')response=await live.getMemberLive(c.r.env,{uid:'m'},u.origin);else if(p==='/api/live/state')response=await live.getLiveState(c.r.env,{uid:'m'},u,u.origin);else if(p.startsWith('/api/gallery/mine/media/'))response=await privateMemberGalleryMedia(c.r.env,{uid:'m'},p.split('/').at(-1),u.origin);else if(p==='/api/gallery/media/own-yes')return route.fulfill({headers,contentType:'image/webp',body:photo});else return route.fallback();return route.fulfill({headers,status:response.status,body:Buffer.from(await response.arrayBuffer())})});
  await page.goto('/member.html?section=live');await page.locator('[data-live-entry-confirm]').click();await page.locator('[data-live-tab=showshine]').click();const closed=page.locator('[data-live-vote-category=Cabrio]');await closed.locator('summary').click();await expect(closed).toHaveAttribute('open','');await expect(page.locator('[data-live-vote-category]')).toHaveCount(2);await expect(page.locator('.live-rating-card')).toHaveCount(0);await expect(page.locator('[data-live-showshine]')).toContainText('Čekáme na další auto');
  await page.screenshot({path:info.outputPath('vote-categories.png')});await page.locator('[data-live-tab=photos]').click();await expect(page.locator('.live-own-photo-card')).toHaveCount(3);await waitForScreenshotContent(page,{label:'own-photographs'});await page.screenshot({path:info.outputPath('photo-cards.png')});
  if(width===390){await page.evaluate(()=>document.documentElement.style.fontSize='20px');await page.screenshot({path:info.outputPath('photo-cards-large-text.png')});}
  const overflow=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,nodes:[...document.querySelectorAll('body *')].filter(node=>node.checkVisibility()&&node.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(node=>({tag:node.tagName,classes:node.className,width:node.getBoundingClientRect().width,right:node.getBoundingClientRect().right,parent:node.parentElement?.className}))}));await info.attach('layout-geometry',{body:JSON.stringify(overflow,null,2),contentType:'application/json'});expect(overflow.scrollWidth,JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.width+1);expectNoUnexpectedClientErrors(c.observations);
 }finally{await page.close();c.r.db.close()}
});
