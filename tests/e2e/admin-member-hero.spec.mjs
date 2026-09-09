import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {commandFixture} from './command-fixture.mjs';
import {adminMemberMedia} from '../../worker/admin/members.js';
const modal=p=>p.locator('[data-member-dialog]'),hero=p=>p.locator('[data-member-hero-image]');
const photoCalls=c=>c.calls.filter(q=>q.includes('/members/')&&q.includes('/media/'));
const jsonCalls=c=>c.calls.filter(q=>q.startsWith('GET ')&&!q.includes('/media/'));
const shot=(p,i,name)=>p.screenshot({path:i.outputPath(name+'.png')});
async function select(p,tab){if(await p.locator('[data-member-section-select]').isVisible())await p.locator('[data-member-section-select]').selectOption(tab);else await p.locator('[data-member-tab="'+tab+'"]').click();}
async function spyUrls(page){await page.addInitScript(()=>{
 const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
 window.heroUrls={created:[],revoked:[]};
 URL.createObjectURL=blob=>{const url=create(blob);window.heroUrls.created.push(url);return url;};
 URL.revokeObjectURL=url=>{window.heroUrls.revoked.push(url);return revoke(url);};
});}
async function start(page,c){await page.goto('/admin.html?event=e&section=community&view=members');await expect(page.locator('[data-member-list] [data-member-open="m"]')).toBeVisible();await expect(page.locator('[data-admin-freshness]')).toHaveAttribute('data-state','fresh');c.calls.length=0;await page.locator('[data-member-list] [data-member-open="m"]').click();await expect(modal(page).locator('[data-member-overview]')).toBeVisible();await expect(modal(page)).toContainText('320i');}
function clean(c){expect(c.writes).toEqual([]);expect(c.r.writes).toBe(0);expect(c.r.db.prepare('SELECT COUNT(*) n FROM member_qr_identities').get().n).toBe(0);expect(c.observations.pageErrors).toEqual([]);expect(c.observations.unhandledApi).toEqual([]);expect(c.observations.consoleErrors.filter(e=>!c.failures.has(e.url))).toEqual([]);}
async function geometry(page,width){
 const h=await page.locator('[data-member-hero]').boundingBox(),close=await page.locator('[data-member-close]').boundingBox(),panel=await page.locator('[data-member-panel]').boundingBox();
 expect(h.height).toBeGreaterThanOrEqual(width===390?150:180);expect(h.height).toBeLessThanOrEqual(width===390?230:250);expect(close.y).toBeGreaterThanOrEqual(0);expect(close.x+close.width).toBeLessThanOrEqual(width);expect(panel.height).toBeGreaterThan(200);
 expect(await modal(page).evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
}
for(const [width,wideFont] of [[1600,false],[390,false],[390,true]])test('HERO photo overview coalesces across tabs and refresh; Garage remains lazy '+width+(wideFont?' wide fallback font':''),async({page},info)=>{
 await page.setViewportSize({width,height:width===390?844:900});await page.clock.install();await spyUrls(page);const c=await commandFixture(page);c.r.db.exec("UPDATE cars SET body='sedan' WHERE id='c'; UPDATE members SET nickname='Modrý cestovatel',name='Testovací člen' WHERE id='m'");
 await start(page,c);await expect(hero(page)).toBeVisible();await expect(page.locator('[data-member-hero]')).toHaveClass(/has-photo/);await expect(modal(page)).toContainText('Hlavní vůz');await expect(modal(page)).toContainText('Blue · BMW 328i · Sedan');
 expect(jsonCalls(c)).toEqual(['GET /api/admin/members/m?eventId=e','GET /api/admin/members/m/club?eventId=e&page=1']);expect(photoCalls(c)).toEqual(['GET /api/admin/members/m/media/cars/c/p']);
 // System UI font metrics differ between Windows and the Linux CI runner. The
 // wider available fallback reproduces the CI wrapping on Windows as well.
 if(wideFont)await page.addStyleTag({content:'.admin-page{font-family:Verdana,sans-serif}'});
 await geometry(page,width);await shot(page,info,'hero-photo-'+width+(wideFont?'-wide':''));const url=await hero(page).getAttribute('src');await hero(page).evaluate(n=>n.dataset.sameNode='yes');
 await select(page,'club');await expect(modal(page)).toContainText('S&S TOP 3');await select(page,'overview');await expect(hero(page)).toHaveAttribute('src',url);
 await page.clock.runFor(61000);await expect.poll(()=>jsonCalls(c).filter(q=>q.startsWith('GET /api/admin/members/m?')).length).toBe(2);await expect(hero(page)).toHaveAttribute('data-same-node','yes');expect(photoCalls(c)).toHaveLength(1);expect((await page.evaluate(()=>window.heroUrls.created))).toEqual([url]);
 expect(c.calls.some(q=>q.includes('/garage?'))).toBe(false);await select(page,'garage');await expect(modal(page).locator('[data-member-media]').first()).toHaveAttribute('src',/^blob:/);expect(c.calls.filter(q=>q.includes('/garage?'))).toHaveLength(1);await expect(modal(page)).toContainText('Track');if(width===1600)await shot(page,info,'hero-garage-1600');
 await select(page,'overview');await expect(hero(page)).toHaveAttribute('src',url);await page.locator('[data-member-close]').click();await expect(hero(page)).toHaveCount(0);expect(await page.evaluate(u=>window.heroUrls.revoked.includes(u),url)).toBe(true);clean(c);c.r.db.close();
});
for(const [kind,width]of [['without-photo',1600],['without-primary',1600],['without-photo',390]])test('HERO branded fallback '+kind+' '+width,async({page},info)=>{
 await page.setViewportSize({width,height:width===390?844:900});const c=await commandFixture(page);
 c.r.db.exec(kind==='without-primary'?"UPDATE cars SET is_primary=0 WHERE member_id='m'":"DELETE FROM car_photos WHERE car_id='c'");
 await start(page,c);await expect(hero(page)).toHaveCount(0);await expect(page.locator('[data-member-hero]')).not.toHaveClass(/has-photo/);expect(photoCalls(c)).toEqual([]);expect(jsonCalls(c)).toHaveLength(2);
 if(kind==='without-primary')await expect(modal(page).locator('.admin-member-hero-car')).toHaveCount(0);else await expect(modal(page).locator('.admin-member-hero-car')).toContainText('BMW 328i');
 await geometry(page,width);await shot(page,info,'hero-'+kind+'-'+width);clean(c);c.r.db.close();
});
// This narrow override still executes the real private ownership/R2 handler.
async function controlledMedia(page,c,control){await page.route('https://api.e36united.cz/api/admin/members/*/media/cars/*/*',async route=>{
 const q=route.request(),parts=new URL(q.url()).pathname.split('/'),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type'};
 if(q.method()==='OPTIONS')return route.fulfill({status:204,headers});
 c.calls.push('GET '+new URL(q.url()).pathname);const response=await adminMemberMedia(c.r.env,parts[4],parts[6],parts[7],parts[8],'https://e36united.cz');
 expect(response.status).toBe(200);const result=await control(parts[4]);if(result.status>=400)c.failures.add(q.url());
 await route.fulfill({headers,status:result.status||200,contentType:result.contentType||'image/webp',body:result.body||readFileSync(new URL('../../assets/images/showshine/ss_sedan.webp',import.meta.url))});
});}
for(const kind of ['404','decode'])test('HERO media '+kind+' safely falls back without repeated poll downloads',async({page})=>{
 await page.clock.install();await spyUrls(page);const c=await commandFixture(page);await controlledMedia(page,c,async()=>kind==='404'?{status:404,body:'missing'}:{body:'not an image'});
 await start(page,c);await expect.poll(()=>photoCalls(c).length).toBe(1);await expect(page.locator('[data-member-freshness]')).not.toContainText('nedostupné');
 if(kind==='decode')await expect.poll(()=>page.evaluate(()=>window.heroUrls.revoked.length)).toBe(1);
 await expect(hero(page)).toHaveCount(0);await expect(page.locator('[data-member-hero]')).not.toHaveClass(/has-photo/);
 await page.clock.runFor(61000);await expect.poll(()=>jsonCalls(c).filter(q=>q.includes('/members/m?')).length).toBe(2);expect(photoCalls(c)).toHaveLength(1);await select(page,'club');await expect(modal(page)).toContainText('S&S TOP 3');clean(c);c.r.db.close();
});
test('HERO delayed A cannot create or show private image in B context',async({page})=>{
 await spyUrls(page);const c=await commandFixture(page);let release,arrive,delivered;const held=new Promise(r=>release=r),arrived=new Promise(r=>arrive=r),sent=new Promise(r=>delivered=r);
 await controlledMedia(page,c,async id=>{if(id==='m'){arrive();await held;delivered();}return {};});
 try{await start(page,c);await arrived;await page.locator('[data-member-close]').click();await page.locator('[data-member-list] [data-member-open="n"]').click();await expect(modal(page)).toContainText('EU-OTHER');await expect(hero(page)).toBeVisible();
 const b=await hero(page).getAttribute('src');release();await sent;await select(page,'club');await expect(modal(page)).toContainText('316i');await select(page,'overview');await expect(hero(page)).toHaveAttribute('src',b);expect(await page.evaluate(()=>window.heroUrls.created)).toEqual([b]);expect(photoCalls(c)).toEqual(['GET /api/admin/members/m/media/cars/c/p','GET /api/admin/members/n/media/cars/cn/pn']);clean(c);
 }finally{release();await page.locator('[data-member-close]').click();c.r.db.close();}
});
for(const mode of ['logout','denied'])test('HERO private URL removed on '+mode,async({page})=>{
 await page.clock.install();await spyUrls(page);const c=await commandFixture(page);await start(page,c);await expect(hero(page)).toBeVisible();const url=await hero(page).getAttribute('src');
 if(mode==='logout'){await page.evaluate(async()=>{const auth=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');await auth.signOut(auth.getAuth());});}else{c.mode='denied';await page.clock.runFor(61000);}
 await expect(modal(page)).toBeHidden();await expect(hero(page)).toHaveCount(0);expect(await page.evaluate(u=>window.heroUrls.revoked.includes(u),url)).toBe(true);expect(c.r.writes).toBe(0);expect(c.observations.pageErrors).toEqual([]);c.r.db.close();
});
test('HERO long mobile identity wraps without covering close or section picker',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});const c=await commandFixture(page);c.r.db.exec("UPDATE members SET nickname='VelmiDlouháPřezdívkaBezMezerProOvěřeníBezpečnéhoZalomení',name='Syntetický testovací člen s dlouhým jménem' WHERE id='m'");
 await start(page,c);await expect(hero(page)).toBeVisible();const close=await page.locator('[data-member-close]').boundingBox(),title=await page.locator('#admin-member-heading').boundingBox(),picker=await page.locator('[data-member-section-select]').boundingBox();
 expect(title.x+title.width).toBeLessThanOrEqual(close.x);expect(picker.y+picker.height).toBeLessThan(600);expect(await modal(page).evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);await shot(page,info,'hero-long-mobile');clean(c);c.r.db.close();
});
