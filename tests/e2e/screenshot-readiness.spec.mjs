import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {installScreenshotReadiness,waitForScreenshotContent} from './screenshot-readiness.mjs';

test('screenshot readiness follows current visible photos and changed src, not a frozen decode list',async({page})=>{
 installScreenshotReadiness(page);
 const oldReceived=Promise.withResolvers(),oldRelease=Promise.withResolvers(),nextReceived=Promise.withResolvers(),nextRelease=Promise.withResolvers(),sampled=Promise.withResolvers();
 await page.route('**/assets/images/program/friday.webp?held-old',async route=>{oldReceived.resolve();await oldRelease.promise;await route.fulfill({contentType:'image/webp',body:readFileSync(new URL('../../assets/images/program/friday.webp',import.meta.url))})});
 await page.route('**/assets/images/program/saturday.webp?held-next',async route=>{nextReceived.resolve();await nextRelease.promise;await route.fulfill({contentType:'image/webp',body:readFileSync(new URL('../../assets/images/program/saturday.webp',import.meta.url))})});
 try{
  await page.setContent('<img id="old" loading="lazy" width="300" height="180" src="http://127.0.0.1:4173/assets/images/program/friday.webp?held-old">',{waitUntil:'domcontentloaded'});await oldReceived.promise;
  await page.evaluate(()=>{window.oldDecode='pending';document.querySelector('#old').decode().then(()=>window.oldDecode='ready',error=>window.oldDecode=String(error))});
  let completed=false;
  const waiting=waitForScreenshotContent(page,{label:'current-photo',onSample:state=>{if(state.images.some(i=>i.src?.endsWith('held-old')&&i.phase==='loading'))sampled.resolve(state)}}).then(state=>{completed=true;return state});
  const initial=await sampled.promise;expect(initial.images[0]).toMatchObject({complete:false,naturalWidth:0,loading:'lazy'});expect(completed).toBe(false);
  await page.evaluate(()=>{document.querySelector('#old').hidden=true;const photo=document.createElement('img');photo.id='current';photo.width=300;photo.height=180;photo.src='http://127.0.0.1:4173/assets/images/program/saturday.webp?held-next';document.body.append(photo)});
  await nextReceived.promise;expect(completed).toBe(false);
  await page.locator('#current').evaluate(image=>image.src='http://127.0.0.1:4173/assets/images/program/sunday.jpg');
  const final=await waiting;expect(final.images).toHaveLength(1);expect(final.images[0]).toMatchObject({currentSrc:'http://127.0.0.1:4173/assets/images/program/sunday.jpg',complete:true,phase:'ready',network:{status:200,state:'finished'}});expect(final.images[0].naturalWidth).toBeGreaterThan(0);
  // This old promise is deliberately still waiting for a different, now hidden photo.
  expect(await page.evaluate(()=>window.oldDecode)).toBe('pending');
  await test.info().attach('current-image-readiness',{body:JSON.stringify({initial,final},null,2),contentType:'application/json'});
  await page.screenshot({path:test.info().outputPath('current-photo.png')});
 }finally{oldRelease.resolve();nextRelease.resolve();await page.unrouteAll({behavior:'wait'})}
});

test('screenshot readiness excludes transparent and clipped lazy photos but keeps the visible repository photo',async({page})=>{
 installScreenshotReadiness(page);
 await page.setContent('<img width="300" height="180" src="http://127.0.0.1:4173/assets/images/program/saturday.webp"><div style="opacity:0"><img loading="lazy" width="300" height="180" src="http://127.0.0.1:4173/assets/images/program/friday.webp?must-not-load"></div><div style="overflow:hidden;width:100px"><img loading="lazy" style="margin-left:10000px" width="300" height="180" src="http://127.0.0.1:4173/assets/images/program/sunday.jpg?must-not-load"></div>');
 const state=await waitForScreenshotContent(page,{label:'painted-photo'});expect(state.images).toHaveLength(1);expect(state.images[0].currentSrc).toContain('/program/saturday.webp');expect(state.images[0].naturalWidth).toBeGreaterThan(0);
 // A transparent nearby image may be prefetched by the browser, but must not be decoded for this screenshot.
 expect(state.images.every(image=>!image.currentSrc.includes('must-not-load'))).toBe(true);
});

test('screenshot readiness rejects a failed visible resource with source and HTTP status instead of taking a blank screenshot',async({page})=>{
 installScreenshotReadiness(page);
 await page.setContent('<img width="300" height="180" src="http://127.0.0.1:4173/assets/images/program/missing-ci110-photo.webp">');
 let error;try{await waitForScreenshotContent(page,{label:'broken-photo'})}catch(value){error=value}
 expect(error).toBeTruthy();expect(error.message).toContain('missing-ci110-photo.webp');expect(error.message).toContain('load-error');expect(error.message).toContain('"status":404');
});
