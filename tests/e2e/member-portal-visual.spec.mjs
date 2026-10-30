import {test,expect} from '@playwright/test';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {prepareE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';
import {installScreenshotReadiness,waitForScreenshotContent} from './screenshot-readiness.mjs';

const shots=resolve('.local-evidence/portal-refinement-20261030/screenshots');
async function setup(page,options={}){
 installScreenshotReadiness(page);
 const o=await prepareE2ePage(page,{authenticated:true,cars:[{id:'car-visual',nickname:'Yellow',model:'325i',body:'Coupé',year:1995,color:'Žlutá',primary:true,photos:[{id:'visual-photo'}]}],...options});
 await page.route('https://static.wixstatic.com/**',r=>r.fulfill({contentType:'image/png',body:readFileSync('united-logo-blue-silver-transparent.png')}));
 await page.route('**/api/cars/media/**',r=>r.fulfill({contentType:'image/webp',headers:{'Access-Control-Allow-Origin':'*'},body:readFileSync('assets/images/showshine/ss_coupe.webp')}));
 return o;
}
async function select(page,section){
 if(page.viewportSize().width>1050)await page.locator(`.member-sidebar [data-member-section=${section}]`).click();
 else{await page.locator('[data-mobile-menu]').click();await page.locator(`.united-mobile-menu [data-mobile-section=${section}]`).click()}
 await expect(page.locator(`[data-member-panel=${section}]`)).toBeVisible();
}
async function capture(page,name){
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
 await waitForScreenshotContent(page,{label:name});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 mkdirSync(shots,{recursive:true});await page.screenshot({path:resolve(shots,name+'-'+test.info().project.name+'.png'),animations:'disabled',fullPage:true});
}
for(const width of [1440,390])for(const theme of ['light','dark'])test(`unified member workspace ${width} ${theme}`,async({page})=>{
 const o=await setup(page);await page.setViewportSize({width,height:900});await page.addInitScript(t=>localStorage.setItem('e36UnitedAppearance',t),theme);
 await page.goto('/member.html');await expect(page.locator('[data-member-panel=overview]')).toBeVisible();await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
 const menuColors=await page.locator('.member-sidebar [data-member-section=garage]').evaluate(node=>({item:getComputedStyle(node).color,label:getComputedStyle(node.querySelector('strong')).color}));expect(menuColors.label).toBe(menuColors.item);
 const measurements=[];
 for(const section of ['overview','reservation','payments','club']){
  if(section!=='overview')await select(page,section);
  await expect(page.locator('[data-member-page-title]')).toHaveText(({overview:'Přehled',reservation:'Rezervace',payments:'Platby',club:'United Club'})[section]);
  await expect(page.locator('[data-club-heading-action]')).toBeVisible({visible:section==='club'});
  measurements.push(await page.evaluate(()=>Object.fromEntries(['.brand','.member-shell','.member-content','[data-member-page-title]'].map(selector=>[selector,Math.round(document.querySelector(selector).getBoundingClientRect().left*10)/10]))));
  await capture(page,`${section}-${width}-${theme}`);
 }
 for(const measurement of measurements)expect(measurement).toEqual(measurements[0]);
 await expect(page.locator('[data-member-panel=club] .member-card')).toBeVisible();
 await page.locator('[data-club-tab=history]').click();await expect(page.locator('[data-club-anchor=history]')).toBeVisible();
 await page.locator('[data-club-tab=achievements]').click();await expect(page.locator('[data-club-anchor=achievements]')).toBeVisible();
 await page.locator('[data-open-club-members]').click();await expect(page.locator('[data-club-members-modal]')).toBeVisible();await page.getByRole('button',{name:'Zavřít seznam členů',exact:true}).click();
 for(const section of ['garage','photos','account','merch']){await select(page,section);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)}
 await select(page,'garage');await page.locator('[data-open-car]').click();await expect(page.locator('[data-car-form] [name=nickname]')).toHaveAttribute('placeholder','Moje E36');await expect(page.locator('[data-car-form] [type=submit]')).toBeVisible();await page.keyboard.press('Escape');
 expectNoUnexpectedClientErrors(o);
});

