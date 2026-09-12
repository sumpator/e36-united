import {test,expect} from '@playwright/test';
import {accommodationOptions,prepareE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';
test.use({viewport:{width:390,height:844}});
const headers={'Access-Control-Allow-Origin':'*','Content-Type':'application/json'};
const reply=(route,body,status=200)=>route.fulfill({status,headers,body:JSON.stringify(body)});
async function clickReady(locator){await locator.scrollIntoViewIfNeeded();await expect(locator).toBeInViewport();await expect(locator).toBeEnabled();await locator.click()}
const paidReservation={id:'reservation-flow-e2e',eventId:'united-2026',eventYear:2026,title:'E36 United 2026',carId:'car-001',carSnapshot:{id:'car-001',nickname:'Estoril',body:'Coupé',model:'328i'},arrival:'Sobota',crew:2,attendanceType:'saturday_only',accommodation:'Chatka',accommodationUnits:2,accommodationSnapshot:{optionId:'cabin-premium',optionName:'Chatka Premium',kind:'cabin',capacityPerUnit:3,peopleCount:2,unitCount:1,unitPriceCzk:1650,personPriceCzk:0,beddingFeePerPersonCzk:120,cityTaxPerPersonPerNightCzk:25,nights:1,baseTotalCzk:1650,personTotalCzk:0,beddingTotalCzk:240,cityTaxTotalCzk:50,totalCzk:1940},showShine:'Ne',note:'Platná rezervace',status:'approved',amountDueCzk:1940,amountPaidCzk:1940,payment:{amountDueCzk:1940,amountPaidCzk:1940,balanceCzk:0,remainingCzk:0,overpaymentCzk:0,status:'paid',overdue:false,variableSymbol:'2026123456',recipientName:'E36 UNITED TEST',accountDisplay:'123 / 9999',iban:'CZ5099990000000000000123',currency:'CZK',message:'E36 UNITED 2026',deadline:'2026-12-01',testMode:true,configurationReady:true,actionable:false,awaitingApproval:false,spayd:null}};
const reservationCars=[{id:'car-001',nickname:'Estoril',body:'Coupé',model:'328i',year:1996,color:'Estoril Blau',primary:true,photos:[]},{id:'car-002',nickname:'Touring',body:'Touring',model:'325i',year:1995,color:'Schwarz',primary:false,photos:[]}];
async function login(page){
  const form=page.locator('[data-auth-form="login"]');
  await expect(form).toBeVisible();await form.locator('[name=email]').fill('eva@example.test');await form.locator('[name=password]').fill('fixture-password');
  await form.locator('[type=submit]').click();await expect(page.locator('[data-app-view]')).toBeVisible();
}

test('finished public Show and Shine keeps eight compact criteria aligned with its visual',async({page})=>{
 const observations=await prepareE2ePage(page);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});await page.goto('/');await page.evaluate(()=>history.replaceState(null,'','#show-shine'));
  await expect(page.locator('.showshine-disclosure-trigger strong')).toHaveText('Co všechno porota kontroluje?');await expect(page.locator('.showshine-judging-head')).toHaveCount(0);
  const disclosure=page.locator('.showshine-disclosure'),trigger=page.locator('.showshine-disclosure-trigger');await disclosure.evaluate(element=>{element.open=false});await trigger.evaluate(element=>element.scrollIntoView({behavior:'instant',block:'center'}));await expect(trigger).toBeInViewport();await expect(disclosure).not.toHaveAttribute('open','');await trigger.click();await expect(disclosure).toHaveAttribute('open','');await expect(page.locator('.judging-criterion')).toHaveCount(8);
  await disclosure.evaluate(async element=>{const panel=element.querySelector('.showshine-judging'),animations=panel.getAnimations().filter(animation=>animation.playState==='running'||animation.playState==='pending');await Promise.all(animations.map(animation=>animation.finished))});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(width===1440){const {criteria,visual}=await page.evaluate(()=>{const criteriaRect=document.querySelector('.judging-criteria')?.getBoundingClientRect(),visualRect=document.querySelector('.judging-stage')?.getBoundingClientRect();if(!criteriaRect||!visualRect)throw new Error('Show & Shine geometry is unavailable');return{criteria:{y:criteriaRect.y,height:criteriaRect.height},visual:{y:visualRect.y,height:visualRect.height}}});expect(Math.abs(criteria.y-visual.y)).toBeLessThanOrEqual(1);expect(Math.abs(criteria.height-visual.height)).toBeLessThanOrEqual(1);expect(criteria.height).toBeLessThanOrEqual(420);}
 }
 expectNoUnexpectedClientErrors(observations);
});

