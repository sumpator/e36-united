import {test,expect} from '@playwright/test';
import {prepareE2ePage} from './fixtures.mjs';
import {commandFixture} from './command-fixture.mjs';
import {readFileSync} from 'node:fs';
import * as live from '../../worker/domains/live.js';
import {memberRuntime} from '../helpers/admin-member-runtime.mjs';
const photo=readFileSync(new URL('../../assets/images/showshine/ss_coupe.webp',import.meta.url));
for(const width of [1440,390])test(`appearance polish photo workflow ${width}`,async({page})=>{
 const o=await prepareE2ePage(page,{authenticated:true});await seed(page);await photos(page);await page.setViewportSize({width,height:900});
 await page.route('**/api/gallery/mine?**',r=>r.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({submissions:['approved','pending','rejected'].map((status,i)=>({id:`visual-${i}`,status,caption:'United – společný víkend',createdAt:'2026-09-20T12:00:00Z'})),pagination:{hasMore:false}})}));
 await page.route('**/api/gallery/mine/media/*',r=>r.fulfill({contentType:'image/webp',headers:{'Access-Control-Allow-Origin':'*'},body:photo}));
 await page.goto('/member.html?section=photos');await page.locator('[data-member-gallery-list]').scrollIntoViewIfNeeded();
 await expect(page.locator('[data-member-gallery-image]')).toHaveCount(3);
 await expect.poll(()=>page.locator('[data-member-gallery-image]').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0))).toBe(true);
 await capture(page,`polish-photos-${width}`);
 await page.locator('[data-member-gallery-open="0"]').click();await expect(page.locator('[data-member-gallery-lightbox]')).toBeVisible();
 await expect.poll(()=>page.locator('[data-member-gallery-lightbox-image]').evaluate(i=>i.complete&&i.naturalWidth>0)).toBe(true);await capture(page,`polish-lightbox-${width}`);
 await page.getByRole('button',{name:'Zavřít náhled',exact:true}).click();
 await page.locator('[data-member-photo-input]').setInputFiles({name:'visual.webp',mimeType:'image/webp',buffer:photo});
 await expect(page.locator('[data-member-photo-selection]')).toBeVisible();await capture(page,`polish-selection-${width}`);
 expect(o.pageErrors).toEqual([]);expect(o.requests.filter(r=>r.startsWith('POST /api/gallery'))).toEqual([]);
});
for(const width of [1440,390])test(`appearance polish gallery media ${width}`,async({page})=>{
 const o=await prepareE2ePage(page,{authenticated:true,approvedGallery:[{id:'visual',author:'Eva',caption:'United víkend',imageUrl:'/api/gallery/media/visual'}]});
 await photos(page);await seed(page);await page.route('**/api/gallery/media/*',r=>r.fulfill({contentType:'image/webp',headers:{'Access-Control-Allow-Origin':'*'},body:photo}));await page.setViewportSize({width,height:900});await page.goto('/galerie.html');
 for(const id of ['videos','official-photos','user-photos','nahraj-fotky']){
  const link=page.locator(`[data-gallery-nav="${id}"]`);await link.click();await expect(page).toHaveURL(new RegExp(`#${id}$`));await expect(page.locator(`#${id}`)).toBeInViewport();await capture(page,`polish-gallery-${id}-${width}`);
 }
 await page.locator('[data-gallery-nav="user-photos"]').click();await page.locator('#user-photos [data-lightbox]').first().click();await expect(page.locator('.lightbox')).toHaveClass(/open/);await capture(page,`polish-public-lightbox-${width}`);await page.locator('.lightbox-close').click();expect(o.pageErrors).toEqual([]);
});
for(const width of [1440,390,360])test(`appearance polish Show Shine and Info ${width}`,async({page})=>{
 const o=await prepareE2ePage(page);await photos(page);await seed(page);await page.setViewportSize({width,height:900});await page.goto('/index.html');
 await expect(page.locator('.site-header [data-appearance-select]')).toHaveCount(0);
 await expect(page.locator('[data-event-hud]')).toHaveCount(0);
 const cards=page.locator('.category-selector .winner-card');await expect(cards).toHaveCount(7);
 for(let i=0;i<7;i++){
  const card=cards.nth(i);await card.click();await expect(card).toHaveClass(/is-active/);
  await expect(page.locator('[data-category-showcase-image]')).toHaveJSProperty('complete',true);
  expect(await card.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
  expect(await card.locator('img').evaluate(img=>getComputedStyle(img).filter)).toBe('none');
 }
 await page.locator('.category-console').scrollIntoViewIfNeeded();await capture(page,`polish-categories-${width}`);
 await page.locator('.showshine-disclosure summary').click();await expect(page.locator('.showshine-disclosure')).toHaveAttribute('open','');
 await page.locator('.showshine-scorecard').scrollIntoViewIfNeeded();await capture(page,`polish-judging-${width}`);
 await page.locator('#info-hub').scrollIntoViewIfNeeded();await capture(page,`polish-info-${width}`);
 const route=page.locator('.route-input-row button');await expect(route).toHaveText('→');
 expect(await route.evaluate(b=>getComputedStyle(b).color)).not.toBe(await route.evaluate(b=>getComputedStyle(b).backgroundColor));
 await page.locator('.site-footer [data-appearance-select]').selectOption('dark');await page.locator('.category-console').scrollIntoViewIfNeeded();await capture(page,`polish-categories-dark-${width}`);
 expect(o.pageErrors).toEqual([]);
});
async function seed(page){await page.addInitScript(()=>{try{localStorage.setItem('e36UnitedAppearance','light')}catch{}})}
async function photos(page){await page.route('https://static.wixstatic.com/**',r=>/UsingleWhite/i.test(r.request().url())?r.fulfill({contentType:'image/png',body:readFileSync(new URL('../../united-logo-blue-silver-transparent.png',import.meta.url))}):r.fulfill({contentType:'image/webp',body:photo}));await page.route('**/api/**/photo*',r=>r.request().method()==='GET'?r.fulfill({contentType:'image/webp',body:photo}):r.fallback());await page.route('**/api/cars/media/**',r=>r.fulfill({contentType:'image/webp',headers:{'Access-Control-Allow-Origin':'*'},body:photo}))}
async function capture(page,name){
 await page.evaluate(async()=>{
  await document.fonts.ready;
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 });
 await page.screenshot({path:`${process.env.APPEARANCE_SCREENSHOTS||'test-results/appearance'}/${name}.png`,animations:'disabled'});
 const overflow=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&e.getBoundingClientRect().width>0).slice(0,12).map(e=>({tag:e.tagName,class:e.className,right:e.getBoundingClientRect().right}))}));
 expect(overflow.document,JSON.stringify({name,...overflow})).toBeLessThanOrEqual(overflow.width+1);
}
for(const width of [1440,390])for(const file of ['index','galerie','merch','o-nas'])test(`appearance public ${file} ${width}`,async({page})=>{
 await prepareE2ePage(page);await photos(page);await seed(page);await page.setViewportSize({width,height:900});await page.goto('/'+file+'.html');await expect(page.locator('html')).toHaveAttribute('data-theme','light');await capture(page,`${file}-${width}`);
 if(file==='index'){await page.locator('#planer').scrollIntoViewIfNeeded();await capture(page,`planner-${width}`)}
});
test('appearance preference persists across entries and refresh without application requests',async({page})=>{
 await prepareE2ePage(page);await page.goto('/index.html');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await expect(page.locator('.site-header [data-appearance-select]')).toHaveCount(0);
 await page.locator('.site-footer [data-appearance-select]').scrollIntoViewIfNeeded();
 const requests=[];page.on('request',r=>requests.push(r.url()));await page.locator('.site-footer [data-appearance-select]').selectOption('light');expect(requests.filter(url=>url.includes('/api/'))).toEqual([]);
 await page.goto('/galerie.html');await expect(page.locator('html')).toHaveAttribute('data-theme','light');await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.setViewportSize({width:360,height:800});await page.locator('.menu-btn').click();await expect(page.locator('.nav-links [data-appearance-select]')).toHaveCount(0);await capture(page,'public-menu-360');
});
for(const width of [1440,390])test(`appearance approved registration ${width}`,async({page})=>{
 const reservation={id:'r',eventId:'united-2026',eventYear:2026,title:'United 2026',status:'approved',carId:'car-001',carSnapshot:{nickname:'Estoril',model:'328i',body:'Coupé'},arrival:'Pátek',attendanceType:'full_weekend',crew:2,accommodation:'Bez ubytování',accommodationUnits:0,showShine:'Ano',note:'Poznámka',amountDueCzk:1200,amountPaidCzk:2960,paymentStatus:'overpaid',payment:{status:'overpaid',amountDueCzk:1200,amountPaidCzk:2960,balanceCzk:-1760,remainingCzk:0,overpaymentCzk:1760}};
 const o=await prepareE2ePage(page,{authenticated:true,reservation,cars:[{id:'car-001',nickname:'Estoril',model:'328i',body:'Coupé',primary:true,photos:[{id:'car-photo'}]}]});await seed(page);await photos(page);await page.setViewportSize({width,height:900});await page.goto('/member.html?section=reservation');await expect(page.locator('[data-request-change]')).toBeVisible();await capture(page,`member-approved-${width}`);
 await expect(page.locator('.member-logged-hero')).toHaveAttribute('data-hero-state','photo');await capture(page,`member-photo-header-${width}`);
 await page.goto('/member.html?section=overview');await expect(page.locator('.overview-reservation-status')).toContainText('PŘEPLATEK');await page.locator('.overview-reservation-status').scrollIntoViewIfNeeded();await capture(page,`polish-overpayment-${width}`);
 await page.goto('/member.html?section=reservation');await expect(page.locator('[data-request-change]')).toBeVisible();await page.locator('.reservation-detail-grid').scrollIntoViewIfNeeded();await capture(page,`polish-registration-${width}`);
 await page.locator('[data-request-change]').click();await expect(page.locator('[data-member-planner-modal]')).toBeVisible();await capture(page,`member-change-${width}`);expect(o.pageErrors).toEqual([]);
});
for(const width of [1440,390,360])test(`appearance Planner dialogs ${width}`,async({page})=>{
 const o=await prepareE2ePage(page,{authenticated:true,preliminaryEnabled:true,cars:[]});await seed(page);await photos(page);await page.setViewportSize({width,height:900});
 await page.goto('/member.html?section=reservation');
 const intro=page.locator('[data-onboarding-intro-modal]');await expect(intro).toBeVisible();await intro.getByRole('button',{name:'Zavřít úvod'}).click();
 await page.locator('[data-member-plan-open]').click();const modal=page.locator('[data-member-planner-modal]');await expect(modal).toBeVisible();
 await modal.locator('[data-member-stay="0"]').click();await modal.locator('[data-member-sleep="Chatka"]').click();await modal.locator('[name=accommodationOptionId]').selectOption('cabin-standard');
 await capture(page,`member-planner-${width}`);
 await modal.locator('[data-member-planner-add-car]').click();await expect(page.locator('[data-car-modal]')).toBeVisible();await capture(page,`member-car-dialog-${width}`);await page.getByRole('button',{name:'Zavřít formulář auta'}).click();
 await modal.locator('[name=note]').fill('Appearance fixture draft');await modal.locator('[data-reservation-submit]').click();await expect(modal).toBeHidden();await capture(page,`member-preliminary-${width}`);expect(o.pageErrors).toEqual([]);
});

