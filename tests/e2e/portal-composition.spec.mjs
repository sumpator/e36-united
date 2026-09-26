import {test,expect} from '@playwright/test';
import {prepareE2ePage} from './fixtures.mjs';
import {catalog} from '../../merch/catalog.js';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';

const shots=resolve('../portal-composition-review');
const products=catalog.map((p,i)=>({...p,gender:i===0?'unisex':i%2?'men':'women',category:i===0?'Pola':i===5?'Limitovaná kolekce':'Trička'}));
async function setup(page,{authenticated=true,points=22}={}){
 const errors=await prepareE2ePage(page,{authenticated,member:{qrPayload:'E36U1:'+'a'.repeat(48)},clubPayload:{points:{available:points,lifetime:points}},cars:[{id:'car-001',nickname:'Estoril',model:'328i',body:'Coupé',primary:true,photos:[{id:'photo-1'}]}]});
 const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'};
 let address={name:'Eva Testová',email:'delivery@example.test',phone:'+420777123456',street:'Testovací 12',city:'Brno',postalCode:'602 00',country:'Česká republika',note:''};const addressWrites=[];
 await page.route('**/api/live/state',r=>r.fulfill({json:{active:false},headers}));
 await page.route('**/api/merch/orders?**',r=>r.fulfill({json:{orders:[],hasMore:false},headers}));
 await page.route('**/api/merch/address',r=>{if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers});if(r.request().method()==='PUT'){address=r.request().postDataJSON();addressWrites.push(address)}return r.fulfill({json:{address},headers});});
 await page.route('**/api/merch/catalog',r=>r.fulfill({json:{products,settings:{paused:true,discountBasisPoints:1000,rewardThreshold:12},ready:false},headers}));
 const photo=readFileSync(new URL('../../assets/images/showshine/ss_coupe.webp',import.meta.url));
 await page.route('https://static.wixstatic.com/**',r=>r.fulfill({contentType:/UsingleWhite/i.test(r.request().url())?'image/png':'image/webp',body:/UsingleWhite/i.test(r.request().url())?readFileSync(new URL('../../united-logo-blue-silver-transparent.png',import.meta.url)):photo}));
 await page.route('**/api/cars/media/**',r=>r.fulfill({contentType:'image/webp',headers,body:photo}));
 return {errors,addressWrites};
}
async function capture(page,name,theme='light'){
 mkdirSync(shots,{recursive:true});await page.evaluate(theme=>window.dispatchEvent(new StorageEvent('storage',{key:'e36UnitedAppearance',newValue:theme})),theme);
 await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>{const r=i.getBoundingClientRect();return i.checkVisibility()&&r.top<innerHeight&&r.bottom>0}).map(i=>i.decode().catch(()=>{})))});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:resolve(shots,name+'.png'),animations:'disabled'});
}
test('section titles, account save, identity and mobile links remain connected',async({page})=>{
 const {errors,addressWrites}=await setup(page);await page.setViewportSize({width:1440,height:1000});await page.goto('/member.html?section=account');
 await expect(page.locator('[data-member-section-title]')).toHaveText('Účet');await expect(page.locator('[data-account-qr] svg')).toBeVisible();
 await page.locator('[data-account-form] [name=nickname]').fill('Testová přezdívka');await page.locator('[data-account-form] [type=submit]').click();await expect(page.locator('[data-account-save-status]')).toHaveText('Profil byl uložen.');expect(errors.profileWrites.at(-1).nickname).toBe('Testová přezdívka');
 await expect(page.locator('[data-account-email]')).toHaveAttribute('readonly','');await expect(page.locator('.portal-address-summary')).toContainText('delivery@example.test');
 await page.locator('[data-address-edit]').click();await page.locator('[data-merch-address] [name=street]').fill('Jiná 24');await page.locator('[data-merch-address] [type=submit]').click();await expect(page.locator('.portal-address-summary')).toContainText('Jiná 24');expect(addressWrites).toHaveLength(1);expect(errors.profileWrites).toHaveLength(1);
 for(const [id,title] of Object.entries({garage:'Garáž',payments:'Platby',reservation:'Registrace',photos:'Moje fotky',merch:'United Merch',club:'United Club',account:'Účet'})){
  await page.locator(`.member-sidebar [data-member-section=${id}]`).click();await expect(page.locator('[data-member-section-title]')).toHaveText(title);await expect(page.locator('[data-member-page-title]')).toBeFocused();expect(await page.locator(`[data-member-panel=${id}] > .member-section-head h2`).count()).toBe(0);
  expect(await page.locator('[data-member-page-title]').evaluate(el=>el.getBoundingClientRect().top>=document.querySelector('.site-header').getBoundingClientRect().bottom)).toBe(true);
 }
 for(const [w,h,theme,label] of [[1440,1000,'light','account-desktop'],[1366,768,'dark','account-notebook'],[390,844,'light','account-mobile'],[360,800,'dark','account-360']]){await page.setViewportSize({width:w,height:h});await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await capture(page,label,theme);}
 await page.locator('[data-mobile-menu]').click();await expect(page.locator('.mobile-public-links a')).toHaveCount(3);await expect(page.locator('.mobile-public-links a').nth(2)).toHaveAttribute('href','merch.html');await capture(page,'menu-360','dark');await page.keyboard.press('Escape');await expect(page.locator('[data-mobile-menu]')).toBeFocused();
 await page.locator('.member-bottom-nav [data-mobile-section=payments]').click();await page.locator('[data-member-payment-tab=merch]').click();await expect(page.locator('[data-merch-payments]')).toBeVisible();await expect(page.locator('[data-payments-list]')).toBeHidden();await page.locator('[data-member-payment-tab=sraz]').click();await expect(page.locator('[data-payments-list]')).toBeVisible();
 expect(errors.pageErrors).toEqual([]);expect(errors.unhandledApi).toEqual([]);
});
test('compact Club, next milestone and actionable points guide',async({page})=>{
 const {errors}=await setup(page,{points:24});await page.setViewportSize({width:1440,height:1000});await page.goto('/member.html?section=club');
 await expect(page.locator('[data-reward-name]')).toContainText('10 %');await expect(page.locator('[data-reward-progress]')).toContainText('Do další odměny');await expect(page.locator('[data-reward-progress] [role=progressbar]')).toHaveAttribute('aria-valuenow','0');await expect(page.locator('.reward-achieved')).toHaveCount(0);
 for(const [w,h,theme,label] of [[1440,1000,'light','club-desktop'],[1366,768,'dark','club-notebook'],[390,844,'light','club-mobile'],[360,800,'dark','club-360']]){await page.setViewportSize({width:w,height:h});await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await capture(page,label,theme);}
 await page.locator('[data-points-guide-open]').click();await expect(page.locator('#points-guide')).toBeVisible();await capture(page,'points-guide-360','dark');await page.keyboard.press('Escape');await expect(page.locator('[data-points-guide-open]')).toBeFocused();
 await page.locator('[data-points-guide-open]').click();await page.locator('[data-points-guide-target=photos]').click();await expect(page.locator('#points-guide')).not.toBeVisible();await expect(page.locator('[data-member-section-title]')).toHaveText('Moje fotky');
 expect(errors.pageErrors).toEqual([]);expect(errors.unhandledApi).toEqual([]);
});
test('public Merch filters combine and points are not capped',async({page})=>{
 const {errors}=await setup(page,{points:22});await page.setViewportSize({width:1440,height:1000});await page.goto('/merch.html#drop');
 await expect(page.locator('[data-benefit-points]')).toHaveText('22');await expect(page.locator('[data-benefit-next]')).toHaveText('Do další odměny: 2 body');await expect(page.locator('[data-benefit-progress]')).toHaveAttribute('aria-valuenow','10');
 await expect(page.locator('[data-product]')).toHaveCount(6);await page.locator('[data-gender=women]').click();await page.locator('[data-merch-filter="Trička"]').click();await expect(page.locator('[data-product]')).toHaveCount(2);await capture(page,'merch-filters-desktop');
 await page.locator('[data-merch-filter="Limitovaná kolekce"]').click();await expect(page.locator('[data-product]')).toHaveCount(0);await page.locator('[data-clear-filters]').click();await expect(page.locator('[data-product]')).toHaveCount(6);
 await page.setViewportSize({width:360,height:800});await capture(page,'merch-filters-360','dark');expect(errors.pageErrors).toEqual([]);
});
test('public compositions and anonymous points keep meaningful states',async({page})=>{
 const {errors}=await setup(page,{authenticated:false});await page.setViewportSize({width:1440,height:1000});await page.goto('/index.html');await expect(page.locator('.hero-sub')).toHaveText('Největší sraz BMW E36 v ČR');await capture(page,'home-desktop');
 await page.setViewportSize({width:390,height:844});await capture(page,'home-mobile','dark');await page.locator('#experience').scrollIntoViewIfNeeded();await capture(page,'program-mobile');await page.locator('[data-day=saturday]').click();await expect(page.locator('[data-day=saturday]')).toHaveAttribute('aria-selected','true');
 await page.locator('#show-shine').scrollIntoViewIfNeeded();await expect(page.locator('.showshine-rule-copy')).toBeHidden();await expect(page.locator('.planner-status')).toHaveCount(0);
 await page.goto('/merch.html#drop');await expect(page.locator('[data-benefit-anonymous]')).toBeVisible();await expect(page.locator('[data-benefit-member]')).toBeHidden();
 await page.setViewportSize({width:1366,height:768});await page.goto('/o-nas.html');await capture(page,'about-notebook','dark');await page.goto('/galerie.html');await capture(page,'gallery-notebook');
 await page.setViewportSize({width:360,height:800});await capture(page,'gallery-360','dark');expect(errors.pageErrors).toEqual([]);
});

