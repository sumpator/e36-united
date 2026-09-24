import {esc,addressFields,readAddress} from '../../merch/order-view.js?v=20260924-workspace1';

// The default delivery address is independent of identity and order snapshots.
export function renderMerchAddress(host,{address,user,request,isCurrent}){
 let saved=address,editing=false;
 function summary(message=''){
  editing=false;
  host.innerHTML=`<h3>Výchozí dodací údaje</h3>${saved?`<address class="portal-address-summary">${esc(saved.name)}<br>${esc(saved.street)}<br>${esc(saved.postalCode)} ${esc(saved.city)}<br>${esc(saved.email)} · ${esc(saved.phone)}</address>`:'<p>Ulož si údaje pro příští objednávku.</p>'}<button class="shop-button" type="button" data-address-edit>${saved?'Upravit':'Doplnit údaje'}</button><p role="status">${esc(message)}</p>`;
  host.querySelector('[data-address-edit]').onclick=edit;
 }
 function edit(){
  editing=true;
  host.innerHTML=`<h3>Výchozí dodací údaje</h3><form novalidate><div class="portal-fields">${addressFields(saved||{name:user.displayName,email:user.email})}</div><p>Doručovací e-mail nemění přihlašovací údaje. Starší objednávky zůstanou beze změny.</p><div class="portal-save-row"><button class="shop-button shop-primary" type="submit">Uložit dodací údaje</button><button class="shop-button" type="button" data-address-cancel>Zrušit</button></div><p role="status"></p></form>`;
  const form=host.querySelector('form');
  for(const name of ['phone','street','city','postalCode'])form.elements.namedItem(name).required=true;
  form.elements.postalCode.pattern='[0-9]{3} ?[0-9]{2}';
  form.elements.phone.type='tel';
  form.querySelector('[name=name]').focus();
  form.querySelector('[data-address-cancel]').onclick=()=>{summary();host.querySelector('[data-address-edit]').focus();};
  form.onsubmit=async event=>{
   event.preventDefault();if(!isCurrent())return;
   form.querySelectorAll('.portal-error').forEach(node=>node.remove());
   let invalid=null;
   for(const input of form.querySelectorAll('input')){
    input.removeAttribute('aria-invalid');input.removeAttribute('aria-describedby');
    if(input.validity.valid)continue;
    input.setAttribute('aria-invalid','true');const error=document.createElement('small');error.className='portal-error';error.id='address-error-'+input.name;error.textContent=input.validationMessage;input.setAttribute('aria-describedby',error.id);input.after(error);invalid||=input;
   }
   if(invalid){invalid.focus();return;}
   const next=readAddress(form);form.querySelectorAll('button').forEach(button=>button.disabled=true);
   try{await request('/api/merch/address',{method:'PUT',body:next});if(isCurrent()){saved=next;summary('Dodací údaje byly uloženy. Starší objednávky se nemění.');host.querySelector('[data-address-edit]').focus();}}
   catch(error){if(isCurrent())form.querySelector('[role=status]').textContent=error.message;}
   finally{if(isCurrent()&&editing)form.querySelectorAll('button').forEach(button=>button.disabled=false);}
  };
 }
 summary();
}
