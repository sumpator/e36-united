import { firebaseConfig, portalConfig } from './firebase-config.js?v=20260823-auth2';
import { initUnitedAuth } from './united-auth.js?v=20260825-phase-a1';

export function normalizeMemberBenefit(club={}){
  const available=Math.max(0,Number(club.points?.available||0));
  const threshold=Math.max(1,Number(club.rewardThreshold||12));
  return {available,threshold,meter:Math.min(threshold,available),remaining:Math.max(0,threshold-available),rating:club.rating?.name||'316i'};
}

(() => {
if(typeof document==='undefined')return;
const qs=(s,r=document)=>r.querySelector(s), qsa=(s,r=document)=>[...r.querySelectorAll(s)];
const products={
 'tee-black':{title:'UNITED Tee',subtitle:'Black / heavyweight',sizes:['S','M','L','XL','XXL']},
 'tee-bone':{title:'UNITED Tee',subtitle:'Bone / summer',sizes:['S','M','L','XL','XXL']},
 'hoodie':{title:'UNITED Hoodie',subtitle:'Black / heavyweight',sizes:['S','M','L','XL','XXL']},
 'cap':{title:'United Cap',subtitle:'Black / embroidered',sizes:['ONE SIZE']},
 'stickers':{title:'Sticker Pack',subtitle:'United / body codes',sizes:['6 KS']},
 'lanyard':{title:'United Key Strap',subtitle:'Blue line edition',sizes:['ONE SIZE']},
 'poster':{title:'United 2026 Poster',subtitle:'Zbraslavice / A2',sizes:['A2']}
};
const modal=qs('[data-merch-modal]'); let active=null, lastFocus=null;
const close=()=>{if(!modal)return;modal.hidden=true;document.body.classList.remove('modal-open');lastFocus?.focus?.();};
qsa('[data-merch-close]').forEach(b=>b.addEventListener('click',close));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal?.hidden)close();});
qsa('[data-product-open]').forEach(btn=>btn.addEventListener('click',()=>{
 const id=btn.dataset.productOpen,p=products[id]; if(!p||!modal)return; active=id; lastFocus=btn;
 const card=btn.closest('[data-merch-product]'); const visual=qs('.merch-product-visual',card)?.cloneNode(true);
 const slot=qs('[data-merch-modal-visual]',modal); if(slot){slot.replaceChildren(); if(visual){visual.querySelector('.merch-product-quick')?.remove();slot.append(visual);}}
 qs('[data-merch-modal-title]',modal).textContent=p.title; qs('[data-merch-modal-subtitle]',modal).textContent=p.subtitle;
 const sizes=qs('[data-merch-sizes]',modal); sizes.replaceChildren(...p.sizes.map((s,i)=>{const b=document.createElement('button');b.type='button';b.textContent=s;b.className=i===0?'is-active':'';b.addEventListener('click',()=>{qsa('button',sizes).forEach(x=>x.classList.remove('is-active'));b.classList.add('is-active');updateMail();});return b;}));
 modal.hidden=false;document.body.classList.add('modal-open');updateMail();qs('[data-merch-close]',modal)?.focus();
}));
function updateMail(){if(!active||!modal)return;const p=products[active],size=qs('[data-merch-sizes] .is-active',modal)?.textContent||'';const a=qs('[data-merch-interest]',modal);a.href=`mailto:united@e36united.cz?subject=${encodeURIComponent('E36 United merch – '+p.title)}&body=${encodeURIComponent('Mám zájem o '+p.title+' / '+p.subtitle+' / varianta '+size+'.\n\nProsím dejte mi vědět, až bude Drop 01 spuštěný.')}`;}
qsa('[data-merch-filter]').forEach(btn=>btn.addEventListener('click',()=>{const f=btn.dataset.merchFilter;qsa('[data-merch-filter]').forEach(x=>x.classList.toggle('is-active',x===btn));qsa('[data-merch-product]').forEach(card=>{card.hidden=f!=='all'&&card.dataset.category!==f;});}));

const memberBenefit=qs('[data-member-merch-benefit]');
if(memberBenefit){
  const apiBaseUrl=(portalConfig.apiBaseUrl||'https://api.e36united.cz').replace(/\/$/,'');
  let benefitRequestGeneration=0;
  const loadingState=qs('[data-benefit-loading]',memberBenefit),anonymousState=qs('[data-benefit-anonymous]',memberBenefit),memberState=qs('[data-benefit-member]',memberBenefit);
  const setVisible=target=>[loadingState,anonymousState,memberState].forEach(element=>{if(element)element.hidden=element!==target});
  const renderLoading=()=>{benefitRequestGeneration+=1;memberBenefit.dataset.benefitState='loading';memberBenefit.setAttribute('aria-busy','true');setVisible(loadingState);if(loadingState){qs('strong',loadingState).textContent='Ověřuji tvoje United ID…';qs('small',loadingState).textContent='Členský stav se načítá.';qs('[data-benefit-retry]',loadingState).hidden=true}};
  const renderAnonymous=()=>{benefitRequestGeneration+=1;memberBenefit.dataset.benefitState='anonymous';memberBenefit.removeAttribute('aria-busy');setVisible(anonymousState)};
  const renderError=()=>{memberBenefit.dataset.benefitState='error';memberBenefit.removeAttribute('aria-busy');setVisible(loadingState);if(loadingState){qs('strong',loadingState).textContent='Členský stav se nepodařilo ověřit.';qs('small',loadingState).textContent='Tvoje session nebyla změněna. Zkontroluj připojení a zkus to znovu.';qs('[data-benefit-retry]',loadingState).hidden=false}};
  const loadUnitedClub=async(user,retry=true)=>{const token=await user.getIdToken(!retry),response=await fetch(`${apiBaseUrl}/api/united-club`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});if(response.status===401&&retry)return loadUnitedClub(user,false);const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.message||payload.error||`API ${response.status}`);return payload};
  const renderMember=async user=>{
    const generation=++benefitRequestGeneration;
    try{
      const progress=normalizeMemberBenefit(await loadUnitedClub(user));if(generation!==benefitRequestGeneration)return;
      memberBenefit.dataset.benefitState='member';memberBenefit.removeAttribute('aria-busy');setVisible(memberState);
      qs('[data-benefit-points]',memberState).textContent=progress.available;
      const progressBar=qs('[data-benefit-progress]',memberState);progressBar.setAttribute('aria-valuemax',String(progress.threshold));progressBar.setAttribute('aria-valuenow',String(progress.meter));progressBar.querySelector('i').style.width=`${Math.min(100,progress.meter/progress.threshold*100)}%`;
    qs('[data-benefit-next]',memberState).textContent=progress.remaining?`Ještě ${progress.remaining} ${progress.remaining===1?'bod':'bodů'} do United Merch odměny.`:'United Merch odměna je odemčená.';
      qs('[data-benefit-perk]',memberState).textContent=progress.remaining?'United Member':'United Merch odměna';
      qs('[data-benefit-perk-count]',memberState).textContent=`MEMBER RATING: ${progress.rating}`;
    }catch(error){if(generation===benefitRequestGeneration){renderError();console.debug('United member benefit could not be loaded.',error)}}
  };
  renderLoading();
  const authController=initUnitedAuth({config:firebaseConfig,onStateChange:state=>{
    if(state.status==='loading')renderLoading();
    else if(state.status==='authenticated')renderMember(state.user);
    else if(state.status==='anonymous')renderAnonymous();
    else{renderError();console.debug('United member benefit state is unavailable.',state.error)}
  }});
  qs('[data-benefit-retry]',memberBenefit)?.addEventListener('click',()=>authController.retry());
}
})();
