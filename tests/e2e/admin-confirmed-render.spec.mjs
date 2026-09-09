import {test,expect} from '@playwright/test';
import {commandFixture} from './command-fixture.mjs';
import {ADMIN_RELEASE_TOKEN} from '../../scripts/check-admin-module-graph.mjs';

const state=page=>page.evaluate(async token=>{
  const {adminState:s}=await import(`/admin/state.js?v=${token}`);
  return {detail:s.reservationDetail,items:s.reservationItems,selected:s.selectedReservationId};
},ADMIN_RELEASE_TOKEN);
function barrier(){let release,arrive;return {gate:new Promise(r=>release=r),arrived:new Promise(r=>arrive=r),release:()=>release(),arrive:()=>arrive()};}
async function open(page,c){
  c.r.db.exec("UPDATE reservations SET status='pending' WHERE id='r'; UPDATE gallery_submissions SET status='pending' WHERE id='g'; UPDATE united_history_claims SET attendance_status='pending' WHERE id='h'");
  await page.goto('/admin.html?section=dashboard&event=e');
  await expect(page.locator('[data-dashboard-edit]')).toBeEnabled();
  await page.locator('[data-command-reservation="r"]').click();
  await expect(page.locator('[data-review-action="approved"]')).toBeVisible();
  await expect(page.locator('[data-admin-freshness]')).toHaveAttribute('data-state','fresh');
}

test('CONFIRMED dashboard empty list + delayed detail + clean focus keeps status and actions current',async({page},info)=>{
  const c=await commandFixture(page),b=barrier();let hold=false;
  await page.route(url=>url.pathname.endsWith('/reservations')&&url.searchParams.get('id')==='r',async route=>{
    if(hold&&route.request().method()==='GET'){b.arrive();await b.gate;}await route.fallback();
  });
  try{
    await open(page,c);expect((await state(page)).items).toEqual([]);
    const drawer=page.locator('[data-reservation-drawer]'),note=drawer.locator('[data-review-note]');
    const before=c.calls.filter(p=>p.includes('/summary')).length;
    hold=true;await drawer.locator('[data-review-action="approved"]').click();await b.arrived;
    await note.click();b.release();
    await expect.poll(()=>c.r.db.prepare("SELECT status FROM reservations WHERE id='r'").get().status).toBe('approved');
    await expect.poll(async()=>(await state(page)).detail.status).toBe('approved');
    await expect(page.locator('[data-admin-freshness]')).toHaveAttribute('data-state','fresh');
    // The original 7000ms assertion stays unchanged; no blur, forced click or retry.
    await expect(drawer.locator('[data-review-action="approved"]')).toHaveCount(0);
    await expect(note).toBeFocused();await expect(note).toHaveValue('');
    await expect(drawer.locator('[data-command-reservation-status]')).toContainText('Schválená');
    expect(c.calls.filter(p=>p.includes('/summary')).length).toBe(before+1);
    expect(c.writes.map(w=>w.component)).toEqual(['reservation']);
    for(const[name,value]of [['reservations','1'],['dashboard','4'],['photos','1'],['history','1']])await expect(page.locator(`.admin-section-nav [data-command-badge="${name}"]`)).toHaveText(value);
    await page.setViewportSize({width:1440,height:1900});await expect(note).toBeFocused();
    const header=await drawer.locator('article > header').boundingBox(),member=await drawer.locator('.admin-reservation-drawer-grid > section').first().boundingBox();expect(header.y).toBeLessThan(member.y);
    await drawer.locator('.admin-reservation-drawer-panel').evaluate(n=>n.scrollTo(0,0));await expect(note).toBeFocused();
    await page.screenshot({path:info.outputPath('confirmed-focused-detail.png')});
    expect(c.observations.pageErrors).toEqual([]);expect(c.observations.unhandledApi).toEqual([]);
  }finally{b.release();c.r.db.close();}
});

