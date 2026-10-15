import {test,expect} from '@playwright/test';
import {commandFixture} from './command-fixture.mjs';
import {installScreenshotReadiness,waitForScreenshotContent} from './screenshot-readiness.mjs';

const longNickname='Dlouhá přezdívka člena která se nevejde na dva řádky karty';
const longName='Žaneta Černá Dlouhé Příjmení';
const longEmail='velmi.dlouha.adresa.clena.pro.overeni@example.invalid';
const seed=[
 {id:'sample01',name:'Radek Fiala',nickname:'radkoun',photo:true,status:'approved'},
 {id:'sample02',name:'Jana Šťastná',nickname:'Jana',photo:false,status:null},
 {id:'sample03',name:'Michal Novák',nickname:'Michal',photo:true,status:'rejected'},
 {id:'sample04',name:'Petr Dvořák',nickname:'Vosa',photo:false,status:'cancelled'},
 {id:'sample05',name:'Roman Kovář',nickname:'Roman',photo:true,status:null},
];
async function fixture(page){
 const c=await commandFixture(page),db=c.r.db;
 db.prepare('UPDATE members SET nickname=?,name=?,email=? WHERE id=\'m\'').run(longNickname,longName,longEmail);
 db.exec("UPDATE united_history_claims SET attendance_status='pending',sns_status='pending'; UPDATE gallery_submissions SET status='pending';");
 for(const member of seed){
  db.prepare('INSERT INTO members(id,member_code,email,name,nickname,role) VALUES(?,?,?,?,?,\'member\')').run(member.id,'LOCAL-CARD-'+member.id,member.id+'@example.invalid',member.name,member.nickname);
  db.prepare('INSERT INTO cars(id,member_id,model,is_primary) VALUES(?,?,?,1)').run('car-'+member.id,member.id,'BMW E36');
  if(member.photo)db.prepare('INSERT INTO car_photos(id,car_id,r2_key) VALUES(?,?,?)').run('photo-'+member.id,'car-'+member.id,'private/'+member.id+'/photo');
  if(member.status)db.prepare('INSERT INTO reservations(id,member_id,event_id,status,amount_due_czk,amount_paid_czk,crew) VALUES(?,?,\'e\',?,1000,0,1)').run('reservation-'+member.id,member.id,member.status);
 }
 db.exec("INSERT INTO united_history_claims(id,member_id,event_id,attendance_status,sns_status) VALUES('sample-attended','sample01','old','approved','not_claimed'),('sample-pending','sample04','old','pending','not_claimed'); INSERT INTO gallery_submissions(id,member_id,r2_key,status) VALUES('sample-photo-pending','sample05','private/sample05/community','pending');");
 return c;
}
const card=(page,id)=>page.locator('[data-member-list]>.compact-member-card').filter({has:page.locator('[data-member-open="'+id+'"]')});
const clean=c=>{expect(c.observations.pageErrors).toEqual([]);expect(c.observations.consoleErrors).toEqual([]);expect(c.observations.unhandledApi).toEqual([])};

