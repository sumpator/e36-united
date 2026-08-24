import { firebaseConfig } from './firebase-config.js?v=20260823-auth2';

(() => {
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
  void (async()=>{
    try{
      const appMod=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js');
      const authMod=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
      const app=appMod.getApps().length?appMod.getApps()[0]:appMod.initializeApp(firebaseConfig);
      const auth=authMod.getAuth(app);await authMod.setPersistence(auth,authMod.browserLocalPersistence);
      authMod.onAuthStateChanged(auth,user=>{memberBenefit.hidden=!user});
    }catch(error){memberBenefit.hidden=true;console.debug('United member benefit state is unavailable.',error)}
  })();
}
})();
