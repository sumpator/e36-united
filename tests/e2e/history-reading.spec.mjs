import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {prepareE2ePage} from './fixtures.mjs';

const diagnosticPrefix='E36_HISTORY_FRAME ',hostDiagnostics=new Map(),hostUpdates=new Map();
const setupMode=process.env.E36_HISTORY_SETUP_MODE||'artificial';
if(!['artificial','natural'].includes(setupMode))throw new Error('Unknown history setup diagnostic mode');
const styleMode=process.env.E36_HISTORY_STYLE_MODE||'normal';
const historyDiagnosticStyles={
 normal:'',
 'no-filter':'.history-layout .timeline-photo img{filter:none!important}',
 'no-backdrop':'.site-header,.history-sticky{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}',
 'no-transform':'.history-layout .timeline-entry,.history-layout .timeline-year,.history-layout .timeline-photo,.history-layout .timeline-photo img{transform:none!important}',
 'no-smooth':'html{scroll-behavior:auto!important}',
};
if(!Object.hasOwn(historyDiagnosticStyles,styleMode))throw new Error('Unknown history style diagnostic mode');
async function captureHistoryDiagnostics(page,info){
 const samples=[],updates=[];hostDiagnostics.set(info.testId,samples);hostUpdates.set(info.testId,updates);
 page.on('console',message=>{const text=message.text();if(!text.startsWith(diagnosticPrefix))return;try{const sample={...JSON.parse(text.slice(diagnosticPrefix.length)),setupMode,styleMode,receivedAt:Date.now()};const list=sample.stage.startsWith('app-')?updates:samples;list.push(sample);if(list.length>(list===updates?600:240))list.shift()}catch(error){samples.push({diagnosticError:String(error)})}});
 for(const event of ['crash','close'])page.on(event,()=>{samples.push({stage:'page-'+event,setupMode,styleMode,receivedAt:Date.now()});if(samples.length>240)samples.shift()});
 return samples;
}
test.afterEach(async({},info)=>{for(const [map,name] of [[hostDiagnostics,'history-host-frame-diagnostics'],[hostUpdates,'history-app-update-diagnostics']]){const samples=map.get(info.testId);if(samples){await info.attach(name,{body:JSON.stringify(samples,null,2),contentType:'application/json'});map.delete(info.testId)}}});

async function setup(page){
 const observations=await prepareE2ePage(page);
 const css=readFileSync(new URL('../../styles.css',import.meta.url),'utf8');
 await page.route('**/styles.css*',route=>route.fulfill({contentType:'text/css',body:css+'\n/* Isolated history rendering diagnostic: '+styleMode+' */\n'+historyDiagnosticStyles[styleMode]}));
 const main=readFileSync(new URL('../../main.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
 const begin='const updateHistoryProgress = () => {';
 const finish='progress.style.width = '+String.fromCharCode(96)+'${Math.round((travelled / total) * 100)}%'+String.fromCharCode(96)+';\n};';
 const emit="let historyDiagnosticCalls=0,historyDiagnosticRecords=0;const historyDiagnostic=(stage,details={})=>{if(historyDiagnosticRecords++>=4096)return;console.debug('E36_HISTORY_FRAME '+JSON.stringify({stage,performanceNow:performance.now(),dateNow:Date.now(),scrollY,hash:location.hash,...details}))};\n";
 const article="const articleTop = entry => entry.getBoundingClientRect().top - new DOMMatrixReadOnly(getComputedStyle(entry).transform).m42;";
 const instrumented=main.replace(article,emit+"const articleTop = entry => {const id=entry.id;historyDiagnostic('app-article-rect-before',{call:historyDiagnosticCalls,id});const rect=entry.getBoundingClientRect();historyDiagnostic('app-article-rect-after',{call:historyDiagnosticCalls,id,top:rect.top});historyDiagnostic('app-article-computed-before',{call:historyDiagnosticCalls,id});const computed=getComputedStyle(entry).transform;historyDiagnostic('app-article-computed-after',{call:historyDiagnosticCalls,id,computed});historyDiagnostic('app-article-matrix-before',{call:historyDiagnosticCalls,id});const matrix=new DOMMatrixReadOnly(computed);historyDiagnostic('app-article-matrix-after',{call:historyDiagnosticCalls,id,m42:matrix.m42});return rect.top-matrix.m42};")
  .replace(begin,"const updateHistoryProgress = cause => {const diagnosticCall=++historyDiagnosticCalls;historyDiagnostic('app-update-begin',{call:diagnosticCall,cause:cause?.type||Array.isArray(cause)&&'observer'||'direct'});try{")
  .replace(finish,'progress.style.width = '+String.fromCharCode(96)+'${Math.round((travelled / total) * 100)}%'+String.fromCharCode(96)+";\n}finally{historyDiagnostic('app-update-end',{call:diagnosticCall})}\n};")
  .replace('entries.forEach(entry => { entry.style.scrollMarginTop',"historyDiagnostic('app-margins-before',{call:diagnosticCall});entries.forEach(entry => { entry.style.scrollMarginTop")
  .replace('setHistoryEntry(entries.filter',"historyDiagnostic('app-margins-after',{call:diagnosticCall});historyDiagnostic('app-selection-before',{call:diagnosticCall});setHistoryEntry(entries.filter")
  .replace(".at(-1)||entries[0]);",".at(-1)||entries[0]);historyDiagnostic('app-selection-after',{call:diagnosticCall});")
  .replace('const rect = historySection.getBoundingClientRect();',"historyDiagnostic('app-section-rect-before',{call:diagnosticCall});const rect = historySection.getBoundingClientRect();historyDiagnostic('app-section-rect-after',{call:diagnosticCall,top:rect.top,height:rect.height});");
 if(!main.includes(begin)||!main.includes(finish)||!main.includes(article))throw new Error('History source diagnostic marker changed');
 await page.route('**/main.js*',route=>route.fulfill({contentType:'text/javascript',body:instrumented}));
 const image=readFileSync(new URL('../../assets/images/showshine/ss_coupe.webp',import.meta.url));
 await page.route('https://static.wixstatic.com/**',route=>route.fulfill({contentType:'image/webp',body:image}));
 return observations;
}
for(const width of [1366,390])test(`history reading line ignores reveal movement and supports year links ${width}`,async({page},info)=>{
 await captureHistoryDiagnostics(page,info);
 const observations=await setup(page);await page.setViewportSize({width,height:844});await page.goto(setupMode==='natural'?'/o-nas.html#history-2025':'/o-nas.html');
 await page.evaluate(()=>document.fonts.ready);
 const entry=page.locator('.timeline-entry').nth(7);
 // Hold only the article's decorative reveal below its stable layout position.
 // Reading selection must not depend on animation progress.
 if(setupMode==='artificial')await entry.evaluate(node=>{
  node.style.transition='none';node.style.transform='translateY(18px)';
  const header=document.querySelector('.site-header').getBoundingClientRect().bottom;
  scrollTo({top:node.getBoundingClientRect().top-18+scrollY-header-68,behavior:'instant'});
 });
 await expect(page.locator('[data-history-year]')).toHaveText('2025');
 await expect(entry).toHaveClass(/is-current/);
 if(setupMode==='artificial')await entry.evaluate(node=>{node.style.transform='';node.style.transition=''});
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
 await page.close();expect(diagnostics.some(sample=>sample.stage==='before-getAnimations')).toBe(true);expect(diagnostics.some(sample=>sample.stage==='animation-metadata'&&sample.animations.some(animation=>animation.playState==='finished'))).toBe(true);
});