test('ACCOMMODATION GALLERY loads extras lazily, restores focus and supports mobile swipe',async({page})=>{
 const observations=await prepareE2ePage(page);await page.setViewportSize({width:1440,height:900});await page.goto('/#planer');
 const trigger=page.locator('[data-context-preview="sleep"]'),cue=trigger.locator('[data-context-accommodation-gallery-cue]');
 await expect(trigger).toHaveAttribute('data-accommodation-gallery-bound','true');await page.locator('[data-accommodation-option-id="cabin-standard"]').click();
 await expect(cue).toBeVisible();await expect(cue).toContainText('5');
 expect(observations.requests.filter(value=>value.includes('/accommodation/')&&value.includes('/gallery/'))).toHaveLength(0);
 await trigger.click();const dialog=page.locator('.accommodation-gallery-dialog');await expect(dialog).toBeVisible();await expect(dialog.locator('figcaption>span')).toHaveText('1 / 5');
 expect(observations.requests.filter(value=>value.includes('/accommodation/')&&value.includes('/gallery/'))).toHaveLength(0);
 await dialog.locator('.accommodation-gallery-arrow--next').click();await expect(dialog.locator('figcaption>span')).toHaveText('2 / 5');
 await expect.poll(()=>observations.requests.filter(value=>value.includes('/accommodation/')&&value.includes('/gallery/')).length).toBe(1);
 await page.screenshot({path:'test-results/accommodation-gallery-planner.png',fullPage:false});
 await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(trigger).toBeFocused();
 await page.setViewportSize({width:390,height:844});const mobileTrigger=page.locator('[data-preview-card="sleep"]');await mobileTrigger.scrollIntoViewIfNeeded();await mobileTrigger.click();await expect(dialog).toBeVisible();
 await dialog.dispatchEvent('pointerdown',{pointerType:'touch',clientX:280,clientY:420});await dialog.dispatchEvent('pointerup',{pointerType:'touch',clientX:100,clientY:422});
 await expect(dialog.locator('figcaption>span')).toHaveText('2 / 5');await page.screenshot({path:'test-results/accommodation-gallery-mobile.png',fullPage:false});
 await dialog.locator('.accommodation-gallery-close').click();await expect(mobileTrigger).toBeFocused();expectNoUnexpectedClientErrors(observations);
});

test('ACCOMMODATION GALLERY is reused by the member reservation without eager extra media',async({page})=>{
 const reservation={...paidReservation,accommodationSnapshot:{...paidReservation.accommodationSnapshot,optionId:'cabin-standard',optionName:'Chatka Standard'}};
 const observations=await prepareE2ePage(page,{authenticated:true,reservation});await page.goto('/member.html?section=reservation');
 const trigger=page.locator('.reservation-unified-card [data-member-accommodation-gallery]:visible');await expect(trigger).toBeVisible();expect(observations.requests.filter(value=>value.includes('/accommodation/')&&value.includes('/gallery/'))).toHaveLength(0);
 await trigger.click();const dialog=page.locator('.accommodation-gallery-dialog');await expect(dialog).toBeVisible();await expect(dialog.locator('figcaption>span')).toHaveText('1 / 5');expect(observations.requests.filter(value=>value.includes('/accommodation/')&&value.includes('/gallery/'))).toHaveLength(0);
 await dialog.locator('.accommodation-gallery-arrow--next').click();await expect(dialog.locator('figcaption>span')).toHaveText('2 / 5');await expect.poll(()=>observations.requests.filter(value=>value.includes('/accommodation/')&&value.includes('/gallery/')).length).toBe(1);
 await page.keyboard.press('Escape');await expect(trigger).toBeFocused();expectNoUnexpectedClientErrors(observations);
});

