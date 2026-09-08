import {test,expect} from '@playwright/test';
import {prepareAdminE2ePage} from './fixtures.mjs';
import {memberRuntime} from '../helpers/admin-member-runtime.mjs';
import {getAdminDashboard,getAdminPreferences,saveAdminPreferences} from '../../worker/admin/dashboard.js';
import {getAdminSummary} from '../../worker/admin/summary.js';
import {getAdminEvents,getAdminReservations,getAdminGallery,getAdminHistoryClaims} from '../../worker/domains.js';
import {getAdminMember,listAdminMembers} from '../../worker/admin/members.js';
import {getAdminOperation} from '../../worker/admin/commands.js';
import {factoryPreferences} from '../../admin/dashboard-model.js';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type, If-Match, Idempotency-Key','Access-Control-Allow-Methods':'GET, PUT, OPTIONS'};
async function fixture(page){
 const observations=await prepareAdminE2ePage(page),r=memberRuntime(),calls=[],writes=[],failures=new Set();let mode='',tail=Promise.resolve();
 const batch=r.env.DB.batch;r.env.DB.batch=ss=>{const next=tail.then(()=>batch(ss));tail=next.catch(()=>{});return next};
 r.db.exec("UPDATE reservations SET created_at='2026-08-01 12:00:00',submitted_at='2026-08-02',attendance_type='full_weekend',show_shine='Ano'; INSERT INTO reservations(id,member_id,event_id,status,crew,amount_due_czk,amount_paid_czk,created_at,submitted_at,attendance_type,show_shine) VALUES('pending','n','e','pending',3,1000,1300,'2026-09-07','2026-09-07','saturday_only','Možná'),('cancelled','a','e','cancelled',5,0,400,'2026-08-15','2026-08-15','day_visit','Ne'); INSERT INTO event_accommodation_options(id,event_id,name,kind,inventory_mode,units_total,capacity_per_unit) VALUES('cab','e','Chatka','cabin','limited',8,4),('tent','e','Stan','tent','unlimited',0,2); INSERT INTO reservation_accommodation(reservation_id,option_id,people_count,unit_count,option_name,kind,unit_price_czk,person_price_czk,bedding_fee_per_person_czk,city_tax_per_person_per_night_czk,nights,base_total_czk,person_total_czk,bedding_total_czk,city_tax_total_czk,total_czk) VALUES('r','cab',2,1,'Chatka','cabin',0,0,0,0,2,0,0,0,0,0),('pending','tent',3,2,'Stan','tent',0,0,0,0,2,0,0,0,0,0);");
 const env={...r.env,ADMIN_READ:true},origin='https://e36united.cz';
 await page.route('https://api.e36united.cz/api/admin/**',async route=>{
  const q=route.request(),url=new URL(q.url()),path=url.pathname;
  if(q.method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(!/\/(dashboard|preferences|summary|events|reservations|members|operations|gallery|history\/claims)(\/|$)/.test(path))return route.fallback();
  calls.push(q.method()+' '+url.pathname+url.search);
  if(mode==='denied'||mode==='unavailable'&&path.endsWith('/dashboard')||mode==='preferences-unavailable'&&path.endsWith('/preferences')){failures.add(q.url());return route.fulfill({status:mode==='denied'?403:503,headers,json:{message:'Synthetic controlled failure'}});}
  let response;
  if(path.endsWith('/preferences')){
   if(q.method()==='PUT'){
    writes.push({key:q.headers()['idempotency-key'],revision:q.headers()['if-match'],body:q.postDataJSON()});
    if(mode==='undelivered'){failures.add(q.url());return route.abort('connectionfailed');}
    response=await saveAdminPreferences(new Request(q.url(),{method:'PUT',headers:q.headers(),body:q.postData()}),env,{uid:'a'},origin);
    if(mode==='lost'){failures.add(q.url());return route.abort('connectionfailed');}
   }else response=await getAdminPreferences(env,{uid:'a'},origin);
  }else if(path.endsWith('/dashboard'))response=await getAdminDashboard(env,url,origin,new Date('2026-09-08T12:00:00Z'));
  else if(path.endsWith('/summary'))response=await getAdminSummary(env,url,origin,new Date('2026-09-08T12:00:00Z'));
  else if(path.endsWith('/events'))response=await getAdminEvents(env,origin);
  else if(path.endsWith('/reservations'))response=await getAdminReservations(env,url,origin);
  else if(path.includes('/operations/'))response=await getAdminOperation(env,{uid:'a'},path.split('/').at(-1),origin);
  else if(path.endsWith('/gallery'))response=await getAdminGallery(env,origin,url);
  else if(path.endsWith('/history/claims'))response=await getAdminHistoryClaims(env,url,origin);
  else if(path.endsWith('/members'))response=await listAdminMembers(env,url,origin);
  else if(path.includes('/members/')){const parts=path.split('/');response=await getAdminMember(env,url,parts[4],parts[5],origin);}
  else return route.fallback();
  if(response.status>=400)failures.add(q.url());
  return route.fulfill({status:response.status,headers,body:await response.text()});
 });
 return {r,calls,writes,observations,failures,get mode(){return mode},set mode(v){mode=v},stored(){const row=r.db.prepare("SELECT * FROM admin_preferences WHERE id='a'").get();return row?{revision:row.revision,value:JSON.parse(row.configuration_json)}:null},otherDevice(value){const row=this.stored();r.db.prepare("INSERT INTO admin_preferences(id,schema_version,configuration_json,revision) VALUES('a',1,?,?) ON CONFLICT(id) DO UPDATE SET configuration_json=excluded.configuration_json,revision=excluded.revision").run(JSON.stringify(value),(row?.revision||0)+1);r.db.prepare("INSERT INTO admin_resource_versions(resource_type,resource_id,revision) VALUES('preferences','a',1) ON CONFLICT(resource_type,resource_id) DO UPDATE SET revision=revision+1").run();}};
}
const editor=page=>page.locator('[data-dashboard-preferences]');
const card=(page,id)=>page.locator('[data-widget="'+id+'"]');
async function open(page){await page.goto('/admin.html?section=dashboard&event=e');await expect(page.locator('[data-kpi-reservations]')).toHaveText('2');await expect(page.locator('[data-dashboard-edit]')).toBeEnabled();}
async function edit(page){await page.locator('[data-dashboard-edit]').click();await expect(editor(page)).toBeVisible();}
async function save(page){await page.locator('[data-dashboard-save]').click();await expect(editor(page)).toBeHidden();}
function clean(c){expect(c.observations.pageErrors).toEqual([]);expect(c.observations.unhandledApi).toEqual([]);expect(c.observations.consoleErrors.filter(e=>!c.failures.has(e.url)||!/Failed to load resource|Fetch API cannot load|net::ERR/.test(e.text))).toEqual([]);}

for(const width of [1440,390])test('Stage 3 factory compositions, exact graphs, mobile navigation and screenshot '+width,async({page},info)=>{
 await page.setViewportSize({width,height:900});const c=await fixture(page);await open(page);
 await expect(page.locator('.admin-section-nav [data-portal-target]')).toHaveCount(5);await expect(page.locator('.dashboard-kpi')).toHaveCount(4);
 await expect(page.locator('[data-kpi-people]')).toHaveText('5');await expect(page.locator('[data-kpi-recorded]')).toContainText('1');
 await expect(page.locator('[data-admin-funnel]')).toBeHidden();expect(c.calls.some(p=>p.includes('/funnel'))).toBe(false);
 for(const id of ['trend','occupancy','finance','statuses','attendance','sns'])await expect(card(page,id).getByText('Zobrazit data',{exact:true})).toBeVisible();
 await card(page,'finance').locator('summary').click();await expect(card(page,'finance').locator('tbody tr')).toHaveCount(6);await expect(card(page,'finance')).toContainText('Úhrady mimo aktivní');
 await card(page,'occupancy').locator('summary').click();await expect(card(page,'occupancy')).toContainText('Bez limitu');await expect(card(page,'occupancy').locator('tbody tr')).toHaveCount(2);
 await card(page,'trend').locator('[data-dashboard-range]').selectOption('7');await card(page,'trend').locator('summary').click();await expect(card(page,'trend').locator('tbody tr')).toHaveCount(7);await expect(card(page,'trend').locator('tbody tr').first()).toContainText('2');
 await expect(page.locator('[data-kpi-reservations]')).toHaveText('2');await expect(card(page,'finance').locator('details')).toHaveAttribute('open','');
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:info.outputPath('preparation-viewport-'+width+'.png')});
 await page.screenshot({path:info.outputPath('preparation-'+width+'.png'),fullPage:true});
 await page.locator('[data-dashboard-composition]').selectOption('onsite');await expect(page.locator('[data-dashboard-title]')).toHaveText('Na srazu');await expect(page.locator('[data-dashboard-quick-links] button')).toHaveCount(4);
 await expect(page.locator('[data-member-search]')).toBeVisible();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:info.outputPath('onsite-viewport-'+width+'.png')});await page.screenshot({path:info.outputPath('onsite-'+width+'.png'),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 if(width===390){await page.locator('[data-portal-menu-open]').click();await page.locator('.portal-nav-sheet [data-portal-target="settings"]').click();}else await page.locator('.admin-section-nav [data-portal-target="settings"]').click();
 await expect(page.locator('[data-admin-panel="event"]')).toBeVisible();await expect(page.locator('[data-settings-context]')).toContainText('CURRENT: United 2026');
 await page.locator('[data-event-select]').selectOption('old');await expect(page.locator('[data-settings-context]')).toContainText('vybraný ročník United 2025');await expect(page.locator('[data-settings-context]')).toContainText('CURRENT: United 2026');
 expect(c.writes).toEqual([]);expect(c.r.writes).toBe(0);clean(c);c.r.db.close();
});
test('Stage 3 exact finance drill, Member 360, Back restores range/composition/filter/scroll without writes',async({page})=>{
 const c=await fixture(page);await open(page);await page.locator('[data-dashboard-composition]').selectOption('onsite');await card(page,'trend').locator('[data-dashboard-range]').selectOption('30');
 await card(page,'outstanding').scrollIntoViewIfNeeded();const scroll=await page.evaluate(()=>scrollY);
 await card(page,'outstanding').locator('button').click();await expect(page).toHaveURL(/section=finance.*view=payments.*scope=outstanding/);await expect(page.locator('[data-admin-panel="payments"] [data-dashboard-filter]')).toContainText('Aktivní rezervace se zbývající úhradou');
 await expect(page.locator('[data-payment-list] tr[data-reservation-open]')).toHaveCount(1);await page.locator('[data-payment-list] [data-member-open="m"]').click();await expect(page.locator('[data-member-dialog]')).toContainText('EU-MEMBER');
 await page.goBack();await expect(page.locator('[data-member-dialog]')).not.toBeVisible();await expect(page).toHaveURL(/scope=outstanding/);await page.goBack();await expect(page.locator('[data-dashboard-title]')).toHaveText('Na srazu');await expect(page.locator('[data-dashboard-range]')).toHaveValue('30');
 await expect.poll(()=>page.evaluate(()=>history.state?.scrollY)).toBeCloseTo(scroll,0);
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBeCloseTo(scroll,0);expect(c.writes).toEqual([]);expect(c.r.writes).toBe(0);clean(c);c.r.db.close();
});
test('Stage 3 preferences save, reorder, size, independent compositions, cancel and confirmed reset',async({page},info)=>{
 const c=await fixture(page);await open(page);await edit(page);await page.screenshot({path:info.outputPath('preferences-edit.png'),fullPage:true});
 await editor(page).locator('[data-edit-widget="people"] [data-widget-hide]').click();await editor(page).locator('[data-edit-widget="trend"] [data-widget-size]').selectOption('compact');await editor(page).locator('[data-edit-widget="trend"] [data-widget-move="-1"]').click();
 await editor(page).locator('[data-quick-link="members"]').check();expect(c.writes).toHaveLength(0);await save(page);expect(c.writes).toHaveLength(1);const first=c.stored();expect(first.value.compositions.preparation.widgets.some(w=>w.id==='people')).toBe(false);expect(first.value.compositions.onsite).toEqual(factoryPreferences().compositions.onsite);
 await page.reload();await expect(card(page,'people')).toHaveCount(0);await expect(page.locator('[data-dashboard-edit]')).toBeEnabled();await edit(page);await editor(page).locator('[data-widget-add]').selectOption('people');page.once('dialog',d=>d.accept());await page.locator('[data-dashboard-cancel]').click();expect(c.stored()).toEqual(first);
 await page.locator('[data-dashboard-composition]').selectOption('onsite');await edit(page);await editor(page).locator('[data-edit-widget="reservations"] [data-widget-hide]').click();await save(page);const beforeReset=c.stored();
 await page.locator('[data-dashboard-composition]').selectOption('preparation');await edit(page);page.once('dialog',d=>d.dismiss());await page.locator('[data-dashboard-reset]').click();expect(c.stored()).toEqual(beforeReset);page.once('dialog',d=>d.accept());await page.locator('[data-dashboard-reset]').click();expect(c.writes).toHaveLength(2);await save(page);
 expect(c.stored().value.compositions.preparation).toEqual(factoryPreferences().compositions.preparation);expect(c.stored().value.compositions.onsite).toEqual(beforeReset.value.compositions.onsite);clean(c);c.r.db.close();
});
test('Stage 3 dirty preferences reject newer device revision, retain draft and never overwrite by refresh',async({page})=>{
 const c=await fixture(page);await open(page);await edit(page);await editor(page).locator('[data-edit-widget="people"] [data-widget-hide]').click();const draft=await editor(page).locator('[name=configuration]').inputValue();
 const newer=factoryPreferences();newer.compositions.onsite.quickLinks=['history'];c.otherDevice(newer);await page.locator('[data-refresh]').click();await expect(page.locator('[data-dashboard-preference-notice]')).toContainText('novější rozložení');await expect(editor(page).locator('[name=configuration]')).toHaveValue(draft);
 await page.locator('[data-dashboard-save]').click();await expect(editor(page)).toHaveAttribute('data-operation-state','conflict');expect(c.stored().value).toEqual(newer);expect(c.writes[0].revision).toBe('0');
 page.once('dialog',d=>d.dismiss());await page.locator('[data-dashboard-composition]').selectOption('onsite');await expect(page.locator('[data-dashboard-composition]')).toHaveValue('preparation');await expect(editor(page).locator('[name=configuration]')).toHaveValue(draft);clean(c);c.r.db.close();
});
for(const mode of ['lost','undelivered'])test('Stage 3 preference outcome recovery '+mode,async({page})=>{
 const c=await fixture(page);await open(page);await edit(page);await editor(page).locator('[data-edit-widget="people"] [data-widget-hide]').click();c.mode=mode;await page.locator('[data-dashboard-save]').click();await expect(editor(page)).toHaveAttribute('data-operation-state','outcome_unknown');expect(c.writes).toHaveLength(1);c.mode='';
 if(mode==='lost'){page.once('dialog',d=>d.accept());await page.reload();await expect(page.locator('[data-dashboard-edit]')).toBeEnabled();await edit(page);await expect(editor(page)).toHaveAttribute('data-operation-state','confirmed');expect(c.writes).toHaveLength(1);}
 else {page.once('dialog',d=>d.accept());await editor(page).getByRole('button',{name:'Výslovně opakovat stejnou operaci'}).click();await expect(editor(page)).toHaveAttribute('data-operation-state','confirmed');expect(c.writes).toHaveLength(2);expect(c.writes[1]).toEqual(c.writes[0]);}
 expect(c.stored().value.compositions.preparation.widgets.some(w=>w.id==='people')).toBe(false);clean(c);c.r.db.close();
});
test('Stage 3 unavailable preferences cannot overwrite saved work with factory defaults',async({page})=>{
 const c=await fixture(page),saved=factoryPreferences();saved.compositions.preparation.widgets.push({id:'future-widget',size:'wide'});c.otherDevice(saved);c.mode='preferences-unavailable';await page.goto('/admin.html?event=e');await expect(page.locator('[data-domain-status="dashboard-preferences"]')).toBeVisible();await expect(page.locator('[data-dashboard-edit]')).toBeDisabled();expect(c.stored().value).toEqual(saved);expect(c.writes).toEqual([]);
 c.mode='';await page.locator('[data-refresh]').click();await expect(page.locator('[data-dashboard-edit]')).toBeEnabled();await edit(page);await expect(editor(page)).toContainText('Neznámý widget: future-widget');expect(c.stored().value).toEqual(saved);clean(c);c.r.db.close();
});
test('Stage 3 coordinator remains 60/300s, stable chart DOM, no inactive polling or all-clear on stale/partial sources',async({page},info)=>{
 await page.clock.install();const c=await fixture(page);await open(page);await card(page,'finance').locator('summary').click();await expect(card(page,'finance').locator('details')).toHaveAttribute('open','');await card(page,'finance').locator('summary').focus();await card(page,'finance').evaluate(node=>node.dataset.identity='retained');const start=c.calls.length;
 await page.clock.runFor(60100);expect(c.calls.length).toBe(start);await page.clock.runFor(241000);await expect.poll(()=>c.calls.length-start).toBe(2);await expect(card(page,'finance')).toHaveAttribute('data-identity','retained');await expect(card(page,'finance').locator('summary')).toBeFocused();await expect(card(page,'finance').locator('details')).toHaveAttribute('open','');
 c.mode='unavailable';await page.locator('[data-refresh]').click();await expect(page.locator('[data-dashboard-attention-state]')).toContainText('Nelze potvrdit');await expect(page.locator('[data-domain-status="dashboard-analytics"]')).toBeVisible();await expect(page.locator('[data-kpi-reservations]')).toHaveText('2');
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:info.outputPath('stale-partial.png'),fullPage:true});
 for(const kind of ['hidden','offline']){const before=c.calls.length;await page.evaluate(kind=>{if(kind==='hidden'){Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))}else{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});window.dispatchEvent(new Event('offline'))}},kind);await page.clock.runFor(600000);expect(c.calls.length).toBe(before);}
 expect(c.writes).toEqual([]);expect(c.r.writes).toBe(0);clean(c);c.r.db.close();
});
