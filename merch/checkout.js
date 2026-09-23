import {esc,addressFields,readAddress,linesMarkup,orderMarkup,bindOrder} from './order-view.js?v=20260924-merch2';
export function createCheckout({basket,getCart,clearCart,getIdentity,request,onCart}){
 let quote=null,pending=null,generation=0,busy=false;
 const contact=basket.querySelector('[data-checkout]'),review=basket.querySelector('[data-order-review]');
 const status=message=>basket.querySelector('[data-cart-error]').textContent=message;
 function reset(){generation++;quote=null;pending=null;contact.replaceChildren();review.replaceChildren();contact.hidden=true;review.hidden=true;}
 function stage(target){basket.querySelectorAll(':scope > [data-cart-body],:scope > .shop-cart-total,:scope > [data-checkout-open],:scope > [data-cart-close]').forEach(n=>n.hidden=true);contact.hidden=target!=='contact';review.hidden=target!=='review';}
 function showOrder(order){stage('review');review.innerHTML=orderMarkup(order);bindOrder(review,order,{request,onChange:showOrder});review.insertAdjacentHTML('afterbegin','<p class="shop-notice">Objednávka je uložená. Potvrzovací e-mail není podmínkou její platnosti.</p>');}
 async function open(){
  if(!getIdentity()){status('Přihlas se do Můj United. Košík zůstane zachovaný.');basket.querySelector('[data-cart-error]').insertAdjacentHTML('beforeend',' <a href="member.html">Přihlásit se</a>');return;}
  const current=++generation;stage('contact');contact.textContent='Načítám dodací údaje…';
  try{
   const result=await request('/api/merch/address');if(current!==generation)return;
   const user=getIdentity(),a=result.address||{name:user.displayName,email:user.email};
   contact.innerHTML=`<h3>Doprava a údaje</h3><form data-server-checkout><label>Předání<select name="shipping"><option value="pickup">Osobní převzetí – zdarma, po domluvě</option><option value="address">Zaslání na adresu v ČR</option></select></label>${addressFields(a)}<label><input type="checkbox" name="saveAddress">Uložit úplnou adresu jako výchozí</label><button class="shop-button shop-primary">Zkontrolovat objednávku</button><button class="shop-button" type="button" data-return-cart>← Košík</button></form>`;
   const form=contact.querySelector('form');const postal=()=>{const required=form.elements.shipping.value==='address';for(const k of ['street','city','postalCode','phone']){form.elements[k].required=required;form.elements[k].closest('label').hidden=!required;}form.elements.saveAddress.closest('label').hidden=!required;};postal();form.elements.shipping.onchange=postal;
   contact.querySelector('[data-return-cart]').onclick=onCart;
   form.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;const button=e.submitter;button.disabled=true;const g=generation;
    try{
     const input={lines:getCart(),shipping:form.elements.shipping.value,address:readAddress(form)};
     const response=await request('/api/merch/quote',{method:'POST',body:input});if(g!==generation)return;
     quote={...response,input,saveAddress:form.elements.saveAddress.checked&&input.shipping==='address'};renderReview();
    }catch(error){status(error.message);}finally{busy=false;button.disabled=false;}
   };
  }catch(error){if(current===generation){contact.textContent='Dodací údaje nelze načíst.';status(error.message);}}
 }
 function renderReview(){
  stage('review');const s=quote.quote,a=s.address;
  review.innerHTML=`<h3>Rekapitulace</h3>${linesMarkup(s)}<p>${esc(a.name)} · ${esc(a.email)}<br>${s.shipping==='address'?esc(`${a.street}, ${a.postalCode} ${a.city}`):esc(s.pickupInstructions)}</p><p>${esc(s.deliveryInformation)}</p><p>K zaplacení bude ${s.activeHours} hodin.</p>${Object.entries(s.documents).map(([k,v])=>`<details><summary>${({terms:'Obchodní podmínky',shipping:'Doprava a platba',returns:'Reklamace a odstoupení',privacy:'Osobní údaje'})[k]}</summary><pre class="merch-document">${esc(v)}</pre></details>`).join('')}<label><input type="checkbox" data-accept-terms>Souhlasím s obchodními podmínkami ${esc(s.termsVersion)}.</label><button type="button" class="shop-button shop-primary" data-confirm-order>Objednávka zavazující k platbě</button><button type="button" class="shop-button" data-back-contact>Upravit údaje</button><p role="status" data-create-status></p>`;
  review.querySelector('[data-back-contact]').onclick=()=>stage('contact');
  review.querySelector('[data-confirm-order]').onclick=async()=>{
   if(busy)return;const message=review.querySelector('[data-create-status]');if(!review.querySelector('[data-accept-terms]').checked){message.textContent='Potvrď obchodní podmínky.';return;}
   const user=getIdentity();if(!user)return;const g=generation;busy=true;const button=review.querySelector('[data-confirm-order]');button.disabled=true;
   try{
    const storageKey='e36MerchPending:'+user.uid;
    let stored;try{stored=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{}
    if(stored){const previous=await request('/api/merch/requests/'+encodeURIComponent(stored.key));if(previous.order){try{sessionStorage.removeItem(storageKey);}catch{}if(g===generation){clearCart();showOrder(previous.order);}return;}}
    if(!pending||pending.hash!==quote.hash)pending={key:crypto.randomUUID(),hash:quote.hash};
    try{sessionStorage.setItem(storageKey,JSON.stringify(pending));}catch{}
    const result=await request('/api/merch/orders',{method:'POST',body:{...quote.input,requestKey:pending.key,quoteHash:quote.hash,termsAccepted:true,termsVersion:s.termsVersion}});
    try{sessionStorage.removeItem(storageKey);}catch{}
    if(g!==generation)return;const save=quote.saveAddress,delivery=quote.input.address;clearCart();showOrder(result.order);
    if(save)try{await request('/api/merch/address',{method:'PUT',body:delivery});}catch{status('Objednávka je uložená. Výchozí adresu se nepodařilo aktualizovat.');}
   }catch(error){if(g===generation)message.textContent=error.message+' Košík zůstává zachovaný. Při opakování ověříme původní požadavek.';}finally{busy=false;button.disabled=false;}
  };
 }
 return {open,reset};
}
