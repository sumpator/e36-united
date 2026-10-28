import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {prepareE2ePage} from './fixtures.mjs';

async function setup(page){
 const observations=await prepareE2ePage(page);
 const image=readFileSync(new URL('../../assets/images/showshine/ss_coupe.webp',import.meta.url));
 await page.route('https://static.wixstatic.com/**',route=>route.fulfill({contentType:'image/webp',body:image}));
 return observations;
}
for(const width of [1366,390])test(`history reading line ignores reveal movement and supports year links ${width}`,async({page})=>{
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
  await settleReading(page,target);
  previous={url:page.url(),year:await page.locator('[data-history-year]').innerText(),title:await page.locator('[data-history-title]').innerText()};
  await target.locator('.timeline-year a').click();
  const year=await target.locator('.timeline-year').innerText();
  await expect(page).toHaveURL(new RegExp(`#history-${year}$`));
  await expect(page.locator('[data-history-year]')).toHaveText(year);
  await expect(target).toHaveClass(/is-current/);
  await expect(page.locator('[data-history-title]')).toHaveText(await target.locator('.timeline-copy h2').innerText());
  await settleReading(page,target);
 }
 await page.reload();await expect(page.locator('[data-history-year]')).toHaveText('2025');
 await page.goBack();await expect(page).toHaveURL(/#history-2007$/);
 // Back restores the prior scroll position, including scrolling to reach a
 // subsequent year link; the reading marker follows that restored position.
 await expect(page.locator('[data-history-year]')).toHaveText(previous.year);await expect(page.locator('[data-history-title]')).toHaveText(previous.title);
 await page.goForward();await expect(page).toHaveURL(/#history-2025$/);await expect(page.locator('[data-history-year]')).toHaveText('2025');await expect(page.locator('.timeline-entry').nth(7)).toHaveClass(/is-current/);
 expect(observations.pageErrors).toEqual([]);expect(observations.unhandledApi).toEqual([]);
});
async function settleReading(page,target){
 await target.evaluate(async node=>{
  // Await the real reveal/active transforms, not a fixed duration.
  for(let animations=node.getAnimations({subtree:true});animations.length;animations=node.getAnimations({subtree:true}))await Promise.all(animations.map(animation=>animation.finished.catch(()=>{})));
 });
 await page.evaluate(()=>new Promise(resolve=>{
  let previousY=scrollY,stable=0;
  const frame=()=>{if(scrollY===previousY)stable++;else{stable=0;previousY=scrollY}if(stable>=3)resolve();else requestAnimationFrame(frame)};requestAnimationFrame(frame);
 }));
}
