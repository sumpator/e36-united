import { expect, test } from '@playwright/test';
import { accommodationOptions, expectNoUnexpectedClientErrors, prepareAdminE2ePage } from './fixtures.mjs';

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

    expect(observations.requests).not.toContain('GET /api/admin/gallery');
    expect(observations.requests).not.toContain('GET /api/admin/reservations');
    await page.locator('.admin-section-nav [data-portal-target="reservations"]').click();
    await expect(page.locator('[data-admin-panel="reservations"]')).toHaveClass(/is-active/);
    await expect(page.locator('[data-reservation-list]')).toContainText('Eva');

    await page.locator('.admin-section-nav [data-portal-target="payments"]').click();
    await expect(page.locator('[data-admin-panel="payments"]')).toHaveClass(/is-active/);
    await expect(page.locator('[data-payment-count]')).toHaveText('0 záznamů z 1');

    await page.locator('.admin-section-nav [data-portal-target="reservations"]').click();
    await page.locator('[data-admin-jump="accommodation"]').click();
    await expect.poll(()=>observations.requests.includes('GET /api/admin/accommodation')).toBe(true);
    await page.locator('.admin-section-nav [data-community-toggle]').click();await page.locator('.admin-section-nav [data-admin-jump="photos"]').click();
    await expect.poll(()=>observations.requests.includes('GET /api/admin/gallery')).toBe(true);
    await page.locator('[data-gallery-mode="history"]').click();
    await expect.poll(()=>observations.requests.includes('GET /api/admin/history/claims')).toBe(true);

    expect(observations.requests).toEqual(expect.arrayContaining([
      'GET /api/admin/events',
      'GET /api/admin/summary',
      'GET /api/admin/reservations',
      'GET /api/admin/accommodation',
      'GET /api/admin/gallery',
      'GET /api/admin/history/claims',
    ]));
    expectNoUnexpectedClientErrors(observations);
  });

  test('ACCOMMODATION GALLERY Admin shows ordered slots, disables max upload and reports upload errors',async({page})=>{
    const observations=await prepareAdminE2ePage(page);const photos=[{id:'cover',role:'cover',imageUrl:'/api/events/united-2026/accommodation/cabin-premium/photo?v=1'},{id:'p2',role:'additional',imageUrl:'/api/events/united-2026/accommodation/cabin-premium/gallery/p2?v=2',sortOrder:1},{id:'p3',role:'additional',imageUrl:'/api/events/united-2026/accommodation/cabin-premium/gallery/p3?v=3',sortOrder:2},{id:'p4',role:'additional',imageUrl:'/api/events/united-2026/accommodation/cabin-premium/gallery/p4?v=4',sortOrder:3},{id:'p5',role:'additional',imageUrl:'/api/events/united-2026/accommodation/cabin-premium/gallery/p5?v=5',sortOrder:4}];
    await page.route('https://api.e36united.cz/api/admin/accommodation**',async route=>{const request=route.request();if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'}});if(request.method()==='GET')return route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*','Content-Type':'application/json'},body:JSON.stringify({options:[{...accommodationOptions[1],photos,approvedUnits:1,pendingUnits:0,pendingConflictUnits:0},{...accommodationOptions[0],photos:accommodationOptions[0].photos.slice(0,1),approvedUnits:0,pendingUnits:0,pendingConflictUnits:0}]})});return route.fulfill({status:503,headers:{'Access-Control-Allow-Origin':'*','Content-Type':'application/json'},body:JSON.stringify({message:'Testovací chyba uploadu'})})});
    await page.goto('/admin.html');await page.locator('.admin-section-nav [data-portal-target="reservations"]').click();await page.locator('[data-admin-jump="accommodation"]').click();
    const card=page.locator('[data-accommodation-id="cabin-premium"]');await expect(card.locator('.admin-accommodation-gallery-head>strong')).toHaveText('5 / 5');await expect(card.locator('[data-accommodation-gallery-input]')).toBeDisabled();await expect(card.locator('[data-accommodation-gallery-photo]')).toHaveCount(4);await page.screenshot({path:'test-results/accommodation-gallery-admin.png',fullPage:false});
    const uploadCard=page.locator('[data-accommodation-id="cabin-standard"]');await uploadCard.locator('[data-accommodation-gallery-input]').setInputFiles({name:'failure.jpg',mimeType:'image/jpeg',buffer:Buffer.from('fixture-image')});await uploadCard.locator('[data-accommodation-gallery-upload]').click();await expect(uploadCard.locator('[data-accommodation-gallery-status]')).toHaveText('Testovací chyba uploadu');
    expect(observations.campaignWrites).toHaveLength(0);expect(observations.pageErrors).toEqual([]);expect(observations.consoleErrors.every(entry=>entry.text.includes('503'))).toBe(true);
  });

  test('reservation drawer preserves payment details, QR and keyboard focus return', async ({ page }) => {
    const observations = await prepareAdminE2ePage(page);

    await page.goto('/admin.html');
    await expect(page.locator('[data-admin-view]')).toBeVisible();
    await page.locator('.admin-section-nav [data-portal-target="reservations"]').click();

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
    await page.locator('.admin-section-nav [data-portal-target="mailing"]').click();
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
    await page.locator('.admin-section-nav [data-portal-target="mailing"]').click();
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
    await page.locator('.admin-section-nav [data-portal-target="mailing"]').click();
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
    await page.locator('.admin-section-nav [data-portal-target="mailing"]').click();
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
