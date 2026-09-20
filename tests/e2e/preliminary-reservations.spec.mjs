import {test,expect} from '@playwright/test';
import {prepareE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';
import {commandFixture} from './command-fixture.mjs';
import {memberRuntime} from '../helpers/admin-member-runtime.mjs';
import {getPreliminaryReservation,putPreliminaryReservation,cancelPreliminaryReservation,listAdminPreliminaryReservations,savePreliminarySettings} from '../../worker/domains/reservations/preliminary.js';
import {getCurrentReservation,putCurrentReservation} from '../../worker/domains/reservations/index.js';
const origin='https://e36united.cz';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'GET,PUT,DELETE,OPTIONS','Content-Type':'application/json'};
const incoming=q=>new Request(q.url(),{method:q.method(),headers:q.headers(),...(q.method()==='GET'?{}:{body:q.postData()})});
const fulfill=async(route,response)=>route.fulfill({status:response.status,headers,body:await response.text()});
const stableScroll=page=>page.evaluate(()=>new Promise(resolve=>{let previous=scrollY,stable=0;const frame=()=>{const current=scrollY;stable=Math.abs(current-previous)<.5?stable+1:0;previous=current;if(stable>=8)resolve(current);else requestAnimationFrame(frame)};requestAnimationFrame(frame)}));

