import {imageSource,productImages,missingCommerce,money} from './catalog.js?v=20260924-merch2';
import {CART_KEY,addToCart,priceCart,readCart,writeCart} from './cart.js?v=20260924-merch2';
import {createCheckout} from './checkout.js?v=20260924-merch2';
import {createMemberApiClient} from '../member/api.js?v=20260907-feedback';
import {portalConfig} from '../firebase-config.js?v=20260924-merch2';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
export function initShop(){
 if(!$('[data-shop-grid]'))return {setIdentity(){}};
 let storage;try{storage=window.localStorage}catch{}
 let catalog=[],shopSettings={},catalogReady=false,gender='all';
 const apiBase=(portalConfig.apiBaseUrl||'https://api.e36united.cz').replace(/\/$/,'');
 const {request}=createMemberApiClient({baseUrl:apiBase,getCurrentUser:()=>identity});
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
 const checkout=createCheckout({basket,getCart:()=>cart,getIdentity:()=>identity,request,onCart:renderCart,clearCart:()=>{cart=[];writeCart(storage,cart);updateCount();}});
 const invalidateReview=()=>checkout.reset();
 function stage(value){
  for(const el of [$('[data-cart-body]'),$('.shop-cart-total'),$('[data-checkout-open]'),basket.querySelector(':scope > [data-cart-close]')])el.hidden=value!=='cart';
  $('[data-checkout]').hidden=value!=='contact';$('[data-order-review]').hidden=value!=='review';
 }
 function persist(){if(!writeCart(storage,cart))toast('Košík zůstává jen v této otevřené stránce. Prohlížeč nepovolil uložení.');updateCount();invalidateReview()}
 function updateCount(){$('[data-cart-count]').textContent=cart.reduce((n,l)=>n+l.quantity,0)}
 function productURL(product,variant){const url=new URL(location.href);url.searchParams.set('product',product.id);url.searchParams.set('variant',variant.id);return url.pathname+url.search+url.hash}
 const colorButton=(variant,current)=>`<button type="button" class="shop-swatch" data-variant="${escape(variant.id)}" aria-pressed="${current===variant.id}" aria-label="${escape(variant.color)}" title="${escape(variant.color)}"><i style="--swatch:${variant.swatch}"></i></button>`;
 function renderCatalog(){
  const products=catalog.filter(p=>(filter==='all'||p.category===filter)&&(gender==='all'||p.gender===gender||p.gender==='unisex'));
  $('[data-product-count]').textContent=`${products.length} produktů`;
  $('[data-shop-grid]').innerHTML=products.map(p=>{
   const v=p.variants.find(v=>v.id===choices.get(p.id))||p.variants[0];
   return `<article class="shop-card" data-product="${p.id}"><a class="shop-card-link" href="${productURL(p,v)}" data-product-open="${p.id}" aria-label="${escape(p.name+' — '+p.type)}"><div class="shop-card-image"><img src="${imageSource(v)}" width="480" height="${v.image.startsWith('polo-')?692:480}" alt="${escape(p.name+' · '+v.color+' · '+p.type)}" loading="lazy"><span>Prohlédnout ↗</span></div><div class="shop-card-copy"><p>${escape(p.type)}</p><h2>${escape(p.name)}</h2><strong>${Number.isSafeInteger(v.priceMinor)&&v.priceMinor>0?money(v.priceMinor):'Cena bude doplněna'}</strong></div></a><div class="shop-card-options"><div class="shop-swatches" aria-label="Barvy">${p.variants.map(c=>colorButton(c,v.id)).join('')}</div><span data-card-color>${escape(v.color)}</span></div></article>`;
  }).join('')||'<p>Tomuto výběru nic neodpovídá. <button type="button" data-clear-filters>Zrušit filtry</button></p>';
 }
 $('[data-shop-grid]').addEventListener('click',event=>{
  if(event.target.closest('[data-clear-filters]')){filter='all';gender='all';renderFilters();renderCatalog();return;}
  const swatch=event.target.closest('[data-variant]');
  if(swatch){const card=swatch.closest('[data-product]'),p=catalog.find(p=>p.id===card.dataset.product),v=p.variants.find(v=>v.id===swatch.dataset.variant);choices.set(p.id,v.id);card.querySelectorAll('[data-variant]').forEach(b=>b.setAttribute('aria-pressed',String(b===swatch)));card.querySelector('[data-card-color]').textContent=v.color;const img=card.querySelector('img');img.src=imageSource(v);img.alt=`${p.name} · ${v.color} · ${p.type}`;card.querySelector('strong').textContent=Number.isSafeInteger(v.priceMinor)&&v.priceMinor>0?money(v.priceMinor):'Cena bude doplněna';card.querySelector('a').href=productURL(p,v);return;}
  const link=event.target.closest('[data-product-open]');
  if(!link||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  event.preventDefault();detailOpener=link;closingHistory=false;
  const p=catalog.find(p=>p.id===link.dataset.productOpen),v=p.variants.find(v=>v.id===choices.get(p.id));
  history.pushState({...history.state,merchProduct:true},'',productURL(p,v));readDetailURL();
 });
 function renderFilters(){
 const host=$('[data-catalog-filters]');host.innerHTML='<div class="shop-filters" role="group" aria-label="Střih">'+[['all','Vše'],['men','Pánské'],['women','Dámské']].map(([id,label])=>'<button type="button" data-gender="'+id+'" aria-pressed="'+(gender===id)+'">'+label+'</button>').join('')+'</div><div class="shop-filters" role="group" aria-label="Kategorie">'+['all',...new Set(catalog.map(p=>p.category))].map(id=>'<button type="button" data-merch-filter="'+escape(id)+'" aria-pressed="'+(filter===id)+'">'+(id==='all'?'Všechny kategorie':escape(id))+'</button>').join('')+'</div>';
 }
 $('[data-catalog-filters]').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.gender)gender=b.dataset.gender;if(b.dataset.merchFilter)filter=b.dataset.merchFilter;renderFilters();renderCatalog();});
 function renderImages(){
  const images=productImages(selected),current=images[viewIndex]||images[0];
  const img=$('[data-detail-image]');img.src=current.src;img.alt=`${active.name} · ${selected.color} · ${current.label}`;
  $('[data-product-images]').innerHTML=images.map((image,i)=>`<button type="button" data-view="${i}" aria-pressed="${viewIndex===i}" aria-label="${escape(image.label)}"><img src="${image.src}" alt="" width="72" height="72"></button>`).join('');
 }
 function renderVariant(){
  const missing=missingCommerce(selected);
  $('[data-product-price]').textContent=Number.isSafeInteger(selected.priceMinor)&&selected.priceMinor>0?money(selected.priceMinor):'Cena bude doplněna';
  $('[data-color-label]').textContent=selected.color;
  $('[data-product-variants]').innerHTML=active.variants.map(v=>`<button type="button" data-select-variant="${v.id}" aria-pressed="${v.id===selected.id}"><i style="--swatch:${v.swatch}"></i>${escape(v.color)}</button>`).join('');
  $('[data-product-sizes]').innerHTML=selected.sizes.map(s=>`<button type="button" data-size="${escape(s)}" aria-pressed="${size===s}">${escape(s)}</button>`).join('');
  $('[data-size-notice]').textContent=selected.sizes.length?'Vyber velikost. Žádná není zvolená předem.':'Velikosti ještě nejsou potvrzené.';
  $('[data-product-availability]').textContent=missing.length?`Zatím pouze náhled. Chybí potvrdit: ${missing.join(', ')}.`:'Varianta je dostupná k objednání.';
  $('[data-add-cart]').disabled=missing.length>0;
  $('[data-product-quantity]').disabled=missing.length>0;
  $('[data-product-handover]').textContent='Osobní převzetí zdarma · doručení po ČR '+money(shopSettings.shippingMinor||12900)+'.';
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
  $('[data-cart-error]').textContent=priced.errors.join(' ')||(priced.lines.length&&!catalogReady?'Objednávání zatím není aktivní.':'');
  $('[data-checkout-open]').disabled=!priced.lines.length||Boolean(priced.errors.length)||!catalogReady;
  invalidateReview();stage('cart');
 }
 $$('[data-cart-open]').forEach(b=>b.addEventListener('click',()=>{renderCart();show(basket)}));
 $$('[data-cart-close]').forEach(b=>b.addEventListener('click',()=>hide(basket)));
 $('[data-cart-body]').addEventListener('click',e=>{const b=e.target.closest('[data-line-remove]');if(!b)return;cart.splice(Number(b.dataset.lineRemove),1);persist();renderCart();$('[data-cart-close]').focus({preventScroll:true})});
 $('[data-cart-body]').addEventListener('change',e=>{const input=e.target.closest('[data-line-quantity]');if(!input)return;const n=Number(input.value);if(!Number.isInteger(n)||n<1||n>99){input.value=cart[Number(input.dataset.lineQuantity)].quantity;$('[data-cart-error]').textContent='Počet musí být 1–99 kusů.';return;}cart[Number(input.dataset.lineQuantity)].quantity=n;persist();renderCart()});
 $('[data-checkout-open]').addEventListener('click',checkout.open);
 window.addEventListener('storage',e=>{if(e.key!==CART_KEY)return;cart=readCart(storage);updateCount();invalidateReview();if(basket.open)renderCart()});
 async function loadCatalog(){
 try{const response=await fetch(apiBase+'/api/merch/catalog',{cache:'no-store'});if(!response.ok)throw new Error('Katalog není dostupný.');const payload=await response.json();catalog=payload.products;shopSettings=payload.settings;catalogReady=payload.ready;for(const p of catalog)choices.set(p.id,p.variants[0].id);renderFilters();renderCatalog();readDetailURL();$('.shop-catalog-note').textContent=catalogReady?'Vyber si svůj United. Objednává přihlášený aktivní člen.':'Náhled kolekce · objednávání zatím není aktivní.';}
 catch(error){$('[data-shop-grid]').textContent=error.message;}
 }
 void loadCatalog();updateCount();
 return {setIdentity(user){
  // Contact data are deliberately not persisted. Account switching must not
  // carry another member's personal note into a newly prepared email.
  if(identity?.uid!==user?.uid){invalidateReview();stage('cart');}
  identity=user||null;


 }};
}
