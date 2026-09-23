import { catalog as initialCatalog } from '../../../merch/catalog.js';
import { MerchError,fail,text,key,integer,stamp,uid,encode,digest,address,configurationMissing,quoteLines,projectOrder } from './model.js';

const prepare=(env,sql,...values)=>env.DB.prepare(sql).bind(...values);
export async function configRecord(env){return env.DB.prepare('SELECT * FROM merch_config WHERE id=1').first();}
export async function catalogRecords(env){return (await env.DB.prepare('SELECT * FROM merch_products ORDER BY id').all()).results;}
export async function getCatalog(env,admin=false){
 const c=await configRecord(env),settings=JSON.parse(c.data),records=await catalogRecords(env);
 const products=records.map(r=>({...JSON.parse(r.data),revision:r.revision})).filter(p=>admin||p.status==='published').sort((a,b)=>a.position-b.position);
 return {products,settings,revision:c.revision,missing:configurationMissing(settings),ready:!settings.paused&&!configurationMissing(settings).length};
}
export async function seedCatalog(env,actor){
 const rows=initialCatalog.map((p,i)=>{const product={...p,name:p.id==='united-u-polo'?'United U Polo':p.name==='E36 United'?'United Heritage':p.name,gender:p.id.includes('women')?'women':p.id.includes('men')?'men':'unisex',status:'published',position:i,
  category:p.category==='polo'?'Pola':'Trička',variants:p.variants.map(v=>({...v,priceMinor:p.category==='polo'?89000:69000,sizes:['S','M','L','XL'],availability:'available'}))};return prepare(env,'INSERT INTO merch_products(id,data) VALUES(?,?) ON CONFLICT(id) DO NOTHING',p.id,encode(product))});
 await env.DB.batch([...rows,prepare(env,'INSERT INTO merch_audit VALUES(?,?,?,?,?,?)',uid(),actor,'catalog','seed',stamp(),'{}')]);
 return getCatalog(env,true);
}
export async function points(env,member){return Number((await prepare(env,'SELECT COALESCE(SUM(delta),0) AS value FROM united_points_ledger WHERE member_id=?',member).first())?.value||0);}
export async function quotation(env,member,input){
 if(!Array.isArray(input.lines))fail('Košík musí obsahovat položky.');
 if(['totalMinor','discountMinor','priceMinor','discountBasisPoints'].some(k=>Object.hasOwn(input,k))||input.lines?.some(l=>['priceMinor','unitPriceMinor','totalMinor','discountMinor'].some(k=>Object.hasOwn(l,k))))fail('Cenu a slevu určuje výhradně server.');
 const record=await configRecord(env),settings=JSON.parse(record.data),records=await catalogRecords(env),score=await points(env,member);
 if(settings.paused||configurationMissing(settings).length)fail('Objednávání zatím není aktivní. Prohlížení kolekce je dostupné.',409);
 const result=quoteLines(input.lines,records.map(r=>JSON.parse(r.data)),score,settings,input.shipping);
 const delivery=address(input.address,input.shipping);
 const quote={...result,address:delivery,seller:settings.seller,bank:settings.bank,termsVersion:settings.termsVersion,documents:settings.documents,deliveryInformation:settings.deliveryInformation,pickupInstructions:settings.pickupInstructions,activeHours:settings.activeHours};
 const revisions=records.map(r=>[r.id,r.revision]);
 return {quote,hash:await digest(quote),record,revisions,points:score};
}
export async function readOrder(env,id,member=null){
 const row=await prepare(env,`SELECT * FROM merch_orders WHERE id=?${member?' AND member_id=?':''}`,id,...(member?[member]:[])).first();
 if(!row)fail('Objednávka nebyla nalezena.',404);return projectOrder(row);
}
export async function createOrder(env,member,input){
 const requestKey=key(input.requestKey),requestHash=await digest({lines:input.lines,shipping:input.shipping,address:input.address,quoteHash:input.quoteHash,termsVersion:input.termsVersion});
 const find=()=>prepare(env,'SELECT * FROM merch_orders WHERE member_id=? AND request_key=?',member,requestKey).first();
 const replay=await find();if(replay){if(replay.request_hash!==requestHash)fail('Klíč už patří jiné objednávce.',409);return projectOrder(replay);}
 if(input.termsAccepted!==true)fail('Potvrď obchodní podmínky a závazek platby.');
 const q=await quotation(env,member,input);
 if(input.quoteHash!==q.hash||input.termsVersion!==q.quote.termsVersion)fail('Cena nebo podmínky se změnily. Znovu potvrď rekapitulaci.',409);
 const id=uid(),now=stamp(),expires=new Date(Date.parse(now)+q.quote.activeHours*3600000).toISOString();
 const state={status:'new',payments:[],refunds:[],requests:[],history:[{at:now,actor:member,action:'created'}],operations:[]};
 const guards=q.revisions.map(()=>'(SELECT revision FROM merch_products WHERE id=?)=?').join(' AND ');
 for(let attempt=0;attempt<5;attempt++){
  const random=new Uint32Array(1);crypto.getRandomValues(random);const vs='8'+String(random[0]%1000000000).padStart(9,'0');
  try{
   const results=await env.DB.batch([
    prepare(env,`INSERT INTO merch_orders(id,member_id,request_key,request_hash,payment_vs,snapshot,state,created_at,expires_at)
      SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT revision FROM merch_config WHERE id=1)=?
      AND (SELECT COALESCE(SUM(delta),0) FROM united_points_ledger WHERE member_id=?)=? AND ${guards||'1=1'}
      ON CONFLICT(member_id,request_key) DO NOTHING`,id,member,requestKey,requestHash,vs,encode(q.quote),encode(state),now,expires,q.record.revision,member,q.points,...q.revisions.flat()),
    prepare(env,`INSERT INTO merch_outbox(id,order_id,kind,payload,created_at) SELECT ?,id,'confirmation',?,? FROM merch_orders WHERE id=?`,uid(),encode({subject:'Potvrzení objednávky UNITED MERCH',quote:q.quote,variableSymbol:vs,expiresAt:expires}),now,id),
   ]);
   const saved=await find();if(!saved)fail('Katalog se změnil. Obnov rekapitulaci.',409);
   if(saved.request_hash!==requestHash)fail('Klíč už patří jiné objednávce.',409);
   return projectOrder(saved);
  }catch(error){if(/payment_vs_collision|merch_orders.payment_vs/.test(error.message))continue;throw error;}
 }
 fail('Nepodařilo se přidělit platební symbol. Zkus objednávku později.',503);
}
export async function listOrders(env,{member=null,search='',filter='all',page=1}={}){
 const filters={all:'1=1',active:"effective_status NOT IN ('completed','cancelled','expired')",history:"effective_status IN ('completed','cancelled','expired')",unpaid:"net_paid < json_extract(snapshot,'$.totalMinor') AND effective_status NOT IN ('cancelled','completed')",fulfill:"net_paid >= json_extract(snapshot,'$.totalMinor') AND effective_status NOT IN ('cancelled','completed','expired')"};
 if(!Object.hasOwn(filters,filter))fail('Neplatný filtr.');
 const needle=text(search).replace(/[\\%_]/g,c=>'\\'+c),offset=(integer(page,1,100000)-1)*30;
 const rows=(await prepare(env,`WITH amounts AS (
  SELECT o.*, COALESCE((SELECT SUM(json_extract(p.value,'$.amountMinor')) FROM json_each(o.state,'$.payments') p WHERE json_extract(p.value,'$.voided') IS NULL),0) paid
  FROM merch_orders o ${member?'WHERE member_id=?':''}
 ), projected AS (
  SELECT *, paid-COALESCE((SELECT SUM(json_extract(r.value,'$.amountMinor')) FROM json_each(state,'$.refunds') r),0) net_paid, CASE WHEN expires_at<? AND paid=0 AND json_extract(state,'$.status') IN ('new','preparing','ready') THEN 'expired' ELSE json_extract(state,'$.status') END effective_status FROM amounts
 ) SELECT * FROM projected WHERE ${filters[filter]} AND (printf('UM-%07d',seq)||' '||payment_vs||' '||member_id||' '||json_extract(snapshot,'$.address.name')||' '||json_extract(snapshot,'$.address.email')) LIKE ? ESCAPE '\\'
 ORDER BY created_at DESC,seq DESC LIMIT 31 OFFSET ?`,...(member?[member]:[]),stamp(),'%'+needle+'%',offset).all()).results;
 return {orders:rows.slice(0,30).map(r=>projectOrder(r)),hasMore:rows.length>30};
}
export async function changeOrder(env,actor,id,input,admin=false){
 const order=await readOrder(env,id,admin?null:actor),op=key(input.operationKey),hash=await digest(input),old=order.state.operations.find(o=>o.id===op);
 if(old){if(old.hash!==hash)fail('Operace již byla použita.',409);return order;}
 if(order.revision!==input.revision)fail('Objednávku mezitím změnil jiný požadavek. Obnov detail.',409);
 const s=structuredClone(order.state),now=stamp(),action=input.action;
 const audit={at:now,actor,action,reason:text(input.reason,1000)};
 if(!admin&&!['cancel','withdraw','complaint'].includes(action))fail('Tato akce vyžaduje administrátora.',403);
 if(action==='cancel'){
  if(['sent','completed'].includes(s.status))fail('Použij odstoupení nebo reklamaci, objednávka již byla předána.');
  if(admin||order.payment.paidMinor===0)s.status='cancelled';else s.requests.push({id:uid(),kind:'cancel',at:now,text:text(input.reason,1000)});
 }else if(action==='withdraw'||action==='complaint'){
  s.requests.push({id:uid(),kind:action,at:now,text:text(input.reason,1000)});
 }else if(action==='payment'||action==='paid'){
  const amount=action==='paid'?order.payment.remainingMinor:integer(input.amountMinor,1);
  if(amount>0){if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date||'')||!Number.isFinite(Date.parse(input.date))||new Date(input.date).toISOString().slice(0,10)!==input.date||input.date>now.slice(0,10))fail('Vyplň platné datum již přijaté platby.');s.payments.push({id:uid(),amountMinor:amount,date:input.date,at:now,actor});audit.amountMinor=amount;}
 }else if(action==='void-payment'){
  const payment=s.payments.find(p=>p.id===input.paymentId);if(!payment||payment.voided||!audit.reason)fail('Vyber úhradu a napiš důvod opravy.');
  if(order.payment.paidMinor-payment.amountMinor<order.payment.refundedMinor)fail('Oprava by snížila přijaté peníze pod již evidované refundace.');
  payment.voided={at:now,actor,reason:audit.reason};audit.paymentId=payment.id;
 }else if(action==='refund'){
  const amount=integer(input.amountMinor,1);if(amount>order.payment.paidMinor-order.payment.refundedMinor||!audit.reason)fail('Vrácení musí odpovídat přijatým penězům a mít důvod.');
  s.refunds.push({id:uid(),amountMinor:amount,at:now,actor,reason:audit.reason});audit.amountMinor=amount;
 }else if(action==='restore'){
  if(!['expired','cancelled'].includes(s.status)||!input.deliveryConfirmed||order.payment.paidMinor<=0||!audit.reason)fail('Obnovení vyžaduje evidovanou platbu, ověřené dodání a zdůvodnění.');
  const products=(await catalogRecords(env)).map(r=>JSON.parse(r.data));const c=JSON.parse((await configRecord(env)).data);
  quoteLines(order.snapshot.lines,products,0,{...c,discountBasisPoints:0},order.snapshot.shipping);s.status='new';
 }else if(action==='status'){
  const transitions={new:['preparing'],preparing:['ready','sent'],ready:['completed','sent'],sent:['completed']};
  if(!transitions[s.status]?.includes(input.status))fail('Tento přechod stavu není povolen.');
  if(['ready','sent','completed'].includes(input.status)&&order.payment.remainingMinor>0)fail('Nejprve dořeš úhradu.');
  if(input.status==='sent'&&order.snapshot.shipping!=='address')fail('Osobní převzetí není zásilka.');
  if(input.trackingUrl){let url;try{url=new URL(input.trackingUrl)}catch{fail('Neplatný sledovací odkaz.')}if(url.protocol!=='https:'||url.username||url.password)fail('Sledovací odkaz musí být HTTPS.');}
  s.status=input.status;s.tracking={carrier:text(input.carrier),number:text(input.trackingNumber),url:text(input.trackingUrl,500)};
 }else if(action==='address'){
  if(!audit.reason)fail('Napiš důvod změny adresy.');audit.before=s.deliveryAddress||order.snapshot.address;s.deliveryAddress=address(input.address,order.snapshot.shipping);audit.after=s.deliveryAddress;
 }else if(action==='resolve-request'){
  const request=s.requests.find(r=>r.id===input.requestId);if(!request||!audit.reason)fail('Vyber požadavek a popiš výsledek.');request.resolved={at:now,actor,text:audit.reason};
 }else fail('Neznámá operace.');
 s.history.push(audit);s.operations.push({id:op,hash});
 const statements=[prepare(env,'UPDATE merch_orders SET state=?,revision=revision+1 WHERE id=? AND revision=?',encode(s),id,order.revision)];
 if(['withdraw','complaint'].includes(action)||action==='status'&&input.status==='sent'){
  statements.push(prepare(env,`INSERT INTO merch_outbox(id,order_id,kind,payload,created_at)
   SELECT ?,id,?,?,? FROM merch_orders WHERE id=? AND revision=? AND changes()=1
   ON CONFLICT(order_id,kind) DO NOTHING`,uid(),`${action}-${op}`,encode({subject:action==='withdraw'?'Potvrzení přijetí odstoupení':action==='complaint'?'Potvrzení přijetí reklamace':'Objednávka byla odeslána',event:audit}),now,id,order.revision+1));
 }
 const result=await env.DB.batch(statements);
 if(!result[0].meta.changes)fail('Souběžná změna. Obnov detail; operace nebyla provedena.',409);
 return readOrder(env,id,admin?null:actor);
}
export async function saveAddress(env,member,input){const value=address(input,'address');await prepare(env,'INSERT INTO merch_addresses VALUES(?,?,?) ON CONFLICT(member_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at',member,encode(value),stamp()).run();return value;}
export async function getAddress(env,member){const row=await prepare(env,'SELECT data FROM merch_addresses WHERE member_id=?',member).first();return row?JSON.parse(row.data):null;}

