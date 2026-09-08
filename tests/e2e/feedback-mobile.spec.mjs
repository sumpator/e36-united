import { test, expect } from '@playwright/test';
import { prepareE2ePage, prepareAdminE2ePage, expectNoUnexpectedClientErrors, accommodationOptions } from './fixtures.mjs';

test('mobile homepage connects photo, selector and context; desktop/tablet retain stats and rules content',async({page})=>{
  const observations=await prepareE2ePage(page);
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  await expect(page.locator('.stats-strip')).toBeHidden();
  await expect(page.locator('.showshine-winbar--link')).toHaveCount(0);
  await expect(page.locator('#showshine-rules-panel')).toHaveCount(1);
  const photo=page.locator('.category-showcase-media'),rail=page.locator('.category-selector'),copy=page.locator('.category-showcase-copy');
  await photo.scrollIntoViewIfNeeded();
  await expect(page.locator('.category-rail .scroll-hint')).toHaveText('Posuň →');
  const p=await photo.boundingBox(),r=await rail.boundingBox(),c=await copy.boundingBox(),explanation=await page.locator('.showshine-rule-copy').boundingBox();
  expect(r.y).toBeGreaterThanOrEqual(p.y+p.height-1);expect(r.y-(p.y+p.height)).toBeLessThan(18);
  expect(c.y).toBeGreaterThan(r.y+r.height);expect(explanation.y).toBeGreaterThan(c.y+c.height);
  await page.locator('[data-category="coupe"]').click();await expect(page.locator('[data-category-showcase-label]')).toContainText('COUPÉ');
  await rail.evaluate(el=>el.scrollTo({left:el.scrollWidth,behavior:'instant'}));
  await expect(page.locator('.category-rail .scroll-hint')).toHaveText('← Posuň');
  await expect(page.locator('.category-rail')).not.toHaveClass(/scroll-more-after/);
  for(const width of [820,1440]){await page.setViewportSize({width,height:1000});await expect(page.locator('.stats-strip')).toBeVisible();}
  const desktopPhoto=await photo.boundingBox(),desktopCopy=await copy.boundingBox(),desktopRail=await rail.boundingBox();
  expect(Math.abs(desktopCopy.y-desktopPhoto.y)).toBeLessThan(3);expect(desktopRail.y).toBeGreaterThan(desktopPhoto.y+desktopPhoto.height);
  expectNoUnexpectedClientErrors(observations);
});

test('next United displays configured range and optional venue; no fallback filler on unavailable dates',async({page})=>{
  const observations=await prepareE2ePage(page);let event={id:'next',year:2037,startsOn:'2037-08-13',endsOn:'2037-08-15',venueName:'Test kemp'};
  await page.route('https://api.e36united.cz/api/events/current',route=>route.fulfill({json:{event,accommodationOptions}}));
  await page.goto('/');await expect(page.locator('[data-next-event]')).toBeVisible();
  await expect(page.locator('[data-next-event-date]')).toHaveText('13.–15. 8. 2037');await expect(page.locator('[data-next-event-venue]')).toHaveText('Test kemp');
  event={...event,venueName:null};await page.reload();await expect(page.locator('[data-next-event-date]')).toHaveText('13.–15. 8. 2037');await expect(page.locator('[data-next-event-venue]')).toBeHidden();
  event={id:'unknown'};await page.reload();await expect(page.locator('[data-next-event]')).toBeHidden();
  await expect(page.locator('.hero-meta')).not.toContainText('Chci vědět jako první');expectNoUnexpectedClientErrors(observations);
});

test('mobile Member navigation and gallery rail have position-aware hints without changing selection',async({page})=>{
  const observations=await prepareE2ePage(page,{authenticated:true});await page.setViewportSize({width:390,height:844});
  await page.route('https://api.e36united.cz/api/gallery/approved?limit=72',route=>route.fulfill({json:{photos:[]}}));
  await page.goto('/member.html?section=overview');
  const rail=page.locator('.member-sidebar[data-portal-tablist]'),hint=page.locator('.portal-nav-viewport .scroll-hint');
  await expect(hint).toBeVisible();await expect(hint).toHaveText('Posuň →');
  await rail.evaluate(el=>el.scrollTo({left:el.scrollWidth,behavior:'instant'}));await expect(hint).toHaveText('← Posuň');
  await rail.locator('[data-portal-target="account"]').click();await expect(page.locator('[data-member-panel="account"]')).toBeVisible();
  await page.goto('/galerie.html');await expect(page.locator('.gallery-media-nav-wrap .scroll-hint')).toHaveText('Posuň →');
  await page.locator('.gallery-media-nav').evaluate(el=>el.scrollTo({left:el.scrollWidth,behavior:'instant'}));
  await expect(page.locator('.gallery-media-nav-wrap .scroll-hint')).toHaveText('← Posuň');expectNoUnexpectedClientErrors(observations);
});

test('Admin event venue is optional and saved with existing settings',async({page})=>{
  const observations=await prepareAdminE2ePage(page);let submitted;
  await page.route('https://api.e36united.cz/api/admin/events/united-2026',route=>{submitted=route.request().postDataJSON();return route.fulfill({json:{ok:true,operation:{id:route.request().headers()['idempotency-key'],state:'confirmed',revision:Number(route.request().headers()['if-match'])+2}}})});
  await page.goto('/admin.html');const form=page.locator('[data-event-settings-form]');
  await page.locator('.admin-section-nav [data-portal-target="settings"]').click();
  await form.locator('[name="venueName"]').fill('Test kemp');await form.locator('button[type="submit"]').click();
  await expect.poll(()=>submitted?.venueName).toBe('Test kemp');expect(submitted).toEqual({venueName:'Test kemp'}); // Untouched/nullable settings are not resubmitted.
  await expect(form.locator('[name="registrationStatus"]')).toHaveValue('open');await expect(form.locator('[name="eventEndAt"]')).toHaveValue('2026-09-07');
  expectNoUnexpectedClientErrors(observations);
});
