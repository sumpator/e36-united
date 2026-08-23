import { firebaseConfig, portalConfig } from './firebase-config.js?v=20260823-auth2';

const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const apiBase=(portalConfig.apiBaseUrl||'https://api.e36united.cz').replace(/\/$/,'');
let auth=null,currentUser=null,member=null;

function setUploadStatus(message,type=''){
  const el=$('[data-upload-status]');if(!el)return;
  el.textContent=message;el.classList.remove('is-success','is-error','is-info');
  if(type)el.classList.add(`is-${type}`);
}
function setAuthState(){
  const box=$('[data-gallery-auth-state]'),submit=$('[data-upload-submit]');if(!box)return;
  if(currentUser){
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

function renderFilePreview(){
  const input=$('[data-upload-input]'),preview=$('[data-upload-preview]'),count=$('[data-upload-count]');if(!input||!preview)return;
  const files=[...input.files].slice(0,8);preview.innerHTML='';if(count)count.textContent=`${files.length} / 8 vybráno`;
  files.forEach(file=>{
    const fig=document.createElement('figure'),img=document.createElement('img'),label=document.createElement('span');
    label.textContent=file.name;fig.append(img,label);preview.append(fig);
    const reader=new FileReader();reader.onload=()=>img.src=String(reader.result||'');reader.readAsDataURL(file);
  });
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
  try{
    const appMod=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js');
    const authMod=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
    const app=appMod.getApps().length?appMod.getApps()[0]:appMod.initializeApp(firebaseConfig);
    auth=authMod.getAuth(app);await authMod.setPersistence(auth,authMod.browserLocalPersistence);
    authMod.onAuthStateChanged(auth,async user=>{
      currentUser=user;member=null;
      if(user){
        try{const payload=await authorizedFetch('/api/me');member=payload?.member||null}catch(error){console.warn('Member profile unavailable on gallery page',error)}
      }
      setAuthState();
    });
  }catch(error){console.error('Gallery auth init failed',error);setAuthState();}
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
  const files=[...input.files].slice(0,8),caption=String(new FormData(form).get('caption')||'').trim(),submit=$('[data-upload-submit]');
  if(!files.length)return setUploadStatus('Vyber alespoň jednu fotografii.','error');
  submit.disabled=true;
  try{
    for(let i=0;i<files.length;i++){
      setUploadStatus(`Optimalizuji a nahrávám ${i+1} / ${files.length}…`,'info');
      const blob=await compressImage(files[i]);
      const fd=new FormData();fd.append('file',blob,`${files[i].name.replace(/\.[^.]+$/,'')||'united'}.jpg`);fd.append('caption',caption);
      await authorizedFetch('/api/gallery/submissions',{method:'POST',body:fd});
    }
    form.reset();renderFilePreview();setUploadStatus('Hotovo. Fotky jsou na serveru a čekají na schválení United týmem.','success');
  }catch(error){
    console.error('Gallery upload failed',error);
    const msg=error.message==='type'?'Podporujeme JPG, PNG a WEBP.':error.message==='size'?'Jeden ze souborů je větší než 12 MB.':error.status===429?'Dnešní limit nahrávání byl dosažen.':'Upload se nepodařil. Zkus to znovu.';
    setUploadStatus(msg,'error');
  }finally{submit.disabled=false;setAuthState()}
});

loadApprovedGallery();
initAuth();