function holdResponse(c,predicate){const b=barrier();c.response=async({request,response})=>{if(predicate(request)){b.arrive();await b.gate;}return response};return b;}
const article=page=>page.locator('[data-reservation-drawer-content] article');
const approved=page=>page.locator('[data-review-action="approved"]');
const note=page=>page.locator('[data-review-note]');
const amount=page=>page.locator('[data-payment-amount]');
function clean(c){expect(c.observations.pageErrors).toEqual([]);expect(c.observations.unhandledApi).toEqual([]);expect(c.observations.consoleErrors.filter(e=>!c.failures.has(e.url)||!/Failed to load resource|Fetch API cannot load|net::ERR/.test(e.text))).toEqual([]);}

test('CONFIRMED partial approval applies before GET and preserves unrelated payment draft, media and selected car',async({page})=>{
 const c=await commandFixture(page);let hold=false;
 c.r.db.exec("UPDATE reservations SET car_id='c2',car_model='BMW 325i' WHERE id='r'; INSERT INTO car_photos(id,car_id,r2_key) VALUES('selected','c2','synthetic/selected')");
 const b=holdResponse(c,q=>hold&&q.method()==='GET'&&new URL(q.url()).searchParams.get('id')==='r');
 try{
  await open(page,c);const before=(await state(page)).detail;await amount(page).fill('777');hold=true;
  await approved(page).click();await b.arrived;
  await expect(approved(page)).toHaveCount(0);await expect(amount(page)).toHaveValue('777');
  const current=(await state(page)).detail;expect(current.status).toBe('approved');expect(current.reviewContext).toEqual(before.reviewContext);expect(current.payment).toEqual(before.payment);expect(current.carSnapshot).toEqual(before.carSnapshot);
  await expect(article(page)).toHaveAttribute('data-operation-state','dirty');
  expect(c.r.db.prepare("SELECT amount_paid_czk n FROM reservations WHERE id='r'").get().n).toBe(200);
  b.release();await expect(page.locator('[data-admin-freshness]')).toHaveAttribute('data-state','fresh');await expect(amount(page)).toHaveValue('777');clean(c);
 }finally{b.release();c.r.db.close();}
});

test('CONFIRMED payment preserves post-send note text, caret, selection, focus and scroll; deferred render flushes without GET',async({page},info)=>{
 const c=await commandFixture(page);const b=holdResponse(c,q=>q.method()==='PATCH');
 try{
  await open(page,c);await note(page).fill('neodeslaná poznámka');await amount(page).fill('600');await page.locator('[data-payment-save]').click();await b.arrived;
  await expect(article(page)).toHaveAttribute('data-operation-state','saving');
  await note(page).fill('další text během čekání');await note(page).evaluate(n=>n.setSelectionRange(2,8,'forward'));
  const scroll=await page.locator('.admin-reservation-drawer-panel').evaluate(n=>n.scrollTop);
  b.release();await expect(article(page)).toHaveAttribute('data-operation-state','dirty');await expect(page.locator('[data-admin-freshness]')).toHaveAttribute('data-state','fresh');
  await expect(note(page)).toBeFocused();await expect(note(page)).toHaveValue('další text během čekání');expect(await note(page).evaluate(n=>[n.selectionStart,n.selectionEnd,n.selectionDirection])).toEqual([2,8,'forward']);
  expect(await page.locator('.admin-reservation-drawer-panel').evaluate(n=>n.scrollTop)).toBe(scroll);
  expect((await state(page)).detail.payment.amountPaidCzk).toBe(600);expect(c.writes.map(w=>w.component)).toEqual(['payment']);
  const reads=c.calls.length;await note(page).fill('');
  // Clean but still focused: readonly state is current, full render stays deferred.
  await expect(article(page)).toHaveAttribute('data-render-pending','true');
  await page.locator('[data-reservation-drawer-close]:not(.admin-reservation-drawer-backdrop)').focus();
  await expect(article(page)).not.toHaveAttribute('data-render-pending','true');expect(c.calls.length).toBe(reads);
  await expect(amount(page)).toHaveValue('600');clean(c);
 }finally{b.release();c.r.db.close();}
});

