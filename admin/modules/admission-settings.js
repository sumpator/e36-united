import { apiRequest } from '../api.js?v=20260930-arrivals2';
import { adminState } from '../state.js?v=20260930-arrivals2';
import { escapeHtml as esc } from '../ui.js?v=20260924-merch2';

export async function renderAdmissionSettings(eventId) {
  const host=document.querySelector('[data-admission-settings]');
  if(!host||host.dataset.eventId===eventId)return;
  host.dataset.eventId=eventId;host.textContent='Načítám vstupné…';
  const context=adminState.currentUser;
  try{
    const path='/api/admin/events/'+encodeURIComponent(eventId)+'/arrivals',data=await apiRequest(path);
    if(host.dataset.eventId!==eventId||adminState.currentUser!==context)return;
    const e=data.event;
    host.innerHTML=`<h3>Vstupné · ${esc(e.title)}</h3><p>Za auto, nikoli za osobu. Prázdná částka není nula. Uložené ceny rezervací se nemění.</p><form><div class="gate-columns"><label>Registrovaní (Kč)<input name="registered" type="number" min="0" step="1" value="${e.admission_registered_czk??''}"></label><label>Na místě (Kč)<input name="onsite" type="number" min="0" step="1" value="${e.admission_onsite_czk??''}"></label></div><button type="submit">Uložit vstupné</button><button type="button" data-admission-refresh>Obnovit sazby</button><p role="status"></p></form>`;
    let op=null,busy=false;host.querySelector('[data-admission-refresh]').addEventListener('click',()=>{if(busy||op)return;host.dataset.eventId='';void renderAdmissionSettings(eventId)});
    host.querySelector('form').addEventListener('submit',async ev=>{
      ev.preventDefault();if(busy||adminState.currentUser!==context||adminState.selectedEventId!==eventId)return;
      const form=ev.currentTarget,button=form.querySelector('button'),status=form.querySelector('[role=status]');
      if(!op){const fd=new FormData(form);op={key:crypto.randomUUID(),revision:data.revision,body:Object.fromEntries(['registered','onsite'].map(k=>[k,fd.get(k)===''?null:Number(fd.get(k))]))}}
      busy=true;button.disabled=true;form.querySelectorAll('input').forEach(i=>i.disabled=true);
      try{await apiRequest(path+'/rates',{method:'PUT',body:op.body,headers:{'Idempotency-Key':op.key,'If-Match':String(op.revision)}});host.dataset.eventId='';await renderAdmissionSettings(eventId)}
      catch(error){status.textContent=error.message+(error.status<500?' Obnov nastavení a porovnej změny.':' Opakování použije stejný požadavek.');if(error.status<500){op=null;form.querySelectorAll('input').forEach(i=>i.disabled=false)}}
      finally{busy=false;button.disabled=false}
    });
  }catch(error){host.textContent=error.message;host.dataset.eventId=''}
}
