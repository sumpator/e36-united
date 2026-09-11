import { expect, test } from '@playwright/test';
import { expectNoUnexpectedClientErrors, prepareE2ePage } from './fixtures.mjs';

test.use({ viewport: { width: 1440, height: 900 } });

test('public homepage loads and opens a representative section', async ({ page }) => {
  const observations = await prepareE2ePage(page);

  await page.goto('/');
  await expect(page).toHaveTitle(/E36 United/i);
  await expect(page.locator('.hero h1')).toContainText('E36');
  await expect(page.locator('.nav-links')).toContainText('Program');
  await expect(page.locator('.nav-member')).toHaveText('Registrace do Můj United');
  await expect(page.locator('.nav-member')).toHaveAttribute('href', 'member.html?mode=register');
  await expect(page.locator('.site-wip, .hero-badge')).toHaveCount(0);

  await page.locator('.nav-links a[href="#experience"]').click();
  await expect(page).toHaveURL(/#experience$/);
  await expect(page.locator('#experience')).toBeInViewport();
  await page.locator('.nav-member').click();
  await expect(page).toHaveURL(/member\.html\?mode=register$/);
  await expect(page.locator('[data-auth-form="register"]')).toBeVisible();

  expectNoUnexpectedClientErrors(observations);
});

for (const width of [390, 1440]) test(`public readability layout remains usable at ${width}px`, async ({ page }) => {
  const observations = await prepareE2ePage(page);
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/');

  if (width === 390) {
    await page.locator('.menu-btn').click();
    await expect(page.locator('.nav-member')).toBeVisible();
    await expect(page.locator('.nav-member')).toHaveAttribute('href', 'member.html?mode=register');
    await page.locator('.menu-btn').click();
  }

  await expect(page.locator('#experience .section-title')).toHaveText('Pátek. Sobota. Neděle.');
  await page.locator('.weekend-tab[data-day="saturday"]').click();
  await expect(page.locator('[data-copy="saturday"] h3')).toHaveText('Hlavní den. Show & Shine.');
  await expect(page.locator('.showshine-judging-head')).toContainText('8 věcí, které rozhodují');
  await expect(page.locator('.showshine-judging-head')).not.toContainText('Porota postupuje podle stejného seznamu');
  await expect(page.locator('.band-section')).toHaveCount(0);
  await expect(page.locator('.story-preview--community .section-title')).toHaveText(/Šest ročníků\.\s*Jedna komunita\./);
  await expect(page.locator('#planer .section-title')).toHaveText('Poskládej si svůj United.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  expectNoUnexpectedClientErrors(observations);
});
