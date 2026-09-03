import { createImagePreviewController, selectImageFiles } from '../../image-upload.js?v=20260827-garage-photos';
import { compressImageBlob } from '../media.js?v=20260903-phase4b';
import { $, $$, esc, setButtonBusy, toast } from '../ui.js?v=20260902-phase3';

export function createMemberGarage({
  apiRequest,
  apiRequestForm,
  apiRequestBlob,
  getCurrentUser,
  getCars,
  setCars,
  refreshClub,
  renderReservationCarSelect,
  renderReservationCarPhoto,
  clearReservationCarError,
  onCarDisplayChanged,
  onCarSaved,
  renderEditIcon,
  formatApiError,
}){
  const carPhotoObjectUrls=new Map(),carPhotoObjectUrlRequests=new Map();
  const carModal=$('[data-car-modal]'),carForm=$('[data-car-form]'),carPhotoInput=$('[data-car-photo-input]');
  let carPhotoRequestGeneration=0,editingCarId='',selectedCarPhoto=null,returnToReservationAfterCar=false,carPhotoPreview=null,bound=false;

  function clearCarPhotoObjectUrls(){carPhotoRequestGeneration+=1;for(const url of carPhotoObjectUrls.values())URL.revokeObjectURL(url);carPhotoObjectUrls.clear();carPhotoObjectUrlRequests.clear()}
  function pruneCarPhotoObjectUrls(){
    const activeIds=new Set(getCars().flatMap(car=>(car.photos||[]).map(photo=>String(photo.id))));
    for(const [id,url] of carPhotoObjectUrls){if(!activeIds.has(String(id))){URL.revokeObjectURL(url);carPhotoObjectUrls.delete(id)}}
    for(const id of carPhotoObjectUrlRequests.keys()){if(!activeIds.has(String(id)))carPhotoObjectUrlRequests.delete(id)}
  }
  async function getPrivateCarPhotoUrl(photoId){
    if(carPhotoObjectUrls.has(photoId))return carPhotoObjectUrls.get(photoId);
    if(carPhotoObjectUrlRequests.has(photoId))return await carPhotoObjectUrlRequests.get(photoId);
    const generation=carPhotoRequestGeneration,userId=getCurrentUser()?.uid;
    let request;request=apiRequestBlob(`/api/cars/media/${encodeURIComponent(photoId)}`).then(blob=>{
      if(generation!==carPhotoRequestGeneration||userId!==getCurrentUser()?.uid||!getCars().some(car=>(car.photos||[]).some(photo=>String(photo.id)===String(photoId))))throw new Error('stale_car_photo_request');
      const existing=carPhotoObjectUrls.get(photoId);if(existing)return existing;const url=URL.createObjectURL(blob);carPhotoObjectUrls.set(photoId,url);return url;
    }).finally(()=>{if(carPhotoObjectUrlRequests.get(photoId)===request)carPhotoObjectUrlRequests.delete(photoId)});
    carPhotoObjectUrlRequests.set(photoId,request);
    return await request;
  }
  function hasPrivateCarPhotoUrl(photoId){return carPhotoObjectUrls.has(photoId)}
  async function loadCarsFromApi(){
    const payload=await apiRequest('/api/cars');
    return Array.isArray(payload?.cars)?payload.cars:[];
  }

  function renderGarage(){
    const grid=$('[data-garage-grid]'),cars=getCars();
    if(!grid)return;
    pruneCarPhotoObjectUrls();
    if(!cars.length){grid.innerHTML='<div class="garage-empty"><div><b>Garáž je zatím prázdná.</b><br><small>Přidej svoje první E36. Fotku můžeš doplnit kdykoliv později.</small></div></div>';renderReservationCarSelect();renderReservationCarPhoto();return}
    grid.innerHTML=cars.map(c=>{const first=c.photos?.[0],name=c.nickname||c.model;return `<article class="car-card" data-car-card="${esc(c.id)}" ${c.primary?'data-primary-car-card':''}><div class="car-photo">${first?`<img data-car-photo-id="${esc(first.id)}" alt="${esc(name)}">`:'<div class="car-photo-placeholder">E36</div>'}${c.primary?'<span class="car-primary">HLAVNÍ AUTO</span>':''}<button aria-label="Upravit ${esc(name)}" class="car-edit" data-edit-car="${esc(c.id)}" title="Upravit auto" type="button">${renderEditIcon()}</button></div><div class="car-body"><small>${esc(c.body)} · ${esc(c.year||'')}</small><h3>${esc(name)}</h3><p>${esc(c.model)}${c.color?' · '+esc(c.color):''}</p><div class="car-actions"><button data-primary-car="${esc(c.id)}">${c.primary?'Hlavní':'Nastavit hlavní'}</button><button data-delete-car="${esc(c.id)}">Odebrat</button></div></div></article>`}).join('');
    $$('[data-edit-car]').forEach(button=>button.onclick=()=>{const car=getCars().find(item=>String(item.id)===String(button.dataset.editCar));if(car)openCarModal(car)});
    $$('[data-primary-car]').forEach(button=>button.onclick=async()=>{try{await apiRequest(`/api/cars/${encodeURIComponent(button.dataset.primaryCar)}/primary`,{method:'POST'});setCars(await loadCarsFromApi());renderGarage();onCarDisplayChanged();toast('Hlavní auto změněno')}catch(error){console.error(error);toast(formatApiError(error))}});
    $$('[data-delete-car]').forEach(button=>button.onclick=async()=>{if(!confirm('Odebrat auto z garáže včetně jeho fotek?'))return;try{await apiRequest(`/api/cars/${encodeURIComponent(button.dataset.deleteCar)}`,{method:'DELETE'});setCars(await loadCarsFromApi());renderGarage();onCarDisplayChanged();toast('Auto odebráno')}catch(error){console.error(error);toast(formatApiError(error))}});
    renderReservationCarSelect();
    hydrateCarPhotos();
    renderReservationCarPhoto();
  }
  async function hydrateCarPhotos(){
    for(const img of $$('img[data-car-photo-id]')){
      const id=img.dataset.carPhotoId;if(!id)continue;
      try{img.src=await getPrivateCarPhotoUrl(id)}
      catch(error){console.warn('Car photo unavailable',id,error);img.replaceWith(Object.assign(document.createElement('div'),{className:'car-photo-placeholder',textContent:'E36'}))}
    }
  }

  function syncCarPhotoSelection(){
    const action=$('[data-car-photo-action]'),name=$('[data-car-photo-name]'),clear=$('[data-car-photo-clear]'),current=$('[data-car-current-photo]');
    if(action)action.textContent=selectedCarPhoto?'Změnit fotku':editingCarId&&current&&!current.hidden?'Změnit fotku':'Vybrat fotku';
    if(name)name.textContent=selectedCarPhoto?selectedCarPhoto.name:'JPG, PNG nebo WEBP · max. 12 MB';
    if(clear)clear.hidden=!selectedCarPhoto;
    if(current)current.hidden=Boolean(selectedCarPhoto)||!current.dataset.available;
  }
  function clearSelectedCarPhoto(){selectedCarPhoto=null;if(carPhotoInput)carPhotoInput.value='';carPhotoPreview?.clear();syncCarPhotoSelection()}
  function closeCarModal(){
    if(!carModal)return;carModal.hidden=true;delete carModal.dataset.carId;document.body.classList.remove('modal-open');returnToReservationAfterCar=false;editingCarId='';carForm?.reset();clearSelectedCarPhoto();
    const current=$('[data-car-current-photo]');if(current){current.hidden=true;delete current.dataset.available}
  }
  function openCarModal(car=null){
    if(!carModal||!carForm)return;
    editingCarId=car?.id?String(car.id):'';carModal.dataset.carId=editingCarId;carForm.reset();clearSelectedCarPhoto();
    const title=$('[data-car-modal-title]'),kicker=$('[data-car-modal-kicker]'),copy=$('[data-car-modal-copy]'),submit=$('[data-car-submit]'),current=$('[data-car-current-photo]'),currentImage=$('[data-car-current-photo-image]');
    if(title)title.textContent=editingCarId?'Upravit auto.':'Přidat auto.';
    if(kicker)kicker.textContent=editingCarId?'MY GARAGE · ÚPRAVA':'MY GARAGE · NOVÉ AUTO';
    if(copy)copy.textContent=editingCarId?'Změň jen to, co potřebuješ. Auto zůstane pod stejným ID a současná fotka se nahradí až po úspěšném uploadu.':'Fotka není povinná. Pro profil auta používáme jednu privátní fotografii načítanou přes autorizovaný endpoint.';
    if(submit)submit.innerHTML=editingCarId?'Uložit změny <span>→</span>':'Přidat do garáže <span>→</span>';
    if(car){for(const field of ['nickname','body','model','year','color'])if(carForm.elements[field])carForm.elements[field].value=car[field]??'';if(carForm.elements.primary)carForm.elements.primary.checked=car.primary===true}
    if(current){current.hidden=true;delete current.dataset.available}
    const photoId=car?.photos?.[0]?.id;
    if(photoId&&current&&currentImage){void getPrivateCarPhotoUrl(String(photoId)).then(url=>{if(editingCarId!==String(car.id)||selectedCarPhoto)return;currentImage.src=url;current.dataset.available='true';current.hidden=false;syncCarPhotoSelection()}).catch(error=>console.warn('Current car photo preview unavailable',error))}
    carModal.hidden=false;document.body.classList.add('modal-open');requestAnimationFrame(()=>carForm.elements.nickname?.focus());syncCarPhotoSelection();
  }
  function openCarForReservation(){returnToReservationAfterCar=true;openCarModal()}

  function bind(){
    if(bound)return;bound=true;carPhotoPreview=createImagePreviewController($('[data-car-photo-preview]'));
    $('[data-open-car]')?.addEventListener('click',openCarModal);
    $('[data-planner-handoff-add-car]')?.addEventListener('click',openCarForReservation);
    $('[data-reservation-add-car]')?.addEventListener('click',openCarForReservation);
    $$('[data-close-car]').forEach(button=>button.addEventListener('click',closeCarModal));
    carPhotoInput?.addEventListener('change',()=>{
      const selection=selectImageFiles(carPhotoInput.files,{maxFiles:1});
      if(selection.invalidType||selection.tooLarge){carPhotoInput.value='';selectedCarPhoto=null;carPhotoPreview.clear();syncCarPhotoSelection();return toast(selection.tooLarge?'Fotka může mít nejvýše 12 MB.':'Vyber JPG, PNG nebo WebP.')}
      selectedCarPhoto=selection.files[0]||null;carPhotoPreview.render(selection.files);syncCarPhotoSelection();
    });
    $('[data-car-photo-clear]')?.addEventListener('click',clearSelectedCarPhoto);
    carForm?.addEventListener('submit',async event=>{
      event.preventDefault();
      if(!getCurrentUser())return toast('Nejdřív se přihlas.');
      const form=event.currentTarget,button=form.querySelector('button[type="submit"]'),fd=new FormData(form),file=selectedCarPhoto,carId=editingCarId;
      setButtonBusy(button,true,'Ukládám auto…');
      try{
        const blob=file?await compressImageBlob(file,1800,.82):null,payload={nickname:fd.get('nickname'),body:fd.get('body'),model:fd.get('model'),year:fd.get('year'),color:fd.get('color'),primary:fd.get('primary')==='on'};
        let savedCarId=carId;
        if(carId)await apiRequest(`/api/cars/${encodeURIComponent(carId)}`,{method:'PUT',body:payload});
        else{const created=await apiRequest('/api/cars',{method:'POST',body:payload});savedCarId=created?.car?.id;if(!savedCarId)throw new Error('car_create_failed')}
        let photoError=null;
        if(blob){
          const upload=new FormData();upload.append('file',blob,`${file.name.replace(/\.[^.]+$/,'')||'car'}.jpg`);
          try{await apiRequestForm(`/api/cars/${encodeURIComponent(savedCarId)}/photos`,upload,{method:carId?'PUT':'POST'})}catch(error){photoError=error}
        }
        setCars(await loadCarsFromApi());await refreshClub();
        const resumeReservation=returnToReservationAfterCar;closeCarModal();clearReservationCarError();renderGarage();onCarSaved({resumeReservation});
        returnToReservationAfterCar=false;
        if(photoError){console.error('Car photo replacement failed',photoError);toast(carId?'Změny auta jsou uložené. Původní fotka zůstala beze změny.':'Auto je uložené, ale fotku se nepodařilo přidat.');return}
        toast(carId?(file?'Auto i nová fotka byly aktualizovány.':'Změny auta byly uloženy.'):(file?'Auto i fotka jsou uložené v Můj United.':'Auto je uložené v Můj United.'));
      }catch(error){console.error('Car upload failed',error);toast(error?.status===409?'Profilovou fotku se nepodařilo uložit.':formatApiError(error))}
      finally{setButtonBusy(button,false)}
    });
  }

  return {bind,getPrivateCarPhotoUrl,hasPrivateCarPhotoUrl,loadCarsFromApi,openCarModal,renderGarage,reset:clearCarPhotoObjectUrls};
}
