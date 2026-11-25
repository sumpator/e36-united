import {commandFixture} from './command-fixture.mjs';
import {test,expect} from '@playwright/test';
import {prepareE2ePage} from './fixtures.mjs';
import {memberRuntime} from '../helpers/admin-member-runtime.mjs';
import {getPublicCurrentEvent,getAdminReservations,patchAdminReservation} from '../../worker/domains.js';
import {getCurrentReservation,putCurrentReservation} from '../../worker/domains/reservations/index.js';
import {getPreliminaryReservation,putPreliminaryReservation} from '../../worker/domains/reservations/preliminary.js';
import {submitReservationRequest,reviewReservationRequest} from '../../worker/domains/reservations/requests.js';
import {transactionalContent} from '../../worker/domains/mailing/transactional.js';
import {renderTransactionalEmail} from '../../worker/domains/mailing/transactional-template.js';

const origin='https://e36united.cz', auth={uid:'n'}, admin={uid:'a'};
const request=(body,method='PUT')=>new Request(origin,{method,body:JSON.stringify(body)});
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS','Content-Type':'application/json'};
const money=value=>new Intl.NumberFormat('cs-CZ',{maximumFractionDigits:0}).format(value);
const cases=[
  {index:1,type:'friday_only',departure:'Sobota',nights:1,amount:1460,plan:true},
  {index:0,type:'full_weekend',departure:'Neděle',nights:2,amount:2300},
  {index:2,type:'saturday_only',departure:'Neděle',nights:1,amount:1460},
  {index:3,type:'day_visit',departure:'Stejný den',nights:0,amount:0},
  {index:0,type:'full_weekend',departure:'Neděle',nights:2,amount:0,without:true},
];

