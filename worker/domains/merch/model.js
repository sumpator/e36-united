import { buildSpayd } from '../reservations/payments.js';

export class MerchError extends Error { constructor(message,status=400){super(message);this.status=status;} }
export const fail=(message,status=400)=>{throw new MerchError(message,status)};
export const text=(value,max=200)=>typeof value==='string'?value.trim().slice(0,max):'';
export const key=value=>{const s=text(value,100);if(!/^[a-zA-Z0-9_-]{1,100}$/.test(s))fail('Neplatné ID.');return s;};
export const integer=(value,min=0,max=100000000)=>{if(!Number.isSafeInteger(value)||value<min||value>max)fail('Neplatná částka nebo počet.');return value;};
export const stamp=()=>new Date().toISOString();
export const uid=()=>crypto.randomUUID();
export const encode=JSON.stringify;
export async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(encode(value))))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function address(input={},shipping='pickup'){
 const result=Object.fromEntries(['name','email','phone','street','city','postalCode','note'].map(k=>[k,text(input[k],k==='note'?1000:180)]));result.country='CZ';
 if(input.country&&input.country!=='CZ')fail('Doručujeme pouze do ČR.');
 if(!result.name||!/^\S+@\S+\.\S+$/.test(result.email))fail('Vyplň jméno a platný e-mail.');
 if(shipping==='address'&&(!/^\+?[0-9 ()-]{9,20}$/.test(result.phone)||!result.street||!result.city||!/^\d{3}\s?\d{2}$/.test(result.postalCode)))fail('Vyplň telefon a úplnou českou adresu.');
 return result;
}
export function configurationMissing(config){
 const missing=[];
 for(const field of ['name','street','city','postalCode','ico','taxStatus','email','phone'])if(!config.seller?.[field])missing.push(`Prodávající: ${field}`);
 if(!config.deliveryInformation)missing.push('Informace o dodání');
 if(!config.bank?.iban||!config.bank?.accountDisplay||!config.bank?.recipientName)missing.push('Ověřený účet registrací');
 if(config.discountBasisPoints===null||config.discountBasisPoints===undefined)missing.push('Potvrzené pravidlo členské slevy');
 if(!config.termsVersion||!config.legalApproved)missing.push('Schválená verze obchodních podmínek');
 for(const field of ['terms','shipping','returns','privacy'])if(!config.documents?.[field])missing.push(`Dokument: ${field}`);
 if(Object.values(config.documents||{}).some(value=>value.includes('[DOPLNIT]')))missing.push('Nedoplněný návrh obchodních dokumentů');
 return missing;
}
export function quoteLines(lines,products,points,config,shipping){
 if(!Array.isArray(lines)||!lines.length||lines.length>30)fail('Košík musí obsahovat 1–30 položek.');
 if(!['pickup','address'].includes(shipping))fail('Vyber způsob předání.');
 const merged=new Map();
 for(const line of lines){const id=key(line.variantId),size=text(line.size,30),quantity=integer(line.quantity,1,99);const k=id+'|'+size;merged.set(k,{variantId:id,size,quantity:integer((merged.get(k)?.quantity||0)+quantity,1,99)});}
 const result=[...merged.values()].sort((a,b)=>(a.variantId+a.size).localeCompare(b.variantId+b.size)).map(line=>{
  const p=products.find(p=>p.status==='published'&&p.variants.some(v=>v.id===line.variantId));const v=p?.variants.find(v=>v.id===line.variantId);
  if(!v||v.availability!=='available'||!v.image||!v.sizes.includes(line.size)||!Number.isSafeInteger(v.priceMinor)||v.priceMinor<=0)fail('Některá varianta nebo velikost již není dostupná. Obnov košík.',409);
  return {...line,productId:p.id,name:p.name,type:p.type,color:v.color,image:v.image,unitPriceMinor:integer(v.priceMinor,1),totalMinor:integer(v.priceMinor*line.quantity)};
 });
 const subtotalMinor=integer(result.reduce((n,l)=>n+l.totalMinor,0));
 const rate=points>=config.rewardThreshold?integer(config.discountBasisPoints??0,0,10000):0;
 const discountMinor=Math.floor((subtotalMinor*rate+5000)/10000),shippingMinor=shipping==='address'?integer(config.shippingMinor):0;
 return {lines:result,subtotalMinor,discountMinor,discountBasisPoints:rate,shippingMinor,totalMinor:integer(subtotalMinor-discountMinor+shippingMinor,1),currency:'CZK',shipping};
}
export function projectOrder(row,now=Date.now()){
 const snapshot=JSON.parse(row.snapshot),state=JSON.parse(row.state);
 const paidMinor=state.payments.filter(p=>!p.voided).reduce((n,p)=>n+p.amountMinor,0),refundedMinor=state.refunds.reduce((n,p)=>n+p.amountMinor,0);
 const netPaidMinor=paidMinor-refundedMinor;
 const remainingMinor=Math.max(0,snapshot.totalMinor-netPaidMinor),overpaidMinor=Math.max(0,netPaidMinor-snapshot.totalMinor);
 const overdue=Date.parse(row.expires_at)<now;
 const status=overdue&&!paidMinor&&['new','preparing','ready'].includes(state.status)?'expired':state.status;
 const actionable=!['cancelled','expired','completed'].includes(status)&&remainingMinor>0;
 return {id:row.id,number:`UM-${String(row.seq).padStart(7,'0')}`,memberId:row.member_id,revision:row.revision,createdAt:row.created_at,expiresAt:row.expires_at,variableSymbol:row.payment_vs,
  snapshot,state:{...state,status},payment:{paidMinor,refundedMinor,remainingMinor,overpaidMinor,reviewRequired:overdue&&paidMinor>0&&remainingMinor>0,status:paidMinor===0?'unpaid':remainingMinor>0?'underpaid':overpaidMinor>0?'overpaid':'paid',
   spayd:actionable?buildSpayd({iban:snapshot.bank.iban,amountCzk:remainingMinor/100,variableSymbol:row.payment_vs,message:`UNITED MERCH ${row.payment_vs}`,deadline:row.expires_at}):null}};
}
