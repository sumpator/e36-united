import test from 'node:test';import assert from 'node:assert/strict';
import {merchBenefit} from '../merch/benefit.js';
import {quoteLines} from '../worker/domains/merch/model.js';
test('benefit copy and actual quote use the same configured threshold and rate',()=>{
 const settings={rewardThreshold:12,discountBasisPoints:3600,shippingMinor:9900,paused:true};
 const view=merchBenefit(settings);assert.match(view.title,/12.*36 %/);assert.match(view.copy,/dopravné/i);assert.equal(view.paused,true);
 const products=[{id:'shirt',status:'published',name:'Shirt',type:'Unisex',variants:[{id:'shirt-grey',image:'image.webp',availability:'available',priceMinor:69000,sizes:['M'],color:'grey'}]}],lines=[{variantId:'shirt-grey',size:'M',quantity:1}];
 assert.equal(quoteLines(lines,products,11,settings,'address').discountMinor,0);
 for(const points of [12,24,36]){const quote=quoteLines(lines,products,points,settings,'address');assert.equal(quote.discountMinor,24840);assert.equal(quote.totalMinor,54060);assert.equal(quote.shippingMinor,9900);assert.equal(quote.discountBasisPoints,3600)}
});
test('unconfigured benefit never promises a numerical discount',()=>{for(const rate of [null,undefined,0]){const view=merchBenefit({discountBasisPoints:rate});assert.equal(view.active,false);assert.doesNotMatch(view.copy,/36/);assert.match(view.copy,/není nastavená/)}});
