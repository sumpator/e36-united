import {test,expect} from '@playwright/test';
import {commandFixture} from './command-fixture.mjs';

const modal=page=>page.locator('[data-member-dialog]');
const ready=async page=>{await expect(page.locator('[data-dashboard-edit]')).toBeEnabled();await expect(page.locator('[data-kpi-reservations]')).not.toHaveText('—');};
const clean=c=>{expect(c.writes).toEqual([]);expect(c.r.writes).toBe(0);expect(c.observations.pageErrors).toEqual([]);expect(c.observations.unhandledApi).toEqual([]);expect(c.observations.consoleErrors.filter(e=>!c.failures.has(e.url))).toEqual([]);};
const shot=(page,info,name)=>page.screenshot({path:info.outputPath(name+'.png')});
async function select(page,tab){if(await page.locator('[data-member-section-select]').isVisible())await page.locator('[data-member-section-select]').selectOption(tab);else await page.locator(`[data-member-tab="${tab}"]`).click();}
async function noOverflow(page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
async function spyPrivateMediaLifecycle(page,{holdPhoto=false}={}){await page.addInitScript(hold=>{
 const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL),consumers=new Map();let barrier;
 window.privateMediaLifecycle={created:[],revoked:[],watch(url,nodes){consumers.set(url,nodes)},barrier:{arrived:false,returned:false,release(){barrier?.release()}}};
 URL.createObjectURL=blob=>{const url=create(blob);window.privateMediaLifecycle.created.push(url);return url};
 URL.revokeObjectURL=url=>{const nodes=consumers.get(url)||[];window.privateMediaLifecycle.revoked.push({url,connected:nodes.map(node=>node.isConnected)});consumers.delete(url);return revoke(url)};
 if(hold){const request=fetch.bind(window);let holdNext=true;fetch=async(input,init)=>{const response=await request(input,init),url=String(input);if(!holdNext||!url.includes('/api/admin/members/m/media/photos/g'))return response;
   holdNext=false;barrier={promise:null,release:null};barrier.promise=new Promise(resolve=>barrier.release=resolve);window.privateMediaLifecycle.barrier.arrived=true;await barrier.promise;window.privateMediaLifecycle.barrier.returned=true;return response;};}
 },holdPhoto)}
