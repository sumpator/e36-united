import {test,expect} from '@playwright/test';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {privatePollRuntime,POLL,ORIGIN} from '../helpers/private-poll-runtime.mjs';
import {waitForScreenshotContent} from './screenshot-readiness.mjs';

async function fixture(page){
 const r=await privatePollRuntime(),calls=[],errors=[],holds=[],expectedErrors=[];let failNext=false;
 page.on('pageerror',e=>errors.push({text:e.message,url:'pageerror'}));page.on('console',m=>{if(m.type()==='error')errors.push({text:m.text(),url:m.location().url})});
 await page.route('https://api.e36united.cz/api/**',async route=>{
  const q=route.request(),url=new URL(q.url()),method=q.method();
  expect(url.pathname).toBe('/api/private-polls/'+POLL+'/response');
  const entry={method,body:q.postDataJSON(),url:q.url()};calls.push(entry);
  if(method==='POST'&&failNext==='before'){failNext=false;expectedErrors.push({url:q.url(),pattern:/net::ERR_FAILED|Could not connect to the server|network connection was lost/i});return route.abort('failed')}
  const response=await r.call({method,body:entry.body||undefined,token:q.headers().authorization?.slice(7),headers:{...q.headers(),origin:ORIGIN}});
  if(method==='POST'&&failNext==='after'){failNext=false;expectedErrors.push({url:q.url(),pattern:/net::ERR_FAILED|Could not connect to the server|network connection was lost/i});return route.abort('failed')}
  const body=await response.text(),hold=holds.find(h=>!h.used&&h.method===method);
  if(hold){hold.used=true;hold.received.resolve();await hold.release.promise}
  await route.fulfill({status:response.status,headers:{...Object.fromEntries(response.headers),'Access-Control-Allow-Origin':new URL(page.url()).origin},body});
 });
 const open=async(answer='',token=r.tokens[0])=>{
  await page.goto('/invitations/darts.html#'+new URLSearchParams({poll:POLL,token,...(answer?{answer}:{})}));await page.bringToFront();
  await expect(page.getByRole('button',{name:'ANO',exact:true})).toBeEnabled();
 };
 return {r,calls,open,hold(method){const h={method,received:Promise.withResolvers(),release:Promise.withResolvers(),used:false};holds.push(h);return h},fail(afterWrite=false){failNext=afterWrite?'after':'before'},expectHttp(code){expectedErrors.push({url:'https://api.e36united.cz/api/private-polls/'+POLL+'/response',pattern:new RegExp('(?:status of |status code )'+code+'\\b')})},async finish(){for(const h of holds)h.release.resolve();const unexpected=errors.filter(e=>{const i=expectedErrors.findIndex(x=>x.url===e.url&&x.pattern.test(e.text));if(i<0)return true;expectedErrors.splice(i,1);return false});expect(unexpected).toEqual([]);r.close()}};
}
const status=page=>page.locator('[data-status]');
const choice=(page,label)=>page.getByRole('button',{name:label,exact:true});
const range=page=>page.getByRole('slider');
const web=page=>page.getByRole('link',{name:'Přejít na E36 United →'});

