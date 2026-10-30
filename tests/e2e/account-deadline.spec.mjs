import {test,expect} from '@playwright/test';
import {prepareE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';

for(const stage of ['SDK','profile','cars'])test(`account total deadline includes ${stage} and retry rejects late work`,async({page})=>{
 const observed=await prepareE2ePage(page,{authenticated:true});await page.clock.install();
 const expectedErrors=[];page.on('console',message=>{if(message.type()==='error'&&message.text().startsWith('Firebase Auth initialization failed'))expectedErrors.push(message.args()[1].evaluate(error=>error.message))});
 const started=Promise.withResolvers(),release=Promise.withResolvers();let held=true;
 const pattern=stage==='SDK'?'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js':`https://api.e36united.cz/api/${stage==='profile'?'me':'cars'}**`;
 await page.route(pattern,async route=>{if(route.request().method()==='OPTIONS')return route.fallback();if(held){started.resolve();await release.promise}return route.fallback()});
 try{
  await page.goto('/member.html?section=garage',{waitUntil:'domcontentloaded'});await started.promise;
  await page.clock.runFor(5_000);await expect(page.locator('[data-auth-status-title]')).toHaveText('Připojení trvá déle.');
  await page.clock.runFor(5_000);await expect(page.locator('[data-auth-retry]')).toBeVisible();await expect(page.locator('[data-app-view]')).toBeHidden();
  held=false;release.resolve();await page.clock.runFor(1);await expect(page.locator('[data-app-view]')).toBeHidden();
  await page.locator('[data-auth-retry]').click();await expect(page.locator('[data-member-panel=garage]')).toBeVisible();expect(await Promise.all(expectedErrors)).toEqual(stage==='SDK'?['auth_startup_timeout']:[]);expectNoUnexpectedClientErrors({...observed,consoleErrors:observed.consoleErrors.filter(e=>!(stage==='SDK'&&e.text.startsWith('Firebase Auth initialization failed')))});
 }finally{release.resolve()}
});

test('explicit login allows logout while an optional invitation read is pending',async({page})=>{
 const observed=await prepareE2ePage(page);const started=Promise.withResolvers(),release=Promise.withResolvers();
 await page.route('https://api.e36united.cz/api/arrivals/claim',async route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS'}});
  expect(route.request().postDataJSON()).toEqual({token:'isolated-invitation',preview:true});started.resolve();await release.promise;
  return route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},json:{preview:{model:'Isolated E36',eventId:'united-2026'},alreadyLinked:false}});
 });
 try{
  await page.goto('/member.html?mode=login&section=garage#arrival-invite=isolated-invitation');const form=page.locator('[data-auth-form=login]');await expect(form).toBeVisible();
  await form.locator('[name=email]').fill('isolated@example.test');await form.locator('[name=password]').fill('isolated-password');await form.locator('[type=submit]').click();
  await started.promise;await expect(page.locator('[data-app-view]')).toBeVisible();await page.locator('[data-invite-close]').click();
  await page.locator('.member-sidebar-logout').click();await expect(page.locator('[data-auth-view]')).toBeVisible();
  release.resolve();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(page.locator('[data-auth-view]')).toBeVisible();await expect(page.locator('[data-app-view]')).toBeHidden();await expect(page.locator('[data-arrival-invite]')).toHaveCount(0);await page.locator('[data-auth-tab=login]').click();await expect(page.locator('[data-auth-form=login] [type=submit]')).toBeEnabled();expectNoUnexpectedClientErrors(observed);
 }finally{release.resolve()}
});

