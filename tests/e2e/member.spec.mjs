import { expect, test } from '@playwright/test';
import { MEMBER_SESSION_KEY, expectNoUnexpectedClientErrors, prepareE2ePage } from './fixtures.mjs';

const approvedReservation = {
  id: 'reservation-2026-e2e',
  eventId: 'united-2026',
  eventYear: 2026,
  title: 'E36 United 2026',
  carId: 'car-001',
  carSnapshot: { id: 'car-001', nickname: 'Estoril', body: 'Coupé', model: '328i', year: 1996, color: 'Estoril Blau' },
  arrival: 'Sobota',
  crew: 3,
  attendanceType: 'saturday_only',
  accommodation: 'Chatka',
  accommodationUnits: 2,
  accommodationSnapshot: {
    optionId: 'cabin-premium', optionName: 'Chatka Premium', kind: 'cabin', capacityPerUnit: 3,
    peopleCount: 2, unitCount: 1, unitPriceCzk: 1_650, personPriceCzk: 0,
    beddingFeePerPersonCzk: 120, cityTaxPerPersonPerNightCzk: 25, nights: 1,
    baseTotalCzk: 1_650, personTotalCzk: 0, beddingTotalCzk: 240, cityTaxTotalCzk: 50, totalCzk: 1_940,
  },
  showShine: 'Ano',
  note: 'Příjezd po obědě.',
  status: 'approved',
  changePending: false,
  paymentStatus: 'underpaid',
  amountDueCzk: 4_800,
  amountPaidCzk: 1_200,
  payment: {
    amountDueCzk: 4_800, amountPaidCzk: 1_200, balanceCzk: 3_600, remainingCzk: 3_600, overpaymentCzk: 0,
    status: 'underpaid', overdue: false, variableSymbol: '2026123456', recipientName: 'E36 UNITED TEST',
    accountDisplay: '123 / 9999', iban: 'CZ5099990000000000000123', currency: 'CZK',
    message: 'E36 UNITED 2026 2026123456', deadline: '2026-12-01', testMode: true,
    configurationReady: true, actionable: true, awaitingApproval: false,
    spayd: 'SPD*1.0*ACC:CZ5099990000000000000123*AM:3600.00*CC:CZK*X-VS:2026123456*MSG:E36 UNITED 2026 2026123456*DT:20261201',
    paidAt: '',
  },
};

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

  test('United Club renders server Points, Achievements and pending history detail', async ({ page }) => {
    const achievement = { id: 'sns-top3-2024', name: 'UNITED PÓDIUM', condition: '2. místo · Coupé', tier: 'SILVER', type: 'show-shine', points: 2, eventYear: 2024 };
    const observations = await prepareE2ePage(page, {
      authenticated: true,
      clubPayload: {
        achievements: [achievement],
        featuredAchievements: [achievement],
        history: [{
          eventId: 'united-2024', eventYear: 2024, concluded: true,
          attendance: { status: 'pending', reviewNote: '' },
          showShine: { competed: true, status: 'pending', category: 'coupe', placement: 2, bestOfBest: false, bestExhaust: false },
          evidence: [],
        }],
      },
    });

    await page.goto('/member.html');
    await expectMemberOverview(page);
    await expect(page.locator('[data-overview-points]')).toHaveText('7');
    await expect(page.locator('[data-featured-achievements]')).toContainText('UNITED PÓDIUM');

    await page.locator('.member-sidebar [data-member-section="club"]').click();
    await expect(page.locator('[data-points-journey-score]')).toHaveText('7');
    await expect(page.locator('[data-achievement-catalog]')).toContainText('UNITED PÓDIUM');
    await page.locator('[data-achievement-catalog] [data-achievement-id="sns-top3-2024"]').click();
    await expect(page.locator('[data-achievement-popover]')).toBeVisible();
    await expect(page.locator('[data-achievement-title]')).toHaveText('UNITED PÓDIUM');
    await page.locator('[data-achievement-close]').click();

    const historyYear = page.locator('[data-open-history-year="united-2024"]');
    await expect(historyYear).toContainText('ČEKÁ NA KONTROLU');
    await expect(historyYear).toContainText('S&S ČEKÁ NA KONTROLU');
    await historyYear.click();
    await expect(page.locator('[data-history-editor]')).toBeVisible();
    await expect(page.locator('[data-history-editor-list]')).toContainText('Účast na United 2024');
    await expect(page.locator('[data-history-editor-list]')).toContainText('Coupé · 2. místo');

    expectNoUnexpectedClientErrors(observations);
  });

  test('Account keeps profile prefill and the existing bootstrap update payload', async ({ page }) => {
    const observations = await prepareE2ePage(page, { authenticated: true });

    await page.goto('/member.html');
    await expectMemberOverview(page);
    await page.locator('.member-sidebar [data-member-section="account"]').click();

    const form = page.locator('[data-account-form]');
    await expect(form.locator('[name="name"]')).toHaveValue('Eva Nováková');
    await expect(form.locator('[name="nickname"]')).toHaveValue('Eva');
    await expect(form.locator('[name="phone"]')).toHaveValue('+420 700 000 036');
    await expect(form.locator('[data-account-email]')).toHaveValue('eva@example.test');
    await expect(page.locator('[data-account-member-code]')).toHaveText('EU036');
    await expect(page.locator('[data-account-verification]')).toHaveText('OVĚŘENÝ');

    await form.locator('[name="name"]').fill('Eva United');
    await form.locator('[name="nickname"]').fill('Evi');
    await form.locator('[name="phone"]').fill('+420 777 111 222');
    await form.locator('button[type="submit"]').click();
    await expect.poll(() => observations.profileWrites.length).toBe(1);
    expect(observations.profileWrites[0]).toEqual({ name: 'Eva United', nickname: 'Evi', phone: '+420 777 111 222' });
    await expect(form.locator('[name="name"]')).toHaveValue('Eva United');
    await expect(form.locator('[name="nickname"]')).toHaveValue('Evi');
    await expect(page.locator('[data-summary-name]')).toHaveText('Eva United');

    expectNoUnexpectedClientErrors(observations);
  });

  test('Garage Add and Edit keep one shared form with the existing prefill behavior', async ({ page }) => {
    const observations = await prepareE2ePage(page, { authenticated: true });

    await page.goto('/member.html');
    await expectMemberOverview(page);
    await page.locator('.member-sidebar [data-member-section="garage"]').click();
    await page.locator('[data-edit-car="car-001"]').click();

    const modal = page.locator('[data-car-modal]');
    const form = modal.locator('[data-car-form]');
    await expect(modal).toBeVisible();
    await expect(modal.locator('[data-car-modal-title]')).toHaveText('Upravit auto.');
    await expect(form.locator('[name="nickname"]')).toHaveValue('Estoril');
    await expect(form.locator('[name="model"]')).toHaveValue('328i');
    await expect(form.locator('[name="primary"]')).toBeChecked();

    await modal.locator('.member-modal-close').click();
    await page.locator('[data-open-car]').click();
    await expect(modal.locator('[data-car-modal-title]')).toHaveText('Přidat auto.');
    await expect(form.locator('[name="nickname"]')).toHaveValue('');
    await expect(form.locator('[name="primary"]')).not.toBeChecked();

    expectNoUnexpectedClientErrors(observations);
  });

  test('Member Photos keeps its empty state and file-selection preview lifecycle', async ({ page }) => {
    const observations = await prepareE2ePage(page, { authenticated: true });

    await page.goto('/member.html');
    await expectMemberOverview(page);
    await page.locator('.member-sidebar [data-member-section="photos"]').click();
    await expect(page.locator('[data-member-gallery-list]')).toContainText('Zatím jsi neposlal žádné fotografie.');

    await page.locator('[data-member-photo-input]').setInputFiles({
      name: 'united.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
    });
    await expect(page.locator('[data-member-photo-selection]')).toBeVisible();
    await expect(page.locator('[data-member-photo-count]')).toHaveText('1 fotka připravená k nahrání');
    await expect(page.locator('[data-member-photo-names]')).toHaveText('united.png');
    await expect(page.locator('[data-member-photo-previews] img')).toHaveCount(1);

    await page.locator('[data-member-photo-clear]').click();
    await expect(page.locator('[data-member-photo-selection]')).toBeHidden();
    await expect(page.locator('[data-member-photo-previews] img')).toHaveCount(0);

    expectNoUnexpectedClientErrors(observations);
  });

  test('existing reservation prefill keeps update semantics and reservation identity', async ({ page }) => {
    const observations = await prepareE2ePage(page, { authenticated: true, registrationOpen: true, reservation: approvedReservation });

    await page.goto('/member.html');
    await expectMemberOverview(page);
    await page.locator('.member-sidebar [data-member-section="reservation"]').click();

    const form = page.locator('[data-reservation-form]');
    await expect(form.locator('[name="arrival"]')).toHaveValue('Sobota');
    await expect(form.locator('[name="crew"]')).toHaveValue('3');
    await expect(form.locator('[name="sleep"]')).toHaveValue('Chatka');
    await expect(form.locator('[name="accommodationOptionId"]')).toHaveValue('cabin-premium');
    await expect(form.locator('[name="showshine"]')).toHaveValue('Ano');
    await expect(form.locator('[name="note"]')).toHaveValue('Příjezd po obědě.');
    await expect(page.locator('[data-reservation-submit]')).toContainText('Upravit rezervaci');

    await form.locator('[name="note"]').fill('Aktualizovaný příjezd.');
    await page.locator('[data-reservation-submit]').click();
    await expect.poll(() => observations.reservationWrites.length).toBe(1);
    expect(observations.reservationWrites[0]).toMatchObject({
      reservationId: 'reservation-2026-e2e',
      carId: 'car-001',
      arrival: 'Sobota',
      crew: 3,
      attendanceType: 'saturday_only',
      accommodation: 'Chatka',
      accommodationOptionId: 'cabin-premium',
      accommodationUnits: 2,
      showShine: 'Ano',
      note: 'Aktualizovaný příjezd.',
    });
    expect(observations.requests).toContain('PUT /api/reservations/current');

    expectNoUnexpectedClientErrors(observations);
  });

  test('approved reservation renders server payment balance, variable symbol and QR', async ({ page }) => {
    const observations = await prepareE2ePage(page, { authenticated: true, reservation: approvedReservation });

    await page.goto('/member.html');
    await expectMemberOverview(page);
    await expect(page.locator('[data-member-payment]')).toContainText('Doplatek');
    await page.locator('.member-sidebar [data-member-section="payments"]').click();

    const payment = page.locator('[data-payments-list]');
    await expect(payment).toContainText('TESTOVACÍ PLATBA – NEPLAŤTE');
    await expect(payment).toContainText('E36 United 2026');
    await expect(payment).toContainText('Doplatek');
    await expect(payment).toContainText('E36 UNITED TEST');
    await expect(payment).toContainText('123 / 9999');
    await expect(payment).toContainText('2026123456');
    await expect(payment.locator('.member-payment-qr svg')).toBeVisible();

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

  test('inactive membership remains discoverable while protected portal data stays closed', async ({ page }) => {
    const observations = await prepareE2ePage(page, {
      authenticated: true,
      memberStatus: 'blocked',
      ignoreConsoleError: entry => entry.text.includes('Unable to restore member session') && entry.text.includes('member_inactive'),
    });

    await page.goto('/member.html');
    await expect(page.locator('[data-auth-status-view]')).toBeVisible();
    await expect(page.locator('[data-auth-status-title]')).toHaveText('Session zůstává aktivní.');
    await expect(page.locator('[data-auth-status-copy]')).toContainText('Tento členský účet není aktivní.');
    await expect(page.locator('[data-auth-retry]')).toBeVisible();
    await expect(page.locator('[data-app-view]')).toBeHidden();
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), MEMBER_SESSION_KEY)).toBe('true');
    expect(observations.requests).toContain('GET /api/me');
    expect(observations.requests).not.toContain('GET /api/cars');

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
