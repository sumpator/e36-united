import {test,expect} from '@playwright/test';
import {prepareE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';
for(const authenticated of [false,true])for(const path of ['/index.html','/o-nas.html','/galerie.html','/merch.html','/member.html'])test(`Account entry ${path} authenticated=${authenticated}`,async({page})=>{
 const observations=await prepareE2ePage(page,{authenticated});await page.setViewportSize({width:390,height:844});await page.goto(path);
 const links=page.locator('.site-header .nav-member');await expect(links).not.toHaveCount(0);
 await expect(links.nth(0)).toHaveText(authenticated?'Můj United účet':'Registrovat se');
 if(!authenticated){await expect(links.nth(0)).toHaveAttribute('href',/mode=register/);}
 await page.reload();await expect(links.nth(0)).toHaveText(authenticated?'Můj United účet':'Registrovat se');
 expectNoUnexpectedClientErrors(observations);
});
test('Overview prioritizes reservation over points and keeps details accessible',async({page})=>{
 const observations=await prepareE2ePage(page,{authenticated:true,registrationOpen:true});await page.goto('/member.html');const intro=page.locator('[data-onboarding-intro-modal]');await expect(intro).toBeVisible();await intro.locator('button[data-onboarding-intro-close]').click();await expect(intro).toBeHidden();
 const action=page.locator('[data-reservation-overview-card]');await expect(action).toBeVisible();expect(await action.evaluate(el=>!!(el.compareDocumentPosition(document.querySelector('.member-card'))&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
 await page.locator('[data-member-help="points"]').click();await expect(page.locator('#member-card-help')).toBeVisible();expectNoUnexpectedClientErrors(observations);
});

test('Closed registration hides the empty action badge without hiding its status',async({page})=>{
 const observations=await prepareE2ePage(page,{authenticated:true,registrationOpen:false,preliminaryEnabled:false,reservation:null});
 await page.goto('/member.html');
 const card=page.locator('[data-reservation-overview-card]');await expect(card).toBeVisible();await expect(card.locator('[data-reservation-overview-label]')).toHaveText('REGISTRACE NYNÍ NEJSOU OTEVŘENÉ');await expect(card.locator('[data-reservation-overview-action]')).toBeHidden();expectNoUnexpectedClientErrors(observations);
});
