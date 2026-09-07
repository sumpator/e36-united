import {test,expect} from '@playwright/test';
import {prepareE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';
test.use({viewport:{width:390,height:844}});
const headers={'Access-Control-Allow-Origin':'*','Content-Type':'application/json'};
const reply=(route,body,status=200)=>route.fulfill({status,headers,body:JSON.stringify(body)});
async function login(page){
  const form=page.locator('[data-auth-form="login"]');
  await expect(form).toBeVisible();await form.locator('[name=email]').fill('eva@example.test');await form.locator('[name=password]').fill('fixture-password');
  await form.locator('[type=submit]').click();await expect(page.locator('[data-app-view]')).toBeVisible();
}

test('login retains canonical target, reload restores it, and invalid links fall back safely',async({page})=>{
  const observations=await prepareE2ePage(page);
  await page.goto('/member.html?section=garage');await login(page);
  await expect(page.locator('[data-member-panel="garage"]')).toBeVisible();await page.reload();
  await expect(page.locator('[data-member-panel="garage"]')).toBeVisible();
  for(const section of ['photos','reservation','payments','club','account']){
    await page.goto(`/member.html?section=${section}`);await expect(page.locator(`[data-member-panel="${section}"]`)).toBeVisible();
  }
  await page.goto('/member.html?section=invalid');await expect(page.locator('[data-member-panel="overview"]')).toBeVisible();
  expectNoUnexpectedClientErrors(observations);
});

test('one final public Planner click hands off in the same tab through login to the transferred plan',async({page,context})=>{
  const observations=await prepareE2ePage(page);let tracked=null;
  await page.route('https://api.e36united.cz/api/planner-handoffs',async route=>{tracked=route.request().postDataJSON().draft;await reply(route,{ok:true})});
  await page.goto('/#planer');await expect(page.locator('[data-accommodation-option-id="cabin-standard"]')).toBeVisible();
  await page.locator('[data-planner-mail]').click();await page.locator('[data-planner-login]').click();
  await expect(page).toHaveURL(/member.html\?mode=login&section=reservation&draft=/);
  await login(page);await expect(page.locator('[data-member-panel="reservation"]')).toBeVisible();
  await expect(page.locator('[data-planner-handoff]')).toBeVisible();await expect(page.locator('[data-planner-handoff-recap]')).toContainText('Pátek');
  expect(context.pages()).toHaveLength(1);await expect.poll(()=>tracked?.draftId).toBeTruthy();
  expect(new URL(page.url()).searchParams.get('draft')).toBe(tracked.draftId);
  expect(observations.requests).toContain('POST /api/planner-handoffs/claim');
  await page.reload();await expect(page.locator('[data-planner-handoff]')).toBeVisible();
  expectNoUnexpectedClientErrors(observations);
});

test('secondary reservation failure opens shell with unavailable state and manual retry recovers',async({page})=>{
  const observations=await prepareE2ePage(page,{authenticated:true,ignoreConsoleError:entry=>entry.url.includes('/api/reservations/current')&&entry.text.includes('503')});
  let calls=0,failed=true;
  await page.route('https://api.e36united.cz/api/reservations/current',async route=>{
    calls++;if(failed)return reply(route,{error:'temporary'},503);return route.fallback();
  });
  await page.goto('/member.html?section=reservation');
  const state=page.locator('[data-member-panel="reservation"] [data-domain-retry-state="reservation"]');
  await expect(state).toBeVisible();expect(calls).toBe(2);await expect(page.locator('[data-auth-view]')).toBeHidden();
  failed=false;await state.getByRole('button',{name:'Zkusit znovu'}).click();await expect(state).toHaveCount(0);
  await expect(page.locator('[data-reservation-section] .member-section-head')).toBeVisible();
  expectNoUnexpectedClientErrors(observations);
});

test('storage-restricted handoff survives login and reload through its URL fallback',async({page})=>{
  const observations=await prepareE2ePage(page);
  await page.addInitScript(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('e36UnitedPlannerHandoff:'))throw new DOMException('storage unavailable','QuotaExceededError');return original.call(this,key,value)}});
  const now=Date.now(),draftId='11111111-1111-4111-8111-111111111111';
  const draft={version:1,draftId,source:'weekend-planner',eventId:'united-2026',eventYear:2026,createdAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+86400000).toISOString(),arrival:'Pátek',departure:'Neděle',nights:2,attendanceType:'full_weekend',accommodation:'Bez ubytování',accommodationOptionId:null,accommodationUnits:0,crew:2,showShine:'Ne'};
  await page.goto(`/member.html?section=reservation&draft=${draftId}#handoff=${Buffer.from(JSON.stringify(draft)).toString('base64url')}`);
  await login(page);await expect(page.locator('[data-planner-handoff]')).toBeVisible();await expect(page).toHaveURL(/#handoff=/);
  await page.reload();await expect(page.locator('[data-member-panel="reservation"]')).toBeVisible();await expect(page.locator('[data-planner-handoff]')).toBeVisible();
  expectNoUnexpectedClientErrors(observations);
});

