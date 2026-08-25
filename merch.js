import { firebaseConfig, portalConfig } from './firebase-config.js?v=20260823-auth2';

export function deriveMemberBenefit(localData={},config=portalConfig){
  const history=Array.isArray(localData.history)?localData.history:[],bonuses=Array.isArray(localData.bonuses)?localData.bonuses:[],pointRules=config.points;
  const verified=history.filter(item=>item.attended&&item.verified).length,wins=history.filter(item=>item.attended&&item.verified&&item.winner).length;
  const lifetime=history.reduce((total,item)=>total+(item.attended&&item.verified?pointRules.attendance:0)+(item.winner&&item.verified?pointRules.showShineWin:0),0)+bonuses.reduce((total,item)=>total+Number(item.points||0),0);
  const points=Math.min(pointRules.rewardThreshold,lifetime),unlocked=[
    ['Dřívější rezervace',verified>=1],
    ['Členský United Merch',verified>=1],
    ['United Merch odměna',points>=pointRules.rewardThreshold],
    ['Komunitní hlasování',verified>=3],
    ['Přednostní ubytování',verified>=5],
  ].filter(([,active])=>active).map(([name])=>name);
  return {points,lifetime,verified,wins,threshold:pointRules.rewardThreshold,remaining:Math.max(0,pointRules.rewardThreshold-points),unlocked};
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
  const anonymousState=qs('[data-benefit-anonymous]',memberBenefit),memberState=qs('[data-benefit-member]',memberBenefit);
  const renderAnonymous=()=>{memberBenefit.dataset.benefitState='anonymous';memberBenefit.removeAttribute('aria-busy');anonymousState.hidden=false;memberState.hidden=true};
  const renderMember=user=>{
    let localData={};
    try{localData=JSON.parse(localStorage.getItem(`${portalConfig.memberLocalPrefix||'e36UnitedMemberLocalV20'}:${user.uid}`)||'{}')}catch(error){console.debug('United Progress local data is unavailable.',error)}
    const progress=deriveMemberBenefit(localData);memberBenefit.dataset.benefitState='member';memberBenefit.removeAttribute('aria-busy');anonymousState.hidden=true;memberState.hidden=false;
    qs('[data-benefit-points]',memberState).textContent=progress.points;
    const progressBar=qs('[data-benefit-progress]',memberState);progressBar.setAttribute('aria-valuemax',String(progress.threshold));progressBar.setAttribute('aria-valuenow',String(progress.points));progressBar.querySelector('i').style.width=`${Math.min(100,progress.points/progress.threshold*100)}%`;
    qs('[data-benefit-next]',memberState).textContent=progress.remaining?`Ještě ${progress.remaining} ${progress.remaining===1?'bod':'bodů'} do United Merch odměny.`:'United Merch odměna je odemčená.';
    qs('[data-benefit-perk]',memberState).textContent=progress.unlocked.at(-1)||'Zatím bez odemčené výhody';
    qs('[data-benefit-perk-count]',memberState).textContent=progress.unlocked.length?`${progress.unlocked.length} ${progress.unlocked.length===1?'aktivní výhoda':'aktivní výhody'}`:'První výhoda se odemkne ověřenou účastí.';
  };
  memberBenefit.setAttribute('aria-busy','true');
  void (async()=>{
    try{
      const appMod=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js');
      const authMod=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
      const app=appMod.getApps().length?appMod.getApps()[0]:appMod.initializeApp(firebaseConfig);
      const auth=authMod.getAuth(app);await authMod.setPersistence(auth,authMod.browserLocalPersistence);
      authMod.onAuthStateChanged(auth,user=>user?renderMember(user):renderAnonymous());
    }catch(error){renderAnonymous();console.debug('United member benefit state is unavailable.',error)}
  })();
}
})();