test('SDK plus profile share ten seconds instead of adding their own deadlines',async({page})=>{
 const observed=await prepareE2ePage(page,{authenticated:true});await page.clock.install();
 const sdkStarted=Promise.withResolvers(),sdkRelease=Promise.withResolvers(),profileStarted=Promise.withResolvers(),profileRelease=Promise.withResolvers();
 await page.route('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js',async route=>{sdkStarted.resolve();await sdkRelease.promise;return route.fallback()});
 await page.route('https://api.e36united.cz/api/me',async route=>{if(route.request().method()==='OPTIONS')return route.fallback();profileStarted.resolve();await profileRelease.promise;return route.fallback()});
 try{
  await page.goto('/member.html',{waitUntil:'domcontentloaded'});await sdkStarted.promise;await page.clock.runFor(6_000);sdkRelease.resolve();await profileStarted.promise;
  await page.clock.runFor(4_000);await expect(page.locator('[data-auth-retry]')).toBeVisible();await expect(page.locator('[data-app-view]')).toBeHidden();
  profileRelease.resolve();await page.clock.runFor(1);await expect(page.locator('[data-app-view]')).toBeHidden();expectNoUnexpectedClientErrors(observed);
 }finally{sdkRelease.resolve();profileRelease.resolve()}
});

test('a reservation response from an expired attempt cannot change a successful retry',async({page})=>{
 const observed=await prepareE2ePage(page,{authenticated:true,registrationOpen:true});await page.clock.install();
 const started=Promise.withResolvers(),release=Promise.withResolvers(),fulfilled=Promise.withResolvers();let reads=0;
 await page.route('https://api.e36united.cz/api/reservations/current',async route=>{
  if(route.request().method()==='OPTIONS')return route.fallback();reads++;if(reads!==1)return route.fallback();
  started.resolve();await release.promise;await route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},json:{registrationOpen:false,event:{id:'united-2025',year:2025,title:'Old event'},reservation:null,accommodationOptions:[]}});fulfilled.resolve();
 });
 try{
  await page.goto('/member.html?section=reservation');await started.promise;await page.clock.runFor(10_000);await expect(page.locator('[data-auth-retry]')).toBeVisible();
  await page.locator('[data-auth-retry]').click();await expect(page.locator('[data-member-panel=reservation]')).toBeVisible();await expect(page.locator('[data-reservation-year]')).toHaveText('2026');await page.getByRole('button',{name:'Zavřít úvod',exact:true}).click();
  release.resolve();await fulfilled.promise;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.locator('[data-member-panel=reservation]').getByRole('button',{name:'Vyplnit registraci'}).click();await expect(page.locator('[data-member-planner-modal]')).toBeVisible();await expect(page.locator('[data-reservation-year]')).toHaveText('2026');expect(reads).toBe(2);expectNoUnexpectedClientErrors(observed);
 }finally{release.resolve()}
});

test('slow optional Club and photo reads do not block the usable account',async({page})=>{
 const observed=await prepareE2ePage(page,{authenticated:true});const release=Promise.withResolvers();const pending=new Set();
 await page.route(/https:\/\/api\.e36united\.cz\/api\/(united-club|gallery\/mine)/,async route=>{if(route.request().method()==='OPTIONS')return route.fallback();pending.add(new URL(route.request().url()).pathname);await release.promise;return route.fallback()});
 try{await page.goto('/member.html?section=garage',{waitUntil:'domcontentloaded'});await expect(page.locator('[data-member-panel=garage]')).toBeVisible();await expect.poll(()=>pending.size).toBe(2);await expect(page.locator('[data-photos-loading-state]')).toHaveText('Načítám tvoje fotografie…');await expect(page.locator('[data-member-gallery-list]')).toBeHidden();expectNoUnexpectedClientErrors(observed)}finally{release.resolve()}
});

