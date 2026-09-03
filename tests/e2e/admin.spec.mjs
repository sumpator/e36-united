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

  test('Mailing opens its overview and previews a deterministic server segment', async ({ page }) => {
    const observations = await prepareAdminE2ePage(page);

    await page.goto('/admin.html');
    await expect(page.locator('[data-admin-view]')).toBeVisible();
    await page.locator('[data-admin-jump="mailing"]').click();
    await expect(page.locator('[data-admin-panel="mailing"]')).toHaveClass(/is-active/);
    await expect(page.locator('[data-mailing-kpi="total"]')).toHaveText('4');
    await expect(page.locator('[data-mailing-kpi="eligible"]')).toHaveText('1');

    await page.locator('[data-mailing-tab="segments"]').click();
    await page.locator('[data-mailing-segment-form] input[value="active_member"]').check();
    await page.locator('[data-mailing-segment-form] button[type="submit"]').click();
    await expect(page.locator('[data-mailing-recipient-count]')).toHaveText('1 příjemce');
    await expect(page.locator('[data-mailing-recipient-list]')).toContainText('eva@example.test');
    await expect(page.locator('[data-mailing-recipient-list]')).toContainText('Member');

    expect(observations.requests).toEqual(expect.arrayContaining([
      'GET /api/admin/mailing/overview',
      'POST /api/admin/mailing/segments/preview',
    ]));
    expectNoUnexpectedClientErrors(observations);
  });

  test('Mailing campaign editor uses the E36 starter, block controls and desktop/mobile server preview', async ({ page }) => {
    const observations = await prepareAdminE2ePage(page);

    await page.goto('/admin.html');
    await expect(page.locator('[data-admin-view]')).toBeVisible();
    await page.locator('[data-admin-jump="mailing"]').click();
    await page.locator('[data-mailing-tab="campaigns"]').click();

    const form=page.locator('[data-mailing-campaign-form]');
    await expect(form.locator('[name="internalName"]')).toHaveValue('United 2026 — Zbraslavice feedback');
    await expect(form.locator('[name="subject"]')).toHaveValue('Jak to vidíš se Zbraslavicemi?');
    await expect(page.locator('[data-mailing-block-id], [data-block-id]')).toHaveCount(5);
    await expect(page.frameLocator('[data-mailing-preview-frame]').locator('body')).toContainText('Jak to vidíš se Zbraslavicemi?');

    await page.locator('[data-mailing-preview-device="mobile"]').click();
    await expect(page.locator('[data-mailing-preview-stage]')).toHaveAttribute('data-device','mobile');
    await expect(page.locator('[data-mailing-preview-device="mobile"]')).toHaveAttribute('aria-pressed','true');

    const richText=page.locator('[data-block-type="rich_text"] textarea');
    await richText.fill('Nový odstavec pro **United komunitu**.');
    await expect(page.frameLocator('[data-mailing-preview-frame]').locator('body')).toContainText('Nový odstavec pro United komunitu');

    await page.locator('[data-mailing-add-type]').selectOption('cta');
    await page.locator('[data-mailing-add-block]').click();
    await expect(page.locator('[data-block-id]')).toHaveCount(6);
    await page.locator('[data-block-type="cta"] [data-block-action="duplicate"]').click();
    await expect(page.locator('[data-block-id]')).toHaveCount(7);
    await page.locator('[data-block-type="cta"]').last().locator('[data-block-action="remove"]').click();
    await expect(page.locator('[data-block-id]')).toHaveCount(6);

    expect(observations.requests).toEqual(expect.arrayContaining([
      'GET /api/admin/mailing/editor-config',
      'GET /api/admin/mailing/campaigns',
      'POST /api/admin/mailing/render-preview',
    ]));
    expect(observations.campaignWrites).toEqual([]);
    expectNoUnexpectedClientErrors(observations);
  });

  test('Mailing draft save, reload and edit retain structured blocks without freezing recipients', async ({ page }) => {
    const observations = await prepareAdminE2ePage(page);

    await page.goto('/admin.html');
    await expect(page.locator('[data-admin-view]')).toBeVisible();
    await page.locator('[data-admin-jump="mailing"]').click();
    await page.locator('[data-mailing-tab="campaigns"]').click();
    const form=page.locator('[data-mailing-campaign-form]');
    await form.locator('[name="internalName"]').fill('E2E Zbraslavice draft');
    await form.locator('[name="subject"]').fill('První uložený předmět');
    await page.locator('[data-block-type="rich_text"] textarea').fill('Obsah, který musí přežít reload.');
    await form.locator('[data-mailing-save]').click();
    await expect(page.locator('[data-mailing-save-state]')).toHaveText('Uloženo');
    await expect(page.locator('[data-mailing-campaign-list]')).toContainText('E2E Zbraslavice draft');

    await page.reload();
    await expect(page.locator('[data-admin-view]')).toBeVisible();
    await page.locator('[data-admin-jump="mailing"]').click();
    await page.locator('[data-mailing-tab="campaigns"]').click();
    await page.locator('[data-mailing-campaign-open="campaign-e2e"]').click();
    await expect(form.locator('[name="internalName"]')).toHaveValue('E2E Zbraslavice draft');
    await expect(form.locator('[name="subject"]')).toHaveValue('První uložený předmět');
    await expect(page.locator('[data-block-type="rich_text"] textarea')).toHaveValue('Obsah, který musí přežít reload.');

    await form.locator('[name="subject"]').fill('Upravený předmět');
    await form.locator('[data-mailing-save]').click();
    await expect(page.locator('[data-mailing-save-state]')).toHaveText('Uloženo');
    expect(observations.campaignWrites.map(write=>write.method)).toEqual(['POST','PATCH']);
    expect(observations.campaignWrites[0].body.content.template).toBe('e36-default-v1');
    expect(observations.campaignWrites[0].body.segment).toEqual({match:'all',rules:[{type:'mailing_eligible'}],exclusions:[]});
    expect(observations.requests.some(entry=>entry.includes('/recipients'))).toBe(false);
    expectNoUnexpectedClientErrors(observations);
  });
});
