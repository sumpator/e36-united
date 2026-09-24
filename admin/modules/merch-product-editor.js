import {esc} from '../../merch/order-view.js?v=20260924-workspace1';
import {money,imageSource} from '../../merch/catalog.js?v=20260924-merch2';

export const productStatus={draft:'Koncept',published:'Publikováno',archived:'Archivováno'};
export const productGender={men:'Pánské',women:'Dámské',unisex:'Unisex'};
export function productPrice(product){const prices=product.variants.map(v=>v.priceMinor).filter(Number.isSafeInteger);return prices.length?`${new Set(prices).size>1?'Od ':''}${money(Math.min(...prices))}`:'Cena zatím není nastavena';}

export function editMerchProduct(host,{product,catalog,upload,save,isCurrent,onSaved}){
 const p=product||{id:'',name:'',type:'',description:'',category:'',gender:'unisex',position:0,status:'draft',variants:[]};
 let dirty=false,busy=false,disposed=false,previewIndex=0;
 const localFiles=new Map(),urls=new Map();
 const images=[...new Set(catalog.products.flatMap(item=>item.variants.map(v=>v.image)).filter(Boolean))];
 const input=(name,label,value='',extra='')=>`<label>${label}<input name="${name}" value="${esc(value)}" ${extra}></label>`;
 const select=(name,label,value,options)=>`<label>${label}<select name="${name}">${Object.entries(options).map(([id,text])=>`<option value="${id}" ${value===id?'selected':''}>${text}</option>`).join('')}</select></label>`;
 function variant(v={},index=0){
  const sizes=[...new Set(['XS','S','M','L','XL','XXL','3XL',...(v.sizes||[])])];
  return `<details class="merch-variant-edit" data-variant="${index}" ${index===0?'open':''}><summary class="portal-variant-summary">${v.image?`<img data-variant-thumb src="${esc(imageSource(v))}" alt="">`:'<img data-variant-thumb hidden alt="">'}<span><b data-variant-title>${esc(v.color||'Nová varianta')}</b><small data-variant-summary>${esc((v.sizes||[]).join(' · '))}</small></span></summary><div class="portal-fields">${input('color','Barva / střih',v.color,'required')}${input('swatch','Vzorek barvy',v.swatch||'#888888','type="color"')}${input('price','Cena Kč',v.priceMinor==null?'':v.priceMinor/100,'type="number" min="0.01" step="0.01"')}${select('availability','Dostupnost',v.availability||'unavailable',{available:'Dostupné',unavailable:'Nedostupné',unconfirmed:'Dosud nepotvrzeno'})}</div><p>Bez ceny nelze tuto variantu objednat.</p><fieldset><legend>Velikosti</legend><div class="portal-sizes">${sizes.map(size=>`<label><input type="checkbox" name="size" value="${esc(size)}" ${(v.sizes||[]).includes(size)?'checked':''}>${esc(size)}</label>`).join('')}</div></fieldset><fieldset><legend>Fotografie varianty (povinná)</legend><input type="hidden" name="image" value="${esc(v.image)}"><details><summary>Vybrat z uložených fotografií</summary><div class="portal-photo-options">${[...new Set([...images,...(v.image?[v.image]:[])])].map(image=>`<label><input type="radio" name="photo-${index}" value="${esc(image)}" ${image===v.image?'checked':''}><img src="${esc(imageSource({image}))}" alt="${esc(image.replaceAll('-',' '))}"></label>`).join('')}</div></details><label>Nahradit fotografii<input data-product-file type="file" accept="image/jpeg,image/png,image/webp"></label><button class="shop-button" type="button" data-remove-photo>Odebrat výběr fotografie</button><small data-photo-status>Fotografie se nahraje až při uložení produktu.</small></fieldset><details><summary>Technické údaje</summary>${input('variantId','Stabilní ID',v.id,`required ${v.id?'readonly':''}`)}</details></details>`;
 }
 host.innerHTML=`<div class="portal-product-layout"><form id="merch-product-edit" data-product-edit><section class="portal-card"><h3>${p.id?'Upravit produkt':'Nový produkt'}</h3><div class="portal-fields">${input('name','Název',p.name,'required')}${input('type','Krátký podtitulek',p.type)}${input('category','Kategorie',p.category,'required list="merch-category-options"')}${select('gender','Určení / střih',p.gender,productGender)}</div><datalist id="merch-category-options">${[...new Set(catalog.products.map(item=>item.category))].map(category=>`<option value="${esc(category)}">`).join('')}</datalist><label>Popis<textarea name="description" rows="3">${esc(p.description)}</textarea></label><details><summary>Technické údaje</summary>${input('id','ID produktu',p.id,`required ${p.id?'readonly':''}`)}</details></section><section class="portal-card"><h3>Varianty a fotografie</h3><div data-variants>${(p.variants.length?p.variants:[{}]).map(variant).join('')}</div><button class="shop-button" type="button" data-add-variant>+ Varianta</button></section><section class="portal-card"><h3>Publikace</h3><div class="portal-fields">${select('status','Stav',p.status,productStatus)}${input('position','Pořadí',p.position,'type="number" min="0"')}</div></section><div class="portal-save-row"><button class="shop-button shop-primary" type="submit">Uložit produkt</button><p role="status" data-product-status>Bez neuložených změn.</p></div></form><aside class="portal-card portal-product-preview" aria-label="Náhled produktu"><button class="shop-button shop-primary" type="submit" form="merch-product-edit">Uložit změny produktu</button><p><small>NÁHLED · DOSUD NEULOŽENO</small></p><div data-product-preview></div><label>Náhled varianty<select data-preview-variant></select></label></aside></div>`;
 const form=host.querySelector('form'),status=host.querySelector('[data-product-status]');
 form.addEventListener('invalid',event=>{let detail=event.target.closest('details');while(detail){detail.open=true;detail=detail.parentElement.closest('details');}},true);
 const cards=()=>[...form.querySelectorAll('[data-variant]')];
 const alive=()=>!disposed&&isCurrent()&&host.isConnected;
 function readVariant(card){const value=name=>card.querySelector(`[name="${name}"]`).value;return {id:value('variantId'),color:value('color'),swatch:value('swatch'),image:value('image'),sizes:[...card.querySelectorAll('[name=size]:checked')].map(input=>input.value),priceMinor:value('price')===''?null:Math.round(Number(value('price'))*100),availability:value('availability')};}
 function preview(){
  const rows=cards(),variants=rows.map(readVariant),v=variants[previewIndex]||variants[0],card=rows[previewIndex]||rows[0];
  const photo=urls.get(card)||(v.image?imageSource(v):'');
  host.querySelector('[data-product-preview]').innerHTML=`${photo?`<img src="${esc(photo)}" alt="${esc(v.color)}">`:'<p>Vyber fotografii varianty.</p>'}<h3>${esc(form.elements.name.value||'Název produktu')}</h3><p>${esc(form.elements.type.value)} · ${esc(productGender[form.elements.gender.value])}</p><p>${esc(form.elements.description.value)}</p><b>${v.priceMinor===null?'Cena zatím není nastavena':money(v.priceMinor)}</b><p>${esc(v.color)} · ${esc(v.sizes.join(' / '))}</p>`;
  host.querySelector('[data-preview-variant]').innerHTML=variants.map((item,index)=>`<option value="${index}" ${index===previewIndex?'selected':''}>${esc(item.color||`Varianta ${index+1}`)}</option>`).join('');
  rows.forEach((row,index)=>{const item=variants[index],img=row.querySelector('[data-variant-thumb]'),src=urls.get(row)||(item.image?imageSource(item):'');img.hidden=!src;if(src)img.src=src;else img.removeAttribute('src');row.querySelector('[data-variant-title]').textContent=item.color||'Nová varianta';row.querySelector('[data-variant-summary]').textContent=item.sizes.join(' · ');});
 }
 function mark(){dirty=true;status.textContent='Rozepsané změny · neuloženo.';preview();}
 form.addEventListener('input',mark);
 form.addEventListener('change',event=>{
  const card=event.target.closest('[data-variant]');
  if(event.target.matches('[data-product-file]')){
   const file=event.target.files[0];if(!file)return;
   if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024){status.textContent='Vyber JPG, PNG nebo WebP do 8 MB.';event.target.value='';return;}
   if(urls.has(card))URL.revokeObjectURL(urls.get(card));localFiles.set(card,file);urls.set(card,URL.createObjectURL(file));previewIndex=cards().indexOf(card);card.querySelector('[data-photo-status]').textContent='Místní náhled · fotografie zatím nebyla nahrána.';
  }else if(event.target.type==='radio'){
   card.querySelector('[name=image]').value=event.target.value;clearFile(card);
  }
  mark();
 });
 function clearFile(card){if(urls.has(card))URL.revokeObjectURL(urls.get(card));urls.delete(card);localFiles.delete(card);card.querySelector('[data-product-file]').value='';}
 form.addEventListener('click',event=>{if(event.target.closest('[data-remove-photo]')){const card=event.target.closest('[data-variant]');clearFile(card);card.querySelector('[name=image]').value='';card.querySelectorAll('input[type=radio]').forEach(input=>input.checked=false);mark();}});
 host.querySelector('[data-preview-variant]').onchange=event=>{previewIndex=Number(event.target.value);preview();};
 host.querySelector('[data-add-variant]').onclick=()=>{const index=cards().length;form.querySelector('[data-variants]').insertAdjacentHTML('beforeend',variant({},index));cards()[index].open=true;cards()[index].querySelector('[name=color]').focus();mark();};
 form.onsubmit=async event=>{
  event.preventDefault();if(busy||!alive())return;
  const rows=cards(),missing=rows.find(card=>!readVariant(card).image&&!localFiles.has(card));
  if(missing){missing.open=true;missing.querySelector('[data-product-file]').focus();status.textContent='Každá varianta potřebuje fotografii.';return;}
  const values=Object.fromEntries(new FormData(form)),variants=rows.map(readVariant);
  busy=true;status.textContent='Ukládám…';const controls=[...host.querySelectorAll('input,select,textarea,button')];controls.forEach(input=>input.disabled=true);
  try{
   for(let index=0;index<rows.length;index++){const file=localFiles.get(rows[index]);if(file){const result=await upload(file);if(!alive())return;variants[index].image=result.image;rows[index].querySelector('[name=image]').value=result.image;clearFile(rows[index]);}}
   if(!alive())return;
   await save({id:values.id,name:values.name,type:values.type,category:values.category,description:values.description,gender:values.gender,status:values.status,position:Number(values.position),revision:p.revision,variants});
   if(alive()){dirty=false;onSaved();}
  }catch(error){if(alive())status.textContent=error.message;}
  finally{busy=false;if(alive())controls.forEach(input=>input.disabled=false);}
 };
 const beforeUnload=event=>{if(dirty||busy){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',beforeUnload);
 preview();
 return {allowLeave(){if(busy){status.textContent='Počkej na výsledek uložení.';return false;}return !dirty||confirm('Zahodit neuložené změny produktu?');},dispose(){disposed=true;urls.forEach(url=>URL.revokeObjectURL(url));window.removeEventListener('beforeunload',beforeUnload);}};
}
