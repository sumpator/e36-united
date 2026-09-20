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

async function closePlanner(page,{discardChanges=false}={}) {
  const modal=page.locator('[data-member-planner-modal]'),close=modal.getByRole('button',{name:'Zavřít Weekend Planner'});
  let discardMessage='';
  if(discardChanges)page.once('dialog',async dialog=>{discardMessage=dialog.message();await dialog.accept()});
  await close.click();
  if(discardChanges)expect(discardMessage).toBe('Zahodit neuložené změny plánu?');
  await expect(modal).toBeHidden();await expect(page.locator('html')).not.toHaveClass(/reservation-change-planner-open/);await expect(page.locator('body')).not.toHaveClass(/reservation-change-planner-open/);
}

async function expectReservationGeometry(page) {
  const geometry=await page.evaluate(()=>{const dialog=document.querySelector('.reservation-change-planner-dialog')?.getBoundingClientRect(),form=document.querySelector('[data-reservation-form]')?.getBoundingClientRect();return{overflow:document.documentElement.scrollWidth>innerWidth,viewportWidth:innerWidth,dialogLeft:dialog?.left,dialogRight:dialog?.right,formLeft:form?.left,formRight:form?.right}});
  expect(geometry.overflow).toBe(false);expect(geometry.dialogLeft).toBeGreaterThanOrEqual(0);expect(geometry.dialogRight).toBeLessThanOrEqual(geometry.viewportWidth);expect(geometry.formLeft).toBeGreaterThanOrEqual(geometry.dialogLeft);expect(geometry.formRight).toBeLessThanOrEqual(geometry.dialogRight);
}

