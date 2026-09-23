import {catalog,shopSettings,imageSource,productImages,missingCommerce,money} from './catalog.js?v=20260923-merch1';
import {CART_KEY,addToCart,priceCart,readCart,writeCart} from './cart.js?v=20260923-merch1';
import {buildOrder,orderText,mailtoOrder} from './order.js?v=20260923-merch1';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
export function initShop(){
 if(!$('[data-shop-grid]'))return {setIdentity(){}};
 let storage;try{storage=window.localStorage}catch{}
 let cart=readCart(storage),active=null,selected=null,size='',viewIndex=0,identity=null,filter='all',detailOpener=null;
 let pageOverflow=null,toastTimer=0,closingHistory=false;
 const detail=$('[data-product-dialog]'),basket=$('[data-cart-dialog]'),zoom=$('[data-image-dialog]');
 const dialogs=[detail,basket,zoom];
 const form=$('[data-checkout-form]');
 const choices=new Map(catalog.map(p=>[p.id,p.variants[0].id]));
 const toast=message=>{clearTimeout(toastTimer);$('[data-shop-toast]').textContent=message;toastTimer=setTimeout(()=>{$('[data-shop-toast]').textContent=''},4500)};
 const syncLock=()=>{
  if(dialogs.some(d=>d.open)){if(!pageOverflow){pageOverflow={value:document.body.style.getPropertyValue('overflow'),priority:document.body.style.getPropertyPriority('overflow')};document.body.style.setProperty('overflow','hidden');}}
  else if(pageOverflow){if(pageOverflow.value)document.body.style.setProperty('overflow',pageOverflow.value,pageOverflow.priority);else document.body.style.removeProperty('overflow');pageOverflow=null;}
 };
 const show=d=>{if(!d.open)d.showModal();syncLock()};
 const hide=d=>{if(d.open)d.close();syncLock()};
 const invalidateReview=()=>{
  $('[data-order-review]').hidden=true;$('[data-order-email]').removeAttribute('href');
  $('[data-order-status]').textContent='';$('[data-order-summary]').replaceChildren();$('[data-order-text]').textContent='';
  $('[data-copy-fallback]').hidden=true;$('[data-copy-fallback] textarea').value='';
 };
 function stage(value){
  for(const el of [$('[data-cart-body]'),$('.shop-cart-total'),$('[data-checkout-open]'),basket.querySelector(':scope > [data-cart-close]')])el.hidden=value!=='cart';
  $('[data-checkout]').hidden=value!=='contact';$('[data-order-review]').hidden=value!=='review';
 }
 function persist(){if(!writeCart(storage,cart))toast('Košík zůstává jen v této otevřené stránce. Prohlížeč nepovolil uložení.');updateCount();invalidateReview()}
 function updateCount(){$('[data-cart-count]').textContent=cart.reduce((n,l)=>n+l.quantity,0)}
 function productURL(product,variant){const url=new URL(location.href);url.searchParams.set('product',product.id);url.searchParams.set('variant',variant.id);return url.pathname+url.search+url.hash}
 const colorButton=(variant,current)=>`<button type="button" class="shop-swatch" data-variant="${escape(variant.id)}" aria-pressed="${current===variant.id}" aria-label="${escape(variant.color)}" title="${escape(variant.color)}"><i style="--swatch:${variant.swatch}"></i></button>`;
 function renderCatalog(){
  const products=catalog.filter(p=>filter==='all'||p.category===filter);
  $('[data-product-count]').textContent=`${products.length} produktů`;
  $('[data-shop-grid]').innerHTML=products.map(p=>{
   const v=p.variants.find(v=>v.id===choices.get(p.id))||p.variants[0];
   return `<article class="shop-card" data-product="${p.id}"><a class="shop-card-link" href="${productURL(p,v)}" data-product-open="${p.id}" aria-label="${escape(p.name+' — '+p.type)}"><div class="shop-card-image"><img src="${imageSource(v)}" width="480" height="${v.image.startsWith('polo-')?692:480}" alt="${escape(p.name+' · '+v.color+' · '+p.type)}" loading="lazy"><span>Prohlédnout ↗</span></div><div class="shop-card-copy"><p>${escape(p.type)}</p><h2>${escape(p.name)}</h2><strong>${Number.isSafeInteger(v.priceMinor)&&v.priceMinor>0?money(v.priceMinor):'Cenu připravujeme'}</strong></div></a><div class="shop-card-options"><div class="shop-swatches" aria-label="Barvy">${p.variants.map(c=>colorButton(c,v.id)).join('')}</div><span data-card-color>${escape(v.color)}</span></div></article>`;
  }).join('');
 }
 $('[data-shop-grid]').addEventListener('click',event=>{
  const swatch=event.target.closest('[data-variant]');
  if(swatch){const card=swatch.closest('[data-product]'),p=catalog.find(p=>p.id===card.dataset.product),v=p.variants.find(v=>v.id===swatch.dataset.variant);choices.set(p.id,v.id);card.querySelectorAll('[data-variant]').forEach(b=>b.setAttribute('aria-pressed',String(b===swatch)));card.querySelector('[data-card-color]').textContent=v.color;const img=card.querySelector('img');img.src=imageSource(v);img.alt=`${p.name} · ${v.color} · ${p.type}`;card.querySelector('strong').textContent=Number.isSafeInteger(v.priceMinor)&&v.priceMinor>0?money(v.priceMinor):'Cenu připravujeme';card.querySelector('a').href=productURL(p,v);return;}
  const link=event.target.closest('[data-product-open]');
  if(!link||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  event.preventDefault();detailOpener=link;closingHistory=false;
  const p=catalog.find(p=>p.id===link.dataset.productOpen),v=p.variants.find(v=>v.id===choices.get(p.id));
  history.pushState({...history.state,merchProduct:true},'',productURL(p,v));readDetailURL();
 });
 $$('[data-merch-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.merchFilter;$$('[data-merch-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderCatalog()}));
 function renderImages(){
  const images=productImages(selected),current=images[viewIndex]||images[0];
  const img=$('[data-detail-image]');img.src=current.src;img.alt=`${active.name} · ${selected.color} · ${current.label}`;
  $('[data-product-images]').innerHTML=images.map((image,i)=>`<button type="button" data-view="${i}" aria-pressed="${viewIndex===i}" aria-label="${escape(image.label)}"><img src="${image.src}" alt="" width="72" height="72"></button>`).join('');
 }
 function renderVariant(){
  const missing=missingCommerce(selected);
  $('[data-product-price]').textContent=Number.isSafeInteger(selected.priceMinor)&&selected.priceMinor>0?money(selected.priceMinor):'Cenu připravujeme';
  $('[data-color-label]').textContent=selected.color;
  $('[data-product-variants]').innerHTML=active.variants.map(v=>`<button type="button" data-select-variant="${v.id}" aria-pressed="${v.id===selected.id}"><i style="--swatch:${v.swatch}"></i>${escape(v.color)}</button>`).join('');
  $('[data-product-sizes]').innerHTML=selected.sizes.map(s=>`<button type="button" data-size="${escape(s)}" aria-pressed="${size===s}">${escape(s)}</button>`).join('');
  $('[data-size-notice]').textContent=selected.sizes.length?'Vyber velikost. Žádná není zvolená předem.':'Velikosti ještě nejsou potvrzené.';
  $('[data-product-availability]').textContent=missing.length?`Zatím pouze náhled. Chybí potvrdit: ${missing.join(', ')}.`:'Varianta je dostupná k objednání.';
  $('[data-add-cart]').disabled=missing.length>0;
  $('[data-product-quantity]').disabled=missing.length>0;
  $('[data-product-handover]').textContent=shopSettings.fulfillment?.label?`Předání: ${shopSettings.fulfillment.label}. Bez online platby.`:'Způsob předání upřesníme před zahájením objednávek.';
  $('[data-product-error]').textContent='';$('[data-add-status]').textContent='';viewIndex=0;renderImages();
 }
 function readDetailURL(){
  closingHistory=false;
  const params=new URL(location.href).searchParams,p=catalog.find(p=>p.id===params.get('product'));
  if(!p){hide(zoom);hide(basket);hide(detail);active=null;detailOpener?.focus({preventScroll:true});return;}
  active=p;selected=p.variants.find(v=>v.id===params.get('variant'))||p.variants[0];size='';
  $('#product-title').textContent=p.name;$('[data-product-type]').textContent=p.type;$('[data-product-description]').textContent=p.description;
  $('[data-product-quantity]').value='1';renderVariant();show(detail);
 }
 function closeDetail(){
  if(closingHistory)return;
  if(history.state?.merchProduct){closingHistory=true;history.back();}
  else{const url=new URL(location.href);url.searchParams.delete('product');url.searchParams.delete('variant');history.replaceState(history.state,'',url);readDetailURL()}
 }
 $$('[data-detail-close]').forEach(b=>b.addEventListener('click',closeDetail));
 detail.addEventListener('cancel',e=>{e.preventDefault();closeDetail()});
 window.addEventListener('popstate',readDetailURL);
 $('[data-product-variants]').addEventListener('click',e=>{const b=e.target.closest('[data-select-variant]');if(!b)return;selected=active.variants.find(v=>v.id===b.dataset.selectVariant);size='';history.replaceState(history.state,'',productURL(active,selected));renderVariant();$(`[data-select-variant="${selected.id}"]`).focus({preventScroll:true})});
 $('[data-product-sizes]').addEventListener('click',e=>{const b=e.target.closest('[data-size]');if(!b)return;size=b.dataset.size;$$('[data-size]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));$('[data-product-error]').textContent=''});
 $('[data-product-images]').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(!b)return;viewIndex=Number(b.dataset.view);renderImages();$(`[data-view="${viewIndex}"]`).focus({preventScroll:true})});
 // Native touch scrolling of thumbnails; a horizontal swipe also advances views.
 let touchStart=null;
 $('[data-detail-image]').addEventListener('touchstart',e=>{touchStart=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null},{passive:true});
 $('[data-detail-image]').addEventListener('touchend',e=>{if(!touchStart)return;const t=e.changedTouches[0],dx=t.clientX-touchStart.x,dy=t.clientY-touchStart.y;touchStart=null;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5){viewIndex=(viewIndex+(dx<0?1:-1)+productImages(selected).length)%productImages(selected).length;renderImages()}},{passive:true});
 $('[data-image-zoom]').addEventListener('click',()=>{const image=productImages(selected)[viewIndex];$('[data-zoom-image]').src=image.zoom;$('[data-zoom-image]').alt=$('[data-detail-image]').alt;$('[data-zoom-caption]').textContent=`${active.name} · ${selected.color} · ${image.label}`;show(zoom)});
 $('[data-zoom-close]').addEventListener('click',()=>hide(zoom));
 zoom.addEventListener('close',syncLock);basket.addEventListener('close',syncLock);
 $('[data-product-form]').addEventListener('submit',event=>{
  event.preventDefault();try{cart=addToCart(cart,catalog,selected.id,size,Number($('[data-product-quantity]').value));persist();$('[data-add-status]').textContent=`${active.name} / ${size} je v košíku.`;$('[data-product-error]').textContent='';}
  catch(error){$('[data-product-error]').textContent=error.message;if(!size)$('[data-size]')?.focus()}
 });
 function renderCart(){
  const priced=priceCart(cart,catalog);
  $('[data-cart-body]').innerHTML=priced.lines.length?priced.lines.map((l,i)=>`<article class="shop-cart-line">${l.image?`<img src="${imageSource(l)}" width="90" height="110" alt="${escape(l.name+' · '+l.color)}">`:''}<div><h3>${escape(l.name)}</h3><p>${escape(l.type)}<br>${escape(l.color)} · velikost ${escape(l.size)}</p><small>${l.unitPriceMinor===null?'Nedostupná varianta':money(l.unitPriceMinor)+' / kus'}</small><div class="shop-line-controls"><label>Ks <input type="number" min="1" max="99" step="1" value="${l.quantity}" data-line-quantity="${i}" aria-label="Počet ${escape(l.name+' '+l.size)}"></label><button type="button" class="shop-text-button" data-line-remove="${i}" aria-label="Odebrat ${escape(l.name+' '+l.size)}">Odebrat</button><strong>${l.totalMinor===null?'—':money(l.totalMinor)}</strong></div></div></article>`).join(''):'<div class="shop-empty"><span aria-hidden="true">↗</span><h3>Co budeš nosit ty?</h3><p>Košík je zatím prázdný. Prohlédni si barvy a střihy v kolekci.</p></div>';
  $('[data-cart-total]').textContent=priced.errors.length?'Nelze potvrdit':money(priced.totalMinor);
  $('[data-cart-error]').textContent=priced.errors.join(' ')||(priced.lines.length&&!shopSettings.fulfillment?'Způsob předání ještě není potvrzený. Objednávání zatím není dostupné.':'');
  $('[data-checkout-open]').disabled=!priced.lines.length||Boolean(priced.errors.length)||!shopSettings.fulfillment;
  invalidateReview();stage('cart');
 }
 $$('[data-cart-open]').forEach(b=>b.addEventListener('click',()=>{renderCart();show(basket)}));
 $$('[data-cart-close]').forEach(b=>b.addEventListener('click',()=>hide(basket)));
 $('[data-cart-body]').addEventListener('click',e=>{const b=e.target.closest('[data-line-remove]');if(!b)return;cart.splice(Number(b.dataset.lineRemove),1);persist();renderCart();$('[data-cart-close]').focus({preventScroll:true})});
 $('[data-cart-body]').addEventListener('change',e=>{const input=e.target.closest('[data-line-quantity]');if(!input)return;const n=Number(input.value);if(!Number.isInteger(n)||n<1||n>99){input.value=cart[Number(input.dataset.lineQuantity)].quantity;$('[data-cart-error]').textContent='Počet musí být 1–99 kusů.';return;}cart[Number(input.dataset.lineQuantity)].quantity=n;persist();renderCart()});
 $('[data-checkout-open]').addEventListener('click',()=>{stage('contact');$('[data-checkout-handover]').textContent=`Předání: ${shopSettings.fulfillment.label}`;form.elements.name.focus()});
 $$('[data-edit-cart]').forEach(b=>b.addEventListener('click',()=>{invalidateReview();stage('cart');basket.scrollTop=0;$('[data-checkout-open]').focus({preventScroll:true})}));
 function currentOrder(){return buildOrder(cart,catalog,{name:form.elements.name.value,email:form.elements.email.value,note:form.elements.note.value},shopSettings,identity?.uid||null)}
 function refreshReview(){
  const order=currentOrder();$('[data-order-text]').textContent=orderText(order);$('[data-order-email]').href=mailtoOrder(order,shopSettings.recipient);
  $('[data-order-summary]').innerHTML=`<div class="shop-review-contact"><strong>${escape(order.contact.name)}</strong><p>${escape(order.contact.email)}</p><p>${escape(order.fulfillment.label)}</p>${order.contact.note?`<p>${escape(order.contact.note)}</p>`:''}</div>${order.lines.map(l=>`<div class="shop-cart-line"><img src="${imageSource(l)}" width="90" height="110" alt="${escape(l.name)}"><div><h3>${escape(l.name)}</h3><p>${escape(l.type)}<br>${escape(l.color)} · ${escape(l.size)}</p><p>${l.quantity} × ${money(l.unitPriceMinor)}</p><strong>${money(l.totalMinor)}</strong></div></div>`).join('')}<div class="shop-cart-total"><span>Celkem</span><strong>${money(order.totalMinor)}</strong></div>`;
  return order;
 }
 form.addEventListener('input',invalidateReview);
 form.addEventListener('submit',e=>{e.preventDefault();try{refreshReview();stage('review');$('#order-review-title').focus();}catch(error){$('[data-cart-error]').textContent=error.message}});
 $('[data-order-edit]').addEventListener('click',()=>{invalidateReview();stage('contact');form.elements.name.focus()});
 $('[data-order-email]').addEventListener('click',e=>{try{refreshReview();$('[data-order-status]').textContent='Otevíráme e-mailového klienta. Odeslání musíš potvrdit v něm; web ho nemůže ověřit. Pokud se neotevře, zkopíruj objednávku.'}catch(error){e.preventDefault();$('[data-cart-error]').textContent=error.message;invalidateReview()}});
 $('[data-order-copy]').addEventListener('click',async()=>{
  try{const text=orderText(refreshReview());try{await navigator.clipboard.writeText(text);$('[data-order-status]').textContent='Zkopírováno. Vlož objednávku do e-mailu pro '+shopSettings.recipient+'.'}catch{const fallback=$('[data-copy-fallback]');fallback.hidden=false;fallback.querySelector('textarea').value=text;fallback.querySelector('textarea').focus();fallback.querySelector('textarea').select();$('[data-order-status]').textContent='Prohlížeč nepovolil schránku. Označený text můžeš zkopírovat ručně.'}}
  catch(error){$('[data-cart-error]').textContent=error.message;invalidateReview()}
 });
 window.addEventListener('storage',e=>{if(e.key!==CART_KEY)return;cart=readCart(storage);updateCount();invalidateReview();if(basket.open)renderCart()});
 if(catalog.some(p=>p.variants.some(v=>!missingCommerce(v).length)))$('.shop-catalog-note').textContent='Vyber střih, barvu a velikost. Objednávku si připravíš v e-mailu.';
 renderCatalog();updateCount();readDetailURL();
 return {setIdentity(user){
  // Contact data are deliberately not persisted. Account switching must not
  // carry another member's personal note into a newly prepared email.
  if(identity?.uid!==user?.uid){form.reset();invalidateReview();stage('cart');}
  identity=user||null;
  if(!form.elements.name.value)form.elements.name.value=user?.displayName||'';
  if(!form.elements.email.value)form.elements.email.value=user?.email||'';
  $('[data-checkout-member]').textContent=user?'Údaje jsou předvyplněné z přihlášeného účtu. Můžeš je upravit.':'Přihlášení není potřeba. Pokud se přihlásíš přes Můj United a vrátíš se sem, košík zůstane zachovaný.';
 }};
}