async function aligned(page){
 const boxes=await page.locator('[data-dashboard-grid]>.dashboard-card').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return{id:n.dataset.widget,x:b.x,y:b.y,bottom:b.bottom,width:b.width};}));
 for(const a of boxes)for(const b of boxes)if(a.id!==b.id&&Math.abs(a.y-b.y)<2)expect(Math.abs(a.bottom-b.bottom),a.id+' / '+b.id).toBeLessThanOrEqual(1);
 return boxes;
}
for(const [width,height]of [[1920,1080],[1600,900],[1366,768],[1280,720],[390,844],[800,450]])test(`RESPONSIVE dashboard natural rows and header ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height});const c=await commandFixture(page);
 c.r.db.exec("INSERT INTO event_accommodation_options(id,event_id,name,kind,inventory_mode,units_total,capacity_per_unit) VALUES('caravan','e','Velká chata pro skupiny','cabin','limited',12,4)");
 await page.goto('/admin.html?section=dashboard&event=e');await ready(page);await noOverflow(page);
 const boxes=await aligned(page);if(width>1050)expect(Math.abs(boxes[0].y-boxes[1].y)).toBeLessThanOrEqual(1);
 const header=await page.locator('.admin-header').boundingBox(),heading=await page.locator('.dashboard-heading').boundingBox();expect(heading.y).toBeGreaterThanOrEqual(header.y+header.height);
 await shot(page,info,'dashboard-populated-'+width);
 if(width===1600){
  c.r.db.exec('DELETE FROM reservation_accommodation; DELETE FROM reservations');await page.reload();await ready(page);await expect(page.locator('[data-kpi-reservations]')).toHaveText('0');await expect(page.locator('.command-capacity')).toHaveCount(3);await aligned(page);await shot(page,info,'dashboard-empty-three-types');
  c.r.db.exec("UPDATE event_accommodation_options SET name='Velmi dlouhý název ubytování pro skupinu s doplňujícím popisem místa' WHERE id='caravan'; INSERT INTO event_accommodation_options(id,event_id,name,kind,inventory_mode,units_total,capacity_per_unit) VALUES('extra','e','Další skutečný testovací typ ubytování','tent','limited',4,2)");
  await page.reload();await ready(page);await expect(page.locator('.command-capacity')).toHaveCount(4);await aligned(page);await noOverflow(page);await shot(page,info,'dashboard-long-capacity');
 }
 await page.locator('[data-dashboard-composition]').selectOption('onsite');await expect(page.locator('[data-dashboard-title]')).toHaveText('Na srazu');await aligned(page);await noOverflow(page);
 clean(c);c.r.db.close();
});

test('RESPONSIVE settings reorder visibility and size still share the actual grid',async({page},info)=>{
 await page.setViewportSize({width:1600,height:900});const c=await commandFixture(page);await page.goto('/admin.html?event=e');await ready(page);
 await page.locator('[data-dashboard-edit]').click();const row=page.locator('[data-edit-widget="approvals"]');
 await row.locator('[data-widget-toggle]').uncheck();await page.locator('[data-edit-widget="reservation-summary"] [data-widget-size]').selectOption('wide');
 await page.locator('[data-edit-widget="payment-summary"] [data-widget-move="-1"]').click();await shot(page,info,'settings-reordered');
 const plan=await page.locator('[data-preview-widget]').evaluateAll(ns=>ns.map(n=>({id:n.dataset.previewWidget,span:n.style.getPropertyValue('--widget-span')})));
 await page.locator('[data-dashboard-save]').click();await expect(page.locator('.command-settings')).toBeHidden();
 expect(await page.locator('[data-dashboard-grid]>.dashboard-card').evaluateAll(ns=>ns.map(n=>({id:n.dataset.widget,span:n.style.getPropertyValue('--widget-span')})))).toEqual(plan);
 await aligned(page);await noOverflow(page);expect(c.writes).toHaveLength(1);expect(c.observations.pageErrors).toEqual([]);c.r.db.close();
});

for(const width of [1600,390])test(`RESPONSIVE Member overview sections and private nested image ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:width===390?844:900});const c=await commandFixture(page);
 c.r.db.exec("UPDATE members SET nickname='Modrý cestovatel',name='Testovací člen',email='dlouhy.testovaci.kontakt.pro.regresni.overeni@example.invalid',phone=NULL WHERE id='m'; DELETE FROM reservations WHERE id='pending'");
 await page.goto('/admin.html?section=community&view=members&event=e');await expect(page.locator('[data-member-list]')).toContainText('Modrý cestovatel');
 const link=page.locator('[data-member-list] [data-member-open="m"]');await link.click();await expect(modal(page).locator('[data-member-overview]')).toBeVisible();await expect(modal(page)).toContainText('320i');await expect(modal(page)).toContainText('Neuveden');
 await expect(modal(page).locator('[data-member-identity] img')).toHaveCount(0);expect(c.calls.filter(q=>/\/members\/m\/(garage|photos|reservations|history|points|mailing|qr|overview)/.test(q))).toEqual([]);
 await shot(page,info,'member-overview-'+width);await noOverflow(page);
 expect(await modal(page).locator('[data-member-panel]').evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
 if(width===390){await expect(page.locator('[data-member-section-select]')).toHaveAccessibleName('Sekce člena');await expect(page.locator('[data-member-section-select]')).toHaveCSS('appearance','none');const card=await modal(page).locator('[data-member-overview]>.admin-member-card').first().boundingBox();expect(card.x+card.width).toBeLessThanOrEqual(width-13);}
 await modal(page).locator('[data-member-close]').focus();await page.keyboard.press('Shift+Tab');await expect(modal(page).locator('[data-member-section="qr"]')).toBeFocused();await page.keyboard.press('Tab');await expect(modal(page).locator('[data-member-close]')).toBeFocused();
 const top=await page.evaluate(()=>scrollY);await page.mouse.move(3,3);await page.mouse.wheel(0,800);expect(await page.evaluate(()=>scrollY)).toBe(top);
 if(width===390){await expect(page.locator('[data-member-section-select]')).toBeVisible();await page.locator('[data-member-section-select]').focus();await shot(page,info,'member-mobile-section-picker');}
 else{const tabs=modal(page).locator('[role=tablist]');await tabs.locator('[data-member-tab="overview"]').focus();const calls=c.calls.length;await page.keyboard.press('ArrowDown');await expect(tabs.locator('[data-member-tab="event"]')).toBeFocused();expect(c.calls.length).toBe(calls);await expect(tabs.locator('[data-member-tab="overview"]')).toHaveAttribute('aria-selected','true');await page.keyboard.press('Enter');await expect(page).toHaveURL(/tab=event/);await page.reload();await expect(modal(page).locator('[data-member-event]')).toBeVisible();}
 await select(page,'garage');await expect(modal(page)).toContainText('BMW 328i');const image=modal(page).locator('[data-member-media]').first();await expect(image).toHaveAttribute('src',/^blob:/);await expect.poll(()=>image.evaluate(n=>n.complete&&n.naturalWidth>0)).toBe(true);await shot(page,info,'member-garage-'+width);
 await modal(page).locator('[data-member-image]').first().click();await expect(page.locator('[data-member-image-dialog]')).toBeVisible();await page.keyboard.press('Tab');await expect(page.locator('[data-member-image-close]')).toBeFocused();await page.keyboard.press('Escape');await expect(page.locator('[data-member-image-dialog]')).toBeHidden();await expect(modal(page)).toBeVisible();
 await select(page,'club');await expect(modal(page)).toContainText('S&S TOP 3');await shot(page,info,'member-club-'+width);
 await select(page,'qr');await expect(modal(page)).toContainText('Členské QR zatím nebylo vydáno');expect(c.r.db.prepare('SELECT COUNT(*) n FROM member_qr_identities').get().n).toBe(0);
 await select(page,'overview');await page.reload();await expect(modal(page).locator('[data-member-overview]')).toBeVisible();await modal(page).locator('[data-member-close]').click();await expect(modal(page)).toBeHidden();
 await page.locator('[data-member-list] [data-member-open="n"]').click();await expect(modal(page)).toContainText('Na tento ročník zatím nemá rezervaci.');await expect(modal(page)).toContainText('Bez rezervace nejsou');await expect(modal(page)).not.toContainText('dlouhy.testovaci');await shot(page,info,'member-without-reservation-'+width);
 clean(c);c.r.db.close();
});

