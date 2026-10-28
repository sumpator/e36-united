import {test,expect} from '@playwright/test';
import {prepareE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';

for(const [top,y] of [[786,842],[860,880]])test(`category mouse focus keeps the pressed card under the pointer at ${top}`,async({page},testInfo)=>{
 const observations=await prepareE2ePage(page);await page.setViewportSize({width:1440,height:900});await page.goto('/index.html');
 const card=page.locator('.category-selector [data-category=cabrio]');await expect(card).toBeAttached();await page.evaluate(()=>document.fonts.ready);
 await page.evaluate(top=>{const card=document.querySelector('.category-selector [data-category=cabrio]');window.scrollTo({top:card.getBoundingClientRect().top+scrollY-top,behavior:'instant'})},top);
 const events=[];await page.exposeFunction('__showshinePointerLog',row=>events.push(row));
 await page.evaluate(()=>{for(const type of ['pointerdown','mousedown','focusin','pointerup','mouseup','click'])document.addEventListener(type,event=>window.__showshinePointerLog({type,target:event.target.closest('[data-category]')?.dataset.category||event.target.tagName,y:scrollY,rect:document.querySelector('[data-category=cabrio]').getBoundingClientRect().toJSON(),x:event.clientX,clientY:event.clientY}),true)});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const before=await card.boundingBox(),x=before.x+before.width/2;await page.mouse.move(x,y);await page.mouse.down();
 await expect.poll(()=>events.filter(event=>event.type==='pointerdown').map(event=>event.target)).toEqual(['cabrio']);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.evaluate(()=>new Promise(resolve=>{let previous=null,stable=0;const check=()=>{const r=document.querySelector('[data-category=cabrio]').getBoundingClientRect();const current=[scrollY,r.y,r.height].join('|');stable=current===previous?stable+1:0;previous=current;if(stable===3)resolve();else requestAnimationFrame(check)};requestAnimationFrame(check)}));
 const during=await card.boundingBox();await page.mouse.up();
 await testInfo.attach('pointer-geometry',{body:JSON.stringify({before,during,x,y,events},null,2),contentType:'application/json'});
 expect(during.y+10).toBeLessThan(y);expect(during.y+during.height).toBeGreaterThan(y);await expect(card).toHaveClass(/is-active/);await expect.poll(()=>events.filter(event=>['pointerdown','pointerup','click'].includes(event.type)).map(event=>[event.type,event.target])).toEqual([['pointerdown','cabrio'],['pointerup','cabrio'],['click','cabrio']]);expectNoUnexpectedClientErrors(observations);
});
