import {missingCommerce} from './catalog.js?v=20260923-merch1';
export const CART_KEY='e36UnitedMerchCartV1';
export function findVariant(catalog,id){
 for(const product of catalog){const variant=product.variants.find(v=>v.id===id);if(variant)return {product,variant};}
 return null;
}
// Only IDs, size and quantity survive reload. Never trust stored prices/names.
export function normalizeCart(input){
 const merged=new Map();
 for(const line of Array.isArray(input)?input.slice(0,100):[]){
  if(!line||typeof line.variantId!=='string'||line.variantId.length>100||typeof line.size!=='string'||line.size.length>30||!Number.isInteger(line.quantity)||line.quantity<1)continue;
  const key=JSON.stringify([line.variantId,line.size]);
  merged.set(key,{variantId:line.variantId,size:line.size,quantity:Math.min(99,(merged.get(key)?.quantity||0)+line.quantity)});
 }
 return [...merged.values()];
}
export function addToCart(cart,catalog,variantId,size,quantity){
 const found=findVariant(catalog,variantId);
 if(!found||missingCommerce(found.variant).length||!found.variant.sizes.includes(size))throw new Error('Vyber dostupnou variantu a velikost.');
 if(!Number.isInteger(quantity)||quantity<1||quantity>99)throw new Error('Počet musí být 1–99 kusů.');
 const previous=cart.find(l=>l.variantId===variantId&&l.size===size)?.quantity||0;
 if(previous+quantity>99)throw new Error('V jedné velikosti může být nejvýše 99 kusů.');
 return normalizeCart([...cart,{variantId,size,quantity}]);
}
export function priceCart(cart,catalog){
 const errors=[];
 const lines=normalizeCart(cart).map(line=>{
  const found=findVariant(catalog,line.variantId);
  if(!found||missingCommerce(found.variant).length||!found.variant.sizes.includes(line.size)){
   errors.push(`Varianta ${line.variantId} / ${line.size} už není potvrzená. Odeber ji z košíku.`);
   return {...line,productId:found?.product.id||null,name:found?.product.name||'Nedostupný produkt',type:found?.product.type||'',color:found?.variant.color||'',image:found?.variant.image||null,unitPriceMinor:null,totalMinor:null};
  }
  return {...line,productId:found.product.id,name:found.product.name,type:found.product.type,color:found.variant.color,image:found.variant.image,unitPriceMinor:found.variant.priceMinor,totalMinor:found.variant.priceMinor*line.quantity};
 });
 return {lines,errors,totalMinor:lines.reduce((sum,l)=>sum+(l.totalMinor||0),0)};
}
export function readCart(storage){try{return normalizeCart(JSON.parse(storage.getItem(CART_KEY)||'[]'))}catch{return []}}
export function writeCart(storage,cart){try{storage.setItem(CART_KEY,JSON.stringify(normalizeCart(cart)));return true}catch{return false}}
