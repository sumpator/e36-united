import {apiRequest,apiUpload} from '../api.js?v=20260924-merch2';
import {adminState} from '../state.js?v=20260924-merch2';
import {esc,date,statusLabel,orderMarkup,bindOrder} from '../../merch/order-view.js?v=20260924-workspace1';
import {money,imageSource} from '../../merch/catalog.js?v=20260924-merch2';
import {merchandiseDocuments} from '../../merch/documents.js?v=20260924-merch2';
import {editMerchProduct,productStatus,productGender,productPrice} from './merch-product-editor.js?v=20260924-workspace1';
import {initializeMerchPayments} from './merch-payments.js?v=20260924-workspace1';
import {layoutMerchSettings} from './merch-settings-layout.js?v=20260924-workspace1';
export function initializeMerch(){
 const panel=document.querySelector('[data-admin-panel="merch"]'),body=panel.querySelector('[data-merch-admin-body]');let tab='orders',page=1,catalog=null,generation=0,productEditor=null;
 const leaveProduct=()=>!productEditor||productEditor.allowLeave();
 const disposeProduct=()=>{productEditor?.dispose();productEditor=null;};
 window.addEventListener('admin:merch-beforeleave',event=>{if(!leaveProduct())event.preventDefault();});
 panel.classList.add('merch-connected');
 const paymentsPanel=document.querySelector('[data-admin-panel="payments"]');
 const finance=initializeMerchPayments({panel:paymentsPanel,request:apiRequest,state:adminState});
 const content=document.createElement('div');while(panel.firstChild)content.append(panel.firstChild);panel.append(content);
 const controls=selector=>content.querySelector(selector);
 content.querySelector('.merch-actions').classList.add('portal-tabs');
 content.querySelectorAll('[data-merch-admin-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.merchAdminTab===tab)));
 controls('[data-merch-search-form]').querySelector('button').classList.add('shop-button');
 controls('[data-merch-search-form]').classList.add('merch-toolbar');
 const request=(path,options)=>apiRequest('/api/admin/merch'+path,options);
 const stateMessage=value=>controls('[data-merch-admin-status]').textContent=value;
 const still=g=>g===generation&&!adminState.denied&&!!adminState.currentUser;
 function clear(){disposeProduct();generation++;body.replaceChildren();catalog=null;stateMessage('');}
 async function load(){disposeProduct();const g=++generation;body.textContent='Načítám…';try{
  if(tab==='orders'){
   const params=new URLSearchParams({page:String(page),search:controls('[data-merch-search]').value,filter:controls('[data-merch-order-filter]').value});
   const r=await request('/orders?'+params);if(!still(g))return;
   body.innerHTML=`<div class="merch-orders">${r.orders.map(o=>`<button type="button" class="merch-order-card" data-admin-order="${o.id}"><img src="${esc(imageSource(o.snapshot.lines[0]))}" alt=""><span><b>${esc(o.number)} · ${esc(o.snapshot.address.name)}</b><small>VS ${o.variableSymbol} · ${money(o.snapshot.totalMinor)} </small><small>Vyřízení: ${statusLabel[o.state.status]} · Platba: ${statusLabel[o.payment.status]}</small></span></button>`).join('')||'<p>Žádné objednávky v tomto výběru.</p>'}</div>${r.orders.length||page>1?`<div class="merch-actions"><button class="shop-button" data-orders-prev ${page===1?'disabled':''}>←</button><span>Strana ${page}</span><button class="shop-button" data-orders-next ${r.hasMore?'':'disabled'}>→</button></div>`:''}<div data-admin-order-detail></div>`;
   body.querySelector('[data-orders-prev]')?.addEventListener('click',()=>{page=Math.max(1,page-1);void load();});body.querySelector('[data-orders-next]')?.addEventListener('click',()=>{page++;void load();});
   const orderId=new URL(location.href).searchParams.get('order');if(orderId){const detail=await request('/orders/'+encodeURIComponent(orderId));if(still(g))showOrder(detail.order);}
  }else{catalog=await request('/catalog');if(!still(g))return;if(tab==='products')products();else settings();}
 }catch(error){if(still(g)){body.textContent=error.message;stateMessage('Data nebyla načtena.');}}}
 function showOrder(order){const host=body.querySelector('[data-admin-order-detail]');if(!host)return;host.innerHTML=(adminState.merchReturn?'<p><a class="shop-button" href="admin.html?section=finance&view=payments&payment=merch">← Zpět na platby za Merch</a></p>':'')+orderMarkup(order,{admin:true});bindOrder(host,order,{admin:true,request:apiRequest,onChange:showOrder});host.scrollIntoView({block:'start',behavior:'instant'});}
 body.addEventListener('click',async e=>{const b=e.target.closest('[data-admin-order]');if(b){const g=generation;try{const r=await request('/orders/'+b.dataset.adminOrder);if(still(g))showOrder(r.order);}catch(error){stateMessage(error.message);}}});
 content.querySelectorAll('[data-merch-admin-tab]').forEach(b=>b.onclick=()=>{if(!leaveProduct())return;content.querySelectorAll('[data-merch-admin-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button===b)));tab=b.dataset.merchAdminTab;page=1;controls('[data-merch-order-controls]').hidden=tab!=='orders';void load();});
 controls('[data-merch-search-form]').onsubmit=e=>{e.preventDefault();page=1;void load();};
 function products(){
  body.innerHTML=`<div class="merch-actions"><button class="shop-button shop-primary" data-new-product>Nový produkt</button>${!catalog.products.length?'<button class="shop-button" data-seed-products>Založit schválenou kolekci (6 produktů)</button>':''}</div><div class="portal-product-list">${catalog.products.map(p=>`<button type="button" class="merch-order-card" data-edit-product="${esc(p.id)}">${p.variants[0]?.image?`<img src="${esc(imageSource(p.variants[0]))}" alt="">`:''}<span><b>${esc(p.name)}</b><small>${esc(p.category)} · ${esc(productGender[p.gender]||p.gender)} · ${esc(p.type)}</small><small>${p.variants.length} variant · ${productPrice(p)}</small><small>${esc(productStatus[p.status])} · Upravit</small></span></button>`).join('')}</div><div data-product-editor></div>`;
  function openProduct(product){if(!leaveProduct())return;disposeProduct();const g=generation;productEditor=editMerchProduct(body.querySelector('[data-product-editor]'),{product,catalog,isCurrent:()=>still(g),upload:file=>apiUpload('/api/admin/merch/media',file,{method:'POST'}),save:values=>request('/products',{method:'PUT',body:values}),onSaved:()=>{stateMessage('Produkt uložen.');void load();}});const heading=body.querySelector('[data-product-editor] h3');heading.tabIndex=-1;heading.focus();heading.scrollIntoView({block:'start'});}
  body.querySelector('[data-new-product]').onclick=()=>openProduct();
  body.querySelectorAll('[data-edit-product]').forEach(button=>button.onclick=()=>openProduct(catalog.products.find(p=>p.id===button.dataset.editProduct)));
  body.querySelector('[data-seed-products]')?.addEventListener('click',async()=>{try{await request('/seed',{method:'POST'});await load();}catch(error){stateMessage(error.message);}});
 }
 function settings(){const s=catalog.settings;
  body.innerHTML=`<p>${catalog.ready?'Objednávání je aktivní.':'Objednávání je pozastavené.'}</p><p>${catalog.missing.map(esc).join(' · ')}</p><form data-merch-settings><label><input name="paused" type="checkbox" ${s.paused?'checked':''}>Pozastavit nové objednávky</label><h3>Prodávající</h3>${Object.entries({name:'Název',street:'Ulice',city:'Obec',postalCode:'PSČ',ico:'IČO',taxStatus:'Daňový status (ověřený)',email:'E-mail',phone:'Telefon'}).map(([k,l])=>`<label>${l}<input name="seller-${k}" value="${esc(s.seller[k])}"></label>`).join('')}<label>Cena dopravy Kč<input name="shipping" type="number" min="0" step="0.01" value="${s.shippingMinor/100}"></label><label>Osobní převzetí<textarea name="pickup">${esc(s.pickupInstructions)}</textarea></label><label>Informace o dodání<textarea name="delivery">${esc(s.deliveryInformation)}</textarea></label><label>Aktivita objednávky (hodiny)<input name="hours" type="number" min="1" max="720" value="${s.activeHours}"></label><label>Potvrzená sleva při 12 bodech (%)<input name="discount" type="number" min="0" max="100" step="0.01" value="${s.discountBasisPoints===null?'':s.discountBasisPoints/100}"></label><p>Body se nákupem neodečítají ani nepřidělují. Prázdná sazba blokuje aktivaci.</p><label>Převzít ověřený netestovací účet z registrací<select name="bankEventId"><option value="">Ponechat uložený účet</option>${adminState.events.map(e=>`<option value="${esc(e.id)}">${esc(e.title||e.year)}</option>`).join('')}</select></label><p>${esc(s.bank?.accountDisplay||'Účet zatím nepotvrzen')}</p><label>Verze podmínek<input name="termsVersion" value="${esc(s.termsVersion)}"></label>${[['terms','Obchodní podmínky'],['shipping','Doprava a platba'],['returns','Reklamace a odstoupení'],['privacy','Osobní údaje']].map(([k,l])=>`<label>${l}<textarea rows="7" name="doc-${k}">${esc(s.documents[k])}</textarea></label>`).join('')}<label><input name="legalApproved" type="checkbox" ${s.legalApproved?'checked':''}>Ověřil jsem provozní údaje a obchodní dokumenty pro ostrý prodej</label><button class="shop-button shop-primary">Uložit nastavení</button></form>`;
  const form=body.querySelector('form'),draftButton=document.createElement('button');draftButton.type='button';draftButton.className='shop-button';draftButton.textContent='Připravit návrh dokumentů z uložených údajů';form.prepend(draftButton);draftButton.onclick=()=>{if(!confirm('Nahradit rozepsané dokumenty návrhem k doplnění a kontrole?'))return;for(const[k,v]of Object.entries(merchandiseDocuments(s)))form.elements['doc-'+k].value=v;form.elements.legalApproved.checked=false;stateMessage('Doplň označené údaje a před aktivací ověř dokumenty.');};
  layoutMerchSettings(form,catalog);
  form.onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget),get=k=>String(f.get(k)||'');e.submitter.disabled=true;try{await request('/settings',{method:'PUT',body:{revision:catalog.revision,bankEventId:get('bankEventId'),settings:{...s,paused:f.has('paused'),seller:Object.fromEntries(Object.keys(s.seller).map(k=>[k,get('seller-'+k)])),shippingMinor:Math.round(Number(get('shipping'))*100),pickupInstructions:get('pickup'),deliveryInformation:get('delivery'),activeHours:Number(get('hours')),discountBasisPoints:get('discount')===''?null:Math.round(Number(get('discount'))*100),termsVersion:get('termsVersion'),legalApproved:f.has('legalApproved'),documents:Object.fromEntries(['terms','shipping','returns','privacy'].map(k=>[k,get('doc-'+k)]))}}});stateMessage('Nastavení uloženo.');await load();}catch(error){stateMessage(error.message);e.submitter.disabled=false;}};
 }
 window.addEventListener('admin:accesslost',clear);window.addEventListener('admin:viewchange',e=>{if(e.detail.view==='merch')void load();else clear();});
 window.addEventListener('admin:merch-open',()=>void load());
 return {load,clear,startup(){if(adminState.activeAdminView==='merch')void load();if(adminState.activeAdminView==='payments')finance.sync();}};
}
