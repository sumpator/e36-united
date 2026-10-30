import {test,expect} from '@playwright/test';
import {prepareE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';
for(const width of [390,1366]) test(`public Planner keeps accommodation control and viewport ${width}`,async({page})=>{
 await page.setViewportSize({width,height:844});const observations=await prepareE2ePage(page);await page.goto('/#planer');
 const card=page.locator('[data-accommodation-option-id="cabin-premium"]');await expect(card).toBeVisible();await card.scrollIntoViewIfNeeded();await card.focus();
 const before=await card.boundingBox();await page.keyboard.press('Enter');
 await expect(card).toHaveAttribute('aria-pressed','true');await expect(card).toBeFocused();
 await expect.poll(async()=>Math.abs((await card.boundingBox()).y-before.y)).toBeLessThan(2);
 await expect(page.locator('[data-planner-price-preview]')).toContainText('Chatka Premium');expectNoUnexpectedClientErrors(observations);
});
test('public Planner restores latest valid choices after reload',async({page})=>{
 const observations=await prepareE2ePage(page);await page.goto('/#planer');
 await page.locator('[data-stay-index="2"]').click();await page.locator('[data-accommodation-option-id="cabin-premium"]').click();await page.locator('[data-people-plus]').click();
 await page.locator('[data-planner-partial-accommodation]').check();await page.locator('[data-accommodation-units-minus]').click();
 await page.reload();await expect(page.locator('[data-stay-index="2"]')).toHaveAttribute('aria-pressed','true');await expect(page.locator('[data-accommodation-option-id="cabin-premium"]')).toHaveAttribute('aria-pressed','true');await expect(page.locator('[data-people]')).toHaveText('3');await expect(page.locator('[data-accommodation-units]')).toHaveText('2');expectNoUnexpectedClientErrors(observations);
});
for(const width of [390,768,1920])test(`public Planner dependent choices keep controls under the pointer ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1024});const observations=await prepareE2ePage(page);await page.goto('/');await expect(page.locator('[data-accommodation-option-id="cabin-standard"]')).toBeVisible();
 await page.evaluate(()=>document.addEventListener('e36:planner',event=>{window.__lastPlan=event.detail}));
 const change=async selector=>test.step(selector,async()=>{const control=page.locator(selector);
  // Start at a usable reading position, away from the fixed navigation. Capture
  // pointerdown so browser actionability scrolling is not mistaken for app movement.
  await control.evaluate(async el=>{el.scrollIntoView({block:'center',behavior:'instant'});await new Promise(resolve=>{let last=null,stable=0;const frame=()=>{const y=el.getBoundingClientRect().y;if(last!==null&&Math.abs(y-last)<.25)stable++;else stable=0;last=y;if(stable>=3)resolve();else requestAnimationFrame(frame)};requestAnimationFrame(frame)});el.addEventListener('pointerdown',()=>{window.__controlBefore={y:el.getBoundingClientRect().y,scroll:scrollY}}, {once:true})});
  await control.click();const before=await page.evaluate(()=>window.__controlBefore);await expect.poll(async()=>Math.abs((await control.boundingBox()).y-before.y)).toBeLessThan(3);
 });
 for(const index of [1,2,3,0])await change(`[data-stay-index="${index}"]`);
 await change('[data-accommodation-option-id="cabin-standard"]');await change('[data-people-plus]');await change('[data-planner-partial-accommodation]');await change('[data-accommodation-units-minus]');
 await expect.poll(()=>page.evaluate(()=>window.__lastPlan)).toMatchObject({people:3,accommodationUnits:2,partialAccommodation:true});
 await change('[data-people-minus]');await change('[data-people-minus]');await expect.poll(()=>page.evaluate(()=>window.__lastPlan)).toMatchObject({people:1,accommodationUnits:1,partialAccommodation:false});
 await change('[data-choice-group="sleep"] [data-value="Bez ubytování"]');await expect.poll(()=>page.evaluate(()=>window.__lastPlan)).toMatchObject({accommodationUnits:0,accommodationOptionId:null});
 await change('[data-choice-group="sleep"] [data-value="Chatka"]');await change('[data-accommodation-option-id="cabin-premium"]');
 await change('[data-choice-group="showshine"] [data-value="Chci soutěžit"]');await expect(page.locator('[data-planner-recap]')).toContainText('Ano!');
 expectNoUnexpectedClientErrors(observations);
});
test('public Planner does not restore another event or invalid saved draft',async({page})=>{
 const observations=await prepareE2ePage(page);await page.goto('/#planer');await page.locator('[data-stay-index="2"]').click();
 await page.evaluate(()=>{const key='e36UnitedPublicPlanner:v1',draft=JSON.parse(localStorage.getItem(key));draft.eventId='united-2025';localStorage.setItem(key,JSON.stringify(draft))});
 await page.reload();await expect(page.locator('[data-accommodation-option-id="cabin-standard"]')).toBeVisible();await expect(page.locator('[data-stay-index="0"]')).toHaveAttribute('aria-pressed','true');
 await page.evaluate(()=>localStorage.setItem('e36UnitedPublicPlanner:v1','invalid-json'));await page.reload();await expect(page.locator('[data-accommodation-option-id="cabin-standard"]')).toBeVisible();await expect(page.locator('[data-stay-index="0"]')).toHaveAttribute('aria-pressed','true');expectNoUnexpectedClientErrors(observations);
});

test('public Planner explains unavailable storage and still transfers the current choice',async({page},info)=>{
 const observations=await prepareE2ePage(page);
 await page.addInitScript(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(String(key).startsWith('e36UnitedPublicPlanner')||String(key).startsWith('e36UnitedPlanner'))throw new DOMException('Denied','SecurityError');return set.call(this,key,value)}});
 await page.goto('/#planer');await page.locator('[data-stay-index="2"]').click();
 await expect(page.locator('[data-stay-index="2"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('[data-people]')).toHaveText('2');
 await page.evaluate(()=>{window.__crewClickEvidence=[];for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,event=>{if(event.target.closest('[data-people-plus]')){const rect=document.querySelector('[data-people-plus]').getBoundingClientRect();window.__crewClickEvidence.push({type,at:performance.now(),people:document.querySelector('[data-people]').textContent,target:event.target.tagName,x:event.clientX,y:event.clientY,rect:{top:rect.top,left:rect.left,width:rect.width,height:rect.height},scrollY})}},true)});
 await page.locator('[data-people-plus]').click();
 try{await expect(page.locator('[data-people]')).toHaveText('3')}finally{await info.attach('crew-click-phases',{body:JSON.stringify(await page.evaluate(()=>window.__crewClickEvidence)),contentType:'application/json'})}
 await expect(page.locator('[data-planner-storage-status]')).toContainText('neumožňuje uchovat plán');
 await expect(page.locator('[data-people]')).toHaveText('3');
 await page.locator('[data-planner-mail]').click();await page.locator('[data-planner-login]').click();
 await expect(page).toHaveURL(/member.html\?mode=login/);
 const draft=await page.evaluate(()=>{const encoded=new URLSearchParams(location.hash.slice(1)).get('handoff');return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))))});
 expect(draft).toMatchObject({crew:3,arrival:'Sobota'});
 const login=page.locator('[data-auth-form=login]');await login.locator('[name=email]').fill('eva@example.test');await login.locator('[name=password]').fill('isolated-password');await login.locator('[type=submit]').click();
 await expect(page.locator('[data-app-view]')).toBeVisible();await expect(page.locator('[data-reservation-form] [name=crew]')).toHaveValue('3');
 expect(observations.reservationWrites).toEqual([]);expectNoUnexpectedClientErrors(observations);
});

test('public Planner second tab cannot silently overwrite choices already being edited',async({page,context})=>{
 const observations=await prepareE2ePage(page);await page.goto('/#planer');await page.locator('[data-stay-index="2"]').click();
 const other=await context.newPage();const otherErrors=await prepareE2ePage(other);await other.goto('/#planer');await expect(other.locator('[data-stay-index="2"]')).toHaveAttribute('aria-pressed','true');
 await other.locator('[data-stay-index="1"]').click();await expect(other.locator('[data-stay-index="1"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('[data-stay-index="2"]')).toHaveAttribute('aria-pressed','true');
 await page.reload();await expect(page.locator('[data-stay-index="1"]')).toHaveAttribute('aria-pressed','true');
 expectNoUnexpectedClientErrors(observations);expectNoUnexpectedClientErrors(otherErrors);
});
