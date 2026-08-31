import { expect, test } from '@playwright/test';
import { MEMBER_SESSION_KEY, expectNoUnexpectedClientErrors, prepareE2ePage } from './fixtures.mjs';

async function expectMemberOverview(page) {
  await expect(page.locator('[data-app-view]')).toBeVisible();
  await expect(page.locator('[data-member-panel="overview"]')).toHaveClass(/is-active/);
  await expect(page.locator('[data-member-nickname]')).toHaveText('Eva');
  await expect(page.locator('[data-summary-name]')).toHaveText('Eva Nováková');
}

test.describe('desktop member portal', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('authenticated portal boots on Přehled and navigates between representative sections', async ({ page }) => {
    const observations = await prepareE2ePage(page, { authenticated: true });

    await page.goto('/member.html');
    await expectMemberOverview(page);

    await page.locator('.member-sidebar [data-member-section="garage"]').click();
    await expect(page.locator('[data-member-panel="garage"]')).toHaveClass(/is-active/);
    await expect(page.locator('[data-garage-grid]')).toContainText('Estoril');

    await page.locator('.member-sidebar [data-member-section="club"]').click();
    await expect(page.locator('[data-member-panel="club"]')).toHaveClass(/is-active/);
    await expect(page.locator('[data-member-panel="club"]')).toContainText('United Points');

    expectNoUnexpectedClientErrors(observations);
  });

  test('authenticated session restores after reload and current behavior returns to Přehled', async ({ page }) => {
    const observations = await prepareE2ePage(page, { authenticated: true });

    await page.goto('/member.html');
    await expectMemberOverview(page);
    await page.locator('.member-sidebar [data-member-section="garage"]').click();
    await expect(page.locator('[data-member-panel="garage"]')).toHaveClass(/is-active/);

    await page.reload();
    await expectMemberOverview(page);
    await expect(page.locator('[data-member-panel="garage"]')).not.toHaveClass(/is-active/);
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), MEMBER_SESSION_KEY)).toBe('true');

    expectNoUnexpectedClientErrors(observations);
  });

  test('desktop logout removes access to the protected member UI', async ({ page }) => {
    const observations = await prepareE2ePage(page, { authenticated: true });

    await page.goto('/member.html');
    await expectMemberOverview(page);
    await page.locator('.member-sidebar-logout').click();

    await expect(page.locator('[data-auth-view]')).toBeVisible();
    await expect(page.locator('[data-app-view]')).toBeHidden();
    await expect(page.locator('[data-member-panel="overview"]')).toBeHidden();
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), MEMBER_SESSION_KEY)).toBe('false');

    expectNoUnexpectedClientErrors(observations);
  });

  test('Garage API failure is isolated and the rest of the portal remains usable', async ({ page }) => {
    const observations = await prepareE2ePage(page, {
      authenticated: true,
      carsFailure: true,
      ignoreConsoleError: entry => entry.url.includes('/api/cars') && entry.text.includes('503'),
    });

    await page.goto('/member.html');
    await expectMemberOverview(page);
    await page.locator('.member-sidebar [data-member-section="garage"]').click();
    await expect(page.locator('[data-member-panel="garage"]')).toHaveClass(/is-active/);
    await expect(page.locator('[data-garage-grid]')).toBeVisible();
    await page.locator('.member-sidebar [data-member-section="account"]').click();
    await expect(page.locator('[data-member-panel="account"]')).toHaveClass(/is-active/);
    await expect(page.locator('[data-account-member-code]')).toHaveText('EU036');
    expect(observations.requests).toContain('GET /api/cars');

    expectNoUnexpectedClientErrors(observations);
  });
});

test.describe('mobile member portal', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('mobile main navigation logout removes access to the protected member UI', async ({ page }) => {
    const observations = await prepareE2ePage(page, { authenticated: true });

    await page.goto('/member.html');
    await expectMemberOverview(page);
    await page.locator('.menu-btn').click();
    await expect(page.locator('.member-main-mobile-logout')).toBeVisible();
    await page.locator('.member-main-mobile-logout').click();

    await expect(page.locator('[data-auth-view]')).toBeVisible();
    await expect(page.locator('[data-app-view]')).toBeHidden();
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), MEMBER_SESSION_KEY)).toBe('false');

    expectNoUnexpectedClientErrors(observations);
  });
});
