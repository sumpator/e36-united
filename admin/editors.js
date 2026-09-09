import { apiRequest } from './api.js?v=20260909-admin-command';
import { adminState } from './state.js?v=20260909-admin-command';

const roots=new Map(),pending=new Map();
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
function status(root,text,state){if(!root?.isConnected)return;root.dataset.operationState=state;let label=root.querySelector(':scope > [data-operation-status]');if(!label){label=document.createElement('p');label.dataset.operationStatus='';label.setAttribute('role','status');root.prepend(label)}label.textContent=text}
function action(root,label,callback){const button=document.createElement('button');button.type='button';button.className='admin-button';button.dataset.recoveryAction='';button.textContent=label;button.addEventListener('click',callback);root.querySelector('[data-operation-status]')?.append(' ',button)}
function clearActions(root){root.querySelectorAll('[data-recovery-action]').forEach(button=>button.remove())}

// Discard only the DOM binding on context exit; pending operation recovery stays scoped in storage.
export function forgetAdminEditor(root){roots.delete(root)}

export function editorProtected(root,newRevision){
  if(!root)return false;
  const record=roots.get(root);
  if(record&&(record.dirty||root.dataset.localFile==='true'||root.contains(document.activeElement)||['saving','outcome_unknown','conflict'].includes(root.dataset.operationState))){
    if(newRevision!=null&&Number(newRevision)>record.revision&&root.dataset.newerRevision!==String(newRevision)){root.dataset.newerRevision=String(newRevision);root.dataset.newerData='true';if(!['saving','outcome_unknown'].includes(root.dataset.operationState))status(root,'Na serveru jsou novější data. Rozepsané hodnoty zůstaly zachovány.',root.dataset.operationState||'dirty');}
    return true;
  }
  return false;
}

function bind(root,key,revision,eventId){
  if(!root||root.inert)return;
  const old=roots.get(root);
  if(old&&old.actor===uid()&&old.key===key){if(editorProtected(root,revision))return;if(old.revision===Number(revision||0))return}
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
  for(const root of document.querySelectorAll('[data-accommodation-id]')){const item=adminState.accommodationItems.find(item=>item.id===root.dataset.accommodationId);bind(root,`accommodation:${item?.id}`,item?.revision,item?.eventId)}
  for(const root of document.querySelectorAll('article[data-reservation-id]')){const item=adminState.reservationDetail?.id===root.dataset.reservationId?adminState.reservationDetail:adminState.reservationItems.find(item=>item.id===root.dataset.reservationId);bind(root,`reservation:${item?.id}`,item?.revision,item?.eventId||event?.id)}
  for(const root of document.querySelectorAll('[data-gallery-id]')){const item=adminState.galleryItems.find(item=>item.id===root.dataset.galleryId);bind(root,`gallery:${item?.id}`,item?.revision,null)}
  for(const root of document.querySelectorAll('[data-history-id]')){const item=adminState.historyClaims.find(item=>item.id===root.dataset.historyId);bind(root,`history:${item?.id}`,item?.revision,item?.eventId)}
}

function recordFor(root){bindCurrentEditors();for(let node=root;node;node=node.parentElement)if(roots.has(node))return{root:node,record:roots.get(node)};return null}
function capture(event){const bound=recordFor(event.target);if(!bound||event.target.type==='file')return;
  const {root,record}=bound,live=values(root),delta=Object.fromEntries(Object.entries(live).filter(([key,value])=>value!==record.base[key]));
  record.dirty=Object.keys(delta).length>0;
  write('draft',record.key,record.dirty?{revision:record.revision,eventId:record.eventId,delta}:null);
  if(!['saving','outcome_unknown'].includes(root.dataset.operationState))status(root,record.dirty?(storageAvailable?'Rozepsané změny · neuloženo.':'Rozepsané změny · úložiště obnovy není dostupné. Nezavírej formulář.'):'',record.dirty?'dirty':'idle');
}