test('NEW MEMBER reservation entry is explicit, responsive and never duplicates an existing reservation',async({page,context},info)=>{
  await page.setViewportSize({width:1440,height:900});
  const observations=await prepareE2ePage(page,{authenticated:true,registrationOpen:true,reservation:null,cars:[]});
  await page.goto('/member.html');await closeOnboarding(page);
  const card=page.locator('[data-reservation-overview-card]');
  await expect(card).toBeVisible();await expect(card.locator('[data-reservation-overview-label]')).toHaveText('Zaregistruj se na sraz');await expect(card.locator('[data-reservation-overview-copy]')).toHaveText('Vyber příjezd, posádku, Show & Shine a případné ubytování.');await expect(card.locator('[data-reservation-overview-action]')).toContainText('Vytvořit rezervaci');
  await expect(page.locator('.member-sidebar [data-member-section="reservation"]')).toContainText('Rezervace');await expect(page.locator('.member-sidebar [data-member-section="reservation"]')).toContainText('Sraz & ubytování');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('new-member-overview-desktop.png'),fullPage:true});
  await card.click();const entry=page.locator('[data-member-planner-title]');await expect(page.locator('[data-member-panel="reservation"]')).toBeVisible();await expect(entry).toBeFocused();await expect(entry).toBeInViewport();await expect(page.locator('[data-reservation-state-label]')).toHaveText('REGISTRACE JE OTEVŘENÁ');await expect(page.locator('[data-reservation-description]')).toHaveText('Vyber příjezd, posádku, Show & Shine a případné ubytování.');await expectReservationGeometry(page);
  await page.screenshot({path:info.outputPath('new-member-reservation-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await expect(page.locator('button[data-main-member-section="reservation"]')).toHaveText('Rezervace');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await closePlanner(page);await page.locator('.member-sidebar [data-member-section="overview"]').click();await page.screenshot({path:info.outputPath('new-member-overview-mobile-390.png'),fullPage:true});await card.click();await expect(entry).toBeFocused();await expectReservationGeometry(page);await page.screenshot({path:info.outputPath('new-member-reservation-mobile-390.png'),fullPage:true});
  await closePlanner(page);await page.locator('.member-sidebar [data-member-section="garage"]').click();await page.locator('[data-open-car]').click();const carForm=page.locator('[data-car-form]');await expect(page.locator('.image-upload-recommendation')).toHaveText('Fotografie není povinná, ale doporučujeme ji nahrát.');await carForm.locator('[name="nickname"]').fill('Bez fotky');await carForm.locator('[name="model"]').fill('316i');await carForm.locator('[type="submit"]').click();await expect.poll(()=>observations.carWrites.length).toBe(1);await expect(page.locator('[data-car-modal]')).toBeHidden();expect(observations.requests.some(value=>/\/photos$/.test(value))).toBe(false);

  const closed=await context.newPage();const closedObservations=await prepareE2ePage(closed,{authenticated:true,registrationOpen:false,preliminaryEnabled:true,reservation:null,cars:[]});await closed.goto('/member.html');await closeOnboarding(closed);const closedCard=closed.locator('[data-reservation-overview-card]');await expect(closedCard.locator('[data-reservation-overview-label]')).toHaveText('Připrav si svůj United');await expect(closedCard.locator('[data-reservation-overview-copy]')).toHaveText('Ulož nezávazný plán bez rezervace kapacity.');await expect(closedCard.locator('[data-reservation-overview-action]')).toContainText('Připravit plán');await closedCard.click();await expect(closed.locator('[data-reservation-form] [name="note"]')).toBeEnabled();await closed.locator('[data-reservation-form] [name="arrival"]').selectOption('Jen na otočku');await closed.locator('[data-reservation-form] [name="note"]').fill('Připraveno lokálně');await closed.locator('[data-reservation-submit]').click();await expect(closed.locator('[data-reservation-form-status]')).toContainText('Tvůj plán máme. Jakmile spustíme rezervace, dáme ti vědět.');expect(closedObservations.reservationWrites).toEqual([]);expect(closedObservations.preliminaryWrites).toHaveLength(1);expectNoUnexpectedClientErrors(closedObservations);await closed.close();

  const existing=await context.newPage();const existingObservations=await prepareE2ePage(existing,{authenticated:true,registrationOpen:true,reservation:{id:'existing',eventId:'united-2026',eventYear:2026,title:'E36 United 2026',arrival:'Pátek',crew:2,accommodation:'Bez ubytování',accommodationUnits:0,showShine:'Ne',note:'',status:'pending'},cars:[]});await existing.goto('/member.html');await closeOnboarding(existing);const existingCard=existing.locator('[data-reservation-overview-card]');await expect(existingCard).toContainText('ČEKÁ NA SCHVÁLENÍ');await expect(existingCard).toContainText('Otevřít rezervaci');await expect(existingCard).not.toContainText('Vytvořit rezervaci');await expect(existingCard).not.toHaveAttribute('data-reservation-form-jump','');expectNoUnexpectedClientErrors(existingObservations);await existing.close();
  expectNoUnexpectedClientErrors(observations);
});

test('NEW MEMBER account switch never carries a private reservation note to another UID',async({page})=>{
  await page.setViewportSize({width:390,height:844});const observations=await prepareE2ePage(page,{authenticated:true,registrationOpen:true,reservation:null,cars:[],member:{id:'member-a',email:'a@example.test',name:'Member A',nickname:'A'}});
  await page.goto('/member.html');await closeOnboarding(page);await page.locator('[data-reservation-overview-card]').click();const modal=page.locator('[data-member-planner-modal]'),note=page.locator('[data-reservation-form] [name="note"]'),close=modal.getByRole('button',{name:'Zavřít Weekend Planner'});await note.fill('PŘIJEDE NÁS 6');await page.evaluate(()=>localStorage.setItem('e36UnitedReservationDraftV20',JSON.stringify({note:'PŘIJEDE NÁS 6'})));let discardMessage='';page.once('dialog',async dialog=>{discardMessage=dialog.message();await dialog.dismiss()});await close.click();expect(discardMessage).toBe('Zahodit neuložené změny plánu?');await expect(modal).toBeVisible();await expect(note).toHaveValue('PŘIJEDE NÁS 6');await closePlanner(page,{discardChanges:true});await expect(note).toHaveValue('PŘIJEDE NÁS 6');await logoutMobile(page);await expect(modal).toBeHidden();await expect(note).toHaveValue('');
  await observations.switchMember({id:'member-b',email:'b@example.test',name:'Member B',nickname:'B'});await login(page,'b@example.test');await closeOnboarding(page);await page.locator('.menu-btn').click();await page.locator('[data-main-member-section="reservation"]').click();await page.locator('[data-member-plan-open]').click();await expect(modal).toBeVisible();await expect(note).toHaveValue('');await note.fill('POZNÁMKA B');
  await closePlanner(page,{discardChanges:true});await expect(note).toHaveValue('POZNÁMKA B');await logoutMobile(page);await expect(modal).toBeHidden();await expect(note).toHaveValue('');await observations.switchMember({id:'member-a',email:'a@example.test',name:'Member A',nickname:'A'});await login(page,'a@example.test');await closeOnboarding(page);await page.locator('.menu-btn').click();await page.locator('[data-main-member-section="reservation"]').click();await page.locator('[data-member-plan-open]').click();await expect(modal).toBeVisible();await expect(note).toHaveValue('');expect(observations.reservationWrites).toEqual([]);expectNoUnexpectedClientErrors(observations);
});
