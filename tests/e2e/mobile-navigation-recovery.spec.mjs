import {test,expect} from '@playwright/test';
import {prepareE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';

test('mobile navigation remains usable across mixed navigation, history and a reload with an open menu',async({page})=>{
 const observations=await prepareE2ePage(page);
 await page.setViewportSize({width:390,height:740});
 await page.goto('/');await page.locator('.site-header .mobile-auth-link').click();await page.locator('[data-auth-tab=login]').click();const login=page.locator('[data-auth-form=login]');await login.locator('[name=email]').fill('eva@example.test');await login.locator('[name=password]').fill('isolated-password');await login.locator('[type=submit]').click();
 const panel=id=>page.locator(`[data-member-panel=${id}]`);
 const bottom=id=>page.locator(`.member-bottom-nav [data-mobile-section=${id}]`);
 const menu=page.locator('.united-mobile-menu');
 await expect(panel('overview')).toBeVisible();
 for(const id of ['reservation','overview','reservation','payments']){await bottom(id).click();await expect(panel(id)).toBeVisible()}
 await page.locator('[data-mobile-menu]').click();await menu.getByRole('button',{name:'Zavřít menu'}).click();await expect(menu).toBeHidden();
 await page.goForward();await expect(menu).toBeHidden();await expect(panel('payments')).toBeVisible();
 await page.locator('[data-mobile-menu]').click();await menu.locator('[data-mobile-section=club]').click();await expect(panel('club')).toBeVisible();
 await page.goBack();await expect(panel('payments')).toBeVisible();await page.goForward();await expect(panel('club')).toBeVisible();
 await bottom('payments').click();await expect(panel('payments')).toBeVisible();
 await page.locator('[data-mobile-menu]').click();await expect(menu).toBeVisible();
 await page.reload();await expect(panel('payments')).toBeVisible();
 await page.locator('[data-mobile-menu]').click();await menu.locator('[data-mobile-section=club]').click();
 await expect(menu).toBeHidden();await expect(panel('club')).toBeVisible();
 await bottom('overview').click();await expect(panel('overview')).toBeVisible();
 await page.locator('.site-header .menu-btn').click();await menu.locator('[data-mobile-section=payments]').click();await expect(panel('payments')).toBeVisible();
 expect(await page.evaluate(()=>({menuLock:document.body.classList.contains('united-menu-open'),inert:document.querySelector('[data-app-view]').inert,modal:!!document.querySelector('.united-mobile-menu:modal')}))).toEqual({menuLock:false,inert:false,modal:false});
 expectNoUnexpectedClientErrors(observations);
});

test('slow failed Club read cannot lock other agendas after session restoration',async({page})=>{
 const o=await prepareE2ePage(page,{authenticated:true,ignoreConsoleError:e=>e.url.endsWith('/api/united-club')&&e.text.includes('503')});
 const started=Promise.withResolvers(),release=Promise.withResolvers();
 await page.route('**/api/united-club',async route=>{if(route.request().method()==='OPTIONS')return route.fallback();started.resolve();await release.promise;return route.fulfill({status:503,json:{message:'controlled_club_failure'},headers:{'Access-Control-Allow-Origin':'*'}})});
 try{
  await page.setViewportSize({width:360,height:520});await page.goto('/member.html?section=payments');await started.promise;await expect(page.locator('[data-member-panel=payments]')).toBeVisible();
  for(const id of ['overview','reservation','payments']){await page.locator(`.member-bottom-nav [data-mobile-section=${id}]`).click();await expect(page.locator(`[data-member-panel=${id}]`)).toBeVisible()}
  await page.locator('[data-mobile-menu]').click();await page.locator('.united-mobile-menu [data-mobile-section=club]').click();await expect(page.locator('[data-member-panel=club]')).toBeVisible();
  const response=page.waitForResponse(r=>r.url().endsWith('/api/united-club')&&r.status()===503);release.resolve();await response;
  await page.locator('.member-bottom-nav [data-mobile-section=payments]').click();await expect(page.locator('[data-member-panel=payments]')).toBeVisible();await page.locator('[data-mobile-menu]').click();await page.locator('.united-mobile-menu [data-mobile-section=account]').click();await expect(page.locator('[data-member-panel=account]')).toBeVisible();expectNoUnexpectedClientErrors(o);
 }finally{release.resolve()}
});

test('an abandoned deferred menu action cannot navigate a restored session',async({page})=>{
 const o=await prepareE2ePage(page,{authenticated:true});
 await page.addInitScript(()=>{const frame=window.requestAnimationFrame;window.requestAnimationFrame=function(callback){if(callback.toString().includes('epoch!==actionEpoch')){window.__heldMenuAction=callback;return 0}return frame.call(this,callback)}});
 await page.setViewportSize({width:390,height:740});await page.goto('/member.html?section=payments');await expect(page.locator('[data-member-panel=payments]')).toBeVisible();await page.locator('[data-mobile-menu]').click();await page.locator('.united-mobile-menu [data-mobile-section=club]').click();await expect(page.locator('.united-mobile-menu')).toBeHidden();await expect.poll(()=>page.evaluate(()=>typeof window.__heldMenuAction)).toBe('function');
 await page.evaluate(async()=>{const auth=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');await auth.signOut()});await expect(page.locator('[data-auth-view]')).toBeVisible();
 await page.evaluate(async()=>{const auth=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');await auth.signInWithEmailAndPassword()});await expect(page.locator('[data-member-panel=payments]')).toBeVisible();
 await page.evaluate(()=>window.__heldMenuAction());await expect(page.locator('[data-member-panel=payments]')).toBeVisible();await page.locator('.member-bottom-nav [data-mobile-section=overview]').click();await expect(page.locator('[data-member-panel=overview]')).toBeVisible();expectNoUnexpectedClientErrors(o);
});

test('short mobile menu with enlarged labels keeps close and logout reachable',async({page})=>{
 const o=await prepareE2ePage(page,{authenticated:true});await page.setViewportSize({width:360,height:420});await page.goto('/member.html');await expect(page.locator('[data-member-panel=overview]')).toBeVisible();await page.locator('[data-mobile-menu]').click();
 await page.addStyleTag({content:'.united-mobile-menu .member-nav-label strong{font-size:19px!important}.united-mobile-menu .member-nav-reservation-status{font-size:15px!important}'});
 const menu=page.locator('.united-mobile-menu'),close=menu.getByRole('button',{name:'Zavřít menu',exact:true}),logout=menu.locator('[data-menu-logout]');
 expect((await menu.boundingBox()).height).toBeLessThanOrEqual(404);await logout.scrollIntoViewIfNeeded();await expect(logout).toBeInViewport();await expect(close).toBeInViewport();expect((await logout.boundingBox()).height).toBeGreaterThanOrEqual(44);await close.click();await expect(menu).toBeHidden();await page.locator('[data-mobile-menu]').click();await menu.locator('[data-mobile-section=photos]').click();await expect(page.locator('[data-member-panel=photos]')).toBeVisible();expectNoUnexpectedClientErrors(o);
});

test('a deferred menu selection cannot overwrite a newer bottom-navigation choice',async({page})=>{
 const o=await prepareE2ePage(page,{authenticated:true});await page.addInitScript(()=>{const frame=window.requestAnimationFrame;window.requestAnimationFrame=function(callback){if(callback.toString().includes('epoch!==actionEpoch')){window.__heldMenuAction=callback;return 0}return frame.call(this,callback)}});
 await page.setViewportSize({width:390,height:740});await page.goto('/member.html?section=payments');await expect(page.locator('[data-member-panel=payments]')).toBeVisible();await page.locator('[data-mobile-menu]').click();await page.locator('.united-mobile-menu [data-mobile-section=club]').click();await expect(page.locator('.united-mobile-menu')).toBeHidden();await expect.poll(()=>page.evaluate(()=>typeof window.__heldMenuAction)).toBe('function');
 await page.locator('.member-bottom-nav [data-mobile-section=reservation]').click();await expect(page.locator('[data-member-panel=reservation]')).toBeVisible();await page.evaluate(()=>window.__heldMenuAction());await expect(page.locator('[data-member-panel=reservation]')).toBeVisible();expectNoUnexpectedClientErrors(o);
});