export function allowAdminNavigation(){
  const edited=[...roots].filter(([root,record])=>root.isConnected&&(record.dirty||root.dataset.localFile==='true'));
  if(!edited.length)return true;
  if(!window.confirm('Zahodit rozepsané změny a opustit formulář? Již odeslaná operace může být dokončena; její výsledek zůstane dohledatelný.'))return false;
  for(const[root,record]of edited){restore(root,record.base);record.dirty=false;write('draft',record.key,null);status(root,'','idle')}
  window.dispatchEvent(new CustomEvent('admin:discardfiles'));
  return true;
}

function showPending(root,record,operation){
  status(root,'Výsledek uložení zatím nelze ověřit.','outcome_unknown');
  action(root,'Ověřit výsledek',()=>void reconcile(root,record,operation));
  action(root,'Výslovně opakovat stejnou operaci',()=>void retryOperation(root,record,operation));
}
function confirmed(root,record,operation){
  pending.delete(record.key);write('operation',record.key,null);write('draft',record.key,null);
  record.dirty=false;if(operation?.revision!=null)record.revision=operation.revision;
  if(roots.get(root)===record){record.base=values(root);status(root,'Uloženo · potvrzeno serverem.','confirmed');}notify();
}
async function reconcile(root,record,operation){
  if(uid()!==operation.actor)return;
  try{const result=await apiRequest(`/api/admin/operations/${encodeURIComponent(operation.id)}`);
    if(uid()!==operation.actor||roots.get(root)!==record)return;
    if(result.operation?.state==='confirmed')confirmed(root,record,result.operation);else showPending(root,record,operation);
  }catch{if(uid()===operation.actor&&roots.get(root)===record)showPending(root,record,operation)}
}
async function retryOperation(root,record,operation){
  if(uid()!==operation.actor||record.eventId!==operation.eventId)return;
  if(!window.confirm('Původní požadavek mohl dorazit. Opakovat přesně stejnou operaci se stejným ID?'))return;
  try{await send(root,record,operation)}catch{/* status already distinguishes conflict from unknown */}
}
async function send(root,record,operation){
  status(root,'Ukládám…','saving');
  try{
    const payload=await apiRequest(operation.path,{method:operation.method,body:operation.body,headers:{'If-Match':String(operation.revision),'Idempotency-Key':operation.id}});
    if(payload.operation?.state!=='confirmed')throw new Error('Výsledek uložení zatím nelze ověřit.');
    confirmed(root,record,payload.operation);return payload;
  }catch(error){
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
export async function adminCommand(path,{method='PATCH',body,editor}){
  const bound=recordFor(editor);if(!bound)throw new Error('Obnov Admin před uložením záznamu.');
  const{root,record}=bound;if(record.actor!==uid())throw new Error('Přihlášení se změnilo.');
  const prior=pending.get(record.key)||read('operation',record.key);
  if(prior){showPending(root,record,prior);throw new Error('Nejdřív ověř výsledek předchozí operace.')}
  const operation={id:crypto.randomUUID(),actor:uid(),eventId:record.eventId,path,method,body,revision:record.revision};
  pending.set(record.key,operation);write('operation',record.key,operation);
  return send(root,record,operation);
}

export function clearAdminPrivateEdits(){
  pending.clear();roots.clear();
  try{for(const key of Object.keys(sessionStorage))if(key.startsWith(prefix))sessionStorage.removeItem(key)}catch{storageAvailable=false}
}
export function initializeAdminEditors(){
  // Capture the baseline BEFORE a native control changes (not in its input callback).
  document.addEventListener('focusin',bindCurrentEditors,true);
  document.addEventListener('pointerdown',bindCurrentEditors,true);
  document.addEventListener('beforeinput',bindCurrentEditors,true);
  document.addEventListener('input',capture);document.addEventListener('change',capture);
  document.addEventListener('click',()=>queueMicrotask(bindCurrentEditors));
  window.addEventListener('beforeunload',event=>{if([...roots.values()].some(record=>record.dirty)){event.preventDefault();event.returnValue=''}});
}
