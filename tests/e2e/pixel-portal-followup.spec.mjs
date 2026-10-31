import {test,expect} from '@playwright/test';
import {prepareE2ePage} from './fixtures.mjs';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {memberRuntime} from '../helpers/admin-member-runtime.mjs';
import {getMemberLive,getLiveState} from '../../worker/domains/live.js';
import {getMember,saveMemberLivePreference} from '../../worker/domains/members.js';
import {installScreenshotReadiness,waitForScreenshotContent} from './screenshot-readiness.mjs';
import {merchRuntime} from '../helpers/merch-runtime.mjs';
import {bridge} from './merch-bridge.mjs';
import {changeOrder} from '../../worker/domains/merch/service.js';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'};
const shots=resolve('.local-evidence/portal-pixel-20261031/screenshots');
function reservation({status='approved',paymentStatus='unpaid',admission=500,message='Zpráva od týmu',...extra}={}){return {id:'r-pixel',eventId:'united-2026',eventYear:2026,title:'E36 United',status,arrival:'Sobota',crew:3,accommodation:'Chatka',accommodationUnits:3,carId:'car-001',carSnapshot:{id:'car-001',nickname:'Estoril',model:'328i',body:'Coupé'},admissionCzk:admission,memberComment:message,amountDueCzk:2670,accommodationSnapshot:{optionId:'cabin-standard',optionName:'Chatka Standard',kind:'cabin',peopleCount:3,unitCount:1,nights:1,totalCzk:2170,baseTotalCzk:1200,personTotalCzk:0,beddingTotalCzk:360,cityTaxTotalCzk:75},payment:{status:paymentStatus,amountDueCzk:2670,amountPaidCzk:paymentStatus==='paid'?2670:paymentStatus==='overpaid'?3000:0,remainingCzk:['paid','overpaid'].includes(paymentStatus)?0:2670,overpaymentCzk:paymentStatus==='overpaid'?330:0,actionable:true,configurationReady:true,testMode:true,recipientName:'E36 UNITED TEST',accountDisplay:'123 / 9999',variableSymbol:'123',message:'TEST',deadline:'2026-11-20',spayd:'SPD*1.0*ACC:CZ6508000000192000145399*AM:2670.00*CC:CZK'},...extra};}
async function setup(page,options={}){
 installScreenshotReadiness(page);
 const errors=await prepareE2ePage(page,{authenticated:true,showProgramLive:false,cars:[{id:'car-001',nickname:'Estoril',model:'328i',body:'Coupé',primary:true,photos:[{id:'photo-pixel'}]}],clubPayload:{points:{available:18,lifetime:18}},...options});
 await page.route('**/api/merch/catalog',r=>r.fulfill({headers,json:{products:[],settings:{paused:true,rewardThreshold:12,discountBasisPoints:3600}}}));
 await page.route('**/api/merch/orders?**',r=>r.fulfill({headers,json:{orders:[],hasMore:false}}));
 await page.route('**/api/merch/address',r=>r.fulfill({headers,json:{address:null}}));
 const photo=readFileSync(new URL('../../assets/images/showshine/ss_coupe.webp',import.meta.url));
 await page.route('**/api/cars/media/**',r=>r.fulfill({headers,contentType:'image/webp',body:photo}));
 return errors;
}
async function noErrors(errors){expect(errors.pageErrors).toEqual([]);expect(errors.consoleErrors).toEqual([]);expect(errors.unhandledApi).toEqual([]);}
test('Pixel section spacing and grouped menu preserve all routes',async({page})=>{
 const errors=await setup(page,{reservation:reservation()});await page.setViewportSize({width:412,height:760});await page.goto('/member.html');
 await expect(page.locator('[data-member-greeting]')).toHaveText('Přehled');
 for(const section of ['overview','reservation','payments','garage','club','photos','account','merch']){
  await page.locator('[data-mobile-menu]').click();await page.locator(`.united-mobile-menu [data-mobile-section=${section}]`).click();
  await expect(page.locator('.united-mobile-menu')).not.toBeVisible();await expect(page.locator('body')).toHaveAttribute('data-member-section',section);
  const gap=await page.evaluate(()=>document.querySelector('.member-content').getBoundingClientRect().top-document.querySelector('.site-header').getBoundingClientRect().bottom);
  expect(gap).toBeGreaterThanOrEqual(0);expect(gap).toBeLessThanOrEqual(20);
 }
 await page.locator('[data-mobile-menu]').click();await expect(page.locator('[data-menu-identity]')).toHaveCount(0);
 const group=page.locator('.united-mobile-menu .member-nav-group').filter({hasText:'Moje účast na srazu'});await expect(group.locator('[data-mobile-section]')).toHaveCount(3);
 await expect(page.locator('.mobile-member-logout')).toBeVisible();await page.keyboard.press('Escape');await noErrors(errors);
});
test('reservation admission and payment link use only its own server snapshot',async({page})=>{
 const errors=await setup(page,{reservation:reservation({showShine:'Ano'})});await page.goto('/member.html?section=reservation&payment=merch');
 await expect(page.locator('[data-reservation-summary]>div').filter({hasText:'SHOW & SHINE'})).toContainText('Ano');
 await expect(page.locator('[data-reservation-summary]')).toContainText('500');await expect(page.locator('[data-reservation-saved-price]')).toContainText('Rozpis ceny');
 await expect(page.locator('[data-reservation-payment-detail]')).toBeHidden();await expect(page.locator('[data-reservation-payment-link]')).toContainText('Doplatit');
 await page.locator('[data-reservation-payment-link]').click();await expect(page.locator('[data-member-payment-tab=sraz]')).toHaveAttribute('aria-pressed','true');await expect(page.locator('[data-payments-list]')).toBeVisible();
 for(const [state,label,qr] of [['paid','Zaplaceno',false],['overpaid','Přeplatek',false],['unpaid','Nedoplatek',true]]){
  errors.setReservation(reservation({paymentStatus:state,admission:600}));await page.reload();await expect(page.locator('.payment-status-pill')).toContainText(label);if(qr)await expect(page.locator('.member-payment-qr svg')).toBeVisible();else await expect(page.locator('.member-payment-qr')).toHaveCount(0);
  await page.locator('.member-sidebar [data-member-section=reservation]').click();await expect(page.locator('[data-reservation-payment-state]')).toContainText(label);await expect(page.locator('[data-reservation-summary]')).toContainText('600');await page.locator('[data-reservation-payment-link]').click();
 }
 for(const status of ['pending','cancelled','rejected']){errors.setReservation(reservation({status,admission:null}));await page.goto('/member.html?section=reservation');await expect(page.locator('[data-reservation-payment-link]')).toHaveText('Zkontrolovat platby');await expect(page.locator('[data-reservation-summary]')).toContainText('Zatím neurčeno');await page.locator('[data-reservation-payment-link]').click();await expect(page.locator('.member-payment-qr')).toHaveCount(0);}
 await noErrors(errors);
});
test('visual review of compact states on mobile and desktop',async({page},testInfo)=>{
 const errors=await setup(page,{reservation:reservation()});mkdirSync(shots,{recursive:true});
 for(const [width,height] of [[360,720],[390,740],[412,760],[1440,960]])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height});await page.goto('/member.html?section=reservation');await page.evaluate(theme=>window.dispatchEvent(new StorageEvent('storage',{key:'e36UnitedAppearance',newValue:theme})),theme);await expect(page.locator('html')).toHaveAttribute('data-theme',theme);await expect(page.locator('[data-reservation-payment-link]')).toBeVisible();
  await waitForScreenshotContent(page,{label:`pixel-${width}-${theme}`});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const inset=await page.locator('[data-reservation-car-save]').evaluate(button=>button.closest('[data-reservation-summary]>div').getBoundingClientRect().right-button.getBoundingClientRect().right);expect(inset).toBeGreaterThanOrEqual(8);
  await page.screenshot({path:resolve(shots,`reservation-${width}-${theme}-${testInfo.project.name}.png`),fullPage:true,animations:'disabled'});
 }
 await noErrors(errors);
});