test('CONFIRMED approval only confirms the sent note, not text typed while saving',async({page})=>{
 const c=await commandFixture(page),b=holdResponse(c,q=>q.method()==='PATCH');
 try{
  await open(page,c);await note(page).fill('odeslaný text');await approved(page).click();await b.arrived;
  await note(page).fill('novější neodeslaný text');b.release();await expect(approved(page)).toHaveCount(0);
  await expect(note(page)).toHaveValue('novější neodeslaný text');await expect(article(page)).toHaveAttribute('data-operation-state','dirty');
  expect(c.r.db.prepare("SELECT review_note n FROM reservations WHERE id='r'").get().n).toBe('odeslaný text');
  expect(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.includes('.draft.reservation:r')).map(k=>JSON.parse(sessionStorage[k]).delta))).toEqual([{':reviewNote':'novější neodeslaný text'}]);clean(c);
 }finally{b.release();c.r.db.close();}
});

test('CONFIRMED older detail response arriving after the command cannot roll back its revision',async({page})=>{
 const c=await commandFixture(page),b=barrier();let hold=false,captured=false;
 c.response=async({request,response})=>{if(hold&&!captured&&request.method()==='GET'&&new URL(request.url()).searchParams.get('id')==='r'){captured=true;b.arrive();await b.gate;}return response};
 try{
  await open(page,c);hold=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await b.arrived;
  await approved(page).click();await expect(approved(page)).toHaveCount(0);const revision=(await state(page)).detail.revision;
  b.release();await expect(page.locator('[data-admin-freshness]')).toHaveAttribute('data-state','fresh');
  expect((await state(page)).detail.revision).toBeGreaterThanOrEqual(revision);expect((await state(page)).detail.status).toBe('approved');await expect(approved(page)).toHaveCount(0);clean(c);
 }finally{b.release();c.r.db.close();}
});

for(const lost of [false,true])test('CONFIRMED '+(lost?'lost response recovery':'receipt-only replay')+' revalidates without invented data or second write',async({page})=>{
 const c=await commandFixture(page),b=barrier();let detailHold=false;
 c.response=async({request,response})=>{
  if(request.method()==='PATCH'){detailHold=true;if(lost)return null;const value=await response.json();return Response.json({ok:true,replayed:true,operation:value.operation});}
  if(detailHold&&request.method()==='GET'&&new URL(request.url()).searchParams.get('id')==='r'){b.arrive();await b.gate;}return response;
 };
 try{
  await open(page,c);await approved(page).click();
  if(lost){await expect(article(page)).toHaveAttribute('data-operation-state','outcome_unknown');await article(page).getByRole('button',{name:'Ověřit výsledek',exact:true}).click();}
  await b.arrived;expect((await state(page)).detail.status).toBe('pending');expect(c.writes).toHaveLength(1);
  b.release();await expect(approved(page)).toHaveCount(0);expect((await state(page)).detail.status).toBe('approved');expect(c.writes).toHaveLength(1);clean(c);
 }finally{b.release();c.r.db.close();}
});

for(const exit of ['close','other-reservation','event','logout'])test('CONFIRMED late command cannot paint after '+exit,async({page})=>{
 const c=await commandFixture(page),b=holdResponse(c,q=>q.method()==='PATCH');
 try{
  await open(page,c);await approved(page).click();await b.arrived;
  await page.locator('[data-reservation-drawer-close]:not(.admin-reservation-drawer-backdrop)').click();await expect(page.locator('[data-reservation-drawer]')).toBeHidden();
  if(exit==='other-reservation'){await page.locator('[data-command-reservation="pending"]').click();await expect(article(page)).toHaveAttribute('data-reservation-id','pending');}
  if(exit==='event')await page.locator('[data-event-select]').selectOption('old');
  if(exit==='logout')await page.locator('[data-logout]').filter({visible:true}).first().click();
  b.release();
  if(exit==='other-reservation'){await expect(article(page)).toHaveAttribute('data-reservation-id','pending');await expect(approved(page)).toHaveCount(1);expect((await state(page)).detail.id).toBe('pending');}
  else await expect(page.locator('[data-reservation-drawer]')).toBeHidden();
  if(exit==='event')expect((await state(page)).detail).toBeNull();
  if(exit==='logout'){await expect(page.locator('[data-admin-view]')).toBeHidden();expect((await state(page)).items).toEqual([]);}
  expect(c.writes).toHaveLength(1);clean(c);
 }finally{b.release();c.r.db.close();}
});