test('three responses, stale email link, explicit zero, saved reopening and no duplicate recipient',async({page})=>{
 const f=await fixture(page);try{
  await f.open('no');await expect(status(page)).toHaveText('Uloženo: NE.');await expect(web(page)).toBeVisible();expect(f.r.row().answer).toBe('no');
  await f.open('yes');await expect(choice(page,'NE')).toHaveAttribute('aria-pressed','true');expect(f.r.row().version).toBe(1);
  await choice(page,'ANO').click();await expect(status(page)).toHaveText('Uloženo: ANO. Vyber ještě hodnotu 0–10.');await expect(web(page)).toBeHidden();expect(f.r.row().score).toBeNull();
  await range(page).focus();await range(page).press('End');await expect(status(page)).toHaveText('Uloženo: 10/10');await expect(web(page)).toBeVisible();
  await range(page).press('Home');await expect(status(page)).toHaveText('Uloženo: 0/10');expect(f.r.row().score).toBe(0);
  await choice(page,'MOŽNÁ').click();await expect(status(page)).toHaveText('Uloženo: MOŽNÁ.');await expect(range(page)).toBeHidden();await expect(web(page)).toBeVisible();
  await f.open('no');await expect(choice(page,'MOŽNÁ')).toHaveAttribute('aria-pressed','true');expect(f.r.row().score).toBeNull();expect(f.r.row(1).version).toBe(0);expect(f.r.db.prepare('SELECT count(*) n FROM private_poll_invitations').get().n).toBe(2);
  await f.open('yes',f.r.tokens[1]);await expect(status(page)).toContainText('Uloženo: ANO');expect(f.r.row(1).answer).toBe('yes');expect(f.r.row().answer).toBe('maybe');
 }finally{await f.finish()}
});
test('dragging moves the real car and commits only after release; keyboard also saves',async({page})=>{
 const f=await fixture(page);try{
  await f.open('yes');await expect(status(page)).toHaveText('Uloženo: ANO. Vyber ještě hodnotu 0–10.');
  await range(page).scrollIntoViewIfNeeded();const b=await range(page).boundingBox(),writes=()=>f.calls.filter(c=>c.method==='POST').length,before=writes();
  await page.mouse.move(b.x+20,b.y+32);await page.mouse.down();await page.mouse.move(b.x+20+(b.width-40)*.7,b.y+32,{steps:8});
  await expect(range(page)).toHaveValue('7');await expect(page.locator('[data-score]')).toHaveText('7 / 10');expect(writes()).toBe(before);expect(f.r.row().score).toBeNull();
  await page.mouse.up();await expect(status(page)).toHaveText('Uloženo: 7/10');expect(writes()).toBe(before+1);expect(f.r.row().score).toBe(7);
  await range(page).focus();await range(page).press('ArrowRight');await expect(status(page)).toHaveText('Uloženo: 8/10');expect(f.r.row().score).toBe(8);
 }finally{await f.finish()}
});
test('network failure retains chosen score, retry writes only the failed operation',async({page})=>{
 const f=await fixture(page);try{
  await f.open('yes');await expect(status(page)).toContainText('Uloženo: ANO');f.fail();
  await range(page).focus();await range(page).press('End');await expect(status(page)).toHaveText('Neuloženo. Výběr zůstává, zkus uložení znovu.');await expect(web(page)).toBeHidden();await expect(range(page)).toHaveValue('10');expect(f.r.row().score).toBeNull();
  const failed=f.calls.filter(x=>x.method==='POST').at(-1).body;
  await page.getByRole('button',{name:'Zkusit znovu'}).click();await expect(status(page)).toHaveText('Uloženo: 10/10');
  expect(f.calls.filter(x=>x.method==='POST').at(-1).body).toEqual(failed);expect(f.r.row().version).toBe(2);
  f.fail(true);await range(page).press('Home');await expect(status(page)).toContainText('Neuloženo.');expect(f.r.row().score).toBe(0);expect(f.r.row().version).toBe(3);
  await page.getByRole('button',{name:'Zkusit znovu'}).click();await expect(status(page)).toHaveText('Uloženo: 0/10');expect(f.r.row().version).toBe(3,'response lost after commit: retry is idempotent');
 }finally{await f.finish()}
});
test('late server response cannot override a newer choice; writes are serialized',async({page})=>{
 const f=await fixture(page);try{
  await f.open('yes');await expect(status(page)).toContainText('Uloženo: ANO');const hold=f.hold('POST');
  await range(page).focus();await range(page).press('End');await hold.received.promise;expect(f.r.row().score).toBe(10);
  await choice(page,'NE').click();await expect(choice(page,'NE')).toHaveAttribute('aria-pressed','true');await expect(web(page)).toBeHidden();
  hold.release.resolve();await expect(status(page)).toHaveText('Uloženo: NE.');await expect(choice(page,'NE')).toHaveAttribute('aria-pressed','true');expect(f.r.row().answer).toBe('no');expect(f.r.row().score).toBeNull();expect(f.r.row().version).toBe(3);
 }finally{await f.finish()}
});
test('stale initial GET cannot overwrite a concurrent saved answer; invalid link reveals no recipient',async({page})=>{
 const f=await fixture(page);try{
  const hold=f.hold('GET');await page.goto('/invitations/darts.html#'+new URLSearchParams({poll:POLL,token:f.r.tokens[0],answer:'no'}));await hold.received.promise;
  await f.r.call({method:'POST',body:{answer:'yes',score:4,expectedVersion:0,operationId:'other-client'}});
  f.expectHttp(409);
  hold.release.resolve();await page.bringToFront();await expect(status(page)).toHaveText('Zobrazena již uložená odpověď.');await expect(choice(page,'ANO')).toHaveAttribute('aria-pressed','true');await expect(range(page)).toHaveValue('4');expect(f.r.row().version).toBe(1);
  await page.goto('/invitations/darts.html#token=invalid&answer=yes');await expect(status(page)).toHaveText('Tento osobní odkaz není platný.');await expect(choice(page,'ANO')).toBeDisabled();expect(await page.locator('body').innerText()).not.toContain('guest-');
 }finally{await f.finish()}
});
test('non-active page reads but does not autosave until it becomes active',async({page})=>{
 const f=await fixture(page);try{
  await page.addInitScript(()=>{window.pollTestFocused=false;document.hasFocus=()=>window.pollTestFocused});
  await f.open('maybe');await expect(status(page)).toHaveText('Vyber ANO, NE nebo MOŽNÁ.');expect(f.r.row().version).toBe(0);expect(f.calls.filter(c=>c.method==='POST')).toHaveLength(0);
  await page.evaluate(()=>{window.pollTestFocused=true;window.dispatchEvent(new Event('focus'))});await expect(status(page)).toHaveText('Uloženo: MOŽNÁ.');expect(f.r.row().version).toBe(1);
 }finally{await f.finish()}
});
test.describe('touch control',()=>{
 test.use({hasTouch:true,isMobile:true,viewport:{width:390,height:900}});
 test('touch tap chooses and saves a value on mobile',async({page})=>{
  const f=await fixture(page);try{
   await f.open('yes');await expect(status(page)).toContainText('Uloženo: ANO');await range(page).scrollIntoViewIfNeeded();const b=await range(page).boundingBox();
   await page.touchscreen.tap(b.x+20+(b.width-40)*.4,b.y+32);await expect(status(page)).toHaveText('Uloženo: 4/10');expect(f.r.row().score).toBe(4);
  }finally{await f.finish()}
 });
});
for(const width of [360,390,820,1440])test('approved invitation layout '+width,async({page},testInfo)=>{
 const f=await fixture(page);try{
  await page.setViewportSize({width,height:1000});await f.open('yes');await expect(status(page)).toContainText('Uloženo: ANO');
  await range(page).focus();await range(page).press('Home');await range(page).press('ArrowRight');await range(page).press('ArrowRight');await range(page).press('ArrowRight');await range(page).press('ArrowRight');await range(page).press('ArrowRight');await range(page).press('ArrowRight');await range(page).press('ArrowRight');await expect(status(page)).toHaveText('Uloženo: 7/10');
  await waitForScreenshotContent(page,{label:'private-poll-'+width});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
  await expect(page.locator('h1')).toHaveText('ŠIPKY. PIVO.STAY UNITED.');
  const hero=await page.locator('.hero').boundingBox();expect(Math.abs(hero.width/hero.height-877/431)).toBeLessThan(.01);
  const dir=resolve('.local-evidence/darts-poll-20261027');mkdirSync(dir,{recursive:true});
  await page.screenshot({path:resolve(dir,testInfo.project.name+'-'+width+'.png'),fullPage:true});
  writeFileSync(resolve(dir,testInfo.project.name+'-'+width+'.json'),JSON.stringify({width,answer:f.r.row().answer,score:f.r.row().score,version:f.r.row().version,hero},null,2));
 }finally{await f.finish()}
});