for(const points of [11,12,18])test(`authoritative benefit ${points} points and compact public account links`,async({page},info)=>{
 const errors=await setup(page,{clubPayload:{points:{available:points,lifetime:points}}});await page.setViewportSize({width:390,height:740});await page.goto('/member.html?section=club&clubTab=points');
 await expect(page.locator('[data-reward-name]')).toHaveText('Za 12 bodů sleva 36 %');await expect(page.locator('[data-reward-remaining]')).toHaveText(points<12?'Do slevy ti chybí 1 bod.':'Sleva odemčena');await expect(page.locator('[data-reward-progress] [role=progressbar]')).toHaveAttribute('aria-valuenow',String(Math.min(12,points)));
 await waitForScreenshotContent(page,{label:'club-points'});await page.screenshot({path:resolve(shots,`club-${points}-${info.project.name}.png`),fullPage:true});
 await page.goto('/merch.html');await expect(page.locator('[data-benefit-points]')).toHaveText(String(points));await expect(page.locator('[data-benefit-next]')).toHaveText(points<12?'Do slevy ti chybí 1 bod.':'Sleva odemčena');await expect(page.locator('.merch-hero-copy>p')).toHaveText('Merch pro sraz i každý den.');await expect(page.locator('.merch-hero-actions')).toHaveCount(0);await expect(page.locator('.shop-benefit-actions>a')).toHaveCount(0);await expect(page.locator('[data-benefit-member] a')).toHaveAttribute('href','member.html?section=club&clubTab=points');
 await waitForScreenshotContent(page,{label:'merch-points'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:resolve(shots,`merch-${points}-${info.project.name}.png`),fullPage:true});await noErrors(errors);
});
test('anonymous Merch offers registration and login without invented points',async({page},info)=>{
 const errors=await setup(page,{authenticated:false});await page.setViewportSize({width:360,height:720});await page.goto('/merch.html');await expect(page.locator('[data-benefit-anonymous]')).toBeVisible();await expect(page.locator('[data-benefit-member]')).toBeHidden();await expect(page.locator('[data-benefit-anonymous] a')).toHaveCount(2);await expect(page.locator('[data-merch-benefit-rule]')).toContainText('Objednávání je pozastavené');await waitForScreenshotContent(page,{label:'anonymous-merch'});await page.screenshot({path:resolve(shots,`merch-anonymous-${info.project.name}.png`),fullPage:true});await noErrors(errors);
});