for(const width of [1440,390])test(`PLAN shared modal saves without a car and survives a new session ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});
 const observations=await prepareE2ePage(page,{authenticated:true,registrationOpen:false,cars:[]});
 const r=memberRuntime();r.db.exec("DELETE FROM reservations;DELETE FROM preliminary_reservations;UPDATE events SET id='united-2026',registration_status='closed' WHERE id='e';INSERT INTO event_preliminary_settings(event_id,enabled,write_token) VALUES('united-2026',1,'fixture')");
 let serverDraft=null;
 await page.route('https://api.e36united.cz/api/planner-draft**',route=>route.fulfill({status:200,headers,json:{ok:true,draft:route.request().method()==='GET'?serverDraft:null,deleted:route.request().method()==='DELETE'}}));
 await page.route('https://api.e36united.cz/api/{preliminary-reservations,reservations}/current',async route=>{
 const q=route.request();if(q.method()==='OPTIONS')return route.fulfill({status:204,headers});
 const prelim=q.url().includes('/preliminary-reservations/');
  if(!prelim&&q.method()==='GET')return route.fallback();
  const response=prelim?(q.method()==='GET'?await getPreliminaryReservation(r.env,{uid:'m'},origin):q.method()==='DELETE'?await cancelPreliminaryReservation(incoming(q),r.env,{uid:'m'},origin):await putPreliminaryReservation(incoming(q),r.env,{uid:'m'},origin)):
   q.method()==='GET'?await getCurrentReservation(r.env,{uid:'m'},origin):await putCurrentReservation(incoming(q),r.env,{uid:'m'},origin);
  await fulfill(route,response);
 });
 const open=async()=>{await page.goto('/member.html?section=reservation');await expect(page.locator('[data-app-view]')).toBeVisible();const intro=page.locator('[data-onboarding-intro-modal]');if(await intro.isVisible())await intro.getByRole('button',{name:'Zavřít úvod'}).click();await expect(intro).toBeHidden();};
 await open();const modal=page.locator('[data-member-planner-modal]'),form=modal.locator('[data-reservation-form]'),submit=form.locator('[data-reservation-submit]');
 await expect(page.locator('[data-reservation-status-card], .reservation-status-card')).toContainText('Zatím přijímáme předběžné registrace.');await expect(page.locator('[data-preliminary-detail]')).toBeVisible();await page.locator('[data-member-plan-open]').click();await expect(modal).toBeVisible();
 await expect(submit).toContainText('Uložit předběžnou registraci');await expect(form.locator('[name="carId"]')).toHaveValue('');
 const plannerAddCar=modal.locator('[data-member-planner-add-car]');await expect(plannerAddCar).toBeVisible();await expect(plannerAddCar).toHaveText('+ Přidat auto');await expect(plannerAddCar).toHaveCSS('background-color','rgb(22, 77, 124)');await expect(modal).not.toContainText(/Auto doplníš později|Doplníš později/);
 if(width===1440){await plannerAddCar.click();const carModal=page.locator('[data-car-modal]');await expect(carModal).toBeVisible();await carModal.getByRole('button',{name:'Zavřít formulář auta'}).click();await expect(carModal).toBeHidden();await expect(modal).toBeVisible()}
 if(width===390){const box=await form.boundingBox(),right=390-(box.x+box.width);expect(box.x).toBeGreaterThanOrEqual(10);expect(box.x).toBeLessThanOrEqual(12);expect(right).toBeGreaterThanOrEqual(10);expect(right).toBeLessThanOrEqual(12)}
 await modal.locator('[data-member-stay="0"]').click();await modal.locator('[data-member-sleep="Chatka"]').click();await form.locator('[name="accommodationOptionId"]').selectOption('cabin-standard');
 const sleepStep=modal.locator('.planner-step--sleep'),optionSlot=modal.locator('[data-member-accommodation-option-slot]'),previewSlot=modal.locator('[data-member-accommodation-preview-slot]');await expect(previewSlot.locator('[data-member-accommodation-gallery]')).toBeVisible();await expect(previewSlot.locator('img')).toHaveAttribute('src',/cabin-standard/);
 const optionBox=await optionSlot.boundingBox(),previewBox=await previewSlot.boundingBox();if(width===1440)expect(previewBox.x).toBeGreaterThan(optionBox.x+optionBox.width-1);else expect(previewBox.y).toBeGreaterThan(optionBox.y+optionBox.height-1);
 if(process.env.E36_REVIEW_SCREENSHOTS)await sleepStep.screenshot({path:`docs/review/member-plan-chatka-${width}.png`});
 await modal.locator('[data-member-stay="2"]').click();
 await expect(modal.locator('[data-member-stay-image]')).toHaveAttribute('src','assets/images/program/sunday.jpg');
 await modal.locator('[data-member-show="Ano"]').click();await expect(modal.locator('[data-member-show-image]')).toHaveAttribute('src','pohary.jpg');
 await modal.locator('[data-member-show="Možná"]').click();await expect(modal.locator('[data-member-show-image]')).toHaveAttribute('src','assets/images/program/friday.webp');await form.locator('[name="note"]').fill('Zájem bez závazku');await expect(form.locator('[name="preliminaryCrewDetails"]')).toBeHidden();
 await submit.click();await expect(modal).toBeHidden();await expect(page.locator('[data-preliminary-copy]')).toHaveText('Až otevřeme registrace, dáme Ti vědět a registraci dokončíš.');await expect(page.locator('[data-member-plan-disclaimer]')).toHaveText('Nezávazná · bez zajištěné kapacity.');await expect(page.locator('[data-reservation-summary]>div')).toHaveCount(5);
 const noCarAction=page.locator('[data-registration-car-action]');await expect(noCarAction).toContainText('S čím přijedeš?');await expect(noCarAction).toContainText('+ Přidat auto');await expect(noCarAction).toHaveCSS('background-color','rgb(22, 77, 124)');
 expect(r.db.prepare('SELECT COUNT(*) n FROM reservations').get().n).toBe(0);expect(r.db.prepare('SELECT COUNT(*) n FROM member_qr_identities').get().n).toBe(0);
 expect(JSON.parse(r.db.prepare('SELECT preferences_json FROM preliminary_reservations').get().preferences_json).carId).toBeNull();if(width===1440&&process.env.E36_REVIEW_SCREENSHOTS)await page.locator('.reservation-unified-card').screenshot({path:'docs/review/member-registration-no-car-cta.png'});
 await page.reload();await expect(page.locator('[data-preliminary-copy]')).toHaveText('Až otevřeme registrace, dáme Ti vědět a registraci dokončíš.');const editPlan=page.locator('[data-member-plan-open]');await stableScroll(page);
 if(width===390){await page.locator('[data-preliminary-add-car]').click();const carModal=page.locator('[data-car-modal]'),carForm=carModal.locator('[data-car-form]');await expect(carModal).toBeVisible();await carForm.locator('[name="nickname"]').fill('Planner E36');await carForm.locator('[name="model"]').fill('318is');await carForm.locator('[type="submit"]').click();await expect(carModal).toBeHidden();await expect(modal).toBeVisible();await expect(form.locator('[name="note"]')).toHaveValue('Zájem bez závazku');await expect(form.locator('[name="carId"] option')).toHaveCount(2)}else await editPlan.click();
 await expect(submit).toContainText('Uložit změny');
 if(width===390){const clickScroll=await stableScroll(page);await form.locator('[name="note"]').fill('Neuložená změna');page.once('dialog',dialog=>dialog.accept());await modal.getByRole('button',{name:'Zavřít Weekend Planner'}).click();await expect(modal).toBeHidden();await expect(editPlan).toBeFocused();expect(Math.abs(await stableScroll(page)-clickScroll)).toBeLessThanOrEqual(1);await editPlan.click()}
 await form.locator('[name="note"]').fill('Upravený zájem');await submit.click();await expect(page.locator('[data-preliminary-copy]')).toHaveText('Až otevřeme registrace, dáme Ti vědět a registraci dokončíš.');
 await expect.poll(()=>JSON.parse(r.db.prepare('SELECT preferences_json FROM preliminary_reservations').get().preferences_json).note).toBe('Upravený zájem');
 expect(r.db.prepare('SELECT COUNT(*) n FROM preliminary_reservations').get().n).toBe(1);page.once('dialog',dialog=>dialog.accept());await page.locator('[data-preliminary-cancel]').click();await expect(page.locator('[data-member-plan-title]')).toHaveText('Registruj se na United');expect(r.db.prepare('SELECT status FROM preliminary_reservations').get().status).toBe('cancelled');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expectNoUnexpectedClientErrors(observations);await page.close();r.db.close();
});

test('PLAN handoff never overwrites silently and open registration keeps failed conversion active',async({page})=>{
 const observations=await prepareE2ePage(page,{authenticated:true,registrationOpen:false,cars:[]}),r=memberRuntime();r.db.exec("DELETE FROM reservations;DELETE FROM preliminary_reservations;UPDATE events SET registration_status='closed' WHERE id='e';INSERT INTO event_preliminary_settings(event_id,enabled,write_token) VALUES('e',1,'fixture')");
 const handoff={version:1,source:'weekend-planner',draftId:'11111111-1111-4111-8111-111111111111',eventId:'e',eventYear:2026,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),arrival:'Pátek',departure:'Neděle',nights:2,attendanceType:'full_weekend',crew:1,accommodation:'Bez ubytování',accommodationUnits:0,showShine:'Ano'};let serverDraft=handoff;
 const active={eventId:'e',revision:0,carId:null,arrival:'Pátek',crew:1,crewDetails:[],accommodation:'Bez ubytování',accommodationOptionId:null,accommodationUnits:0,showShine:'Ne',note:'Původní plán'};await putPreliminaryReservation(new Request('https://api.e36united.cz/api/preliminary-reservations/current',{method:'PUT',body:JSON.stringify(active)}),r.env,{uid:'m'},origin);
 await page.route('https://api.e36united.cz/api/planner-draft**',route=>{if(route.request().method()==='DELETE')serverDraft=null;return route.fulfill({status:200,headers,json:{ok:true,draft:route.request().method()==='GET'?serverDraft:null}})});
 await page.route('https://api.e36united.cz/api/{preliminary-reservations,reservations}/current',async route=>{const q=route.request();if(q.method()==='OPTIONS')return route.fulfill({status:204,headers});const prelim=q.url().includes('/preliminary-reservations/'),response=prelim?(q.method()==='GET'?await getPreliminaryReservation(r.env,{uid:'m'},origin):await putPreliminaryReservation(incoming(q),r.env,{uid:'m'},origin)):q.method()==='GET'?await getCurrentReservation(r.env,{uid:'m'},origin):await putCurrentReservation(incoming(q),r.env,{uid:'m'},origin);await fulfill(route,response)});
 await page.goto('/member.html?section=reservation');const intro=page.locator('[data-onboarding-intro-modal]');await expect(intro).toBeVisible();await intro.getByRole('button',{name:'Zavřít úvod'}).click();await expect(intro).toBeHidden();
 await expect(page.locator('[data-planner-handoff-decision]')).toBeVisible();expect(JSON.parse(r.db.prepare('SELECT preferences_json FROM preliminary_reservations').get().preferences_json).note).toBe('Původní plán');
 await page.locator('[data-planner-handoff-use]').click();const modal=page.locator('[data-member-planner-modal]');await expect(modal).toBeVisible();await expect(modal.locator('[name="showshine"]')).toHaveValue('Ano');expect(r.db.prepare('SELECT COUNT(*) n FROM preliminary_reservations').get().n).toBe(1);
 await modal.locator('[data-reservation-submit]').click();await expect(modal).toBeHidden();expect(serverDraft).toBeNull();expect(r.db.prepare('SELECT COUNT(*) n FROM preliminary_reservations').get().n).toBe(1);
 r.db.exec("UPDATE events SET registration_status='open' WHERE id='e'");await page.reload();await expect(page.locator('[data-planner-handoff]')).toBeHidden();await expect(page.locator('[data-preliminary-copy]')).toHaveText('Registrace jsou otevřené.');if(process.env.E36_REVIEW_SCREENSHOTS)await page.screenshot({path:'docs/review/member-plan-registration-open-desktop.png',fullPage:true});
 await page.locator('[data-member-plan-open]').click();await expect(modal.locator('[data-reservation-submit]')).toContainText('Odeslat ke schválení');await modal.locator('[data-reservation-submit]').click();await expect(modal.locator('[data-reservation-form-status]')).toContainText('Nejdřív přidej auto');
 expect(r.db.prepare("SELECT status FROM preliminary_reservations").get().status).toBe('active');expect(r.db.prepare('SELECT COUNT(*) n FROM reservations').get().n).toBe(0);expectNoUnexpectedClientErrors(observations);await page.close();r.db.close();
});

test('PLAN handoff stays a draft until an explicit save creates the active plan',async({page})=>{
 const observations=await prepareE2ePage(page,{authenticated:true,registrationOpen:false,preliminaryEnabled:true,cars:[]});
 const handoff={version:1,source:'weekend-planner',draftId:'22222222-2222-4222-8222-222222222222',eventId:'united-2026',eventYear:2026,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),arrival:'Pátek',departure:'Neděle',nights:2,attendanceType:'full_weekend',crew:1,accommodation:'Bez ubytování',accommodationUnits:0,showShine:'Ano'};
 await page.route('https://api.e36united.cz/api/planner-draft**',route=>route.fulfill({status:200,headers,json:{ok:true,draft:handoff}}));
 await page.goto(`/member.html?section=reservation&draft=${handoff.draftId}`);const intro=page.locator('[data-onboarding-intro-modal]');await expect(intro).toBeVisible();await intro.getByRole('button',{name:'Zavřít úvod'}).click();await expect(intro).toBeHidden();
 const banner=page.locator('[data-planner-handoff]');await expect(banner).toBeVisible();await expect(banner.locator('[data-planner-handoff-title]')).toHaveText('DOKONČI PŘEDBĚŽNOU REGISTRACI');const save=page.locator('[data-planner-handoff-continue]');await expect(save).toBeEnabled();await expect(save).toContainText('Pokračovat');expect(observations.preliminaryWrites).toHaveLength(0);
 await save.click();const modal=page.locator('[data-member-planner-modal]');await expect(modal).toBeVisible();await modal.locator('[data-reservation-submit]').click();await expect(modal).toBeHidden();await expect(page.locator('[data-preliminary-copy]')).toHaveText('Až otevřeme registrace, dáme Ti vědět a registraci dokončíš.');expect(observations.preliminaryWrites).toHaveLength(1);expect(observations.reservationWrites).toHaveLength(0);expectNoUnexpectedClientErrors(observations);await page.close();
});

test('PLAN disabled configuration never presents a draft as saved',async({page})=>{
 const observations=await prepareE2ePage(page,{authenticated:true,registrationOpen:false,cars:[]});await page.goto('/member.html?section=reservation');const intro=page.locator('[data-onboarding-intro-modal]');await expect(intro).toBeVisible();await intro.getByRole('button',{name:'Zavřít úvod'}).click();
 const state=page.locator('[data-reservation-workbench]');await expect(state).toContainText('Registrace na E36 United 2026 nyní nejsou otevřené.');await expect(state).not.toContainText('MÁŠ PŘEDBĚŽNOU REGISTRACI.');await expect(page.locator('[data-member-plan-open]')).toBeHidden();await expect(page.locator('[data-reservation-form]')).toBeHidden();expectNoUnexpectedClientErrors(observations);await page.close();
});

test('PRELIMINARY Admin separate empty/list/count and explicit event setting use existing coordinator',async({page})=>{
 const c=await commandFixture(page);
 await page.route('https://api.e36united.cz/api/admin/preliminary-reservations**',async route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  await fulfill(route,await listAdminPreliminaryReservations(c.r.env,new URL(route.request().url()),origin));
 });
 await page.route('https://api.e36united.cz/api/admin/events/*/preliminary-settings',async route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  await fulfill(route,await savePreliminarySettings(incoming(route.request()),c.r.env,{uid:'a'},'e',origin));
 });
 await page.goto('/admin.html?section=reservations&view=preliminary&event=e');
 const panel=page.locator('[data-admin-panel="preliminary"]');await expect(panel).toBeVisible();await expect(panel).toContainText('Zatím žádné předběžné registrace.');
 await panel.locator('[data-preliminary-setting]').click();await expect(panel.locator('[data-admin-preliminary-setting-state]')).toHaveText('Povolený');
 const before=c.r.db.prepare('SELECT COUNT(*) n FROM reservations').get().n;
 c.r.db.exec(`INSERT INTO preliminary_reservations(id,event_id,member_id,status,preferences_json) VALUES('interest','e','a','active','{"carId":"fixture-car","arrival":"Sobota","crew":1,"crewDetails":[],"accommodation":"Bez ubytování","accommodationUnits":0,"showShine":"Možná","note":"Pouze zájem"}')`);
 await page.reload();await expect(page.locator('[data-admin-preliminary-count]')).toHaveText('1');
 await panel.locator('details summary').click();await expect(panel).toContainText('Pouze zájem');expect(c.r.db.prepare('SELECT COUNT(*) n FROM reservations').get().n).toBe(before);
 expectNoUnexpectedClientErrors(c.observations);await page.close();c.r.db.close();
});
