import { accommodationVisualMarkup, bindAccommodationVisualFallbacks } from '../../../accommodation-visual.js?v=20260912-reservation-detail-ux-r1';
import { accommodationGalleryCue, accommodationPhotos, bindAccommodationGalleryTrigger } from '../../../accommodation-gallery.js?v=20260912-reservation-detail-ux-r1';
import { MAX_RESERVATION_CREW, newerPlannerDraft, validatePlannerDraft } from '../../../planner-state.js?v=20260827-reservation-limits';
import { $, esc, setButtonBusy, toast } from '../../ui.js?v=20260902-phase3';
import { createReservationPayments, formatCzk } from './payments.js?v=20260912-member-reservation-panels-r1';
import { normalizeAccommodationOption, normalizeReservation } from './reservation.js?v=20260911-reservation-flow-r1';
import { isAuthorizationFailure } from '../../refresh.js?v=20260907-feedback';

const plannerHandoffPrefix='e36UnitedPlannerHandoff:v1:';

export function createMemberPlanner({
  apiBaseUrl,
  apiRequest,
  getCurrentUser,
  getData,
  setReservation,
  renderActionCenter,
  openSection,
  getPrivateCarPhotoUrl,
  hasPrivateCarPhotoUrl,
  onReservationSaved,
  formatApiError,
  plannerDraftKey='e36UnitedPlannerDraftV19',
  initialHandoffId='',
}){
  let reservationState={registrationOpen:false,event:null,message:'',accommodationOptions:[]};
  let pendingPlannerHandoffId=initialHandoffId;
  let plannerHandoffMemory=null;
  let activePlannerHandoff=null;
  let plannerHandoffChoice='none';
  let plannerHandoffApplied=false;
  let plannerDraftSyncState='idle';
  let legacyPlannerDraftApplied=false;
  let approvedChangeMode=false;
  let plannerModalMode='';
  let approvedCurrentOptionReleased=false;
  let bound=false;
  let preliminary=null,preliminaryEnabled=false,preliminaryAvailable=true,preliminaryApplied=false;
  const preliminaryMode=()=>!getData().reservation&&!reservationState.registrationOpen&&preliminaryAvailable&&preliminaryEnabled;

  const reservationForm=$('[data-reservation-form]');
  const arrivalSelect=reservationForm?.elements?.arrival;
  const sleepField=$('[data-member-sleep-field]');
  const crewInput=reservationForm?.elements?.crew,accommodationUnitsInput=reservationForm?.elements?.accommodationUnits,sleepSelect=reservationForm?.elements?.sleep;
  const accommodationOptionField=$('[data-accommodation-option-field]'),accommodationOptionLabel=$('[data-accommodation-option-label]'),accommodationOptionSelect=reservationForm?.elements?.accommodationOptionId,accommodationAvailability=$('[data-accommodation-availability]');
  const accommodationPartialField=$('[data-accommodation-partial-field]'),accommodationPartialInput=reservationForm?.elements?.partialAccommodation,accommodationPeopleField=$('[data-accommodation-people-field]'),accommodationPreview=$('[data-accommodation-preview]');
  const changeModal=$('[data-reservation-change-modal]'),changeHost=$('[data-reservation-change-host]'),changeRecap=$('[data-reservation-change-recap]'),changePrice=$('[data-reservation-change-price]');
  const planState=$('[data-member-plan-state]'),planOpen=$('[data-member-plan-open]'),planRecap=$('[data-member-plan-recap]');
  const reservationFormHome=document.createComment('reservation-form-home');
  if(reservationForm)reservationForm.before(reservationFormHome);
  let changeModalRestoreFocus=null,changeModalBaseline='',changeModalScroll={x:0,y:0};
  const reservationPayments=createReservationPayments();

  function decodePlannerHandoff(value){
    try{
      const normalized=String(value||'').replace(/-/g,'+').replace(/_/g,'/'),padding='='.repeat((4-normalized.length%4)%4);
      const binary=atob(normalized+padding),bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    }catch(error){console.debug('Weekend Planner handoff could not be decoded.',error);return null}
  }
  function validatePlannerHandoff(candidate){return validatePlannerDraft(candidate)}
  function cleanupPlannerHandoffs(){
    try{for(let index=localStorage.length-1;index>=0;index--){const key=localStorage.key(index);if(!key?.startsWith(plannerHandoffPrefix))continue;let valid=null;try{valid=validatePlannerHandoff(JSON.parse(localStorage.getItem(key)||'null'))}catch{}if(!valid)localStorage.removeItem(key)}}
    catch(error){console.debug('Weekend Planner cleanup is unavailable.',error)}
  }
  function stripHandoffFragment(){
    const url=new URL(window.location.href),fragment=new URLSearchParams(url.hash.replace(/^#/,''));
    if(!fragment.has('handoff'))return;
    fragment.delete('handoff');url.hash=fragment.toString()?`#${fragment}`:'';
    try{history.replaceState(null,'',`${url.pathname}${url.search}${url.hash}`)}catch(error){console.debug('Weekend Planner address cleanup is unavailable.',error)}
  }
  function hydratePlannerHandoffFromUrl(){
    cleanupPlannerHandoffs();
    const fragment=new URLSearchParams(window.location.hash.replace(/^#/,'')),encoded=fragment.get('handoff');if(!encoded)return;
    const handoff=validatePlannerHandoff(decodePlannerHandoff(encoded));
    if(handoff&&(!pendingPlannerHandoffId||handoff.draftId===pendingPlannerHandoffId)){
      pendingPlannerHandoffId=handoff.draftId;plannerHandoffMemory=handoff;
      try{localStorage.setItem(`${plannerHandoffPrefix}${handoff.draftId}`,JSON.stringify(handoff))}catch(error){console.debug('Weekend Planner handoff remains in the URL for reload.',error);return}
    }
    stripHandoffFragment();
  }
  function loadPlannerHandoff(){
    if(!pendingPlannerHandoffId)return null;
    let candidate=plannerHandoffMemory?.draftId===pendingPlannerHandoffId?plannerHandoffMemory:null;
    if(!candidate){try{candidate=JSON.parse(localStorage.getItem(`${plannerHandoffPrefix}${pendingPlannerHandoffId}`)||'null')}catch(error){console.debug('Weekend Planner handoff storage is unavailable.',error)}}
    const valid=validatePlannerHandoff(candidate);
    if(!valid){try{localStorage.removeItem(`${plannerHandoffPrefix}${pendingPlannerHandoffId}`)}catch{}return null}
    const currentEventId=reservationState.event?.id||null;if(valid.eventId&&currentEventId&&String(valid.eventId)!==String(currentEventId))return null;
    plannerHandoffMemory=valid;return valid;
  }

  function reset(){
    if(changeModal&&!changeModal.hidden)closeChangePlanner({force:true,render:false});
    preliminary=null;preliminaryEnabled=false;preliminaryAvailable=true;preliminaryApplied=false;
    reservationState={registrationOpen:false,event:null,message:'',accommodationOptions:[]};plannerDraftSyncState='idle';activePlannerHandoff=null;legacyPlannerDraftApplied=false;approvedChangeMode=false;plannerModalMode='';approvedCurrentOptionReleased=false;
    reservationForm?.reset();if(reservationForm?.elements?.note)reservationForm.elements.note.value='';const cancelNote=$('[data-cancel-request-note]');if(cancelNote)cancelNote.value='';setReservationCarError(false);setReservationFormStatus();
  }

  async function loadCurrentReservation(){
    const user=getCurrentUser();
    const payload=await apiRequest('/api/reservations/current');
    if(getCurrentUser()!==user)throw new Error('api_auth_required');
    reservationState={
      registrationOpen:payload?.registrationOpen===true,
      event:payload?.event||null,
      message:payload?.message||'',
      accommodationOptions:Array.isArray(payload?.accommodationOptions)?payload.accommodationOptions.map(normalizeAccommodationOption).filter(option=>option.id):[],
    };
    if(!payload?.reservation){
      try{const interest=await apiRequest('/api/preliminary-reservations/current');if(getCurrentUser()!==user)throw new Error('api_auth_required');preliminary=interest.preliminary;preliminaryEnabled=interest.enabled===true;preliminaryAvailable=true;preliminaryApplied=false;}
      catch(error){if(getCurrentUser()!==user||isAuthorizationFailure(error))throw error;preliminaryAvailable=false;preliminaryEnabled=false;}
    }else{preliminary=null;preliminaryEnabled=false;}
    return normalizeReservation(payload?.reservation);
  }

  function applyPreliminary(){
    if(preliminaryApplied||preliminary?.status!=='active'||getData().reservation||!reservationForm)return;
    const p=preliminary.preferences;
    for(const [field,value] of Object.entries({carId:p.carId,arrival:p.arrival,crew:p.crew,sleep:p.accommodation,accommodationUnits:p.accommodationUnits,showshine:p.showShine,note:p.note,preliminaryCrewDetails:(p.crewDetails||[]).join('\n')}))if(reservationForm.elements[field])reservationForm.elements[field].value=value??'';
    if(accommodationPartialInput)accommodationPartialInput.checked=p.accommodationUnits>0&&p.accommodationUnits<p.crew;
    renderAccommodationOptionChoices(p.accommodationOptionId||'');syncMemberSleep();preliminaryApplied=true;
  }
  function renderPlanRecap(){
    if(!planRecap)return;const p=preliminary?.status==='active'?preliminary.preferences:null;planRecap.hidden=!p;if(!p){planRecap.replaceChildren();return}
    const car=getData().cars.find(item=>String(item.id)===String(p.carId)),option=reservationState.accommodationOptions.find(item=>item.id===p.accommodationOptionId);
    const accommodation=p.arrival==='Jen na otočku'||p.accommodation==='Bez ubytování'?'Bez ubytování':option?.name||'Dříve vybraná varianta už není dostupná';
    const values=[car?.nickname||car?.model||'Auto doplníš později',p.arrival,`${p.crew} ${p.crew===1?'osoba':p.crew<=4?'osoby':'osob'}`,accommodation,`Show & Shine: ${p.showShine}`];
    planRecap.replaceChildren(...values.map(value=>{const chip=document.createElement('span');chip.textContent=value;return chip}));
  }
  function renderPreliminary(){
    const active=preliminary?.status==='active',visible=!getData().reservation;
    if(!planState)return;planState.hidden=!visible;
    const crewField=$('[data-preliminary-crew]');if(crewField)crewField.hidden=plannerModalMode!=='plan'||reservationState.registrationOpen;
    if(reservationForm?.elements?.preliminaryCrewDetails)reservationForm.elements.preliminaryCrewDetails.readOnly=!preliminaryMode();
    const cancel=$('[data-preliminary-cancel]');if(cancel)cancel.hidden=!active||!preliminaryAvailable;
    const disclaimer=$('[data-member-plan-disclaimer]');if(disclaimer)disclaimer.hidden=!active;
    if(!visible)return;
    const title=$('[data-member-plan-title]'),copy=$('[data-member-plan-copy]');renderPlanRecap();
    if(!preliminaryAvailable){title.textContent='Plán teď nelze ověřit.';copy.textContent='Spojení se serverem se nezdařilo. Nehlásíme proto, že je plán uložený. Obnov stránku a zkus to znovu.';planOpen.hidden=true;return}
    if(active){
      title.textContent=reservationState.registrationOpen?'Rezervace jsou otevřené.':'Tvůj plán máme.';
      copy.textContent=reservationState.registrationOpen?'Rezervace jsou otevřené. Zkontroluj svůj plán a odešli ho ke schválení.':'Tvůj plán máme. Jakmile spustíme rezervace, dáme ti vědět.';
      planOpen.hidden=!reservationState.registrationOpen&&!preliminaryEnabled;planOpen.dataset.planAction=reservationState.registrationOpen?'convert':'edit';planOpen.innerHTML=reservationState.registrationOpen?'Zkontrolovat a odeslat <span>→</span>':'Upravit plán <span>→</span>';
      applyPreliminary();return;
    }
    if(reservationState.registrationOpen){title.textContent='Registrace jsou otevřené.';copy.textContent='Vyplň Weekend Planner a odešli standardní rezervaci ke schválení.';planOpen.hidden=false;planOpen.dataset.planAction='reserve';planOpen.innerHTML='Vytvořit rezervaci <span>→</span>';return}
    title.textContent=preliminaryEnabled?'Připrav si svůj United.':'Uložení plánu teď není dostupné.';
    copy.textContent=preliminaryEnabled?'Vyplň sdílený Weekend Planner a plán ulož výslovnou akcí. Kapacitu ani cenu tím nerezervuješ.':'Tento event nyní nepovoluje ukládání nezávazných plánů. Rozepsaný draft zůstává jen pro pokračování po přihlášení a není uloženým plánem.';
    planOpen.hidden=!preliminaryEnabled;planOpen.dataset.planAction='create';planOpen.innerHTML='Připravit plán <span>→</span>';
  }
  async function cancelPreliminary(){
    if(preliminary?.status!=='active')return;
    if(!window.confirm('Opravdu chceš zrušit uložený nezávazný plán?'))return;
    const user=getCurrentUser(),button=$('[data-preliminary-cancel]');setButtonBusy(button,true,'Ruším…');
    try{const payload=await apiRequest('/api/preliminary-reservations/current',{method:'DELETE',body:{eventId:preliminary.eventId,revision:preliminary.revision}});if(getCurrentUser()!==user)return;preliminary=payload.preliminary;preliminaryApplied=false;renderReservation();toast('Plán byl zrušen.');}
    catch(error){if(getCurrentUser()===user)setReservationFormStatus('error',formatApiError(error));}finally{setButtonBusy(button,false);}
  }

  async function loadServerPlannerDraft(){
    try{
      const payload=await apiRequest('/api/planner-draft');
      return {available:true,draft:validatePlannerHandoff(payload?.draft)};
    }catch(error){if(isAuthorizationFailure(error))throw error;console.warn('Planner draft API unavailable',error);return {available:false,draft:null,error}}
  }

  function preferredReservationCar(){const data=getData();return data.cars.find(car=>car.primary)||data.cars[0]||null}
  function ensureSelectedReservationCar(){
    const select=$('[data-car-select]');if(!select)return null;
    const data=getData();let car=data.cars.find(item=>String(item.id)===String(select.value));
    if(!car){car=preferredReservationCar();if(car)select.value=String(car.id)}
    return car||null;
  }
  function renderCarSelect(){
    const select=$('[data-car-select]');if(!select)return;
    const data=getData(),selectedId=select.value,optional=!data.reservation&&!reservationState.registrationOpen;
    select.innerHTML=`<option value="">${optional?'Auto doplníš později':'Vyber auto z garáže'}</option>`+data.cars.map(c=>`<option value="${c.id}">${esc(c.nickname||c.model)} · ${esc(c.body)}</option>`).join('');
    const selected=data.cars.find(car=>String(car.id)===String(selectedId))||(!optional?preferredReservationCar():null);if(selected)select.value=String(selected.id);else select.value='';
    if(data.cars.length)setReservationCarError(false);
  }

  function clampReservationNumber(value,min,max,fallback){const number=Math.trunc(Number(value));return Number.isFinite(number)?Math.max(min,Math.min(max,number)):fallback}
  function memberAccommodationKind(){return sleepSelect?.value==='Chatka'?'cabin':sleepSelect?.value==='Stan'?'tent':null}
  function currentApprovedAccommodationOption(){
    const reservation=getData().reservation,snapshot=reservation?.accommodationSnapshot;if(reservation?.status!=='approved'||!snapshot?.optionId)return null;
    const configured=reservationState.accommodationOptions.find(option=>option.id===snapshot.optionId);
    if(configured)return {...configured,currentApproved:true,configurationMissing:false};
    return {...normalizeAccommodationOption({id:snapshot.optionId,eventId:reservation.eventId,name:snapshot.optionName||'Původní ubytování',kind:snapshot.kind,
      inventoryMode:'limited',unitsTotal:snapshot.unitCount,freeUnits:snapshot.unitCount,capacityPerUnit:snapshot.capacityPerUnit,
      unitPriceCzk:snapshot.unitPriceCzk,personPriceCzk:snapshot.personPriceCzk,beddingFeePerPersonCzk:snapshot.beddingFeePerPersonCzk,
      cityTaxPerPersonPerNightCzk:snapshot.cityTaxPerPersonPerNightCzk,active:false,soldOut:false,visual:snapshot.visual,photos:[]}),currentApproved:true,configurationMissing:true,approvedSnapshot:snapshot};
  }
  function currentPreliminaryAccommodationOption(){
    const preferences=preliminary?.status==='active'?preliminary.preferences:null;if(!preferences?.accommodationOptionId)return null;
    const configured=reservationState.accommodationOptions.find(option=>option.id===preferences.accommodationOptionId);if(configured)return configured;
    return normalizeAccommodationOption({id:preferences.accommodationOptionId,eventId:preliminary.eventId,name:'Dříve vybraná varianta už není dostupná',kind:preferences.accommodation==='Stan'?'tent':'cabin',inventoryMode:'limited',unitsTotal:0,freeUnits:0,capacityPerUnit:Math.max(1,preferences.accommodationUnits||preferences.crew||1),unitPriceCzk:0,active:false,soldOut:true,photos:[]});
  }
  function matchingAccommodationOptions(){
    const kind=memberAccommodationKind(),options=reservationState.accommodationOptions.filter(option=>option.active&&option.kind===kind),current=approvedChangeMode?currentApprovedAccommodationOption():plannerModalMode==='plan'?currentPreliminaryAccommodationOption():null;
    if(current?.kind===kind&&!options.some(option=>option.id===current.id))options.unshift(current);
    else if(current?.kind===kind){const index=options.findIndex(option=>option.id===current.id);options[index]={...options[index],currentApproved:true,configurationMissing:false}}
    return options;
  }
  function selectedAccommodationOption(){return matchingAccommodationOptions().find(option=>option.id===accommodationOptionSelect?.value)||null}
  function accommodationUnitCount(people,option){return option?Math.ceil(people/Math.max(1,numericValue(option.capacityPerUnit))):0}
  function numericValue(value){return Number(value||0)}
  function reservationNights(arrival=arrivalSelect?.value){return arrival==='Pátek'?numericValue(reservationState.event?.fullWeekendNights??2):arrival==='Sobota'?numericValue(reservationState.event?.saturdayOnlyNights??1):0}
  function priceAccommodation(option,people){
    const unitCount=accommodationUnitCount(people,option),nights=reservationNights();
    const baseTotalCzk=unitCount*numericValue(option?.unitPriceCzk)*nights,personTotalCzk=people*numericValue(option?.personPriceCzk),beddingTotalCzk=people*numericValue(option?.beddingFeePerPersonCzk),cityTaxTotalCzk=people*nights*numericValue(option?.cityTaxPerPersonPerNightCzk);
    return {unitCount,nights,baseTotalCzk,personTotalCzk,beddingTotalCzk,cityTaxTotalCzk,totalCzk:baseTotalCzk+personTotalCzk+beddingTotalCzk+cityTaxTotalCzk};
  }
  function renderAccommodationOptionChoices(preferredId=''){
    if(!accommodationOptionSelect)return;
    const previous=preferredId||accommodationOptionSelect.value,options=matchingAccommodationOptions(),current=currentApprovedAccommodationOption();
    const prompt=options.length>1?'<option value="">Vyber konkrétní možnost</option>':'';
    accommodationOptionSelect.innerHTML=prompt+options.map(option=>{
      const availability=option.inventoryMode==='unlimited'?'bez omezení':option.soldOut?'VYPRODÁNO':`k dispozici: ${numericValue(option.freeUnits)}`,capacity=numericValue(option.capacityPerUnit),peopleWord=capacity===1?'osoba':capacity<=4?'osoby':'osob';
      const place=option.kind==='tent'?'jeden stan':'jednu chatku';
      const retainedCurrent=approvedChangeMode&&option.id===current?.id&&!approvedCurrentOptionReleased;
      const requestableSoldOut=option.active&&option.soldOut&&(approvedChangeMode||preliminaryMode());
      const disabled=!retainedCurrent&&(!option.active||(option.soldOut&&!requestableSoldOut));
      const stateCopy=option.configurationMissing?'PŮVODNÍ SCHVÁLENÁ VARIANTA':!option.active?'NYNÍ VYPNUTO · MŮŽEŠ PONECHAT':option.soldOut&&retainedCurrent?'AKTUÁLNÍ SCHVÁLENÁ VOLBA':requestableSoldOut?'VYPRODÁNO — LZE POŽÁDAT INDIVIDUÁLNĚ':availability;
      return `<option value="${esc(option.id)}" ${disabled?'disabled':''}>${esc(option.name)} · max. ${capacity} ${peopleWord} na ${place} · ${stateCopy}</option>`;
    }).join('');
    const preferred=options.find(option=>option.id===previous&&(!option.soldOut||(option.active&&(approvedChangeMode||preliminaryMode()))||(plannerModalMode==='plan'&&option.id===current?.id)||(approvedChangeMode&&option.id===current?.id&&!approvedCurrentOptionReleased)));
    if(preferred)accommodationOptionSelect.value=preferred.id;
    else if(options.length===1&&(!options[0].soldOut||preliminaryMode()))accommodationOptionSelect.value=options[0].id;
    else accommodationOptionSelect.value='';
    const oldNote=$('.reservation-current-option-note',accommodationOptionField);oldNote?.remove();
    if(current&&accommodationOptionSelect.value===current.id&&(!current.active||current.configurationMissing)){
      const note=document.createElement('small');note.className='reservation-current-option-note';note.textContent=current.configurationMissing?'Původní schválená varianta už není v aktuální nabídce. Můžeš ji ponechat při změně ostatních údajů; po přechodu jinam ji znovu nevybereš.':'Tato schválená varianta je nyní vypnutá. Můžeš ji ponechat, ale po přechodu jinam ji znovu nevybereš.';accommodationOptionField?.append(note);
      if(!approvedChangeMode)note.textContent='Dříve vybraná varianta už není v aktuální nabídce. Uložený plán jsme nezměnili; před dalším uložením nebo odesláním vyber dostupnou variantu.';
    }
  }
  function renderAccommodationPreview(){
    if(!accommodationPreview||!accommodationAvailability)return;
    const option=selectedAccommodationOption(),visibleCrewLimit=Math.max(MAX_RESERVATION_CREW,Number(crewInput?.value)||MAX_RESERVATION_CREW),people=clampReservationNumber(accommodationUnitsInput?.value,1,visibleCrewLimit,1);
    if(!option){const available=matchingAccommodationOptions();accommodationPreview.hidden=true;accommodationPreview.innerHTML='';accommodationAvailability.textContent=available.length&&available.every(item=>item.soldOut)?'Všechny možnosti tohoto typu jsou vyprodané.':available.length?'Vyber konkrétní možnost ubytování.':'Pro tento event zatím není tento typ ubytování dostupný.';accommodationAvailability.classList.toggle('is-warning',true);return}
    const stored=option.approvedSnapshot,pricingPeople=option.configurationMissing&&stored?stored.peopleCount:people;
    const pricing=option.configurationMissing&&stored?{unitCount:stored.unitCount,nights:stored.nights,baseTotalCzk:stored.baseTotalCzk,personTotalCzk:stored.personTotalCzk,beddingTotalCzk:stored.beddingTotalCzk,cityTaxTotalCzk:stored.cityTaxTotalCzk,totalCzk:stored.totalCzk}:priceAccommodation(option,people),free=option.freeUnits,hasCapacity=option.inventoryMode==='unlimited'||free>=pricing.unitCount;
    accommodationAvailability.classList.toggle('is-warning',option.configurationMissing||!hasCapacity);
    const place=option.kind==='tent'?'jeden stan':'jednu chatku',capacity=numericValue(option.capacityPerUnit),peopleWord=capacity===1?'osoba':capacity<=4?'osoby':'osob';
    const availabilityCopy=option.configurationMissing
      ? 'Původní schválená varianta. Aktuální dostupnost nelze ověřit; při změně pobytu vyber možnost ze současné nabídky.'
      : option.inventoryMode==='unlimited'
      ? `Dostupné bez omezení · max. ${capacity} ${peopleWord} na ${place}.`
      : !hasCapacity?(approvedChangeMode?'Vyprodáno — můžeš poslat individuální žádost. Kapacitu tím neblokuješ.':'Pro tvoji posádku už není dostatek volné kapacity.'):free===1?'Zbývá poslední volná možnost.':free===2?'Zbývají poslední 2 možnosti.':`Aktuálně k dispozici: ${free}.`;
    accommodationAvailability.textContent=availabilityCopy;
    const rows=[
      [`${pricing.unitCount}× ${option.name} · ${pricing.nights} ${pricing.nights===1?'noc':'noci'}`,pricing.baseTotalCzk],
      ['Poplatek za osoby',pricing.personTotalCzk],
      ['Povlečení',pricing.beddingTotalCzk],
      [`Pobytová taxa · ${pricing.nights} ${pricing.nights===1?'noc':'noci'}`,pricing.cityTaxTotalCzk],
    ].filter(([,value])=>value>0);
    const detailOpen=$('[data-reservation-price-details]',accommodationPreview)?.open===true;
    accommodationPreview.hidden=false;
    const photos=accommodationPhotos(option);
    const pricingLabel=option.configurationMissing?'Původní schválená cena':'Orientačně celkem';
    accommodationPreview.innerHTML=`<button class="accommodation-gallery-trigger" data-member-accommodation-gallery type="button">${accommodationVisualMarkup(option,{apiBaseUrl,nights:pricing.nights,className:'accommodation-visual--compact member-accommodation-preview'})}${accommodationGalleryCue(photos.length)}</button><div class="reservation-price-head"><span>${pricingPeople} ${pricingPeople===1?'osoba':pricingPeople<=4?'osoby':'osob'} · ${pricing.unitCount}× ${esc(option.name)}</span></div><div class="reservation-price-estimate"><span>${pricingLabel}</span><b>${esc(formatCzk(pricing.totalCzk))}</b></div><details class="reservation-price-details" data-reservation-price-details><summary><span class="price-detail-show">+ Detail ceny</span><span class="price-detail-hide">− Skrýt detail</span></summary><div class="reservation-price-breakdown">${rows.map(([label,value])=>`<div><span>${esc(label)}</span><b>${esc(formatCzk(value))}</b></div>`).join('')}<div class="reservation-price-total"><strong>Celkem</strong><b>${esc(formatCzk(pricing.totalCzk))}</b></div><small>${option.configurationMissing?'Cena vychází z uloženého schváleného snapshotu.':'Konečnou cenu ověříme při odeslání rezervace.'}</small></div></details>`;
    bindAccommodationVisualFallbacks(accommodationPreview);
    bindAccommodationGalleryTrigger($('[data-member-accommodation-gallery]',accommodationPreview),option,{apiBaseUrl});
    const priceDetails=$('[data-reservation-price-details]',accommodationPreview);if(priceDetails)priceDetails.open=detailOpen;
  }
  function syncMemberSleep(source='form'){
    if(!reservationForm||!arrivalSelect||!sleepField||!crewInput||!accommodationUnitsInput||!sleepSelect||!accommodationOptionSelect||!accommodationPartialInput)return;
    const data=getData(),editable=reservationFormIsEditable(),dayPass=arrivalSelect.value==='Jen na otočku',rawCrew=Number(crewInput.value),aboveLimit=Number.isInteger(rawCrew)&&rawCrew>MAX_RESERVATION_CREW;
    let crew=aboveLimit?rawCrew:clampReservationNumber(crewInput.value,1,MAX_RESERVATION_CREW,1);
    if(!aboveLimit)crewInput.value=String(crew);
    crewInput.setCustomValidity(aboveLimit?`Posádka může mít nejvýše ${MAX_RESERVATION_CREW} osob.`:'');
    const legacyCrewWarning=$('[data-legacy-crew-warning]',reservationForm);
    if(legacyCrewWarning){
      legacyCrewWarning.hidden=!aboveLimit;
      legacyCrewWarning.textContent=data.reservation?.crew>MAX_RESERVATION_CREW
        ? `Tato starší rezervace má ${rawCrew} osob. Před uložením sniž posádku nejvýše na ${MAX_RESERVATION_CREW}.`
        : `Posádka může mít nejvýše ${MAX_RESERVATION_CREW} osob.`;
    }
    sleepField.hidden=dayPass;if(dayPass)sleepSelect.value='Bez ubytování';
    const withoutAccommodation=dayPass||sleepSelect.value==='Bez ubytování';
    if(source==='accommodation')renderAccommodationOptionChoices();
    if(withoutAccommodation){accommodationUnitsInput.value='0';accommodationPartialInput.checked=false}
    else if(!accommodationPartialInput.checked)accommodationUnitsInput.value=String(crew);
    else accommodationUnitsInput.value=String(clampReservationNumber(accommodationUnitsInput.value,1,crew,crew));
    const partial=!withoutAccommodation&&accommodationPartialInput.checked;
    accommodationUnitsInput.min=withoutAccommodation?'0':'1';accommodationUnitsInput.max=String(crew);accommodationUnitsInput.disabled=!partial||!editable;
    const options=matchingAccommodationOptions(),singleUsableOption=options.length===1&&!options[0].soldOut;
    if(accommodationOptionField)accommodationOptionField.hidden=withoutAccommodation||singleUsableOption;
    if(accommodationOptionLabel)accommodationOptionLabel.textContent=sleepSelect.value==='Chatka'?'Typ chatky':'Typ stanu';
    if(accommodationPartialField)accommodationPartialField.hidden=withoutAccommodation;
    if(accommodationPeopleField)accommodationPeopleField.hidden=!partial;
    accommodationOptionSelect.disabled=withoutAccommodation||!editable||!options.length;
    if(withoutAccommodation){accommodationOptionSelect.value='';if(accommodationPreview)accommodationPreview.hidden=true;if(accommodationAvailability)accommodationAvailability.textContent='';renderChangePlannerRecap();return}
    renderAccommodationPreview();renderChangePlannerRecap();
  }
  function setReservationCarError(visible){const panel=$('[data-reservation-car-error]');if(panel)panel.hidden=!visible}
  function reservationFormIsEditable(reservation=getData().reservation){
    return !reservation?true:reservation.status==='approved'?approvedChangeMode&&reservation.request?.status!=='pending':reservationState.registrationOpen;
  }
  function setReservationFormStatus(type='',message=''){
    const panel=$('[data-reservation-form-status]');if(!panel)return;
    panel.hidden=!message;panel.dataset.state=message?type:'';panel.textContent=message||'';
    if(message&&type==='error')panel.setAttribute('role','alert');else panel.setAttribute('role','status');
    if(message)queueMicrotask(()=>panel.focus({preventScroll:false}));
  }
  function prefillApprovedReservation(reservation){
    if(!reservationForm||!reservation)return;
    if(reservationForm.elements.carId&&reservation.carId)reservationForm.elements.carId.value=reservation.carId;
    if(reservationForm.elements.arrival)reservationForm.elements.arrival.value=reservation.arrival||'Pátek';
    if(reservationForm.elements.crew)reservationForm.elements.crew.value=reservation.crew||2;
    if(reservationForm.elements.sleep)reservationForm.elements.sleep.value=reservation.sleep||'Chatka';
    if(reservationForm.elements.accommodationUnits)reservationForm.elements.accommodationUnits.value=reservation.accommodationUnits??0;
    if(accommodationPartialInput)accommodationPartialInput.checked=reservation.accommodationUnits>0&&reservation.accommodationUnits<reservation.crew;
    renderAccommodationOptionChoices(reservation.accommodationSnapshot?.optionId||'');
    if(reservationForm.elements.showshine)reservationForm.elements.showshine.value=reservation.showshine||'Ne';
    if(reservationForm.elements.note)reservationForm.elements.note.value=reservation.note||'';
    syncMemberSleep();
  }
  function changePlannerFingerprint(){
    if(!reservationForm)return '';
    return JSON.stringify({carId:reservationForm.elements.carId?.value||'',arrival:arrivalSelect?.value||'',crew:crewInput?.value||'',sleep:sleepSelect?.value||'',option:accommodationOptionSelect?.value||'',partial:!!accommodationPartialInput?.checked,units:accommodationUnitsInput?.value||'',showshine:reservationForm.elements.showshine?.value||'',crewDetails:reservationForm.elements.preliminaryCrewDetails?.value||'',note:reservationForm.elements.note?.value||''});
  }
  function renderChangePlannerRecap(){
    if(!changeRecap||!plannerModalMode)return;
    const option=selectedAccommodationOption(),crew=Number(crewInput?.value||0),arrival=arrivalSelect?.value||'—',show=reservationForm?.elements?.showshine?.value||'—';
    changeRecap.textContent=`${arrival} · ${option?.name||sleepSelect?.value||'Bez ubytování'} · ${crew} ${crew===1?'osoba':crew>=2&&crew<=4?'osoby':'osob'} · Show & Shine: ${show}`;
    if(changePrice){const people=Number(accommodationUnitsInput?.value||0),price=option&&people>0?option.configurationMissing?option.approvedSnapshot:priceAccommodation(option,people):null;changePrice.textContent=price?`${option.configurationMissing?'Původní schválená cena':'Orientačně'} ${formatCzk(price.totalCzk)}`:'Bez ceny ubytování'}
  }
  function changePlannerDirty(){return !!plannerModalMode&&changePlannerFingerprint()!==changeModalBaseline}
  function restoreReservationFormHome(){if(reservationForm&&reservationFormHome.parentNode)reservationFormHome.parentNode.insertBefore(reservationForm,reservationFormHome.nextSibling)}
  function closeChangePlanner({force=false,render=true,restoreFocus=true,restoreScroll=true}={}){
    if(!changeModal||changeModal.hidden)return true;
    if(!force&&changePlannerDirty()&&!window.confirm(plannerModalMode==='change'?'Zahodit neodeslaný návrh změny?':'Zahodit neuložené změny plánu?'))return false;
    changeModal.hidden=true;document.documentElement.classList.remove('reservation-change-planner-open');document.body.classList.remove('reservation-change-planner-open');
    restoreReservationFormHome();approvedChangeMode=false;plannerModalMode='';delete changeModal.dataset.plannerMode;approvedCurrentOptionReleased=false;setReservationFormStatus();
    if(render)renderReservation();
    const {x,y}=changeModalScroll;if(restoreScroll)requestAnimationFrame(()=>window.scrollTo({left:x,top:y,behavior:'auto'}));
    const target=changeModalRestoreFocus;changeModalRestoreFocus=null;if(restoreFocus&&target?.isConnected)requestAnimationFrame(()=>target.focus({preventScroll:true}));
    return true;
  }
  function focusPlannerModalStart(){requestAnimationFrame(()=>changeModal?.querySelector('[data-member-planner-title]')?.focus({preventScroll:true}))}
  function configurePlannerModal(mode){
    plannerModalMode=mode;approvedChangeMode=mode==='change';changeModal.dataset.plannerMode=mode;
    const kicker=$('[data-member-planner-kicker]'),title=$('[data-member-planner-title]'),copy=$('[data-member-planner-copy]'),label=$('[data-member-planner-recap-label]'),close=changeModal.querySelector('.member-modal-close');if(close)close.setAttribute('aria-label',mode==='change'?'Zavřít návrh změny':'Zavřít Weekend Planner');
    if(mode==='change'){kicker.textContent='WEEKEND PLANNER · NÁVRH ZMĚNY';title.textContent='Uprav svůj United.';copy.textContent='Tady připravuješ pouze návrh. Současná schválená rezervace zůstává platná a změna se projeví až po schválení United týmem.';label.textContent='NAVRHOVANÁ ZMĚNA';return}
    kicker.textContent='WEEKEND PLANNER · NEZÁVAZNÝ PLÁN';label.textContent='SOUHRN PLÁNU';
    if(reservationState.registrationOpen&&preliminary?.status==='active'){title.textContent='Zkontroluj a odešli rezervaci.';copy.textContent='Používáme aktuální nabídku, ceny, dostupnost a pravidla. Uložený plán zůstane aktivní, dokud skutečná rezervace nebude úspěšně vytvořena.'}
    else if(reservationState.registrationOpen){title.textContent='Dokonči rezervaci.';copy.textContent='Zkontroluj aktuální nabídku, doplň povinné auto a rezervaci výslovně odešli ke schválení.'}
    else if(preliminary?.status==='active'){title.textContent='Uprav svůj plán.';copy.textContent='Změny se uloží až po akci „Uložit změny plánu“. Plán je nezávazný a neblokuje kapacitu.'}
    else{title.textContent='Připrav svůj United.';copy.textContent='Vyplň sdílený Weekend Planner a plán výslovně ulož. Plán je nezávazný a neblokuje kapacitu.'}
  }
  function openChangePlanner(trigger){
    const reservation=getData().reservation;if(!changeModal||!changeHost||!reservationForm||reservation?.status!=='approved'||reservation.request?.status==='pending')return;
    changeModalRestoreFocus=trigger||document.activeElement;changeModalScroll={x:window.scrollX,y:window.scrollY};approvedCurrentOptionReleased=false;configurePlannerModal('change');setReservationFormStatus();
    prefillApprovedReservation(reservation);renderReservation();changeHost.append(reservationForm);changeModal.hidden=false;document.documentElement.classList.add('reservation-change-planner-open');document.body.classList.add('reservation-change-planner-open');
    renderChangePlannerRecap();changeModalBaseline=changePlannerFingerprint();focusPlannerModalStart();
  }
  function openPlanPlanner(trigger,{useHandoff=false}={}){
    if(!changeModal||!changeHost||!reservationForm||getData().reservation)return;
    if(!reservationState.registrationOpen&&!preliminaryEnabled)return;
    changeModalRestoreFocus=trigger?.closest?.('[data-reservation-section]')?trigger:planOpen||trigger||document.activeElement;changeModalScroll={x:window.scrollX,y:window.scrollY};approvedCurrentOptionReleased=false;configurePlannerModal('plan');setReservationFormStatus();
    if(useHandoff)applyPlannerHandoffToForm({navigate:false,replacePreliminary:true});else if(preliminary?.status==='active'){preliminaryApplied=false;applyPreliminary()}
    renderReservation();changeHost.append(reservationForm);reservationForm.hidden=false;changeModal.hidden=false;document.documentElement.classList.add('reservation-change-planner-open');document.body.classList.add('reservation-change-planner-open');
    renderChangePlannerRecap();changeModalBaseline=changePlannerFingerprint();focusPlannerModalStart();
  }
  function trapChangePlannerFocus(event){
    if(changeModal?.hidden||event.key!=='Tab')return;
    const focusable=[...changeModal.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(element=>element.getClientRects().length);
    if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  }

  function plannerReservationWindowState(){
    if(reservationState.registrationOpen)return 'open';
    const event=reservationState.event||{},openAt=Date.parse(event.registrationOpenAt||event.registration_open_at||''),closeAt=Date.parse(event.registrationCloseAt||event.registration_close_at||''),now=Date.now();
    if(Number.isFinite(openAt)&&now<openAt)return 'upcoming';
    if(Number.isFinite(closeAt)&&now>closeAt)return 'ended';
    return 'unavailable';
  }
  function isPlannerWaitingState(){const data=getData();return Boolean(activePlannerHandoff&&!reservationState.registrationOpen&&!data.reservation&&!preliminaryMode()&&preliminary?.status!=='active')}
  function isPlannerCarRequiredState(){const data=getData();return Boolean(activePlannerHandoff&&reservationState.registrationOpen&&!data.reservation&&!data.cars.length)}
  function renderPlannerHandoffRecap(container,handoff){
    if(!container)return;
    const handoffOption=reservationState.accommodationOptions.find(option=>option.id===handoff.accommodationOptionId),optionName=handoffOption?.name||handoff.accommodation;
    const units=handoff.accommodationUnits,accommodation=units?`${optionName} / ${units} ${units===1?'osoba':units<=4?'osoby':'osob'}`:handoff.accommodation;
    const crew=`${handoff.crew} ${handoff.crew===1?'osoba':handoff.crew<=4?'osoby':'osob'}`;
    const stay=handoff.arrival==='Jen na otočku'?handoff.arrival:`${handoff.arrival} → ${handoff.departure} · ${handoff.nights} ${handoff.nights===1?'noc':'noci'}`;
    container.replaceChildren(...[stay,accommodation,crew,`Show & Shine: ${handoff.showShine}`].map(value=>{const chip=document.createElement('span');chip.textContent=value;return chip}));
  }
  function renderPlannerHandoff(){
    const data=getData(),banner=$('[data-planner-handoff]'),section=$('[data-reservation-section]'),workbench=$('[data-reservation-workbench]');if(!banner)return;
    const waiting=isPlannerWaitingState(),carRequired=isPlannerCarRequiredState(),activePlan=preliminary?.status==='active';section?.classList.toggle('is-planner-waiting',waiting);section?.classList.toggle('is-planner-car-required',carRequired);if(workbench)workbench.hidden=!data.reservation||waiting||carRequired;
    if(!activePlannerHandoff||data.reservation){banner.hidden=true;banner.classList.remove('is-waiting');return}
    const closed=!reservationState.registrationOpen,title=$('[data-planner-handoff-title]'),copy=$('[data-planner-handoff-copy]'),recap=$('[data-planner-handoff-recap]'),next=$('[data-planner-handoff-next]'),continueButton=$('[data-planner-handoff-continue]'),nextCopy=$('[data-planner-handoff-next-copy]'),decision=$('[data-planner-handoff-decision]'),carPrompt=$('[data-planner-handoff-car]'),approved=$('[data-planner-handoff-approved]');
    banner.hidden=false;
    banner.classList.toggle('is-waiting',waiting);banner.dataset.reservationWindow=plannerReservationWindowState();
    if(activePlan){title.textContent='Weekend Planner obsahuje nový návrh.';copy.textContent='Uložený plán jsme nepřepsali. Otevři ho, nebo výslovně načti nové údaje a až potom změny ulož.'}
    else if(waiting){title.textContent='Uložení plánu teď není dostupné.';copy.textContent='Výběr z Weekend Planneru jsme zachovali jako draft, ale není uloženým plánem. Tento event nyní ukládání plánů nepovoluje.'}
    else if(carRequired){title.textContent='Výběr z Weekend Planneru máme.';copy.textContent='Údaje jsme přenesli. Ještě přidej svoje E36 a rezervaci dokončíš.'}
    else if(closed){title.textContent='DOKONČI SVŮJ PLÁN';copy.textContent='Výběr z Weekend Planneru jsme přenesli. Zkontroluj ho a ulož jako nezávazný plán.'}
    else{title.textContent='Výběr z Weekend Planneru máme.';copy.textContent='Údaje jsme předvyplnili. Zkontroluj aktuální nabídku a rezervaci výslovně odešli.'}
    renderPlannerHandoffRecap(recap,activePlannerHandoff);if(recap?.parentElement)recap.parentElement.hidden=!!data.reservation;
    next.hidden=activePlan||(!waiting&&!preliminaryMode()&&!reservationState.registrationOpen);continueButton.disabled=waiting;continueButton.setAttribute('aria-disabled',String(waiting));continueButton.innerHTML=reservationState.registrationOpen?'Zkontrolovat rezervaci <span>→</span>':'ZKONTROLOVAT A ULOŽIT PLÁN <span>→</span>';nextCopy.textContent=waiting?'Tento draft není serverově uložený plán.':'Údaje se uloží až po výslovném potvrzení v Planneru.';
    decision.hidden=!activePlan;if(activePlan){decision.querySelector('strong').textContent='Už máš uložený plán.';decision.querySelector('p').textContent='Chceš otevřít uložený plán, nebo ho výslovně nahradit tímto novým výběrem?';$('[data-planner-handoff-use]').innerHTML='Použít nový výběr <span>→</span>';$('[data-planner-handoff-keep]').textContent='Otevřít uložený plán'}
    carPrompt.hidden=!carRequired;
    approved.hidden=closed||!(plannerHandoffApplied&&data.reservation?.status==='approved');
    const submit=$('[data-reservation-submit]');if(submit&&reservationState.registrationOpen)submit.disabled=plannerHandoffApplied&&!data.cars.length;
  }
  function applyPlannerHandoffToForm({navigate=true,replacePreliminary=false}={}){
    if(preliminary?.status==='active'&&!getData().reservation&&!replacePreliminary)return;
    const data=getData(),handoff=activePlannerHandoff;if(!handoff||!reservationForm)return;
    if(reservationForm.elements.arrival)reservationForm.elements.arrival.value=handoff.arrival;
    if(reservationForm.elements.crew)reservationForm.elements.crew.value=handoff.crew;
    if(reservationForm.elements.sleep)reservationForm.elements.sleep.value=handoff.arrival==='Jen na otočku'?'Bez ubytování':handoff.accommodation;
    if(reservationForm.elements.accommodationUnits)reservationForm.elements.accommodationUnits.value=handoff.accommodationUnits;
    if(accommodationPartialInput)accommodationPartialInput.checked=handoff.accommodationUnits>0&&handoff.accommodationUnits<handoff.crew;
    renderAccommodationOptionChoices(handoff.accommodationOptionId||'');
    if(reservationForm.elements.showshine)reservationForm.elements.showshine.value=handoff.showShine;
    if(reservationForm.elements.note&&handoff.arrival!=='Jen na otočku'){
      const marker='[Weekend Planner] Odjezd:';
      const current=String(reservationForm.elements.note.value||'').split('\n').filter(line=>!line.startsWith(marker)).join('\n').trim();
      const stayNote=`${marker} ${handoff.departure} · ${handoff.nights} ${handoff.nights===1?'noc':'noci'}`;
      reservationForm.elements.note.value=current?`${stayNote}\n${current}`:stayNote;
    }
    syncMemberSleep();
    const selectedCar=data.cars.length===1?data.cars[0]:(data.cars.find(car=>car.primary)||data.cars[0]||null);
    if(selectedCar&&reservationForm.elements.carId)reservationForm.elements.carId.value=selectedCar.id;
    plannerHandoffApplied=true;plannerHandoffChoice='applied';if(navigate)openSection('reservation');if(data.reservation)renderPlannerHandoff();else if(plannerModalMode!=='plan')renderReservation();
  }
  function clearPlannerHandoff(){
    if(activePlannerHandoff?.draftId){try{localStorage.removeItem(`${plannerHandoffPrefix}${activePlannerHandoff.draftId}`)}catch(error){console.debug('Weekend Planner handoff could not be removed.',error)}}
    const url=new URL(window.location.href),fragment=new URLSearchParams(url.hash.replace(/^#/,''));url.searchParams.delete('draft');fragment.delete('handoff');url.hash=fragment.toString()?`#${fragment}`:'';
    try{history.replaceState(null,'',`${url.pathname}${url.search}${url.hash}`)}catch(error){console.debug('Weekend Planner address cleanup is unavailable.',error)}
    pendingPlannerHandoffId='';plannerHandoffMemory=null;activePlannerHandoff=null;plannerHandoffChoice='none';plannerHandoffApplied=false;renderPlannerHandoff();
  }
  async function clearPlannerDraftAfterPlanSave(){
    const eventId=preliminary?.eventId||reservationState.event?.id;clearPlannerHandoff();clearLegacyPlannerDraft();if(!eventId)return;
    try{await apiRequest(`/api/planner-draft?eventId=${encodeURIComponent(eventId)}`,{method:'DELETE'})}catch(error){console.warn('Saved Planner draft cleanup is unavailable.',error)}
  }
  function clearLegacyPlannerDraft(){
    try{localStorage.removeItem(plannerDraftKey);localStorage.removeItem('e36UnitedReservationDraftV20')}catch(error){console.debug('Starší Weekend Planner draft se nepodařilo odstranit.',error)}
    legacyPlannerDraftApplied=false;
  }

  const reservationStatusNames={pending:'Čeká na schválení',approved:'Schválena',rejected:'Zamítnuta',cancelled:'Zrušena'};
  const reservationStatusLoudNames={pending:'ČEKÁ NA SCHVÁLENÍ',approved:'SCHVÁLENA',rejected:'ZAMÍTNUTA',cancelled:'ZRUŠENA'};
  const reservationStatusSymbols={pending:'!',approved:'✓',rejected:'×',cancelled:'—'};
  function setReservationCardStatus(status){
    const key=reservationStatusNames[status]?status:'none';
    const elements=[$('.reservation-status-card'),$('.reservation-unified-card'),$('[data-reservation-card]'),$('[data-reservation-overview-card]'),$('.reservation-mini'),$('[data-reservation-nav-status]')].filter(Boolean);
    for(const element of elements){for(const value of [...Object.keys(reservationStatusNames),'none'])element.classList.remove(`is-status-${value}`);element.classList.add(`is-status-${key}`)}
    const navStatus=$('[data-reservation-nav-status]');if(navStatus)navStatus.title=reservationStatusNames[status]||'Bez rezervace';
  }
  function reservationDescription(reservation){
    if(!reservation)return reservationState.message||(reservationState.registrationOpen?'Registrace je otevřená. Připrav a odešli svoji rezervaci.':'Aktuálně není otevřená registrace na žádný event.');
    if(reservation.status==='rejected')return reservationState.registrationOpen?'Rezervace nebyla schválena. Údaje můžeš upravit a znovu odeslat.':'Rezervace nebyla schválena. Registrace je už uzavřená.';
    if(reservation.status==='cancelled')return reservationState.registrationOpen?'Rezervace je zrušená. Pokud chceš, můžeš ji upravit a znovu odeslat.':'Rezervace je zrušená. Registrace je už uzavřená.';
    if(reservation.cancellationPending)return 'Žádost o zrušení čeká na schválení. Do rozhodnutí zůstává rezervace platná.';
    return {pending:reservation.changePending?'Změna rezervace čeká na schválení. Do té doby nic nedoplácej.':'Rezervace čeká na kontrolu United týmem.',approved:reservation.changePending?'Změna rezervace čeká na schválení. Do té doby nic nedoplácej.':'Rezervace byla schválena United týmem.'}[reservation.status]||'Rezervace je uložená.';
  }
  function renderReservationCarPhoto(reservation){
    const data=getData(),card=$('[data-reservation-card]'),hero=$('[data-reservation-car-hero]');if(!card||!hero)return;
    const car=(reservation?data.cars.find(item=>String(item.id)===String(reservation.carId)):null)||data.cars.find(item=>item.primary)||data.cars[0]||null;
    const photo=car?.photos?.[0];
    if(!photo?.id){hero.hidden=true;hero.replaceChildren();delete hero.dataset.photoId;delete hero.dataset.loading;card.classList.remove('has-car-photo');return}
    const photoId=String(photo.id);
    if(hero.dataset.photoId===photoId&&card.classList.contains('has-car-photo')&&hasPrivateCarPhotoUrl(photoId))return;
    if(hero.dataset.photoId===photoId&&hero.dataset.loading==='true')return;
    hero.hidden=true;hero.replaceChildren();hero.dataset.photoId=photoId;hero.dataset.loading='true';card.classList.remove('has-car-photo');
    const img=document.createElement('img');img.alt=car.nickname||car.model||'Hlavní BMW E36';img.decoding='async';hero.append(img);
    void (async()=>{
      try{
        img.src=await getPrivateCarPhotoUrl(photoId);await img.decode().catch(()=>{});
        if(hero.dataset.photoId!==photoId)return;
        hero.hidden=false;card.classList.add('has-car-photo');
      }catch(error){if(hero.dataset.photoId===photoId){hero.hidden=true;hero.replaceChildren();card.classList.remove('has-car-photo')}console.warn('Reservation car photo unavailable',photoId,error)}
      finally{if(hero.dataset.photoId===photoId)delete hero.dataset.loading}
    })();
  }
  function renderReservationFormCopy(reservation){
    const kicker=$('[data-reservation-form-kicker]'),title=$('[data-reservation-form-title]');if(!kicker||!title)return;
    if(reservation&&approvedChangeMode){kicker.textContent='ŽÁDOST O ZMĚNU';title.textContent='Navrhni nové údaje';return}
    if(!reservation&&plannerModalMode==='plan'&&!reservationState.registrationOpen){kicker.textContent='NEZÁVAZNÝ PLÁN';title.textContent=preliminary?.status==='active'?'Uprav uložený plán':'Připrav svůj United';return}
    if(!reservation&&plannerModalMode==='plan'&&preliminary?.status==='active'){kicker.textContent='AKTUÁLNÍ NABÍDKA';title.textContent='Zkontroluj a odešli rezervaci';return}
    if(reservation){kicker.textContent='TVOJE REZERVACE';title.textContent='Přehled ubytování a ceny';return}
    if(reservationState.registrationOpen){kicker.textContent='DETAILY REZERVACE';title.textContent='Dokonči rezervaci';return}
    kicker.textContent='PŘIPRAV SI UNITED';title.textContent='Tvoje rezervace';
  }
  function renderSavedReservationPrice(reservation){
    const container=$('[data-reservation-saved-price]');if(!container)return;
    const snapshot=reservation?.accommodationSnapshot;
    if(!snapshot||reservationFormIsEditable(reservation)){container.hidden=true;container.innerHTML='';return}
    const rows=[
      [`${snapshot.unitCount}× ${snapshot.optionName} · ${snapshot.nights} ${snapshot.nights===1?'noc':'noci'}`,snapshot.baseTotalCzk],
      ['Poplatek za osoby',snapshot.personTotalCzk],
      ['Povlečení',snapshot.beddingTotalCzk],
      [`Pobytová taxa · ${snapshot.nights} ${snapshot.nights===1?'noc':'noci'}`,snapshot.cityTaxTotalCzk],
    ].filter(([,value])=>value>0);
    const liveOption=reservationState.accommodationOptions.find(option=>option.id===snapshot.optionId),mediaOption={...snapshot,...liveOption,id:snapshot.optionId,name:snapshot.optionName,visual:liveOption?.visual||snapshot.visual,photos:liveOption?.photos||[]},photos=accommodationPhotos(mediaOption);
    container.hidden=false;
    container.innerHTML=`<button class="accommodation-gallery-trigger" data-member-accommodation-gallery type="button">${accommodationVisualMarkup(mediaOption,{apiBaseUrl,nights:snapshot.nights,className:'accommodation-visual--compact member-saved-accommodation-visual'})}${accommodationGalleryCue(photos.length)}</button><div class="reservation-saved-price-head"><span>UBYTOVÁNÍ</span><b>${esc(snapshot.peopleCount)} ${snapshot.peopleCount===1?'osoba':'osob'} · ${esc(snapshot.unitCount)}× ${esc(snapshot.optionName)}</b><strong>${esc(formatCzk(snapshot.totalCzk))}</strong></div><details class="reservation-saved-price-details"><summary>Detail ceny <span aria-hidden="true">＋</span></summary><div>${rows.map(([label,value])=>`<small><span>${esc(label)}</span><b>${esc(formatCzk(value))}</b></small>`).join('')}<strong><span>CELKEM</span><b>${esc(formatCzk(snapshot.totalCzk))}</b></strong></div></details>`;bindAccommodationVisualFallbacks(container);bindAccommodationGalleryTrigger($('[data-member-accommodation-gallery]',container),mediaOption,{apiBaseUrl});
  }
  function requestValue(value){return value==null||value===''?'—':String(value)}
  function renderReservationRequest(reservation){
    const request=reservation?.request,status=$('[data-reservation-request-status]'),memberComment=$('[data-reservation-member-comment]'),actions=$('[data-reservation-member-actions]'),cancelPanel=$('[data-cancel-request]');
    const pending=request?.status==='pending';
    const acknowledgeable=request?.type==='change'&&['approved','rejected'].includes(request?.status),acknowledged=acknowledgeable&&!!request.memberAcknowledgedAt,visible=!!request&&!acknowledged;
    if(status){status.hidden=!visible;if(visible){const type=request.type==='cancellation'?'zrušení':'změnu',state={pending:'čeká na rozhodnutí',approved:'byla schválena',rejected:'byla zamítnuta'}[request.status]||request.status;const proposed=request.proposed,approved=request.type==='change'&&request.status==='approved',rejected=request.type==='change'&&request.status==='rejected';status.classList.toggle('is-approved-change',approved);status.classList.toggle('is-rejected-change',rejected);status.innerHTML=`<span class="member-kicker">${acknowledgeable?'VÝSLEDEK ŽÁDOSTI':`ŽÁDOST O ${type.toUpperCase()}`}</span><strong>${approved?'Žádost byla schválena':rejected?'Žádost o změnu byla zamítnuta':`Žádost ${esc(state)}`}</strong>${rejected?'<p>Původní schválená rezervace zůstává beze změny.</p>':''}${proposed?`<dl><div><dt>Pobyt</dt><dd>${esc(requestValue(proposed.arrival))} · ${esc(requestValue(proposed.crew))} osob</dd></div><div><dt>Ubytování</dt><dd>${esc(requestValue(proposed.accommodationSnapshot?.optionName||proposed.accommodation))}</dd></div><div><dt>${approved?'Výsledná cena':'Navržená cena'}</dt><dd>${esc(formatCzk(proposed.amountDueCzk))}</dd></div></dl>`:''}${request.memberNote?`<p><b>Tvoje zpráva:</b> ${esc(request.memberNote)}</p>`:''}${request.adminComment?`<p class="reservation-admin-comment"><b>United tým:</b> ${esc(request.adminComment)}</p>`:''}${acknowledgeable?'<button class="member-primary member-primary--compact" data-reservation-request-acknowledge type="button">Beru na vědomí</button>':''}`}}
    if(memberComment){memberComment.hidden=!reservation?.memberComment;memberComment.innerHTML=reservation?.memberComment?`<span class="member-kicker">ZPRÁVA OD UNITED TÝMU</span><p>${esc(reservation.memberComment)}</p>`:''}
    if(actions){actions.hidden=approvedChangeMode||!reservation||!['pending','approved'].includes(reservation.status)||pending;actions.querySelector('[data-request-change]').hidden=reservation?.status!=='approved'}
    if(cancelPanel&&pending)cancelPanel.hidden=true;
  }
  async function acknowledgeChangeDecision(){
    const data=getData(),request=data.reservation?.request,button=$('[data-reservation-request-acknowledge]');
    if(!data.reservation||request?.type!=='change'||!['approved','rejected'].includes(request.status)||request.memberAcknowledgedAt||button?.disabled)return;
    setButtonBusy(button,true,'Ukládám…');
    try{const payload=await apiRequest(`/api/reservations/${encodeURIComponent(data.reservation.id)}/requests/${encodeURIComponent(request.id)}/acknowledge`,{method:'POST'});setReservation(normalizeReservation({...data.reservation,request:payload.request}));renderReservation();toast(payload.message||'Potvrzení bylo uloženo.')}
    catch(error){const message=formatApiError(error);console.error('Reservation request acknowledgement failed',error);setReservationFormStatus('error',message);toast(message)}
    finally{if(button?.isConnected)setButtonBusy(button,false)}
  }
  function renderReservationCarChoice(reservation){
    const wrap=$('[data-reservation-car-choice]'),select=$('[data-reservation-car-select]'),formCar=$('[data-reservation-form-car]');if(formCar)formCar.hidden=!!reservation;if(!wrap||!select)return;
    const data=getData(),available=reservation&&['pending','approved'].includes(reservation.status)&&data.cars.length>0;wrap.hidden=!available;if(!available)return;
    select.innerHTML=data.cars.map(car=>`<option value="${esc(car.id)}">${esc(car.nickname||car.model||'BMW E36')} · ${esc(car.body||'')}</option>`).join('');select.value=reservation.carId||data.cars[0].id;
  }
  function renderReservation(){
    const data=getData(),r=data.reservation,miniStatus=$('[data-reservation-status]'),year=$('[data-res-year]'),title=$('[data-res-title]'),car=$('[data-res-car]'),mailState=$('[data-reservation-mail-state]');
    const unified=$('.reservation-unified-card');if(unified)unified.hidden=!r;
    const submit=$('[data-reservation-submit]');
    const editable=reservationFormIsEditable(r),changeCancel=$('[data-request-change-cancel]');
    if(reservationForm){reservationForm.hidden=!r&&plannerModalMode!=='plan';reservationForm.classList.toggle('is-editing',editable);reservationForm.classList.toggle('is-view-mode',!!r&&!editable);for(const field of reservationForm.elements){if(field.closest('[data-reservation-member-actions],[data-cancel-request]'))continue;field.disabled=!editable}renderAccommodationOptionChoices(r?.accommodationSnapshot?.optionId||accommodationOptionSelect?.value||'');syncMemberSleep()}
    if(changeCancel)changeCancel.hidden=!approvedChangeMode;
    const buttonLabels={pending:'Uložit změny',approved:'Odeslat žádost o změnu',rejected:'Upravit a znovu odeslat',cancelled:'Obnovit rezervaci'},rejectedClosed=r?.status==='rejected'&&!editable;
    const planLabel=reservationState.registrationOpen?(preliminary?.status==='active'?'Odeslat rezervaci ke schválení':'Odeslat rezervaci'):(preliminary?.status==='active'?'Uložit změny plánu':'Uložit plán');
    const buttonLabel=plannerModalMode==='plan'?planLabel:rejectedClosed?'Rezervace byla zamítnuta':!editable?(r?.status==='approved'?'REZERVACE JE SCHVÁLENÁ':'REGISTRACE JE UZAVŘENÁ'):!r&&!reservationState.registrationOpen?'Odeslat po otevření registrace':r?(buttonLabels[r.status]||'Uložit změny'):'Odeslat rezervaci';
    if(submit){submit.disabled=!editable;submit.classList.toggle('is-rejected-closed',rejectedClosed);submit.innerHTML=rejectedClosed?buttonLabel:`${buttonLabel} <span>→</span>`}
    setReservationCardStatus(r?.status);renderActionCenter({reservation:r,registrationOpen:reservationState.registrationOpen,plan:preliminary?.status==='active'?preliminary:null,planEnabled:preliminaryEnabled,plannerWaiting:isPlannerWaitingState(),plannerUnavailable:plannerDraftSyncState==='error',event:reservationState.event,plannerEventYear:activePlannerHandoff?.eventYear});renderReservationCarPhoto(r);renderSavedReservationPrice(r);reservationPayments.renderReservationPayment(r);renderReservationFormCopy(r);renderReservationRequest(r);renderReservationCarChoice(r);renderPlannerHandoff();
    if(!r){
      const open=reservationState.registrationOpen,waiting=isPlannerWaitingState(),eventYear=reservationState.event?.year||waiting&&activePlannerHandoff.eventYear||'NEXT';
      const activePlan=preliminary?.status==='active';if(miniStatus)miniStatus.textContent=activePlan?'Plán uložený':waiting?'Draft připravený':open?'Bez rezervace':'Registrace zavřená';if(year)year.textContent=eventYear;if(title)title.textContent=activePlan?'Tvůj plán':waiting?'Weekend Planner draft':`United ${eventYear}`;if(car)car.textContent=activePlan?(open?'Zkontroluj plán a odešli rezervaci.':'Nezávazný plán · bez rezervované kapacity'):waiting?'Draft čeká na možnost uložení.':open?'Vyber auto z garáže a odešli rezervaci.':'Aktuálně není otevřená registrace.';
      const stateKicker=$('.reservation-state>small');if(stateKicker)stateKicker.textContent='REGISTRACE';
      $('[data-reservation-state-symbol]').textContent=open?'+':'—';$('[data-reservation-state-label]').textContent=open?'REGISTRACE JE OTEVŘENÁ':'REGISTRACE JE UZAVŘENÁ';$('[data-reservation-year]').textContent=eventYear;$('[data-reservation-title]').textContent=`E36 United ${eventYear}`;$('[data-reservation-description]').textContent=activePlan?(open?'Rezervace jsou otevřené. Zkontroluj svůj plán a odešli ho ke schválení.':'Tvůj plán máme. Jakmile spustíme rezervace, dáme ti vědět.'):waiting?'Draft z Weekend Planneru není uloženým plánem.':open?'Vyber příjezd, posádku, Show & Shine a případné ubytování.':preliminaryEnabled?'Připrav a výslovně ulož nezávazný plán.':'Registrace i ukládání plánů jsou nyní uzavřené.';$('[data-reservation-summary]').innerHTML='';
      if(mailState){mailState.classList.remove('is-confirmed');mailState.querySelector('span').textContent=open?'Po odeslání bude rezervace čekat na schválení.':'Odeslání zpřístupníme po otevření registrace.'}
      renderPreliminary();
      return;
    }
    const stateKicker=$('.reservation-state>small');if(stateKicker)stateKicker.textContent='STAV REZERVACE';
    renderPreliminary();
    const statusText=reservationStatusNames[r.status]||r.status||'Čeká na schválení';
    if(reservationForm&&!approvedChangeMode)prefillApprovedReservation(r);
    if(miniStatus)miniStatus.textContent=statusText;if(year)year.textContent=r.year||'NEXT';if(title)title.textContent=r.title||'United rezervace';if(car)car.textContent=r.carSnapshot?`${r.carSnapshot.nickname||r.carSnapshot.model} · ${r.carSnapshot.body}`:'Auto zatím není vybrané';
    $('[data-reservation-state-symbol]').textContent=reservationStatusSymbols[r.status]||'·';$('[data-reservation-state-label]').textContent=r.cancellationPending?'ZRUŠENÍ ČEKÁ NA SCHVÁLENÍ':r.changePending?'ZMĚNA ČEKÁ NA SCHVÁLENÍ':reservationStatusLoudNames[r.status]||String(r.status||'AKTUÁLNÍ').toUpperCase();$('[data-reservation-year]').textContent=r.year||'NEXT';$('[data-reservation-title]').textContent=r.title||'E36 United';
    const description=reservationDescription(r);$('[data-reservation-description]').textContent=description;
    const sleep=r.arrival==='Jen na otočku'?'Bez ubytování':r.sleep;
    const snapshot=r.accommodationSnapshot,accommodationSummary=snapshot?`${snapshot.peopleCount} ${snapshot.peopleCount===1?'osoba':'osob'} · ${snapshot.unitCount}× ${snapshot.optionName}`:sleep==='Bez ubytování'?'Bez ubytování':`${sleep||'—'} · ${r.accommodationUnits} osob · cena —`;
    const crewWord=Number(r.crew)===1?'osoba':Number(r.crew)>=5?'osob':'osoby';
    const summary=$('[data-reservation-summary]');summary.innerHTML=`<div><small>AUTO</small><b>${esc(r.carSnapshot?.nickname||r.carSnapshot?.model||'—')}</b></div><div><small>PŘÍJEZD A POBYT</small><b>${esc(r.arrival||'—')}</b></div><div><small>POSÁDKA</small><b>${esc(r.crew)} ${crewWord}</b></div><div><small>SHOW &amp; SHINE</small><b>${esc(r.showShine||'—')}</b></div><div class="member-summary-accommodation"><span><small>UBYTOVÁNÍ</small><b>${esc(accommodationSummary)}</b></span></div>`;
    if(mailState){mailState.classList.toggle('is-confirmed',r.status==='approved');mailState.querySelector('span').textContent=description}
  }

  async function submitReservation(event){
    event.preventDefault();
    if(!getCurrentUser())return toast('Nejdřív se přihlas.');
    const data=getData();
    setReservationFormStatus();
    if(!reservationState.registrationOpen&&data.reservation?.status!=='approved'&&!preliminaryMode()){const message='Rezervaci si můžeš připravit. Odeslat ji půjde po otevření registrace.';setReservationFormStatus('error',message);return toast(message)}
    syncMemberSleep();const savingPlan=preliminaryMode(),car=savingPlan?data.cars.find(item=>String(item.id)===String(reservationForm.elements.carId?.value))||null:ensureSelectedReservationCar();
    if(!savingPlan&&(!data.cars.length||!car)){const message='Nejdřív přidej auto do garáže.';setReservationCarError(true);setReservationFormStatus('error',message);toast(message);return}
    setReservationCarError(false);const fd=new FormData(event.currentTarget);
    const crew=Number(fd.get('crew'));
    if(!Number.isInteger(crew)||crew<1||crew>MAX_RESERVATION_CREW){const message=`Posádka musí mít 1 až ${MAX_RESERVATION_CREW} osob.`;setReservationFormStatus('error',message);toast(message);crewInput?.focus();return}
    const arrival=fd.get('arrival')||'Pátek',sleep=arrival==='Jen na otočku'?'Bez ubytování':fd.get('sleep');
    const attendanceType=arrival==='Pátek'?'full_weekend':arrival==='Sobota'?'saturday_only':'day_visit';
    const wantsAccommodation=attendanceType!=='day_visit'&&sleep!=='Bez ubytování',accommodationOption=wantsAccommodation?selectedAccommodationOption():null;
    const accommodationUnits=wantsAccommodation?clampReservationNumber(accommodationUnitsInput.value,1,crew,crew):0;
    if(wantsAccommodation&&(!accommodationOption||!accommodationOption.active)){const message=accommodationOption&&!accommodationOption.active?'Dříve vybraná varianta už není dostupná. Vyber aktuální možnost ubytování.':'Vyber konkrétní typ ubytování.';setReservationFormStatus('error',message);toast(message);accommodationOptionSelect?.focus();return}
    if(!preliminaryMode()&&!approvedChangeMode&&accommodationOption?.inventoryMode==='limited'&&numericValue(accommodationOption.freeUnits)<accommodationUnitCount(accommodationUnits,accommodationOption)){const message=`${accommodationOption.name} už nemá dost volné kapacity pro tvoji posádku. Vyber jinou možnost.`;setReservationFormStatus('error',message);toast(message);accommodationOptionSelect?.focus();return}
    const button=$('[data-reservation-submit]');setButtonBusy(button,true,savingPlan?'Ukládám plán…':'Odesílám rezervaci…');
    let completedMessage='';
    try{
      const requestBody={reservationId:data.reservation?.id||null,carId:car?.id||null,arrival,crew,attendanceType,accommodation:sleep,accommodationOptionId:accommodationOption?.id||null,accommodationUnits,showShine:fd.get('showshine'),note:fd.get('note'),...(activePlannerHandoff&&plannerHandoffApplied?{plannerDraftId:activePlannerHandoff.draftId}:{})};
      if(savingPlan){
        const user=getCurrentUser();
        const payload=await apiRequest('/api/preliminary-reservations/current',{method:'PUT',body:{eventId:reservationState.event.id,revision:preliminary?.revision||0,carId:car?.id||null,arrival,crew,
          crewDetails:String(fd.get('preliminaryCrewDetails')||'').split('\n').map(value=>value.trim()).filter(Boolean),accommodation:sleep,accommodationOptionId:accommodationOption?.id||null,accommodationUnits,showShine:fd.get('showshine'),note:fd.get('note')}});
        if(getCurrentUser()!==user)return;preliminary=payload.preliminary;preliminaryApplied=true;await clearPlannerDraftAfterPlanSave();closeChangePlanner({force:true,render:false});completedMessage='Tvůj plán máme. Jakmile spustíme rezervace, dáme ti vědět.';toast(completedMessage);return;
      }
      if(!data.reservation&&preliminary?.status==='active'){requestBody.preliminaryId=preliminary.id;requestBody.preliminaryRevision=preliminary.revision;}
      if(data.reservation?.status==='approved'){
        const proposed={reservationId:requestBody.reservationId,type:'change',memberNote:'',arrival:requestBody.arrival,crew:requestBody.crew,accommodation:requestBody.accommodation,accommodationOptionId:requestBody.accommodationOptionId,accommodationUnits:requestBody.accommodationUnits,showShine:requestBody.showShine,note:requestBody.note};
        const payload=await apiRequest('/api/reservations/current/requests',{method:'POST',body:proposed});const reservation=normalizeReservation({...data.reservation,request:payload.request});setReservation(reservation);closeChangePlanner({force:true,render:false});completedMessage='Žádost o změnu byla odeslána ke schválení';toast(completedMessage);return;
      }
      const payload=await apiRequest('/api/reservations/current',{method:'PUT',body:requestBody});
      const reservation=normalizeReservation(payload?.reservation);if(!reservation)throw new Error('reservation_response_invalid');
      reservationState={registrationOpen:payload?.registrationOpen===true,event:payload?.event||reservationState.event,message:payload?.message||'',accommodationOptions:Array.isArray(payload?.accommodationOptions)?payload.accommodationOptions.map(normalizeAccommodationOption).filter(option=>option.id):reservationState.accommodationOptions};
      setReservation(reservation);if(activePlannerHandoff&&plannerHandoffApplied)clearPlannerHandoff();if(legacyPlannerDraftApplied)clearLegacyPlannerDraft();if(plannerModalMode==='plan')closeChangePlanner({force:true,render:false});onReservationSaved();completedMessage=payload?.message||'Rezervace byla uložena.';toast(completedMessage);
    }catch(error){const message=formatApiError(error);console.error('Reservation save failed',error);setReservationFormStatus('error',message);toast(message)}
    finally{setButtonBusy(button,false);if(completedMessage){renderReservation();setReservationFormStatus('success',completedMessage)}if(activePlannerHandoff&&plannerHandoffApplied&&!preliminaryMode())applyPlannerHandoffToForm()}
  }
  async function submitCancellation(){
    const data=getData(),button=$('[data-request-cancel-submit]');if(!data.reservation||button?.disabled)return;setButtonBusy(button,true,'Odesílám…');
    setReservationFormStatus();try{const payload=await apiRequest('/api/reservations/current/requests',{method:'POST',body:{reservationId:data.reservation.id,type:'cancellation',memberNote:$('[data-cancel-request-note]')?.value||''}});setReservation(normalizeReservation({...data.reservation,request:payload.request}));renderReservation();const message=payload.message||'Žádost o zrušení byla odeslána.';setReservationFormStatus('success',message);toast(message)}
    catch(error){const message=formatApiError(error);console.error('Cancellation request failed',error);setReservationFormStatus('error',message);toast(message)}finally{setButtonBusy(button,false)}
  }
  async function saveReservationCar(){
    const data=getData(),select=$('[data-reservation-car-select]'),button=$('[data-reservation-car-save]'),car=data.cars.find(item=>String(item.id)===String(select?.value));if(!data.reservation||!car)return;
    setButtonBusy(button,true,'Ukládám…');try{const payload=await apiRequest(`/api/reservations/${encodeURIComponent(data.reservation.id)}/car`,{method:'PATCH',body:{carId:car.id}});setReservation(normalizeReservation({...data.reservation,carId:car.id,carSnapshot:car}));renderReservation();toast(payload.message||'Auto rezervace bylo změněno.')}
    catch(error){console.error('Reservation car update failed',error);toast(formatApiError(error))}finally{setButtonBusy(button,false)}
  }

  async function applyPlannerDraft(serverResult={available:false,draft:null}){
    if(!reservationForm||!getCurrentUser())return;
    const data=getData(),localHandoff=loadPlannerHandoff(),serverHandoff=serverResult.draft;
    let handoff=newerPlannerDraft(localHandoff,serverHandoff);
    plannerDraftSyncState=serverResult.available?'ready':'error';
    if(localHandoff&&handoff===localHandoff){
      try{
        const payload=await apiRequest('/api/planner-draft',{method:'PUT',body:{draft:localHandoff}});
        handoff=validatePlannerHandoff(payload?.draft)||localHandoff;plannerDraftSyncState='ready';
      }catch(error){if(isAuthorizationFailure(error))throw error;console.warn('Planner handoff promotion failed; local fallback retained.',error);plannerDraftSyncState='error';handoff=localHandoff}
    }
      if(handoff){
      void apiRequest('/api/planner-handoffs/claim',{method:'POST',body:{draft:handoff}}).catch(error=>console.warn('Planner tracking unavailable',error));
      activePlannerHandoff=handoff;plannerHandoffApplied=false;plannerHandoffChoice=data.reservation||preliminary?.status==='active'?'kept':'applied';
      if(preliminary?.status==='active'&&!data.reservation){applyPreliminary();renderReservation();toast('Uložený plán jsme nepřepsali. Vyber, zda chceš otevřít uložený plán, nebo načíst nový výběr.')}
      else if(!data.reservation)applyPlannerHandoffToForm({navigate:false});else{renderPlannerHandoff();toast('Pro tento ročník už máš rezervaci. Uložený plán ji nepřepsal.')}
      return handoff;
    }
    if(preliminary?.status==='active'&&!data.reservation){applyPreliminary();renderPreliminary();return}
    if(plannerDraftSyncState==='error'){renderReservationOverview(data.reservation);toast('Uložený plán teď nelze ověřit. Přihlášení i případný lokální plán zůstaly beze změny.');return}
    let raw=null;try{raw=localStorage.getItem(plannerDraftKey)||localStorage.getItem('e36UnitedReservationDraftV20')}catch(error){console.debug('Starší výběr z Weekend Planneru není dostupný.',error)}
    if(!raw)return;
    try{
      const draft=JSON.parse(raw);if(!draft)return;
      if(data.reservation){
        toast('Už máš rezervaci. Starší výběr z Weekend Planneru ji nepřepsal.');
        return;
      }
      if(reservationForm.elements.arrival)reservationForm.elements.arrival.value=draft.arrival||'Pátek';
      if(reservationForm.elements.crew)reservationForm.elements.crew.value=draft.people||2;
      if(reservationForm.elements.sleep)reservationForm.elements.sleep.value=draft.arrival==='Jen na otočku'?'Bez ubytování':(draft.sleep||'Chatka');
      if(accommodationPartialInput)accommodationPartialInput.checked=false;
      renderAccommodationOptionChoices(draft.accommodationOptionId||'');
      const showMap={'Chci soutěžit':'Ano','Jedu se podívat':'Ne','Možná':'Možná'};
      if(reservationForm.elements.showshine)reservationForm.elements.showshine.value=showMap[draft.showshine]||draft.showshine||'Ne';
      syncMemberSleep();
      const selectedCar=data.cars.find(c=>c.primary)||data.cars[0]||null;
      if(selectedCar&&reservationForm.elements.carId)reservationForm.elements.carId.value=selectedCar.id;
      legacyPlannerDraftApplied=true;
      toast(selectedCar?'Výběr z Weekend Planneru je připravený. Zkontroluj ho a rezervaci odešli.':'Výběr z Weekend Planneru je připravený. Přidej auto a rezervaci odešli.');
    }catch(error){console.warn(error)}
  }

  function handleGarageCarSaved({resumeReservation}){
    if(activePlannerHandoff&&plannerHandoffApplied){renderReservation();applyPlannerHandoffToForm()}
    else if(resumeReservation)openSection('reservation');
  }

  function bind(){
    if(bound)return;bound=true;
    $('[data-preliminary-cancel]')?.addEventListener('click',cancelPreliminary);
    planOpen?.addEventListener('click',event=>openPlanPlanner(event.currentTarget));
    arrivalSelect?.addEventListener('change',()=>syncMemberSleep('arrival'));
    crewInput?.addEventListener('input',()=>syncMemberSleep('crew'));crewInput?.addEventListener('change',()=>syncMemberSleep('crew'));
    accommodationUnitsInput?.addEventListener('input',()=>syncMemberSleep('accommodationUnits'));accommodationUnitsInput?.addEventListener('change',()=>syncMemberSleep('accommodationUnits'));
    sleepSelect?.addEventListener('change',()=>{const current=currentApprovedAccommodationOption();if(approvedChangeMode&&current&&memberAccommodationKind()!==current.kind)approvedCurrentOptionReleased=true;syncMemberSleep('accommodation')});
    accommodationOptionSelect?.addEventListener('change',()=>{const current=currentApprovedAccommodationOption();if(approvedChangeMode&&current&&accommodationOptionSelect.value!==current.id){approvedCurrentOptionReleased=true;renderAccommodationOptionChoices(accommodationOptionSelect.value)}syncMemberSleep('option')});
    accommodationPartialInput?.addEventListener('change',()=>syncMemberSleep('partial'));
    syncMemberSleep();
    reservationForm?.elements?.carId?.addEventListener('change',()=>{if(plannerModalMode==='plan'||ensureSelectedReservationCar())setReservationCarError(false)});
    $('[data-planner-handoff-use]')?.addEventListener('click',event=>{if(preliminary?.status==='active'&&!getData().reservation){openPlanPlanner(event.currentTarget,{useHandoff:true});toast('Nový výběr je načtený. Uložený plán se změní až po výslovném uložení.');return}applyPlannerHandoffToForm();if(!getData().reservation)openPlanPlanner(event.currentTarget);toast('Nový plán je připravený ve formuláři. Zkontroluj ho a výslovně odešli.')});
    $('[data-planner-handoff-keep]')?.addEventListener('click',event=>{plannerHandoffChoice='kept';plannerHandoffApplied=false;if(preliminary?.status==='active'&&!getData().reservation){openPlanPlanner(event.currentTarget);return}renderReservation();renderPlannerHandoff();toast('Současná rezervace zůstala beze změny.')});
    $('[data-planner-handoff-overview]')?.addEventListener('click',()=>openSection('overview'));
    $('[data-planner-handoff-continue]')?.addEventListener('click',event=>{if(getData().reservation){approvedChangeMode=false;openSection('reservation');renderReservation();return}openPlanPlanner(event.currentTarget)});
    $('[data-request-change]')?.addEventListener('click',event=>openChangePlanner(event.currentTarget));
    $('[data-request-change-cancel]')?.addEventListener('click',()=>closeChangePlanner());
    $('[data-request-cancel-open]')?.addEventListener('click',()=>{const panel=$('[data-cancel-request]');if(panel){panel.hidden=false;$('[data-cancel-request-note]')?.focus()}});
    $('[data-request-cancel-close]')?.addEventListener('click',()=>{const panel=$('[data-cancel-request]');if(panel)panel.hidden=true});
    $('[data-request-cancel-submit]')?.addEventListener('click',submitCancellation);
    document.addEventListener('click',event=>{if(event.target.closest('[data-reservation-request-acknowledge]'))void acknowledgeChangeDecision()});
    document.addEventListener('click',event=>{const trigger=event.target.closest('[data-reservation-form-jump]');if(trigger&&!getData().reservation&&(reservationState.registrationOpen||preliminaryEnabled))requestAnimationFrame(()=>openPlanPlanner(trigger))});
    $('[data-reservation-car-save]')?.addEventListener('click',saveReservationCar);
    changeModal?.querySelectorAll('[data-reservation-change-close]').forEach(element=>element.addEventListener('click',()=>closeChangePlanner()));
    changeModal?.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeChangePlanner();return}trapChangePlannerFocus(event)});
    reservationForm?.addEventListener('input',renderChangePlannerRecap);
    reservationForm?.addEventListener('change',renderChangePlannerRecap);
    reservationForm?.addEventListener('submit',submitReservation);
  }

  return {hasActiveHandoff:()=>Boolean(activePlannerHandoff),applyPlannerDraft,bind,handleGarageCarSaved,hydratePlannerHandoffFromUrl,loadCurrentReservation,loadServerPlannerDraft,renderCarSelect,renderReservation,renderReservationCarPhoto,requestClose:options=>closeChangePlanner(options),reset,setReservationCarError};
}
