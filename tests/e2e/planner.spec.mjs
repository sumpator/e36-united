import { expect, test } from '@playwright/test';
import { expectNoUnexpectedClientErrors, prepareE2ePage } from './fixtures.mjs';

async function exerciseAccommodationSwitch(page, previewImageSelector) {
  const standard = page.locator('[data-accommodation-option-id="cabin-standard"]');
  const premium = page.locator('[data-accommodation-option-id="cabin-premium"]');
  const previewImage = page.locator(previewImageSelector);

  await expect(standard).toBeVisible();
  await expect(premium).toBeVisible();

  await standard.click();
  await expect(standard).toHaveAttribute('aria-pressed', 'true');
  await expect(previewImage).toHaveAttribute('src', /cabin-standard\/photo/);
  await expect(page.locator('[data-planner-price-preview]')).toContainText('Chatka Standard');

  await premium.click();
  await expect(premium).toHaveAttribute('aria-pressed', 'true');
  await expect(standard).toHaveAttribute('aria-pressed', 'false');
  await expect(previewImage).toHaveAttribute('src', /cabin-premium\/photo/);
  await expect(page.locator('[data-planner-price-preview]')).toContainText('Chatka Premium');
}

test.describe('desktop Weekend Planner', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('changing accommodation updates the standalone desktop preview', async ({ page }) => {
    const observations = await prepareE2ePage(page);

    await page.goto('/#planer');
    await expect(page.locator('[data-planner]')).toBeVisible();
    await exerciseAccommodationSwitch(page, '[data-context-sleep-image]');
    await expect(page.locator('[data-context-preview="sleep"]')).toBeVisible();

    expectNoUnexpectedClientErrors(observations);
  });
});

test.describe('mobile Weekend Planner', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('changing accommodation updates the responsive mobile preview', async ({ page }) => {
    const observations = await prepareE2ePage(page);

    await page.goto('/#planer');
    await expect(page.locator('[data-planner]')).toBeVisible();
    await exerciseAccommodationSwitch(page, '[data-flow-sleep-image]');

    const preview = page.locator('[data-preview-card="sleep"]');
    await expect(preview).toBeVisible();
    await preview.scrollIntoViewIfNeeded();
    await expect(preview).toBeInViewport();
    await expect(preview).toContainText('Chatka Premium');

    expectNoUnexpectedClientErrors(observations);
  });
});
