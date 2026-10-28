import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {prepareE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';

for(const [width,height] of [[360,420],[390,844],[1440,900]])test(`garage completion remains reachable ${width} ${height}`,async({page},info)=>{
 const observations=await prepareE2ePage(page,{authenticated:true});
 await page.setViewportSize({width,height});await page.goto('/member.html?section=garage');
 await page.locator('[data-open-car]').click();const modal=page.locator('[data-car-modal]'),submit=modal.locator('[data-car-submit]');
 await expect(modal).toBeVisible();await expect(submit).toBeInViewport();await expect(modal.locator('[name=body]')).toHaveValue('Sedan');
 await expect(modal.locator('[name=nickname]')).toHaveValue('');await expect(modal.locator('[name=nickname]')).toHaveAttribute('placeholder','Moje E36');
 await submit.click();await expect(modal).toBeVisible();expect(observations.carWrites).toEqual([]);
 await modal.locator('[name=nickname]').fill('Vlastní název');await modal.locator('[name=model]').fill('328i');
 await expect(submit).toBeInViewport();await page.screenshot({path:info.outputPath('garage-completion.png')});
 if(width===390){
  await page.evaluate(()=>{const viewport=window.visualViewport;Object.defineProperties(viewport,{height:{configurable:true,value:420},offsetTop:{configurable:true,value:50}});viewport.dispatchEvent(new Event('resize'))});
  const box=await submit.boundingBox();expect(box.y).toBeGreaterThanOrEqual(50);expect(box.y+box.height).toBeLessThanOrEqual(470);
  await page.screenshot({path:info.outputPath('garage-keyboard-viewport.png')});
 }
 await modal.getByRole('button',{name:'Zrušit',exact:true}).click();await expect(modal).toBeHidden();
 await page.locator('[data-open-car]').click();await expect(modal.locator('[name=nickname]')).toHaveValue('');
 await modal.getByRole('button',{name:'Zrušit',exact:true}).click();
 await page.locator('[data-edit-car="car-001"]').click();await expect(submit).toContainText('Uložit změny');await expect(submit).toBeInViewport();await expect(modal.locator('[name=nickname]')).toHaveValue('Estoril');
 expect(observations.carWrites).toEqual([]);expectNoUnexpectedClientErrors(observations);
});

test('history explains each missing condition before enabling its existing confirmation',async({page})=>{
 const observations=await prepareE2ePage(page,{authenticated:true,clubPayload:{history:[{eventId:'united-2024',eventYear:2024,concluded:true,attendance:{status:'not_claimed'},showShine:{competed:false,status:'not_claimed'},evidence:[]}]}});
 await page.goto('/member.html?section=club');await page.locator('[data-club-tab=history]').click();await page.locator('[data-open-history-editor]').click();
 const form=page.locator('[data-history-claim-form]'),submit=form.locator('[data-history-submit]'),hint=form.locator('[data-history-submit-hint]');
 await expect(submit).toBeDisabled();await expect(hint).toContainText('přilož alespoň jednu');
 await form.locator('[data-history-sns-choice=yes]').click();await form.locator('[data-history-evidence-input]').setInputFiles({name:'evidence.webp',mimeType:'image/webp',buffer:readFileSync('assets/images/showshine/ss_z3.webp')});
 await expect(submit).toBeDisabled();await expect(hint).toHaveText('Ještě vyber soutěžní kategorii.');
 await form.locator('[data-history-category-trigger]').click();await form.locator('[data-history-category-value=coupe]').click();
 await expect(submit).toBeEnabled();await expect(hint).toContainText('Připraveno k odeslání');await expect(submit).toHaveAttribute('aria-describedby',await hint.getAttribute('id'));
 await page.getByRole('button',{name:'Zavřít editor historie',exact:true}).click();await expect(page.locator('[data-history-editor]')).toBeHidden();expectNoUnexpectedClientErrors(observations);
});