test('final visual review of adjusted mobile surfaces and compact cards',async({page})=>{
 await setup(page,{points:24});await page.setViewportSize({width:1440,height:1000});await page.goto('/member.html?section=club');
 await expect(page.locator('[data-reward-name]')).toContainText('10 %');await capture(page,'club-desktop');
 await page.locator('[data-points-guide-open]').click();await capture(page,'points-guide-desktop');await page.keyboard.press('Escape');
 await page.setViewportSize({width:390,height:844});await page.goto('/member.html?section=account');await page.locator('.account-appearance').scrollIntoViewIfNeeded();await capture(page,'account-mobile-bottom');
 await page.goto('/index.html');await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await capture(page,'home-mobile','dark');
 await page.locator('#experience').scrollIntoViewIfNeeded();await capture(page,'program-mobile');
 await expect(page.locator('.weekend-overlay')).toHaveCSS('background-color','rgb(255, 255, 255)');await capture(page,'program-mobile-dark','dark');
});

test('mobile program descriptions inherit readable theme colors',async({page})=>{
 await setup(page,{authenticated:false});await page.setViewportSize({width:390,height:844});await page.goto('/index.html#experience');
 for(const theme of ['light','dark']){
  await capture(page,`program-mobile${theme==='dark'?'-dark':''}`,theme);
  const colors=await page.locator('.weekend-overlay').evaluate(el=>({base:getComputedStyle(el).color,description:getComputedStyle(el.querySelector('.day-program small')).color}));
  expect(colors.description).toBe(colors.base);
 }
});
