import {test,expect} from '@playwright/test';
import {commandFixture} from './command-fixture.mjs';
import * as live from '../../worker/domains/live.js';
import {readFileSync} from 'node:fs';

async function fixture(page){
 const c=await commandFixture(page),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, PUT, PATCH, OPTIONS'};
 c.r.db.exec("UPDATE events SET live_enabled=1 WHERE id='e'; UPDATE reservations SET car_id='c',show_shine='Ano' WHERE id='r'; UPDATE cars SET body='Sedan' WHERE id='c'; INSERT INTO event_member_presence(event_id,member_id,present) VALUES('e','m',1); INSERT INTO live_entries(id,event_id,discipline,member_id,car_id,presented_at) VALUES('legacy','e','show_shine','m','c',CURRENT_TIMESTAMP); INSERT INTO live_competition_state(event_id,discipline,status,current_entry_id,version) VALUES('e','show_shine','live','legacy',3)");
 c.liveWrites=[];c.failRefresh=false;
 c.r.env.MEDIA.put=async()=>{};c.r.env.MEDIA.delete=async()=>{};
 await page.route('https://api.e36united.cz/api/**',async route=>{
  const q=route.request(),url=new URL(q.url()),p=url.pathname;
  if(!p.includes('/live'))return route.fallback();
  if(q.method()==='OPTIONS')return route.fulfill({status:204,headers});
  c.calls.push(q.method()+' '+p+url.search);
  const request=new Request(q.url(),{method:q.method(),headers:q.headers(),...(q.postDataBuffer()?{body:q.postDataBuffer()}:{})}),auth={uid:'a'},env=c.r.env,origin='https://e36united.cz';
  let response;
  if(p==='/api/admin/live')response=c.failRefresh?Response.json({error:'fixture_read_failure'},{status:503}):await live.getAdminLive(env,url,origin);
  else if(p==='/api/live')response=await live.getMemberLive(env,auth,origin);
  else if(p==='/api/live/state')response=await live.getLiveState(env,auth,url,origin);
  else if(p.endsWith('/live/members'))response=await live.searchLiveMembers(env,'e',url,origin);
  else if(p.endsWith('/live/qr'))response=await live.resolveLiveQr(request,env,'e',origin);
  else if(p.endsWith('/presence'))response=await live.setLivePresence(request,env,auth,'e',p.split('/').at(-2),origin);
  else if(p.endsWith('/live/start'))response=await live.startLiveEntry(request,env,auth,'e',origin);
  else if(p.endsWith('/members/m/cars'))response=await live.createCompetitionCar(request,env,auth,'e','m',origin);
  else if(p==='/api/admin/events/e/live')response=await live.setAdminLiveEnabled(request,env,auth,'e',origin);
  else if(p.includes('/judge/scores/')){response=await live.saveJudgeScore(request,env,auth,p.split('/').at(-1),origin);c.liveWrites.push(q.postDataJSON());}
  else if(p.endsWith('/media'))return route.fulfill({status:200,headers,contentType:'image/webp',body:readFileSync(new URL('../../assets/images/showshine/ss_sedan.webp',import.meta.url))});
  else return route.fallback();
  return route.fulfill({status:response.status,headers,body:await response.text()});
 });
 return c;
}

