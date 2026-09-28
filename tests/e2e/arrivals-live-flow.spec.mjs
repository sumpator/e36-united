import {test,expect} from '@playwright/test';
import {commandFixture} from './command-fixture.mjs';
import {arrivalsRuntime,seedArrivals,EVENT} from '../helpers/arrivals-runtime.mjs';
import {routeArrivals,arrivalList} from '../../worker/domains/arrivals.js';
import {getAdminLive,getMemberLive,getLiveState,searchLiveMembers,startLiveEntry,saveJudgeScore} from '../../worker/domains/live.js';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type, If-Match, Idempotency-Key','Access-Control-Allow-Methods':'GET, POST, PUT, PATCH, OPTIONS'};
for(const width of [390,1024])for(const theme of ['light','dark'])test(`guest judging ${width} ${theme}`,async({page},info)=>{
 await page.route('https://**/*',route=>route.abort());
 const r=arrivalsRuntime();await seedArrivals(r);r.db.prepare('UPDATE events SET live_enabled=1 WHERE id=?').run(EVENT);
 const c=await commandFixture(page,{runtime:r});
 const url=new URL('https://example.invalid/api/admin/events/'+EVENT+'/arrivals');
 const response=await routeArrivals({request:new Request(url,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID(),'If-Match':String((await arrivalList(r.env,EVENT)).revision)},body:JSON.stringify({id:'browser-guest',name:'Host bez účtu',model:'BMW 328i Touring',body:'Touring',crew:1,cash:500,matchesReviewed:true})}),url,env:r.env,auth:{uid:'a'},origin:url.origin});
 expect(response.status).toBe(200);
 await page.route('https://api.e36united.cz/api/**',async route=>{
  const q=route.request(),u=new URL(q.url());if(!u.pathname.includes('/live'))return route.fallback();
  if(q.method()==='OPTIONS')return route.fulfill({status:204,headers});
  const request=new Request(q.url(),{method:q.method(),headers:q.headers(),...(q.postData()?{body:q.postData()}: {})});let result;
  if(u.pathname==='/api/admin/live')result=await getAdminLive(r.env,u,u.origin);
  else if(u.pathname==='/api/live/state')result=await getLiveState(r.env,{uid:'a'},u,u.origin);
  else if(u.pathname==='/api/live')result=await getMemberLive(r.env,{uid:'a'},u.origin);
  else if(u.pathname.endsWith('/members'))result=await searchLiveMembers(r.env,EVENT,u,u.origin);
  else if(u.pathname.endsWith('/start'))result=await startLiveEntry(request,r.env,{uid:'a'},EVENT,u.origin);
  else if(u.pathname.includes('/judge/scores/'))result=await saveJudgeScore(request,r.env,{uid:'a'},u.pathname.split('/').at(-1),u.origin);
  else return route.fulfill({status:404,headers,json:{error:'isolated_unhandled'}});
  return route.fulfill({status:result.status,headers,body:await result.text()});
 });
 try{
  await page.setViewportSize({width,height:950});await page.emulateMedia({colorScheme:theme});await page.addInitScript(theme=>{if(window===window.top)localStorage.setItem('e36UnitedAppearance',theme)},theme);
  await page.goto('/admin.html?section=live&event='+EVENT);await page.locator('[data-admin-live-entry-confirm]').click();
  await page.locator('[data-live-select-category=Touring]').click();await page.locator('[data-live-choose-member]').click();
  await page.locator('[data-live-select-member=browser-guest]').click();await expect(page.locator('.admin-live-selected')).toContainText('Potvrzený příjezd');
  await expect(page.locator('[data-live-new-car]')).toHaveCount(0);await page.screenshot({path:info.outputPath('selected.png'),fullPage:true});
  await page.locator('[data-live-start]').click();await expect(page.locator('[data-live-judge-form]')).toBeVisible();await expect(page.locator('[data-toast]')).toContainText('Hlasování probíhá');
  for(const key of ['overall','condition','cohesion','originality'])await page.locator(`[data-live-judge-criterion=${key}][data-live-judge-score="8"]`).click();
  await page.locator('[data-live-judge-submit]').click();await expect(page.locator('[data-live-judge-summary]')).toContainText('Hodnocení potvrzeno');
  expect(r.db.prepare('SELECT COUNT(*) n FROM live_judge_scores').get().n).toBe(1);expect(r.db.prepare('SELECT COUNT(*) n FROM live_entries').get().n).toBe(1);
  expect(c.observations.pageErrors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath('scored.png'),fullPage:true});
 }finally{await page.close();r.db.close()}
});