test('ACCOMMODATION GALLERY keeps judging disclosure explicit and venue first',async({page})=>{
 const observations=await prepareE2ePage(page);await page.setViewportSize({width:1440,height:900});await page.goto('/#show-shine');
 const disclosure=page.locator('.showshine-disclosure'),summary=page.locator('.showshine-disclosure-trigger');await expect(summary).toHaveAttribute('aria-expanded','false');await expect(summary).toHaveCSS('cursor','pointer');
 await summary.click();await expect(disclosure).toHaveAttribute('open','');await expect(summary).toHaveAttribute('aria-expanded','true');await page.screenshot({path:'test-results/showshine-disclosure.png',fullPage:false});
 await page.locator('#info-hub').evaluate(element=>element.scrollIntoView({behavior:'instant'}));const expanders=page.locator('.info-expanders>.info-expander');await expect(expanders.first()).toHaveAttribute('id','venue-details-panel');await expect(expanders.first()).toHaveAttribute('open','');await expect(expanders.first().locator('summary strong')).toHaveText('Místo konání — Kemp Zbraslavice');
 await expect(page.locator('#kontakt a[href="mailto:united@e36united.cz"]')).toBeVisible();await expect(page.locator('#kontakt a[href^="tel:"]')).toHaveCount(0);await expect(page.locator('.footer-contact[href="mailto:united@e36united.cz"]')).toHaveCount(1);await expect(page.locator('#info-hub .section-head')).toHaveClass(/is-visible/);await page.locator('#info-hub').evaluate(async element=>{const animations=element.getAnimations({subtree:true}).filter(animation=>animation.playState==='running'||animation.playState==='pending');await Promise.all(animations.map(animation=>animation.finished))});await page.screenshot({path:'test-results/info-hub-upper.png',fullPage:false});expectNoUnexpectedClientErrors(observations);
});

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
  const plannerMail=page.locator('[data-planner-mail]'),plannerChoice=page.locator('[data-inquiry-modal]'),plannerLogin=page.locator('[data-planner-login]');
  await expect(plannerMail).toBeVisible();await expect(plannerMail).toBeEnabled();await expect(plannerMail).toHaveAttribute('href','member.html?section=reservation');
  await plannerMail.scrollIntoViewIfNeeded();await expect(plannerMail).toBeInViewport();await plannerMail.click();
  await expect(plannerChoice).toBeVisible();await expect(plannerLogin).toBeVisible();await plannerLogin.click();
  await expect(page).toHaveURL(/member.html\?mode=login&section=reservation&draft=/);
  await login(page);await expect(page.locator('[data-member-panel="reservation"]')).toBeVisible();
  await expect(page.locator('[data-planner-handoff]')).toBeVisible();await expect(page.locator('[data-planner-handoff-recap]')).toContainText('Pátek');
  expect(context.pages()).toHaveLength(1);await expect.poll(()=>tracked?.draftId).toBeTruthy();
  expect(new URL(page.url()).searchParams.get('draft')).toBe(tracked.draftId);
  expect(observations.requests).toContain('POST /api/planner-handoffs/claim');
  await page.reload();await expect(page.locator('[data-planner-handoff]')).toBeVisible();
  expectNoUnexpectedClientErrors(observations);
});