test('trip settlement and Merch settlement stay independent in both directions',async({page})=>{
 const r=await merchRuntime();try{const order=await r.order(),errors=await setup(page,{member:{id:'member'},reservation:reservation({paymentStatus:'paid'})});await bridge(page,r.env,'member');await page.goto('/member.html?section=reservation&payment=merch');await expect(page.locator('[data-reservation-payment-state]')).toHaveText('Zaplaceno');await expect(page.locator('[data-reservation-payment-link]')).toHaveText('Zaplaceno · detail platby');await page.locator('[data-reservation-payment-link]').click();await expect(page.locator('[data-member-payment-tab=sraz]')).toHaveAttribute('aria-pressed','true');await expect(page.locator('[data-payments-list] .payment-status-pill')).toHaveText('Zaplaceno');
 await changeOrder(r.env,'admin',order.id,{action:'paid',date:new Date().toISOString().slice(0,10),operationKey:crypto.randomUUID(),revision:order.revision},true);errors.setReservation(reservation());await page.goto('/member.html?section=reservation');await expect(page.locator('[data-reservation-payment-state]')).toHaveText('Nedoplatek');await expect(page.locator('[data-reservation-payment-link]')).toContainText('2 670');await page.locator('[data-reservation-payment-link]').click();await page.locator('[data-member-payment-tab=merch]').click();await expect(page.locator('[data-merch-payments]')).toContainText('Zaplaceno');await noErrors(errors);
 }finally{await page.close();r.close()}
});

test('compact dashboard, long and absent team messages and centered payment QR remain usable',async({page},info)=>{
 const errors=await setup(page,{reservation:reservation()});mkdirSync(shots,{recursive:true});await page.setViewportSize({width:412,height:760});await page.goto('/member.html');await expect(page.locator('.portal-overview-rows button').filter({hasText:'Otevřít Garáž'})).toBeVisible();await waitForScreenshotContent(page,{label:'dashboard'});await page.screenshot({path:resolve(shots,`overview-pixel-${info.project.name}.png`),fullPage:true});
 await page.locator('[data-mobile-menu]').click();await expect(page.locator('[data-menu-identity]')).toHaveCount(0);await expect(page.locator('.mobile-member-footer [data-mobile-section=live]')).toHaveCount(0);await page.screenshot({path:resolve(shots,`menu-pixel-${info.project.name}.png`)});await page.keyboard.press('Escape');
 errors.setReservation(reservation({message:'Přijeď prosím k hlavní bráně. '+ 'Tým doplnil podrobnosti k tvému pobytu a příjezdu. '.repeat(6)}));await page.goto('/member.html?section=reservation');await expect(page.locator('[data-reservation-member-comment]')).toContainText('Přijeď');await waitForScreenshotContent(page,{label:'long-message'});await page.screenshot({path:resolve(shots,`long-message-${info.project.name}.png`),fullPage:true});
 errors.setReservation(reservation({message:''}));await page.reload();await expect(page.locator('[data-reservation-member-comment]')).toBeHidden();await expect(page.locator('[data-reservation-saved-price]')).toContainText('Rozpis ceny');await page.locator('[data-reservation-saved-price] summary').click();await expect(page.locator('[data-reservation-saved-price] details')).toHaveJSProperty('open',true);
 for(const width of [390,1440]){await page.setViewportSize({width,height:850});await page.goto('/member.html?section=payments');await expect(page.locator('.member-payment-qr svg')).toBeVisible();const center=await page.locator('.member-payment-qr').evaluate(el=>{const a=el.getBoundingClientRect(),b=el.parentElement.getBoundingClientRect();return Math.abs((a.left+a.right-b.left-b.right)/2)});expect(center).toBeLessThanOrEqual(2);await waitForScreenshotContent(page,{label:'payment-qr'});await page.screenshot({path:resolve(shots,`payment-${width}-${info.project.name}.png`),fullPage:true});}
 await noErrors(errors);
});

