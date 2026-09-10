import {test,expect} from '@playwright/test';
import {commandFixture} from './command-fixture.mjs';
const clean=c=>{expect(c.observations.consoleErrors).toEqual([]);expect(c.observations.pageErrors).toEqual([]);expect(c.observations.unhandledApi).toEqual([])};
async function fixture(page){
 const c=await commandFixture(page);
 c.r.db.exec("UPDATE members SET name='Alexandr Dlouhý Příjmení Člena',nickname='Dlouhá přezdívka United',email='dlouhy.clen.s.velmi.dlouhou.adresou@example.invalid' WHERE id='m'; UPDATE gallery_submissions SET status='pending'; UPDATE united_history_claims SET attendance_status='pending',sns_status='pending'; INSERT INTO united_history_claims(id,member_id,event_id,attendance_status,sns_status) VALUES('second','n','old','pending','not_claimed');");
 return c;
}
for(const width of [390,1600])test('COMPACT members, pending priority and history cards '+width,async({page},info)=>{
 await page.setViewportSize({width,height:1000});const c=await fixture(page);
 await page.goto('/admin.html?section=members&event=e');const member=page.locator('.compact-member-card').filter({has:page.locator('[data-member-open="m"]')});
 await expect(member).toContainText('United: 0×');await expect(member.locator('[data-member-pending]')).toHaveText('Čeká: 3 →');
 await expect(member.locator('[data-card-media]')).toHaveJSProperty('complete',true);await expect.poll(()=>member.locator('[data-card-media]').evaluate(n=>n.naturalWidth)).toBeGreaterThan(0);
 expect(c.calls.filter(q=>/GET \/api\/admin\/members\/[^/]+(\?|\/(garage|history|club))/.test(q))).toEqual([]);
 expect(c.calls.filter(q=>q.includes('/members?'))).toHaveLength(1);
 await expect(page.locator('[data-member-open="a"]').locator('..').locator('..').locator('[data-card-media]')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('members-'+width+'.png'),fullPage:true});
 await member.locator('[data-member-pending]').click();await expect(page).toHaveURL(/queueMember=m/);await expect(page.locator('[data-history-id]')).toHaveCount(1);await expect(page.locator('[data-history-id]')).toContainText('UNITED 2025');
 expect(c.calls.some(q=>q.includes('/history/claims?')&&q.includes('year=all')&&q.includes('queueMember=m'))).toBe(true);
 await page.locator('[data-history-id] summary').click();await expect(page.locator('[data-history-review="attendance"]')).toBeVisible();await page.screenshot({path:info.outputPath('history-expanded-'+width+'.png'),fullPage:true});
 await page.locator('[data-history-review="attendance"] [data-history-action="approved"]').click();await expect.poll(()=>c.writes.length).toBe(1);
 await expect(page.locator('[data-history-review="attendance"]')).toContainText('uzamčený');
 await page.goto('/admin.html?section=members&event=e');await expect(member).toContainText('United: 1×');await expect(member.locator('[data-member-pending]')).toHaveText('Čeká: 2 →');
 const n=page.locator('.compact-member-card').filter({has:page.locator('[data-member-open="n"]')});await n.locator('[data-member-pending]').click();await expect(page).toHaveURL(/section=reservations.*queueMember=n/);await expect(page.locator('[data-reservation-list]')).toContainText('Second');
 await page.reload();await expect(page.locator('[data-reservation-list]')).toContainText('Second');await expect(page.locator('[data-reservation-list] tr[data-reservation-open]')).toHaveCount(1);
 clean(c);c.r.db.close();
});

