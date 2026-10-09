import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {commandFixture} from './command-fixture.mjs';
import {prepareE2ePage} from './fixtures.mjs';
import {memberRuntime} from '../helpers/admin-member-runtime.mjs';
import {seedConfirmedArrival} from '../helpers/live-fixtures.mjs';
import * as live from '../../worker/domains/live.js';
import {routeMerch} from '../../worker/domains/merch/index.js';
import {routeArrivals} from '../../worker/domains/arrivals.js';

const origin='https://e36united.cz';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
const request=body=>new Request(origin,{method:'POST',body:JSON.stringify(body)});
const scores={overall:8,condition:7,cohesion:6,originality:9};
async function ok(response){expect(response.status,await response.clone().text()).toBe(200)}
async function appearance(page,width,theme){
 await page.setViewportSize({width,height:900});
 await page.addInitScript(theme=>{if(window===window.top)localStorage.setItem('e36UnitedAppearance',theme)},theme);
}
for(const width of [390,1440])for(const theme of ['light','dark']){
 test('A1 member list/search/reopen and event arrivals '+width+' '+theme,async({page},info)=>{
  await page.route('https://**/*',route=>route.abort());
  const fixture=await commandFixture(page),r=fixture.r;
  try{
   seedConfirmedArrival(r,'m','c');seedConfirmedArrival(r,'n','cn');seedConfirmedArrival(r,'m','c2','old');
   await appearance(page,width,theme);
   await page.route('https://api.e36united.cz/api/live',async route=>{
    const response=await live.getMemberLive(r.env,{uid:'a'},origin);
    await route.fulfill({status:response.status,headers,body:await response.text()});
   });
   await page.route('https://api.e36united.cz/api/admin/events/*/arrivals',async route=>{
    const url=new URL(route.request().url());
    const response=await routeArrivals({request:new Request(url),url,env:r.env,auth:{uid:'a'},origin});
    await route.fulfill({status:response.status,headers,body:await response.text()});
   });
   await page.route('https://api.e36united.cz/api/admin/live**',async route=>{
    const u=new URL(route.request().url());
    const response=await live.getAdminLive(r.env,u,origin);
    await route.fulfill({status:response.status,headers,body:await response.text()});
   });
   await page.goto('/admin.html?section=members&event=e');
   const dialog=page.locator('[data-member-dialog]');
   await page.locator('[data-member-list] [data-member-open="m"]').first().click();
   await expect(dialog.locator('[data-member-identity]')).toContainText('First');
   const eventTab=async()=>{
    if(width<680)await dialog.locator('[data-member-section-select]').selectOption('event');
    else await dialog.locator('[data-member-tab="event"]').click();
   };
   await eventTab();
   await expect(dialog.locator('[data-gate-arrival="fixture-arrival-e-c"]')).toHaveCount(1);
   await expect(dialog.locator('[data-gate-arrival="fixture-arrival-old-c2"]')).toHaveCount(0);
   await page.screenshot({path:info.outputPath('member-detail.png')});
   await dialog.locator('[data-member-close]').click();
   await page.locator('[data-member-search]').fill('other@example.invalid');
   await page.locator('[data-member-suggestions] [data-member-open="n"]').click();
   await expect(dialog.locator('[data-member-identity]')).toContainText('Second');
   await eventTab();
   await expect(dialog.locator('[data-gate-arrival="fixture-arrival-e-cn"]')).toHaveCount(1);
   await expect(dialog.locator('[data-gate-arrival="fixture-arrival-e-c"]')).toHaveCount(0);
   await dialog.locator('[data-member-close]').click();
   await page.locator('[data-member-search]').fill('member@example.invalid');
   await page.locator('[data-member-suggestions] [data-member-open="m"]').click();
   await eventTab();
   await expect(dialog.locator('[data-gate-arrival="fixture-arrival-e-c"]')).toHaveCount(1);
   await expect(dialog.locator('[data-member-load-error]')).toBeHidden();
   expect(fixture.observations.pageErrors).toEqual([]);
   expect(fixture.observations.unhandledApi).toEqual([]);
  }finally{await page.close();r.db.close()}
 });
 test('A2 own/other official correction and privacy '+width+' '+theme,async({page},info)=>{
  const r=memberRuntime();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   r.db.exec("UPDATE events SET live_enabled=1 WHERE id='e'; INSERT INTO event_live_judges(event_id,member_id,created_by) VALUES('e','m','a'); INSERT INTO live_entries(id,event_id,discipline,member_id,car_id,category,presented_at) VALUES('own','e','show_shine','m','c','Sedan',CURRENT_TIMESTAMP),('other','e','show_shine','n','cn','Sedan',CURRENT_TIMESTAMP); INSERT INTO live_competition_state(event_id,discipline,status,current_entry_id,version) VALUES('e','show_shine','live','own',1); INSERT INTO live_category_state(event_id,discipline,category,status) VALUES('e','show_shine','Sedan','live');");
   await ok(await live.saveLiveVote(request({score:5}),r.env,{uid:'m'},'own',origin));
   expect((await live.saveLiveVote(request({score:5}),r.env,{uid:'n'},'other',origin)).status).toBe(403);
   for(const id of ['own','other'])await ok(await live.saveJudgeScore(request({scores,submitted:true,note:'Private '+id,expectedVersion:0}),r.env,{uid:'m'},id,origin));
   await ok(await live.controlLive(request({action:'close_category',category:'Sedan',expectedCategoryVersion:1}),r.env,{uid:'a'},'e','show_shine',origin));
   // Exercise both the closed category and published discipline, without changing public vote rules.
   await page.route('https://**/*',route=>route.abort());
   const observations=await prepareE2ePage(page,{authenticated:true,member:{id:'m'}});
   let actor='m';
   r.env.MEDIA.get=async()=>({body:readFileSync(new URL('../../assets/images/showshine/ss_sedan.webp',import.meta.url)),httpMetadata:{contentType:'image/webp'}});
   r.db.exec("INSERT INTO live_judge_photos(id,event_id,entry_id,judge_id,r2_key,mime_type,size_bytes) VALUES('private','e','own','m','isolated/private','image/webp',100)");
   await appearance(page,width,theme);
   const writes=[];
   await page.route('https://api.e36united.cz/api/**',async route=>{
    const q=route.request(),url=new URL(q.url());let response;
    if(q.method()==='OPTIONS')return route.fulfill({status:204,headers});
    if(url.pathname==='/api/live')response=await live.getMemberLive(r.env,{uid:actor},origin);
    else if(url.pathname==='/api/live/state')response=await live.getLiveState(r.env,{uid:actor},url,origin);
    else if(/^\/api\/live\/entries\/[^/]+\/media$/.test(url.pathname)){
     response=await live.liveEntryMedia(r.env,{uid:actor},url.pathname.split('/').at(-2),origin);
     return route.fulfill({status:response.status,headers:{...headers,'Content-Type':response.headers.get('Content-Type')},body:Buffer.from(await response.arrayBuffer())});
    }else if(url.pathname.includes('/api/live/judge/photos/')){
     response=await live.judgePhotoMedia(r.env,{uid:actor},url.pathname.split('/').at(-1),origin);
     return route.fulfill({status:response.status,headers:{...headers,'Content-Type':response.headers.get('Content-Type')},body:Buffer.from(await response.arrayBuffer())});
    }
    else if(url.pathname.startsWith('/api/live/judge/scores/')){
     writes.push(q.postDataJSON());
     response=await live.saveJudgeScore(new Request(q.url(),{method:q.method(),body:q.postData()}),r.env,{uid:actor},url.pathname.split('/').at(-1),origin);
    }else if(url.pathname.startsWith('/api/merch/'))response=await routeMerch({request:new Request(q.url()),url,env:r.env,auth:{uid:actor},origin});
    else return route.fallback();
    await route.fulfill({status:response.status,headers,body:await response.text()});
   });
   await page.goto('/member.html?section=live');
   await page.locator('[data-live-entry-confirm]').click();
   await page.locator('[data-live-tab="showshine"]').click();
   for(const id of ['own','other']){
    const detail=page.locator('[data-live-result="'+id+'"]');
    await detail.locator('summary').click();
    await expect(detail.locator('.live-judge-form dd')).toHaveText(['8 / 10','7 / 10','6 / 10','9 / 10']);
    await expect(detail.locator('[data-live-edit-judge]')).toBeVisible();
   }
   const version=r.db.prepare("SELECT version FROM live_competition_state WHERE event_id='e'").get().version;
   await ok(await live.controlLive(request({action:'publish',expectedVersion:version}),r.env,{uid:'a'},'e','show_shine',origin));
   await page.reload();
   await page.locator('[data-live-tab="showshine"]').click();
   const other=page.locator('[data-live-result="other"]');
   if(await other.getAttribute('open')===null)await other.locator('summary').click();
   await expect(other.locator('.live-judge-form dd')).toHaveText(['8 / 10','7 / 10','6 / 10','9 / 10']);
   await expect(other.locator('[data-live-edit-judge]')).toBeVisible();
   const own=page.locator('[data-live-result="own"]');
   if(await own.getAttribute('open')===null)await own.locator('summary').click();
   await expect(own.locator('.live-judge-form dd')).toHaveText(['8 / 10','7 / 10','6 / 10','9 / 10']);
   await own.locator('[data-live-edit-judge]').click();
   const form=page.locator('[data-live-judge="own"]');
   await expect(form.locator('[name=expectedVersion]')).toHaveValue('1');
   await expect(form.locator('[name=reason]')).toHaveAttribute('required','');
   await expect(form.locator('.live-correction-warning')).toContainText('POZOR: MĚNÍŠ JIŽ POTVRZENÉ HODNOCENÍ.');
   await form.locator('[data-judge-submit]').click();
   expect(await form.locator('[name=reason]').evaluate(input=>input.validity.valueMissing)).toBe(true);
   expect(writes).toHaveLength(0);
   await form.locator('[name=reason]').fill('Oprava překlepu');
   await form.locator('[data-live-judge-criterion=overall][data-live-judge-score="9"]').click();
   await form.locator('.live-correction-warning').scrollIntoViewIfNeeded();
   await page.screenshot({path:info.outputPath('judge-correction.png')});
   const cancelled=page.waitForEvent('dialog');
   const cancelling=form.locator('[data-judge-submit]').click();
   await (await cancelled).dismiss();await cancelling;
   expect(writes).toHaveLength(0);
   const confirmation=page.waitForEvent('dialog');
   const clicking=form.locator('[data-judge-submit]').click();
   const confirm=await confirmation;
   expect(confirm.message()).toContain('Změna se zapíše do auditu');
   await confirm.accept();
   await clicking;
   await expect.poll(()=>r.db.prepare("SELECT version FROM live_judge_scores WHERE entry_id='own'").get().version).toBe(2);
   expect(writes).toHaveLength(1);
   expect(writes[0]).toMatchObject({expectedVersion:1,correction:true,reason:'Oprava překlepu'});
   const before=r.db.prepare("SELECT * FROM live_judge_scores WHERE entry_id='own'").get();
   expect((await live.saveJudgeScore(request({...writes[0],scores}),r.env,{uid:'m'},'own',origin)).status).toBe(409);
   expect(r.db.prepare("SELECT * FROM live_judge_scores WHERE entry_id='own'").get()).toEqual(before);
   const audit=r.db.prepare('SELECT * FROM live_judge_score_audit').all();
   expect(audit).toHaveLength(1);expect(audit[0].changed_by).toBe('m');
   expect(JSON.parse(audit[0].before_scores)).toEqual(scores);
   expect(JSON.parse(audit[0].after_scores)).toEqual({...scores,overall:9});
   expect(r.db.prepare('SELECT score FROM live_public_votes').get().score).toBe(5);
   const ordinary=await (await live.getMemberLive(r.env,{uid:'n'},origin)).json();
   expect(ordinary.judgeHistory).toEqual([]);expect(JSON.stringify(ordinary)).not.toContain('Private');
   expect((await live.saveJudgeScore(request(writes[0]),r.env,{uid:'n'},'own',origin)).status).toBe(403);
   expect((await live.judgePhotoMedia(r.env,{uid:'n'},'private',origin)).status).toBe(404);
   r.db.exec("INSERT INTO event_live_judges(event_id,member_id,created_by) VALUES('old','n','a')");
   expect((await live.saveJudgeScore(request(writes[0]),r.env,{uid:'n'},'own',origin)).status).toBe(403);
   actor='n';await observations.switchMember({id:'n'});await page.reload();
   await page.locator('[data-live-entry-confirm]').click();
   await page.locator('[data-live-tab="showshine"]').click();
   const memberResult=page.locator('[data-live-result="own"]');
   if(await memberResult.getAttribute('open')===null)await memberResult.locator('summary').click();
   await expect(page.locator('[data-live-edit-judge],[data-live-judge],[data-live-judge-photo]')).toHaveCount(0);
   await expect(page.locator('body')).not.toContainText('Private own');
   expect(errors).toEqual([]);expect(observations.unhandledApi).toEqual([]);
  }finally{await page.close();r.db.close()}
 });
}
