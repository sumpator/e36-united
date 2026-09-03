import { expect, test } from '@playwright/test';
import { expectNoUnexpectedClientErrors, prepareAdminE2ePage } from './fixtures.mjs';

test.describe('desktop Admin portal', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('authenticated Admin boots on Dashboard and switches existing agenda views', async ({ page }) => {
    const observations = await prepareAdminE2ePage(page);

    await page.goto('/admin.html');
    await expect(page.locator('[data-admin-view]')).toBeVisible();
    await expect(page.locator('[data-admin-panel="dashboard"]')).toHaveClass(/is-active/);
    await expect(page.locator('[data-kpi-reservations]')).toHaveText('1');
    await expect(page.locator('[data-kpi-people]')).toHaveText('3');
    await expect(page.locator('[data-admin-account]')).toHaveText('eva@example.test');

    await page.locator('[data-admin-jump="reservations"]').click();
    await expect(page.locator('[data-admin-panel="reservations"]')).toHaveClass(/is-active/);
    await expect(page.locator('[data-reservation-list]')).toContainText('Eva');

    await page.locator('[data-admin-jump="payments"]').click();
    await expect(page.locator('[data-admin-panel="payments"]')).toHaveClass(/is-active/);
    await expect(page.locator('[data-payment-count]')).toHaveText('0 záznamů z 1');

    expect(observations.requests).toEqual(expect.arrayContaining([
      'GET /api/admin/events',
      'GET /api/admin/overview',
      'GET /api/admin/reservations',
      'GET /api/admin/accommodation',
      'GET /api/admin/gallery',
      'GET /api/admin/history/claims',
    ]));
    expectNoUnexpectedClientErrors(observations);
  });

  test('reservation drawer preserves payment details, QR and keyboard focus return', async ({ page }) => {
    const observations = await prepareAdminE2ePage(page);

    await page.goto('/admin.html');
    await expect(page.locator('[data-admin-view]')).toBeVisible();
    await page.locator('[data-admin-jump="reservations"]').click();

    const row = page.locator('[data-reservation-list] tr[data-reservation-open]').first();
    await row.focus();
    await row.press('Enter');

    const drawer = page.locator('[data-reservation-drawer]');
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText('TESTOVACÍ PLATBA – NEPLAŤTE');
    await expect(drawer).toContainText('2026123456');
    await expect(drawer).toContainText('123 / 9999');
    await expect(drawer.locator('[data-payment-amount]')).toHaveValue('1200');
    await expect(drawer.locator('.admin-payment-qr svg')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(row).toBeFocused();

    expectNoUnexpectedClientErrors(observations);
  });
});
