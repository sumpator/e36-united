import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {merchRuntime} from './helpers/merch-runtime.mjs';
import {contentBatch,addContentBatch} from './helpers/merch-content-20261021.mjs';
import {getCatalog,quotation} from '../worker/domains/merch/service.js';
import {publicMerch} from '../worker/domains/merch/index.js';
import {priceCart} from '../merch/cart.js';

test('approved content uses real uploads and Admin writes once without resetting the paused catalog',async t=>{
 const r=await merchRuntime();t.after(r.close);
 r.db.exec("UPDATE merch_config SET data=json_set(data,'$.paused',json('true'))");
 const before=r.db.prepare('SELECT * FROM merch_products ORDER BY id').all(),settings=r.db.prepare('SELECT * FROM merch_config').get();
 const first=await addContentBatch(r);
 assert.deepEqual(first.added,['not-fast-not-furious','sweetest-things']);
 assert.equal(first.catalog.settings.paused,true);assert.equal(first.catalog.ready,false);
 for(const row of before)assert.deepEqual(r.db.prepare('SELECT * FROM merch_products WHERE id=?').get(row.id),row);
 for(const plan of contentBatch.products){
  const saved=first.catalog.products.find(product=>product.id===plan.id);
  assert.equal(saved.category,'Trička');assert.equal(saved.gender,'unisex');assert.equal(saved.variants.length,1);
  const variant=saved.variants[0];assert.deepEqual(variant.sizes,['S','M','L','XL']);assert.equal(variant.priceMinor,69000);assert.equal(variant.availability,'available');
  const response=await publicMerch(r.env,new URL('https://api.e36united.cz/api/merch/media/'+variant.image.slice(3)),'https://e36united.cz');
  assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),readFileSync(new URL('../'+plan.variants[0].imageFile,import.meta.url)));
 }
 const snapshot=r.db.prepare('SELECT * FROM merch_products ORDER BY id').all(),mediaCount=r.contentMedia.size,auditCount=r.db.prepare('SELECT COUNT(*) n FROM merch_audit').get().n;
 const second=await addContentBatch(r);assert.deepEqual(second.added,[]);assert.deepEqual(second.existing,first.added);
 assert.deepEqual(r.db.prepare('SELECT * FROM merch_products ORDER BY id').all(),snapshot);
 assert.equal(r.contentMedia.size,mediaCount);assert.equal(mediaCount,2);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM merch_audit').get().n,auditCount);
 assert.deepEqual(r.db.prepare('SELECT * FROM merch_config').get(),settings);
 await assert.rejects(quotation(r.env,'member',{...r.input,lines:[{variantId:'not-fast-not-furious-dark-grey',size:'S',quantity:1}]}),/Objednávání zatím není aktivní/);
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM merch_orders').get().n,0);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM merch_outbox').get().n,0);
 assert.deepEqual(r.db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('new sizes price at 690 CZK on the server and in the cart with existing reward rules',async t=>{
 // The existing separate commerce fixture is enabled only in memory for quotation.
 const r=await merchRuntime();t.after(r.close);await addContentBatch(r);
 const lines=contentBatch.products.flatMap(product=>product.variants[0].sizes.map(size=>({variantId:product.variants[0].id,size,quantity:1})));
 const quote=await quotation(r.env,'member',{...r.input,lines});
 assert.equal(quote.quote.totalMinor,552000);assert.ok(quote.quote.lines.every(line=>line.unitPriceMinor===69000));
 const cart=priceCart(lines,(await getCatalog(r.env)).products);assert.deepEqual(cart.errors,[]);assert.equal(cart.totalMinor,552000);
 r.db.exec("INSERT INTO united_points_ledger(id,member_id,delta,source_type,source_key,reason) VALUES('content-points','member',12,'fixture','content-points','Isolated'); UPDATE merch_config SET data=json_set(data,'$.discountBasisPoints',1000)");
 const reward=await quotation(r.env,'member',{...r.input,lines});assert.equal(reward.quote.discountMinor,55200);assert.equal(reward.quote.totalMinor,496800);
 assert.equal(r.db.prepare('SELECT SUM(delta) n FROM united_points_ledger').get().n,12);
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM merch_orders').get().n,0);
 await assert.rejects(quotation(r.env,'member',{...r.input,lines:lines.map(line=>({...line,priceMinor:1}))}),/výhradně server/);
});

test('rehearsal refuses to overwrite a changed stable product identity',async t=>{
 const r=await merchRuntime();t.after(r.close);await addContentBatch(r);
 r.db.exec("UPDATE merch_products SET data=json_set(data,'$.name','Existing deliberate change') WHERE id='sweetest-things'");
 const before=r.db.prepare('SELECT * FROM merch_products ORDER BY id').all();
 await assert.rejects(addContentBatch(r),/Existing product differs/);
 assert.deepEqual(r.db.prepare('SELECT * FROM merch_products ORDER BY id').all(),before);assert.equal(r.contentMedia.size,2);
});

test('history maps 2025 to the supplied image and 2026 to the preserved old 2025 source',()=>{
 const plan=JSON.parse(readFileSync(new URL('../content/history-20261021.json',import.meta.url),'utf8'));
 const html=readFileSync(new URL('../o-nas.html',import.meta.url),'utf8');
 const articles=[...html.matchAll(/<article class="timeline-entry[^]*?<\/article>/g)].map(match=>match[0]);
 for(const year of ['2025','2026']){
  const article=articles.find(value=>value.includes('class="timeline-year">'+year+'<'));
  assert.ok(article);assert.ok(article.includes('src="'+plan.after[year]+'"'));
 }
 assert.equal(plan.after['2026'],plan.before['2025']);assert.notEqual(plan.after['2025'],plan.after['2026']);
 assert.ok(!html.includes(plan.before['2026']));
});