async function liveFixture(page,member){
 const c=member?{r:memberRuntime(),observations:await prepareE2ePage(page,{authenticated:true})}:await commandFixture(page);
 c.r.db.exec("UPDATE events SET live_enabled=1 WHERE id='e'; UPDATE cars SET body='Sedan' WHERE id='c'; INSERT INTO live_entries(id,event_id,discipline,member_id,car_id,category,presented_at) VALUES('legacy','e','show_shine','m','c','Sedan',CURRENT_TIMESTAMP); INSERT INTO live_competition_state(event_id,discipline,status,current_entry_id,version) VALUES('e','show_shine','live','legacy',3)");
 await page.route('https://api.e36united.cz/api/**',async route=>{
  const q=route.request(),url=new URL(q.url());if(!url.pathname.includes('/live'))return route.fallback();
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, OPTIONS'};
  if(q.method()==='OPTIONS')return route.fulfill({status:204,headers});
  const response=url.pathname==='/api/admin/live'?await live.getAdminLive(c.r.env,url,'https://e36united.cz'):url.pathname==='/api/live'?await live.getMemberLive(c.r.env,{uid:'a'},'https://e36united.cz'):url.pathname==='/api/live/state'?await live.getLiveState(c.r.env,{uid:'a'},url,'https://e36united.cz'):null;
  if(!response)return route.fallback();return route.fulfill({status:response.status,headers,body:await response.text()});
 });return c;
}
for(const width of [1440,390,360])for(const member of [true,false])test(`appearance LIVE ${member?'member':'admin'} ${width}`,async({page})=>{
 const c=await liveFixture(page,member);await seed(page);await photos(page);await page.setViewportSize({width,height:900});
 try{
  await page.goto(`/${member?'member':'admin'}.html?section=live&event=e`);
  await page.locator(member?'[data-live-entry-confirm]':'[data-admin-live-entry-confirm]').click();
  const prefix=member?'':'admin-';await expect(page.locator(`[data-${prefix}live-tab="showshine"]`)).toBeVisible();
  await capture(page,`live-${member?'member':'admin'}-program-${width}`);
  await page.locator(`[data-${prefix}live-tab="showshine"]`).click();if(!member)await page.locator('[data-live-select-category="Sedan"]').click();await capture(page,`live-${member?'member':'admin'}-judging-${width}`);
  await page.locator(`[data-${prefix}live-more-toggle]`).click();await page.locator(`[data-${prefix}live-more-menu] [data-appearance-select]`).selectOption('dark');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await capture(page,`live-${member?'member':'admin'}-dark-${width}`);
 }finally{await page.close();c.r.db.close()}
});
for(const width of [1440,390])test(`appearance member sections ${width}`,async({page})=>{
 const o=await prepareE2ePage(page,{authenticated:true,preliminaryEnabled:true});await photos(page);await seed(page);await page.setViewportSize({width,height:900});
 await page.goto('/member.html?section=overview');await expect(page.locator('[data-app-view]')).toBeVisible();
 const onboarding=page.locator('[data-onboarding-close]');if(await onboarding.isVisible())await onboarding.click();
 await capture(page,`member-overview-${width}`);
 for(const section of ['reservation','garage','payments','club','photos','account']){await page.goto('/member.html?section='+section);await expect(page.locator(`[data-member-panel="${section}"]`)).toHaveClass(/is-active/);await capture(page,`member-${section}-${width}`)}
 const input=page.locator('[data-account-form] [name=nickname]');await input.fill('Rozepsaná přezdívka');
 const theme=page.locator('[data-member-panel="account"] [data-appearance-select]');const writes=o.profileWrites.length;
 await theme.selectOption('dark');await expect(input).toHaveValue('Rozepsaná přezdívka');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await capture(page,`member-dark-${width}`);
 await theme.selectOption('system');await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).toHaveAttribute('data-theme','light');await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 expect(o.profileWrites.length).toBe(writes);expect(o.pageErrors).toEqual([]);
});
for(const width of [1440,390])test(`appearance admin ${width}`,async({page})=>{
 const c=await commandFixture(page);await seed(page);await photos(page);await page.setViewportSize({width,height:900});
 try{for(const section of ['dashboard','reservations','payments','members','photos','club','mailing','event']){await page.goto('/admin.html?section='+(section==='members'?'community&view=members':section)+'&event=e');await expect(page.locator('[data-admin-view]')).toBeVisible();await expect(page.locator('[data-admin-freshness]')).not.toBeEmpty();await capture(page,`admin-${section}-${width}`);if(section==='members'){await page.locator('[data-member-list] [data-member-open="m"]').click();await expect(page.locator('[data-member-dialog]')).toBeVisible();await capture(page,`admin-member-dialog-${width}`)}}expect(c.observations.pageErrors).toEqual([])}finally{await page.close();c.r.db.close()}
});