test('a transient Club read retries once and restores without an unavailable or login loop',async({page})=>{
  const observations=await prepareE2ePage(page,{authenticated:true});let calls=0;
  await page.route('https://api.e36united.cz/api/united-club',async route=>{if(++calls===1)return route.abort('failed');return route.fallback()});
  await page.goto('/member.html?section=club');await expect(page.locator('[data-member-panel="club"]')).toBeVisible();
  await expect(page.locator('[data-domain-retry-state]')).toHaveCount(0);expect(calls).toBe(2);
  expect(observations.pageErrors).toEqual([]);expect(observations.unhandledApi).toEqual([]);
});

test('registration keeps its section and session without sending verification email',async({page})=>{
  const observations=await prepareE2ePage(page);
  await page.goto('/member.html?mode=register&section=account');
  const form=page.locator('[data-auth-form="register"]');await expect(form).toBeVisible();
  await form.locator('[name=name]').fill('Eva Nováková');await form.locator('[name=email]').fill('eva@example.test');
  await form.locator('[name=password]').fill('fixture-password');await form.locator('[name=passwordConfirm]').fill('fixture-password');await form.locator('[type=checkbox]').check();
  await form.locator('[type=submit]').click();await expect(page.locator('[data-member-panel="account"]')).toBeVisible();
  expect(observations.requests).toContain('POST /api/onboarding');await page.reload();await expect(page.locator('[data-member-panel="account"]')).toBeVisible();
  expectNoUnexpectedClientErrors(observations);
});

test('photo upload failure clears busy state and retry uses the same car and succeeds',async({page})=>{
  const observations=await prepareE2ePage(page,{authenticated:true,ignoreConsoleError:entry=>entry.url.includes('/photos')&&entry.text.includes('503')});
  let uploads=0;
  await page.route('https://api.e36united.cz/api/cars/car-001',route=>reply(route,{ok:true}));
  await page.route('https://api.e36united.cz/api/cars/car-001/photos',async route=>{
    uploads++;expect(route.request().method()).toBe('PUT');expect(route.request().postDataBuffer().toString()).toContain('image/jpeg');
    return reply(route,uploads===1?{error:'upload_down'}:{ok:true},uploads===1?503:200);
  });
  await page.goto('/member.html?section=garage');await page.locator('[data-edit-car="car-001"]').click();
  await page.locator('[data-car-photo-input]').setInputFiles({name:'car.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=','base64')});
  const submit=page.locator('[data-car-submit]');await submit.click();await expect.poll(()=>uploads).toBe(1);await expect(submit).toBeEnabled();await expect(page.locator('[data-car-modal]')).toBeVisible();
  await expect(page.locator('[data-toast]')).toContainText('Zkus Uložit znovu');
  await submit.click();await expect(page.locator('[data-car-modal]')).toBeHidden();expect(uploads).toBe(2);
  expect(observations.requests).not.toContain('POST /api/cars');expectNoUnexpectedClientErrors(observations);
});
