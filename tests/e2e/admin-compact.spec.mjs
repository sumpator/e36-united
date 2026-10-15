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
 await expect(member.locator('.compact-member-identity>.admin-member-link')).toHaveText('Dlouhá přezdívka United');await expect(member.locator('.compact-member-identity>p')).toHaveText('Alexandr Dlouhý Příjmení Člena');
 expect(await member.evaluate(card=>[...card.children].map(node=>node.className))).toEqual(['compact-member-identity','compact-member-photo','compact-member-data']);
 await expect(member).toContainText('United: 0×');await expect(member.locator('[data-member-pending]')).toHaveText('Ke kontrole: 3 →');
 await member.locator('[data-card-media]').scrollIntoViewIfNeeded();await expect(member.locator('[data-card-media]')).toHaveJSProperty('complete',true);await expect.poll(()=>member.locator('[data-card-media]').evaluate(n=>n.naturalWidth)).toBeGreaterThan(0);
 expect(Math.abs((await member.locator('.compact-member-photo').boundingBox()).height-76)).toBeLessThanOrEqual(.5);
 const geometry=await page.locator('[data-member-list]>.compact-member-card').evaluateAll(cards=>cards.map(card=>({height:card.getBoundingClientRect().height,contained:[...card.children].every(child=>{const c=child.getBoundingClientRect(),p=card.getBoundingClientRect();return c.bottom<=p.bottom&&c.right<=p.right&&c.left>=p.left})})));expect(geometry.every(card=>card.contained)).toBe(true);if(width>700)expect(Math.max(...geometry.map(card=>card.height))-Math.min(...geometry.map(card=>card.height))).toBeLessThanOrEqual(.5);
 const memberBox=await member.boundingBox(),pendingBox=await member.locator('[data-member-pending]').boundingBox();expect(pendingBox.y+pendingBox.height).toBeLessThanOrEqual(memberBox.y+memberBox.height);
 expect(await page.locator('[data-member-list]').evaluate(node=>getComputedStyle(node).gridTemplateColumns.split(' ').length)).toBe(width===390?1:4);
 expect(c.calls.filter(q=>/GET \/api\/admin\/members\/[^/]+(\?|\/(garage|history|club))/.test(q))).toEqual([]);
 expect(c.calls.filter(q=>q.includes('/members?'))).toHaveLength(1);
 await expect(page.locator('[data-member-open="a"]').locator('..').locator('..').locator('[data-card-media]')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('members-'+width+'.png'),fullPage:true});
 const cardHeight=(await member.boundingBox()).height,callsBeforeMode=c.calls.filter(q=>q.includes('/members?')).length;
 await page.locator('[data-member-list-mode="rows"]').click();await expect(page.locator('[data-member-list]')).toHaveAttribute('data-member-view','rows');await expect(page.locator('[data-member-list-mode="rows"]')).toHaveAttribute('aria-pressed','true');
 expect(c.calls.filter(q=>q.includes('/members?'))).toHaveLength(callsBeforeMode);expect((await member.boundingBox()).height).toBeLessThan(cardHeight);expect(Math.abs((await member.locator('.compact-member-photo').boundingBox()).height-54)).toBeLessThanOrEqual(.5);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('members-rows-'+width+'.png'),fullPage:true});
 await page.reload();await expect(page.locator('[data-member-list]')).toHaveAttribute('data-member-view','rows');await expect(page.locator('[data-member-list-mode="rows"]')).toHaveAttribute('aria-pressed','true');
 await page.evaluate(()=>document.addEventListener('click',event=>{if(event.target.closest('.compact-member-data>a'))event.preventDefault()},{capture:true,once:true}));await member.locator('.compact-member-data>a').click();await expect(page.locator('[data-member-dialog]')).toBeHidden();
 await member.locator('[data-member-open]').click();await expect(page.locator('[data-member-dialog]')).toBeVisible();await page.locator('[data-member-close]').click();await expect(page.locator('[data-member-dialog]')).toBeHidden();
 await member.locator('[data-member-pending]').click();await expect(page).toHaveURL(/queueMember=m/);await expect(page.locator('[data-history-id]')).toHaveCount(1);await expect(page.locator('[data-history-id]')).toContainText('UNITED 2025');
 const historySummary=page.locator('[data-history-id] summary');await expect(historySummary.locator(':scope > div:first-child > time')).toBeVisible();await expect(historySummary.locator('.admin-history-component-statuses')).toContainText('Účast: Čeká na kontrolu');await expect(historySummary.locator('.admin-history-component-statuses')).toContainText('S&S: Čeká na kontrolu');await expect(historySummary.locator('.admin-history-component-statuses .is-pending')).toHaveCount(2);
 expect(c.calls.some(q=>q.includes('/history/claims?')&&q.includes('year=all')&&q.includes('queueMember=m'))).toBe(true);
 await page.locator('[data-history-id] summary').click();await expect(page.locator('[data-history-review="attendance"]')).toBeVisible();await page.screenshot({path:info.outputPath('history-expanded-'+width+'.png'),fullPage:true});
 await page.locator('[data-history-review="attendance"] [data-history-action="approved"]').click();await expect.poll(()=>c.writes.length).toBe(1);
 await expect(page.locator('[data-history-review="attendance"]')).toContainText('uzamčený');
 await page.goto('/admin.html?section=members&event=e');await expect(member).toContainText('United: 1×');await expect(member.locator('[data-member-pending]')).toHaveText('Ke kontrole: 2 →');
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
test('COMPACT History to Members retains a decoded blob until its source load settles',async({page})=>{
 const c=await fixture(page);await page.setViewportSize({width:390,height:1000});
 await page.addInitScript(()=>{
  window.retiredCardUrls=[];window.holdHistoryLoad=true;
  const revoke=URL.revokeObjectURL;URL.revokeObjectURL=function(url){window.retiredCardUrls.push({url,connected:[...document.images].some(img=>img.src===url)});return revoke.call(this,url)};
  let owner=HTMLImageElement.prototype;while(!Object.hasOwn(owner,'onload'))owner=Object.getPrototypeOf(owner);const onload=Object.getOwnPropertyDescriptor(owner,'onload');
  Object.defineProperty(HTMLImageElement.prototype,'onload',{configurable:true,get(){return onload.get.call(this)},set(handler){const image=this;return onload.set.call(this,typeof handler!=='function'?handler:function(event){if(window.holdHistoryLoad&&!image.isConnected&&image.src.startsWith('blob:')&&new URLSearchParams(location.search).get('view')==='club'){window.heldHistorySource={url:image.src,complete:image.complete,width:image.naturalWidth};window.releaseHistoryLoad=()=>{window.holdHistoryLoad=false;handler.call(image,event)}}else handler.call(image,event)})}});
  // Also observe a source whose implementation has no load handler yet. This
  // keeps the barrier independent of the fix and exposes premature revocation.
  const src=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');Object.defineProperty(HTMLImageElement.prototype,'src',{...src,set(value){if(!this.isConnected&&String(value).startsWith('blob:')&&!this.onload)this.onload=()=>{};return src.set.call(this,value)}});
 });
 try{
  await page.goto('/admin.html?section=community&view=club&event=e');await expect(page.locator('[data-history-id]')).toHaveCount(2);
  await page.locator('[data-history-id="h"] [data-card-media]').scrollIntoViewIfNeeded();
  await expect.poll(()=>page.evaluate(()=>Boolean(window.releaseHistoryLoad))).toBe(true);
  const source=await page.evaluate(()=>window.heldHistorySource);expect(source.complete).toBe(true);expect(source.width).toBeGreaterThan(0);
  await page.locator('.admin-section-nav [data-admin-jump="members"]').click();await expect(page.locator('[data-member-list]')).toBeVisible();
  expect(await page.evaluate(url=>window.retiredCardUrls.some(row=>row.url===url),source.url)).toBe(false);
  await page.evaluate(()=>window.releaseHistoryLoad());
  await expect.poll(()=>page.evaluate(url=>window.retiredCardUrls.filter(row=>row.url===url).length,source.url)).toBe(1);
  expect(await page.evaluate(()=>window.retiredCardUrls.every(row=>!row.connected))).toBe(true);
  const photo=page.locator('[data-member-list] [data-card-media="/api/admin/members/m/media/cars/c/p"]');await photo.scrollIntoViewIfNeeded();await expect.poll(()=>photo.evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
  await page.goBack();await expect(page.locator('[data-history-list]')).toBeVisible();const historyPhoto=page.locator('[data-history-id="h"] [data-card-media]');await historyPhoto.scrollIntoViewIfNeeded();await expect.poll(()=>historyPhoto.evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);expect(await historyPhoto.getAttribute('src')).not.toBe(source.url);
  clean(c);expect(c.writes).toEqual([]);
 }finally{c.r.db.close()}
});
test('COMPACT history expansion leaves its neighbouring card compact',async({page},info)=>{
 await page.setViewportSize({width:1600,height:1000});const c=await fixture(page);c.r.db.exec("UPDATE united_history_claims SET event_id='e' WHERE id='second'");
 await page.goto('/admin.html?section=community&view=club&event=e');await page.locator('[data-history-year]').selectOption('all');await expect(page.locator('[data-history-id]')).toHaveCount(2);
 const cards=page.locator('[data-history-id]'),closedHeights=await cards.evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height));expect(Math.max(...closedHeights)-Math.min(...closedHeights)).toBeLessThanOrEqual(.5);
 const neighbour=page.locator('[data-history-id="second"]'),before=await neighbour.boundingBox();await expect(neighbour.locator('.compact-member-identity>.admin-member-link')).toBeVisible();await expect(neighbour.locator('.compact-member-photo')).toBeVisible();await page.locator('[data-history-id="h"] summary').click();await expect(page.locator('[data-history-id="h"] [data-history-review="attendance"]')).toBeVisible();const after=await neighbour.boundingBox();expect(Math.abs(after.height-before.height)).toBeLessThanOrEqual(0.5);await expect(neighbour).not.toHaveAttribute('open');
 await page.screenshot({path:info.outputPath('history-neighbours-1600.png'),fullPage:true});clean(c);c.r.db.close();
});
test('COMPACT mobile menu closes through all controls and legacy Club opens Members',async({page})=>{
 await page.setViewportSize({width:390,height:844});const c=await fixture(page);await page.goto('/admin.html?section=community&view=united-club&event=e');await expect(page.locator('[data-member-list]')).toBeVisible();
 await expect(page.locator('[data-admin-jump="united-club"]')).toHaveCount(0);
 const menu=page.locator('[data-portal-menu-open]'),sheet=page.locator('[data-portal-sheet]');
 await menu.click();await expect(sheet).toBeVisible();await expect(sheet.locator('[data-admin-jump="members"]')).toBeVisible();await page.keyboard.press('Escape');await expect(sheet).toBeHidden();
 for(const method of ['toggle','close','backdrop']){await menu.click();await expect(sheet).toBeVisible();if(method==='toggle')await menu.click();else if(method==='close')await sheet.locator('.portal-nav-sheet-head button').click();else await sheet.locator('[data-portal-sheet-close]').first().click({position:{x:5,y:5}});await expect(sheet).toBeHidden();await expect(menu).toBeFocused();expect(await page.locator('body').evaluate(n=>n.classList.contains('portal-sheet-open'))).toBe(false);}
 clean(c);c.r.db.close();
});
for(const width of [390,1600])test('COMPACT accommodation, photo actions and populated reservation '+width,async({page},info)=>{
 await page.setViewportSize({width,height:1000});const c=await fixture(page);await page.goto('/admin.html?section=reservations&view=accommodation&event=e');
 await expect(page.locator('[data-accommodation-preview]').first()).toBeVisible();expect((await page.locator('.admin-accommodation-visual').first().boundingBox()).height).toBeLessThanOrEqual(112);
 await page.screenshot({path:info.outputPath('accommodation-'+width+'.png'),fullPage:true});await page.locator('[data-accommodation-preview]').first().click();await expect(page.locator('.admin-accommodation-image-dialog')).toBeVisible();await page.keyboard.press('Escape');
 await page.goto('/admin.html?section=community&view=gallery&event=e');await expect(page.locator('[data-gallery-id]')).toBeVisible();
 const gallery=page.locator('[data-gallery-id]'),badge=gallery.locator('.admin-gallery-card-controls>.admin-badge');await expect(badge).toHaveText('Čeká na schválení');expect(await badge.evaluate(node=>({whiteSpace:getComputedStyle(node).whiteSpace,overflow:getComputedStyle(node).overflow,textOverflow:getComputedStyle(node).textOverflow}))).toEqual({whiteSpace:'normal',overflow:'visible',textOverflow:'clip'});
 const card=await gallery.boundingBox(),button=await gallery.locator('[data-gallery-action="rejected"]').boundingBox(),status=await badge.boundingBox();expect(button.x+button.width).toBeLessThanOrEqual(card.x+card.width);expect(status.x+status.width).toBeLessThanOrEqual(card.x+card.width);await page.screenshot({path:info.outputPath('photos-'+width+'.png'),fullPage:true});
 await page.goto('/admin.html?section=reservations&event=e&reservation=r');await expect(page.locator('[data-payment-amount]')).toBeVisible();await page.locator('[data-payment-amount]').fill('333');await page.screenshot({path:info.outputPath('reservation-'+width+'.png'),fullPage:true});
 await page.locator('[data-reservation-drawer] [data-member-open]').click();await expect(page.locator('[data-member-dialog]')).toBeVisible();await page.locator('[data-member-close]').click();await expect(page.locator('[data-member-dialog]')).toBeHidden();await expect(page.locator('[data-payment-amount]')).toHaveValue('333');expect(c.writes).toEqual([]);clean(c);c.r.db.close();
});