test('CONFIRMED history approval preserves the other component draft and updates readonly decisions',async({page})=>{
 const c=await commandFixture(page),b=holdResponse(c,q=>q.method()==='PATCH');
 try{
  c.r.db.exec("UPDATE united_history_claims SET attendance_status='pending',sns_status='pending'");
  await page.goto('/admin.html?section=dashboard&event=e');await expect(page.locator('[data-dashboard-edit]')).toBeEnabled();
  await page.locator('[data-widget="approvals"] [data-dashboard-destination="history"]').click();const card=page.locator('[data-history-id="h"]');await card.locator('summary').click();
  const sns=card.locator('[data-history-review="sns"] textarea');await sns.fill('Neodeslaný S&S důvod');
  await card.locator('[data-history-review="attendance"] [data-history-action="approved"]').click();await b.arrived;
  await sns.click();await sns.evaluate(n=>n.setSelectionRange(2,6));b.release();
  await expect(card.locator('[data-history-review="attendance"] .admin-history-decision-head')).toContainText('Schváleno');
  await expect(card.locator('[data-history-review="attendance"] [data-history-action="approved"]')).toHaveCount(0);
  await expect(sns).toHaveValue('Neodeslaný S&S důvod');await expect(sns).toBeFocused();expect(await sns.evaluate(n=>[n.selectionStart,n.selectionEnd])).toEqual([2,6]);await expect(card).toHaveAttribute('data-operation-state','dirty');
  expect(c.r.db.prepare("SELECT sns_status s FROM united_history_claims WHERE id='h'").get().s).toBe('pending');expect(c.writes.map(w=>w.component)).toEqual(['attendance']);clean(c);
 }finally{b.release();c.r.db.close();}
});

test('CONFIRMED dashboard save keeps configuration edited after send instead of closing it',async({page})=>{
 const c=await commandFixture(page),b=holdResponse(c,q=>q.method()==='PUT');
 try{
  await page.goto('/admin.html?section=dashboard&event=e');await expect(page.locator('[data-dashboard-edit]')).toBeEnabled();await page.locator('[data-dashboard-edit]').click();
  await page.locator('[data-widget-toggle="recent"]').uncheck();await page.locator('[data-dashboard-save]').click();await b.arrived;
  await page.locator('[data-widget-toggle="trend"]').uncheck();b.release();
  const form=page.locator('[data-dashboard-preferences]');await expect(form).toHaveAttribute('data-operation-state','dirty');await expect(form).toBeVisible();
  await expect(page.locator('[data-widget-toggle="trend"]')).not.toBeChecked();await expect(page.locator('[data-widget-toggle="recent"]')).not.toBeChecked();
  expect(c.stored().value.compositions.preparation.widgets.some(w=>w.id==='trend')).toBe(true);expect(c.stored().value.compositions.preparation.widgets.some(w=>w.id==='recent')).toBe(false);expect(c.writes).toHaveLength(1);clean(c);
 }finally{b.release();c.r.db.close();}
});

for(const area of ['accommodation','event'])test('CONFIRMED '+area+' retains latest deferred projection and flushes after clean focus leaves without refetch',async({page})=>{
 const c=await commandFixture(page);
 try{
  await page.goto(`/admin.html?section=${area==='event'?'settings':'reservations'}&view=${area}&event=e`);
  const root=page.locator(area==='event'?'[data-event-settings-form]':'[data-accommodation-id="cab"]');
  if(area==='accommodation')await root.locator('summary').click();
  const field=root.locator(area==='event'?'[name="reservationCapacity"]':'[name="name"]');await expect(field).toBeEnabled();await field.click();
  const old=await field.inputValue();
  c.r.db.exec(area==='event'?"UPDATE events SET reservation_capacity=321 WHERE id='e'":"UPDATE event_accommodation_options SET name='Nejnovější Chatka' WHERE id='cab'");
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(root).toHaveAttribute('data-render-pending','true');await expect(field).toHaveValue(old);await expect(field).toBeFocused();
  await expect(page.locator('[data-admin-freshness]')).toHaveAttribute('data-state','fresh');const reads=c.calls.length;
  await page.locator('.admin-section-nav [data-portal-target="dashboard"]').focus();
  await expect(root).not.toHaveAttribute('data-render-pending','true');await expect(field).toHaveValue(area==='event'?'321':'Nejnovější Chatka');expect(c.calls.length).toBe(reads);expect(c.writes).toEqual([]);clean(c);
 }finally{c.r.db.close();}
});

