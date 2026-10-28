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

test('slow optional Club and photo reads do not block the usable account',async({page})=>{
 const observed=await prepareE2ePage(page,{authenticated:true});const release=Promise.withResolvers();const pending=new Set();
 await page.route(/https:\/\/api\.e36united\.cz\/api\/(united-club|gallery\/mine)/,async route=>{if(route.request().method()==='OPTIONS')return route.fallback();pending.add(new URL(route.request().url()).pathname);await release.promise;return route.fallback()});
 try{await page.goto('/member.html?section=garage',{waitUntil:'domcontentloaded'});await expect(page.locator('[data-member-panel=garage]')).toBeVisible();await expect.poll(()=>pending.size).toBe(2);expectNoUnexpectedClientErrors(observed)}finally{release.resolve()}
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
