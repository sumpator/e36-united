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
 const r=memberRuntime();r.db.exec("DELETE FROM reservations;DELETE FROM preliminary_reservations;UPDATE events SET registration_status='closed' WHERE id='e';INSERT INTO event_preliminary_settings(event_id,enabled,write_token) VALUES('e',1,'fixture')");
 let serverDraft=null;
 await page.route('https://api.e36united.cz/api/planner-draft**',route=>route.fulfill({status:200,headers,json:{ok:true,draft:route.request().method()==='GET'?serverDraft:null,deleted:route.request().method()==='DELETE'}}));
 await page.route('https://api.e36united.cz/api/{preliminary-reservations,reservations}/current',async route=>{
  const q=route.request();if(q.method()==='OPTIONS')return route.fulfill({status:204,headers});
  const prelim=q.url().includes('/preliminary-reservations/');
  const response=prelim?(q.method()==='GET'?await getPreliminaryReservation(r.env,{uid:'m'},origin):q.method()==='DELETE'?await cancelPreliminaryReservation(incoming(q),r.env,{uid:'m'},origin):await putPreliminaryReservation(incoming(q),r.env,{uid:'m'},origin)):
   q.method()==='GET'?await getCurrentReservation(r.env,{uid:'m'},origin):await putCurrentReservation(incoming(q),r.env,{uid:'m'},origin);
  await fulfill(route,response);
 });
 const open=async()=>{await page.goto('/member.html?section=reservation');await expect(page.locator('[data-app-view]')).toBeVisible();const intro=page.locator('[data-onboarding-intro-modal]');if(await intro.isVisible())await intro.getByRole('button',{name:'Zavřít úvod'}).click();await expect(intro).toBeHidden();};
 const review=async name=>{if(!process.env.E36_REVIEW_SCREENSHOTS)return;if(name.endsWith('-390'))await modal.getByRole('button',{name:'Zavřít Weekend Planner'}).focus();await page.screenshot({path:`docs/review/${name}.png`,fullPage:true})};
 await open();const modal=page.locator('[data-member-planner-modal]'),form=modal.locator('[data-reservation-form]'),submit=form.locator('[data-reservation-submit]');
 await expect(page.locator('[data-member-plan-state]')).toContainText('Kapacitu ani cenu tím nerezervuješ');await page.locator('[data-member-plan-open]').click();await expect(modal).toBeVisible();
 await expect(submit).toContainText('Uložit plán');await expect(form.locator('[name="carId"]')).toHaveValue('');await form.locator('[name="arrival"]').selectOption('Jen na otočku');
 await form.locator('[name="crew"]').fill('2');await form.locator('[name="showshine"]').selectOption('Možná');await form.locator('[name="note"]').fill('Zájem bez závazku');await form.locator('[name="preliminaryCrewDetails"]').fill('Řidič\nDoprovod');
 await review(`member-plan-edit-${width}`);await submit.click();await expect(modal).toBeHidden();await expect(page.locator('[data-preliminary-copy]')).toHaveText('Tvůj plán máme. Jakmile spustíme rezervace, dáme ti vědět.');await expect(page.locator('[data-member-plan-disclaimer]')).toHaveText('Nezávazný plán · bez rezervované kapacity');
 expect(r.db.prepare('SELECT COUNT(*) n FROM reservations').get().n).toBe(0);expect(r.db.prepare('SELECT COUNT(*) n FROM member_qr_identities').get().n).toBe(0);
 expect(JSON.parse(r.db.prepare('SELECT preferences_json FROM preliminary_reservations').get().preferences_json).carId).toBeNull();if(width===1440)await review('member-plan-saved-closed-desktop');
 await page.reload();await expect(page.locator('[data-preliminary-copy]')).toHaveText('Tvůj plán máme. Jakmile spustíme rezervace, dáme ti vědět.');const editPlan=page.locator('[data-member-plan-open]');await stableScroll(page);await editPlan.click();await expect(submit).toContainText('Uložit změny plánu');
 if(width===390){const clickScroll=await stableScroll(page);await form.locator('[name="note"]').fill('Neuložená změna');page.once('dialog',dialog=>dialog.accept());await modal.getByRole('button',{name:'Zavřít Weekend Planner'}).click();await expect(modal).toBeHidden();await expect(editPlan).toBeFocused();expect(Math.abs(await stableScroll(page)-clickScroll)).toBeLessThanOrEqual(1);await editPlan.click()}
 await form.locator('[name="note"]').fill('Upravený zájem');await submit.click();await expect(page.locator('[data-preliminary-copy]')).toHaveText('Tvůj plán máme. Jakmile spustíme rezervace, dáme ti vědět.');
 await expect.poll(()=>JSON.parse(r.db.prepare('SELECT preferences_json FROM preliminary_reservations').get().preferences_json).note).toBe('Upravený zájem');
 expect(r.db.prepare('SELECT COUNT(*) n FROM preliminary_reservations').get().n).toBe(1);page.once('dialog',dialog=>dialog.accept());await page.locator('[data-preliminary-cancel]').click();await expect(page.locator('[data-member-plan-title]')).toHaveText('Připrav si svůj United.');expect(r.db.prepare('SELECT status FROM preliminary_reservations').get().status).toBe('cancelled');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
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
 r.db.exec("UPDATE events SET registration_status='open' WHERE id='e'");await page.reload();await expect(page.locator('[data-planner-handoff]')).toBeHidden();await expect(page.locator('[data-preliminary-copy]')).toHaveText('Rezervace jsou otevřené. Zkontroluj svůj plán a odešli ho ke schválení.');if(process.env.E36_REVIEW_SCREENSHOTS)await page.screenshot({path:'docs/review/member-plan-registration-open-desktop.png',fullPage:true});
 await page.locator('[data-member-plan-open]').click();await expect(modal.locator('[data-reservation-submit]')).toContainText('Odeslat rezervaci ke schválení');await modal.locator('[data-reservation-submit]').click();await expect(modal.locator('[data-reservation-form-status]')).toContainText('Nejdřív přidej auto');
 expect(r.db.prepare("SELECT status FROM preliminary_reservations").get().status).toBe('active');expect(r.db.prepare('SELECT COUNT(*) n FROM reservations').get().n).toBe(0);expectNoUnexpectedClientErrors(observations);await page.close();r.db.close();
});

