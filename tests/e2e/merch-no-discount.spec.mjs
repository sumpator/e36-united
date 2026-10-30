import {test,expect} from '@playwright/test';
import {prepareE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';
import {bridge} from './merch-bridge.mjs';
import {merchRuntime} from '../helpers/merch-runtime.mjs';
import {waitForScreenshotContent} from './screenshot-readiness.mjs';

for(const width of [1440,390])for(const rate of [0,null])test(`Merch milestones do not promise an inactive discount ${width} ${rate}`,async({page},info)=>{
 const r=await merchRuntime();try{
  r.db.prepare('UPDATE merch_config SET data=json_set(data,\'$.paused\',json(\'true\'),\'$.discountBasisPoints\',?)').run(rate);
  const observations=await prepareE2ePage(page,{authenticated:true,member:{id:'member'},clubPayload:{points:{available:24,lifetime:24}}});await bridge(page,r.env,'member');await page.setViewportSize({width,height:960});
  await page.goto('/merch.html');await page.getByRole('button',{name:'Co za body získám?',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Co za body získám?',exact:true});
  await expect(dialog).toBeVisible();await expect(dialog).toContainText('Dosažený milník sám o sobě nezakládá slevu.');expect(await dialog.locator('.points-guide-milestones b').allTextContents()).toEqual(['12','24','36']);
  for(const theme of ['light','dark']){await page.evaluate(value=>window.dispatchEvent(new StorageEvent('storage',{key:'e36UnitedAppearance',newValue:value})),theme);await waitForScreenshotContent(page,{label:`benefit-${theme}`});await dialog.screenshot({path:info.outputPath(`benefit-${theme}.png`),animations:'disabled'})}
  await page.goto('/member.html?section=club&clubTab=points');await expect(page.locator('[data-reward-name]')).toHaveText('United Merch');await expect(page.locator('[data-reward-terms]')).toHaveText(rate===0?'Nákupní sleva nyní není aktivní.':'Podmínky případné nákupní výhody najdeš v nabídce Merche.');await expect(page.locator('[data-reward-remaining]')).toHaveText('BODOVÁ HRANICE SPLNĚNA');
  await expect(page.locator('[data-reward-progress] .reward-segments i')).toHaveCount(12);await expect(page.locator('[data-reward-progress] .reward-scale')).toHaveText('24 bodů36 bodů');
  await expect(page.locator('[data-reward-name]')).not.toContainText('%');await expect(page.locator('.united-onboarding-club')).not.toContainText('Sleva na merch');
  for(const theme of ['light','dark']){await page.evaluate(value=>window.dispatchEvent(new StorageEvent('storage',{key:'e36UnitedAppearance',newValue:value})),theme);await page.locator('[data-points-reward-state]').scrollIntoViewIfNeeded();await waitForScreenshotContent(page,{label:`club-benefit-${theme}`});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);await page.screenshot({path:info.outputPath(`club-benefit-${theme}.png`),animations:'disabled'})}
  expectNoUnexpectedClientErrors(observations);expect(r.db.prepare('SELECT COUNT(*) n FROM merch_orders').get().n).toBe(0);
 }finally{await page.close();r.close()}
});
