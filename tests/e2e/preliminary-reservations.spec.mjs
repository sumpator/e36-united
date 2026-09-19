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

for(const width of [1440,390])test(`PRELIMINARY member explicit interest, edit, cancel and revalidated conversion ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});
 const observations=await prepareE2ePage(page,{authenticated:true,registrationOpen:false,cars:[{id:'c',model:'328i',body:'Coupé',primary:true,photos:[]}]});
 const r=memberRuntime();r.db.exec("DELETE FROM reservations;UPDATE events SET registration_status='closed' WHERE id='e';INSERT INTO event_preliminary_settings(event_id,enabled,write_token) VALUES('e',1,'fixture')");
 const handoff={version:1,source:'weekend-planner',draftId:'11111111-1111-4111-8111-111111111111',eventId:'e',eventYear:2026,
   createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),arrival:'Pátek',departure:'Neděle',nights:2,attendanceType:'full_weekend',crew:1,accommodation:'Bez ubytování',accommodationUnits:0,showShine:'Ne'};
 await page.route('https://api.e36united.cz/api/planner-draft',route=>route.fulfill({status:200,headers,json:{ok:true,draft:handoff}}));
 await page.route('https://api.e36united.cz/api/{preliminary-reservations,reservations}/current',async route=>{
  const q=route.request();if(q.method()==='OPTIONS')return route.fulfill({status:204,headers});
  const prelim=q.url().includes('/preliminary-reservations/');
  const response=prelim?(q.method()==='GET'?await getPreliminaryReservation(r.env,{uid:'m'},origin):q.method()==='DELETE'?await cancelPreliminaryReservation(incoming(q),r.env,{uid:'m'},origin):await putPreliminaryReservation(incoming(q),r.env,{uid:'m'},origin)):
   q.method()==='GET'?await getCurrentReservation(r.env,{uid:'m'},origin):await putCurrentReservation(incoming(q),r.env,{uid:'m'},origin);
  await fulfill(route,response);
 });
 const open=async()=>{await page.goto('/member.html?section=reservation');await expect(page.locator('[data-app-view]')).toBeVisible();const intro=page.locator('[data-onboarding-intro-modal]');if(await intro.isVisible())await intro.getByRole('button',{name:'Zavřít úvod'}).click();await expect(intro).toBeHidden();};
 await open();const form=page.locator('[data-reservation-form]'),submit=form.locator('[data-reservation-submit]');
 await expect(submit).toHaveText('Odeslat nezávazný předběžný zájem');await form.locator('[name="arrival"]').selectOption('Jen na otočku');
 await form.locator('[name="crew"]').fill('2');await form.locator('[name="showshine"]').selectOption('Možná');await form.locator('[name="note"]').fill('Zájem bez závazku');await form.locator('[name="preliminaryCrewDetails"]').fill('Řidič\nDoprovod');
 await submit.click();await expect(page.locator('[data-preliminary-copy]')).toContainText('Tvůj předběžný zájem je uložený.');
 await expect(form.locator('[name="arrival"]')).toHaveValue('Jen na otočku');await expect(form.locator('[name="showshine"]')).toHaveValue('Možná');
 expect(r.db.prepare('SELECT COUNT(*) n FROM reservations').get().n).toBe(0);expect(r.db.prepare('SELECT COUNT(*) n FROM member_qr_identities').get().n).toBe(0);
 await form.locator('[name="note"]').fill('Upravený zájem');await submit.click();await expect(page.locator('[data-reservation-form-status]')).toContainText('Nezávazný');
 await expect.poll(()=>JSON.parse(r.db.prepare('SELECT preferences_json FROM preliminary_reservations').get().preferences_json).note).toBe('Upravený zájem');
 await page.locator('[data-preliminary-cancel]').click();await expect(page.locator('[data-preliminary-cancel]')).toBeHidden();
 await submit.click();await expect(page.locator('[data-preliminary-cancel]')).toBeVisible();
 r.db.exec("UPDATE events SET registration_status='open' WHERE id='e'");await open();
 await expect(form.locator('[name="note"]')).toHaveValue('Upravený zájem');await expect(form.locator('[name="showshine"]')).toHaveValue('Možná');await expect(submit).toHaveText('Potvrdit a odeslat skutečnou rezervaci');
 expect(r.db.prepare('SELECT COUNT(*) n FROM reservations').get().n).toBe(0);
 await page.screenshot({path:info.outputPath('preliminary-'+width+'.png'),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await submit.click();await expect(page.locator('[data-reservation-state-label]')).toContainText('ČEKÁ');
 expect(r.db.prepare('SELECT status FROM preliminary_reservations').get().status).toBe('converted');expect(r.db.prepare('SELECT COUNT(*) n FROM reservations').get().n).toBe(1);
 expectNoUnexpectedClientErrors(observations);await page.close();r.db.close();
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