test('RESPONSIVE overview partial Club failure and header failure are not empty or foreign data',async({page},info)=>{
 const c=await commandFixture(page);c.response=({request,response})=>request.url().includes('/members/m/club?')?new Response('{"message":"Synthetic Club unavailable"}',{status:503}):response;
 await page.goto('/admin.html?section=community&view=members&event=e&member=m');await expect(modal(page)).toContainText('United Club se nepodařilo načíst.');await expect(modal(page)).toContainText('EU-MEMBER');await expect(modal(page)).toContainText('Evidovaně uhrazeno');await expect(modal(page)).not.toContainText('Na tento ročník zatím nemá rezervaci.');await shot(page,info,'member-club-unavailable');
 await modal(page).locator('[data-member-close]').click();c.response=({request,response})=>new URL(request.url()).pathname==='/api/admin/members/n'?new Response('{"message":"Synthetic header unavailable"}',{status:503}):response;
 await page.locator('[data-member-list] [data-member-open="n"]').click();await expect(modal(page)).toContainText('Rezervaci se nepodařilo načíst.');await expect(modal(page)).not.toContainText('Na tento ročník zatím nemá rezervaci.');await expect(modal(page)).not.toContainText('EU-MEMBER');clean(c);c.r.db.close();
});

test('FINISH Member 360 keeps compact history cards and routes photo status to existing moderation',async({page},info)=>{
 await page.setViewportSize({width:1600,height:900});const c=await commandFixture(page);
 const mediaPath='/api/admin/members/m/media/photos/g';
 c.response=({request,response})=>{
  const path=new URL(request.url()).pathname;
  if(path==='/api/admin/members/m/history')return new Response(JSON.stringify({context:{tab:'history',memberId:'m'},items:[
   {eventId:'e-2026',year:2026,attendanceStatus:'approved',snsStatus:'pending',attendanceNote:'Účast ověřena',snsNote:'Výsledek čeká',category:'Coupé',photos:[{mediaPath,version:'1'}]},
   {eventId:'e-2025',year:2025,attendanceStatus:'approved',snsStatus:'approved',attendanceNote:'Ověřeno',snsNote:'TOP 3',category:'Sedan',placement:3,photos:[{mediaPath,version:'1'}]},
   {eventId:'e-2024',year:2024,attendanceStatus:'rejected',snsStatus:'not_claimed',attendanceNote:'Nedoloženo',snsNote:'',photos:[{mediaPath,version:'1'}]},
  ],pagination:{page:1,total:3,totalPages:1}}),{headers:{'Content-Type':'application/json'}});
  if(path==='/api/admin/members/m/photos')return new Response(JSON.stringify({context:{tab:'photos',memberId:'m'},items:[{id:'g',caption:'Synthetic',mediaPath,version:'1',status:'pending',reviewNote:''}],pagination:{page:1,total:1,totalPages:1}}),{headers:{'Content-Type':'application/json'}});
  return response;
 };
 await page.goto('/admin.html?section=community&view=members&event=e&member=m');await expect(modal(page)).toBeVisible();
 await select(page,'history');const cards=modal(page).locator('.admin-member-history-card');await expect(cards).toHaveCount(3);
 const cardBoxes=await cards.evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect()));expect(Math.max(...cardBoxes.map(box=>box.y))-Math.min(...cardBoxes.map(box=>box.y))).toBeLessThanOrEqual(1);expect(cardBoxes[0].width).toBeLessThan((await modal(page).locator('[data-member-tab-content]').boundingBox()).width*.4);
 await expect(cards.first()).toContainText('Účast');await expect(cards.first()).toContainText('S&S');await expect(cards.first().locator('[data-member-media]')).toHaveAttribute('src',/^blob:/);await cards.first().locator('[data-member-image]').click();await expect(page.locator('[data-member-image-dialog]')).toBeVisible();await page.locator('[data-member-image-close]').click();
 await shot(page,info,'member-history-three-compact');
 const historyGrid=modal(page).locator('.admin-member-section-grid--history');await page.setViewportSize({width:1000,height:800});expect(await historyGrid.evaluate(node=>getComputedStyle(node).gridTemplateColumns.split(' ').length)).toBe(2);await page.setViewportSize({width:390,height:844});expect(await historyGrid.evaluate(node=>getComputedStyle(node).gridTemplateColumns.split(' ').length)).toBe(1);await page.setViewportSize({width:1600,height:900});
 await select(page,'garage');await expect(modal(page)).not.toContainText('Otevřít fotografii');
 await select(page,'reservations');await expect(modal(page)).not.toContainText('Zdroj: uložená rezervace');await expect(modal(page).getByRole('button',{name:'Otevřít detail rezervace'})).toBeVisible();
 await select(page,'photos');const status=modal(page).locator('[data-member-photo-moderation]');await expect(status).toHaveText(/Čeká na schválení/);await expect(modal(page).locator('.admin-member-review-note')).toHaveCount(0);await status.click();
 await expect(page.locator('[data-admin-panel="gallery"]')).toBeVisible();await expect(page.locator('[data-gallery-filter="pending"]')).toHaveAttribute('aria-selected','true');await expect(page.locator('[data-member-queue-notice]')).toBeVisible();expect(c.writes).toEqual([]);clean(c);c.r.db.close();
});

