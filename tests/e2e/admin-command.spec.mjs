import {test,expect} from '@playwright/test';
import {commandFixture} from './command-fixture.mjs';
for(const width of [1440,1280,390])test('NEW dashboard real layout, draft preview and responsive shell '+width,async({page},info)=>{
  await page.setViewportSize({width,height:width===390?844:900});const c=await commandFixture(page);
  await page.goto('/admin.html?section=dashboard&event=e');
  await expect(page.locator('[data-widget="approvals"]')).toBeVisible();
  await expect(page.locator('[data-kpi-reservations]')).toHaveText('2');
  await expect(page.locator('[data-dashboard-edit]')).toBeEnabled();
  await page.screenshot({path:info.outputPath('NEW-dashboard-'+width+'.png'),fullPage:true});
  await page.screenshot({path:info.outputPath('NEW-dashboard-viewport-'+width+'.png')});
  await page.locator('[data-dashboard-edit]').click();
  await expect(page.locator('.command-settings')).toBeVisible();
  await expect(page.locator('[data-preview-widget]')).toHaveCount(5);
  await page.screenshot({path:info.outputPath('NEW-settings-'+width+'.png')});
  expect(c.observations.pageErrors).toEqual([]);expect(c.observations.unhandledApi).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  expect(c.writes).toEqual([]);expect(c.r.writes).toBe(0);c.r.db.close();
});

test('NEW empty-data dashboard is truthful and history evidence stays in its private review context',async({page},info)=>{
 await page.setViewportSize({width:1440,height:900});const c=await commandFixture(page);c.r.db.exec("DELETE FROM reservations; UPDATE united_history_claims SET attendance_status='pending',sns_status='pending'");
 await page.route('https://api.e36united.cz/api/admin/history/evidence/**',async route=>{
   // Synthetic image only; the Node suite separately asserts the real protected evidence handler.
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization'}});
   c.calls.push('GET '+new URL(route.request().url()).pathname);
   return route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#123d59"/><text x="80" y="250" fill="white" font-size="38">TESTOVACÍ SOUKROMÝ DŮKAZ</text></svg>'});
 });
 await open(page);await expect(page.locator('[data-kpi-reservations]')).toHaveText('0');await expect(page.locator('[data-widget="recent"]')).toContainText('Žádné uložené rezervace');await expect(page.locator('[data-command-clear]')).not.toContainText('Vše vyřízeno');await page.screenshot({path:info.outputPath('NEW-empty-data.png'),fullPage:true});
 await page.locator('[data-widget="approvals"] [data-dashboard-destination="history"]').click();const card=page.locator('[data-history-id="h"]');await card.locator('summary').click();await expect(card.locator('[data-history-evidence-media]')).toHaveAttribute('src',/^blob:/);
 await expect(card.locator('[data-history-review="attendance"]')).toBeVisible();await expect(card.locator('[data-history-review="sns"]')).toBeVisible();await page.screenshot({path:info.outputPath('NEW-history-review.png'),fullPage:true});
 await card.locator('[data-history-evidence="hp"]').click();await expect(page.locator('[data-history-evidence-lightbox]')).toBeVisible();await page.screenshot({path:info.outputPath('NEW-history-evidence.png')});
 expect(c.calls.some(p=>p.includes('/api/gallery'))).toBe(false);expect(c.writes).toEqual([]);expect(c.r.writes).toBe(0);clean(c);c.r.db.close();
});

