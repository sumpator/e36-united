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
 for(const index of [8,6,3,0,7]){
  const target=page.locator('.timeline-entry').nth(index);
  await target.locator('.timeline-year a').click();
  const year=await target.locator('.timeline-year').innerText();
  await expect(page).toHaveURL(new RegExp(`#history-${year}$`));
  await expect(page.locator('[data-history-year]')).toHaveText(year);
  await expect(target).toHaveClass(/is-current/);
 }
 await page.reload();await expect(page.locator('[data-history-year]')).toHaveText('2025');
 await page.goBack();await expect(page).toHaveURL(/#history-2007$/);
 // Back restores the prior scroll position, including scrolling to reach a
 // subsequent year link; the reading marker follows that restored position.
 await expectReadingPosition(page);
 await page.goForward();await expect(page).toHaveURL(/#history-2025$/);await expectReadingPosition(page);
 expect(observations.pageErrors).toEqual([]);expect(observations.unhandledApi).toEqual([]);
});
async function expectReadingPosition(page){
 await expect.poll(()=>page.evaluate(()=>{
  const probe=document.querySelector('.site-header').getBoundingClientRect().bottom+70;
  const entries=[...document.querySelectorAll('.timeline-entry')];
  const current=entries.filter(node=>node.getBoundingClientRect().top-new DOMMatrixReadOnly(getComputedStyle(node).transform).m42<=probe).at(-1)||entries[0];
  return document.querySelector('[data-history-year]').textContent===current.querySelector('.timeline-year').textContent;
 })).toBe(true);
}
