import {test,expect} from '@playwright/test';
import {factoryPreferences} from '../../admin/dashboard-model.js';
import {commandDefaults} from '../../admin/command-model.js';
import {commandFixture} from './command-fixture.mjs';
const fixture=page=>commandFixture(page,{legacy:true});
const editor=page=>page.locator('[data-dashboard-preferences]');
const card=(page,id)=>page.locator('[data-widget="'+id+'"]');
async function open(page){await page.goto('/admin.html?section=dashboard&event=e');await expect(page.locator('[data-kpi-reservations]')).toHaveText('2');await expect(page.locator('[data-dashboard-edit]')).toBeEnabled();}
async function edit(page){await page.locator('[data-dashboard-edit]').click();await expect(editor(page)).toBeVisible();}
async function save(page){await page.locator('[data-dashboard-save]').click();await expect(editor(page)).toBeHidden();}
function clean(c){expect(c.observations.pageErrors).toEqual([]);expect(c.observations.unhandledApi).toEqual([]);expect(c.observations.consoleErrors.filter(e=>!c.failures.has(e.url)||!/Failed to load resource|Fetch API cannot load|net::ERR/.test(e.text))).toEqual([]);}

for(const width of [1440,390])test('Stage 3 factory compositions, exact graphs, mobile navigation and screenshot '+width,async({page},info)=>{
 await page.setViewportSize({width,height:900});const c=await fixture(page);await open(page);
 await expect(page.locator('.admin-section-nav > button')).toHaveCount(6);await expect(page.locator('.dashboard-kpi')).toHaveCount(4);
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
 await card(page,'outstanding').locator('button').click();await expect(page).toHaveURL(/section=payments.*view=payments.*scope=outstanding/);await expect(page.locator('[data-admin-panel="payments"] [data-dashboard-filter]')).toContainText('Aktivní rezervace se zbývající úhradou');
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
 expect(c.stored().value.compositions.preparation).toEqual(commandDefaults().compositions.preparation);expect(c.stored().value.compositions.onsite).toEqual(beforeReset.value.compositions.onsite);clean(c);c.r.db.close();
});
test('Stage 3 dirty preferences reject newer device revision, retain draft and never overwrite by refresh',async({page})=>{
 const c=await fixture(page);await open(page);await edit(page);await editor(page).locator('[data-edit-widget="people"] [data-widget-hide]').click();const draft=await editor(page).locator('[name=configuration]').inputValue();
 const newer=factoryPreferences();newer.compositions.onsite.quickLinks=['history'];c.otherDevice(newer);await page.locator('[data-dashboard-revalidate]').click();await expect(page.locator('[data-dashboard-preference-notice]')).toContainText('novější rozložení');await expect(editor(page).locator('[name=configuration]')).toHaveValue(draft);
 await page.locator('[data-dashboard-save]').click();await expect(editor(page)).toHaveAttribute('data-operation-state','conflict');expect(c.stored().value).toEqual(newer);expect(c.writes[0].revision).toBe('1');
 page.once('dialog',d=>d.dismiss());await page.keyboard.press('Escape');await expect(editor(page)).toBeVisible();await expect(page.locator('[data-dashboard-composition]')).toHaveValue('preparation');await expect(editor(page).locator('[name=configuration]')).toHaveValue(draft);clean(c);c.r.db.close();
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