test('RESPONSIVE overview has only shared summary header and one coalesced Club read with existing cadence',async({page})=>{
 await page.clock.install();const c=await commandFixture(page);await page.goto('/admin.html?event=e');await ready(page);await expect(page.locator('[data-admin-freshness]')).toHaveAttribute('data-state','fresh');c.calls.length=0;
 await page.locator('[data-widget="recent"] [data-member-open="m"]').click();await expect(modal(page)).toContainText('320i');await expect(page.locator('[data-member-freshness]')).not.toContainText('nedostupné');
 expect(c.calls.filter(q=>q.startsWith('GET ')&&!q.includes('/media/'))).toEqual(['GET /api/admin/members/m?eventId=e','GET /api/admin/members/m/club?eventId=e&page=1']);
 await expect(modal(page).locator('[data-member-hero-image]')).toBeVisible();expect(c.calls.filter(q=>q.includes('/media/'))).toEqual(['GET /api/admin/members/m/media/cars/c/p']);
 await select(page,'club');await expect(modal(page)).toContainText('S&S TOP 3');await select(page,'overview');await expect(modal(page).locator('[data-member-overview]')).toBeVisible();expect(c.calls.filter(q=>q.includes('/club?'))).toHaveLength(1);
 for(let i=0;i<5;i++){const before=c.calls.length;await page.clock.runFor(61000);await expect.poll(()=>c.calls.length).toBeGreaterThan(before);await expect(page.locator('[data-member-freshness]')).not.toContainText('nedostupné');expect(c.calls.length-before).toBeLessThanOrEqual(3);}
 expect(c.calls.filter(q=>q.includes('/club?'))).toHaveLength(2);expect(c.calls.filter(q=>q.includes('/summary?'))).toHaveLength(1);expect(c.calls.filter(q=>q.includes('/members/m?'))).toHaveLength(6);expect(c.calls.filter(q=>/\/(dashboard|reservations|members\/m\/(qr|photos|history|points|mailing|garage))\?/.test(q))).toEqual([]);
 clean(c);c.r.db.close();
});

