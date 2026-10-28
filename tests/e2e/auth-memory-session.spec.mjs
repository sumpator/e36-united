import {test,expect} from '@playwright/test';
import {prepareE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';

test('memory-only auth explains reload loss and preserves Planner return when signing in again',async({page},info)=>{
 const observations=await prepareE2ePage(page,{authMemoryOnly:true,preliminaryEnabled:true,cars:[]});
 const draft='11111111-1111-4111-8111-111111111111',returnTo='/index.html#planer';
 const handoff={version:1,source:'weekend-planner',draftId:draft,eventId:'united-2026',eventYear:2026,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),arrival:'Sobota',departure:'Neděle',nights:1,attendanceType:'saturday_only',crew:3,accommodation:'Bez ubytování',accommodationUnits:0,showShine:'Ano'};
 await page.route('https://api.e36united.cz/api/planner-draft**',route=>route.request().method()==='GET'?route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},json:{ok:true,draft:handoff}}):route.fallback());
 await page.goto('/member.html?mode=login&section=reservation&draft='+draft+'&returnTo='+encodeURIComponent(returnTo));
 const login=page.locator('[data-auth-form=login]');let first=true;
 const signIn=async()=>{await expect(login).toBeVisible();await login.locator('[name=email]').fill('eva@example.test');await login.locator('[name=password]').fill('isolated-password');await login.locator('[type=submit]').click();await expect(page.locator('[data-app-view]')).toBeVisible();await expect(page.locator('[data-memory-session-notice]')).toContainText('po obnovení se přihlas znovu.');
  if(first){const intro=page.locator('[data-onboarding-intro-modal]');await expect(intro).toBeVisible();await intro.getByRole('button',{name:'Zavřít úvod',exact:true}).click();first=false}
  const open=page.locator('[data-member-plan-open]');await expect(open).toContainText('Dokončit předběžnou registraci');await open.click();const modal=page.locator('[data-member-planner-modal]');await expect(modal.locator('[data-member-stay="1"]')).toHaveAttribute('aria-pressed','true');await expect(modal.locator('[data-member-crew]')).toHaveText('3');await modal.getByRole('button',{name:'Zavřít Planner',exact:true}).click();
 };
 await signIn();expect(await page.evaluate(()=>localStorage.getItem('e36UnitedE2eAuthenticated'))).toBe('false');
 for(const width of [390,1440]){await page.setViewportSize({width,height:900});await expect(page.locator('[data-memory-session-notice]')).toBeVisible();await page.screenshot({path:info.outputPath('memory-session-notice-'+width+'.png')});}
 await page.reload();await expect(login).toBeVisible();await expect(page.locator('[data-app-view]')).toBeHidden();await expect(page.locator('[data-memory-session-notice]')).toHaveCount(0);
 expect(new URL(page.url()).searchParams.get('draft')).toBe(draft);expect(new URL(page.url()).searchParams.get('returnTo')).toBe(returnTo);
 await signIn();expect(observations.reservationWrites).toEqual([]);expect(observations.preliminaryWrites).toEqual([]);expect(observations.carWrites).toEqual([]);expectNoUnexpectedClientErrors(observations);
});
