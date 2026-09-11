import { apiRequest } from './api.js?v=20260911-request-confirm-r2';
import { adminState } from './state.js?v=20260911-request-confirm-r2';
import { confirmedFields, commandReceiptMatches } from './confirmed-state.js?v=20260911-request-confirm-r2';

const roots=new Map(),pending=new Map();
const deferred=new Map();
let renderObserver=()=>{};
export const adminRenderPending=()=>[...deferred].some(([root,job])=>root.isConnected&&job.context===context());
const context=()=>[uid(),adminState.sessionGeneration,adminState.selectedEventId,adminState.activeAdminView,adminState.selectedReservationId,adminState.memberId].join('|');
const prefix='e36.admin.safe.v1.';
const ttl=2*60*60*1000;
let storageAvailable=true;
const uid=()=>adminState.currentUser?.uid||'';
const notify=()=>window.dispatchEvent(new CustomEvent('admin:invalidate'));
const storageKey=(kind,key)=>`${prefix}${uid()}.${kind}.${key}`;
function read(kind,key){try{const entry=JSON.parse(sessionStorage.getItem(storageKey(kind,key))||'null');return entry&&entry.expires>Date.now()?entry:null}catch{storageAvailable=false;return null}}
function write(kind,key,value){try{if(value)sessionStorage.setItem(storageKey(kind,key),JSON.stringify({...value,expires:Date.now()+ttl}));else sessionStorage.removeItem(storageKey(kind,key))}catch{storageAvailable=false}}
function fieldKey(field){return (field.closest('[data-history-review]')?.dataset.historyReview||'')+':'+(field.name||Object.keys(field.dataset).filter(key=>!['baseRevision','dirty'].includes(key)).sort().join(':'))}
function values(root){if(root.matches('[data-dashboard-preferences]'))return{':configuration':root.elements.configuration.value};return Object.fromEntries([...root.querySelectorAll('input:not([type=file]),textarea,select')].filter(field=>fieldKey(field)).map(field=>[fieldKey(field),field.type==='checkbox'?field.checked:field.value]))}
function restore(root,delta){for(const field of root.querySelectorAll('input,textarea,select')){const key=fieldKey(field);if(Object.hasOwn(delta,key)){if(field.type==='checkbox')field.checked=delta[key]===true;else field.value=delta[key]}}}
function insertEditorMessage(root,label){const header=root.matches('article[data-reservation-id]')&&root.querySelector(':scope > header');if(header)header.append(label);else root.prepend(label)}
function status(root,text,state){if(!root?.isConnected)return;const panel=root.closest('.admin-reservation-drawer-panel'),top=panel?.scrollTop;root.dataset.operationState=state;let label=root.querySelector('[data-operation-status]');if(!label){label=document.createElement('p');label.dataset.operationStatus='';label.setAttribute('role','status');insertEditorMessage(root,label)}label.textContent=text;if(panel)panel.scrollTop=top}
function action(root,label,callback){const button=document.createElement('button');button.type='button';button.className='admin-button';button.dataset.recoveryAction='';button.textContent=label;button.addEventListener('click',callback);root.querySelector('[data-operation-status]')?.append(' ',button)}
function clearActions(root){root.querySelectorAll('[data-recovery-action]').forEach(button=>button.remove())}

// Discard only the DOM binding on context exit; pending operation recovery stays scoped in storage.
export function forgetAdminEditor(root){roots.delete(root);clearDeferred(root)}
function clearDeferred(root){deferred.delete(root);if(root){delete root.dataset.renderPending;root.querySelector('[data-render-status]')?.remove()}renderObserver()}
export function clearDeferredAdminRenders(){for(const root of deferred.keys())clearDeferred(root)}
export function flushAdminRenders(){
  for(const[root,job]of [...deferred]){
    if(!root.isConnected||job.context!==context()||adminState.denied){clearDeferred(root);continue}
    if(editorProtected(root))continue;
    clearDeferred(root);job.render();
  }
  bindCurrentEditors();
}
export const adminEditorDirty=root=>!!roots.get(root)?.dirty;

