import { firebaseConfig, portalConfig } from './firebase-config.js?v=20260823-auth2';
import { initUnitedAuth } from './united-auth.js?v=20260825-phase-a1';
import { createImagePreviewController, selectImageFiles } from './image-upload.js?v=20260827-garage-photos';

const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const apiBase=(portalConfig.apiBaseUrl||'https://api.e36united.cz').replace(/\/$/,'');
let auth=null,currentUser=null,member=null,authController=null;

function initGalleryNavigation(){
  const videoSection=$('.gallery-video-section'),hero=$('.gallery-hero');
  if(!videoSection||!hero)return;
  videoSection.id='videos';
  const items=[['videos','01','Videa'],['official-photos','02','Ofiko fotky'],['user-photos','03','User fotky'],['nahraj-fotky','04','Nahrát foto']]
    .map(([id,index,label])=>({id,index,label,section:document.getElementById(id)})).filter(item=>item.section);
  if(!items.length)return;
  const wrap=document.createElement('div');wrap.className='gallery-media-nav-wrap';
  const nav=document.createElement('nav');nav.className='container gallery-media-nav';nav.setAttribute('aria-label','Sekce galerie');
  items.forEach((item,index)=>{
    const link=document.createElement('a');link.href=`#${item.id}`;link.dataset.galleryNav=item.id;link.classList.toggle('is-active',index===0);link.innerHTML=`<span>${item.index}</span>${item.label}`;
    link.addEventListener('click',event=>{event.preventDefault();item.section.scrollIntoView({behavior:'smooth',block:'start'});history.replaceState(null,'',`#${item.id}`)});
    nav.append(link);item.link=link;
  });
  wrap.append(nav);hero.after(wrap);
  let activeId='';
  const setActive=id=>{
    if(id===activeId)return;activeId=id;
    items.forEach(item=>{
    const active=item.id===id;item.link.classList.toggle('is-active',active);
    if(active){item.link.setAttribute('aria-current','location');item.link.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'})}
    else item.link.removeAttribute('aria-current');
    });
  };
  const updateActive=()=>{
    const probe=Math.min(innerHeight*.38,300);let active=items[0];
    items.forEach(item=>{const rect=item.section.getBoundingClientRect();if(rect.top<=probe)active=item});
    setActive(active.id);
  };
  updateActive();window.addEventListener('scroll',updateActive,{passive:true});window.addEventListener('resize',updateActive,{passive:true});
}

function setUploadStatus(message,type=''){
  const el=$('[data-upload-status]');if(!el)return;
  el.textContent=message;el.classList.remove('is-success','is-error','is-info');
  if(type)el.classList.add(`is-${type}`);
}
function setAuthState(state=currentUser?'authenticated':'anonymous'){
  const box=$('[data-gallery-auth-state]'),submit=$('[data-upload-submit]');if(!box)return;
  box.classList.remove('is-authenticated','is-error','is-loading');
  if(state==='loading'){
    box.classList.add('is-loading');
    box.innerHTML='<span class="gallery-auth-dot"></span><div><b>Kontroluji přihlášení…</b><small>Počkám na potvrzený stav Firebase session.</small></div>';
    if(submit)submit.disabled=true;
  }else if(state==='error'){
    box.classList.add('is-error');
    box.innerHTML='<span class="gallery-auth-dot"></span><div><b>Přihlášení se nepodařilo ověřit</b><small>Tvoje session nebyla změněna. Zkontroluj připojení a zkus to znovu.</small><button data-gallery-auth-retry type="button">Zkusit znovu →</button></div>';
    $('[data-gallery-auth-retry]',box)?.addEventListener('click',()=>authController?.retry());
    if(submit)submit.disabled=true;
  }else if(currentUser){
    box.classList.add('is-authenticated');
    box.innerHTML=`<span class="gallery-auth-dot"></span><div><b>${escapeHtml(member?.nickname||member?.name||currentUser.displayName||'United member')}</b><small>${escapeHtml(currentUser.email||'')} · nahrávání je aktivní</small></div>`;
    if(submit)submit.disabled=false;
  }else{
    box.classList.remove('is-authenticated');
    box.innerHTML='<span class="gallery-auth-dot"></span><div><b>Pro upload se přihlas do Můj United</b><small>Fotky jsou vždy svázané s konkrétním členem a čekají na schválení.</small><a href="member.html">Přihlásit / registrovat →</a></div>';
    if(submit)submit.disabled=true;
  }
}
function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

async function authorizedFetch(path,options={},retry=true){
  if(!currentUser)throw new Error('auth_required');
  const token=await currentUser.getIdToken(!retry);
  const headers=new Headers(options.headers||{});headers.set('Authorization',`Bearer ${token}`);
  let response;
  try{response=await fetch(`${apiBase}${path}`,{...options,headers,cache:'no-store'})}catch(error){const e=new Error('network');e.cause=error;throw e}
  if(response.status===401&&retry){await currentUser.getIdToken(true);return authorizedFetch(path,options,false)}
  const text=await response.text();let payload=null;if(text){try{payload=JSON.parse(text)}catch{payload={error:text}}}
  if(!response.ok){const error=new Error(payload?.error||payload?.message||`API ${response.status}`);error.status=response.status;throw error}
  return payload;
}

async function compressImage(file,max=1800,quality=.82){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('type');
  if(file.size>12*1024*1024)throw new Error('size');
  return new Promise((resolve,reject)=>{
    const reader=new FileReader(),img=new Image();
    reader.onerror=reject;reader.onload=()=>img.src=String(reader.result||'');
    img.onload=()=>{
      const scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
      const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,canvas.width,canvas.height);
      canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('compress')),'image/jpeg',quality);
    };
    reader.readAsDataURL(file);
  });
}