test('informational admission is scoped to 2027 and cannot replace a historical payment',async({page})=>{
 const o=await setup(page);await page.goto('/member.html?section=reservation');await expect(page.locator('[data-member-panel=reservation]')).toBeVisible();await expect(page.locator('[data-portal-admission-info=reservation]')).toBeHidden();
 await page.route('**/api/reservations/current',r=>r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{registrationOpen:false,event:{id:'united-2027',year:2027,title:'E36 United 2027'},reservation:null,accommodationOptions:[]}}));
 await page.reload();const info=page.locator('[data-portal-admission-info=reservation]');await expect(info).toContainText('500 Kč');await expect(info).toContainText('600 Kč');await expect(info).toContainText('800 Kč');await expect(info).toContainText('Informační ceník vjezdu.');await expect(page.locator('[data-reservation-submit]')).toBeHidden();await capture(page,'reservation-2027-info');expectNoUnexpectedClientErrors(o);
});

test('tablet Club keeps its panel aligned through a held read and an explicit retry',async({page})=>{
 const o=await setup(page,{ignoreConsoleError:e=>e.url.endsWith('/api/united-club')&&e.text.includes('503')});await page.setViewportSize({width:820,height:1000});
 const held=Promise.withResolvers(),release=Promise.withResolvers();let first=true,failing=true;
 await page.route('**/api/united-club',async route=>{if(route.request().method()==='OPTIONS')return route.fallback();if(first){first=false;held.resolve();await release.promise}if(failing)return route.fulfill({status:503,json:{message:'controlled_club_failure'},headers:{'Access-Control-Allow-Origin':'*'}});return route.fallback()});
 try{
  await page.goto('/member.html?section=club');await held.promise;await expect(page.locator('[data-club-loading-state]')).toBeVisible();await expect(page.locator('[data-open-club-members]')).toBeHidden();const left=await page.locator('.member-content').evaluate(el=>el.getBoundingClientRect().left);
  release.resolve();const error=page.locator('[data-member-panel=club] [data-domain-retry-state=club]');await expect(error).toBeVisible();await capture(page,'club-820-error');failing=false;await error.getByRole('button',{name:'Zkusit znovu',exact:true}).click();await expect(page.locator('[data-member-panel=club] .member-card')).toBeVisible();expect(await page.locator('.member-content').evaluate(el=>el.getBoundingClientRect().left)).toBe(left);await capture(page,'club-820-recovered');expectNoUnexpectedClientErrors(o);
 }finally{release.resolve()}
});

test('narrow portal keeps all menu targets and Club tabs with enlarged text',async({page})=>{
 const o=await setup(page);await page.setViewportSize({width:360,height:640});await page.goto('/member.html?section=club');await expect(page.locator('[data-member-panel=club]')).toBeVisible();
 await page.addStyleTag({content:'html{font-size:125%}'});
 await capture(page,'club-360-enlarged');
 for(const name of ['Body a výhody','Moje účasti','Moje ocenění']){const button=page.getByRole('button',{name,exact:true});await expect(button).toBeVisible();const box=await button.boundingBox();expect(box.width).toBeGreaterThan(70)}
 await select(page,'account');await expect(page.locator('.account-logout')).toBeVisible();expectNoUnexpectedClientErrors(o);
});

test('long member and car names preserve pending reservation actions on a narrow screen',async({page})=>{
  const o=await setup(page,{member:{name:'Alexandra Dlouhá Novotná',nickname:'Alexandra s dlouhou přezdívkou'},cars:[{id:'car-visual',nickname:'Moje původní velmi dlouhá přezdívka E36',model:'328i Individual Touring',body:'Touring',primary:true,photos:[]}],reservation:{id:'pending-visual',eventId:'united-2026',eventYear:2026,status:'pending',carId:'car-visual',arrival:'Pátek',crew:5,accommodation:'Bez ubytování',showShine:'Možná',note:'Přijedeme později, ubytování nepotřebujeme.'}});
 await page.setViewportSize({width:390,height:740});await page.goto('/member.html?section=reservation');await expect(page.locator('[data-member-panel=reservation]')).toBeVisible();await expect(page.getByRole('region',{name:'Stav registrace',exact:true})).toContainText(/schválení/i);await expect(page.locator('[data-reservation-title]')).toHaveText('E36 United');await capture(page,'reservation-pending-long');
 await select(page,'garage');await expect(page.locator('[data-garage-grid]')).toContainText('Moje původní velmi dlouhá přezdívka E36');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.locator('[data-mobile-menu]').click();const identity=page.locator('[data-menu-identity]');await expect(identity).toHaveAttribute('data-hero-state','no-photo');await expect(identity.locator('.member-logged-hero-bg')).toBeHidden();expect((await identity.boundingBox()).height).toBeLessThan(180);await expect(identity.locator('[data-menu-hero-cta]')).toBeVisible();await page.keyboard.press('Escape');expectNoUnexpectedClientErrors(o);
});