async function capture(page,info,name){
 for(const image of await page.locator('[data-member-list] img[data-card-media]').all()){
  await image.scrollIntoViewIfNeeded();await expect.poll(()=>image.evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
 }
 await page.evaluate(()=>scrollTo(0,0));await waitForScreenshotContent(page,{label:name});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath(name+'.png'),fullPage:true});
}
for(const width of [1440,820,390,360])for(const theme of ['light','dark'])test(`Members card composition ${width} ${theme}`,async({page},info)=>{
 installScreenshotReadiness(page);await page.setViewportSize({width,height:960});
 await page.addInitScript(theme=>{if(window===window.top)localStorage.setItem('e36UnitedAppearance',theme)},theme);
 const c=await fixture(page);
 try{
  await page.goto('/admin.html?section=members&event=e');await expect(page.locator('[data-member-list]>.compact-member-card')).toHaveCount(8);await expect(page.locator('[data-loading]')).toBeHidden();
  const member=card(page,'m');await expect(member.getByRole('button',{name:longNickname,exact:true})).toHaveCount(1);
  await expect(member.locator('.compact-member-identity>p')).toHaveText(longName);await expect(member.locator('.compact-member-data>a')).toHaveText(longEmail);await expect(member.locator('.compact-member-initials')).toHaveText('ŽČ');
  await expect(member.locator('[data-member-pending]')).toHaveText('Ke kontrole: 3 →');await expect(member.locator('[data-member-pending]')).toHaveAttribute('data-member-pending','history');await expect(member.locator('[data-member-pending]')).toHaveAttribute('title','Registrace: 0; účast: 1; S&S: 1; fotky: 1');
  await expect(card(page,'n').locator('[data-member-pending]')).toHaveAttribute('data-member-pending','reservations');await expect(card(page,'sample05').locator('[data-member-pending]')).toHaveAttribute('data-member-pending','photos');
  for(const sample of seed){
   const item=card(page,sample.id);await expect(item.locator('.compact-member-identity>p')).toHaveText(sample.name);
   if(!sample.photo){await expect(item.locator('img')).toHaveCount(0);await expect(item.locator('.compact-member-placeholder svg')).toBeVisible()}
  }
  await expect(card(page,'sample01')).toContainText('United: 1×');await expect(card(page,'sample01').locator('.compact-member-registration')).toHaveText('Schválená');await expect(card(page,'sample01').locator('[data-member-pending]')).toHaveCount(0);
  await expect(card(page,'sample02').locator('.compact-member-registration')).toHaveText('Bez registrace');await expect(card(page,'sample03').locator('.compact-member-registration')).toHaveText('Zamítnutá');await expect(card(page,'sample04').locator('.compact-member-registration')).toHaveText('Zrušená');
  await capture(page,info,'members-grid');
  const geometry=await page.locator('[data-member-list]>.compact-member-card').evaluateAll(cards=>cards.map(item=>{
   const rect=n=>{const r=n.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}},photo=item.querySelector('.compact-member-photo'),initials=item.querySelector('.compact-member-initials'),nickname=item.querySelector('.admin-member-link'),name=item.querySelector('.compact-member-identity>p'),email=item.querySelector('.compact-member-data>a'),facts=item.querySelector('.compact-member-facts'),pending=item.querySelector('[data-member-pending]');
   const box=rect(item),last=rect(pending||facts),n=getComputedStyle(nickname);
   return{id:nickname.dataset.memberOpen,box,photo:rect(photo),initials:rect(initials),email:rect(email),name:rect(name),facts:rect(facts),pending:pending?{...rect(pending),fontSize:parseFloat(getComputedStyle(pending).fontSize)}:null,footerGap:box.bottom-last.bottom,padding:parseFloat(getComputedStyle(item).paddingBottom),border:parseFloat(getComputedStyle(item).borderBottomWidth),nickname:{fontSize:parseFloat(n.fontSize),weight:Number(n.fontWeight),lineHeight:parseFloat(n.lineHeight),height:nickname.clientHeight,clamp:n.webkitLineClamp},overflow:email.scrollWidth>email.clientWidth+1||name.scrollWidth>name.clientWidth+1};
  }));
  await info.attach('members-card-geometry',{body:JSON.stringify(geometry,null,2),contentType:'application/json'});
  for(const item of geometry){
   expect(item.photo.width).toBe(100);expect(item.photo.height).toBe(76);expect(item.initials.width).toBe(30);expect(item.initials.height).toBe(30);expect(item.nickname.weight).toBe(600);expect(item.nickname.fontSize).toBe(18);expect(item.nickname.clamp).toBe('2');expect(item.nickname.height).toBeLessThanOrEqual(item.nickname.lineHeight*2+1);expect(item.overflow).toBe(false);
   expect(item.email.top).toBeGreaterThanOrEqual(item.photo.bottom);expect(item.facts.top).toBeGreaterThanOrEqual(item.email.bottom);expect(item.footerGap).toBeCloseTo(item.padding+item.border,0);expect(item.box.right).toBeLessThanOrEqual(width);
   if(item.pending){expect(item.pending.top).toBeGreaterThanOrEqual(item.facts.bottom);expect(item.pending.height).toBeGreaterThanOrEqual(width<=390?44:36);expect(item.pending.fontSize).toBe(13)}
  }
  expect(await page.locator('[data-member-list]').evaluate(list=>getComputedStyle(list).gridTemplateColumns.split(' ').length)).toBe(width===1440?3:width===820?2:1);
  if(width<=390){await member.scrollIntoViewIfNeeded();await waitForScreenshotContent(page,{label:'mobile-member'});await member.screenshot({path:info.outputPath('member-long.png')})}
  await member.getByRole('button',{name:longNickname,exact:true}).click();await expect(page.locator('[data-member-dialog]')).toBeVisible();await expect(page.locator('#admin-member-heading')).toHaveText(longNickname);await page.locator('[data-member-close]').click();await expect(page.locator('[data-member-dialog]')).toBeHidden();
  const reads=c.calls.filter(p=>p.includes('/members?')).length;await page.locator('[data-member-list-mode=rows]').click();await expect(page.locator('[data-member-list]')).toHaveAttribute('data-member-view','rows');expect(c.calls.filter(p=>p.includes('/members?'))).toHaveLength(reads);expect((await member.locator('.compact-member-photo').boundingBox()).height).toBe(54);await capture(page,info,'members-rows');
  await page.reload();await expect(page.locator('[data-member-list]')).toHaveAttribute('data-member-view','rows');await expect(page.locator('[data-loading]')).toBeHidden();await page.locator('[data-member-list-mode=cards]').click();await expect(page.locator('[data-member-list]')).toHaveAttribute('data-member-view','cards');await page.locator('[data-refresh]').click();await expect(page.locator('[data-loading]')).toBeHidden();await expect(member.getByRole('button',{name:longNickname,exact:true})).toBeVisible();await expect(member.locator('[data-member-pending]')).toHaveText('Ke kontrole: 3 →');
  expect(c.writes).toEqual([]);expect(c.r.writes).toBe(0);clean(c);
 }finally{c.r.db.close()}
});
test('Members final footer alignment and explicit review label',async({page},info)=>{
 installScreenshotReadiness(page);const c=await fixture(page);
 try{
  await page.setViewportSize({width:1440,height:960});await page.goto('/admin.html?section=members&event=e');await expect(page.locator('[data-member-list]>.compact-member-card')).toHaveCount(8);await expect(page.locator('[data-loading]')).toBeHidden();
  for(const [width,theme] of [[1440,'light'],[390,'dark']]){
   await page.setViewportSize({width,height:960});await page.evaluate(theme=>{localStorage.setItem('e36UnitedAppearance',theme);document.documentElement.dataset.theme=theme},theme);
   const member=card(page,'m'),action=member.locator('[data-member-pending]');await expect(action).toHaveText('Ke kontrole: 3 →');await expect(action).toHaveAttribute('aria-label','Ke kontrole: 3. Registrace: 0; účast: 1; S&S: 1; fotky: 1');
   const footers=await page.locator('[data-member-list]>.compact-member-card').evaluateAll(cards=>cards.map(item=>{const last=item.querySelector('[data-member-pending]')||item.querySelector('.compact-member-facts'),box=item.getBoundingClientRect(),bottom=last.getBoundingClientRect().bottom,style=getComputedStyle(item);return{top:box.top,bottom:box.bottom,lastBottom:bottom,gap:box.bottom-bottom,inset:parseFloat(style.paddingBottom)+parseFloat(style.borderBottomWidth)}}));
   for(const footer of footers)expect(footer.gap).toBeCloseTo(footer.inset,0);
   if(width===1440)for(const footer of footers){const row=footers.filter(other=>Math.abs(other.top-footer.top)<1);expect(Math.max(...row.map(other=>other.lastBottom))-Math.min(...row.map(other=>other.lastBottom))).toBeLessThanOrEqual(.5)}
   await info.attach('final-footers-'+width,{body:JSON.stringify(footers),contentType:'application/json'});await capture(page,info,'final-members-'+width+'-'+theme);
  }
  expect(c.writes).toEqual([]);clean(c);
 }finally{c.r.db.close()}
});