let selectedUploadFiles=[];
const uploadPreviewController=createImagePreviewController($('[data-upload-preview]'));
function renderFilePreview(){
  const input=$('[data-upload-input]'),preview=$('[data-upload-preview]'),count=$('[data-upload-count]');if(!input||!preview)return;
  const selection=selectImageFiles(input.files,{maxFiles:8});selectedUploadFiles=selection.files;uploadPreviewController.render(selectedUploadFiles);if(count)count.textContent=`${selectedUploadFiles.length} / 8 vybráno`;
  if(selection.tooLarge)setUploadStatus('Každá fotka může mít nejvýše 12 MB.','error');
  else if(selection.invalidType)setUploadStatus('Podporujeme JPG, PNG a WEBP.','error');
  else if(selection.truncated)setUploadStatus('Najednou můžeš nahrát maximálně 8 fotek.','info');
}

async function loadApprovedGallery(){
  const grid=$('[data-user-gallery-grid]');if(!grid)return;
  try{
    const response=await fetch(`${apiBase}/api/gallery/approved?limit=72`,{cache:'no-store'});
    if(!response.ok)throw new Error(`gallery ${response.status}`);
    const payload=await response.json(),photos=Array.isArray(payload?.photos)?payload.photos:[];
    const empty=$('[data-user-gallery-empty]',grid);
    if(!photos.length){if(empty)empty.hidden=false;return}
    grid.innerHTML=photos.map(photo=>{
      const url=`${apiBase}${photo.imageUrl}`;
      const title=[photo.author,photo.caption].filter(Boolean).join(' · ')||'E36 United community';
      return `<figure class="gallery-item gallery-item--user reveal is-visible" data-lightbox data-full="${escapeHtml(url)}" data-caption="${escapeHtml(title)}"><img alt="${escapeHtml(title)}" loading="lazy" src="${escapeHtml(url)}" onerror="this.closest('figure').remove()"><figcaption><b>${escapeHtml(photo.author||'United member')}</b>${photo.caption?`<span>${escapeHtml(photo.caption)}</span>`:''}</figcaption></figure>`;
    }).join('');
  }catch(error){console.warn('Approved gallery could not be loaded',error);}
}

async function initAuth(){
  setAuthState('loading');
  authController=initUnitedAuth({config:firebaseConfig,onStateChange:async state=>{
    if(state.context)auth=state.context.auth;
    if(state.status==='loading'){setAuthState('loading');return}
    if(state.status==='error'){console.error('Gallery auth init failed',state.error);setAuthState('error');return}
    currentUser=state.user;member=null;
    if(state.status==='authenticated'){
      const observedUser=state.user;
      try{const payload=await authorizedFetch('/api/me');if(currentUser!==observedUser)return;member=payload?.member||null}
      catch(error){console.warn('Member profile unavailable on gallery page',error)}
    }
    if(state.status==='authenticated'&&currentUser!==state.user)return;
    setAuthState(state.status);
  }});
  await authController.ready;
}

const form=$('[data-upload-form]'),input=$('[data-upload-input]'),dropzone=$('[data-upload-dropzone]');
input?.addEventListener('change',renderFilePreview);
['dragenter','dragover'].forEach(type=>dropzone?.addEventListener(type,event=>{event.preventDefault();dropzone.classList.add('is-dragging')}));
['dragleave','drop'].forEach(type=>dropzone?.addEventListener(type,event=>{event.preventDefault();dropzone.classList.remove('is-dragging')}));
dropzone?.addEventListener('drop',event=>{
  if(!input||!event.dataTransfer?.files?.length)return;
  const dt=new DataTransfer();[...event.dataTransfer.files].slice(0,8).forEach(file=>dt.items.add(file));input.files=dt.files;renderFilePreview();
});

form?.addEventListener('submit',async event=>{
  event.preventDefault();if(!currentUser)return setUploadStatus('Nejdřív se přihlas do Můj United.','error');
  if(!form.reportValidity())return;
  const files=[...selectedUploadFiles],caption=String(new FormData(form).get('caption')||'').trim(),submit=$('[data-upload-submit]');
  if(!files.length)return setUploadStatus('Vyber alespoň jednu fotografii.','error');
  submit.disabled=true;
  try{
    for(let i=0;i<files.length;i++){
      setUploadStatus(`Optimalizuji a nahrávám ${i+1} / ${files.length}…`,'info');
      const blob=await compressImage(files[i]);
      const fd=new FormData();fd.append('file',blob,`${files[i].name.replace(/\.[^.]+$/,'')||'united'}.jpg`);fd.append('caption',caption);
      await authorizedFetch('/api/gallery/submissions',{method:'POST',body:fd});
    }
    form.reset();selectedUploadFiles=[];uploadPreviewController.clear();const count=$('[data-upload-count]');if(count)count.textContent='0 / 8 vybráno';setUploadStatus('Hotovo. Fotky jsou na serveru a čekají na schválení United týmem.','success');
  }catch(error){
    console.error('Gallery upload failed',error);
    const msg=error.message==='type'?'Podporujeme JPG, PNG a WEBP.':error.message==='size'?'Jeden ze souborů je větší než 12 MB.':error.status===429?'Dnešní limit nahrávání byl dosažen.':'Upload se nepodařil. Zkus to znovu.';
    setUploadStatus(msg,'error');
  }finally{submit.disabled=false;setAuthState()}
});

loadApprovedGallery();
initAuth();
initGalleryNavigation();
