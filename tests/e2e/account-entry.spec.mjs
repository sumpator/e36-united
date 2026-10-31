import {test,expect} from '@playwright/test';
import {prepareE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';
import {memberRuntime} from '../helpers/admin-member-runtime.mjs';
import {getMemberLive,getLiveState} from '../../worker/domains/live.js';
import {claimArrival} from '../../worker/domains/arrival-invitations.js';
import {tokenHash} from '../../worker/domains/arrivals.js';
import {getPlannerDraft,putPlannerDraft} from '../../worker/domains.js';

test('account menu login after logout stays in the account instead of returning to homepage',async({page},testInfo)=>{
 const observations=await prepareE2ePage(page,{authenticated:true});const navigations=[],renders=[];
 page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations.push(frame.url())});
 page.on('console',message=>{if(message.text().startsWith('ACCOUNT_RENDERED '))renders.push(message.text().slice(17))});
 await page.addInitScript(()=>{let shown=false;new MutationObserver(()=>{const app=document.querySelector('[data-app-view]');if(!shown&&app&&!app.hidden&&document.body?.classList.contains('member-authenticated')){shown=true;console.debug('ACCOUNT_RENDERED '+location.href)}}).observe(document,{subtree:true,childList:true,attributes:true})});
 await page.goto('/member.html?section=account');await expect(page.locator('[data-member-panel=account]')).toBeVisible();await page.locator('.account-logout').click();await expect(page.locator('[data-auth-view]')).toBeVisible();
 await page.goto('/index.html');const entry=page.locator('.site-header .nav-links .nav-member');await expect(entry).toHaveText(/Registrovat se|Přihlásit se/);const label=await entry.innerText();await entry.click();await expect(page.locator('[data-auth-view]')).toBeVisible();
 const register=page.locator('[data-auth-form=register]');if(await register.isVisible())await register.locator('[data-auth-switch=login]').click();const login=page.locator('[data-auth-form=login]');await expect(login).toBeVisible();
 await login.locator('[name=email]').fill('isolated@example.test');await login.locator('[name=password]').fill('isolated-password');await login.locator('[type=submit]').click();
 await expect.poll(()=>renders.length).toBeGreaterThan(1);
 await page.waitForLoadState('load');await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await testInfo.attach('completed-account-menu-journey',{body:JSON.stringify({label,navigations,renders,finalUrl:page.url(),pageErrors:observations.pageErrors},null,2),contentType:'application/json'});
 console.log(JSON.stringify({label,finalUrl:page.url(),accountRenders:renders.length,pageErrors:observations.pageErrors}));
 await expect(page).toHaveURL(/\/member\.html(?:[?#]|$)/);await expect(page.locator('[data-member-panel=overview]')).toBeVisible();expectNoUnexpectedClientErrors(observations);
});

test('an authenticated visitor who logs out gets the returning-member login entry',async({page})=>{
 const observations=await prepareE2ePage(page,{authenticated:true});await page.goto('/member.html?section=account');await expect(page.locator('[data-member-panel=account]')).toBeVisible();await page.locator('.account-logout').click();await expect(page.locator('[data-auth-view]')).toBeVisible();
 await page.goto('/index.html');await expect(page.locator('.site-header .nav-links .nav-member')).toHaveText('Přihlásit se');expectNoUnexpectedClientErrors(observations);
});
for(const authenticated of [false,true])for(const path of ['/index.html','/o-nas.html','/galerie.html','/merch.html','/member.html'])test(`Account entry ${path} authenticated=${authenticated}`,async({page})=>{
 const observations=await prepareE2ePage(page,{authenticated});await page.setViewportSize({width:390,height:844});await page.goto(path);
 const links=page.locator('.site-header .nav-member');await expect(links).not.toHaveCount(0);
 await expect(links.nth(0)).toHaveText(authenticated?'Můj United účet':'Registrovat se');
 if(!authenticated){await expect(links.nth(0)).toHaveAttribute('href',/mode=register/);}
 await page.reload();await expect(links.nth(0)).toHaveText(authenticated?'Můj United účet':'Registrovat se');
 expectNoUnexpectedClientErrors(observations);
});
test('Overview prioritizes reservation over points and keeps details accessible',async({page})=>{
 const observations=await prepareE2ePage(page,{authenticated:true,registrationOpen:true});await page.goto('/member.html');const intro=page.locator('[data-onboarding-intro-modal]');await expect(intro).toBeVisible();await intro.locator('button[data-onboarding-intro-close]').click();await expect(intro).toBeHidden();
 const action=page.locator('[data-reservation-overview-card]');await expect(action).toBeVisible();await expect(page.locator('[data-club-statistics]')).toBeHidden();
 await page.locator('[data-overview-open=club]').click();await expect(page.locator('[data-member-panel=club]')).toBeVisible();await page.locator('[data-member-help="points"]').click();await expect(page.locator('#member-card-help')).toBeVisible();expectNoUnexpectedClientErrors(observations);
});

test('Closed registration hides the empty action badge without hiding its status',async({page})=>{
 const observations=await prepareE2ePage(page,{authenticated:true,registrationOpen:false,preliminaryEnabled:false,reservation:null});
 await page.goto('/member.html');
 const card=page.locator('[data-reservation-overview-card]');await expect(card).toBeVisible();await expect(card.locator('[data-reservation-overview-label]')).toHaveText('REGISTRACE NYNÍ NEJSOU OTEVŘENÉ');await expect(card.locator('[data-reservation-overview-action]')).toBeHidden();expectNoUnexpectedClientErrors(observations);
});

const usedAccountKey='e36UnitedAccountUsed:v1';
const mainAccountLink=page=>page.locator('.site-header .nav-links .nav-member');
const renderOpportunity=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function submitAccountForm(page,mode='login'){
 const form=page.locator(`[data-auth-form=${mode}]`);await expect(form).toBeVisible();
 if(mode==='register'){await form.locator('[name=name]').fill('Isolated Driver');await form.locator('[name=nickname]').fill('Driver');await form.locator('[name=passwordConfirm]').fill('isolated-password');await form.getByRole('checkbox').check()}
 await form.locator('[name=email]').fill('isolated@example.test');await form.locator('[name=password]').fill('isolated-password');await form.locator('[type=submit]').click();
}
async function expectCompletedAccount(page,section='overview'){
 await expect(page.locator(`[data-member-panel=${section}]`)).toBeVisible();await renderOpportunity(page);
 await expect(page).toHaveURL(/\/member\.html(?:[?#]|$)/);expect(new URL(page.url()).searchParams.get('section')||'overview').toBe(section);await expect(page.locator(`[data-member-panel=${section}]`)).toBeVisible();
}

test('a remembered LIVE session cannot override an explicit member section after a delayed probe',async({page})=>{
 const o=await prepareE2ePage(page,{authenticated:true,member:{id:'m'}}),r=memberRuntime();r.db.exec("UPDATE events SET live_enabled=1 WHERE id='e'");
 await page.addInitScript(()=>localStorage.setItem('e36United.memberLiveMode.v2.m.e','1'));
 const started=Promise.withResolvers(),release=Promise.withResolvers();let liveReads=0;
 await page.route('https://api.e36united.cz/api/live{,/state}',async route=>{
  if(route.request().method()==='OPTIONS')return route.fallback();const url=new URL(route.request().url());
  if(url.pathname.endsWith('/state')){started.resolve();await release.promise}else liveReads++;
  const response=url.pathname.endsWith('/state')?await getLiveState(r.env,{uid:'m'},url,'https://e36united.cz'):await getMemberLive(r.env,{uid:'m'},url,'https://e36united.cz');
  return route.fulfill({status:response.status,headers:{'Access-Control-Allow-Origin':'*'},body:await response.text()});
 });
 try{
  await page.goto('/member.html?section=garage');await started.promise;await expectCompletedAccount(page,'garage');await page.locator('.member-sidebar [data-member-section=photos]').click();await expectCompletedAccount(page,'photos');
  const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/live/state'&&r.request().method()==='GET');release.resolve();await (await response).finished();await renderOpportunity(page);
  await expectCompletedAccount(page,'photos');await expect(page.locator('[data-member-live-mode]')).toBeHidden();expect(liveReads).toBe(0);expectNoUnexpectedClientErrors(o);
 }finally{release.resolve();await page.close();r.db.close()}
});

test('clean visitor follows the account menu to registration and can explicitly choose login',async({page})=>{
 const o=await prepareE2ePage(page);await page.goto('/index.html');await expect(mainAccountLink(page)).toHaveText('Registrovat se');await mainAccountLink(page).click();await expect(page.locator('[data-auth-form=register]')).toBeVisible();
 await page.locator('[data-auth-form=register] [data-auth-switch=login]').click();await submitAccountForm(page);await expectCompletedAccount(page);expect(await page.evaluate(key=>localStorage.getItem(key),usedAccountKey)).toBe('1');expectNoUnexpectedClientErrors(o);
});

test('successful account use survives logout and homepage reload, while registration stays explicitly available',async({page})=>{
 const o=await prepareE2ePage(page);await page.goto('/member.html?mode=login');await submitAccountForm(page);await expectCompletedAccount(page);await page.locator('.member-sidebar-logout').click();await expect(page.locator('[data-auth-view]')).toBeVisible();
 expect(await page.evaluate(key=>localStorage.getItem(key),usedAccountKey)).toBe('1');await page.goto('/index.html');await expect(mainAccountLink(page)).toHaveText('Přihlásit se');await page.reload();await expect(mainAccountLink(page)).toHaveText('Přihlásit se');await mainAccountLink(page).click();await expect(page.locator('[data-auth-form=login]')).toBeVisible();
 await page.locator('[data-auth-form=login] [data-auth-switch=register]').click();await expect(page.locator('[data-auth-form=register]')).toBeVisible();await page.reload();await expect(page.locator('[data-auth-form=register]')).toBeVisible();await page.locator('[data-auth-form=register] [data-auth-switch=login]').click();await submitAccountForm(page);await expectCompletedAccount(page);expectNoUnexpectedClientErrors(o);
});

for(const path of ['/o-nas.html','/galerie.html','/merch.html'])test(`public account entry ${path} completes in the account`,async({page})=>{
 const o=await prepareE2ePage(page);await page.goto(path);await expect(mainAccountLink(page)).toHaveText('Registrovat se');await mainAccountLink(page).click();await expect(page.locator('[data-auth-form=register]')).toBeVisible();await page.locator('[data-auth-form=register] [data-auth-switch=login]').click();await submitAccountForm(page);await expectCompletedAccount(page);expectNoUnexpectedClientErrors(o);
});

for(const section of ['garage','account'])test(`direct ${section} link survives login and reload`,async({page})=>{
 const o=await prepareE2ePage(page);await page.goto('/member.html?mode=login&section='+section+'&returnTo=%2Findex.html');await submitAccountForm(page);await expectCompletedAccount(page,section);await page.reload();await expectCompletedAccount(page,section);expectNoUnexpectedClientErrors(o);
});

test('explicit public upload return is honored while a generic historic homepage return is not',async({page})=>{
 const o=await prepareE2ePage(page);await page.goto('/member.html?mode=login&intent=return&returnTo='+encodeURIComponent('/galerie.html#upload'));await submitAccountForm(page);
 await expect(page).toHaveURL(/\/galerie\.html#upload$/);await expect(page.locator('#nahraj-fotky')).toBeAttached();await renderOpportunity(page);await expect(page).toHaveURL(/\/galerie\.html#upload$/);expectNoUnexpectedClientErrors(o);
});

for(const mode of ['login','register'])test(`public Planner transfers unchanged values through ${mode} and reload`,async({page})=>{
 const o=await prepareE2ePage(page,{preliminaryEnabled:true});await page.goto('/index.html#planer');await expect(page.locator('[data-stay-index="2"]')).toBeVisible();await page.locator('[data-stay-index="2"]').click();
 const people=page.locator('[data-people]');const count=Number(await people.innerText());for(let i=count;i<3;i++)await page.locator('[data-people-plus]').click();for(let i=count;i>3;i--)await page.locator('[data-people-minus]').click();await expect(people).toHaveText('3');
 await page.locator('.planner-shell').getByRole('button',{name:/Bez ubytování/}).click();await page.locator('[data-planner-mail]').click();await expect(page.locator('[data-inquiry-modal]')).toBeVisible();await page.locator(mode==='login'?'[data-planner-login]':'[data-planner-register]').click();await submitAccountForm(page,mode);
 await expectCompletedAccount(page,'reservation');const draft=new URL(page.url()).searchParams.get('draft');expect(draft).toMatch(/^[a-f0-9-]{36}$/i);
 const open=page.locator('[data-member-plan-open]');await expect(open).toContainText('Dokončit předběžnou registraci');await open.click();const modal=page.locator('[data-member-planner-modal]');await expect(modal.locator('[data-member-stay="1"]')).toHaveAttribute('aria-pressed','true');await expect(modal.locator('[data-member-crew]')).toHaveText('3');await expect(modal.locator('[name=sleep]')).toHaveValue('Bez ubytování');await modal.getByRole('button',{name:'Zavřít Planner',exact:true}).click();
 await page.reload();await expectCompletedAccount(page,'reservation');expect(new URL(page.url()).searchParams.get('draft')).toBe(draft);await open.click();await expect(modal.locator('[data-member-stay="1"]')).toHaveAttribute('aria-pressed','true');await expect(modal.locator('[data-member-crew]')).toHaveText('3');expect(o.reservationWrites).toEqual([]);expect(o.preliminaryWrites).toEqual([]);expect(o.carWrites).toEqual([]);expectNoUnexpectedClientErrors(o);
});

test('profile retry preserves the requested garage and does not mark a failed profile as successful account use',async({page})=>{
 const o=await prepareE2ePage(page);let fail=true;
 await page.route('https://api.e36united.cz/api/me',route=>route.request().method()==='OPTIONS'||!fail?route.fallback():route.fulfill({status:500,headers:{'Access-Control-Allow-Origin':'*'},json:{error:'controlled_profile_failure'}}));
 await page.goto('/member.html?mode=login&section=garage&returnTo=%2Findex.html');await submitAccountForm(page);await expect(page.locator('[data-auth-retry]')).toBeVisible();expect(await page.evaluate(key=>localStorage.getItem(key),usedAccountKey)).toBeNull();fail=false;await page.locator('[data-auth-retry]').click();await expectCompletedAccount(page,'garage');expect(await page.evaluate(key=>localStorage.getItem(key),usedAccountKey)).toBe('1');
 expectNoUnexpectedClientErrors({...o,consoleErrors:o.consoleErrors.filter(e=>!((e.url.endsWith('/api/me')&&e.text.includes('500'))||e.text.startsWith('Unable to restore member session')))});
});

for(const action of ['stay','section','logout'])test(`late optional Club and photos cannot override the newer ${action} action`,async({page})=>{
 const o=await prepareE2ePage(page);const started=Promise.withResolvers(),release=Promise.withResolvers();const requests=new Set();
 await page.route(/https:\/\/api\.e36united\.cz\/api\/(united-club|gallery\/mine)(?:\?|$)/,async route=>{if(route.request().method()==='OPTIONS')return route.fallback();requests.add(new URL(route.request().url()).pathname);if(requests.size===2)started.resolve();await release.promise;return route.fallback()});
 try{
  await page.goto('/member.html?mode=login&intent=account&returnTo=%2Findex.html');await submitAccountForm(page);await started.promise;await expectCompletedAccount(page);
  if(action==='section')await page.locator('.member-sidebar [data-member-section=garage]').click();if(action==='logout'){await page.locator('.member-sidebar-logout').click();await expect(page.locator('[data-auth-view]')).toBeVisible()}
  const responses=[page.waitForResponse(r=>new URL(r.url()).pathname==='/api/united-club'&&r.request().method()==='GET'),page.waitForResponse(r=>new URL(r.url()).pathname==='/api/gallery/mine'&&r.request().method()==='GET')];release.resolve();await Promise.all(responses.map(async response=>(await response).finished()));await renderOpportunity(page);
  if(action==='logout'){await expect(page.locator('[data-auth-view]')).toBeVisible();await expect(page.locator('[data-app-view]')).toBeHidden();await expect(page).toHaveURL(/\/member\.html(?:[?#]|$)/)}else await expectCompletedAccount(page,action==='section'?'garage':'overview');expectNoUnexpectedClientErrors(o);
 }finally{release.resolve()}
});

test('blocked browser storage keeps explicit forms usable without pretending to remember a returning account',async({page})=>{
 const o=await prepareE2ePage(page,{authMemoryOnly:true});await page.addInitScript(()=>{for(const method of ['getItem','setItem','removeItem'])Storage.prototype[method]=function(){throw new DOMException('Controlled storage denial','SecurityError')}});
 await page.goto('/index.html');await expect(mainAccountLink(page)).toHaveText('Registrovat se');await mainAccountLink(page).click();await expect(page.locator('[data-auth-form=register]')).toBeVisible();await page.locator('[data-auth-form=register] [data-auth-switch=login]').click();await submitAccountForm(page);await expectCompletedAccount(page);await expect(page.locator('[data-memory-session-notice]')).toBeVisible();
 await page.locator('.member-sidebar-logout').click();await expect(page.locator('[data-auth-view]')).toBeVisible();await page.goto('/index.html');await expect(mainAccountLink(page)).toHaveText('Registrovat se');expectNoUnexpectedClientErrors(o);
});

test('memory session returns truthfully to login after reload and retains its nonidentifying account marker',async({page})=>{
 const o=await prepareE2ePage(page,{authMemoryOnly:true});await page.goto('/member.html?mode=login&section=garage');await submitAccountForm(page);await expectCompletedAccount(page,'garage');await expect(page.locator('[data-memory-session-notice]')).toBeVisible();expect(await page.evaluate(key=>localStorage.getItem(key),usedAccountKey)).toBe('1');await page.reload();await expect(page.locator('[data-auth-form=login]')).toBeVisible();await expect(page.locator('[data-app-view]')).toBeHidden();await submitAccountForm(page);await expectCompletedAccount(page,'garage');expectNoUnexpectedClientErrors(o);
});

test('back and forward preserve member sections without repeating account or business writes',async({page})=>{
 const o=await prepareE2ePage(page);await page.goto('/index.html');await mainAccountLink(page).click();await expect(page.locator('[data-auth-form=register]')).toBeVisible();await page.locator('[data-auth-form=register] [data-auth-switch=login]').click();await submitAccountForm(page);await expectCompletedAccount(page);
 await page.locator('.member-sidebar [data-member-section=garage]').click();await expectCompletedAccount(page,'garage');await page.locator('.member-sidebar [data-member-section=account]').click();await expectCompletedAccount(page,'account');await page.goBack();await expectCompletedAccount(page,'garage');await page.goForward();await expectCompletedAccount(page,'account');
 expect(o.requests.filter(request=>request==='POST /api/bootstrap')).toEqual([]);for(const key of ['profileWrites','reservationWrites','preliminaryWrites','carWrites'])expect(o[key]).toEqual([]);expectNoUnexpectedClientErrors(o);
});


test('Back abandons a pending explicit LIVE entry without reopening it after the server responds',async({page})=>{
 const o=await prepareE2ePage(page,{authenticated:true,member:{id:'m'}}),r=memberRuntime();r.db.exec("UPDATE events SET live_enabled=1 WHERE id='e'");
 const started=Promise.withResolvers(),release=Promise.withResolvers();
 await page.route('https://api.e36united.cz/api/live',async route=>{if(route.request().method()==='OPTIONS')return route.fallback();started.resolve();await release.promise;const response=await getMemberLive(r.env,{uid:'m'},new URL(route.request().url()),'https://e36united.cz');return route.fulfill({status:response.status,headers:{'Access-Control-Allow-Origin':'*'},body:await response.text()})});
 try{
  await page.goto('/member.html?section=garage');await expectCompletedAccount(page,'garage');await page.locator('.member-sidebar [data-member-section=account]').click();await expectCompletedAccount(page,'account');
  await page.locator('.member-sidebar [data-member-section=live]').click();await started.promise;await expect(page.locator('[data-member-live-entry]')).toBeVisible();
  await page.goBack();await expectCompletedAccount(page,'garage');await expect(page.locator('[data-member-live-entry]')).toBeHidden();const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/live'&&r.request().method()==='GET');release.resolve();await (await response).finished();await renderOpportunity(page);
  await expectCompletedAccount(page,'garage');await expect(page.locator('[data-member-live-entry]')).toBeHidden();await expect(page.locator('[data-member-live-mode]')).toBeHidden();expectNoUnexpectedClientErrors(o);
 }finally{release.resolve();await page.close();r.db.close()}
});

for(const action of ['history','logout'])test(`an abandoned arrival invitation cannot restore its old account target after ${action}`,async({page})=>{
 const o=await prepareE2ePage(page,{member:{id:'m',email:'member@example.invalid'}}),r=memberRuntime(),token='a'.repeat(72);
 r.db.exec("INSERT INTO event_arrivals(id,event_id,car_key,model,body,crew,registered,admission_czk) VALUES('invite-arrival','e','guest-invite','BMW E36','Coupé',1,0,0); INSERT INTO email_outbox(id,template_key,recipient_email,subject) VALUES('invite-outbox','arrival_invitation','member@example.invalid','Isolated invitation');");
 r.db.prepare("INSERT INTO arrival_invitations(id,arrival_id,token_hash,email,expires_at,outbox_id) VALUES('invite','invite-arrival',?,'member@example.invalid',datetime('now','+1 day'),'invite-outbox')").run(await tokenHash(token));
 // Model a transport that cannot cancel after dispatch, so the application stale guard is exercised too.
 await page.addInitScript(()=>{const fetchOriginal=window.fetch;window.fetch=(input,options)=>String(input).includes('/api/arrivals/claim')?fetchOriginal(input,{...options,signal:undefined}):fetchOriginal(input,options)});
 const started=Promise.withResolvers(),release=Promise.withResolvers();const bodies=[];
 await page.route('https://api.e36united.cz/api/arrivals/claim',async route=>{if(route.request().method()==='OPTIONS')return route.fallback();bodies.push(route.request().postDataJSON());started.resolve();await release.promise;const response=await claimArrival(new Request(route.request().url(),{method:'POST',body:route.request().postData()}),r.env,{uid:'m',email:'member@example.invalid',emailVerified:true},'https://e36united.cz');return route.fulfill({status:response.status,headers:{'Access-Control-Allow-Origin':'*'},body:await response.text()})});
 try{
  await page.goto('/member.html?mode=login&section=garage#arrival-invite='+token);await submitAccountForm(page);await started.promise;await expect(page.locator('[data-arrival-invite]')).toBeVisible();
  if(action==='history'){
   // Recreate the prior in-document Account -> Garage history before using the browser's Back control.
   await page.evaluate(()=>{const current=location.href;history.replaceState(history.state,'',location.pathname+'?section=account'+location.hash);history.pushState(history.state,'',current)});await page.goBack();await expectCompletedAccount(page,'account');
  }else{await page.keyboard.press('Escape');await page.locator('.member-sidebar-logout').click();await expect(page.locator('[data-auth-view]')).toBeVisible()}
  await expect(page.locator('[data-arrival-invite]')).toHaveCount(0);const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/arrivals/claim'&&r.request().method()==='POST');release.resolve();await (await response).finished();await renderOpportunity(page);
  if(action==='history')await expectCompletedAccount(page,'account');else{await expect(page.locator('[data-auth-view]')).toBeVisible();await expect(page.locator('[data-app-view]')).toBeHidden()}
  await expect(page.locator('[data-arrival-invite]')).toHaveCount(0);expect(bodies).toEqual([{token,preview:true}]);expect(r.db.prepare("SELECT consumed_at FROM arrival_invitations WHERE id='invite'").get().consumed_at).toBeNull();expect(r.db.prepare("SELECT member_id FROM event_arrivals WHERE id='invite-arrival'").get().member_id).toBeNull();expectNoUnexpectedClientErrors(o);
 }finally{release.resolve();await page.close();r.db.close()}
});


test('a late Planner promotion cannot restore the previous account after logout and another login',async({page})=>{
 const o=await prepareE2ePage(page,{member:{id:'m',email:'member@example.invalid'},cars:[],preliminaryEnabled:true}),r=memberRuntime();
 r.db.exec("UPDATE events SET year=2028,is_current=0 WHERE id='e'; INSERT INTO events(id,year,title,is_current) VALUES('united-2026',2026,'United 2026',1)");
 const started=Promise.withResolvers(),release=Promise.withResolvers();let actor='m',putCount=0;
 await page.route('https://api.e36united.cz/api/planner-draft',async route=>{
  const request=route.request();if(request.method()==='OPTIONS')return route.fallback();const uid=actor;
  if(request.method()==='PUT'){putCount++;started.resolve();await release.promise}
  const response=request.method()==='PUT'?await putPlannerDraft(new Request(request.url(),{method:'PUT',body:request.postData()}),r.env,{uid},'https://e36united.cz'):await getPlannerDraft(r.env,{uid},'https://e36united.cz');
  return route.fulfill({status:response.status,headers:{'Access-Control-Allow-Origin':'*'},body:await response.text()});
 });
 try{
  await page.goto('/index.html#planer');await page.locator('[data-stay-index="2"]').click();await page.locator('.planner-shell').getByRole('button',{name:/Bez ubytování/}).click();await page.locator('[data-people-plus]').click();await page.locator('[data-planner-mail]').click();await page.locator('[data-planner-login]').click();await submitAccountForm(page);await started.promise;
  await expect(page.locator('[data-app-view]')).toBeVisible();const intro=page.locator('[data-onboarding-intro-modal]');await expect(intro).toBeVisible();await intro.getByRole('button',{name:'Zavřít úvod',exact:true}).click();await expect(intro).toBeHidden();await page.locator('.member-sidebar-logout').click();await expect(page.locator('[data-auth-view]')).toBeVisible();actor='n';await o.switchMember({id:'n',email:'other@example.invalid',name:'Second Account',nickname:'Second'});await submitAccountForm(page);await expectCompletedAccount(page);
  const response=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/planner-draft'&&response.request().method()==='PUT');release.resolve();await (await response).finished();await renderOpportunity(page);
  await expectCompletedAccount(page);await expect(page.locator('[data-planner-handoff]')).toBeHidden();await expect(page.locator('[data-member-hero]')).toContainText('Second');
  expect(putCount).toBe(1);expect(r.db.prepare('SELECT member_id FROM member_planner_drafts').all()).toEqual([{member_id:'m'}]);expect(o.requests.filter(request=>request==='POST /api/planner-handoffs/claim')).toEqual([]);for(const key of ['reservationWrites','preliminaryWrites','carWrites'])expect(o[key]).toEqual([]);expectNoUnexpectedClientErrors(o);
 }finally{release.resolve();await page.close();r.db.close()}
});


test('successful memory-only account use updates another tab without replacing its registration form',async({page,context})=>{
 const first=await prepareE2ePage(page,{authMemoryOnly:true});await page.goto('/member.html?mode=register');const register=page.locator('[data-auth-form=register]');await expect(register).toBeVisible();await register.locator('[name=name]').fill('Unsent registration');await expect(page.locator('.site-header .nav-member')).toHaveText('Registrovat se');
 const other=await context.newPage();try{
  const second=await prepareE2ePage(other,{authMemoryOnly:true});await other.goto('/member.html?mode=login');await submitAccountForm(other);await expectCompletedAccount(other);await expect(other.locator('[data-memory-session-notice]')).toBeVisible();
  await expect(page.locator('.site-header .nav-member')).toHaveText('Přihlásit se');await expect(register).toBeVisible();await expect(register.locator('[name=name]')).toHaveValue('Unsent registration');await expect(page.locator('[data-auth-form=login]')).toBeHidden();expect(await page.evaluate(key=>localStorage.getItem(key),usedAccountKey)).toBe('1');expect(first.profileWrites).toEqual([]);expect(second.profileWrites).toEqual([]);expectNoUnexpectedClientErrors(first);expectNoUnexpectedClientErrors(second);
 }finally{await other.close()}
});


for(const kind of ['valid','invalid'])test(`late Planner promotion preserves newer ${kind} visible edits`,async({page},testInfo)=>{
 const o=await prepareE2ePage(page,{member:{id:'m',email:'member@example.invalid'},preliminaryEnabled:true}),r=memberRuntime();r.db.exec("UPDATE events SET year=2028,is_current=0 WHERE id='e'; INSERT INTO events(id,year,title,is_current) VALUES('united-2026',2026,'United 2026',1)");
 const initialStarted=Promise.withResolvers(),initialRelease=Promise.withResolvers(),editorStarted=Promise.withResolvers(),editorRelease=Promise.withResolvers();const writes=[];
 await page.route('https://api.e36united.cz/api/planner-draft',async route=>{
  const request=route.request();if(request.method()==='OPTIONS')return route.fallback();const body=request.method()==='PUT'?request.postDataJSON():null;
  if(body){writes.push(body.draft);if(body.draft.editor){editorStarted.resolve();await editorRelease.promise}else{initialStarted.resolve();await initialRelease.promise}}
  const response=body?await putPlannerDraft(new Request(request.url(),{method:'PUT',body:request.postData()}),r.env,{uid:'m'},'https://e36united.cz'):await getPlannerDraft(r.env,{uid:'m'},'https://e36united.cz');
  return route.fulfill({status:response.status,headers:{'Access-Control-Allow-Origin':'*'},body:await response.text()});
 });
 const fields=()=>page.locator('[data-reservation-form]').evaluate(form=>({crew:form.elements.crew.value,note:form.elements.note.value,arrival:form.elements.arrival.value,sleep:form.elements.sleep.value,noteFocused:document.activeElement===form.elements.note,selectionStart:form.elements.note.selectionStart,selectionEnd:form.elements.note.selectionEnd,url:location.href}));
 try{
  await page.goto('/index.html#planer');await page.locator('[data-stay-index="2"]').click();await page.locator('.planner-shell').getByRole('button',{name:/Bez ubytování/}).click();await page.locator('[data-people-plus]').click();await page.locator('[data-planner-mail]').click();await page.locator('[data-planner-login]').click();await submitAccountForm(page);await initialStarted.promise;await expect(page.locator('[data-app-view]')).toBeVisible();
  await page.locator('.member-sidebar [data-member-section=reservation]').click();await page.locator('[data-member-plan-open]').click();const modal=page.locator('[data-member-planner-modal]');await expect(modal).toBeVisible();
  if(kind==='valid'){const count=Number(await modal.locator('[data-member-crew]').innerText());for(let i=count;i<5;i++)await modal.locator('[data-member-crew-plus]').click()}
  const note=modal.locator('[name=note]'),status=modal.locator('[data-planner-draft-status]');await note.fill(kind==='valid'?'NEW USER CHOICE':'x'.repeat(1001));
  if(kind==='valid')await editorStarted.promise;else{await expect(status).toContainText('Rozpracované údaje zatím nelze uložit');expect(writes.filter(draft=>draft.editor)).toEqual([])}
  const before=await fields();expect(before.noteFocused).toBe(true);const initialResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/planner-draft'&&response.request().method()==='PUT'&&!response.request().postDataJSON().draft.editor);initialRelease.resolve();await (await initialResponse).finished();await renderOpportunity(page);const after=await fields();
  await testInfo.attach('pending-promotion-visible-edit',{body:JSON.stringify({kind,before,after,writes},null,2),contentType:'application/json'});await expect(modal).toBeVisible();expect(after).toEqual(before);expect(o.requests.filter(request=>request==='POST /api/planner-handoffs/claim')).toEqual([]);
  const editorResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/planner-draft'&&response.request().method()==='PUT'&&!!response.request().postDataJSON().draft.editor);
  if(kind==='invalid'){await expect(status).toContainText('Rozpracované údaje zatím nelze uložit');await expect(status).not.toContainText('Rozpracovaný plán uložen');await note.fill('RECOVERED USER CHOICE')}
  editorRelease.resolve();await (await editorResponse).finished();await expect(status).toHaveText('Rozpracovaný plán uložen');const saved=JSON.parse(r.db.prepare("SELECT payload_json FROM member_planner_drafts WHERE member_id='m'").get().payload_json),current=await fields();
  expect(saved.editor.note).toBe(kind==='valid'?'NEW USER CHOICE':'RECOVERED USER CHOICE');expect(current.note).toBe(saved.editor.note);expect(Number(current.crew)).toBe(saved.crew);expect(current.arrival).toBe(before.arrival);expect(current.sleep).toBe(before.sleep);expect(current.url).toBe(before.url);for(const key of ['reservationWrites','preliminaryWrites','carWrites'])expect(o[key]).toEqual([]);expectNoUnexpectedClientErrors(o);
 }finally{initialRelease.resolve();editorRelease.resolve();await page.close();r.db.close()}
});