test('a stalled optional tracking module cannot block the public Planner handoff',async({page,context})=>{
  const observations=await prepareE2ePage(page);let stalled=false,release;
  const gate=new Promise(resolve=>{release=resolve});
  await page.route('**/public-planner-handoff.js?*',async route=>{stalled=true;await gate;await route.abort().catch(()=>{})});
  try{
    await page.goto('/#planer',{waitUntil:'domcontentloaded'});
    await expect.poll(()=>stalled).toBe(true);await expect(page.locator('[data-accommodation-option-id="cabin-standard"]')).toBeVisible();
    await page.locator('[data-planner-mail]').click();await page.locator('[data-planner-login]').click();
    await expect(page).toHaveURL(/member.html\?mode=login&section=reservation&draft=/);
    await login(page);await expect(page.locator('[data-planner-handoff]')).toBeVisible();
    expect(context.pages()).toHaveLength(1);expectNoUnexpectedClientErrors(observations);
  }finally{release()}
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

test('authenticated Planner opens an existing reservation without creating another handoff',async({page,context})=>{
  const observations=await prepareE2ePage(page,{authenticated:true,reservation:paidReservation});
  await page.goto('/#planer');const cta=page.locator('[data-planner-mail]');await expect(cta).toContainText('Otevřít aktuální rezervaci');await expect(page.locator('.planner-actionbar-copy strong')).toContainText('Rezervaci už máš');
  await clickReady(cta);await expect(page).toHaveURL(/member\.html\?section=reservation$/);await expect(page.locator('[data-member-panel="reservation"]')).toBeVisible();
  expect(observations.requests.some(item=>item==='POST /api/planner-handoffs')).toBe(false);expect(context.pages()).toHaveLength(1);expectNoUnexpectedClientErrors(observations);
});

test('authenticated Planner without a reservation transfers one plan and gives processing feedback',async({page,context})=>{
  const observations=await prepareE2ePage(page,{authenticated:true});
  await page.goto('/#planer');const cta=page.locator('[data-planner-mail]');await expect(cta).toContainText('Dokončit v Můj United');
  await clickReady(cta);await expect(page).toHaveURL(/member\.html\?section=reservation&draft=/);await expect(page.locator('[data-planner-handoff]')).toBeVisible();
  await expect.poll(()=>observations.requests.filter(item=>item==='POST /api/planner-handoffs').length).toBe(1);expect(context.pages()).toHaveLength(1);expectNoUnexpectedClientErrors(observations);
});

test('approved reservation change supports sold-out inquiry, compact layouts and persistent acknowledgement',async({page},info)=>{
  const accommodations=accommodationOptions.map(option=>option.id==='cabin-standard'?{...option,freeUnits:0,soldOut:true}:option);
  const observations=await prepareE2ePage(page,{authenticated:true,registrationOpen:true,reservation:paidReservation,cars:reservationCars,accommodations,ignoreConsoleError:entry=>(entry.text.includes('Reservation save failed')&&entry.text.includes('Žádost obsahuje nepovolené údaje'))||(entry.url.endsWith('/api/reservations/current/requests')&&entry.text.includes('status of 400'))});let rejectOnce=true;
  await page.route('https://api.e36united.cz/api/reservations/current/requests',async route=>{if(route.request().method()==='POST'&&rejectOnce){rejectOnce=false;await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({ok:false,error:'invalid_fields',message:'Žádost obsahuje nepovolené údaje.'})});return}await route.fallback()});
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/member.html?section=reservation');
  await expect(page.locator('[data-reservation-payment-detail]')).toContainText('Zaplaceno');
  const statusCard=page.locator('.reservation-status-card'),detailCard=page.locator('.reservation-unified-card');
  await expect(statusCard).toContainText('STAV REZERVACE');
  await expect(detailCard).not.toContainText('STAV REZERVACE');
  await expect(detailCard.locator('.reservation-unified-head')).toContainText('Tvoje rezervace');
  await expect(page.locator('[data-member-payment]')).toHaveCount(0);
  const statusBox=await statusCard.boundingBox(),detailBox=await detailCard.boundingBox();
  expect(detailBox.y-statusBox.y-statusBox.height).toBeGreaterThanOrEqual(10);
  const heroBox=await page.locator('.reservation-hero-strip').boundingBox();
  expect(heroBox.height).toBeGreaterThanOrEqual(160);expect(heroBox.height).toBeLessThanOrEqual(220);
  const detailGeometry=await detailCard.evaluate(node=>{
    const grid=node.querySelector('.reservation-detail-grid'),left=node.querySelector('[data-reservation-card]'),right=node.querySelector('.reservation-control-stack'),tiles=[...node.querySelectorAll('[data-reservation-summary]>div')];
    const gridRect=grid.getBoundingClientRect(),leftRect=left.getBoundingClientRect(),rightRect=right.getBoundingClientRect();
    return{columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,gap:rightRect.left-leftRect.right,left:leftRect,right:rightRect,leftRatio:leftRect.width/gridRect.width,tileRects:tiles.map(tile=>tile.getBoundingClientRect()),leftRadius:parseFloat(getComputedStyle(left).borderRadius),rightRadius:parseFloat(getComputedStyle(right).borderRadius)};
  });
  expect(detailGeometry.columns).toBe(2);expect(Math.abs(detailGeometry.left.y-detailGeometry.right.y)).toBeLessThanOrEqual(1);expect(detailGeometry.gap).toBeGreaterThanOrEqual(12);expect(detailGeometry.leftRatio).toBeGreaterThan(.35);expect(detailGeometry.leftRatio).toBeLessThan(.45);expect(detailGeometry.leftRadius).toBeGreaterThan(0);expect(detailGeometry.rightRadius).toBeGreaterThan(0);
  for(const [index,tile] of detailGeometry.tileRects.entries()){expect(tile.left,`reservation tile ${index+1} starts inside the summary panel`).toBeGreaterThanOrEqual(detailGeometry.left.left-1);expect(tile.right,`reservation tile ${index+1} ends inside the summary panel`).toBeLessThanOrEqual(detailGeometry.left.right+1)}
  expect(Math.abs(detailGeometry.tileRects[0].height-detailGeometry.tileRects[1].height)).toBeLessThanOrEqual(1);expect(Math.abs(detailGeometry.tileRects[2].height-detailGeometry.tileRects[3].height)).toBeLessThanOrEqual(1);
  await expect(page.locator('[data-reservation-summary]>div')).toHaveCount(5);await expect(detailCard.locator('[data-reservation-car-choice]')).toBeVisible();await expect(detailCard.locator('[data-reservation-car-choice]')).toContainText('Změnit auto');await expect(detailCard.locator('[data-reservation-car-choice]')).not.toContainText('bez nového schvalování');await expect(page.locator('[data-reservation-form-car]')).toBeHidden();await expect(detailCard.locator('.member-saved-accommodation-visual')).toHaveCount(1);await expect(page.locator('[data-reservation-summary] .accommodation-visual')).toHaveCount(0);
  await page.screenshot({path:info.outputPath('reservation-detail-desktop.png'),fullPage:true});
  await page.locator('[data-reservation-car-select]').selectOption('car-002');await clickReady(page.locator('[data-reservation-car-save]'));
  await expect.poll(()=>observations.reservationCarWrites.length).toBe(1);expect(observations.reservationCarWrites[0]).toEqual({carId:'car-002'});await expect(page.locator('[data-reservation-summary]')).toContainText('Touring');
  const form=page.locator('[data-reservation-form]'),feedback=page.locator('[data-reservation-form-status]');await clickReady(page.locator('[data-request-change]'));await expect(form).toHaveClass(/is-editing/);await expect(form.locator('.reservation-form-row')).toHaveCount(3);await expect(page.locator('[data-reservation-summary]')).toContainText('Chatka Premium');await expect(form.locator('[name=accommodationOptionId]')).toBeEnabled();await expect(form.locator('[name=accommodationOptionId] option[value="cabin-standard"]')).toContainText('VYPRODÁNO — LZE POŽÁDAT INDIVIDUÁLNĚ');await form.locator('[name=accommodationOptionId]').selectOption('cabin-standard');await expect(page.locator('[data-accommodation-availability]')).toContainText('individuální žádost');await form.locator('[name=crew]').fill('3');
  await page.setViewportSize({width:390,height:844});
  const mobileOrder=await page.evaluate(()=>{const status=document.querySelector('.reservation-status-card').getBoundingClientRect(),left=document.querySelector('[data-reservation-card]').getBoundingClientRect(),right=document.querySelector('.reservation-control-stack').getBoundingClientRect(),payment=document.querySelector('[data-reservation-payment-detail]').getBoundingClientRect(),tiles=[...document.querySelectorAll('[data-reservation-summary]>div')].map(node=>node.getBoundingClientRect());return{statusBottom:status.bottom,leftTop:left.top,leftBottom:left.bottom,leftLeft:left.left,leftRight:left.right,rightTop:right.top,rightBottom:right.bottom,paymentTop:payment.top,tiles,overflow:document.documentElement.scrollWidth>innerWidth}});
  expect(mobileOrder.overflow).toBe(false);expect(mobileOrder.statusBottom).toBeLessThan(mobileOrder.leftTop);expect(mobileOrder.leftBottom).toBeLessThan(mobileOrder.rightTop);expect(mobileOrder.rightBottom).toBeLessThan(mobileOrder.paymentTop);for(const tile of mobileOrder.tiles){expect(tile.left).toBeGreaterThanOrEqual(mobileOrder.leftLeft-1);expect(tile.right).toBeLessThanOrEqual(mobileOrder.leftRight+1)}
  expect(await detailCard.locator('.reservation-detail-grid').evaluate(node=>getComputedStyle(node).gridTemplateColumns.split(' ').length)).toBe(1);
  await page.screenshot({path:info.outputPath('reservation-detail-mobile-390.png'),fullPage:true});
  await page.setViewportSize({width:1440,height:1000});await clickReady(page.locator('[data-reservation-submit]'));
  await expect(feedback).toHaveAttribute('data-state','error');await expect(feedback).toContainText('Žádost obsahuje nepovolené údaje');await expect(form.locator('[name=accommodationOptionId]')).toHaveValue('cabin-standard');await clickReady(page.locator('[data-reservation-submit]'));
  await expect.poll(()=>observations.reservationRequestWrites.length).toBe(1);expect(observations.reservationRequestWrites[0]).toMatchObject({reservationId:'reservation-flow-e2e',type:'change',crew:3,accommodationOptionId:'cabin-standard'});
  expect(observations.reservationRequestWrites[0]).not.toHaveProperty('carId');expect(observations.reservationRequestWrites[0]).not.toHaveProperty('attendanceType');expect(observations.reservationWrites).toEqual([]);await expect(page.locator('[data-reservation-request-status]')).toContainText('čeká na rozhodnutí');await expect(feedback).toHaveAttribute('data-state','success');await expect(feedback).toContainText('Žádost o změnu byla odeslána ke schválení');await expect(form).toHaveClass(/is-view-mode/);
  const approvedRequest={...observations.reservationRequestWrites[0],id:'request-e2e',type:'change',status:'approved',proposed:{...observations.reservationRequestWrites[0],amountDueCzk:1700,accommodationSnapshot:{optionId:'cabin-standard',optionName:'Chatka Standard'}},memberNote:'Prosím o změnu.',adminComment:'Změna je schválená.',memberAcknowledgedAt:null,createdAt:'2026-09-11T10:00:00Z'};
  observations.setReservation({...paidReservation,crew:3,accommodationSnapshot:{...paidReservation.accommodationSnapshot,optionId:'cabin-standard',optionName:'Chatka Standard'},request:approvedRequest,changePending:false});await page.reload();
  const result=page.locator('[data-reservation-request-status]');await expect(result).toContainText('Žádost byla schválena');await expect(result).toContainText('Změna je schválená.');await clickReady(result.locator('[data-reservation-request-acknowledge]'));await expect(result).toBeHidden();expect(observations.reservationRequestAcknowledgements).toEqual(['/api/reservations/reservation-flow-e2e/requests/request-e2e/acknowledge']);await page.reload();await expect(result).toBeHidden();expectNoUnexpectedClientErrors(observations);
});

