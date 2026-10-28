import { test, expect } from '@playwright/test';
import { prepareE2ePage, expectNoUnexpectedClientErrors } from './fixtures.mjs';

for(const failProfile of [false,true])test(`registration signs in and preserves garage destination${failProfile?' after profile retry':''}`,async({page})=>{
 const observations=await prepareE2ePage(page);let failing=failProfile,bootstrapCalls=0;
 await page.route('https://api.e36united.cz/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(route.request().method()==='OPTIONS')return route.fallback();
  if(path==='/api/bootstrap')bootstrapCalls++;
  if(failing&&['/api/bootstrap','/api/me'].includes(path))return route.fulfill({status:500,headers:{'Access-Control-Allow-Origin':'*'},json:{error:'controlled_profile_failure'}});
  return route.fallback();
 });
 await page.goto('/member.html?mode=register&section=garage');const form=page.locator('[data-auth-form=register]');
 await expect(form).toBeVisible();await form.locator('[name=name]').fill('Test Driver');await form.locator('[name=nickname]').fill('Driver');await form.locator('[name=email]').fill('driver@example.test');await form.locator('[name=password]').fill('isolated-password');await form.locator('[name=passwordConfirm]').fill('isolated-password');await form.getByRole('checkbox').check();await form.locator('[type=submit]').click();
 if(failProfile){await expect(page.locator('[data-auth-retry]')).toBeVisible();await expect(page.locator('[data-auth-status-title]')).toHaveText('Session zůstává aktivní.');await expect(page.locator('[data-auth-view]')).toBeHidden();failing=false;await page.locator('[data-auth-retry]').click()}
 await expect(page.locator('[data-app-view]')).toBeVisible();await expect(page.locator('[data-member-panel=garage]')).toBeVisible();expect(bootstrapCalls).toBe(1);
 await page.reload();await expect(page.locator('[data-member-panel=garage]')).toBeVisible();expect(bootstrapCalls).toBe(1);
 expectNoUnexpectedClientErrors({...observations,consoleErrors:observations.consoleErrors.filter(e=>!(failProfile&&((/500/.test(e.text)&&/\/api\/(me|bootstrap)$/.test(e.url))||e.text.startsWith('Unable to restore member session'))))});
});

for (const status of [200, 500]) test(`profile response after logout cannot reopen session (${status})`, async ({ page }) => {
  const observations = await prepareE2ePage(page, { authenticated: true });
  const started = Promise.withResolvers(), release = Promise.withResolvers();
  await page.route('https://api.e36united.cz/api/me', async route => {
    if (route.request().method() === 'OPTIONS') return route.fallback();
    started.resolve(); await release.promise;
    await route.fulfill({ status, headers: { 'Access-Control-Allow-Origin': '*' }, json: status === 200 ? { member: { id: 'previous-user' } } : { error: 'controlled_profile_failure' } });
  });
  try {
    await page.goto('/member.html'); await started.promise;
    await expect(page.locator('[data-auth-status-view]')).toBeVisible();
    await page.evaluate(async () => {
      const sdk = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
      await sdk.signOut(sdk.getAuth());
    });
    await expect(page.locator('[data-auth-view]')).toBeVisible();
    const response = page.waitForResponse(r => r.url().endsWith('/api/me') && r.request().method() === 'GET');
    release.resolve(); await response;
    // Let the response promise and the resulting render opportunity complete.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.locator('[data-auth-view]')).toBeVisible();
    await expect(page.locator('[data-auth-status-view]')).toBeHidden();
    await expect(page.locator('[data-app-view]')).toBeHidden();
    expectNoUnexpectedClientErrors({ ...observations, consoleErrors: observations.consoleErrors.filter(e => !(status === 500 && /500/.test(e.text) && e.url.endsWith('/api/me'))) });
  } finally { release.resolve(); }
});
