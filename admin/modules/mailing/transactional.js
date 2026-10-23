import {apiRequest} from '../../api.js?v=20260930-arrivals2';
import {adminState} from '../../state.js?v=20260930-arrivals2';
import {$,escapeHtml,toast} from '../../ui.js?v=20260924-merch2';
let generation=0,page=1,initialized=false;
const esc=escapeHtml,base='/api/admin/mailing/transactional';
const labels={skipped:'Vynecháno před první aktivací',queued:'Čeká ve frontě',sending:'Zpracovává se',sent:'Přijato SMTP2GO',delivered:'Doručeno',failed:'Jednoznačné selhání',uncertain:'Nejasný výsledek — ověř poskytovatele',superseded:'Nahrazeno aktuálním stavem',blocked:'Zablokovaná adresa'};
function filters(){const form=$('[data-transactional-filters]');return new URLSearchParams({page,kind:form.elements.kind.value,status:form.elements.status.value,entity:form.elements.entity.value})}
export function resetTransactionalEmails(){generation++;page=1;const list=$('[data-transactional-list]');if(list)list.replaceChildren();const frame=$('[data-transactional-preview]');if(frame)frame.removeAttribute('srcdoc');const details=$('[data-transactional-detail]');if(details)details.replaceChildren()}
export async function loadTransactionalEmails({signal,isCurrent=()=>true,resetPage=false}={}){
 if(resetPage)page=1;const g=++generation,uid=adminState.currentUser?.uid;
 const [history,templates]=await Promise.all([apiRequest(base+'?'+filters(),{signal}),apiRequest(base+'/templates',{signal})]);
 if(g!==generation||uid!==adminState.currentUser?.uid||!isCurrent())return;
 const transport=history.transport;
 $('[data-transactional-transport]').textContent=transport?.enabled?'Odesílání je zapnuté. Přijatou zprávu již nelze odvolat.':transport?.phase==='not_activated'?'Odesílání je vypnuté — dosud neaktivováno. Starší události se automaticky neodešlou.':transport?.phase==='paused'?'Odesílání je pozastavené. Čekající zprávy zůstávají ve frontě a při obnovení se ověří jejich aktuálnost.':'Odesílání je vypnuté — serverová konfigurace není dostupná nebo platná.';
 const select=$('[data-transactional-filters] [name=kind]'),selected=select.value;
 select.innerHTML='<option value="">Všechny typy</option>'+templates.templates.map(t=>`<option value="${esc(t.kind)}">${esc(t.title)}</option>`).join('');select.value=selected;
 $('[data-transactional-types]').innerHTML=templates.templates.map(t=>`<details><summary>${esc(t.title)}${t.available?'':' · čeká na Firebase oprávnění'}</summary><p>${esc(t.trigger)}</p><button type="button" data-transactional-template="${esc(t.kind)}">Zobrazit náhled</button></details>`).join('');
 $('[data-transactional-list]').innerHTML=history.messages.length?history.messages.map(m=>`<article class="admin-panel" style="min-width:0;overflow-wrap:anywhere"><strong>${esc(m.subject)}</strong><p>${esc(m.recipient)} · ${esc(m.statusLabel)}</p><small>${esc(m.createdAt)} · ${esc(m.entityType)} / ${esc(m.entityId)}</small><p><button type="button" data-transactional-message="${esc(m.id)}">Detail zprávy</button></p></article>`).join(''):'<p>Tomuto filtru neodpovídá žádná provozní zpráva.</p>';
 $('[data-transactional-page]').textContent=`Strana ${page} · ${history.total} zpráv`; $('[data-transactional-next]').disabled=!history.hasMore;$('[data-transactional-prev]').disabled=page===1;
}
async function detail(id){
 const g=++generation,uid=adminState.currentUser?.uid,payload=await apiRequest(base+'/'+encodeURIComponent(id));if(g!==generation||uid!==adminState.currentUser?.uid)return;
 const m=payload.message,host=$('[data-transactional-detail]');host.dataset.messageId=id;
 host.innerHTML=`<h3>${esc(m.subject)}</h3><p>${esc(m.recipient)} · ${esc(m.statusLabel)}</p><p>${esc(m.entityType)} / ${esc(m.entityId)} · ${esc(m.createdAt)}</p>${m.error?`<p role="alert">${esc(m.errorMessage||m.error)} — technický detail neobsahuje obsah poskytovatelské odpovědi ani přístupové údaje.</p>`:''}<p>${m.acceptedAt?'Přijato poskytovatelem: '+esc(m.acceptedAt):''}${m.deliveredAt?'<br>Doručeno: '+esc(m.deliveredAt):''}</p>${['failed','skipped','uncertain'].includes(m.status)?`<form data-transactional-action><label>Důvod operace<input name="reason" required minlength="10" maxlength="1000"></label>${m.status==='uncertain'?'<p>Neopakuj odeslání naslepo. Nejprve ověř konkrétní zprávu v SMTP2GO. Přijetí není doručení ani přečtení.</p><label>Výsledek kontroly poskytovatele<input name="evidence" required minlength="10" maxlength="1000"></label><label><input type="checkbox" name="verified" required> Ověřil jsem, že poskytovatel zprávu nepřijal</label><button type="submit" data-action="resolve">Zapsat ověření neodeslání</button>':'<button type="submit" data-action="retry">Výslovně zařadit nové odeslání</button>'}</form>`:''}`;
 $('[data-transactional-preview]').srcdoc=payload.preview?.html||'<p>Obsah zprávy už není aktuální nebo dostupný. Zpráva nebude automaticky odeslána.</p>';
}
export function initializeTransactionalEmails(){
 if(initialized)return;initialized=true;
 $('[data-transactional-filters] [name=status]').innerHTML='<option value="">Všechny stavy</option>'+Object.entries(labels).map(([key,label])=>`<option value="${key}">${esc(label)}</option>`).join('');
 document.addEventListener('click',event=>{const template=event.target.closest('[data-transactional-template]'),message=event.target.closest('[data-transactional-message]'),next=event.target.closest('[data-transactional-next]'),prev=event.target.closest('[data-transactional-prev]');
  if(template){const g=++generation;apiRequest(base+'/templates/'+template.dataset.transactionalTemplate).then(p=>{if(g===generation)$('[data-transactional-preview]').srcdoc=p.preview.html}).catch(e=>toast(e.message))}
  if(message)detail(message.dataset.transactionalMessage).catch(e=>toast(e.message));
  if(next||prev){page=Math.max(1,page+(next?1:-1));loadTransactionalEmails().catch(e=>toast(e.message))}
 });
 document.addEventListener('submit',event=>{
  if(event.target.matches('[data-transactional-filters]')){event.preventDefault();loadTransactionalEmails({resetPage:true}).catch(e=>toast(e.message))}
  if(!event.target.matches('[data-transactional-action]'))return;event.preventDefault();
  const form=event.target,action=event.submitter.dataset.action,id=$('[data-transactional-detail]').dataset.messageId;
  if(!confirm(action==='retry'?'Zařadit nové odeslání? Obsah se znovu ověří podle aktuálního stavu.':'Potvrdit doložené neodeslání? Tato operace sama další e-mail neodešle.'))return;
  const data=new FormData(form);event.submitter.disabled=true;
  apiRequest(base+'/'+id+'/'+action,{method:'POST',body:{reason:data.get('reason'),evidence:data.get('evidence'),confirmedNotSent:data.get('verified')==='on'}}).then(async()=>{await loadTransactionalEmails();await detail(id)}).catch(e=>{toast(e.message);event.submitter.disabled=false});
 });
}