test('RESPONSIVE Member close preserves payment draft revision focus and source scroll',async({page},info)=>{
 await page.setViewportSize({width:1600,height:900});const c=await commandFixture(page);await page.goto('/admin.html?event=e');await ready(page);await page.locator('[data-command-reservation="r"]').click();
 const source=page.locator('[data-reservation-drawer]'),input=source.locator('[data-payment-amount]');await input.fill('1700');const revision=await source.locator('[data-reservation-drawer-content] article').getAttribute('data-base-revision');
 await source.locator('[data-member-open="m"]').click();await expect(modal(page)).toContainText('320i');await select(page,'club');await select(page,'overview');await modal(page).locator('[data-member-close]').click();await expect(modal(page)).toBeHidden();await expect(input).toHaveValue('1700');await expect(source.locator('[data-member-open="m"]')).toBeFocused();expect(await source.locator('[data-reservation-drawer-content] article').getAttribute('data-base-revision')).toBe(revision);await shot(page,info,'return-to-dirty-payment');await input.scrollIntoViewIfNeeded();await expect(input).toHaveValue('1700');await shot(page,info,'return-to-dirty-payment-amount');clean(c);c.r.db.close();
});

test('RESPONSIVE late previous Club response cannot replace the next Member overview',async({page})=>{
 const c=await commandFixture(page);let release,arrive;const held=new Promise(r=>release=r),arrived=new Promise(r=>arrive=r);
 c.response=async({request,response})=>{if(request.url().includes('/members/m/club?')){arrive();await held;}return response;};
 try{
  await page.goto('/admin.html?section=community&view=members&event=e');await page.locator('[data-member-list] [data-member-open="m"]').click();await arrived;await expect(modal(page)).toContainText('EU-MEMBER');
  await modal(page).locator('[data-member-close]').click();await page.locator('[data-member-list] [data-member-open="n"]').click();await expect(modal(page)).toContainText('EU-OTHER');await expect(modal(page)).toContainText('316i');release();
  await expect(modal(page)).not.toContainText('320i');await expect(modal(page)).not.toContainText('S&S TOP 3');await expect(modal(page)).not.toContainText('EU-MEMBER');clean(c);
 }finally{release();c.r.db.close();}
});

