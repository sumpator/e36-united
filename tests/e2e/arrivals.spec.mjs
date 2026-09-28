import {test,expect} from '@playwright/test';
import {commandFixture} from './command-fixture.mjs';
import {arrivalsRuntime,seedArrivals,EVENT} from '../helpers/arrivals-runtime.mjs';
import {routeArrivals} from '../../worker/domains/arrivals.js';
import {getAdminLive,getMemberLive,getLiveState,searchLiveMembers,resolveLiveQr} from '../../worker/domains/live.js';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type, If-Match, Idempotency-Key','Access-Control-Allow-Methods':'GET, POST, PUT, PATCH, OPTIONS'};
async function setup(page){
 await page.route('https://**/*',route=>route.abort()); // All external traffic denied unless a local fixture explicitly handles it.
 const r=arrivalsRuntime();await seedArrivals(r);const c=await commandFixture(page,{runtime:r});
 await page.route('https://api.e36united.cz/api/live**',async route=>{const q=route.request(),url=new URL(q.url());if(q.method()==='OPTIONS')return route.fulfill({status:204,headers});const response=url.pathname.endsWith('/state')?await getLiveState(r.env,{uid:'a'},url,url.origin):await getMemberLive(r.env,{uid:'a'},url.origin);return route.fulfill({status:response.status,headers,body:await response.text()})});
 await page.route('https://api.e36united.cz/api/admin/**',async route=>{
  const q=route.request(),url=new URL(q.url());if(!url.pathname.includes('/arrivals')&&!url.pathname.includes('/live'))return route.fallback();
  if(q.method()==='OPTIONS')return route.fulfill({status:204,headers});
  const request=new Request(q.url(),{method:q.method(),headers:q.headers(),...(q.postData()?{body:q.postData()}: {})});let response;
  if(url.pathname.includes('/arrivals'))response=await routeArrivals({request,env:r.env,url,origin:url.origin,auth:{uid:'a'}});
  else if(url.pathname.endsWith('/api/admin/live'))response=await getAdminLive(r.env,url,url.origin);
  else if(url.pathname.endsWith('/members'))response=await searchLiveMembers(r.env,EVENT,url,url.origin);
  else if(url.pathname.endsWith('/qr'))response=await resolveLiveQr(request,r.env,EVENT,url.origin);
  else return route.fulfill({status:404,headers,json:{error:'isolated_unhandled'}});
  return route.fulfill({status:response.status,headers,body:await response.text()});
 });return c;
}
for(const width of [360,390,1024,1440])for(const theme of ['light','dark'])test(`arrivals card ${width} ${theme}`,async({page},info)=>{
 const c=await setup(page);await page.setViewportSize({width,height:1000});await page.emulateMedia({colorScheme:theme});
 await page.addInitScript(theme=>{try{localStorage.setItem('e36UnitedAppearance',theme)}catch{}},theme);
 await page.goto('/admin.html?section=arrivals&event='+EVENT);const root=page.locator('[data-admin-panel=arrivals]');
 await expect(root.locator('.gate-heading')).toContainText('LOCAL-ARRIVALS-V1');
 await root.locator('[data-gate-member="fixture-partial"]').click();await expect(root.locator('[data-gate-form]')).toBeVisible();
 await root.locator('[name=cash]').fill('300');await root.locator('[name=acceptDebt]').check();
 await root.locator('[data-gate-refresh]').click();await expect(root.locator('[name=cash]')).toHaveValue('300');
 await page.screenshot({path:info.outputPath(`card-${width}-${theme}.png`),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await root.locator('[data-gate-form] button[type=submit]').click();await expect(root).toContainText('Příjezd potvrzen');await expect(root).toContainText('500');
 await root.locator('[data-gate-next]').click();await expect(root.locator('.gate-counts')).toContainText('Dorazilo aut1');
 await root.locator('[data-gate-detail]').click();await expect(root).toContainText('uhrazeno 800');
 expect(c.r.db.prepare('SELECT COUNT(*) n FROM event_arrivals').get().n).toBe(1);expect(c.observations.pageErrors).toEqual([]);
 await page.screenshot({path:info.outputPath(`confirmed-${width}-${theme}.png`),fullPage:true});await page.close();c.r.db.close();
});
test('lost confirmation survives reload; failed photo retries without another cash payment',async({page})=>{
 const c=await setup(page);let lost=false,uploads=0;
 await page.route('https://api.e36united.cz/api/admin/events/'+EVENT+'/arrivals',async route=>{
  const q=route.request();if(q.method()!=='POST'||lost)return route.fallback();lost=true;
  const request=new Request(q.url(),{method:'POST',headers:q.headers(),body:q.postData()});await routeArrivals({request,env:c.r.env,url:new URL(q.url()),origin:'https://example.invalid',auth:{uid:'a'}});await route.abort('failed');
 });
 await page.route('https://api.e36united.cz/api/admin/events/'+EVENT+'/arrivals/*/photo',async route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});if(route.request().method()!=='POST')return route.fulfill({status:404,headers,json:{error:'no_photo'}});
  uploads++;return route.fulfill({status:uploads===1?500:200,headers,json:uploads===1?{error:'mock_upload_failure'}:{ok:true,photoId:'isolated-photo'}});
 });
 await page.goto('/admin.html?section=arrivals&event='+EVENT);let root=page.locator('[data-admin-panel=arrivals]');
 await root.locator('[data-gate-member="fixture-partial"]').click();await root.locator('[data-gate-form] button[type=submit]').click();await expect(root.locator('[data-gate-reconcile]')).toBeVisible();
 await page.reload();root=page.locator('[data-admin-panel=arrivals]');await root.locator('[data-gate-reconcile]').click();await expect(root).toContainText('Příjezd potvrzen');
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=160;c.height=100;const x=c.getContext('2d');x.fillStyle='#146bc4';x.fillRect(0,0,160,100);return c.toDataURL('image/png').split(',')[1]});
 await root.locator('[data-gate-file]').last().setInputFiles({name:'isolated-car.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await root.locator('[data-gate-photo-retry]').click();await expect(root.locator('[data-upload-state=error]')).toBeVisible();
 await root.locator('[data-gate-photo-retry]').click();await expect(root.locator('[data-upload-state=uploaded]')).toBeVisible();
 expect(uploads).toBe(2);expect(c.r.db.prepare("SELECT COUNT(*) n FROM event_payments WHERE method='cash'").get().n).toBe(1);expect(c.r.db.prepare('SELECT COUNT(*) n FROM event_arrivals').get().n).toBe(1);
 await page.close();c.r.db.close();
});
test('same arrivals in LIVE and regular Admin while LIVE off; manual QR and replay',async({page})=>{
 const c=await setup(page);await page.goto('/admin.html?section=live&event='+EVENT);
 await page.locator('[data-admin-live-entry-confirm]').click();
 await page.locator('[data-admin-live-tab=arrivals]').click();const live=page.locator('[data-admin-live-body]');
 await expect(live.locator('.gate-heading')).toBeVisible();
 await live.locator('[data-gate-find]').click();const qr=c.r.db.prepare("SELECT token FROM member_qr_identities WHERE member_id='fixture-paid'").get().token;
 await live.locator('[name=payload]').fill('E36U1:'+qr);await live.locator('[data-gate-qr] button').click();await live.locator('[data-gate-form] button[type=submit]').click();await expect(live).toContainText('Příjezd potvrzen');
  await page.evaluate(()=>{for(const k of Object.keys(localStorage))if(k.startsWith('e36United.adminLiveMode.'))localStorage.removeItem(k)});
  await page.goto('/admin.html?section=arrivals&event='+EVENT);const regular=page.locator('[data-admin-panel=arrivals]');await expect(regular).toContainText('Příjezd potvrzen');await regular.locator('[data-gate-next]').click();await regular.locator('[data-gate-find]').click();await regular.locator('[name=payload]').fill('E36U1:'+qr);await regular.locator('[data-gate-qr] button').click();await regular.locator('[data-gate-form] button[type=submit]').click();await expect(regular).toContainText('Příjezd již evidován');expect(c.r.db.prepare('SELECT COUNT(*) n FROM event_arrivals').get().n).toBe(1);
 expect(c.r.db.prepare('SELECT live_enabled FROM events WHERE id=?').get(EVENT).live_enabled).toBe(0);await page.close();c.r.db.close();
});
