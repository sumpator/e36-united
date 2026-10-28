import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {prepareE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';

test('a delayed private gallery read cannot block or populate the next signed-in account',async({page})=>{
 const observations=await prepareE2ePage(page,{authenticated:true,cars:[]});
 const oldStarted=Promise.withResolvers(),oldRelease=Promise.withResolvers(),newRelease=Promise.withResolvers();
 const image=readFileSync(new URL('../../assets/images/showshine/ss_coupe.webp',import.meta.url));
 let galleryReads=0,oldRequest;
 await page.route('https://api.e36united.cz/api/gallery/mine**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(request.method()!=='GET'||url.pathname!=='/api/gallery/mine')return route.fallback();
  const order=++galleryReads;
  if(order===1){oldRequest=request;oldStarted.resolve();await oldRelease.promise}else await newRelease.promise;
  await route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},json:{submissions:[{id:order===1?'private-old-account':'private-new-account',caption:order===1?'SOUKROMÁ FOTKA PRVNÍHO ÚČTU':'SOUKROMÁ FOTKA DRUHÉHO ÚČTU',status:'pending',createdAt:'2026-10-28T10:00:00.000Z'}],pagination:{hasMore:false}}});
 });
 await page.route('https://api.e36united.cz/api/gallery/mine/media/private-new-account',route=>route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'image/webp',body:image}));
 const closeIntro=async()=>{const intro=page.locator('[data-onboarding-intro-modal]');await expect(intro).toBeVisible();await intro.getByRole('button',{name:'Zavřít úvod',exact:true}).click();};
 try{
  await page.setViewportSize({width:1440,height:900});await page.goto('/member.html?section=photos');await oldStarted.promise;await expect(page.locator('[data-app-view]')).toBeVisible();await closeIntro();
  await expect(page.locator('[data-photos-loading-state]')).toContainText('Načítám');
  await page.locator('.member-sidebar-logout[data-logout]').click();await expect(page.locator('[data-auth-view]')).toBeVisible();
  await observations.switchMember({id:'isolated-second-member',name:'Druhý člen',nickname:'Druhý',email:'second@example.test'});
  const login=page.locator('[data-auth-form=login]');await expect(login).toBeVisible();await login.locator('[name=email]').fill('second@example.test');await login.locator('[name=password]').fill('isolated-password');await login.locator('[type=submit]').click();await expect(page.locator('[data-app-view]')).toBeVisible();await closeIntro();
  await page.locator('.member-sidebar [data-member-section=photos]').click();
  await expect.poll(()=>galleryReads,{message:'The second account starts its own private gallery read before the previous account responds'}).toBe(2);
  oldRelease.resolve();const oldResponse=await oldRequest.response();if(oldResponse)await oldResponse.finished();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(page.locator('[data-photos-loading-state]')).toContainText('Načítám');await expect(page.locator('[data-member-gallery-list]')).toBeHidden();await expect(page.locator('[data-member-panel=photos]')).not.toContainText('SOUKROMÁ FOTKA PRVNÍHO ÚČTU');
  newRelease.resolve();await expect(page.locator('[data-member-gallery-list]')).toBeVisible();await expect(page.locator('.member-gallery-item')).toHaveCount(1);await expect(page.locator('[data-member-gallery-list]')).toContainText('SOUKROMÁ FOTKA DRUHÉHO ÚČTU');await expect(page.locator('[data-member-gallery-list]')).not.toContainText('SOUKROMÁ FOTKA PRVNÍHO ÚČTU');expect(galleryReads).toBe(2);expectNoUnexpectedClientErrors(observations);
 }finally{oldRelease.resolve();newRelease.resolve();}
});