test('LIVE repaired entry, legacy category, score edit, failed refresh and independent settings',async({page})=>{
 const c=await fixture(page);
 page.on('dialog',dialog=>dialog.accept());
 try{
  await page.goto('/admin.html?section=event&event=e');
  await expect(page.locator('[data-event-live-toggle]')).toBeEnabled();
  await expect(page.locator('[data-event-live-context]')).toContainText('United 2026');
  await page.locator('[data-event-live-toggle]').click();
  await expect(page.locator('[data-event-live-toggle]')).toHaveText('Zapnout LIVE');
  expect(c.r.db.prepare("SELECT registration_status FROM events WHERE id='e'").get().registration_status).toBe('closed');
  await page.locator('[data-event-live-toggle]').click();
  await expect(page.locator('[data-event-live-toggle]')).toHaveText('Vypnout LIVE');
  await page.locator('[data-portal-target="live"]:visible').click();
  await expect(page.locator('[data-admin-live-entry-confirm]')).toBeVisible();
  await page.locator('[data-admin-live-entry-confirm]').click();
  await expect(page.locator('[data-admin-live-mode]')).toBeVisible();
  await page.locator('[data-live-select-category="Sedan"]').click();
  await page.locator('[data-live-choose-member]').click();
  await page.locator('[data-live-select-member="m"]').click();
  await expect(page.locator('[data-live-car-select]')).toHaveValue('c');
  await page.locator('[data-live-start]').click();
  await expect.poll(()=>c.r.db.prepare("SELECT category FROM live_entries WHERE id='legacy'").get().category).toBe('Sedan');
  await page.locator('[data-admin-live-tab="showshine"]').click();
  const form=page.locator('[data-live-judge-form="legacy"]');
  for(const key of ['overall','condition','cohesion','originality'])await form.locator('[data-live-judge-criterion="'+key+'"][data-live-judge-score="8"]').click();
  await form.locator('[data-live-judge-submit]').click();
  await expect(form.locator('.admin-live-success')).toBeVisible();
  expect(c.r.db.prepare('SELECT COUNT(*) n FROM live_judge_scores').get().n).toBe(1);
  await page.locator('[data-live-subview="history"]').click();
  await page.locator('[data-live-edit-score="legacy"]').click();
  await expect(form.locator('input[name=overall]')).toHaveValue('8');
  await form.locator('summary').click();
  await form.locator('[name=note]').fill('Keep draft across another judge update');
  c.r.db.exec("UPDATE members SET role='admin' WHERE id='n'");
  await live.saveJudgeScore(new Request('https://example.invalid',{method:'PUT',body:JSON.stringify({scores:{overall:6,condition:6,cohesion:6,originality:6},submitted:true})}),c.r.env,{uid:'n'},'legacy','https://e36united.cz');
  await expect(page.locator('.admin-live-history')).toContainText('2× porota');
  await expect(form.locator('[name=note]')).toHaveValue('Keep draft across another judge update');
  await form.locator('[data-live-judge-criterion="overall"][data-live-judge-score="9"]').click();
  c.failRefresh=true;
  await form.locator('[data-live-judge-submit]').click();
  await expect(page.locator('[data-admin-live-body]')).toContainText('Hodnocení je uložené. Přehled se nepodařilo obnovit.');
  expect(c.liveWrites).toHaveLength(2);
  expect(JSON.parse(c.r.db.prepare('SELECT scores_json FROM live_judge_scores').get().scores_json).overall).toBe(9);
  c.failRefresh=false;
  await page.locator('[data-admin-live-body] [data-admin-live-retry]').click();
  await expect(form.locator('input[name=overall]')).toHaveValue('9');
  expect(c.liveWrites).toHaveLength(2);
  await page.reload();
  await expect(page.locator('[data-admin-live-mode]')).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-admin-live-tab="members"]').click();
  await expect(page.locator('[data-live-camera]')).toBeVisible();
  await expect(page.locator('[data-live-qr]')).toHaveCount(1);
  await page.locator('[data-admin-live-more-toggle]').click();
  await page.locator('[data-admin-live-exit]').click();
  await expect(page.locator('[data-admin-view]')).toBeVisible();
  expect(c.r.db.prepare("SELECT live_enabled FROM events WHERE id='e'").get().live_enabled).toBe(1);
  expect(c.observations.pageErrors).toEqual([]);
  expect(c.observations.consoleErrors.every(error=>error.text.includes('503')||error.text.includes('Admin LIVE unavailable'))).toBe(true);
 }finally{await page.close();c.r.db.close()}
});

test('LIVE direct entry recovers failed read, creates only an explicitly saved event car and confirms original M',async({page})=>{
 const c=await fixture(page);c.failRefresh=true;
 try{
  c.r.db.exec("UPDATE live_competition_state SET status='idle',current_entry_id=NULL WHERE event_id='e'");
  await page.goto('/admin.html?section=live&event=e');
  await expect(page.locator('[data-admin-live-entry-retry]')).toBeVisible();
  await expect(page.locator('[data-admin-view]')).toBeVisible();
  c.failRefresh=false;
  await page.locator('[data-admin-live-entry-retry]').click();
  await page.locator('[data-admin-live-entry-confirm]').click();
  await page.locator('[data-live-select-category="///M Power"]').click();
  await page.locator('[data-live-choose-member]').click();
  await page.locator('[data-live-select-member="m"]').click();
  await page.locator('[data-live-new-car]').click();
  await page.locator('[data-live-new-car-form] [name=model]').fill('Cancelled');
  await page.locator('[data-live-cancel-car]').click();
  expect(c.r.db.prepare('SELECT COUNT(*) n FROM live_competition_cars').get().n).toBe(0);
  await page.locator('[data-live-new-car]').click();
  const form=page.locator('[data-live-new-car-form]');
  await form.locator('[name=model]').fill('M3 fixture');
  await form.locator('[name=body]').selectOption('Coupé');
  await form.locator('[name=engine]').fill('3.2');
  await form.locator('[name=originalM]').check();
  await form.locator('button[type=submit]').click();
  await expect(form).toHaveCount(0);
  await expect(page.locator('[data-live-start]')).toBeDisabled();
  await page.locator('[data-live-original-m]').check();
  await page.locator('[data-live-start]').click();
  await expect.poll(()=>c.r.db.prepare("SELECT COUNT(*) n FROM live_entries WHERE category='///M Power'").get().n).toBe(1);
  expect(c.r.db.prepare("SELECT car_id FROM reservations WHERE id='r'").get().car_id).toBe('c');
  expect(c.r.db.prepare('SELECT COUNT(*) n FROM cars').get().n).toBe(3);
  await page.locator('[data-admin-live-tab="showshine"]').click();
  await expect(page.locator('[data-live-judge-form]')).toBeVisible();
  expect(c.observations.pageErrors).toEqual([]);
  expect(c.observations.consoleErrors.every(error=>error.text.includes('503')||error.text.includes('Admin LIVE unavailable'))).toBe(true);
 }finally{await page.close();c.r.db.close()}
});