test('refined identity, descriptions and separated LIVE footer remain usable on desktop and a short phone',async({page})=>{
 const o=await setup(page);await page.setViewportSize({width:1440,height:1000});await page.goto('/member.html');await expect(page.locator('[data-member-hero]')).toHaveAttribute('data-hero-state','photo');
 const hero=page.locator('[data-member-hero]'),photo=hero.locator('img'),name=hero.locator('[data-member-nickname]');const a=await photo.boundingBox(),b=await name.boundingBox();expect(a.width/a.height).toBeCloseTo(2,1);expect(b.y).toBeGreaterThan(a.y+a.height);expect(a.height).toBeGreaterThanOrEqual(90);expect(a.height).toBeLessThanOrEqual(110);
 const menu=page.locator('.member-sidebar');await expect(menu.locator('[data-member-section=overview] small')).toHaveCount(0);await expect(menu.locator('[data-member-section=garage] small')).toHaveText('Tvoje auto');await expect(menu.locator('[data-member-section=club] small')).toHaveText('Tvoje výhody & historie');await expect(menu.locator('.member-nav-footer [data-member-section=live]')).toBeVisible();
 const garage=menu.locator('[data-member-section=garage]');await garage.focus();await expect(garage).toBeFocused();expect(await garage.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');const before=await garage.boundingBox();await garage.hover();const after=await garage.boundingBox();expect(after).toEqual(before);await capture(page,'refined-menu-1440');
 await page.setViewportSize({width:360,height:520});await page.locator('[data-mobile-menu]').click();const dialog=page.locator('.united-mobile-menu');await expect(dialog.locator('[data-menu-identity] img')).toBeVisible();await expect(dialog.locator('[data-member-hero]')).toHaveCount(0);await dialog.screenshot({path:resolve(shots,'refined-menu-top-360-'+test.info().project.name+'.png')});const footer=dialog.locator('.mobile-member-footer');await footer.locator('[data-menu-logout]').scrollIntoViewIfNeeded();await expect(footer.locator('[data-menu-logout]')).toBeInViewport();await dialog.screenshot({path:resolve(shots,'refined-menu-360-'+test.info().project.name+'.png')});await footer.locator('[data-mobile-section=live]').click();await expect(dialog).toBeHidden();await expect(page.locator('[data-app-view]')).toBeVisible();await expect(page.locator('[data-member-live-mode]')).toBeHidden();await expect(page.locator('.member-secondary[data-live-entry-cancel]')).toBeVisible();await page.locator('.member-secondary[data-live-entry-cancel]').click();await page.locator('[data-mobile-menu]').click();await dialog.locator('[data-menu-logout]').click();await expect(page.locator('[data-auth-view]')).toBeVisible();await expect(dialog.locator('[data-menu-identity]')).toHaveCount(0);expectNoUnexpectedClientErrors(o);
});

test('Club defaults to history while explicit points and awards survive reload and browser Back',async({page})=>{
 const o=await setup(page);await page.goto('/member.html?section=club');await expect(page.locator('[data-club-anchor=history]')).toBeVisible();
 const tabs=page.locator('.club-navigation-cards');expect(await tabs.locator('[data-club-tab]').evaluateAll(nodes=>nodes.map(n=>n.dataset.clubTab))).toEqual(['history','points','achievements']);
 expect((await tabs.boundingBox()).y).toBeLessThan((await page.locator('.member-card').boundingBox()).y);
 await tabs.locator('[data-club-tab=points]').click();await expect(page.locator('[data-club-anchor=points]')).toBeVisible();await tabs.locator('[data-club-tab=achievements]').click();await page.goBack();await expect(page.locator('[data-club-anchor=points]')).toBeVisible();await page.goForward();await expect(page.locator('[data-club-anchor=achievements]')).toBeVisible();await page.reload();await expect(page.locator('[data-club-anchor=achievements]')).toBeVisible();
 for(const url of ['/member.html?section=rewards','/member.html?section=club#points']){await page.goto(url);await expect(page.locator('[data-club-anchor=points]')).toBeVisible();await select(page,'garage');await select(page,'club');await expect(page.locator('[data-club-anchor=history]')).toBeVisible()}expectNoUnexpectedClientErrors(o);
});

const paymentBase={amountDueCzk:1940,amountPaidCzk:0,remainingCzk:1940,overpaymentCzk:0,status:'unpaid',variableSymbol:'2026123456',recipientName:'E36 UNITED TEST',accountDisplay:'123 / 9999',iban:'CZ5099990000000000000123',message:'E36 UNITED 2026',deadline:'2026-12-01',testMode:true,configurationReady:true,actionable:true,spayd:'SPD*1.0*ACC:CZ5099990000000000000123*AM:1940*CC:CZK*X-VS:2026123456'};
for(const state of ['unpaid','underpaid','paid','overpaid','pending','cancelled','missing-config','change-pending','not_required','rejected'])test(`refined shared payment preserves ${state}`,async({page})=>{
 const settled=['paid','overpaid','not_required'].includes(state),payment={...paymentBase,amountDueCzk:state==='not_required'?0:1940,status:settled?state:state==='underpaid'?'underpaid':'unpaid',amountPaidCzk:state==='not_required'?0:state==='overpaid'?2100:settled?1940:state==='underpaid'?1000:0,remainingCzk:settled?0:state==='underpaid'?940:1940,overpaymentCzk:state==='overpaid'?160:0,configurationReady:state!=='missing-config',spayd:settled?null:paymentBase.spayd};
 const reservation={id:'refined-reservation',eventId:'united-2026',eventYear:2026,title:'E36 United 2026',carId:'car-visual',carSnapshot:{nickname:'Yellow',model:'325i',body:'Coupé'},arrival:'Sobota',crew:2,accommodation:'Bez ubytování',status:['pending','cancelled','rejected'].includes(state)?state:'approved',changePending:state==='change-pending',payment};
 if(payment.spayd)payment.spayd=payment.spayd.replace('*AM:1940*',`*AM:${payment.remainingCzk}*`);
 const o=await setup(page,{reservation,registrationOpen:true});await page.setViewportSize({width:1440,height:1000});await page.goto('/member.html?section=reservation');const detail=page.locator('[data-reservation-payment-detail]');await expect(detail).toBeVisible();const markup=await detail.innerHTML();
 if(reservation.status==='approved'){const badge=page.locator('[data-reservation-nav-status]');await expect(badge).toContainText('✓ Potvrzeno');await expect(badge).toHaveCSS('color','rgb(9, 107, 70)');await expect(page.locator('[data-reservation-state-label]')).toHaveText(state==='change-pending'?'ZMĚNA ČEKÁ NA SCHVÁLENÍ':'Tvoje účast je potvrzená.');}
 if(state==='rejected'){await expect(detail).toContainText('REZERVACE NEBYLA SCHVÁLENA');await expect(detail).toContainText('Platba se teď nepožaduje.');await expect(page.locator('[data-reservation-nav-status]')).toContainText('× Zamítnuto')}
 if(state==='pending'){await expect(detail).toContainText('Do schválení nic nového nedoplácej.');await expect(page.locator('[data-reservation-nav-status]')).toContainText('◷ Čeká na tým')}
 const qrAllowed=!settled&&!['pending','cancelled','rejected','missing-config'].includes(state);await expect(detail.locator('.member-payment-qr svg')).toHaveCount(qrAllowed?1:0);
 if(state==='missing-config')await expect(detail).toContainText('Platební údaje připravujeme.');if(state==='cancelled')await expect(detail).toContainText('Další platba se nepožaduje.');
 if(!['pending','cancelled','rejected','missing-config'].includes(state)){await expect(detail.locator('.payment-test-warning')).toContainText('NEPLAŤTE');await expect(detail.locator('.payment-totals')).toContainText(state==='not_required'?'0':'1 940');await expect(detail.locator('.payment-totals')).toContainText('Zbývá');}
 if(state==='underpaid')for(const [width,theme]of [[1440,'light'],[1440,'dark'],[390,'light'],[390,'dark'],[360,'light'],[820,'dark']]){await page.setViewportSize({width,height:900});await page.evaluate(t=>{localStorage.setItem('e36UnitedAppearance',t);window.dispatchEvent(new StorageEvent('storage',{key:'e36UnitedAppearance',newValue:t}))},theme);await expect(page.locator('html')).toHaveAttribute('data-theme',theme);await capture(page,`refined-reservation-${width}-${theme}`)}
 await select(page,'payments');await expect(page.locator('[data-payments-list]')).toHaveJSProperty('innerHTML',markup);if(state==='underpaid')for(const [width,theme]of [[1440,'light'],[1440,'dark'],[390,'light'],[390,'dark']]){await page.setViewportSize({width,height:900});await page.evaluate(t=>{localStorage.setItem('e36UnitedAppearance',t);window.dispatchEvent(new StorageEvent('storage',{key:'e36UnitedAppearance',newValue:t}))},theme);await expect(page.locator('html')).toHaveAttribute('data-theme',theme);await capture(page,`refined-payments-${width}-${theme}`)}expectNoUnexpectedClientErrors(o);
});
