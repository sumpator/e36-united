import { json } from '../../http/responses.js';
import { cors } from '../../http/cors.js';
import { requireActiveMember } from '../../auth/member.js';
import { validateImageFile,extensionFor } from '../media.js';
import { createSmtp2goAdapter,senderConfig } from '../mailing/provider/smtp2go.js';
import { fail,MerchError,key,uid,stamp } from './model.js';
import { getCatalog,seedCatalog,quotation,createOrder,readOrder,listOrders,changeOrder,getAddress,saveAddress,saveProduct,saveSettings } from './service.js';

async function body(request){
 const reader=request.body?.getReader();if(!reader)fail('Chybí data.');const chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>100000){await reader.cancel();fail('Požadavek je příliš velký.',413);}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 let value;try{value=JSON.parse(new TextDecoder().decode(bytes));}catch{fail('Neplatný JSON.');}
 if(!value||typeof value!=='object'||Array.isArray(value))fail('Požadavek musí být objekt.');return value;
}
export async function deliverMerchEmail(env,orderId){
 const rows=(await env.DB.prepare("SELECT * FROM merch_outbox WHERE order_id=? AND status='pending'").bind(orderId).all()).results;
 for(const row of rows){
  const lock=await env.DB.prepare("UPDATE merch_outbox SET status='sending' WHERE id=? AND status='pending'").bind(row.id).run();if(!lock.meta.changes)continue;
  try{
   const order=await readOrder(env,row.order_id),payload=JSON.parse(row.payload),s=order.snapshot,a=s.address;
   const message=[payload.subject,order.number,payload.event?`Přijato: ${payload.event.at}\n${payload.event.reason||''}`:'',order.state.tracking?.number?`Zásilka: ${order.state.tracking.carrier} ${order.state.tracking.number}\n${order.state.tracking.url}`:'',...s.lines.map(l=>`${l.name} / ${l.color} / ${l.size}: ${l.quantity} × ${(l.unitPriceMinor/100).toFixed(2)} Kč`),`Sleva: ${(s.discountMinor/100).toFixed(2)} Kč`,`Doprava: ${(s.shippingMinor/100).toFixed(2)} Kč`,`Celkem: ${(s.totalMinor/100).toFixed(2)} Kč`,`Účet: ${s.bank.accountDisplay}`,`VS: ${order.variableSymbol}`,`Platba do: ${order.expiresAt}`,`${a.name}, ${a.street}, ${a.city} ${a.postalCode}`,s.deliveryInformation,s.pickupInstructions,`Podmínky ${s.termsVersion}`, ...Object.entries(s.documents).map(([k,v])=>`${k}\n${v}`)].join('\n\n');
   const sender=senderConfig(env);
   await createSmtp2goAdapter(env).sendBatch([{sender:sender.sender,to:[a.email],subject:`${payload.subject} ${order.number}`,text_body:message,custom_headers:[{header:'Reply-To',value:sender.replyTo}]}]);
   await env.DB.prepare("UPDATE merch_outbox SET status='sent',sent_at=? WHERE id=?").bind(stamp(),row.id).run();
  }catch(error){
   // Ambiguous provider outcomes are never automatically retried; saved order survives.
   await env.DB.prepare("UPDATE merch_outbox SET status=?,error_code=? WHERE id=?").bind(error.definiteRejection||error.code==='provider_not_configured'?'failed':'uncertain',error.code||'delivery_unconfirmed',row.id).run();
  }
 }
}
async function upload(request,env,auth){
 const size=Number(request.headers.get('Content-Length'));if(!size||size>9*1024*1024)fail('Fotografie musí mít nejvýše 8 MB.',413);
 const fd=await request.formData(),file=fd.get('file'),error=validateImageFile(file);if(error)fail(error);
 const bytes=new Uint8Array(await file.arrayBuffer()),magic=file.type==='image/png'?bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71:file.type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 if(!magic)fail('Obsah neodpovídá typu fotografie.');
 const id=uid(),objectKey=`merch/${id}.${extensionFor(file.type)}`;
 await env.MEDIA.put(objectKey,bytes,{httpMetadata:{contentType:file.type}});
 try{await env.DB.prepare('INSERT INTO merch_media(id,object_key,content_type,created_by,created_at) VALUES(?,?,?,?,?)').bind(id,objectKey,file.type,auth.uid,stamp()).run();}catch(e){await env.MEDIA.delete(objectKey);throw e;}
 return {image:`r2:${id}`};
}
export async function publicMerch(env,url,origin){
 try{
  if(url.pathname==='/api/merch/catalog'){
   const result=await getCatalog(env);return json(result,200,origin);
  }
  const match=url.pathname.match(/^\/api\/merch\/media\/([a-z0-9-]+)$/);
  if(match){
   const meta=await env.DB.prepare('SELECT * FROM merch_media WHERE id=? AND public=1').bind(match[1]).first();
   const object=meta&&await env.MEDIA.get(meta.object_key);if(!object)return json({error:'not_found'},404,origin);
   return cors(new Response(object.body,{headers:{'Content-Type':meta.content_type,'Cache-Control':'public,max-age=300','X-Content-Type-Options':'nosniff'}}),origin);
  }
 }catch(error){if(error instanceof MerchError)return json({error:'merch_error',message:error.message},error.status,origin);throw error;}
 return null;
}
export async function routeMerch({request,env,url,origin,auth,ctx},admin=false){
 const prefix=admin?'/api/admin/merch':'/api/merch';if(!url.pathname.startsWith(prefix+'/'))return null;
 try{
  if(!admin&&!await requireActiveMember(env,auth))fail('Nakupuje přihlášený aktivní člen.',403);
  const path=url.pathname.slice(prefix.length),method=request.method;
  let result;
  if(path==='/catalog'&&admin&&method==='GET')result=await getCatalog(env,true);
  else if(path==='/seed'&&admin&&method==='POST')result=await seedCatalog(env,auth.uid);
  else if(path==='/products'&&admin&&method==='PUT')result=await saveProduct(env,auth.uid,await body(request));
  else if(path==='/settings'&&admin&&method==='PUT')result=await saveSettings(env,auth.uid,await body(request));
  else if(path==='/media'&&admin&&method==='POST')result=await upload(request,env,auth);
  else if(path==='/address'&&!admin&&method==='GET')result={address:await getAddress(env,auth.uid)};
  else if(path.startsWith('/requests/')&&!admin&&method==='GET'){
   const row=await env.DB.prepare('SELECT id FROM merch_orders WHERE member_id=? AND request_key=?').bind(auth.uid,key(path.slice('/requests/'.length))).first();
   result={order:row?await readOrder(env,row.id,auth.uid):null};
  }
  else if(path==='/address'&&!admin&&method==='PUT')result={address:await saveAddress(env,auth.uid,await body(request))};
  else if(path==='/quote'&&!admin&&method==='POST'){const q=await quotation(env,auth.uid,await body(request));result={quote:q.quote,hash:q.hash};}
  else if(path==='/orders'&&!admin&&method==='POST'){
   result={order:await createOrder(env,auth.uid,await body(request))};
   if(ctx)ctx.waitUntil(deliverMerchEmail(env,result.order.id));
  }else if(path==='/orders'&&method==='GET')result=await listOrders(env,{member:admin?url.searchParams.get('memberId'):auth.uid,search:url.searchParams.get('search'),filter:url.searchParams.get('filter')||'all',page:Number(url.searchParams.get('page')||1)});
  else{
   const match=path.match(/^\/orders\/([a-z0-9-]+)(?:\/(email))?$/);
   if(!match)fail('Endpoint neexistuje.',404);
   if(method==='GET'&&match[2]&&admin)result={messages:(await env.DB.prepare('SELECT kind,status,error_code,sent_at FROM merch_outbox WHERE order_id=?').bind(match[1]).all()).results};
   else if(method==='GET'&&!match[2])result={order:await readOrder(env,match[1],admin?null:auth.uid)};
   else if(method==='PATCH'&&!match[2]){
    const input=await body(request);result={order:await changeOrder(env,auth.uid,match[1],input,admin)};
    if(['withdraw','complaint'].includes(input.action)||input.action==='status'&&input.status==='sent'){
     if(ctx)ctx.waitUntil(deliverMerchEmail(env,match[1]));
    }
   }else if(method==='POST'&&match[2]&&admin){await deliverMerchEmail(env,match[1]);result={messages:(await env.DB.prepare('SELECT kind,status,error_code,sent_at FROM merch_outbox WHERE order_id=?').bind(match[1]).all()).results};}
   else fail('Metoda není povolena.',405);
  }
  return json({ok:true,...result},200,origin);
 }catch(error){if(error instanceof MerchError)return json({ok:false,error:'merch_error',message:error.message},error.status,origin);throw error;}
}
