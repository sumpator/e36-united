// Exact ancillary read contracts backed by the current schema and real handlers.
// Unrecognized paths/methods fall through to the fixture's strict 501 response.
import {memberRuntime} from '../helpers/admin-member-runtime.mjs';
import {getMemberLive,getAdminLive,getLiveState} from '../../worker/domains/live.js';
import {routeArrivals} from '../../worker/domains/arrivals.js';
import {routeMerch} from '../../worker/domains/merch/index.js';
export async function ancillaryReads(page,{runtime,uid,admin=false}){
 const owned=!runtime,r=runtime||memberRuntime();
 if(owned){
  r.db.exec("UPDATE events SET is_current=0,year=2024 WHERE id='e'; INSERT INTO events(id,year,title,is_current) VALUES('united-2026',2026,'E36 United 2026',1)");
  page.once('close',()=>r.db.close());
 }
 await page.route('https://api.e36united.cz/api/**',async route=>{
  const q=route.request(),url=new URL(q.url()),p=url.pathname;
  if(q.method()!=='GET')return route.fallback();
  const recognized=['/api/live','/api/live/state','/api/merch/orders','/api/merch/address'].includes(p)||admin&&(p==='/api/admin/live'||/^\/api\/admin\/events\/[^/]+\/arrivals$/.test(p));
  if(!recognized)return route.fallback();
  const id=typeof uid==='function'?uid():uid;
  if(owned)r.db.prepare("INSERT OR IGNORE INTO members(id,member_code,email,name,role) VALUES(?,?,?,?,?)").run(id,id,'browser-'+id+'@example.invalid','Fixture member',admin?'admin':'member');
  const auth={uid:id},origin='https://e36united.cz';let response;
  if(p==='/api/live')response=await getMemberLive(r.env,auth,origin);
  else if(p==='/api/live/state')response=await getLiveState(r.env,auth,url,origin);
  else if(p==='/api/admin/live')response=await getAdminLive(r.env,url,origin);
  else if(p.startsWith('/api/merch/'))response=await routeMerch({request:new Request(url),url,env:r.env,auth,origin});
  else response=await routeArrivals({request:new Request(url),url,env:r.env,auth,origin});
  return route.fulfill({status:response.status,headers:{'Access-Control-Allow-Origin':'*','Content-Type':'application/json'},body:await response.text()});
 });
 return r;
}