export function editorProtected(root,newRevision,resume){
  if(!root)return false;
  const panel=root.closest('.admin-reservation-drawer-panel'),top=panel?.scrollTop;
  const record=roots.get(root);
  if(record&&(record.dirty||root.dataset.localFile==='true'||root.contains(document.activeElement)||['saving','outcome_unknown','conflict'].includes(root.dataset.operationState))){
    if(newRevision!=null&&Number(newRevision)>record.revision&&root.dataset.newerRevision!==String(newRevision)){root.dataset.newerRevision=String(newRevision);root.dataset.newerData='true';if(!['saving','outcome_unknown','conflict'].includes(root.dataset.operationState))status(root,'Na serveru jsou novější data. Rozepsané hodnoty zůstaly zachovány.',root.dataset.operationState||'dirty');}
    if(resume&&(!deferred.has(root)||Number(newRevision||0)>=deferred.get(root).revision)){
      deferred.set(root,{context:context(),revision:Number(newRevision||0),render:resume});root.dataset.renderPending='true';
      let label=root.querySelector('[data-render-status]');if(!label){label=document.createElement('p');label.dataset.renderStatus='';label.setAttribute('role','status');insertEditorMessage(root,label)}
      label.textContent='Data načtena. Ovládací pole zůstávají chráněna; úplné zobrazení čeká na dokončení práce v editoru.';
      renderObserver();
    }
    if(panel)panel.scrollTop=top;
    return true;
  }
  return false;
}

function bind(root,key,revision,eventId){
  if(!root||root.inert)return;
  const old=roots.get(root);
  // Binding observes rendered inputs, not the latest fetched revision. A renderer
  // explicitly forgets this binding only when it has safely hydrated those inputs.
  if(old&&old.actor===uid()&&old.key===key)return;
  const record={key,actor:uid(),eventId:eventId||null,revision:Number(revision||0),base:values(root),dirty:false};roots.set(root,record);
  root.dataset.baseRevision=String(record.revision);
  const draft=read('draft',key),operation=read('operation',key);
  if(operation){pending.set(key,operation);showPending(root,record,operation);void reconcile(root,record,operation);return}
  if(draft){
    status(root,'K tomuto formuláři existuje místní koncept. Nebyl odeslán.', 'idle');
    action(root,'Obnovit koncept',()=>{restore(root,draft.delta);record.revision=draft.revision;record.dirty=true;root.dataset.newerRevision=String(revision??0);clearActions(root);
      status(root,draft.revision===Number(revision)?'Obnovený koncept · neuloženo.':'Koncept vychází ze starší revize. Porovnej změny; uložení nesmí přepsat novější data.',draft.revision===Number(revision)?'dirty':'conflict')});
    action(root,'Zahodit koncept',()=>{write('draft',key,null);status(root,'Koncept byl zahozen.','idle')});
  }else if(!storageAvailable)status(root,'Úložiště pro obnovu konceptu není dostupné. Nezavírej rozepsaný formulář.','idle');
}

export function bindCurrentEditors(){
  for(const[root]of roots)if(!root.isConnected)roots.delete(root);
  const event=adminState.events.find(item=>item.id===adminState.selectedEventId);
  bind(document.querySelector('[data-dashboard-preferences]:not([hidden])'),`preferences:${uid()}`,adminState.dashboardPreferenceRevision,null);
  bind(document.querySelector('[data-event-settings-form]'),`event:${event?.id}`,event?.revision,event?.id);
  bind(document.querySelector('[data-accommodation-create-form]'),`accommodation-create:${event?.id}`,event?.accommodationRevision,event?.id);
  for(const root of document.querySelectorAll('[data-accommodation-id]')){const item=adminState.accommodationItems.find(item=>item.id===root.dataset.accommodationId);if(item)bind(root,`accommodation:${item.id}`,item.revision,item.eventId)}
  for(const root of document.querySelectorAll('article[data-reservation-id]')){const item=adminState.reservationDetail?.id===root.dataset.reservationId?adminState.reservationDetail:adminState.reservationItems.find(item=>item.id===root.dataset.reservationId);if(item)bind(root,`reservation:${item.id}`,item.revision,item.eventId||event?.id)}
  for(const root of document.querySelectorAll('[data-gallery-id]')){const item=adminState.galleryItems.find(item=>item.id===root.dataset.galleryId);if(item)bind(root,`gallery:${item.id}`,item.revision,null)}
  for(const root of document.querySelectorAll('[data-history-id]')){const item=adminState.historyClaims.find(item=>item.id===root.dataset.historyId);if(item)bind(root,`history:${item.id}`,item.revision,item.eventId)}
}

