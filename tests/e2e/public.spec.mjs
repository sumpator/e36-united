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
  await expect(page.locator('.showshine-disclosure-trigger strong')).toHaveText('Co všechno porota kontroluje?');
  await expect(page.locator('.showshine-judging-head')).toHaveCount(0);
  await expect(page.locator('#show-shine')).not.toContainText('8 věcí, které rozhodují');
  await expect(page.locator('#show-shine')).not.toContainText('SHOW & SHINE / HODNOCENÍ');
  await page.locator('.showshine-disclosure-trigger').click();
  await expect(page.locator('.showshine-disclosure')).toHaveAttribute('open', '');
  await expect(page.locator('.judging-criterion')).toHaveCount(8);
  if (width === 1440) {
    const disclosure = page.locator('.showshine-disclosure');
    await expect.poll(() => disclosure.evaluate(element => {
      const panel = element.querySelector('.showshine-judging');
      if (!panel) throw new Error('Show & Shine panel is unavailable');
      return {
        open: element.open,
        fonts: document.fonts.status,
        activeAnimations: panel.getAnimations()
          .filter(animation => animation.playState === 'running' || animation.playState === 'pending').length
      };
    })).toEqual({ open: true, fonts: 'loaded', activeAnimations: 0 });

    let geometry;
    await expect.poll(async () => {
      geometry = await disclosure.evaluate(async element => {
        const snapshots = [];
        for (let frame = 0; frame < 5; frame += 1) {
          await new Promise(requestAnimationFrame);
          const criteriaRect = element.querySelector('.judging-criteria')?.getBoundingClientRect();
          const visualRect = element.querySelector('.judging-stage')?.getBoundingClientRect();
          if (!criteriaRect || !visualRect) throw new Error('Show & Shine geometry is unavailable');
          snapshots.push({
            criteria: { y: criteriaRect.y, height: criteriaRect.height },
            visual: { y: visualRect.y, height: visualRect.height }
          });
        }
        const latest = snapshots.at(-1);
        const stable = snapshots.slice(1).every((snapshot, index) => {
          const previous = snapshots[index];
          return Math.abs(snapshot.criteria.y - previous.criteria.y) < 0.01
            && Math.abs(snapshot.criteria.height - previous.criteria.height) < 0.01
            && Math.abs(snapshot.visual.y - previous.visual.y) < 0.01
            && Math.abs(snapshot.visual.height - previous.visual.height) < 0.01;
        });
        return { ...latest, stable };
      });
      return geometry.stable;
    }).toBe(true);

    const { criteria, visual } = geometry;
    expect(Math.abs(criteria.y - visual.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(criteria.height - visual.height)).toBeLessThanOrEqual(1);
    expect(criteria.height).toBeLessThanOrEqual(420);
  }
  await expect(page.locator('.band-section')).toHaveCount(0);
  await expect(page.locator('.story-preview--community .section-title')).toHaveText(/Šest ročníků\.\s*Jedna komunita\./);
  await expect(page.locator('#planer .section-title')).toHaveText('Registruj se na United');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  expectNoUnexpectedClientErrors(observations);
});
