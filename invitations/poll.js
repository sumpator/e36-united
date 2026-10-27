import {portalConfig} from '../firebase-config.js?v=20260924-merch2';

const params=new URLSearchParams(location.hash.slice(1));
const poll=params.get('poll')||'darts-20261027',token=params.get('token')||'',linkedAnswer=params.get('answer');
const publicPreview=!params.has('token');
const buttons=[...document.querySelectorAll('[data-answer]')],beer=document.querySelector('[data-beer]'),range=document.querySelector('input[type=range]'),slider=document.querySelector('[data-slider]'),output=document.querySelector('[data-score]'),status=document.querySelector('[data-status]'),retry=document.querySelector('[data-retry]'),web=document.querySelector('[data-web]');
let stored=null,desired=null,inFlight=false,failed=false,readFailed=false,initialConsidered=false,disposed=false,previewScore=null,editingRange=false,keyboardRange=false;
const labels={yes:'ANO',no:'NE',maybe:'MOŽNÁ'};
const endpoint=(portalConfig.apiBaseUrl||'https://api.e36united.cz')+'/api/private-polls/'+encodeURIComponent(poll)+'/response';
function message(text,error=false,screenReaderOnly=false){status.textContent=text;status.dataset.state=error?'error':'normal';status.classList.toggle('sr-only',screenReaderOnly)}
function render(){
 const current=desired||stored?.response,answer=current?.answer;
 const confirmed=Boolean(stored&&!desired&&!inFlight&&!failed&&!editingRange);
 for(const b of buttons){const selected=answer===b.dataset.answer;b.disabled=!stored||stored.poll.closed;b.setAttribute('aria-pressed',String(selected));b.toggleAttribute('data-confirmed',selected&&confirmed);b.toggleAttribute('data-pending',selected&&!confirmed);b.setAttribute('aria-description',selected?(confirmed?'Odpověď potvrzena serverem.':'Výběr ještě není potvrzen serverem.'):'')}
 document.querySelector('.answers').dataset.saveState=failed?'error':confirmed?'confirmed':desired||inFlight||editingRange?'pending':'empty';
 beer.hidden=answer!=='yes'&&!publicPreview;range.disabled=!stored||stored.poll.closed;
 const score=editingRange?previewScore:current?.score??null;
 if(!editingRange)range.value=score??0;
 slider.style.setProperty('--position',(score??0)*10+'%');output.textContent=score===null?'Vyber 0–10':score+' / 10';output.toggleAttribute('data-empty',score===null);
 range.setAttribute('aria-valuetext',score===null?'Hodnotu zatím vyber':score+' z 10');
 output.toggleAttribute('data-confirmed',confirmed&&score!==null);
 web.hidden=Boolean(desired||inFlight||failed||editingRange||!answer||(answer==='yes'&&current.score===null));
 retry.hidden=!failed&&!readFailed;
}
function savedMessage(){const r=stored.response;message(stored.poll.closed?'Anketa je uzavřená.':!r.answer?'Vyber ANO, NE nebo MOŽNÁ.':r.answer==='yes'?(r.score===null?'Uloženo: ANO. Vyber ještě hodnotu 0–10.':'Uloženo: '+r.score+'/10'):'Uloženo: '+labels[r.answer]+'.',false,Boolean(r.answer&&!stored.poll.closed))}
async function request(method,body){
 const response=await fetch(endpoint,{method,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();if(!response.ok){const error=new Error(data.error||'request_failed');error.status=response.status;error.data=data;throw error}return data;
}
async function load(){
 if(disposed)return;readFailed=false;message('Načítám pozvánku…');
 try{stored=await request('GET');if(disposed)return;savedMessage();render();considerInitial()}
 catch(error){if(disposed)return;readFailed=error.status!==404;message(error.status===404?'Tento osobní odkaz není platný.':'Pozvánku se nepodařilo načíst. Zkus to znovu.',true);render()}
}
function considerInitial(){
 if(initialConsidered||!stored||document.visibilityState!=='visible'||!document.hasFocus()||document.prerendering)return;
 initialConsidered=true;
 // A link's choice is a first-answer hint only, never a command to replace saved data.
 if(stored.response.version===0&&!stored.poll.closed&&labels[linkedAnswer])choose(linkedAnswer,null,true);
}
function choose(answer,score,initial=false){
 if(!stored||stored.poll.closed||disposed)return;
 editingRange=false;desired={answer,score,operationId:crypto.randomUUID(),initial};failed=false;message('Ukládám…');render();pump();
}
async function pump(){
 if(inFlight||failed||!desired||disposed)return;
 inFlight=true;const write=desired;
 try{
  const data=await request('POST',{answer:write.answer,score:write.score,operationId:write.operationId,expectedVersion:stored.response.version});
  if(disposed)return;
  if(data.response.version>=stored.response.version)stored=data;
  if(desired?.operationId===write.operationId){desired=null;if(!editingRange)savedMessage()}
 }catch(error){
  if(disposed)return;
  if(error.status===409&&error.data.response){
   stored={...error.data,ok:true};
   if(write.initial&&desired?.operationId===write.operationId){desired=null;message('Zobrazena již uložená odpověď.',false,true);}
   else {failed=true;if(desired)desired={...desired,operationId:crypto.randomUUID()};message('Odpověď se mezitím změnila. Svůj výběr můžeš uložit znovu.',true)}
  }else{failed=true;message('Neuloženo. Výběr zůstává, zkus uložení znovu.',true)}
 }finally{inFlight=false;if(!disposed){render();if(desired&&!failed)pump()}}
}
for(const button of buttons)button.addEventListener('click',()=>{
 initialConsidered=true;const answer=button.dataset.answer,current=desired||stored.response;
 choose(answer,answer==='yes'&&current.answer==='yes'?current.score:null);
});
function preview(){editingRange=true;previewScore=Number(range.value);message('Vybráno: '+previewScore+'/10. Uložím po dokončení.');render()}
function commitRange(){
 if(!stored||beer.hidden||range.disabled||disposed)return;
 const value=Number(range.value),current=desired||stored.response;editingRange=false;
 if(current.answer==='yes'&&current.score===value){if(!desired)savedMessage();render();return}
 choose('yes',value);
}
range.addEventListener('input',preview);
range.addEventListener('change',()=>{if(!keyboardRange)commitRange()});
range.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key))keyboardRange=true});
// Explicitly choosing 0 is valid even if the initial visual position was already 0.
range.addEventListener('pointerup',()=>queueMicrotask(commitRange));
range.addEventListener('keyup',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key)){keyboardRange=false;commitRange()}});
retry.addEventListener('click',()=>{if(readFailed)return load();failed=false;message('Ukládám…');render();pump()});
document.addEventListener('visibilitychange',considerInitial);window.addEventListener('focus',considerInitial);window.addEventListener('pageshow',considerInitial);
window.addEventListener('pagehide',()=>{disposed=true});
// Opening a different personal fragment in the same tab starts a fresh capability context.
window.addEventListener('hashchange',()=>{disposed=true;location.reload()});
window.addEventListener('pageshow',event=>{if(event.persisted){disposed=false;desired=null;failed=false;load()}});
if(publicPreview){message('Pro odpověď otevři svůj osobní odkaz.');render()}
else if(!/^[a-zA-Z0-9_-]{43}$/.test(token))message('Tento osobní odkaz není platný.',true);else load();
