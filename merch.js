import {merchBenefit,loadMerchBenefitSettings} from './merch/benefit.js?v=20261101-auth1';
import {initPointsGuide} from './member/points-guide.js?v=20261102-admin1';
import { firebaseConfig, portalConfig } from './firebase-config.js?v=20260924-merch2';
import {initShop} from './merch/shop.js?v=20261101-detail1';
import {rewardProgress,pointWord} from './member/reward-progress.js?v=20260926-portal3';
import { initUnitedAuth, authRecoveryCopy, authDiagnostic } from './united-auth.js?v=20261101-auth1';

export function normalizeMemberBenefit(club={}){
  const cycle=rewardProgress(club.points?.available);
  return {...cycle,available:cycle.total,threshold:12,meter:cycle.cycle};
}

(() => {
if(typeof document==='undefined')return;
const qs=(s,r=document)=>r.querySelector(s), qsa=(s,r=document)=>[...r.querySelectorAll(s)];
const shop=initShop();
initPointsGuide();
const benefitTitle=qs('[data-merch-benefit-title]'),benefitSettingsStatus=qs('[data-benefit-settings-status]');
if(benefitTitle)void loadMerchBenefitSettings().then(settings=>{const view=merchBenefit(settings);benefitTitle.textContent=view.active?`Získej slevu ${view.percent} % na merch!`:'Členská výhoda';if(!view.active){benefitSettingsStatus.hidden=false;benefitSettingsStatus.textContent='Podmínky slevy zatím nejsou nastavené.'}}).catch(()=>{benefitSettingsStatus.hidden=false;benefitSettingsStatus.textContent='Nastavení členské výhody se nepodařilo načíst. Zkus stránku obnovit.'});

const memberBenefit=qs('[data-member-merch-benefit]');
if(memberBenefit){
  const apiBaseUrl=(portalConfig.apiBaseUrl||'https://api.e36united.cz').replace(/\/$/,'');
  let benefitRequestGeneration=0,benefitAbort=null;
  const cancelBenefit=()=>{benefitRequestGeneration+=1;benefitAbort?.abort();benefitAbort=null};
  const loadingState=qs('[data-benefit-loading]',memberBenefit),anonymousState=qs('[data-benefit-anonymous]',memberBenefit),memberState=qs('[data-benefit-member]',memberBenefit);
  const setVisible=target=>[loadingState,anonymousState,memberState].forEach(element=>{if(element)element.hidden=element!==target});
  const renderLoading=()=>{cancelBenefit();memberBenefit.dataset.benefitState='loading';memberBenefit.setAttribute('aria-busy','true');setVisible(loadingState);if(loadingState){qs('strong',loadingState).textContent='Ověřuji tvoje United ID…';qs('small',loadingState).textContent='Členský stav se načítá.';qs('[data-benefit-retry]',loadingState).hidden=true}};
  const renderAnonymous=()=>{cancelBenefit();memberBenefit.dataset.benefitState='anonymous';memberBenefit.removeAttribute('aria-busy');setVisible(anonymousState)};
  const renderError=state=>{memberBenefit.dataset.benefitState='error';memberBenefit.removeAttribute('aria-busy');setVisible(loadingState);if(loadingState){qs('strong',loadingState).textContent=state?'Přihlášení se nepodařilo ověřit.':'Body se nepodařilo načíst.';qs('small',loadingState).textContent=state?authRecoveryCopy(state):'Přihlášení zůstává zachované. Obnov načtení bodů.';qs('[data-benefit-retry]',loadingState).hidden=false}};
  const loadUnitedClub=async(user,signal,retry=true)=>{const token=await user.getIdToken(!retry);if(signal.aborted)throw new Error('benefit_cancelled');const response=await fetch(`${apiBaseUrl}/api/united-club`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal});if(response.status===401&&retry)return loadUnitedClub(user,signal,false);const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(`benefit_api_${response.status}`);return payload};
  const renderMember=async state=>{
    cancelBenefit();const generation=benefitRequestGeneration,controller=new AbortController();benefitAbort=controller;let timer;
    const remaining=Math.max(0,Math.min(10_000,(state.deadlineAt||Date.now()+10_000)-Date.now()));
    try{
      const [club,settings]=await Promise.race([Promise.all([loadUnitedClub(state.user,controller.signal),loadMerchBenefitSettings()]),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('benefit_timeout'))},remaining)})]),progress=normalizeMemberBenefit(club),benefit=merchBenefit(settings);progress.threshold=benefit.threshold;progress.meter=Math.min(progress.available,progress.threshold);if(generation!==benefitRequestGeneration)return;
      memberBenefit.dataset.benefitState='member';memberBenefit.removeAttribute('aria-busy');setVisible(memberState);
      qs('[data-benefit-points]',memberState).textContent=progress.available;qs('[data-benefit-word]',memberState).textContent=pointWord(progress.available);
      const progressBar=qs('[data-benefit-progress]',memberState);progressBar.setAttribute('aria-valuemax',String(progress.threshold));progressBar.setAttribute('aria-valuenow',String(progress.meter));progressBar.querySelector('i').style.width=`${Math.min(100,progress.meter/progress.threshold*100)}%`;
    qs('[data-benefit-next]',memberState).classList.toggle('is-unlocked',benefit.active&&progress.available>=progress.threshold);
    qs('[data-benefit-next]',memberState).textContent=benefit.active?(progress.available>=progress.threshold?'Sleva odemčena':`Do slevy ti chybí ${progress.threshold-progress.available} ${pointWord(progress.threshold-progress.available)}.`):'Tvoje United Points';
    }catch{if(generation===benefitRequestGeneration)renderError()}
    finally{clearTimeout(timer);if(benefitAbort===controller)benefitAbort=null}
  };
  renderLoading();
  const authController=initUnitedAuth({config:firebaseConfig,onStateChange:state=>{
    shop.setIdentity(state.status==='authenticated'?state.user:null);
    if(state.status==='loading')renderLoading();
    else if(state.status==='authenticated')renderMember(state);
    else if(state.status==='anonymous')renderAnonymous();
    else{cancelBenefit();renderError(state);console.debug('United member benefit state is unavailable.',authDiagnostic(state))}
  }});
  qs('[data-benefit-retry]',memberBenefit)?.addEventListener('click',()=>authController.retry());
}
})();