test('Admin results UI reads actual protected handler and clears personal data after role loss',async({page})=>{
 const r=await privatePollRuntime(),originalFetch=globalThis.fetch,errors=[];
 try{
  await r.call({method:'POST',body:{answer:'yes',score:7,expectedVersion:0,operationId:'admin-ui-fixture'}});
  const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);Object.assign(jwk,{kid:'poll-browser-key',alg:'RS256',use:'sig'});
  const now=Math.floor(Date.now()/1000),encode=o=>Buffer.from(JSON.stringify(o)).toString('base64url'),unsigned=encode({alg:'RS256',kid:jwk.kid})+'.'+encode({sub:'admin',aud:'e36-united',iss:'https://securetoken.google.com/e36-united',iat:now,auth_time:now,exp:now+3600});
  const token=unsigned+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(unsigned))).toString('base64url');
  globalThis.fetch=async url=>{expect(String(url)).toBe('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');return new Response(JSON.stringify({keys:[jwk]}),{headers:{'Content-Type':'application/json','Cache-Control':'max-age=3600'}})};
  // Only Firebase's external SDK/session is synthetic; API, JWT verification, role and D1 are real.
  await page.route('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js',route=>route.fulfill({contentType:'text/javascript',body:'export const getApps=()=>[];export const initializeApp=()=>({});'}));
  await page.route('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js',route=>route.fulfill({contentType:'text/javascript',body:'export const browserLocalPersistence={};export const getAuth=()=>({});export const setPersistence=async()=>{};export function onAuthStateChanged(auth,next){next({getIdToken:async()=>'+JSON.stringify(token)+'});return ()=>{};}'}));
  let denied=false;
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!(denied&&m.location().url==='https://api.e36united.cz/api/admin/private-polls/'+POLL+'/results'&&/status of 403\b/.test(m.text())))errors.push(m.text())});
  await page.route('https://api.e36united.cz/api/**',async route=>{
   const q=route.request(),url=new URL(q.url());
   expect(['GET /api/admin/private-polls/'+POLL+'/results','POST /api/admin/private-polls','POST /api/admin/private-polls/'+POLL+'/invitations']).toContain(q.method()+' '+url.pathname);
   const response=await r.call({path:url.pathname,method:q.method(),body:q.postDataJSON()||undefined,token:q.headers().authorization?.slice(7)});
   await route.fulfill({status:response.status,headers:{...Object.fromEntries(response.headers),'Access-Control-Allow-Origin':new URL(page.url()).origin},body:await response.text()});
  });
  await page.goto('/invitations/results.html?poll='+POLL);await expect(page.locator('tbody tr')).toHaveCount(2);await expect(page.locator('tbody tr').filter({hasText:'guest-0@example.invalid'})).toContainText('7/10');
  const payload={poll:{id:POLL,title:'Šipky. Pivo. Stay United.'},invitations:[{id:'invite-0',email:'guest-0@example.invalid',name:'Synthetic guest 0',token:r.tokens[0]}]};
  await page.locator('[data-provision-file]').setInputFiles({name:'isolated-poll.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});await expect(page.getByRole('status')).toContainText('2 příjemců');await expect(page.locator('tbody tr')).toHaveCount(2);expect(r.db.prepare('SELECT count(*) n FROM private_poll_invitations').get().n).toBe(2);
  r.db.exec("UPDATE members SET role='member' WHERE id='admin'");denied=true;await page.getByRole('button',{name:'Obnovit výsledky'}).click();await expect(page.getByRole('status')).toHaveText('Nemáš oprávnění Admina.');await expect(page.locator('table')).toBeHidden();await expect(page.locator('tbody tr')).toHaveCount(0);expect(await page.locator('body').innerText()).not.toContain('guest-0');expect(errors).toEqual([]);
 }finally{globalThis.fetch=originalFetch;r.close()}
});