test('COMPACT card media detaches on navigation and loads again on Back without per-card JSON',async({page})=>{
 await page.setViewportSize({width:1600,height:1000});const c=await fixture(page);
 await page.addInitScript(()=>{window.cardRevocations=[];const revoke=URL.revokeObjectURL;URL.revokeObjectURL=function(url){window.cardRevocations.push({url,connected:[...document.querySelectorAll('img[data-card-media]')].some(img=>img.src===url)});return revoke.call(this,url)}});
 await page.goto('/admin.html?section=members&event=e');const photo=page.locator('[data-member-list] [data-card-media="/api/admin/members/m/media/cars/c/p"]');await expect.poll(()=>photo.evaluate(n=>n.naturalWidth)).toBeGreaterThan(0);
 await page.locator('[data-community-links] [data-admin-jump="club"]').first().click();await expect(page.locator('[data-history-list]')).toBeVisible();await page.goBack();await expect(photo).toHaveCount(1);await expect.poll(()=>photo.evaluate(n=>n.naturalWidth)).toBeGreaterThan(0);
 const revocations=await page.evaluate(()=>window.cardRevocations);expect(revocations.length).toBeGreaterThan(0);expect(revocations.every(r=>!r.connected)).toBe(true);expect(new Set(revocations.map(r=>r.url)).size).toBe(revocations.length);
 expect(c.calls.filter(q=>/GET \/api\/admin\/members\/[^/]+(\?|\/(garage|history|club))/.test(q))).toEqual([]);clean(c);c.r.db.close();
});
test('COMPACT history expansion leaves its neighbouring card compact',async({page},info)=>{
 await page.setViewportSize({width:1600,height:1000});const c=await fixture(page);c.r.db.exec("UPDATE united_history_claims SET event_id='e' WHERE id='second'");
 await page.goto('/admin.html?section=community&view=club&event=e');await page.locator('[data-history-year]').selectOption('all');await expect(page.locator('[data-history-id]')).toHaveCount(2);
 const neighbour=page.locator('[data-history-id="second"]'),before=await neighbour.boundingBox();await page.locator('[data-history-id="h"] summary').click();await expect(page.locator('[data-history-id="h"] [data-history-review="attendance"]')).toBeVisible();const after=await neighbour.boundingBox();expect(Math.abs(after.height-before.height)).toBeLessThanOrEqual(0.5);await expect(neighbour).not.toHaveAttribute('open');
 await page.screenshot({path:info.outputPath('history-neighbours-1600.png'),fullPage:true});clean(c);c.r.db.close();
});
test('COMPACT mobile menu closes through all controls and legacy Club opens Members',async({page})=>{
 await page.setViewportSize({width:390,height:844});const c=await fixture(page);await page.goto('/admin.html?section=community&view=united-club&event=e');await expect(page.locator('[data-member-list]')).toBeVisible();
 await expect(page.locator('[data-admin-jump="united-club"]')).toHaveCount(0);
 const menu=page.locator('[data-portal-menu-open]'),sheet=page.locator('[data-portal-sheet]');
 await page.locator('[data-portal-tablist] [data-community-toggle]').click();await expect(sheet).toBeVisible();await expect(sheet.locator('[data-admin-jump="members"]')).toBeVisible();await page.keyboard.press('Escape');await expect(sheet).toBeHidden();
 for(const method of ['toggle','close','backdrop']){await menu.click();await expect(sheet).toBeVisible();if(method==='toggle')await menu.click();else if(method==='close')await sheet.locator('.portal-nav-sheet-head button').click();else await sheet.locator('[data-portal-sheet-close]').first().click({position:{x:5,y:5}});await expect(sheet).toBeHidden();await expect(menu).toBeFocused();expect(await page.locator('body').evaluate(n=>n.classList.contains('portal-sheet-open'))).toBe(false);}
 clean(c);c.r.db.close();
});
for(const width of [390,1600])test('COMPACT accommodation, photo actions and populated reservation '+width,async({page},info)=>{
 await page.setViewportSize({width,height:1000});const c=await fixture(page);await page.goto('/admin.html?section=reservations&view=accommodation&event=e');
 await expect(page.locator('[data-accommodation-preview]').first()).toBeVisible();expect((await page.locator('.admin-accommodation-visual').first().boundingBox()).height).toBeLessThanOrEqual(112);
 await page.screenshot({path:info.outputPath('accommodation-'+width+'.png'),fullPage:true});await page.locator('[data-accommodation-preview]').first().click();await expect(page.locator('.admin-accommodation-image-dialog')).toBeVisible();await page.keyboard.press('Escape');
 await page.goto('/admin.html?section=community&view=gallery&event=e');await expect(page.locator('[data-gallery-id]')).toBeVisible();
 const card=await page.locator('[data-gallery-id]').boundingBox(),button=await page.locator('[data-gallery-id] [data-gallery-action="rejected"]').boundingBox();expect(button.x+button.width).toBeLessThanOrEqual(card.x+card.width);await page.screenshot({path:info.outputPath('photos-'+width+'.png'),fullPage:true});
 await page.goto('/admin.html?section=reservations&event=e&reservation=r');await expect(page.locator('[data-payment-amount]')).toBeVisible();await page.locator('[data-payment-amount]').fill('333');await page.screenshot({path:info.outputPath('reservation-'+width+'.png'),fullPage:true});
 await page.locator('[data-reservation-drawer] [data-member-open]').click();await expect(page.locator('[data-member-dialog]')).toBeVisible();await page.locator('[data-member-close]').click();await expect(page.locator('[data-member-dialog]')).toBeHidden();await expect(page.locator('[data-payment-amount]')).toHaveValue('333');expect(c.writes).toEqual([]);clean(c);c.r.db.close();
});