function recordFor(root){bindCurrentEditors();for(let node=root;node;node=node.parentElement)if(roots.has(node))return{root:node,record:roots.get(node)};return null}
function capture(event){const bound=recordFor(event.target);if(!bound||event.target.type==='file')return;
  const {root,record}=bound,live=values(root),delta=Object.fromEntries(Object.entries(live).filter(([key,value])=>value!==record.base[key]));
  record.dirty=Object.keys(delta).length>0;
  write('draft',record.key,record.dirty?{revision:record.revision,eventId:record.eventId,delta}:null);
  if(!['saving','outcome_unknown','conflict'].includes(root.dataset.operationState))status(root,record.dirty?(storageAvailable?'Rozepsané změny · neuloženo.':'Rozepsané změny · úložiště obnovy není dostupné. Nezavírej formulář.'):'',record.dirty?'dirty':'idle');
  queueMicrotask(flushAdminRenders);
}

export function allowAdminNavigation(){
  const edited=[...roots].filter(([root,record])=>root.isConnected&&(record.dirty||root.dataset.localFile==='true'));
  if(!edited.length)return true;
  if(!window.confirm('Zahodit rozepsané změny a opustit formulář? Již odeslaná operace může být dokončena; její výsledek zůstane dohledatelný.'))return false;
  for(const[root,record]of edited){restore(root,record.base);record.dirty=false;write('draft',record.key,null);status(root,'','idle')}
  window.dispatchEvent(new CustomEvent('admin:discardfiles'));
  queueMicrotask(flushAdminRenders);
  return true;
}

