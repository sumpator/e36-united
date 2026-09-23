import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog,shopSettings,missingCommerce,productImages} from '../merch/catalog.js';
import {normalizeCart,addToCart,priceCart,readCart,writeCart} from '../merch/cart.js';
import {buildOrder,orderText,mailtoOrder} from '../merch/order.js';
const confirmed=()=>structuredClone(catalog).map(p=>({...p,variants:p.variants.map(v=>({...v,priceMinor:55000,sizes:['S','M','L'],availability:'available'}))}));
const settings={...shopSettings,fulfillment:{id:'fixture-only',label:'TESTOVACÍ předání'}};
test('real catalog preserves six cuts, ten colors, unknown commerce and existing recipient',()=>{
 assert.equal(catalog.length,6);assert.equal(catalog.flatMap(p=>p.variants).length,10);
 assert.equal(new Set(catalog.flatMap(p=>p.variants.map(v=>v.id))).size,10);
 for(const p of catalog)for(const v of p.variants)assert.deepEqual(missingCommerce(v),['cena','velikosti','dostupnost']);
 assert.equal(shopSettings.recipient,'united@e36united.cz');assert.equal(shopSettings.fulfillment,null);
 assert.match(catalog.find(p=>p.id==='e36-cars-women-round').type,/kulatý/);assert.match(catalog.find(p=>p.id==='e36-cars-women-v').type,/V výstřih/);
 assert.equal(productImages(catalog[0].variants[0]).length,4);assert.equal(productImages(catalog[1].variants[0]).length,1);
});
test('cart requires explicit size and confirmed variant; merges same size only',()=>{
 const c=confirmed(),id=c[0].variants[0].id;
 assert.throws(()=>addToCart([],catalog,id,'M',1));assert.throws(()=>addToCart([],c,id,'',1));assert.throws(()=>addToCart([],c,id,'XXXL',1));
 let cart=addToCart([],c,id,'M',1);cart=addToCart(cart,c,id,'M',2);cart=addToCart(cart,c,id,'L',1);
 assert.deepEqual(cart,[{variantId:id,size:'M',quantity:3},{variantId:id,size:'L',quantity:1}]);
 for(const quantity of [-1,0,1.2,100,NaN])assert.throws(()=>addToCart(cart,c,id,'M',quantity));
});
test('storage only preserves IDs, size and bounded quantities and tolerates corruption',()=>{
 const line={variantId:'u-polo-navy',size:'M',quantity:2,priceMinor:1,name:'tampered'};
 assert.deepEqual(normalizeCart([line]),[{variantId:line.variantId,size:'M',quantity:2}]);
 assert.deepEqual(readCart({getItem(){return '{bad'}}),[]);assert.equal(writeCart({setItem(){throw Error()}},[]),false);
 assert.deepEqual(normalizeCart([null,{}, {...line,quantity:1.1}]),[]);
});
test('current catalog reprices cart and blocks removed/unconfirmed combinations',()=>{
 const c=confirmed(),cart=[{variantId:'u-polo-navy',size:'M',quantity:2,priceMinor:1}];
 assert.equal(priceCart(cart,c).totalMinor,110000);
 c[0].variants[0].priceMinor=70000;assert.equal(priceCart(cart,c).totalMinor,140000);
 c[0].variants[0].availability='unconfirmed';assert.equal(priceCart(cart,c).errors.length,1);
 assert.throws(()=>buildOrder(cart,c,{name:'Eva',email:'eva@example.test'},settings));
 assert.equal(priceCart([{variantId:'old-product',size:'M',quantity:1}],c).errors.length,1);
});
test('order draft snapshots line data without inventing payment/order success',()=>{
 const cart=[{variantId:'u-polo-navy',size:'M',quantity:2}],contact={name:'Eva Nováková',email:'eva@example.test',note:'<text> & poznámka'};
 assert.throws(()=>buildOrder(cart,confirmed(),contact,shopSettings));
 const order=buildOrder(cart,confirmed(),contact,settings,'member-fixture');
 assert.equal(order.orderId,null);assert.equal(order.status,'draft');assert.equal(order.paymentStatus,'not_requested');assert.equal(order.paymentReference,null);
 assert.equal(order.totalMinor,110000);assert.equal(order.lines[0].unitPriceMinor,55000);
 const text=orderText(order);for(const s of ['Eva Nováková','u-polo-navy','united-u-polo','M','2 ×','TESTOVACÍ předání','<text> & poznámka'])assert.ok(text.includes(s));
 const uri=mailtoOrder(order,settings.recipient);assert.match(uri,/^mailto:united@e36united.cz\?subject=/);assert.equal(new URL(uri).searchParams.get('body'),text);
 assert.equal(cart.length,1);
});
