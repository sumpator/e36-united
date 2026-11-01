import {test,expect} from '@playwright/test';
import {prepareE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';

const account=page=>page.locator('.site-header .nav-links .nav-member');
const benefit=page=>page.locator('[data-member-merch-benefit]');
const sdk='https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
const signedIn=page=>expect(account(page)).toHaveText('Můj United účet');
async function login(page){
 const form=page.locator('[data-auth-form=login]');await expect(form).toBeVisible();
 await form.locator('[name=email]').fill('isolated@example.test');await form.locator('[name=password]').fill('isolated-password');await form.locator('[type=submit]').click();
 await expect(page.locator('[data-app-view]')).toBeVisible();
}

test('one login survives reload, public pages, Back, a new tab and cross-tab logout',async({page,context})=>{
 const o=await prepareE2ePage(page);await page.goto('/member.html?mode=login&section=garage');await login(page);
 await page.reload();await expect(page.locator('[data-member-panel=garage]')).toBeVisible();
 for(const path of ['/index.html','/galerie.html','/merch.html']){await page.goto(path);await signedIn(page)}
 await expect(benefit(page)).toHaveAttribute('data-benefit-state','member');await expect(page.locator('[data-benefit-points]')).toHaveText('7');
 const other=await context.newPage(),otherO=await prepareE2ePage(other);await other.goto('/merch.html');await signedIn(other);await expect(benefit(other)).toHaveAttribute('data-benefit-state','member');
 await page.goto('/member.html?section=garage');await expect(page.locator('[data-member-panel=garage]')).toBeVisible();await page.goBack();await signedIn(page);await expect(benefit(page)).toHaveAttribute('data-benefit-state','member');await page.goForward();await expect(page.locator('[data-member-panel=garage]')).toBeVisible();
 const secondPortal=await context.newPage(),portalO=await prepareE2ePage(secondPortal);await secondPortal.goto('/member.html?section=garage');await expect(secondPortal.locator('[data-member-panel=garage]')).toBeVisible();
 await page.locator('.member-sidebar-logout').click();await expect(page.locator('[data-auth-view]')).toBeVisible();
 await expect(account(other)).toHaveText('Přihlásit se');await expect(benefit(other)).toHaveAttribute('data-benefit-state','anonymous');await expect(secondPortal.locator('[data-app-view]')).toBeHidden();await expect(secondPortal.locator('[data-auth-view]')).toBeVisible();
 for(const observed of [o,otherO,portalO])expectNoUnexpectedClientErrors(observed);
});

for(const path of ['/member.html?section=garage','/merch.html'])test(`blocked SDK is an error and explicit retry preserves session and URL: ${path}`,async({page},info)=>{
 const o=await prepareE2ePage(page,{authenticated:true});let blocked=true;const failed=[];page.on('requestfailed',request=>{if(request.url()===sdk)failed.push(request.failure()?.errorText)});
 await page.route(sdk,route=>blocked?route.abort('blockedbyclient'):route.fallback());
 await page.goto(path);const notice=path.startsWith('/member')?page.locator('[data-auth-status-copy]'):page.locator('[data-public-auth-notice]');
 await expect(notice).toContainText('Přihlašovací službu se nepodařilo načíst');
 if(path.startsWith('/merch')){await expect(account(page)).toHaveText('Účet');await expect(benefit(page)).toHaveAttribute('data-benefit-state','error');await expect(page.locator('[data-benefit-anonymous]')).toBeHidden()}
 if(path.startsWith('/merch'))for(const theme of ['light','dark'])for(const width of [360,1440]){await page.setViewportSize({width,height:900});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await expect(notice.locator('button')).toHaveCSS('background-color',await notice.evaluate(el=>getComputedStyle(el).backgroundColor));const colors=await notice.locator('button').evaluate(el=>{const s=getComputedStyle(el);return{color:s.color,background:s.backgroundColor,surface:s.getPropertyValue('--surface'),ink:s.getPropertyValue('--text')}});const lum=color=>color.match(/[0-9.]+/g).slice(0,3).map(n=>Number(n)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);const a=lum(colors.color),b=lum(colors.background);expect((Math.max(a,b)+.05)/(Math.min(a,b)+.05),JSON.stringify(colors)).toBeGreaterThanOrEqual(4.5);await page.screenshot({path:info.outputPath(`sdk-error-${theme}-${width}.png`)})}
 const url=page.url();blocked=false;
 if(path.startsWith('/member'))await page.locator('[data-auth-retry]').click();else await notice.getByRole('button',{name:'Obnovit načtení'}).click();
 await expect(page).toHaveURL(url);
 if(path.startsWith('/member'))await expect(page.locator('[data-member-panel=garage]')).toBeVisible();else{await signedIn(page);await expect(benefit(page)).toHaveAttribute('data-benefit-state','member');await expect(notice).toHaveCount(0)}
 // Only this deliberately aborted SDK and its precisely identified initialization
 // error are expected. Other console failures and all unknown APIs still fail.
 const expected=o.consoleErrors.filter(e=>e.url===sdk||e.text.startsWith('Firebase Auth initialization failed')||(e.text.includes(sdk)&&e.text.includes('CORS request did not succeed')));
 expect(failed.length).toBeGreaterThan(0);
 expectNoUnexpectedClientErrors({...o,consoleErrors:o.consoleErrors.filter(e=>!expected.includes(e))});
 await info.attach('blocked-sdk-recovered',{body:JSON.stringify({path,recovered:true}),contentType:'application/json'});
});

test('points API failure keeps the authenticated menu and retries only the read',async({page})=>{
 const o=await prepareE2ePage(page,{authenticated:true});let fail=true;
 await page.route('https://api.e36united.cz/api/united-club',route=>route.request().method()==='OPTIONS'?route.fallback():fail?route.fulfill({status:503,headers:{'Access-Control-Allow-Origin':'*'},json:{error:'controlled_unavailable'}}):route.fallback());
 await page.goto('/merch.html');await signedIn(page);await expect(benefit(page)).toHaveAttribute('data-benefit-state','error');await expect(page.locator('[data-benefit-loading]')).toContainText('Body se nepodařilo načíst');await expect(page.locator('[data-benefit-anonymous]')).toBeHidden();
 fail=false;await benefit(page).getByRole('button',{name:'Zkusit znovu'}).click();await expect(benefit(page)).toHaveAttribute('data-benefit-state','member');await expect(page.locator('[data-benefit-points]')).toHaveText('7');await signedIn(page);
 expectNoUnexpectedClientErrors({...o,consoleErrors:o.consoleErrors.filter(e=>!(e.url==='https://api.e36united.cz/api/united-club'&&e.text.includes('503')))});
});

test('held points request ends at ten seconds and late completion cannot undo logout',async({page,context})=>{
 const o=await prepareE2ePage(page,{authenticated:true});await page.clock.install();const started=Promise.withResolvers(),release=Promise.withResolvers();let held=true;
 await page.route('https://api.e36united.cz/api/united-club',async route=>{if(route.request().method()==='OPTIONS')return route.fallback();if(held){started.resolve();await release.promise}return route.fallback()});
 const other=await context.newPage(),otherO=await prepareE2ePage(other,{authenticated:true});await other.goto('/member.html?section=garage');await expect(other.locator('[data-member-panel=garage]')).toBeVisible();
 try{
  await page.goto('/merch.html',{waitUntil:'domcontentloaded'});await started.promise;await signedIn(page);await expect(benefit(page)).toHaveAttribute('data-benefit-state','loading');
  await page.clock.runFor(10_000);await expect(benefit(page)).toHaveAttribute('data-benefit-state','error');await signedIn(page);await expect(benefit(page).getByRole('button',{name:'Zkusit znovu'})).toBeVisible();
  await other.locator('.member-sidebar-logout').click();await expect(benefit(page)).toHaveAttribute('data-benefit-state','anonymous');
  held=false;release.resolve();await page.clock.runFor(1);await expect(benefit(page)).toHaveAttribute('data-benefit-state','anonymous');await expect(account(page)).toHaveText('Přihlásit se');
  expectNoUnexpectedClientErrors(o);expectNoUnexpectedClientErrors(otherO);
 }finally{release.resolve()}
});

test('simulated memory-only persistence is explained on public pages in both themes',async({page},info)=>{
 const o=await prepareE2ePage(page,{authMemoryOnly:true});await page.goto('/member.html?mode=login&section=garage');await login(page);
 await page.goto('/merch.html');await expect(benefit(page)).toHaveAttribute('data-benefit-state','anonymous');
 // A page-only session cannot cross navigation. Authenticate on this same page
 // through the SDK harness, then inspect the real shared UI controllers.
 await page.evaluate(async()=>{const m=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');await m.signInWithEmailAndPassword(m.getAuth(),'isolated@example.test','isolated-password')});
 await signedIn(page);await expect(benefit(page)).toHaveAttribute('data-benefit-state','member');
 const notice=page.locator('[data-public-auth-notice]');await expect(notice).toContainText('Přihlášení platí jen na této stránce');
 for(const theme of ['light','dark'])for(const width of [360,1440]){
  await page.setViewportSize({width,height:900});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await expect(notice).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath(`limited-${theme}-${width}.png`)});
 }
 expectNoUnexpectedClientErrors(o);
});