function showPending(root,record,operation){
  status(root,'Výsledek uložení zatím nelze ověřit.','outcome_unknown');
  action(root,'Ověřit výsledek',()=>void reconcile(root,record,operation));
  action(root,'Výslovně opakovat stejnou operaci',()=>void retryOperation(root,record,operation));
}
function confirmed(root,record,receipt,operation){
  if(pending.get(record.key)?.id!==operation.id)return false;
  pending.delete(record.key);write('operation',record.key,null);
  if(roots.get(root)===record){
    // Explicit commands such as "mark fully paid" may send a value other than
    // the current control. Apply it only if that control has not changed since send.
    const live=values(root),replacements={};
    for(const[key,value]of Object.entries(operation.submitted||{}))if(operation.captured&&live[key]===operation.captured[key]&&value!==operation.captured[key])replacements[key]=value;
    restore(root,replacements);
    const next=confirmedFields(record.base,values(root),operation.submitted||{});
    record.base=next.base;record.dirty=Object.keys(next.delta).length>0;
    // An own CAS-confirmed write can advance its own baseline, not a foreign conflict.
    const conflict=root.dataset.operationState==='conflict'||Number(root.dataset.newerRevision||0)>Number(receipt.revision);
    if(!conflict)record.revision=receipt.revision;
    root.dataset.baseRevision=String(record.revision);
    write('draft',record.key,record.dirty?{revision:record.revision,eventId:record.eventId,delta:next.delta}:null);
    status(root,record.dirty?'Operace potvrzena serverem · další rozepsané změny nejsou uloženy.':'Uloženo · potvrzeno serverem.',conflict?'conflict':record.dirty?'dirty':'confirmed');
  }
  return true;
}
function validReceipt(receipt,operation){
  return commandReceiptMatches(receipt,operation);
}
async function reconcile(root,record,operation){
  if(uid()!==operation.actor)return;
  try{const result=await apiRequest(`/api/admin/operations/${encodeURIComponent(operation.id)}`);
    if(uid()!==operation.actor||roots.get(root)!==record)return;
    if(validReceipt(result.operation,operation)){if(confirmed(root,record,result.operation,operation)){notify();queueMicrotask(flushAdminRenders)}}else showPending(root,record,operation);
  }catch{if(uid()===operation.actor&&roots.get(root)===record)showPending(root,record,operation)}
}
async function retryOperation(root,record,operation){
  if(uid()!==operation.actor||record.eventId!==operation.eventId)return;
  if(!window.confirm('Původní požadavek mohl dorazit. Opakovat přesně stejnou operaci se stejným ID?'))return;
  try{await send(root,record,operation)}catch{/* status already distinguishes conflict from unknown */}
}
async function send(root,record,operation,onConfirmed){
  const sentContext=context();
  let accepted=false;
  status(root,'Ukládám…','saving');
  try{
    const payload=await apiRequest(operation.path,{method:operation.method,body:operation.body,headers:{'If-Match':String(operation.revision),'Idempotency-Key':operation.id}});
    if(!validReceipt(payload.operation,operation))throw new Error('Výsledek uložení zatím nelze ověřit.');
    accepted=confirmed(root,record,payload.operation,operation);
    // A closed/switched editor is reconciled by its next ordinary read. Do not
    // start a mutation refresh in an unrelated context (or a departing document).
    if(accepted&&context()===sentContext){try{onConfirmed?.(payload)}finally{notify();queueMicrotask(flushAdminRenders)}}return payload;
  }catch(error){
    if(accepted)throw error; // A rendering error is not an unknown write outcome.
    if(uid()!==operation.actor||roots.get(root)!==record)throw error;
    if([400,404,409,412,413,428].includes(error.status)){
      pending.delete(record.key);write('operation',record.key,null);
      status(root,error.message,[409,412].includes(error.status)?'conflict':'rejected');
      if([409,412].includes(error.status))action(root,'Zahodit koncept a načíst aktuální záznam',()=>{if(!window.confirm('Zahodit místní změny a načíst aktuální hodnoty?'))return;record.dirty=false;write('draft',record.key,null);status(root,'Načítám aktuální záznam…','idle');notify()});
    }else if(![401,403].includes(error.status)){showPending(root,record,operation);error.message='Výsledek uložení zatím nelze ověřit.'}
    throw error;
  }
}
// Preserve untouched nullable/unknown settings: submit only fields actually edited.
export function changedFields(root,body){
  const bound=recordFor(root);if(!bound)return body;
  const current=values(bound.root),base=bound.record.base;
  return Object.fromEntries(Object.entries(body).filter(([key])=>current[':'+key]!==base[':'+key]));
}
export async function adminCommand(path,{method='PATCH',body,editor,submitted,onConfirmed}){
  const bound=recordFor(editor);if(!bound)throw new Error('Obnov Admin před uložením záznamu.');
  const{root,record}=bound;if(record.actor!==uid())throw new Error('Přihlášení se změnilo.');
  const prior=pending.get(record.key)||read('operation',record.key);
  if(prior){showPending(root,record,prior);throw new Error('Nejdřív ověř výsledek předchozí operace.')}
  const live=values(root);
  const sent=submitted||Object.fromEntries(Object.keys(body||{}).filter(key=>Object.hasOwn(live,':'+key)).map(key=>[':'+key,live[':'+key]]));
  const operation={id:crypto.randomUUID(),actor:uid(),eventId:record.eventId,path,method,body:structuredClone(body),revision:record.revision,submitted:sent,captured:live};
  pending.set(record.key,operation);write('operation',record.key,operation);
  return send(root,record,operation,onConfirmed);
}

export function clearAdminPrivateEdits(){
  pending.clear();roots.clear();clearDeferredAdminRenders();
  try{for(const key of Object.keys(sessionStorage))if(key.startsWith(prefix))sessionStorage.removeItem(key)}catch{storageAvailable=false}
}
export function initializeAdminEditors({onRenderState=()=>{}}={}){
  renderObserver=onRenderState;
  // Capture the baseline BEFORE a native control changes (not in its input callback).
  document.addEventListener('focusin',bindCurrentEditors,true);
  document.addEventListener('pointerdown',bindCurrentEditors,true);
  document.addEventListener('beforeinput',bindCurrentEditors,true);
  document.addEventListener('input',capture);document.addEventListener('change',capture);
  document.addEventListener('click',()=>queueMicrotask(bindCurrentEditors));
  document.addEventListener('focusout',()=>queueMicrotask(flushAdminRenders));
  window.addEventListener('admin:beforenavigation',clearDeferredAdminRenders);
  window.addEventListener('beforeunload',event=>{if([...roots.values()].some(record=>record.dirty)){event.preventDefault();event.returnValue=''}});
}