test('existing rejected reservation hides a stale Planner handoff and never presents a closed registration action',async({page})=>{
 const rejected={...paidReservation,status:'rejected',payment:null,amountPaidCzk:0};const draftId='22222222-2222-4222-8222-222222222222';
 const observations=await prepareE2ePage(page,{authenticated:true,reservation:rejected});await page.addInitScript(({draftId})=>{const now=Date.now();localStorage.setItem('e36UnitedPlannerHandoff:'+draftId,JSON.stringify({version:1,draftId,source:'weekend-planner',eventId:'united-2026',eventYear:2026,createdAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+86400000).toISOString(),arrival:'Pátek',departure:'Neděle',nights:2,attendanceType:'full_weekend',accommodation:'Bez ubytování',accommodationOptionId:null,accommodationUnits:0,crew:2,showShine:'Ne'}))},{draftId});
 await page.goto(`/member.html?section=reservation&draft=${draftId}`);await expect(page.locator('[data-planner-handoff]')).toBeHidden();const action=page.locator('[data-reservation-submit]');await expect(action).toBeDisabled();await expect(action).toHaveText('Rezervace byla zamítnuta');await expect(action).toHaveClass(/is-rejected-closed/);await expect(page.locator('.reservation-unified-card .member-saved-accommodation-visual')).toHaveCount(1);expectNoUnexpectedClientErrors(observations);
});

test('paid reservation cancellation remains a request and keeps payment visible',async({page})=>{
  const observations=await prepareE2ePage(page,{authenticated:true,reservation:paidReservation});await page.goto('/member.html?section=reservation');
  await clickReady(page.locator('[data-request-cancel-open]'));await expect(page.locator('[data-cancel-request]')).toBeVisible();await page.locator('[data-cancel-request-note]').fill('Nemohu přijet.');await clickReady(page.locator('[data-request-cancel-submit]'));
  await expect.poll(()=>observations.reservationRequestWrites.length).toBe(1);expect(observations.reservationRequestWrites[0]).toEqual({reservationId:'reservation-flow-e2e',type:'cancellation',memberNote:'Nemohu přijet.'});
  expect(observations.reservationWrites).toEqual([]);await expect(page.locator('[data-reservation-request-status]')).toContainText('ŽÁDOST O ZRUŠENÍ');await expect(page.locator('[data-reservation-payment-detail]')).toContainText('Zaplaceno');expectNoUnexpectedClientErrors(observations);
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
