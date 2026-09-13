import { expect, test } from '@playwright/test';
import { expectNoUnexpectedClientErrors, prepareE2ePage } from './fixtures.mjs';

async function closeOnboarding(page) {
  const modal=page.locator('[data-onboarding-intro-modal]');
  await expect(page.locator('[data-app-view]')).toBeVisible();await page.evaluate(()=>new Promise(resolve=>queueMicrotask(resolve)));
  if(await modal.isVisible())await modal.getByRole('button',{name:'Zavřít úvod'}).click();
  await expect(modal).toBeHidden();
}

async function login(page,email='member@example.test') {
  const form=page.locator('[data-auth-form="login"]');
  await expect(form).toBeVisible();await form.locator('[name="email"]').fill(email);await form.locator('[name="password"]').fill('fixture-password');await form.locator('[type="submit"]').click();
  await expect(page.locator('[data-app-view]')).toBeVisible();
}

async function logoutMobile(page) {
  await page.locator('.menu-btn').click();const button=page.locator('.member-main-mobile-logout');await expect(button).toBeVisible();await button.click();await expect(page.locator('[data-auth-view]')).toBeVisible();
}

async function expectReservationGeometry(page) {
  const geometry=await page.evaluate(()=>{const status=document.querySelector('.reservation-status-card')?.getBoundingClientRect(),detail=document.querySelector('.reservation-unified-card')?.getBoundingClientRect(),form=document.querySelector('[data-reservation-form]')?.getBoundingClientRect();return{overflow:document.documentElement.scrollWidth>innerWidth,statusBottom:status?.bottom,detailTop:detail?.top,detailLeft:detail?.left,detailRight:detail?.right,formLeft:form?.left,formRight:form?.right}});
  expect(geometry.overflow).toBe(false);expect(geometry.statusBottom).toBeLessThanOrEqual(geometry.detailTop);expect(geometry.formLeft).toBeGreaterThanOrEqual(geometry.detailLeft);expect(geometry.formRight).toBeLessThanOrEqual(geometry.detailRight);
}

