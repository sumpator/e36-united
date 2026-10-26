import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {commandFixture} from './command-fixture.mjs';
import {expectNoUnexpectedClientErrors} from './fixtures.mjs';
import {waitForScreenshotContent} from './screenshot-readiness.mjs';
import {arrivalsRuntime,seedArrivals,EVENT} from '../helpers/arrivals-runtime.mjs';
import {routeArrivals} from '../../worker/domains/arrivals.js';
import {getAdminLive,getMemberLive,getLiveState,searchLiveMembers} from '../../worker/domains/live.js';

const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, OPTIONS'};
const photo=readFileSync(new URL('../../assets/images/showshine/ss_sedan.webp',import.meta.url));
const cases=[
 {mode:'shine',width:390,root:'[data-admin-live-body]',form:'[data-live-member-search]',results:'[data-live-search-results]',rows:'[data-live-member-results]',pick:'data-live-select-member',more:'[data-live-more-members]',key:'car:search-car-00'},
 {mode:'live-arrivals',width:820,root:'[data-admin-live-body]',form:'[data-gate-lookup]',results:'[data-gate-search-results]',rows:'[data-gate-member-results]',pick:'data-gate-pick',more:'[data-gate-search-more]',key:'member:search-00'},
 {mode:'admin-arrivals',width:1440,root:'[data-admin-panel=arrivals]',form:'[data-gate-lookup]',results:'[data-gate-search-results]',rows:'[data-gate-member-results]',pick:'data-gate-pick',more:'[data-gate-search-more]',key:'member:search-00'},
];