for(const entry of cases)test('public planner to approval and mail: '+entry.type+(entry.without?' without lodging':''),async({page,browser})=>{
  const {db,env}=memberRuntime();
  const adminPage=await browser.newPage();
  const adminFixture=await commandFixture(adminPage);
  await adminPage.route('https://api.e36united.cz/api/admin/reservations?**',async route=>{
    const response=await getAdminReservations({...env,ADMIN_READ:true},new URL(route.request().url()),origin);
    await route.fulfill({status:response.status,headers,body:await response.text()});
  });
  try {
    db.exec(`UPDATE events SET year=2099,title='United 2099',starts_on='2099-07-03',ends_on='2099-07-05',admission_registered_czk=0,registration_status='${entry.plan?'closed':'open'}' WHERE id='e';
      INSERT INTO event_preliminary_settings(event_id,enabled,write_token) VALUES('e',1,'test');
      INSERT INTO cars(id,member_id,model) VALUES('car-001','n','E36');
      INSERT INTO event_accommodation_options(id,event_id,name,kind,inventory_mode,units_total,capacity_per_unit,unit_price_czk,person_price_czk,bedding_fee_per_person_czk,city_tax_per_person_per_night_czk)
      VALUES('brick','e','Chatka zděná','cabin','limited',20,4,740,250,60,50)`);
    await prepareE2ePage(page);
    for(const path of ['events/current','reservations/current','preliminary-reservations/current']){
      await page.route('https://api.e36united.cz/api/'+path,async route=>{
        const q=route.request(),method=q.method();if(method==='OPTIONS')return route.fulfill({status:204,headers});
        let response;
        if(path==='events/current')response=await getPublicCurrentEvent(env,origin);
        else if(path==='reservations/current')response=method==='GET'?await getCurrentReservation(env,auth,origin):await putCurrentReservation(request(q.postDataJSON()),env,auth,origin);
        else response=method==='GET'?await getPreliminaryReservation(env,auth,origin):await putPreliminaryReservation(request(q.postDataJSON()),env,auth,origin);
        await route.fulfill({status:response.status,headers,body:await response.text()});
      });
    }
    const expected=entry.without||entry.index===3?0:entry.nights*(740+2*50)+2*(250+60);
    expect(expected).toBe(entry.amount);
    await page.goto('/index.html#planer');
    await page.locator('[data-stay-index="'+entry.index+'"]').click();
    if(entry.without)await page.locator('[data-choice-group=sleep] [data-value="Bez ubytování"]').click();
    await expect(page.locator('[data-public-total]')).toContainText(money(expected)+' Kč');
    await page.reload();
    await expect(page.locator('[data-public-total]')).toContainText(money(expected)+' Kč');
    await page.locator('[data-planner-mail]').click();await page.locator('[data-planner-login]').click();
    const login=page.locator('[data-auth-form=login]');
    await login.locator('[name=email]').fill('driver@example.invalid');await login.locator('[name=password]').fill('isolated-test');await login.locator('[type=submit]').click();
    await expect(page.locator('[data-member-panel=reservation]')).toBeVisible();
    const intro=page.locator('[data-onboarding-intro-modal]');
    await page.addLocatorHandler(intro,()=>intro.getByRole('button',{name:'Zavřít úvod',exact:true}).click());
    const modal=page.locator('[data-member-planner-modal]'),open=page.locator('[data-member-plan-open]');
    async function checkForm(){await open.click();await expect(modal.locator('[name=departure]')).toHaveValue(entry.departure);await expect(modal.locator('[data-admission-summary]')).toContainText('Celkem: '+money(expected)+' Kč');}
    async function submit(path){const response=page.waitForResponse(x=>x.request().method()==='PUT'&&new URL(x.url()).pathname==='/api/'+path);await modal.locator('[data-reservation-submit]').click();const got=await response;expect(got.status(),await got.text()).toBe(200);return await got.json();}
    await checkForm();
    if(entry.plan){
      const saved=await submit('preliminary-reservations/current');expect(saved.preliminary.preferences.departure).toBe(entry.departure);
      expect(db.prepare("SELECT count(*) n FROM reservations WHERE member_id='n'").get().n).toBe(0);
      db.exec("UPDATE events SET registration_status='open' WHERE id='e'");
      await page.reload();await checkForm();
    }
    const saved=(await submit('reservations/current')).reservation;
    expect(saved).toMatchObject({attendanceType:entry.type,departure:entry.departure,stayNights:entry.nights,amountDueCzk:expected,eventId:'e'});
    const approved=await patchAdminReservation(request({status:'approved'},'PATCH'),env,admin,saved.id,origin);
    expect(approved.status,await approved.clone().text()).toBe(200);
    async function verify(expectedStay,total,template='reservation_approved'){
      const current=(await(await getCurrentReservation(env,auth,origin,saved.id)).json()).reservation;
      expect(current).toMatchObject({status:'approved',departure:expectedStay.departure,stayNights:expectedStay.nights,amountDueCzk:total});
      const row=db.prepare('SELECT r.attendance_type,r.amount_due_czk,a.nights FROM reservations r LEFT JOIN reservation_accommodation a ON a.reservation_id=r.id WHERE r.id=?').get(saved.id);
      expect(row).toMatchObject({attendance_type:expectedStay.type,amount_due_czk:total,nights:total?expectedStay.nights:null});
      const items=(await(await getAdminReservations(env,new URL(origin+'/?eventId=e'),origin)).json()).reservations;
      expect(items.find(x=>x.id===saved.id)).toMatchObject({departure:expectedStay.departure,stayNights:expectedStay.nights,amountDueCzk:total});
      await adminPage.goto('/admin.html?section=reservations&event=e&reservation='+saved.id);
      const card=adminPage.locator('[data-reservation-drawer] article[data-reservation-id="'+saved.id+'"]');
      await expect(card.locator('.command-stay dt').filter({hasText:'Odjezd'}).locator('+ dd')).toHaveText(expectedStay.departure);
      await expect(card.locator('.command-stay dt').filter({hasText:'Počet nocí účasti'}).locator('+ dd')).toHaveText(String(expectedStay.nights));
      await expect(card.locator('dt').filter({hasText:'Cena registrace'}).locator('+ dd')).toContainText(money(total));
      const outbox=db.prepare("SELECT * FROM email_outbox WHERE reservation_id=? AND template_key=?").get(saved.id,template);
      const mail=renderTransactionalEmail(template,await transactionalContent(env,outbox));
      const compact=mail.text.replace(/\s/g,'');
      expect(compact).toContain('Odjezd:'+expectedStay.departure.replace(/\s/g,''));expect(compact).toContain('Početnocíúčasti:'+expectedStay.nights);expect(compact).toContain('Celkem:'+total+',00Kč');
      await page.reload();await expect(page.locator('[data-reservation-summary]')).toContainText(expectedStay.nights?expectedStay.departure.toLowerCase():'Bez noclehu');
    }
    await verify(entry,expected);
    if(entry.type==='full_weekend'&&!entry.without){
      const change=await submitReservationRequest(request({type:'change',arrival:'Pátek',departure:'Sobota',quotedTotalCzk:1460,crew:2,accommodation:'Chatka',accommodationOptionId:'brick',accommodationUnits:2,showShine:'Ne',note:''},'POST'),env,auth,saved.id,origin);
      expect(change.status,await change.clone().text()).toBe(201);
      const decision=await reviewReservationRequest(request({decision:'approved'}),env,admin,saved.id,(await change.json()).request.id,origin);
      expect(decision.status,await decision.clone().text()).toBe(200);await verify(cases[0],1460,'request_approved');
    }
  }finally{await adminPage.close();adminFixture.r.db.close();db.close()}
});

