import { createImagePreviewController, selectImageFiles } from '../../image-upload.js?v=20260827-garage-photos';
import { compressImageBlob } from '../media.js?v=20260903-phase4b';
import { $, $$, esc, setButtonBusy, toast } from '../ui.js?v=20260902-phase3';

export function createMemberPhotos({apiRequest,apiRequestForm,apiRequestBlob,getCurrentUser,formatApiError}){
  let memberGallery=[],memberGalleryHasMore=false,memberGalleryLoading=false,memberGalleryRequestGeneration=0;
  const memberGalleryObjectUrls=new Map(),memberGalleryObjectUrlRequests=new Map();
  let memberGalleryObserver=null,activeMemberGalleryIndex=-1;
  const memberGalleryForm=$('[data-member-gallery-form]'),memberPhotoInput=$('[data-member-photo-input]'),memberPhotoDropzone=$('[data-member-photo-dropzone]');
  let memberPhotoPreview=null,memberPhotoSelection=[],bound=false;

  function clearMemberGalleryObjectUrls(){memberGalleryRequestGeneration+=1;for(const url of memberGalleryObjectUrls.values())URL.revokeObjectURL(url);memberGalleryObjectUrls.clear();memberGalleryObjectUrlRequests.clear()}
  async function getPrivateMemberGalleryPhotoUrl(photoId){
    if(memberGalleryObjectUrls.has(photoId))return memberGalleryObjectUrls.get(photoId);
    if(memberGalleryObjectUrlRequests.has(photoId))return await memberGalleryObjectUrlRequests.get(photoId);
    const generation=memberGalleryRequestGeneration,userId=getCurrentUser()?.uid;
    let request;request=apiRequestBlob(`/api/gallery/mine/media/${encodeURIComponent(photoId)}`).then(blob=>{
      if(generation!==memberGalleryRequestGeneration||userId!==getCurrentUser()?.uid||!memberGallery.some(photo=>String(photo.id)===String(photoId)))throw new Error('stale_member_gallery_request');
      const existing=memberGalleryObjectUrls.get(photoId);if(existing)return existing;const url=URL.createObjectURL(blob);memberGalleryObjectUrls.set(photoId,url);return url;
    }).finally(()=>{if(memberGalleryObjectUrlRequests.get(photoId)===request)memberGalleryObjectUrlRequests.delete(photoId)});
    memberGalleryObjectUrlRequests.set(photoId,request);
    return await request;
  }
  async function loadMemberGallery({append=false}={}){
    if(memberGalleryLoading)return memberGallery;
    memberGalleryLoading=true;
    try{
      const offset=append?memberGallery.length:0,payload=await apiRequest(`/api/gallery/mine?limit=24&offset=${offset}`),items=Array.isArray(payload?.submissions)?payload.submissions:[];
      if(!append){clearMemberGalleryObjectUrls();memberGallery=[]}
      const known=new Set(memberGallery.map(item=>String(item.id)));
      memberGallery.push(...items.filter(item=>!known.has(String(item.id))));
      memberGalleryHasMore=payload?.pagination?.hasMore===true;
      renderMemberGallery();
      return memberGallery;
    }finally{memberGalleryLoading=false}
  }
  function handleLoadError(){memberGallery=[]}
  function reset(){clearMemberGalleryObjectUrls();memberGallery=[];memberGalleryHasMore=false}

  function loadMemberGalleryThumbnail(img){
    const id=img.dataset.memberGalleryImage;if(!id||img.dataset.loading)return;img.dataset.loading='true';
    void getPrivateMemberGalleryPhotoUrl(id).then(url=>{if(img.isConnected)img.src=url}).catch(error=>{console.warn('Member gallery thumbnail unavailable',id,error);img.closest('.member-gallery-item')?.classList.add('is-image-unavailable')}).finally(()=>delete img.dataset.loading);
  }
  function hydrateMemberGalleryThumbnails(){
    memberGalleryObserver?.disconnect();const images=$$('img[data-member-gallery-image]');
    if(!('IntersectionObserver'in window)){images.forEach(loadMemberGalleryThumbnail);return}
    memberGalleryObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){memberGalleryObserver.unobserve(entry.target);loadMemberGalleryThumbnail(entry.target)}},{rootMargin:'240px'});
    images.forEach(image=>memberGalleryObserver.observe(image));
  }
  function renderMemberGallery(){
    const list=$('[data-member-gallery-list]'),more=$('[data-member-gallery-more]');if(!list)return;
    if(!memberGallery.length){list.innerHTML='<div class="member-gallery-empty"><b>Zatím jsi neposlal žádné fotografie.</b><small>Nahraj je tady. Po schválení se objeví ve veřejné galerii.</small></div>';if(more)more.hidden=true;return}
    const label={pending:'ČEKÁ NA SCHVÁLENÍ',approved:'SCHVÁLENA',rejected:'ZAMÍTNUTA'};
    list.innerHTML=memberGallery.map((item,index)=>`<button aria-label="Otevřít fotografii ${index+1}" class="member-gallery-item" data-member-gallery-open="${index}" type="button"><span class="member-gallery-thumb"><img alt="${esc(item.caption||'Fotka do United galerie')}" data-member-gallery-image="${esc(item.id)}" decoding="async" loading="lazy"><i aria-hidden="true">E36</i></span><span class="member-gallery-copy"><small>${esc(new Date(item.createdAt||Date.now()).toLocaleDateString('cs-CZ'))}</small><b>${esc(item.caption||'Fotka do United galerie')}</b><em class="status-${esc(item.status)}">${label[item.status]||esc(item.status)}</em></span></button>`).join('');
    $$('[data-member-gallery-open]').forEach(button=>button.addEventListener('click',()=>openMemberGalleryLightbox(Number(button.dataset.memberGalleryOpen))));
    if(more){more.hidden=!memberGalleryHasMore;more.disabled=memberGalleryLoading}
    hydrateMemberGalleryThumbnails();
  }
  async function showMemberGalleryLightboxPhoto(){
    const item=memberGallery[activeMemberGalleryIndex],image=$('[data-member-gallery-lightbox-image]'),caption=$('[data-member-gallery-lightbox-caption]'),prev=$('[data-member-gallery-prev]'),next=$('[data-member-gallery-next]');if(!item||!image)return;
    image.removeAttribute('src');image.alt=item.caption||'Fotka do United galerie';if(caption)caption.textContent=`${activeMemberGalleryIndex+1} / ${memberGallery.length}${item.caption?` · ${item.caption}`:''}`;
    if(prev)prev.disabled=memberGallery.length<2;if(next)next.disabled=memberGallery.length<2;
    try{const url=await getPrivateMemberGalleryPhotoUrl(String(item.id));if(memberGallery[activeMemberGalleryIndex]?.id===item.id)image.src=url}catch(error){console.warn('Member gallery lightbox unavailable',error)}
  }
  function openMemberGalleryLightbox(index){const modal=$('[data-member-gallery-lightbox]');if(!modal||!memberGallery[index])return;activeMemberGalleryIndex=index;modal.hidden=false;document.body.classList.add('modal-open');void showMemberGalleryLightboxPhoto();$('[data-member-gallery-close]',modal)?.focus()}
  function closeMemberGalleryLightbox(){const modal=$('[data-member-gallery-lightbox]');if(!modal)return;modal.hidden=true;activeMemberGalleryIndex=-1;document.body.classList.remove('modal-open')}
  function stepMemberGalleryLightbox(direction){if(activeMemberGalleryIndex<0||!memberGallery.length)return;activeMemberGalleryIndex=(activeMemberGalleryIndex+direction+memberGallery.length)%memberGallery.length;void showMemberGalleryLightboxPhoto()}

  function renderMemberPhotoSelection(){
    const panel=$('[data-member-photo-selection]'),count=$('[data-member-photo-count]'),names=$('[data-member-photo-names]');if(!panel||!count||!names)return;
    const total=memberPhotoSelection.length;panel.hidden=!total;memberPhotoPreview?.render(memberPhotoSelection);if(!total){count.textContent='';names.textContent='';return}
    const noun=total===1?'fotka připravená':total<=4?'fotky připravené':'fotek připravených';count.textContent=`${total} ${noun} k nahrání`;
    const visible=memberPhotoSelection.slice(0,2).map(file=>file.name),remaining=total-visible.length;names.textContent=`${visible.join(' · ')}${remaining?` · +${remaining} další`:''}`;
  }
  function selectMemberPhotos(fileList,{notify=true,updateInput=false}={}){
    const selection=selectImageFiles(fileList,{maxFiles:8});memberPhotoSelection=selection.files;
    if(notify&&(selection.invalidType||selection.tooLarge))toast(selection.tooLarge?'Každá fotka může mít nejvýše 12 MB.':'Vyber fotky ve formátu JPG, PNG nebo WebP.');
    else if(notify&&selection.truncated)toast('Najednou můžeš nahrát maximálně 8 fotek.');
    if(updateInput&&memberPhotoInput){try{const transfer=new DataTransfer();for(const file of memberPhotoSelection)transfer.items.add(file);memberPhotoInput.files=transfer.files}catch(error){console.debug('Dropped photos stay in the upload selection.',error)}}
    renderMemberPhotoSelection();
  }
  function clearMemberPhotoSelection(){memberPhotoSelection=[];if(memberPhotoInput)memberPhotoInput.value='';renderMemberPhotoSelection()}

  function bind(){
    if(bound)return;bound=true;memberPhotoPreview=createImagePreviewController($('[data-member-photo-previews]'));
    $$('[data-member-gallery-close]').forEach(button=>button.addEventListener('click',closeMemberGalleryLightbox));
    $('[data-member-gallery-prev]')?.addEventListener('click',()=>stepMemberGalleryLightbox(-1));
    $('[data-member-gallery-next]')?.addEventListener('click',()=>stepMemberGalleryLightbox(1));
    document.addEventListener('keydown',event=>{if(activeMemberGalleryIndex<0)return;if(event.key==='Escape')closeMemberGalleryLightbox();if(event.key==='ArrowLeft')stepMemberGalleryLightbox(-1);if(event.key==='ArrowRight')stepMemberGalleryLightbox(1)});
    $('[data-member-gallery-more]')?.addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;button.textContent='Načítám…';try{await loadMemberGallery({append:true})}catch(error){console.error('More member photos unavailable',error);toast(formatApiError(error))}finally{button.disabled=false;button.textContent='Načíst další'}});
    memberPhotoInput?.addEventListener('change',()=>selectMemberPhotos(memberPhotoInput.files));
    $('[data-member-photo-clear]')?.addEventListener('click',clearMemberPhotoSelection);
    if(memberPhotoDropzone){
      for(const type of ['dragenter','dragover'])memberPhotoDropzone.addEventListener(type,event=>{event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='copy';memberPhotoDropzone.classList.add('is-drag-over')});
      memberPhotoDropzone.addEventListener('dragleave',event=>{if(!memberPhotoDropzone.contains(event.relatedTarget))memberPhotoDropzone.classList.remove('is-drag-over')});
      memberPhotoDropzone.addEventListener('drop',event=>{event.preventDefault();memberPhotoDropzone.classList.remove('is-drag-over');selectMemberPhotos(event.dataTransfer?.files||[],{updateInput:true})});
    }
    memberGalleryForm?.addEventListener('submit',async event=>{
      event.preventDefault();if(!getCurrentUser())return toast('Nejdřív se přihlas.');
      const form=event.currentTarget,input=form.elements.photos;if(!memberPhotoSelection.length&&input.files.length)selectMemberPhotos(input.files,{notify:false});
      const files=[...memberPhotoSelection],caption=String(form.elements.caption?.value||'').trim(),button=form.querySelector('button[type="submit"]');
      if(!files.length)return toast('Vyber alespoň jednu fotku.');
      setButtonBusy(button,true,`Nahrávám 0 / ${files.length}…`);
      try{
        for(let i=0;i<files.length;i++){
          button.textContent=`Nahrávám ${i+1} / ${files.length}…`;
          const blob=await compressImageBlob(files[i],1800,.82),upload=new FormData();upload.append('file',blob,`${files[i].name.replace(/\.[^.]+$/,'')||'united'}.jpg`);upload.append('caption',caption);
          await apiRequestForm('/api/gallery/submissions',upload);
        }
        form.reset();clearMemberPhotoSelection();await loadMemberGallery();toast('Fotky jsou nahrané a čekají na schválení United týmem.');
      }catch(error){console.error('Gallery upload failed',error);toast(error?.status===429?'Dnešní limit nahrávání byl dosažen.':formatApiError(error))}
      finally{setButtonBusy(button,false)}
    });
  }

  return {bind,handleLoadError,loadMemberGallery,renderMemberGallery,reset};
}