async function setup(page,config){
 await page.route('https://**/*',route=>route.abort());
 const r=arrivalsRuntime();await seedArrivals(r);const c=await commandFixture(page,{runtime:r});
 r.db.prepare('UPDATE events SET live_enabled=1 WHERE id=?').run(EVENT);
 for(let n=0;n<64;n++){
  const id=String(n).padStart(2,'0');
  r.db.prepare('INSERT INTO members(id,member_code,email,name,nickname) VALUES(?,?,?,?,?)').run('search-'+id,'SEARCH-'+id,`search${id}@example.invalid`,'Search Person '+id,'Find '+id);
  r.db.prepare("INSERT INTO cars(id,member_id,model,body) VALUES(?,?,'BMW Search','Sedan')").run('search-car-'+id,'search-'+id);
 }
 r.db.exec("INSERT INTO car_photos(id,car_id,r2_key,mime_type) VALUES('search-photo','search-car-00','isolated-search-photo','image/webp')");
 r.db.prepare("INSERT INTO live_competition_cars(id,event_id,participant_name,model,body,created_by) VALUES('search-guest',?,'Search Guest','BMW Guest','Sedan','a')").run(EVENT);
 const searches=[],holds=new Map(),failures=new Set();let fail=false;
 await page.route('https://api.e36united.cz/api/**',async route=>{
  const q=route.request(),url=new URL(q.url()),p=url.pathname;
  if(!p.includes('/live')&&!p.includes('/arrivals'))return route.fallback();
  if(q.method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(p.endsWith('/media'))return route.fulfill({headers,contentType:'image/webp',body:photo});
  const searching=p.endsWith('/search')||p.endsWith('/members');
  const entry={q:url.searchParams.get('q')||'',offset:Number(url.searchParams.get('offset')||0),path:p+url.search};
  if(searching){searches.push(entry);if(fail){failures.add(q.url());return route.fulfill({status:400,headers,json:{message:'Řízená chyba hledání'}})}}
  const request=new Request(q.url(),{method:q.method(),headers:q.headers()});let response;
  if(p.includes('/arrivals'))response=await routeArrivals({request,url,env:r.env,auth:{uid:'a'},origin:url.origin});
  else if(p==='/api/admin/live')response=await getAdminLive(r.env,url,url.origin);
  else if(p==='/api/live')response=await getMemberLive(r.env,{uid:'a'},url.origin);
  else if(p==='/api/live/state')response=await getLiveState(r.env,{uid:'a'},url,url.origin);
  else if(searching)response=await searchLiveMembers(r.env,url.pathname.split('/')[4],url,url.origin);
  else {c.observations.unhandledApi.push(q.method()+' '+q.url());return route.fulfill({status:404,headers,json:{error:'isolated_unhandled'}})}
  const body=await response.text(),hold=searching&&holds.get(entry.q+'|'+entry.offset);
  if(hold){hold.path=entry.path;hold.received.resolve();await hold.release.promise;holds.delete(entry.q+'|'+entry.offset)}
  await route.fulfill({status:response.status,headers,body});
 });
 await page.setViewportSize({width:config.width,height:900});
 await page.goto('/admin.html?section='+(config.mode==='admin-arrivals'?'arrivals':'live')+'&event='+EVENT);
 if(config.mode!=='admin-arrivals'){
  await page.locator('[data-admin-live-entry-confirm]').click();
  if(config.mode==='shine'){await page.locator('[data-live-discipline=show_shine]').click();await page.locator('[data-live-select-category=Sedan]').click();await page.locator('[data-live-choose-member]').click()}
  else await page.locator('[data-admin-live-tab=arrivals]').click();
 }
 const root=page.locator(config.root);
 if(config.mode!=='shine')await root.locator('[data-gate-find]').click();
 const input=root.locator(config.form+' input[name=q]'),results=root.locator(config.results),rows=root.locator(config.rows);
 await expect(input).toBeVisible();await expect(results).toHaveAttribute('aria-busy','false');await expect(root.locator('['+config.pick+'="'+config.key+'"]')).toBeVisible();
 await expect(page.locator('[data-loading]')).toBeHidden();
 await page.clock.install({time:new Date('2026-10-12T10:00:00Z')});await page.clock.pauseAt(new Date('2026-10-12T10:00:01Z'));
 searches.length=0;
 return {...c,root,input,results,rows,searches,
  hold(q,offset=0){const h={received:Promise.withResolvers(),release:Promise.withResolvers()};holds.set(q+'|'+offset,h);return h},
  set fail(value){fail=value},
  async observe(h){await h.received.promise;await page.evaluate(path=>{window.__searchDelivery=import('/admin/api.js?v=20260930-arrivals2').then(async({apiRequest})=>{window.__searchAwaiting=true;try{await apiRequest(path);return null}catch(error){return {name:error.name,stale:error.stale}}})},h.path);await expect.poll(()=>page.evaluate(()=>window.__searchAwaiting)).toBe(true)},
  async deliver(h){h.release.resolve();const value=await page.evaluate(()=>window.__searchDelivery);await page.evaluate(()=>window.__searchAwaiting=false);return value},
  async finish(){
   for(const h of holds.values())h.release.resolve();
   expectNoUnexpectedClientErrors({...c.observations,consoleErrors:c.observations.consoleErrors.filter(e=>!(failures.has(e.url)&&/^Failed to load resource:.*400/.test(e.text)))});
   expect(c.writes).toEqual([]);expect(r.db.prepare('SELECT COUNT(*) n FROM event_arrivals').get().n).toBe(0);expect(r.db.prepare('SELECT COUNT(*) n FROM live_entries').get().n).toBe(0);
   await page.close();r.db.close();
  },
 };
}

async function searchScroll(input){
 return input.evaluate(element=>{
  const root=document.scrollingElement,rect=element.getBoundingClientRect();
  return {y:scrollY,height:root.scrollHeight,viewport:root.clientHeight,max:Math.max(0,root.scrollHeight-root.clientHeight),inputTop:rect.top,inputBottom:rect.bottom,documentTop:rect.top+scrollY};
 });
}

async function expectRetainedSearchScroll(input,before){
 const after=await searchScroll(input);
 // Replacing a long list can make the old scroll offset physically unreachable.
 // When it remains reachable this is still an exact, unchanged-offset assertion.
 expect(after.y).toBe(Math.min(before.y,after.max));expect(after.documentTop).toBe(before.documentTop);
 await expect(input).toBeInViewport({ratio:1});return after;
}

for(const config of cases){
 test(`participant search ${config.mode}: debounce, email, manual, clear and retained input`,async({page},info)=>{
  const c=await setup(page,config);
  try{
   await c.input.focus();await c.input.evaluate(input=>{window.__originalSearchInput=input});
   await c.input.fill('sea');await page.clock.runFor(150);await c.input.fill('search0');await page.clock.runFor(150);await c.input.fill('search00@example.invalid');
   await c.input.evaluate(input=>input.setSelectionRange(6,6));const before=await searchScroll(c.input);
   await page.clock.runFor(299);expect(c.searches).toHaveLength(0);await page.clock.runFor(1);
   await expect(c.results).toHaveAttribute('aria-busy','false');await expect(c.rows.locator('['+config.pick+']')).toHaveCount(1);
   expect(c.searches.map(x=>x.q)).toEqual(['search00@example.invalid']);await expect(c.input).toBeFocused();
   await expect(c.rows.locator('img')).toHaveCount(1);await expect.poll(()=>c.rows.locator('img').evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
   expect(await c.input.evaluate(input=>({same:input===window.__originalSearchInput,start:input.selectionStart,end:input.selectionEnd}))).toEqual({same:true,start:6,end:6});await expectRetainedSearchScroll(c.input,before);
   await c.input.dispatchEvent('input');await page.clock.runFor(300);expect(c.searches).toHaveLength(1);
   await c.input.fill('search01@example.invalid');await c.input.press('Enter');await expect(c.rows).toContainText('Find 01');await page.clock.runFor(300);expect(c.searches).toHaveLength(2);
   await c.input.fill('search02@example.invalid');await c.root.locator(config.form+' button').click();await expect(c.rows).toContainText('Find 02');await page.clock.runFor(300);expect(c.searches).toHaveLength(3);
   await c.root.locator(config.form+' button').click();await expect.poll(()=>c.searches.length).toBe(4);await expect(c.results).toHaveAttribute('aria-busy','false');
   await c.input.fill('');await page.clock.runFor(300);await expect(c.rows.locator('['+config.pick+']')).not.toHaveCount(1);expect(c.searches.at(-1)).toMatchObject({q:'',offset:0});
   for(const theme of ['light','dark']){
    await page.evaluate(theme=>{const input=document.querySelector('[data-appearance-select]');input.value=theme;input.dispatchEvent(new Event('change',{bubbles:true}))},theme);
    await waitForScreenshotContent(page,{label:config.mode+'-'+theme});await page.screenshot({path:info.outputPath(config.mode+'-'+theme+'.png')});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   }
  }finally{await c.finish()}
 });

 test(`participant search ${config.mode}: stale reply, selection and leaving`,async({page})=>{
  const c=await setup(page,config);
  try{
   const initial=await c.rows.locator('['+config.pick+']').evaluateAll(nodes=>nodes.map(n=>n.getAttribute(n.hasAttribute('data-gate-pick')?'data-gate-pick':'data-live-select-member')));
   const old=c.hold('search01@example.invalid');await c.input.fill('search01@example.invalid');await page.clock.runFor(300);await c.observe(old);
   await expect(c.results).toHaveAttribute('aria-busy','true');await expect(c.root.locator('['+config.pick+'="'+config.key+'"]')).toBeVisible();
   await c.input.fill('search02@example.invalid');await c.deliver(old);
   // The old response is consumed while the NEW debounce is still pending.
   expect(await c.rows.locator('['+config.pick+']').evaluateAll(nodes=>nodes.map(n=>n.getAttribute(n.hasAttribute('data-gate-pick')?'data-gate-pick':'data-live-select-member')))).toEqual(initial);
   await page.clock.runFor(300);await expect(c.rows.locator('['+config.pick+']')).toHaveCount(1);await expect(c.rows).toContainText('Find 02');
   const newer=c.hold('search03@example.invalid');await c.input.fill('search03@example.invalid');await page.clock.runFor(300);await c.observe(newer);
   await c.input.fill('search-pending-selection');const selectedCount=c.searches.length;
   await c.root.locator('['+config.pick+'="'+(config.mode==='shine'?'car:search-car-02':'member:search-02')+'"]').click();
   const selected=config.mode==='shine'?c.root.locator('.admin-live-selected'):c.root.locator('[data-gate-form]').locator('..');await expect(selected).toContainText('Find 02');
   await c.deliver(newer);await page.clock.runFor(300);expect(c.searches).toHaveLength(selectedCount);await expect(selected).toContainText('Find 02');await expect(c.root.locator(config.form)).toHaveCount(0);
   await c.root.locator(config.mode==='shine'?'[data-live-cancel-selection]':'[data-gate-cancel]').click();
   await c.root.locator(config.mode==='shine'?'[data-live-choose-member]':'[data-gate-find]').click();await expect(c.results).toHaveAttribute('aria-busy','false');
   const leave=c.hold('search04@example.invalid');await c.input.fill('search04@example.invalid');await page.clock.runFor(300);await c.observe(leave);
   await c.input.fill('search-pending-leave');
   if(config.mode==='admin-arrivals')await page.getByRole('navigation',{name:'Sekce United Admin',exact:true}).locator('[data-portal-target=dashboard]').click();else await page.locator('[data-admin-live-tab=program]').click();
   await c.deliver(leave);await expect(c.root.locator(config.form)).toBeHidden();
   const count=c.searches.length;await page.clock.runFor(300);expect(c.searches).toHaveLength(count);
  }finally{await c.finish()}
 });

 test(`participant search ${config.mode}: IME, pagination, error and empty result`,async({page})=>{
  const c=await setup(page,config);
  try{
   await c.input.dispatchEvent('compositionstart');await c.input.fill('Search');await c.input.press('Enter');await page.clock.runFor(600);expect(c.searches).toHaveLength(0);
   await c.input.dispatchEvent('compositionend');await page.clock.runFor(299);expect(c.searches).toHaveLength(0);await page.clock.runFor(1);
   await expect(c.root.locator(config.more)).toBeVisible();await expect(c.results).toHaveAttribute('aria-busy','false');const first=await c.rows.locator('['+config.pick+']').count();
   await c.root.locator(config.more).click();await expect.poll(()=>c.rows.locator('['+config.pick+']').count()).toBeGreaterThan(first);expect(c.searches.at(-1)).toMatchObject({q:'Search',offset:config.mode==='shine'?50:51});
   await c.input.fill('Search ');await c.root.locator(config.form+' button').click();await expect(c.results).toHaveAttribute('aria-busy','false');
   const h=c.hold('Search',config.mode==='shine'?50:51);await c.root.locator(config.more).click();await c.observe(h);await expect(c.results).toHaveAttribute('aria-busy','true');
   await c.input.fill('Search Guest');await page.clock.runFor(300);await expect(c.rows.locator('['+config.pick+']')).toHaveCount(1);await expect(c.rows).toContainText('Search Guest');await c.deliver(h);await expect(c.rows.locator('['+config.pick+']')).toHaveCount(1);expect(c.searches.at(-1)).toMatchObject({q:'Search Guest',offset:0});
   c.fail=true;await c.input.fill('search00@example.invalid');await page.clock.runFor(300);await expect(c.results.locator('[role=alert]')).toBeVisible();await expect(c.rows).toContainText('Search Guest');await expect(c.input).toHaveValue('search00@example.invalid');
   c.fail=false;await c.root.locator(config.form+' button').click();await expect(c.results.locator('[role=alert]')).toHaveCount(0);await expect(c.rows).toContainText('Find 00');
   await c.input.fill('no-such-person');await page.clock.runFor(300);await expect(c.rows).toContainText(config.mode==='shine'?'Pro tento dotaz nebyl nalezen':'Nenalezena shoda');await expect(c.results.locator('[role=alert]')).toHaveCount(0);
  }finally{await c.finish()}
 });
}

for(const {query,count,clamped} of [{query:'search00@example.invalid',count:1,clamped:true},{query:'search0',count:10,clamped:false}])test(`participant search admin-arrivals: ${clamped?'clamps unreachable':'preserves reachable'} scroll after shorter results`,async({page},info)=>{
 const c=await setup(page,cases[2]),held=c.hold(query);
 try{
  const initialCount=await c.rows.locator('[data-gate-pick]').count();expect(initialCount).toBeGreaterThan(1);
  await c.input.fill(query);await c.input.evaluate(input=>{window.__originalSearchInput=input;input.setSelectionRange(6,6)});
  // Deliberately exercise a nonzero offset on the real list, never reset to zero
  // or add page height. Real sets of 1/10 results put 184 outside/inside the FINAL range.
  await page.evaluate(()=>scrollTo({top:184,behavior:'instant'}));const before=await searchScroll(c.input);expect(before.y).toBe(184);expect(before.max).toBeGreaterThan(184);
  await page.clock.runFor(299);expect(c.searches).toHaveLength(0);expect(await searchScroll(c.input)).toEqual(before);
  await page.clock.runFor(1);await held.received.promise;await expect(c.results).toHaveAttribute('aria-busy','true');
  const loading=await searchScroll(c.input);expect(loading.y).toBe(before.y);expect(loading.documentTop).toBe(before.documentTop);await expect(c.rows.locator('[data-gate-pick]')).toHaveCount(initialCount);
  held.release.resolve();await expect(c.results).toHaveAttribute('aria-busy','false');await expect(c.rows.locator('[data-gate-pick]')).toHaveCount(count);await expect(c.rows).toContainText('Find 00');
  await expect(c.rows.locator('img')).toHaveCount(count);await expect.poll(()=>c.rows.locator('img').evaluateAll(images=>images.every(image=>image.complete&&image.naturalWidth>0))).toBe(true);
  const after=await expectRetainedSearchScroll(c.input,before);expect(after.height).toBeLessThan(before.height);
  await info.attach('search-scroll-range',{body:JSON.stringify({query,before,loading,after}),contentType:'application/json'});
  if(clamped){expect(after.max).toBeLessThan(before.y);expect(after.y).toBe(after.max)}else{expect(after.max).toBeGreaterThan(before.y);expect(after.y).toBe(before.y)}
  await expect(c.input).toBeFocused();expect(await c.input.evaluate(input=>({same:input===window.__originalSearchInput,start:input.selectionStart,end:input.selectionEnd}))).toEqual({same:true,start:6,end:6});
  expect(c.searches.map(item=>item.q)).toEqual([query]);
  await c.input.fill('');await page.clock.runFor(300);await expect(c.rows.locator('[data-gate-pick]')).toHaveCount(initialCount);expect(c.searches.at(-1)).toMatchObject({q:'',offset:0});
 }finally{held.release.resolve();await c.finish()}
});

test('participant search: event and account changes discard queued and in-flight Arrivals reads',async({page})=>{
 const c=await setup(page,cases[2]);
 try{
  const event=c.hold('search00@example.invalid');await c.input.fill('search00@example.invalid');await page.clock.runFor(300);await c.observe(event);await c.input.fill('search-pending-event');
  await page.locator('[data-event-select]').selectOption('old');await expect(c.root).toHaveAttribute('data-gate-context','a:old');
  expect(await c.deliver(event)).toMatchObject({name:'AbortError',stale:true});await page.clock.runFor(300);expect(c.searches.some(s=>s.q==='search-pending-event')).toBe(false);await expect(c.root.locator(cases[2].form)).toHaveCount(0);
  await page.locator('[data-event-select]').selectOption(EVENT);await expect(c.input).toBeVisible();
  const account=c.hold('search01@example.invalid');await c.input.fill('search01@example.invalid');await page.clock.runFor(300);await c.observe(account);await c.input.fill('search-pending-account');
  await page.getByRole('button',{name:'Odhlásit',exact:true}).click();
  expect(await c.deliver(account)).toMatchObject({name:'AbortError',stale:true});await page.clock.runFor(300);expect(c.searches.some(s=>s.q==='search-pending-account')).toBe(false);await expect(c.input).toBeHidden();
 }finally{await c.finish()}
});