const open=async page=>{await page.goto('/admin.html?section=dashboard&event=e');await expect(page.locator('[data-dashboard-edit]')).toBeEnabled();};
test('NEW separate history decisions converge badges without clearing the other unresolved component',async({page})=>{
 const c=await commandFixture(page);c.r.db.exec("UPDATE united_history_claims SET attendance_status='pending',sns_status='pending'");await open(page);
 await page.locator('[data-widget="approvals"] [data-dashboard-destination="history"]').click();const card=page.locator('[data-history-id="h"]');
 const badge=page.locator('.admin-section-nav [data-command-badge="history"]');await expect(badge).toHaveText('1');
 for(const component of ['attendance','sns']){
  if(!await card.evaluate(n=>n.open))await card.locator('summary').click();
  const review=card.locator('[data-history-review="'+component+'"]');await review.locator('textarea').fill('Syntetické testovací rozhodnutí');
  const before=c.calls.filter(p=>p.includes('/summary')).length;await review.locator('[data-history-action="rejected"]').click();
  await expect.poll(()=>c.r.db.prepare('SELECT '+component+'_status s FROM united_history_claims WHERE id=\'h\'').get().s).toBe('rejected');
  await expect.poll(()=>c.calls.filter(p=>p.includes('/summary')).length).toBe(before+1);
  await expect(page.locator('[data-admin-freshness]')).toHaveAttribute('data-state','fresh');
  if(component==='attendance'){await expect(badge).toHaveText('1');expect(c.r.db.prepare("SELECT sns_status s FROM united_history_claims WHERE id='h'").get().s).toBe('pending');}
 }
 await expect(badge).toBeHidden();expect(c.writes.map(w=>w.component)).toEqual(['attendance','sns']);expect(c.writes[1].revision).not.toBe(c.writes[0].revision);clean(c);c.r.db.close();
});
function clean(c){expect(c.observations.pageErrors).toEqual([]);expect(c.observations.unhandledApi).toEqual([]);expect(c.observations.consoleErrors.filter(e=>!c.failures.has(e.url)||!/Failed to load resource|Fetch API cannot load|net::ERR/.test(e.text))).toEqual([]);}
test('NEW six destinations, Community disclosure, legacy aliases and canonical Club tab',async({page},info)=>{
 const c=await commandFixture(page);await open(page);const rail=page.locator('.admin-section-nav');
 await expect(rail.locator(':scope > button')).toHaveCount(6);const before=page.url();await rail.locator('[data-community-toggle]').click();expect(page.url()).toBe(before);
 await expect(rail.locator('[data-community-links] button')).toHaveCount(4);await page.screenshot({path:info.outputPath('NEW-community.png')});
 await rail.locator('[data-admin-jump="united-club"]').click();await expect(page).toHaveURL(/view=united-club/);await expect(page.locator('[data-admin-panel="members"] h2')).toHaveText('United Club · členové');
 await page.locator('[data-member-list] [data-member-open="m"]').click();await expect(page.locator('[data-member-tab="club"]')).toHaveAttribute('aria-selected','true');await expect(page.locator('[data-member-tab-content]')).toContainText('Points');
 await page.goBack();await expect(page.locator('[data-member-dialog]')).not.toBeVisible();
 await page.goto('/admin.html?section=finance&view=accommodation&event=e');await expect(page.locator('[data-admin-panel="accommodation"]')).toBeVisible();
 await page.goto('/admin.html?section=club&event=e');await expect(page.locator('[data-gallery-history]')).toBeVisible();
 await expect(page.locator('[data-admin-freshness]')).toHaveAttribute('data-state','fresh');
 await page.setViewportSize({width:390,height:844});await page.locator('[data-portal-menu-open]').click();
 expect(await page.locator('.portal-nav-sheet-list button span').first().evaluate(n=>parseFloat(getComputedStyle(n).fontSize))).toBeGreaterThanOrEqual(14);
 await page.screenshot({path:info.outputPath('NEW-mobile-navigation.png')});
 expect(c.writes).toEqual([]);expect(c.r.writes).toBe(0);clean(c);c.r.db.close();
});
test('NEW draft miniature, cancel/focus trap, all-hidden save/reload and independent onsite',async({page},info)=>{
 const c=await commandFixture(page);await open(page);await page.locator('[data-dashboard-edit]').click();
 await page.locator('[data-widget-toggle="approvals"]').uncheck();await expect(page.locator('[data-preview-widget="approvals"]')).toHaveCount(0);await expect(page.locator('[data-widget="approvals"]')).toHaveCount(1);
 await page.locator('[data-dashboard-close]').focus();await page.keyboard.press('Shift+Tab');expect(await page.evaluate(()=>document.activeElement.closest('dialog')?.open)).toBe(true);
 page.once('dialog',d=>d.dismiss());await page.keyboard.press('Escape');await expect(page.locator('.command-settings')).toBeVisible();
 page.once('dialog',d=>d.accept());await page.locator('[data-dashboard-cancel]').click();await expect(page.locator('[data-dashboard-edit]')).toBeFocused();expect(c.writes).toEqual([]);
 await page.locator('[data-dashboard-edit]').click();for(const id of ['approvals','reservation-summary','payment-summary','trend','recent'])await page.locator('[data-widget-toggle="'+id+'"]').uncheck();
 await expect(page.locator('[data-preview-widget]')).toHaveCount(0);await page.locator('[data-dashboard-save]').click();await expect(page.locator('.command-settings')).not.toBeVisible();expect(c.writes).toHaveLength(1);
 await page.reload();await expect(page.locator('[data-command-empty]')).toBeVisible();await expect(page.locator('[data-widget]')).toHaveCount(0);await expect(page.locator('.admin-section-nav [data-command-badge="reservations"]')).toHaveText('1');await page.screenshot({path:info.outputPath('NEW-empty.png')});
 await page.locator('[data-dashboard-composition]').selectOption('onsite');await expect(page.locator('[data-widget]')).toHaveCount(5);await page.screenshot({path:info.outputPath('NEW-onsite.png'),fullPage:true});
 await page.locator('[data-dashboard-edit]').click();await page.locator('[data-widget-toggle="trend"]').uncheck();
 const prospective=await page.locator('[data-preview-widget]').evaluateAll(ns=>ns.map(n=>[n.dataset.previewWidget,n.style.getPropertyValue('--widget-span')]));
 await page.locator('[data-dashboard-save]').click();await expect(page.locator('.command-settings')).not.toBeVisible();await page.reload();await expect(page.locator('[data-widget]')).toHaveCount(4);
 expect(await page.locator('[data-widget]').evaluateAll(ns=>ns.map(n=>[n.dataset.widget,n.style.getPropertyValue('--widget-span')]))).toEqual(prospective);
 await page.screenshot({path:info.outputPath('NEW-saved-reloaded.png'),fullPage:true});clean(c);c.r.db.close();
});
test('NEW partial summary never clears badges, preferences or previously rendered data',async({page},info)=>{
 const c=await commandFixture(page);await open(page);const badge=page.locator('.admin-section-nav [data-command-badge="dashboard"]');await expect(badge).toHaveText('2');
 c.mode='summary-unavailable';await page.locator('[data-refresh]').click();await expect(badge).toHaveAttribute('data-stale','true');await expect(badge).toHaveText('2');await expect(page.locator('[data-command-clear]')).toContainText('Nelze potvrdit');await page.screenshot({path:info.outputPath('NEW-partial.png')});
 c.mode='';await page.locator('[data-refresh]').click();await expect(badge).toHaveAttribute('data-stale','false');expect(c.writes).toEqual([]);clean(c);c.r.db.close();
});
test('NEW latest reservation opens the canonical selected-car detail and reads QR without provisioning',async({page},info)=>{
 await page.setViewportSize({width:1440,height:900});
 const c=await commandFixture(page);c.r.db.exec("UPDATE reservations SET car_id='c2',car_model='BMW 325i · vybraný vůz' WHERE id='r'; INSERT INTO car_photos(id,car_id,r2_key) VALUES('selected','c2','synthetic/selected')");
 await open(page);await page.locator('[data-command-reservation="r"]').click();const drawer=page.locator('[data-reservation-drawer]');
 await expect(drawer).toBeVisible();await expect(drawer.locator('.command-qr')).toHaveText('Členské QR: Nevydáno');
 const photo=drawer.locator('[data-reservation-car-photo]');await photo.scrollIntoViewIfNeeded();await expect.poll(()=>photo.evaluate(n=>n.complete&&n.naturalWidth>0)).toBe(true);
 expect(c.calls.some(p=>p.endsWith('/media/cars/c2/selected'))).toBe(true);expect(c.calls.some(p=>p.endsWith('/media/cars/c/p'))).toBe(false);
 await drawer.evaluate(n=>n.querySelector('.admin-reservation-drawer-panel').scrollTo(0,0));await page.screenshot({path:info.outputPath('NEW-reservation.png')});
 await drawer.locator('[data-member-qr-open]').click();await expect(page.locator('[data-member-tab="qr"]')).toHaveAttribute('aria-selected','true');await expect(page.locator('[data-member-tab-content]')).toContainText('Tento pohled ji nevytváří');
 await page.goBack();await expect(drawer).toBeVisible();await page.keyboard.press('Escape');await expect(drawer).toBeHidden();await expect(page).not.toHaveURL(/reservation=/);
 expect(c.r.db.prepare('SELECT COUNT(*) n FROM member_qr_identities').get().n).toBe(0);expect(c.writes).toEqual([]);expect(c.r.writes).toBe(0);clean(c);c.r.db.close();
});
test('NEW shared summary stays due over Member, with at most three periodic resources and idle hidden/offline',async({page})=>{
 await page.clock.install();const c=await commandFixture(page);await open(page);await page.locator('[data-widget="recent"] [data-member-open="m"]').click();await page.locator('[data-member-tab="garage"]').click();await expect(page.locator('[data-member-tab-content]')).toContainText('BMW');
 await expect(page.locator('[data-member-freshness]')).toContainText('Sekce: načteno');
 // Complete the explicit visible media read before advancing 61s of synthetic time;
 // otherwise the unchanged 20s API timeout can race its still-delivering response.
 const image=page.locator('[data-member-media]').first();await image.scrollIntoViewIfNeeded();
 await expect.poll(()=>image.evaluate(n=>n.complete&&n.naturalWidth>0)).toBe(true);
 expect(c.calls.filter(p=>p.includes('/media/'))).toHaveLength(1);const start=c.calls.length;
 for(let i=0;i<5;i++){const before=c.calls.length;await page.clock.runFor(61000);await expect.poll(()=>c.calls.length).toBeGreaterThan(before);await expect(page.locator('[data-admin-freshness]')).toHaveAttribute('data-state','fresh');}
 await expect.poll(()=>c.calls.slice(start).filter(p=>p.includes('/summary')).length).toBe(1);
 expect(c.calls.slice(start).filter(p=>/\/dashboard|\/reservations\?/.test(p))).toHaveLength(0);
 expect(c.calls.slice(start).filter(p=>!p.includes('/media/')).length).toBeLessThanOrEqual(11); // 5 header + 5 active Garage + 1 shared summary.
 expect(c.calls.filter(p=>p.includes('/media/'))).toHaveLength(1); // Explicit visible image is never polled.
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});const stop=c.calls.length;await page.clock.runFor(600000);expect(c.calls.length).toBe(stop);expect(c.writes).toEqual([]);clean(c);c.r.db.close();
});
