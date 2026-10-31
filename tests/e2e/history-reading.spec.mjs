import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {prepareE2ePage} from './fixtures.mjs';

const diagnosticPrefix='E36_HISTORY_FRAME ',hostDiagnostics=new Map();
function captureHistoryDiagnostics(page,info){
 const samples=[];hostDiagnostics.set(info.testId,samples);
 page.on('console',message=>{const text=message.text();if(!text.startsWith(diagnosticPrefix))return;const sample={...JSON.parse(text.slice(diagnosticPrefix.length)),receivedAt:Date.now()};samples.push(sample);if(samples.length>240)samples.shift()});
 for(const event of ['crash','close'])page.on(event,()=>{samples.push({stage:'page-'+event,receivedAt:Date.now()});if(samples.length>240)samples.shift()});
 return samples;
}
test.afterEach(async({},info)=>{const samples=hostDiagnostics.get(info.testId);if(samples&&info.status!==info.expectedStatus)await info.attach('history-host-frame-diagnostics',{body:JSON.stringify(samples,null,2),contentType:'application/json'});hostDiagnostics.delete(info.testId)});

async function setup(page){
 const observations=await prepareE2ePage(page);
 const image=readFileSync(new URL('../../assets/images/showshine/ss_coupe.webp',import.meta.url));
 await page.route('https://static.wixstatic.com/**',route=>route.fulfill({contentType:'image/webp',body:image}));
 return observations;
}
for(const width of [1366,390])test(`history reading line ignores reveal movement and supports year links ${width}`,async({page},info)=>{
 await captureHistoryDiagnostics(page,info);
 const observations=await setup(page);await page.setViewportSize({width,height:844});await page.goto('/o-nas.html');
 await page.evaluate(()=>document.fonts.ready);
 const entry=page.locator('.timeline-entry').nth(7);
 // Hold only the article's decorative reveal below its stable layout position.
 // Reading selection must not depend on animation progress.
 await entry.evaluate(node=>{
  node.style.transition='none';node.style.transform='translateY(18px)';
  const header=document.querySelector('.site-header').getBoundingClientRect().bottom;
  scrollTo({top:node.getBoundingClientRect().top-18+scrollY-header-68,behavior:'instant'});
 });
 await expect(page.locator('[data-history-year]')).toHaveText('2025');
 await expect(entry).toHaveClass(/is-current/);
 await entry.evaluate(node=>{node.style.transform='';node.style.transition=''});
 let previous;
 for(const index of [8,6,3,0,7]){
  const target=page.locator('.timeline-entry').nth(index);
  // First scroll the desired year into the visible story, as a reader does.
  // A marker becoming current is not evidence that the preceding native smooth
  // scroll and the decorative reveal have finished moving the next click target.
  await target.locator('.timeline-year a').evaluate(node=>node.scrollIntoView({block:'center',behavior:'instant'}));
  const geometry=await settleReading(page,target,`year-${index}-before-click`);await info.attach('year-target-'+index,{body:JSON.stringify(geometry),contentType:'application/json'});
  previous={url:page.url(),year:await page.locator('[data-history-year]').innerText(),title:await page.locator('[data-history-title]').innerText()};
  await target.locator('.timeline-year a').click();
  const year=await target.locator('.timeline-year').innerText();
  await expect(page).toHaveURL(new RegExp(`#history-${year}$`));
  await expect(page.locator('[data-history-year]')).toHaveText(year);
  await expect(target).toHaveClass(/is-current/);
  await expect(page.locator('[data-history-title]')).toHaveText(await target.locator('.timeline-copy h2').innerText());
  await settleReading(page,target,`year-${index}-after-click`);
 }
 await page.reload();await expect(page.locator('[data-history-year]')).toHaveText('2025');
 await page.goBack();await expect(page).toHaveURL(/#history-2007$/);
 // Back restores the prior scroll position, including scrolling to reach a
 // subsequent year link; the reading marker follows that restored position.
 await expect(page.locator('[data-history-year]')).toHaveText(previous.year);await expect(page.locator('[data-history-title]')).toHaveText(previous.title);
 await page.goForward();await expect(page).toHaveURL(/#history-2025$/);await expect(page.locator('[data-history-year]')).toHaveText('2025');await expect(page.locator('.timeline-entry').nth(7)).toHaveClass(/is-current/);
 const photo=entry.locator('.timeline-photo img');await photo.evaluate(image=>image.scrollIntoView({block:'center',behavior:'instant'}));await photo.evaluate(image=>image.decode());await settleReading(page,entry,'final-photo');
 if(width===1366){await entry.evaluate(node=>node.scrollIntoView({block:'start',behavior:'instant'}));await settleReading(page,entry,'final-desktop-photo');}
 for(const theme of ['light','dark']){await page.evaluate(theme=>window.dispatchEvent(new StorageEvent('storage',{key:'e36UnitedAppearance',newValue:theme})),theme);await expect(page.locator('html')).toHaveAttribute('data-theme',theme);if(width===1366){await entry.evaluate(node=>node.scrollIntoView({block:'start',behavior:'instant'}));await settleReading(page,entry,'photo-theme-'+theme);}await page.screenshot({path:info.outputPath('history-photo-'+width+'-'+theme+'.png'),animations:'disabled'});}
 expect(observations.pageErrors).toEqual([]);expect(observations.unhandledApi).toEqual([]);
});
async function settleReading(page,target,phase='finished-fill-regression'){
 return await target.evaluate((node,phase)=>new Promise(resolve=>{
  const samples=[];let previous=null,stable=0;
  const frame=()=>{
   const link=node.querySelector('.timeline-year a')||node,rect=link.getBoundingClientRect();
   const animations=node.getAnimations({subtree:true});
   const active=animations.filter(animation=>animation.pending||animation.playState==='running');
   const sample={phase,stage:'frame',performanceNow:performance.now(),dateNow:Date.now(),visibility:document.visibilityState,scrollY,x:rect.x,y:rect.y,width:rect.width,height:rect.height,activeAnimations:active.length,animations:animations.map(animation=>({playState:animation.playState,pending:animation.pending,property:animation.transitionProperty||'',currentTime:animation.currentTime}))};
   console.debug('E36_HISTORY_FRAME '+JSON.stringify(sample));
   samples.push(sample);if(samples.length>120)samples.shift();
   // Finished fill-forwards animations intentionally remain in getAnimations().
   // Sampling on rendering frames avoids repeatedly awaiting their resolved
   // finished promise, which can starve rendering indefinitely.
   const unchanged=previous&&['scrollY','x','y','width','height'].every(key=>sample[key]===previous[key]);
   stable=unchanged&&!active.length?stable+1:0;previous=sample;
   if(stable>=3){console.debug('E36_HISTORY_FRAME '+JSON.stringify({phase,stage:'helper-resolved'}));resolve(samples)}else requestAnimationFrame(frame);
  };requestAnimationFrame(frame);
 }),phase);
}

test('history settling leaves completed fill-forwards animation intact and keeps rendering',async({page},info)=>{
 const diagnostics=await captureHistoryDiagnostics(page,info);
 await page.setContent('<article>Finished decorative movement</article>');
 await page.locator('article').evaluate(async node=>{const animation=node.animate([{transform:'translateX(0)'},{transform:'translateX(4px)'}],{duration:1,fill:'forwards'});await animation.finished;});
 const samples=await settleReading(page,page.locator('article'));
 expect(samples.length).toBeGreaterThanOrEqual(4);expect(samples.at(-1).activeAnimations).toBe(0);
 await expect(page.locator('article')).toHaveCSS('transform','matrix(1, 0, 0, 1, 4, 0)');
 expect(await page.locator('article').evaluate(node=>node.getAnimations().map(animation=>animation.playState))).toEqual(['finished']);
 await page.close();expect(diagnostics.some(sample=>sample.stage==='frame'&&sample.animations.some(animation=>animation.playState==='finished'))).toBe(true);
});

for(const width of [1440,390])test(`largest visible story selects the current year in both directions ${width}`,async({page},info)=>{
 const observations=await setup(page);await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/o-nas.html');await page.evaluate(()=>document.fonts.ready);
 for(const year of ['2011','2015','2011','2025','2015']){
  const target=page.locator(`#history-${year}`);
  await target.evaluate(node=>{const top=node.getBoundingClientRect().top-new DOMMatrixReadOnly(getComputedStyle(node).transform).m42,header=document.querySelector('.site-header').getBoundingClientRect().bottom;scrollTo({top:scrollY+top-header-180,behavior:'instant'})});
  await expect(target.locator('.timeline-copy h2')).toBeInViewport();await expect(page.locator('[data-history-year]')).toHaveText(year);await expect(page.locator('[data-history-title]')).toHaveText(await target.locator('.timeline-copy h2').innerText());await expect(target).toHaveClass(/is-current/);await expect(target.locator('.timeline-year a')).toHaveAttribute('aria-current','location');await expect(page.locator('.timeline-year a[aria-current=location]')).toHaveCount(1);
 }
 // Small wheel movements keep the visible article; a larger movement switches
 // to the next story, and reversing it restores the previous one.
 await page.locator('#history-2011').evaluate(node=>{const top=node.getBoundingClientRect().top-new DOMMatrixReadOnly(getComputedStyle(node).transform).m42;scrollTo({top:scrollY+top-document.querySelector('.site-header').getBoundingClientRect().bottom-180,behavior:'instant'})});
 await expect(page.locator('[data-history-year]')).toHaveText('2011');
 await page.mouse.wheel(0,60);await expect(page.locator('[data-history-year]')).toHaveText('2011');
 await page.mouse.wheel(0,-60);await expect(page.locator('[data-history-year]')).toHaveText('2011');
 const jump=await page.locator('#history-2015').evaluate(node=>node.getBoundingClientRect().top-new DOMMatrixReadOnly(getComputedStyle(node).transform).m42-document.querySelector('.site-header').getBoundingClientRect().bottom-180);
 await page.mouse.wheel(0,jump);await expect(page.locator('[data-history-year]')).toHaveText('2015');
 await page.mouse.wheel(0,-jump);await expect(page.locator('[data-history-year]')).toHaveText('2011');
 await page.mouse.wheel(0,jump);await expect(page.locator('[data-history-year]')).toHaveText('2015');
 await page.setViewportSize({width:width===390?420:1280,height:820});await expect(page.locator('[data-history-year]')).toHaveText('2015');
 for(const theme of ['light','dark']){await page.evaluate(t=>window.dispatchEvent(new StorageEvent('storage',{key:'e36UnitedAppearance',newValue:t})),theme);await page.screenshot({path:info.outputPath(`visible-story-${width}-${theme}.png`),animations:'disabled'})}
 expectNoHistoryErrors(observations);
});
function expectNoHistoryErrors(observations){expect(observations.pageErrors).toEqual([]);expect(observations.consoleErrors).toEqual([]);expect(observations.unhandledApi).toEqual([])}