test('CONFIRMED gallery save retains post-send note and renders its confirmed status',async({page})=>{
 const c=await commandFixture(page),b=holdResponse(c,q=>q.method()==='PATCH');
 try{
  c.r.db.exec("UPDATE gallery_submissions SET status='pending' WHERE id='g'");
  await page.goto('/admin.html?section=community&view=gallery&event=e');await page.locator('[data-gallery-preview="g"]').click();
  const box=page.locator('[data-gallery-lightbox]'),input=box.locator('[data-gallery-review-note]');await input.fill('odesláno');await box.locator('[data-gallery-action="approved"]').click();await b.arrived;
  await input.fill('nový lokální text');b.release();await expect(box.locator('[data-gallery-action="approved"]')).toHaveCount(0);await expect(page.locator('[data-admin-freshness]')).toHaveAttribute('data-state','fresh');await expect(input).toHaveValue('nový lokální text');await expect(input).toBeFocused();
  await expect(box.locator('article')).toHaveAttribute('data-operation-state','dirty');expect(c.r.db.prepare("SELECT review_note n FROM gallery_submissions WHERE id='g'").get().n).toBe('odesláno');expect(c.writes).toHaveLength(1);clean(c);
 }finally{b.release();c.r.db.close();}
});

test('CONFIRMED mark fully paid applies the explicit amount without creating a phantom draft',async({page})=>{
 const c=await commandFixture(page);
 try{
  await open(page,c);await page.locator('[data-payment-full]').click();
  await expect(amount(page)).toHaveValue('1000');await expect.poll(async()=>(await state(page)).detail.payment.amountPaidCzk).toBe(1000);
  expect(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.includes('.draft.reservation:r')))).toEqual([]);expect(c.writes.map(w=>w.component)).toEqual(['payment']);clean(c);
 }finally{c.r.db.close();}
});

test('CONFIRMED local accommodation photo remains protected during a read and is discarded only by explicit navigation',async({page})=>{
 const c=await commandFixture(page);
 try{
  await page.goto('/admin.html?section=reservations&view=accommodation&event=e');const card=page.locator('[data-accommodation-id="cab"]');
  await card.locator('[data-accommodation-photo-input]').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=','base64')});
  const preview=card.locator('[data-accommodation-photo-preview] img'),url=await preview.getAttribute('src');expect(url).toMatch(/^blob:/);
  c.r.db.exec("UPDATE event_accommodation_options SET name='Nová serverová hodnota' WHERE id='cab'");await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(card).toHaveAttribute('data-render-pending','true');await expect(card).toHaveAttribute('data-local-file','true');await expect(preview).toHaveAttribute('src',url);await expect(card.locator('h3')).toHaveText('Chatka');
  page.once('dialog',dialog=>dialog.accept());await page.locator('.admin-section-nav [data-portal-target="dashboard"]').click();await expect(page.locator('[data-admin-panel="dashboard"]')).toBeVisible();
  await expect(page.locator('[data-render-pending="true"]')).toHaveCount(0);expect(c.writes).toEqual([]);clean(c);
 }finally{c.r.db.close();}
});

test('CONFIRMED a blocked accommodation list must not rebase another still-unrendered card',async({page})=>{
 const c=await commandFixture(page);
 try{
  await page.goto('/admin.html?section=reservations&view=accommodation&event=e');const cab=page.locator('[data-accommodation-id="cab"]'),tent=page.locator('[data-accommodation-id="tent"]');await cab.locator('summary').click();await cab.locator('[name="name"]').fill('místní koncept');
  const before=await tent.getAttribute('data-base-revision');c.r.db.exec("UPDATE event_accommodation_options SET name='Novější serverový stan' WHERE id='tent'");await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(cab).toHaveAttribute('data-render-pending','true');await expect(page.locator('[data-admin-freshness]')).toHaveAttribute('data-state','fresh');
  await expect(tent.locator('[name="name"]')).toHaveValue('Stan');await expect(tent).toHaveAttribute('data-base-revision',before);expect(c.writes).toEqual([]);clean(c);
 }finally{c.r.db.close();}
});
