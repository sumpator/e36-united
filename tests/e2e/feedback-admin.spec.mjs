import {factoryPreferences} from '../../admin/dashboard-model.js';
import {test,expect} from '@playwright/test';
import {prepareAdminE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';
const headers={'Access-Control-Allow-Origin':'*','Content-Type':'application/json'};
const reply=(route,body)=>route.fulfill({status:200,headers,body:JSON.stringify({...body,...(route.request().headers()['idempotency-key']?{operation:{id:route.request().headers()['idempotency-key'],state:'confirmed',revision:Number(route.request().headers()['if-match'])+2}}:{})})});

test('History and S&S pending badge is visible on desktop/mobile and updates after each review',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  const observations=await prepareAdminE2ePage(page);
  let attendance='pending',sns='pending';
  const counts=()=>({pending:attendance==='pending'||sns==='pending'?1:0,attendancePending:attendance==='pending'?1:0,snsPending:sns==='pending'?1:0,total:1,approved:attendance==='approved'||sns==='approved'?1:0,rejected:0,latestPendingYear:2026,latestYear:2026,latestYearPending:1,olderPending:0});
  await page.route('https://api.e36united.cz/api/admin/summary**',route=>reply(route,{overview:{history:counts(),gallery:{pending:0}},attention:{reservations:0,payments:0,gallery:0,history:counts().pending}}));
  await page.route('https://api.e36united.cz/api/admin/history/claims**',route=>{
    if(route.request().method()==='PATCH'){
      if(route.request().url().endsWith('/attendance'))attendance=route.request().postDataJSON().status;else sns=route.request().postDataJSON().status;
      return reply(route,{ok:true});
    }
    return reply(route,{claims:counts().pending?[{id:'pending-claim',eventYear:2026,member:{name:'Eva',email:'eva@example.test'},attendance:{status:attendance},showShine:{status:sns,competed:true,category:'coupe'},evidence:[]}]:[],counts:counts(),facets:{years:[{year:2026,pending:counts().pending,total:1}]},pagination:{page:1,totalPages:1,total:counts().pending,pageSize:24}});
  });
  await page.goto('/admin.html');
  await expect(page.locator('[data-attention-history]')).toHaveText('1');
  const desktop=page.locator('.admin-section-nav [data-command-badge="community"]');await expect(desktop).toBeVisible();await expect(desktop).toHaveText('1');
  await page.setViewportSize({width:390,height:844});await page.locator('[data-portal-menu-open]').click();
  const mobile=page.locator('.portal-nav-sheet [data-command-badge="community"]');await expect(mobile).toBeVisible();await expect(mobile).toHaveText('1');
  await page.locator('.portal-nav-sheet [data-community-toggle]').click();await page.locator('.portal-nav-sheet [data-admin-jump="club"]').click();
  const card=page.locator('[data-history-id="pending-claim"]');await card.locator('summary').click();
  await card.locator('[data-history-component="attendance"][data-history-action="approved"]').click();
  await expect(page.locator('[data-attention-history]')).toHaveText('1');
  await expect(card).toHaveAttribute('open',''); // Refresh preserves the open review context.
  await card.locator('[data-history-component="sns"][data-history-action="approved"]').click();
  await expect(page.locator('[data-attention-history]')).toHaveText('0');await expect(page.locator('[data-history-summary="pending"]')).toHaveText('0');
  await expect(page.locator('[data-gallery-mode-count="history"]')).toBeHidden();
  await page.locator('[data-portal-menu-open]').click();await expect(mobile).toBeHidden();
  expectNoUnexpectedClientErrors(observations);
});

test('Admin funnel renders forward-only counts and safe operational drill-downs',async({page})=>{
  const observations=await prepareAdminE2ePage(page);
  await page.route('https://api.e36united.cz/api/admin/funnel**',route=>{
    expect(new URL(route.request().url()).searchParams.get('eventId')).toBe('united-2026');
    return reply(route,{counts:{members:10,incomplete:2,created:5,claimed:3,unclaimed:2,converted:1,claimedWithoutReservation:2},details:{incomplete:[{email:'incomplete@example.test',firebase_account_seen_at:'2026-09-07T12:00:00Z'}],unclaimed:[{created_at:'2026-09-07T12:00:00Z',payload_json:JSON.stringify({arrival:'Pátek',departure:'Neděle',crew:2,accommodation:'Stan'})}]}});
  });
  const prefs=factoryPreferences();prefs.compositions.preparation.widgets.push({id:'planner',size:'wide'});
  await page.route('https://api.e36united.cz/api/admin/preferences',route=>reply(route,{preferences:prefs,revision:1,stored:true}));
  await page.goto('/admin.html');const funnel=page.locator('[data-admin-funnel]');
  await expect(funnel.locator('[data-funnel-count="members"]')).toHaveText('10');await expect(funnel.locator('[data-funnel-count="created"]')).toHaveText('5');
  await expect(funnel).toContainText('až od nasazení');await funnel.getByText('Nedokončené registrace · posledních nejvýše 50',{exact:true}).click();await expect(funnel.getByText('incomplete@example.test',{exact:true})).toBeVisible();
  await funnel.getByText('Anonymní nepřiřazené plány · posledních nejvýše 50',{exact:true}).click();await expect(funnel).toContainText('Pátek · Neděle · Stan · 2 osob');
  expectNoUnexpectedClientErrors(observations);
});
