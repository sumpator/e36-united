import {test,expect} from '@playwright/test';
import {prepareE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';
import {merchRuntime} from '../helpers/merch-runtime.mjs';
import {bridge} from './merch-bridge.mjs';

const account=page=>page.locator('.site-header .nav-links .nav-member');
const benefit=page=>page.locator('[data-member-merch-benefit]');
const sdk='https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
const publicLabels=['Program','Show & Shine','Naplánovat','O nás','Galerie','United Merch'];
const publicTargets=['index.html#experience','index.html#show-shine','index.html#planer','o-nas.html','galerie.html','merch.html'];
async function publicEntryReady(page){
 await expect(page.locator('.united-mobile-menu')).toBeAttached();
 if(/\/galerie(?:\.html)?$/.test(new URL(page.url()).pathname)){
  await expect(page.locator('[data-gallery-auth-state]')).toContainText('Pro upload se přihlas do Můj United');
  await expect(page.locator('[data-user-gallery-empty]')).toBeVisible();
 }
}
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

test('PUBLIC NAV standalone links and extensionless entries share the homepage menu',async({page})=>{
 await page.addInitScript(()=>{
  const samples=[];window.__publicAnchorSamples=samples;
  const sample=phase=>{
   if(samples.length>=120||!document.documentElement)return;
   const target=document.querySelector(['#experience','#show-shine','#planer'].includes(location.hash)?location.hash:'.public-site-header');
   samples.push({phase,time:performance.now(),url:location.href,ready:document.readyState,scrollY,viewport:{width:innerWidth,height:innerHeight},target:target?.getBoundingClientRect().toJSON(),scrollBehavior:getComputedStyle(document.documentElement).scrollBehavior,styles:[...document.querySelectorAll('link[rel=stylesheet]')].map(link=>({href:link.getAttribute('href'),loaded:Boolean(link.sheet)}))});
  };
  for(const event of ['DOMContentLoaded','load','scroll','resize','pageshow'])window.addEventListener(event,()=>sample(event),{passive:true});
  document.fonts.ready.then(()=>sample('fonts-ready'));
 });
 const o=await prepareE2ePage(page);await page.setViewportSize({width:1440,height:900});
 for(const path of ['/merch','/merch.html','/galerie','/galerie.html','/o-nas','/o-nas.html','/index.html']){
  await page.goto(path);await expect(account(page)).toHaveText('Registrovat se');await publicEntryReady(page);
  const nav=page.getByRole('navigation',{name:'Hlavní navigace',exact:true}),links=nav.locator('a');
  await expect(links).toHaveText([...publicLabels,'Registrovat se']);
  for(let i=0;i<6;i++)await expect(links.nth(i)).toHaveAttribute('href',path==='/index.html'&&i<3?publicTargets[i].replace('index.html',''):publicTargets[i]);
  await expect(nav.getByRole('link',{name:'Web',exact:true})).toHaveCount(0);
  if(path!=='/index.html')await expect(nav.locator('.active')).toHaveAttribute('aria-current','page');
  await expect(page.locator('.site-header .brand')).toHaveAttribute('href','index.html');
 }
 // Follow every Merch link through the actual page navigation, including anchors.
 for(let i=0;i<6;i++){
  await page.goto('/merch');await expect(account(page)).toHaveText('Registrovat se');await publicEntryReady(page);
  await page.getByRole('navigation',{name:'Hlavní navigace',exact:true}).getByRole('link',{name:publicLabels[i],exact:true}).click();
  await expect(page).toHaveURL(new RegExp('/'+publicTargets[i].replace('.','\\.').replace('#','\\#')+'$'));
  await publicEntryReady(page);
  if(i<3){
   try{await expect(page.locator('#'+publicTargets[i].split('#')[1])).toBeInViewport()}
   finally{await test.info().attach('public-anchor-'+i,{body:JSON.stringify(await page.evaluate(()=>window.__publicAnchorSamples)),contentType:'application/json'})}
  }
 }
 expectNoUnexpectedClientErrors(o);
});

for(const authenticated of [false,true])test(`PUBLIC NAV responsive menu hover focus and basket ${authenticated?'member':'visitor'}`,async({page,browserName},info)=>{
 const o=await prepareE2ePage(page,{authenticated});
 await page.goto('/merch');await expect(account(page)).toHaveText(authenticated?'Můj United účet':'Registrovat se');
 const trigger=page.locator('.site-header .menu-btn'),dialog=page.getByRole('dialog',{name:'Navigace webu'}),nav=page.getByRole('navigation',{name:'Hlavní navigace',exact:true});
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>window.dispatchEvent(new StorageEvent('storage',{key:'e36UnitedAppearance',newValue:theme})),theme);await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  for(const width of [360,390,820,1050,1100,1180,1181,1280,1440]){
   await page.setViewportSize({width,height:844});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   const geometry=await page.locator('.site-header .nav').evaluate(n=>[...n.children].filter(n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden').map(n=>({name:n.className,...n.getBoundingClientRect().toJSON()})));
   await info.attach(`header-${theme}-${width}`,{body:JSON.stringify(geometry),contentType:'application/json'});
   for(const box of geometry){expect(box.x).toBeGreaterThanOrEqual(0);expect(box.right).toBeLessThanOrEqual(width+1)}
   for(let i=1;i<geometry.length;i++)expect(geometry[i].x).toBeGreaterThanOrEqual(geometry[i-1].right-1);
   const cart=page.locator('.shop-header-cart');await expect(cart).toBeVisible();await expect(cart).toHaveAccessibleName('Otevřít košík, 0 kusů');
   if(width<=1180){
    await expect(trigger).toBeVisible();await trigger.click();await expect(dialog).toBeVisible();await expect(trigger).toHaveAttribute('aria-expanded','true');
    await expect(dialog.locator('nav>a')).toHaveText([...publicLabels,authenticated?'Můj United účet':'Registrovat se']);
    await expect(dialog.getByRole('link',{name:'United Merch',exact:true})).toHaveCSS('text-decoration-line','underline');
    await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(trigger).toHaveAttribute('aria-expanded','false');await expect(trigger).toBeFocused();
   }else{
    await expect(trigger).toBeHidden();await expect(nav).toBeVisible();
    const active=nav.getByRole('link',{name:'United Merch',exact:true}),program=nav.getByRole('link',{name:'Program',exact:true}),planner=nav.getByRole('link',{name:'Naplánovat',exact:true});
    expect(await active.evaluate(n=>getComputedStyle(n,'::after').opacity)).toBe('1');
    await expect(planner).toHaveCSS('color',theme==='light'?'rgb(121, 83, 0)':'rgb(231, 198, 122)');await expect(planner).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
    await program.hover();await expect(program).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
    const blue=await page.evaluate(()=>{const probe=document.createElement('span');probe.style.color='var(--blue)';document.body.append(probe);const color=getComputedStyle(probe).color;probe.remove();return color});await expect(program).toHaveCSS('color',blue);
    expect(await active.evaluate(n=>getComputedStyle(n,'::after').opacity)).toBe('1');
    // WebKit's native link traversal is preference-dependent. Check focus
    // styling in keyboard modality there; Chromium/Firefox also assert the
    // next Tab target. All three follow the real focused link with Enter below.
    if(browserName==='webkit'){await page.keyboard.press('ArrowRight');await program.focus();await expect(program).toBeFocused();expect(await program.evaluate(n=>getComputedStyle(n).outlineStyle)).not.toBe('none')}
    else{await program.focus();await page.keyboard.press('Tab');const next=nav.getByRole('link',{name:'Show & Shine',exact:true});await expect(next).toBeFocused();expect(await next.evaluate(n=>getComputedStyle(n).outlineStyle)).not.toBe('none')}
    expect(await program.evaluate(n=>n.tabIndex)).toBe(0);
   }
   if([360,1100,1440].includes(width))await page.screenshot({path:info.outputPath(`header-${theme}-${width}.png`),animations:'disabled'});
  }
 }
 // Follow the focused anchor using the keyboard, including in WebKit.
 await nav.getByRole('link',{name:'Program',exact:true}).focus();await page.keyboard.press('Enter');await expect(page).toHaveURL(/\/index.html#experience$/);await expect(page.locator('#experience')).toBeInViewport();await page.goBack();await expect(account(page)).toHaveText(authenticated?'Můj United účet':'Registrovat se');
 // An open menu remains usable in Merch's intermediate range and closes when
 // the actual desktop navigation becomes available; no second history manager.
 await page.setViewportSize({width:1100,height:844});await trigger.click();await page.setViewportSize({width:1120,height:844});await expect(dialog).toBeVisible();await page.setViewportSize({width:1440,height:844});await expect(dialog).toBeHidden();await expect(trigger).toHaveAttribute('aria-expanded','false');
 await page.setViewportSize({width:390,height:844});await trigger.click();await dialog.getByRole('link',{name:'Galerie',exact:true}).click();await expect(page).toHaveURL(/\/galerie.html$/);await expect(page.getByRole('dialog',{name:'Navigace webu'})).toBeHidden();
 expectNoUnexpectedClientErrors(o);
});

test('PUBLIC NAV portal Merch portal keeps session points and the existing basket',async({page})=>{
 const r=await merchRuntime();try{
  r.settings.paused=true;r.db.prepare('UPDATE merch_config SET data=?').run(JSON.stringify(r.settings));
  const o=await prepareE2ePage(page,{authenticated:true,member:{id:'member'}});await bridge(page,r.env,'member');
  await page.setViewportSize({width:1440,height:900});await page.addInitScript(()=>localStorage.setItem('e36UnitedMerchCartV1',JSON.stringify([{variantId:'u-polo-navy',size:'M',quantity:2}])));
  await page.goto('/member.html?section=garage');await expect(page.locator('[data-member-panel=garage]')).toBeVisible();
  await page.locator('.member-top-nav').getByRole('link',{name:'United Merch',exact:true}).click();await expect(page).toHaveURL(/\/merch.html$/);await signedIn(page);await expect(benefit(page)).toHaveAttribute('data-benefit-state','member');await expect(page.locator('[data-benefit-points]')).toHaveText('7');
  await page.setViewportSize({width:390,height:844});const cart=page.locator('.shop-header-cart');await expect(cart).toHaveAccessibleName('Otevřít košík, 2 kusů');await cart.click();const basket=page.locator('[data-cart-dialog]');await expect(basket).toBeVisible();await expect(basket.locator('[data-line-quantity]')).toHaveValue('2');await expect(basket).toContainText('Objednávání zatím není aktivní');await basket.getByRole('button',{name:'Zavřít košík'}).click();await expect(basket).toBeHidden();
  await page.locator('.site-header .menu-btn').click();const menuAccount=page.getByRole('dialog',{name:'Navigace webu'}).locator('.nav-member');await expect(menuAccount).toHaveText('Můj United účet');await menuAccount.click();await expect(page.locator('[data-app-view]')).toBeVisible();await expect(page.locator('[data-auth-view]')).toBeHidden();
  expect(r.db.prepare('SELECT COUNT(*) n FROM merch_orders').get().n).toBe(0);expectNoUnexpectedClientErrors(o);
 }finally{r.db.close()}
});

test('PUBLIC NAV delayed homepage styles settle at the requested Planner fragment',async({page},info)=>{
 const o=await prepareE2ePage(page);await page.setViewportSize({width:1440,height:900});await page.goto('/merch');await publicEntryReady(page);
 const arrived=Promise.withResolvers(),release=Promise.withResolvers();
 await page.route('**/styles.css?*',async route=>{arrived.resolve();await release.promise;return route.continue()});
 try{
  const navigation=page.getByRole('navigation',{name:'Hlavní navigace',exact:true}).getByRole('link',{name:'Naplánovat',exact:true}).click();
  await arrived.promise;
  // Hold a real stylesheet, not the click or the app's handlers. The parser
  // can expose the fragment before its final geometry is available.
  await page.waitForFunction(()=>Boolean(document.querySelector('#planer')));
  await info.attach('before-styles',{body:JSON.stringify(await page.locator('#planer').evaluate(n=>({scrollY,rect:n.getBoundingClientRect().toJSON(),state:document.readyState}))),contentType:'application/json'});
  release.resolve();await navigation;await page.waitForLoadState('load');await publicEntryReady(page);await expect(page).toHaveURL(/\/index.html#planer$/);
  await expect(page.locator('#planer')).toBeInViewport();expectNoUnexpectedClientErrors(o);
 }finally{release.resolve()}
});

test('PUBLIC NAV delayed initial alignment cannot undo a later section choice',async({page})=>{
 const o=await prepareE2ePage(page);
 await page.addInitScript(()=>{
  const schedule=window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame=callback=>{
   if(String(callback).includes('visitorNavigated')&&String(callback).includes('initialPublicHash')){
    window.__heldPublicAlignment=callback;return 0;
   }
   return schedule(callback);
  };
 });
 await page.setViewportSize({width:1440,height:900});await page.goto('/index.html#planer');
 await page.waitForFunction(()=>typeof window.__heldPublicAlignment==='function');await publicEntryReady(page);
 await page.getByRole('navigation',{name:'Hlavní navigace',exact:true}).getByRole('link',{name:'Program',exact:true}).click();
 await expect(page).toHaveURL(/#experience$/);await expect(page.locator('#experience')).toBeInViewport();
 // Release only the application's initial-fragment callback, never all frames.
 await page.evaluate(()=>new Promise(resolve=>{window.__heldPublicAlignment();requestAnimationFrame(()=>requestAnimationFrame(resolve))}));
 await expect(page.locator('#experience')).toBeInViewport();await expect(page).toHaveURL(/#experience$/);expectNoUnexpectedClientErrors(o);
});
