import {priceCart} from './cart.js?v=20260923-merch1';
import {money} from './catalog.js?v=20260923-merch1';
// A client-side draft, NOT a submitted order or a payment record.
export function buildOrder(cart,catalog,contact,settings,memberId=null){
 const priced=priceCart(cart,catalog);
 if(!priced.lines.length||priced.errors.length)throw new Error(priced.errors[0]||'Košík je prázdný.');
 if(!settings.fulfillment?.id||!settings.fulfillment?.label)throw new Error('Způsob předání ještě není potvrzený.');
 const name=String(contact.name||'').trim(),email=String(contact.email||'').trim();
 if(!name||name.length>120||!/^\S+@\S+\.\S+$/.test(email)||email.length>254)throw new Error('Doplň jméno a platný e-mail.');
 return {schemaVersion:1,orderId:null,memberId,status:'draft',paymentStatus:'not_requested',currency:'CZK',
  contact:{name,email,note:String(contact.note||'').trim().slice(0,1000)},
  fulfillment:{...settings.fulfillment},lines:priced.lines,totalMinor:priced.totalMinor,paymentReference:null};
}
export function orderText(order){
 return ['UNITED MERCH – objednávka',`Jméno: ${order.contact.name}`,`E-mail: ${order.contact.email}`,
  ...(order.memberId?[`Členský účet: ${order.memberId}`]:[]),`Předání: ${order.fulfillment.label}`,'',
  ...order.lines.flatMap(l=>[`${l.name} — ${l.type} / ${l.color} / ${l.size}`,
   `Produkt: ${l.productId} · varianta: ${l.variantId}`,`${l.quantity} × ${money(l.unitPriceMinor)} = ${money(l.totalMinor)}`,'']),
  `Celkem: ${money(order.totalMinor)}`,order.contact.note?`Poznámka: ${order.contact.note}`:'',
  'Prosím o potvrzení dostupnosti a objednávky. Platba nebyla provedena.'].filter(line=>line!==null).join('\n');
}
export function mailtoOrder(order,recipient){
 if(!/^[^\s?&#]+@[^\s?&#]+\.[^\s?&#]+$/.test(recipient))throw new Error('Chybí platný příjemce objednávky.');
 return `mailto:${recipient}?subject=${encodeURIComponent('UNITED MERCH – objednávka')}&body=${encodeURIComponent(orderText(order))}`;
}