test('PLAN disabled configuration never presents a draft as saved',async({page})=>{
 const observations=await prepareE2ePage(page,{authenticated:true,registrationOpen:false,cars:[]});await page.goto('/member.html?section=reservation');const intro=page.locator('[data-onboarding-intro-modal]');await expect(intro).toBeVisible();await intro.getByRole('button',{name:'Zavřít úvod'}).click();
 const state=page.locator('[data-member-plan-state]');await expect(state).toContainText('Tento event nyní nepovoluje ukládání nezávazných plánů.');await expect(state).not.toContainText('Tvůj plán máme.');await expect(page.locator('[data-member-plan-open]')).toBeHidden();await expect(page.locator('[data-reservation-form]')).toBeHidden();expectNoUnexpectedClientErrors(observations);await page.close();
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
 await page.goto('/admin.html?section=reservations&event=e');await expect(page.locator('[data-reservation-list]')).toContainText('First');
 const panel=page.locator('[data-admin-preliminary]');await panel.locator('summary').click();await expect(panel).toContainText('Žádné aktivní předběžné rezervace.');
 await panel.locator('[data-preliminary-setting]').click();await expect(panel).toContainText('povolený');
 const before=c.r.db.prepare('SELECT COUNT(*) n FROM reservations').get().n;
 c.r.db.exec(`INSERT INTO preliminary_reservations(id,event_id,member_id,status,preferences_json) VALUES('interest','e','a','active','{"carId":"fixture-car","arrival":"Sobota","crew":1,"crewDetails":[],"accommodation":"Bez ubytování","accommodationUnits":0,"showShine":"Možná","note":"Pouze zájem"}')`);
 await panel.locator(':scope > summary').click();await panel.locator(':scope > summary').click();await expect(page.locator('[data-admin-preliminary-count]')).toHaveText('1');
 await panel.locator('details summary').click();await expect(panel).toContainText('Pouze zájem');expect(c.r.db.prepare('SELECT COUNT(*) n FROM reservations').get().n).toBe(before);
 expectNoUnexpectedClientErrors(c.observations);await page.close();c.r.db.close();
});
