import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {commandFixture} from './command-fixture.mjs';
import {competitionCarMedia} from '../../worker/domains/live.js';
import {installScreenshotReadiness,waitForScreenshotContent} from './screenshot-readiness.mjs';

const clean=c=>{
 expect(c.observations.pageErrors).toEqual([]);
 expect(c.observations.consoleErrors).toEqual([]);
 expect(c.observations.unhandledApi).toEqual([]);
};
async function capture(page,info,name){
 // Visit lazily hydrated private thumbnails before a full-page capture, just as
 // ordinary scrolling does. Keep their real handler and ownership checks.
 for(const image of await page.locator('img[data-card-media]').all()){
  await image.scrollIntoViewIfNeeded();await expect.poll(()=>image.evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
 }
 await page.evaluate(()=>scrollTo(0,0));
 await waitForScreenshotContent(page,{label:name});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath(name+'.png'),fullPage:name!=='dashboard-editor'});
}
for(const width of [1440,820,390,360])for(const theme of ['light','dark'])test(`ordinary Admin visual ${width} ${theme}`,async({page},info)=>{
 installScreenshotReadiness(page);
 await page.setViewportSize({width,height:960});
 await page.addInitScript(theme=>{if(window===window.top)localStorage.setItem('e36UnitedAppearance',theme)},theme);
 const c=await commandFixture(page);
 c.r.db.exec("UPDATE members SET name='Žaneta Černá Dlouhé Příjmení',nickname='Přezdívka člena s dlouhým názvem',email='velmi.dlouha.adresa.clena.pro.overeni@example.invalid' WHERE id='m'; UPDATE reservations SET car_id='c' WHERE id='r'; UPDATE united_history_claims SET attendance_status='pending',sns_status='pending';");
 await page.route('https://api.e36united.cz/api/admin/events/e/live/cars/*/media',async route=>{
  const id=new URL(route.request().url()).pathname.split('/').at(-2),response=await competitionCarMedia(c.r.env,'e',id,'https://e36united.cz');
  expect(response.status).toBe(200);
  await route.fulfill({status:response.status,headers:{'Access-Control-Allow-Origin':'*'},contentType:'image/webp',body:readFileSync(new URL('../../assets/images/showshine/ss_sedan.webp',import.meta.url))});
 });
 try{
  await page.goto('/admin.html?section=members&event=e');
  const member=page.locator('[data-member-list] .compact-member-card').filter({has:page.locator('[data-member-open=m]')});
  await expect(member).toContainText('velmi.dlouha.adresa.clena.pro.overeni@example.invalid');
  await expect(member.locator('.compact-member-initials')).toHaveText('ŽČ');
  if(width<=820){const visible=await page.locator('.admin-section-nav [data-admin-jump=members]').evaluate(button=>{const rail=button.closest('[data-portal-tablist]').getBoundingClientRect(),b=button.getBoundingClientRect();return b.left>=rail.left-1&&b.right<=rail.right+1});expect(visible).toBe(true)}
  await expect.poll(()=>member.locator('[data-card-media]').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
  const noPhoto=page.locator('[data-member-list] .compact-member-card').filter({has:page.locator('[data-member-open=a]')});
  await expect(noPhoto.locator('img')).toHaveCount(0);await expect(noPhoto.locator('.compact-member-placeholder svg')).toBeVisible();
  await capture(page,info,'members');
  await member.locator('[data-member-open=m]').click();await expect(page.locator('[data-member-dialog]')).toContainText('EU-MEMBER');
  await page.locator('[data-member-close]').click();await expect(page.locator('[data-member-dialog]')).toBeHidden();
  await page.locator('[data-member-list-mode=rows]').click();await expect(page.locator('[data-member-list]')).toHaveAttribute('data-member-view','rows');await capture(page,info,'members-rows');
  await page.goto('/admin.html?section=community&view=club&event=e');await expect(page.locator('[data-history-id=h]')).toBeVisible();await capture(page,info,'history');
  await page.goto('/admin.html?section=event&event=e');await expect(page.locator('[data-admission-settings] input[name=registered]')).toBeVisible();await expect(page.locator('[data-event-settings-form] [name=registrationStatus]')).toHaveValue('closed');
  if(width<=390){
   const fields=await page.locator('[data-event-settings-form]').evaluate(form=>({columns:getComputedStyle(form).gridTemplateColumns.split(' ').length,boxes:[...form.children].map(field=>{const box=field.getBoundingClientRect();return{top:box.top,bottom:box.bottom,left:box.left,right:box.right}})}));
   expect(fields.columns).toBe(1);for(let i=1;i<fields.boxes.length;i++)expect(fields.boxes[i].top).toBeGreaterThanOrEqual(fields.boxes[i-1].bottom);
  }
  await capture(page,info,'settings');
  await page.goto('/admin.html?section=arrivals&event=e');await expect(page.locator('[data-admin-panel=arrivals] [data-gate-member=m]')).toBeVisible();await capture(page,info,'arrivals');
  await page.goto('/admin.html?section=dashboard&event=e');await expect(page.locator('[data-dashboard-edit]')).toBeEnabled();await capture(page,info,'dashboard');
  await page.locator('[data-dashboard-edit]').click();await expect(page.locator('.command-settings')).toBeVisible();await capture(page,info,'dashboard-editor');
  await page.locator('[data-dashboard-cancel]').click();await expect(page.locator('.command-settings')).toBeHidden();
  if(width<=820){await page.locator('[data-portal-menu-open]').click();const sheet=page.locator('.portal-nav-sheet-list');await expect(sheet.locator('.command-nav-group')).toHaveCount(3);await sheet.locator('[data-admin-jump=members]').click();await expect(page.locator('[data-admin-panel=members]')).toBeVisible();await expect(page.locator('[data-portal-sheet]')).toBeHidden();}
  expect(c.writes).toEqual([]);expect(c.r.writes).toBe(0);clean(c);
 }finally{c.r.db.close()}
});

test('ordinary Admin settings preserve dirty values, save through real handler and reload',async({page})=>{
 const c=await commandFixture(page);
 try{
  await page.goto('/admin.html?section=event&event=e');
  const form=page.locator('[data-event-settings-form]'),venue=form.locator('[name=venueName]');
  await expect(venue).toBeEnabled();await venue.fill('Izolované místo · Černá');
  await page.locator('[data-refresh]').click();await expect(page.locator('[data-loading]')).toBeHidden();await expect(venue).toHaveValue('Izolované místo · Černá');
  await form.getByRole('button',{name:'Uložit nastavení'}).click();
  await expect.poll(()=>c.r.db.prepare("SELECT venue_name FROM events WHERE id='e'").get().venue_name).toBe('Izolované místo · Černá');
  await expect(page.locator('[data-loading]')).toBeHidden();await page.reload();await expect(venue).toHaveValue('Izolované místo · Černá');
  expect(c.writes.map(write=>write.component)).toEqual(['event']);clean(c);
 }finally{c.r.db.close()}
});

for(const theme of ['light','dark'])test(`ordinary Admin stylesheet leaves standalone LIVE unchanged ${theme}`,async({page})=>{
 await page.addInitScript(theme=>{if(window===window.top)localStorage.setItem('e36UnitedAppearance',theme)},theme);
 const c=await commandFixture(page);
 try{
  await page.goto('/admin.html?section=live&event=e');await page.locator('[data-admin-live-entry-confirm]').click();await expect(page.locator('body')).toHaveClass(/admin-live-mode-active/);
  const styles=()=>page.locator('[data-admin-live-mode]').evaluate(root=>[root,...root.querySelectorAll('header,button,h1,h2,p')].map(node=>{const s=getComputedStyle(node);return[s.color,s.backgroundColor,s.borderColor,s.fontSize,s.padding,s.display,s.width,s.height]}));
  const before=await styles();await page.locator('link[href^="admin/center-visual.css"]').evaluate(link=>link.disabled=true);expect(await styles()).toEqual(before);
  expect(c.writes).toEqual([]);expect(c.r.writes).toBe(0);clean(c);
 }finally{c.r.db.close()}
});