test('RESPONSIVE long header identity and 200 percent equivalent reflow retain controls and modal scroll',async({page},info)=>{
 await page.setViewportSize({width:1280,height:720});const c=await commandFixture(page);c.r.db.exec("UPDATE events SET title='United 2026 – velmi dlouhý testovací název vybraného ročníku srazu' WHERE id='e'");
 await page.goto('/admin.html?event=e');await ready(page);await page.locator('[data-admin-account]').evaluate(n=>n.textContent='velmi.dlouhy.testovaci.administratorsky.kontakt@example.invalid');
 await page.locator('[data-event-select] option:checked').evaluate(n=>n.textContent='United 2026 – velmi dlouhý testovací název vybraného ročníku srazu');
 await noOverflow(page);for(const selector of ['[data-member-search]','.admin-header [data-logout]','.admin-header [data-refresh]']){const b=await page.locator(selector).boundingBox();expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(1280);}
 await shot(page,info,'long-admin-header');
 await page.setViewportSize({width:800,height:450});await page.locator('[data-widget="recent"] [data-member-open="m"]').click();await expect(modal(page)).toContainText('320i');await expect(modal(page).locator('[data-member-close]')).toBeVisible();
 const panel=modal(page).locator('[data-member-panel]');expect(await panel.evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);await panel.evaluate(n=>n.scrollTop=n.scrollHeight);await expect(modal(page).locator('[data-member-close]')).toBeVisible();await shot(page,info,'member-reflow-200-equivalent');clean(c);c.r.db.close();
});

test('RESPONSIVE existing read-only sections keep pagination independent history and explicit deep links',async({page},info)=>{
 const c=await commandFixture(page);
 for(let i=0;i<20;i++)c.r.db.prepare("INSERT INTO united_points_ledger(id,member_id,delta,source_type,source_key,reason) VALUES(?, 'm', 1, 'fixture', ?, ?)").run('extra-'+i,'extra-'+i,'Pagination point '+i);
 c.r.db.exec("UPDATE united_history_claims SET sns_status='rejected' WHERE id='h'");
 await page.goto('/admin.html?section=community&view=members&event=e&member=m&tab=club');await expect(modal(page)).toContainText('Dostupné body');
 await modal(page).locator('[data-member-close]').click();await expect(modal(page)).toBeHidden();await page.locator('[data-member-list] [data-member-open="m"]').click();await expect(modal(page).locator('[data-member-overview]')).toBeVisible();
 await select(page,'reservations');await expect(modal(page).locator('[data-member-tab-content] [data-member-reservation="r"]')).toBeVisible();await expect(modal(page)).toContainText('Evidovaně uhrazeno');
 await select(page,'photos');await expect(modal(page)).toContainText('Synthetic');await expect(modal(page).locator('[data-member-media]').first()).toHaveAttribute('src',/^blob:/);
 // Existing router replaces the current Member tab, not one history entry per tab.
 await page.goBack();await expect(modal(page)).toBeHidden();await expect(page).not.toHaveURL(/member=/);await expect(page.locator('[data-member-list] [data-member-open="m"]')).toHaveText('First');
 await page.goForward();await expect(page).toHaveURL(/tab=photos/);await expect(modal(page)).toContainText('Synthetic');
 await select(page,'history');const states=modal(page).locator('.admin-member-history-summary');await expect(states).toContainText('Schváleno');await expect(states).toContainText('Zamítnuto');await shot(page,info,'member-history-separate-states');
 await select(page,'points');await expect(modal(page).locator('.admin-member-ledger')).toHaveCount(20);await expect(modal(page)).toContainText('Celkem 21');
 await modal(page).locator('[data-member-page="2"]').click();await expect(modal(page).locator('.admin-member-ledger')).toHaveCount(1);expect(c.calls.filter(q=>q.includes('/points?')&&q.includes('page=2'))).toHaveLength(1);
 await select(page,'mailing');await expect(modal(page)).toContainText('different@example.invalid');await expect(modal(page)).toContainText('Synthetic campaign');
 await select(page,'qr');await page.reload();await expect(page).toHaveURL(/tab=qr/);await expect(modal(page)).toContainText('Členské QR zatím nebylo vydáno');clean(c);c.r.db.close();
});