test('NEW MEMBER reservation entry is explicit, responsive and never duplicates an existing reservation',async({page,context},info)=>{
  await page.setViewportSize({width:1440,height:900});
  const observations=await prepareE2ePage(page,{authenticated:true,registrationOpen:true,reservation:null,cars:[]});
  await page.goto('/member.html');await closeOnboarding(page);
  const card=page.locator('[data-reservation-overview-card]');
  await expect(card).toBeVisible();await expect(card.locator('[data-reservation-overview-label]')).toHaveText('Zaregistruj se na sraz');await expect(card.locator('[data-reservation-overview-copy]')).toHaveText('Vyber příjezd, posádku, Show & Shine a případné ubytování.');await expect(card.locator('[data-reservation-overview-action]')).toContainText('Vytvořit rezervaci');
  await expect(page.locator('.member-sidebar [data-member-section="reservation"]')).toContainText('Rezervace');await expect(page.locator('.member-sidebar [data-member-section="reservation"]')).toContainText('Sraz & ubytování');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('new-member-overview-desktop.png'),fullPage:true});
  await card.click();const anchor=page.locator('[data-reservation-form-anchor]');await expect(page.locator('[data-member-panel="reservation"]')).toBeVisible();await expect(anchor).toBeFocused();await expect(anchor).toBeInViewport();await expect(page.locator('[data-reservation-state-label]')).toHaveText('REGISTRACE JE OTEVŘENÁ');await expect(page.locator('[data-reservation-description]')).toHaveText('Vyber příjezd, posádku, Show & Shine a případné ubytování.');await expectReservationGeometry(page);
  await page.screenshot({path:info.outputPath('new-member-reservation-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await expect(page.locator('button[data-main-member-section="reservation"]')).toHaveText('Rezervace');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.locator('.member-sidebar [data-member-section="overview"]').click();await page.screenshot({path:info.outputPath('new-member-overview-mobile-390.png'),fullPage:true});await card.click();await expect(anchor).toBeFocused();await expectReservationGeometry(page);await page.screenshot({path:info.outputPath('new-member-reservation-mobile-390.png'),fullPage:true});
  await page.locator('.member-sidebar [data-member-section="garage"]').click();await page.locator('[data-open-car]').click();const carForm=page.locator('[data-car-form]');await expect(page.locator('.image-upload-recommendation')).toHaveText('Fotografie není povinná, ale doporučujeme ji nahrát.');await carForm.locator('[name="nickname"]').fill('Bez fotky');await carForm.locator('[name="model"]').fill('316i');await carForm.locator('[type="submit"]').click();await expect.poll(()=>observations.carWrites.length).toBe(1);await expect(page.locator('[data-car-modal]')).toBeHidden();expect(observations.requests.some(value=>/\/photos$/.test(value))).toBe(false);

  const closed=await context.newPage();const closedObservations=await prepareE2ePage(closed,{authenticated:true,registrationOpen:false,reservation:null,cars:[]});await closed.goto('/member.html');await closeOnboarding(closed);const closedCard=closed.locator('[data-reservation-overview-card]');await expect(closedCard.locator('[data-reservation-overview-label]')).toHaveText('Registrace na sraz je nyní uzavřená');await expect(closedCard.locator('[data-reservation-overview-copy]')).toHaveText('Rezervaci si můžeš připravit. Odeslat ji půjde po otevření registrace.');await expect(closedCard.locator('[data-reservation-overview-action]')).toContainText('Připravit rezervaci');await closedCard.click();await expect(closed.locator('[data-reservation-form] [name="note"]')).toBeEnabled();await closed.locator('[data-reservation-form] [name="note"]').fill('Připraveno lokálně');await closed.locator('[data-reservation-submit]').click();await expect(closed.locator('[data-reservation-form-status]')).toContainText('Odeslat ji půjde po otevření registrace.');expect(closedObservations.reservationWrites).toEqual([]);expectNoUnexpectedClientErrors(closedObservations);await closed.close();

  const existing=await context.newPage();const existingObservations=await prepareE2ePage(existing,{authenticated:true,registrationOpen:true,reservation:{id:'existing',eventId:'united-2026',eventYear:2026,title:'E36 United 2026',arrival:'Pátek',crew:2,accommodation:'Bez ubytování',accommodationUnits:0,showShine:'Ne',note:'',status:'pending'},cars:[]});await existing.goto('/member.html');await closeOnboarding(existing);const existingCard=existing.locator('[data-reservation-overview-card]');await expect(existingCard).toContainText('ČEKÁ NA SCHVÁLENÍ');await expect(existingCard).toContainText('Otevřít rezervaci');await expect(existingCard).not.toContainText('Vytvořit rezervaci');await expect(existingCard).not.toHaveAttribute('data-reservation-form-jump','');expectNoUnexpectedClientErrors(existingObservations);await existing.close();
  expectNoUnexpectedClientErrors(observations);
});

test('NEW MEMBER account switch never carries a private reservation note to another UID',async({page})=>{
  await page.setViewportSize({width:390,height:844});const observations=await prepareE2ePage(page,{authenticated:true,registrationOpen:true,reservation:null,cars:[],member:{id:'member-a',email:'a@example.test',name:'Member A',nickname:'A'}});
  await page.goto('/member.html');await closeOnboarding(page);await page.locator('[data-reservation-overview-card]').click();const note=page.locator('[data-reservation-form] [name="note"]');await note.fill('PŘIJEDE NÁS 6');await page.evaluate(()=>localStorage.setItem('e36UnitedReservationDraftV20',JSON.stringify({note:'PŘIJEDE NÁS 6'})));await logoutMobile(page);
  await observations.switchMember({id:'member-b',email:'b@example.test',name:'Member B',nickname:'B'});await login(page,'b@example.test');await closeOnboarding(page);await page.locator('.menu-btn').click();await page.locator('[data-main-member-section="reservation"]').click();await expect(note).toHaveValue('');await note.fill('POZNÁMKA B');
  await logoutMobile(page);await observations.switchMember({id:'member-a',email:'a@example.test',name:'Member A',nickname:'A'});await login(page,'a@example.test');await closeOnboarding(page);await page.locator('.menu-btn').click();await page.locator('[data-main-member-section="reservation"]').click();await expect(note).toHaveValue('');expect(observations.reservationWrites).toEqual([]);expectNoUnexpectedClientErrors(observations);
});
