import { expect, test } from '@playwright/test';
import { expectNoUnexpectedClientErrors, prepareE2ePage } from './fixtures.mjs';

test.use({ viewport: { width: 1440, height: 900 } });

test('public homepage loads and opens a representative section', async ({ page }) => {
  const observations = await prepareE2ePage(page);

  await page.goto('/');
  await expect(page).toHaveTitle(/E36 United/i);
  await expect(page.locator('.hero h1')).toContainText('E36');
  await expect(page.locator('.nav-links')).toContainText('Program');

  await page.locator('.nav-links a[href="#experience"]').click();
  await expect(page).toHaveURL(/#experience$/);
  await expect(page.locator('#experience')).toBeInViewport();

  expectNoUnexpectedClientErrors(observations);
});