test('RESPONSIVE private photo consumers detach before one revoke and reload after rapid Back',async({page})=>{
 await spyPrivateMediaLifecycle(page);const c=await commandFixture(page);
 await page.goto('/admin.html?section=community&view=members&event=e');await expect(page.locator('[data-member-list] [data-member-open="m"]')).toBeVisible();await page.locator('[data-member-list] [data-member-open="m"]').click();await select(page,'photos');await expect(modal(page)).toContainText('Synthetic');
 const photo=modal(page).locator('[data-member-media]').first();await expect(photo).toHaveAttribute('src',/^blob:/);const url=await photo.getAttribute('src');
 await modal(page).locator('[data-member-image]').first().click();await expect(page.locator('[data-member-image-dialog]')).toBeVisible();await expect(page.locator('[data-member-full-image]')).toHaveAttribute('src',url);
 await page.evaluate(value=>window.privateMediaLifecycle.watch(value,[...document.querySelectorAll('[data-member-media],[data-member-full-image]')].filter(node=>node.src===value)),url);
 await page.goBack();await expect(modal(page)).toBeHidden();
 expect(await page.evaluate(value=>window.privateMediaLifecycle.revoked.filter(item=>item.url===value),url)).toEqual([{url,connected:[false,false]}]);
 await page.goForward();await expect(modal(page)).toContainText('Synthetic');const returned=modal(page).locator('[data-member-media]').first();await expect(returned).toHaveAttribute('src',/^blob:/);await expect.poll(()=>returned.evaluate(node=>node.complete&&node.naturalWidth>0)).toBe(true);const returnedUrl=await returned.getAttribute('src');
 await modal(page).locator('[data-member-image]').first().click();await expect(page.locator('[data-member-image-dialog]')).toBeVisible();await page.evaluate(value=>window.privateMediaLifecycle.watch(value,[...document.querySelectorAll('[data-member-media],[data-member-full-image]')].filter(node=>node.src===value)),returnedUrl);
 await page.locator('[data-member-image-close]').click();await modal(page).locator('[data-member-close]').click();await expect(modal(page)).toBeHidden();await page.evaluate(()=>window.dispatchEvent(new CustomEvent('admin:accesslost')));
 expect(await page.evaluate(value=>window.privateMediaLifecycle.revoked.filter(item=>item.url===value),returnedUrl)).toEqual([{url:returnedUrl,connected:[false,false]}]);expect(await page.evaluate(value=>window.privateMediaLifecycle.revoked.filter(item=>item.url===value).length,url)).toBe(1);clean(c);c.r.db.close();
});

test('RESPONSIVE late private photo response after close cannot assign an object URL',async({page})=>{
 await spyPrivateMediaLifecycle(page,{holdPhoto:true});const c=await commandFixture(page);
 await page.goto('/admin.html?section=community&view=members&event=e');await expect(page.locator('[data-member-list] [data-member-open="m"]')).toBeVisible();await page.locator('[data-member-list] [data-member-open="m"]').click();await select(page,'photos');await page.waitForFunction(()=>window.privateMediaLifecycle.barrier.arrived);
 const before=await page.evaluate(()=>window.privateMediaLifecycle.created.length);await page.goBack();await expect(modal(page)).toBeHidden();
 await page.evaluate(()=>window.privateMediaLifecycle.barrier.release());await page.waitForFunction(()=>window.privateMediaLifecycle.barrier.returned);
 await expect.poll(()=>page.evaluate(()=>window.privateMediaLifecycle.created.length)).toBe(before);await expect(modal(page).locator('[data-member-media][src]')).toHaveCount(0);
 await page.goForward();await expect(modal(page)).toContainText('Synthetic');const returned=modal(page).locator('[data-member-media]').first();await expect(returned).toHaveAttribute('src',/^blob:/);await expect.poll(()=>returned.evaluate(node=>node.complete&&node.naturalWidth>0)).toBe(true);await modal(page).locator('[data-member-close]').click();clean(c);c.r.db.close();
});
