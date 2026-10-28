import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {prepareE2ePage} from './fixtures.mjs';

const diagnosticPrefix='E36_HISTORY_FRAME ',hostDiagnostics=new Map();
function captureHistoryDiagnostics(page,info){
 const samples=[];hostDiagnostics.set(info.testId,samples);
 page.on('console',message=>{const text=message.text();if(!text.startsWith(diagnosticPrefix))return;try{samples.push({...JSON.parse(text.slice(diagnosticPrefix.length)),receivedAt:Date.now()});if(samples.length>240)samples.shift()}catch(error){samples.push({diagnosticError:String(error)})}});
 return samples;
}
test.afterEach(async({},info)=>{const samples=hostDiagnostics.get(info.testId);if(samples){await info.attach('history-host-frame-diagnostics',{body:JSON.stringify(samples,null,2),contentType:'application/json'});hostDiagnostics.delete(info.testId)}});

async function setup(page){
 const observations=await prepareE2ePage(page);
 const image=readFileSync(new URL('../../assets/images/showshine/ss_coupe.webp',import.meta.url));
 await page.route('https://static.wixstatic.com/**',route=>route.fulfill({contentType:'image/webp',body:image}));
 return observations;
}
for(const width of [1366,390])test(`history reading line ignores reveal movement and supports year links ${width}`,async({page},info)=>{
 captureHistoryDiagnostics(page,info);
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
 expect(observations.pageErrors).toEqual([]);expect(observations.unhandledApi).toEqual([]);
});
async function settleReading(page,target,phase='finished-fill-regression'){
 return await target.evaluate((node,phase)=>new Promise(resolve=>{
  const samples=[];let previous=null,stable=0;
  const frame=()=>{
   const link=node.querySelector('.timeline-year a')||node,rect=link.getBoundingClientRect();
   const clock={phase,performanceNow:performance.now(),dateNow:Date.now(),documentTimeline:document.timeline.currentTime,visibility:document.visibilityState,scrollY,rootScrollTop:document.scrollingElement?.scrollTop,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},stableFrames:stable};
   console.debug('E36_HISTORY_FRAME '+JSON.stringify({...clock,stage:'before-getAnimations'}));
   const animations=node.getAnimations({subtree:true});
   console.debug('E36_HISTORY_FRAME '+JSON.stringify({...clock,stage:'after-getAnimations',animationCount:animations.length}));
   const animationDetails=animations.map(animation=>{
    const effect=animation.effect,timing=effect?.getComputedTiming?.(),target=effect?.target;
    return {name:animation.animationName||'',property:animation.transitionProperty||'',pseudo:animation.effect?.pseudoElement||'',playState:animation.playState,pending:animation.pending,currentTime:animation.currentTime,timelineTime:animation.timeline?.currentTime,iterations:timing?.iterations,duration:timing?.duration,progress:timing?.progress,currentIteration:timing?.currentIteration,localTime:timing?.localTime,targetTag:target?.tagName,targetClass:typeof target?.className==='string'?target.className:target?.className?.baseVal};
   });
   console.debug('E36_HISTORY_FRAME '+JSON.stringify({...clock,stage:'animation-metadata',animations:animationDetails}));
   const active=animations.filter(animation=>animation.pending||animation.playState==='running');
   const sample={scrollY,x:rect.x,y:rect.y,width:rect.width,height:rect.height,activeAnimations:active.length};
   samples.push(sample);if(samples.length>120)samples.shift();
   // Finished fill-forwards animations intentionally remain in getAnimations().
   // Sampling on rendering frames avoids repeatedly awaiting their resolved
   // finished promise, which can starve rendering indefinitely.
   const unchanged=previous&&['scrollY','x','y','width','height'].every(key=>sample[key]===previous[key]);
   stable=unchanged&&!active.length?stable+1:0;previous=sample;
   if(stable>=3)resolve(samples);else requestAnimationFrame(frame);
  };requestAnimationFrame(frame);
 }),phase);
}

test('history settling leaves completed fill-forwards animation intact and keeps rendering',async({page},info)=>{
 const diagnostics=captureHistoryDiagnostics(page,info);
 await page.setContent('<article>Finished decorative movement</article>');
 await page.locator('article').evaluate(async node=>{const animation=node.animate([{transform:'translateX(0)'},{transform:'translateX(4px)'}],{duration:1,fill:'forwards'});await animation.finished;});
 const samples=await settleReading(page,page.locator('article'));
 expect(samples.length).toBeGreaterThanOrEqual(4);expect(samples.at(-1).activeAnimations).toBe(0);
 await expect(page.locator('article')).toHaveCSS('transform','matrix(1, 0, 0, 1, 4, 0)');
 expect(await page.locator('article').evaluate(node=>node.getAnimations().map(animation=>animation.playState))).toEqual(['finished']);
 await page.close();expect(diagnostics.some(sample=>sample.stage==='before-getAnimations')).toBe(true);expect(diagnostics.some(sample=>sample.stage==='animation-metadata'&&sample.animations.some(animation=>animation.playState==='finished'))).toBe(true);
});