test('confirmed selection is graphical only; pending, error and range states never pretend confirmation',async({page})=>{
 const f=await fixture(page);try{
  const first=f.hold('POST');await f.open('yes');await first.received.promise;
  await expect(choice(page,'ANO')).toHaveAttribute('data-pending','');await expect(choice(page,'ANO')).not.toHaveAttribute('data-confirmed','');await expect(web(page)).toBeHidden();
  first.release.resolve();await expect(choice(page,'ANO')).toHaveAttribute('data-confirmed','');await expect(status(page)).toHaveClass('sr-only');expect(await status(page).evaluate(n=>getComputedStyle(n).clip)).toBe('rect(0px, 0px, 0px, 0px)');await expect(web(page)).toBeHidden();
  await expect(page.locator('.beer>p')).toHaveCount(0);expect(await page.locator('body').innerText()).not.toContain('jdu hlavně na šipky');
  const score=f.hold('POST');await range(page).focus();await range(page).press('End');await score.received.promise;await expect(page.locator('[data-score]')).not.toHaveAttribute('data-confirmed','');await expect(web(page)).toBeHidden();score.release.resolve();await expect(page.locator('[data-score]')).toHaveAttribute('data-confirmed','');await expect(web(page)).toBeVisible();await expect(status(page)).toHaveClass('sr-only');
  f.fail();await choice(page,'NE').click();await expect(status(page)).toContainText('Neuloženo.');await expect(status(page)).not.toHaveClass('sr-only');await expect(choice(page,'NE')).not.toHaveAttribute('data-confirmed','');await expect(web(page)).toBeHidden();
  await page.getByRole('button',{name:'Zkusit znovu'}).click();await expect(choice(page,'NE')).toHaveAttribute('data-confirmed','');await expect(choice(page,'NE')).toHaveAttribute('aria-pressed','true');await expect(status(page)).toHaveClass('sr-only');await expect(web(page)).toBeVisible();
 }finally{await f.finish()}
});
test('public preview without a token shows the design but cannot read or write a response',async({page})=>{
 const f=await fixture(page);try{
  await page.goto('/invitations/darts.html');await expect(status(page)).toHaveText('Pro odpověď otevři svůj osobní odkaz.');await expect(range(page)).toBeVisible();await expect(range(page)).toBeDisabled();await expect(choice(page,'ANO')).toBeDisabled();await expect(page.locator('.car-position img')).toHaveAttribute('src','./assets/bmw-e36-coupe-blue.webp');expect(f.calls).toEqual([]);expect(f.r.row().version).toBe(0);
 }finally{await f.finish()}
});
