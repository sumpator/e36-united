import {readFileSync} from 'node:fs';
import {mailingRuntime} from './mailing-runtime.mjs';
import {seedCatalog,quotation,createOrder} from '../../worker/domains/merch/service.js';
export async function merchRuntime(){
 const runtime=mailingRuntime(),{db,env}=runtime;
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='merch_orders'").get())db.exec(readFileSync(new URL('../../db/migrations/2026-09-24-merch.sql',import.meta.url),'utf8'));
 db.exec("INSERT INTO events(id,year,title,is_current,registration_status,live_enabled) VALUES('united-2026',2026,'Isolated event',1,'closed',0)");
 for(const id of ['member','other'])db.prepare("INSERT INTO members(id,member_code,email,name,status) VALUES(?,?,?,?, 'active')").run(id,id,id+'@example.invalid',id);
 await seedCatalog(env,'admin');
 const settings=JSON.parse(db.prepare('SELECT data FROM merch_config').get().data);
 Object.assign(settings,{paused:false,discountBasisPoints:0,deliveryInformation:'Izolovaná dodací informace',termsVersion:'fixture-v1',legalApproved:true,bank:{iban:'CZ6508000000192000145399',accountDisplay:'19-2000145399/0800',recipientName:'Fixture'},documents:{terms:'Testovací podmínky',shipping:'Testovací doprava',returns:'Testovací odstoupení',privacy:'Testovací soukromí'}});
 Object.assign(settings.seller,{ico:'00000000',postalCode:'11000',phone:'+420777000000',taxStatus:'Pouze fixture'});
 db.prepare('UPDATE merch_config SET data=?').run(JSON.stringify(settings));
 const input={lines:[{variantId:'u-polo-navy',size:'M',quantity:1}],shipping:'pickup',address:{name:'Test Member',email:'member@example.invalid'}};
 const order=async(overrides={})=>{const value={...input,...overrides},q=await quotation(env,'member',value);return createOrder(env,'member',{...value,requestKey:crypto.randomUUID(),quoteHash:q.hash,termsVersion:q.quote.termsVersion,termsAccepted:true});};
 return {...runtime,settings,input,order};
}