for(const mode of ['past','preliminary','open','closed','unavailable','unpublished'])test('public offer and calendars: '+mode,async({page})=>{
  const {env,db}=memberRuntime();
  try{
    const upcoming=mode!=='past',open=mode==='open'||mode==='past';
    env.clock=()=>new Date('2098-01-03T12:00:00Z');
    db.prepare("UPDATE events SET year=?,title='United Test',starts_on=?,ends_on=?,registration_status=?,is_current=?,admission_registered_czk=300 WHERE id='e'").run(upcoming?2099:2026,upcoming?'2099-07-03':'2026-06-19',upcoming?'2099-07-05':'2026-06-21',open?'open':'closed',mode==='unpublished'?0:1);
    db.prepare("INSERT INTO event_preliminary_settings(event_id,enabled,write_token) VALUES('e',?,'test')").run(mode==='preliminary'?1:0);
    await prepareE2ePage(page);
    await page.route('https://api.e36united.cz/api/events/current',async route=>{
      if(mode==='unavailable')return route.fulfill({status:503,headers,body:'{}'});
      const response=await getPublicCurrentEvent(env,origin);await route.fulfill({status:response.status,headers,body:await response.text()});
    });
    await page.goto('/index.html#planer');
    const enabled=mode==='preliminary'||mode==='open';
    if(enabled){
      await expect(page.locator('[data-planner]')).toBeVisible();
      await expect(page.locator('[data-next-event-date]')).toContainText('2099');
      await page.locator('[data-calendar-button]').click();
      const google=new URL(await page.locator('[data-google-calendar]').getAttribute('href'));
      expect(google.searchParams.get('dates')).toBe('20990703/20990706');
      const ics=decodeURIComponent((await page.locator('[data-event-ics]').getAttribute('href')).split(',').slice(1).join(','));
      expect(ics).toContain('DTSTART;VALUE=DATE:20990703');expect(ics).toContain('DTEND;VALUE=DATE:20990706');
      expect(ics).toContain('UID:e@e36united.cz');if(mode==='preliminary')await expect(page.locator('[data-planner]')).toContainText('Kapacitu ubytování tím nezískáš.');
    }else{
      await expect(page.locator('[data-event-notice]')).toContainText(mode==='closed'?'nejsou otevřené':'není k dispozici');
      await expect(page.locator('[data-planner-mail]')).toBeHidden();await expect(page.locator('[data-calendar-button]')).toBeHidden();
      await expect(page.locator('[data-event-ics]')).not.toHaveAttribute('href',/.+/);await expect(page.locator('[data-planner-unavailable] a')).toBeVisible();
    }
    const existing=(await(await getCurrentReservation(env,{uid:'m'},origin,'r')).json()).reservation;expect(existing.id).toBe('r');
    const body={eventId:'e',arrival:'Pátek',departure:'Sobota',carId:'cn',accommodation:'Bez ubytování',crew:2,showShine:'Ne',quotedTotalCzk:300};
    const send=b=>putCurrentReservation(request(b),env,auth,origin);
    if(mode==='open'){
      expect((await send({...body,eventId:'old'})).status).toBe(409);
      expect((await send({...body,departure:null})).status).toBe(400);
      expect((await send({...body,quotedTotalCzk:0})).status).toBe(409);
      db.exec("UPDATE events SET registration_status='closed' WHERE id='e'");
    }
    expect((await send(body)).status).toBe(409);
    expect(db.prepare("SELECT count(*) n FROM reservations WHERE member_id='n'").get().n).toBe(0);
  }finally{db.close()}
});
