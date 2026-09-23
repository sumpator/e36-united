import { firebaseConfig, portalConfig } from './firebase-config.js?v=20260924-merch2';
import {initShop} from './merch/shop.js?v=20260924-merch2';
import { initUnitedAuth } from './united-auth.js?v=20260825-phase-a1';

export function normalizeMemberBenefit(club={}){
  const available=Math.max(0,Number(club.points?.available||0));
  const threshold=Math.max(1,Number(club.rewardThreshold||12));
  return {available,threshold,meter:Math.min(threshold,available),remaining:Math.max(0,threshold-available),rating:club.rating?.name||'316i'};
}

(() => {
if(typeof document==='undefined')return;
const qs=(s,r=document)=>r.querySelector(s), qsa=(s,r=document)=>[...r.querySelectorAll(s)];
const shop=initShop();

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
    }catch(error){if(generation===benefitRequestGeneration){renderError();console.debug('United member benefit could not be loaded.',error)}}
  };
  renderLoading();
  const authController=initUnitedAuth({config:firebaseConfig,onStateChange:state=>{
    shop.setIdentity(state.status==='authenticated'?state.user:null);
    if(state.status==='loading')renderLoading();
    else if(state.status==='authenticated')renderMember(state.user);
    else if(state.status==='anonymous')renderAnonymous();
    else{renderError();console.debug('United member benefit state is unavailable.',state.error)}
  }});
  qs('[data-benefit-retry]',memberBenefit)?.addEventListener('click',()=>authController.retry());
}
})();
