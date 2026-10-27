import {initUnitedAuth} from '../united-auth.js?v=20260825-phase-a1';
import {firebaseConfig,portalConfig} from '../firebase-config.js?v=20260924-merch2';
const poll=new URLSearchParams(location.search).get('poll')||'darts-20261027';
const status=document.querySelector('[data-status]'),table=document.querySelector('table'),tbody=document.querySelector('tbody'),refresh=document.querySelector('[data-refresh]');
const provision=document.querySelector('[data-provision]'),fileInput=document.querySelector('[data-provision-file]');
let user=null,generation=0;
async function load(){
 const current=++generation;table.hidden=true;tbody.replaceChildren();refresh.hidden=true;provision.hidden=true;
 if(!user){status.textContent='Výsledky jsou dostupné pouze přihlášenému Adminu. Přihlas se přes United Admin.';return}
 status.textContent='Načítám výsledky…';
 try{
  const token=await user.getIdToken();
  const response=await fetch(portalConfig.apiBaseUrl+'/api/admin/private-polls/'+encodeURIComponent(poll)+'/results',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
  if(current!==generation)return;
  provision.hidden=!(response.ok||response.status===404);
  if(!response.ok)throw Error(response.status===403?'Nemáš oprávnění Admina.':'Výsledky se nepodařilo načíst.');
  const data=await response.json();if(current!==generation)return;
  for(const row of data.results){const tr=document.createElement('tr');for(const value of [row.recipient,{yes:'ANO',no:'NE',maybe:'MOŽNÁ'}[row.answer]||'Bez odpovědi',row.score===null?'—':row.score+'/10',row.updatedAt?new Date(row.updatedAt).toLocaleString('cs-CZ',{timeZone:'Europe/Prague'}):'—']){const td=document.createElement('td');td.textContent=value;tr.append(td)}tbody.append(tr)}
  status.textContent=data.poll.title+' · '+data.results.length+' příjemců';table.hidden=false;refresh.hidden=false;
 }catch(error){if(current===generation){status.textContent=error.message;refresh.hidden=false}}
}
refresh.addEventListener('click',load);
fileInput.addEventListener('change',async()=>{
 const file=fileInput.files[0];if(!file||!user)return;
 const activeUser=user,current=generation;fileInput.disabled=true;
 try{
  if(file.size>100000)throw Error('Soubor je příliš velký.');
  const bundle=JSON.parse(await file.text());
  if(bundle.poll?.id!==poll||!Array.isArray(bundle.invitations)||bundle.invitations.length<1||bundle.invitations.length>100)throw Error('Soubor nepatří této anketě.');
  const send=async(path,body)=>{
   if(user!==activeUser||generation!==current)throw Error('Relace se změnila. Import byl zastaven.');
   const token=await activeUser.getIdToken();
   const response=await fetch(portalConfig.apiBaseUrl+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
   if(!response.ok)throw Error('Příprava pozvánek nebyla dokončena ('+response.status+'). Stejný soubor lze bezpečně znovu použít.');
  };
  status.textContent='Připravuji pozvánky…';
  await send('/api/admin/private-polls',bundle.poll);
  for(const invitation of bundle.invitations)await send('/api/admin/private-polls/'+encodeURIComponent(poll)+'/invitations',invitation);
  if(generation===current)await load();
 }catch(error){if(generation===current)status.textContent=error.message}
 finally{fileInput.value='';fileInput.disabled=false}
});
initUnitedAuth({config:firebaseConfig,onStateChange(state){user=state.user||null;generation++;table.hidden=true;tbody.replaceChildren();provision.hidden=true;if(state.status==='loading')status.textContent='Ověřuji oprávnění…';else if(state.status==='error')status.textContent='Přihlášení se nepodařilo ověřit.';else load()}});
