import {publicMerch,routeMerch} from '../../worker/domains/merch/index.js';
import {getLiveState,getAdminLive,getMemberLive} from '../../worker/domains/live.js';
export async function bridge(page,env,uid){
 await page.route('https://api.e36united.cz/api/live',async route=>{const response=await getMemberLive(env,{uid},'https://e36united.cz');await route.fulfill({status:response.status,headers:{'Access-Control-Allow-Origin':'*'},body:await response.text()});});
 await page.route('https://api.e36united.cz/api/admin/live?*',async route=>{const response=await getAdminLive(env,new URL(route.request().url()),'https://e36united.cz');await route.fulfill({status:response.status,headers:{'Access-Control-Allow-Origin':'*'},body:await response.text()});});
 await page.route('https://api.e36united.cz/api/live/state*',async route=>{const response=await getLiveState(env,{uid},new URL(route.request().url()),'https://e36united.cz');await route.fulfill({status:response.status,headers:{'Access-Control-Allow-Origin':'*'},body:await response.text()});});
 await page.route('https://api.e36united.cz/api/**',async route=>{
  const r=route.request(),url=new URL(r.url());if(!url.pathname.startsWith('/api/merch/')&&!url.pathname.startsWith('/api/admin/merch/'))return route.fallback();
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PUT,PATCH,OPTIONS'};
  if(r.method()==='OPTIONS')return route.fulfill({status:204,headers});
  try{const request=new Request(r.url(),{method:r.method(),headers:r.headers(),...(r.postData()?{body:r.postData()}: {})});
   const response=r.method()==='GET'&&url.pathname==='/api/merch/catalog'?await publicMerch(env,url,'https://e36united.cz'):await routeMerch({request,env,url,auth:{uid},origin:'https://e36united.cz'},url.pathname.startsWith('/api/admin/'));
   await route.fulfill({status:response.status,headers:{...Object.fromEntries(response.headers),...headers},body:Buffer.from(await response.arrayBuffer())});
  }catch(error){await route.fulfill({status:500,headers,contentType:'application/json',body:JSON.stringify({message:error.message})});}
 });
}
