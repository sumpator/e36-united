import {test,expect} from '@playwright/test';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {prepareE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';
import {installScreenshotReadiness,waitForScreenshotContent} from './screenshot-readiness.mjs';

const shots=resolve('.local-evidence/portal-visual-20261030/screenshots');
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
 await page.setViewportSize({width:390,height:740});await page.goto('/member.html?section=reservation');await expect(page.locator('[data-member-panel=reservation]')).toBeVisible();await expect(page.getByRole('region',{name:'Stav registrace',exact:true})).toContainText(/schválení/i);await capture(page,'reservation-pending-long');
 await select(page,'garage');await expect(page.locator('[data-garage-grid]')).toContainText('Moje původní velmi dlouhá přezdívka E36');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expectNoUnexpectedClientErrors(o);
});