test('LIVE is a fresh profile opt-in across devices, ignores legacy mode and invalidates a delayed entry',async({page,browser})=>{
 const errors=await setup(page,{member:{id:'m'}}),r=memberRuntime();r.db.exec("UPDATE events SET live_enabled=1 WHERE id='e'");
 let uid='m';const profileRoute=async(route,id)=>{const response=route.request().method()==='PUT'?await saveMemberLivePreference(new Request(route.request().url(),{method:'PUT',body:route.request().postData()}),r.env,{uid:id},'https://e36united.cz'):await getMember(r.env,{uid:id,email:id==='m'?'member@example.invalid':'other@example.invalid',emailVerified:false},'https://e36united.cz');await route.fulfill({headers,status:response.status,body:await response.text()})};
 await page.route('**/api/me',route=>profileRoute(route,uid));await page.route('**/api/me/live-preference',route=>profileRoute(route,uid));
 let reads=0,release,started;const barrier=new Promise(resolve=>started=resolve);let hold=false;
 await page.route('**/api/live',async route=>{reads++;const response=await getMemberLive(r.env,{uid:'m'},'https://e36united.cz'),body=await response.text();if(hold){started();await new Promise(resolve=>release=resolve)}await route.fulfill({headers,status:response.status,body})});
 await page.route('**/api/live/state',async route=>{reads++;const response=await getLiveState(r.env,{uid:'m'},new URL(route.request().url()),'https://e36united.cz');await route.fulfill({headers,status:response.status,body:await response.text()})});
 await page.addInitScript(()=>localStorage.setItem('e36United.memberLiveMode.v2.m.e','1'));
 try{
  await page.goto('/member.html?section=live');await expect(page.locator('[data-member-section-title]')).toHaveText('Účet');await expect(page.locator('[data-account-live-visibility]')).not.toBeChecked();await expect(page.locator('.member-sidebar [data-member-section=live]')).toBeHidden();expect(reads).toBe(0);
  await page.locator('[data-account-live-visibility]').check();await expect(page.locator('.member-sidebar [data-member-section=live]')).toBeVisible();await expect(page.locator('[data-member-live-mode]')).toBeHidden();await page.reload();await expect(page.locator('[data-account-live-visibility]')).toBeChecked();
  const second=await browser.newContext({baseURL:'http://127.0.0.1:4173'});try{const device=await second.newPage();await setup(device,{member:{id:'m'}});await device.route('**/api/me',route=>profileRoute(route,'m'));await device.goto('/member.html?section=account');await expect(device.locator('[data-account-live-visibility]')).toBeChecked()}finally{await second.close()}
  hold=true;await page.locator('.member-sidebar [data-member-section=live]').click();await barrier;
  await page.locator('.member-modal-close[data-live-entry-cancel]').click();await page.locator('[data-account-live-visibility]').uncheck();await expect(page.locator('[data-account-live-status]')).toHaveText('Program LIVE je skrytý.');const finished=page.waitForResponse(response=>response.url().endsWith('/api/live'));release();hold=false;await(await finished).finished();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(page.locator('[data-member-live-entry]')).toBeHidden();await expect(page.locator('[data-member-live-mode]')).toBeHidden();
  await page.locator('[data-account-live-visibility]').check();await page.locator('.member-sidebar [data-member-section=live]').click();await page.locator('[data-live-entry-confirm]').click();await expect(page.locator('[data-member-live-mode]')).toBeVisible();
  await page.locator('[data-live-more-toggle]').click();await page.locator('[data-live-exit]').click();await page.locator('.member-sidebar [data-member-section=account]').click();await page.locator('[data-account-live-visibility]').uncheck();await page.reload();await expect(page.locator('[data-account-live-visibility]')).not.toBeChecked();
  uid='n';await errors.switchMember({id:'n',email:'other@example.invalid'});await page.reload();await expect(page.locator('.member-sidebar [data-member-section=live]')).toBeHidden();await noErrors(errors);
 }finally{release?.();await page.close();r.db.close()}
});