test('pending Club shows unknown values, then confirmed points; read failure offers retry without claiming zero',async({page})=>{
 const observed=await prepareE2ePage(page,{authenticated:true});const started=Promise.withResolvers(),release=Promise.withResolvers();let fail=true;
 await page.route('https://api.e36united.cz/api/united-club',async route=>{
  if(route.request().method()==='OPTIONS')return route.fallback();started.resolve();await release.promise;
  return fail?route.fulfill({status:403,headers:{'Access-Control-Allow-Origin':'*'},json:{message:'Controlled Club read unavailable'}}):route.fallback();
 });
 try{
  await page.goto('/member.html?section=club&clubTab=points');await started.promise;await expect(page.locator('[data-app-view]')).toBeVisible();
  await expect(page.locator('[data-club-loading-state]')).toHaveText('Načítám United Club…');await expect(page.locator('[data-overview-points]')).toHaveText('—');await expect(page.locator('[data-points-journey-score]')).toBeHidden();
  release.resolve();await expect(page.locator('[data-member-panel=club] [data-domain-retry-state=club]')).toContainText('nelze načíst');await expect(page.locator('[data-overview-points]')).toHaveText('—');await expect(page.locator('[data-points-journey-score]')).toBeHidden();
  fail=false;await page.locator('[data-member-panel=club] [data-domain-retry-state=club]').getByRole('button',{name:'Zkusit znovu'}).click();
  await expect(page.locator('[data-points-journey-score]')).toHaveText('7');await expect(page.locator('[data-points-journey-score]')).toBeVisible();await expect(page.locator('[data-overview-points]')).toHaveText('7');await expect(page.locator('[data-club-loading-state]')).toHaveCount(0);
  expectNoUnexpectedClientErrors({...observed,consoleErrors:observed.consoleErrors.filter(e=>!(e.url.endsWith('/api/united-club')&&e.text.includes('403')))});
 }finally{release.resolve()}
});

test('uncertain account bootstrap times out honestly and retry reads the existing account',async({page})=>{
 const observed=await prepareE2ePage(page);await page.clock.install();const started=Promise.withResolvers(),release=Promise.withResolvers();let writes=0;
 await page.route('https://api.e36united.cz/api/bootstrap',async route=>{if(route.request().method()==='OPTIONS')return route.fallback();writes++;started.resolve();await release.promise;return route.fallback()});
 try{
  await page.goto('/member.html?mode=register&section=garage');const form=page.locator('[data-auth-form=register]');await expect(form).toBeVisible();
  await form.locator('[name=name]').fill('Isolated Driver');await form.locator('[name=email]').fill('isolated@example.test');await form.locator('[name=password]').fill('isolated-password');await form.locator('[name=passwordConfirm]').fill('isolated-password');await form.getByRole('checkbox').check();await form.locator('[type=submit]').click();await started.promise;
  await page.clock.runFor(10_000);await expect(page.locator('[data-auth-status-copy]')).toContainText('mohl proběhnout');await expect(page.locator('[data-auth-retry]')).toBeVisible();expect(writes).toBe(1);
  release.resolve();await page.clock.runFor(1);await expect(page.locator('[data-app-view]')).toBeHidden();
  await page.locator('[data-auth-retry]').click();await expect(page.locator('[data-member-panel=garage]')).toBeVisible();expect(writes).toBe(1);
  expectNoUnexpectedClientErrors(observed);
 }finally{release.resolve()}
});

 test('late optional Club data preserves a profile draft and its focus',async({page})=>{
 const observed=await prepareE2ePage(page,{authenticated:true});const started=Promise.withResolvers(),release=Promise.withResolvers();
 await page.route('https://api.e36united.cz/api/united-club',async route=>{if(route.request().method()==='OPTIONS')return route.fallback();started.resolve();await release.promise;return route.fallback()});
 try{
 await page.goto('/member.html?section=account');await expect(page.locator('[data-member-panel=account]')).toBeVisible();await started.promise;
 const nickname=page.locator('[data-account-form] [name=nickname]');await nickname.fill('Rozepsaná přezdívka');await nickname.focus();await nickname.evaluate(el=>el.setSelectionRange(4,7));
 const response=page.waitForResponse(r=>r.url().endsWith('/api/united-club')&&r.request().method()==='GET');release.resolve();const club=await (await response).json();await expect(page.locator('[data-overview-points]')).toHaveText(String(club.points.available));
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await expect(nickname).toHaveValue('Rozepsaná přezdívka');await expect(nickname).toBeFocused();expect(await nickname.evaluate(el=>[el.selectionStart,el.selectionEnd])).toEqual([4,7]);expectNoUnexpectedClientErrors(observed);
 }finally{release.resolve()}
});