export async function saveProduct(env,actor,input){
 const id=key(input.id),name=text(input.name),category=text(input.category,60),gender=input.gender,status=input.status;
 if(!name||!category||!['men','women','unisex'].includes(gender)||!['draft','published','archived'].includes(status))fail('Vyplň název, kategorii a stav.');
 if(!Array.isArray(input.variants)||!input.variants.length||input.variants.length>30)fail('Produkt potřebuje 1–30 variant.');
 const ids=new Set(),variants=input.variants.map(v=>{
  const vid=key(v.id);if(ids.has(vid))fail('Duplicitní ID varianty.');ids.add(vid);
  const image=text(v.image,200);if(image&&!/^(?:[a-z0-9-]+|r2:[a-z0-9-]+)$/.test(image))fail('Neplatný obrázek.');
  if(status==='published'&&!image)fail('Publikovaná varianta vyžaduje fotografii.');
  if(!Array.isArray(v.sizes)||v.sizes.length>15||v.sizes.some(s=>!/^[-A-Za-z0-9 ]{1,20}$/.test(s)))fail('Neplatné velikosti.');
  return {id:vid,color:text(v.color,100),swatch:/^#[0-9a-f]{6}$/i.test(v.swatch)?v.swatch:'#888888',image,sizes:[...new Set(v.sizes)],priceMinor:v.priceMinor===null?null:integer(v.priceMinor,1),availability:v.availability==='available'?'available':'unavailable'};
 });
 const records=await catalogRecords(env);for(const r of records)if(r.id!==id&&JSON.parse(r.data).variants.some(v=>ids.has(v.id)))fail('ID varianty používá jiný produkt.');
 const existing=records.find(r=>r.id===id);if(existing&&existing.revision!==input.revision)fail('Produkt se změnil. Obnov jej.',409);
 const known=new Set(initialCatalog.flatMap(p=>p.variants.map(v=>v.image)));
 for(const v of variants)if(v.image&&!known.has(v.image)&&!(v.image.startsWith('r2:')&&await prepare(env,'SELECT id FROM merch_media WHERE id=?',v.image.slice(3)).first()))fail('Vyber existující nebo nahraj novou fotografii.');
 const p={id,name,type:text(input.type,100),description:text(input.description,1000),category,gender,status,position:integer(input.position,0,10000),variants};
 const statement=existing?prepare(env,'UPDATE merch_products SET data=?,revision=revision+1 WHERE id=? AND revision=?',encode(p),id,input.revision):prepare(env,'INSERT INTO merch_products(id,data) VALUES(?,?)',id,encode(p));
 const result=await env.DB.batch([statement,prepare(env,'INSERT INTO merch_audit SELECT ?,?,?,?,?,? WHERE changes()=1',uid(),actor,id,'product',stamp(),encode({before:existing?JSON.parse(existing.data):null,after:p}))]);
 if(!result[0].meta.changes)fail('Produkt se změnil. Obnov jej.',409);return getCatalog(env,true);
}
export async function saveSettings(env,actor,input){
 const old=await configRecord(env);if(input.revision!==old.revision)fail('Nastavení se změnilo.',409);
 const s=input.settings||{},seller=Object.fromEntries(['name','street','city','postalCode','ico','taxStatus','email','phone'].map(k=>[k,text(s.seller?.[k])]));
 // Bank data are copied only from an existing verified non-test registration configuration.
 let bank=JSON.parse(old.data).bank;
 if(input.bankEventId){const event=await prepare(env,'SELECT payment_recipient_name,payment_account_display,payment_iban,payment_test_mode FROM events WHERE id=?',key(input.bankEventId)).first();if(!event||Number(event.payment_test_mode)!==0||!event.payment_iban)fail('Vyber ověřený netestovací účet registrací.');bank={recipientName:event.payment_recipient_name,accountDisplay:event.payment_account_display,iban:event.payment_iban};}
 const config={seller,bank,paused:s.paused!==false,shippingMinor:integer(s.shippingMinor,0,100000),pickupInstructions:text(s.pickupInstructions,1000),deliveryInformation:text(s.deliveryInformation,2000),activeHours:integer(s.activeHours,1,720),rewardThreshold:12,discountBasisPoints:s.discountBasisPoints===null?null:integer(s.discountBasisPoints,0,10000),termsVersion:text(s.termsVersion,80),legalApproved:s.legalApproved===true,documents:Object.fromEntries(['terms','shipping','returns','privacy'].map(k=>[k,text(s.documents?.[k],20000)]))};
 if(!config.paused&&configurationMissing(config).length)fail('Nejdříve doplň všechna povinná provozní nastavení.');
 const result=await env.DB.batch([prepare(env,'UPDATE merch_config SET data=?,revision=revision+1 WHERE id=1 AND revision=?',encode(config),old.revision),prepare(env,'INSERT INTO merch_audit SELECT ?,?,?,?,?,? WHERE changes()=1',uid(),actor,'settings','settings',stamp(),encode({before:JSON.parse(old.data),after:config}))]);
 if(!result[0].meta.changes)fail('Nastavení se změnilo.',409);return getCatalog(env,true);
}
