import { accommodationVisualMarkup, bindAccommodationVisualFallbacks } from '../../../accommodation-visual.js?v=20260827-accommodation1';
import { MAX_RESERVATION_CREW, newerPlannerDraft, validatePlannerDraft } from '../../../planner-state.js?v=20260827-reservation-limits';
import { $, esc, setButtonBusy, toast } from '../../ui.js?v=20260902-phase3';
import { createReservationPayments, formatCzk } from './payments.js?v=20260903-phase4c';
import { normalizeAccommodationOption, normalizeReservation } from './reservation.js?v=20260903-phase4c';

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
  let bound=false;

  const reservationForm=$('[data-reservation-form]');
  const arrivalSelect=reservationForm?.elements?.arrival;
  const sleepField=$('[data-member-sleep-field]');
  const crewInput=reservationForm?.elements?.crew,accommodationUnitsInput=reservationForm?.elements?.accommodationUnits,sleepSelect=reservationForm?.elements?.sleep;
  const accommodationOptionField=$('[data-accommodation-option-field]'),accommodationOptionLabel=$('[data-accommodation-option-label]'),accommodationOptionSelect=reservationForm?.elements?.accommodationOptionId,accommodationAvailability=$('[data-accommodation-availability]');
  const accommodationPartialField=$('[data-accommodation-partial-field]'),accommodationPartialInput=reservationForm?.elements?.partialAccommodation,accommodationPeopleField=$('[data-accommodation-people-field]'),accommodationPreview=$('[data-accommodation-preview]');
  const reservationPayments=createReservationPayments({openSection});

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
      try{localStorage.setItem(`${plannerHandoffPrefix}${handoff.draftId}`,JSON.stringify(handoff))}catch(error){console.debug('Weekend Planner handoff remains in this session.',error)}
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

  function reset(){reservationState={registrationOpen:false,event:null,message:'',accommodationOptions:[]};plannerDraftSyncState='idle';activePlannerHandoff=null;legacyPlannerDraftApplied=false}

  async function loadCurrentReservation(){
    const payload=await apiRequest('/api/reservations/current');
    reservationState={
      registrationOpen:payload?.registrationOpen===true,
      event:payload?.event||null,
      message:payload?.message||'',
      accommodationOptions:Array.isArray(payload?.accommodationOptions)?payload.accommodationOptions.map(normalizeAccommodationOption).filter(option=>option.id):[],
    };
    return normalizeReservation(payload?.reservation);
  }

  async function loadServerPlannerDraft(){
    try{
      const payload=await apiRequest('/api/planner-draft');
      return {available:true,draft:validatePlannerHandoff(payload?.draft)};
    }catch(error){console.warn('Planner draft API unavailable',error);return {available:false,draft:null,error}}
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
    const data=getData(),selectedId=select.value;select.innerHTML=data.cars.length?data.cars.map(c=>`<option value="${c.id}">${esc(c.nickname||c.model)} · ${esc(c.body)}</option>`).join(''):'<option value="">Nejdřív přidej auto do garáže</option>';
    const selected=data.cars.find(car=>String(car.id)===String(selectedId))||preferredReservationCar();if(selected)select.value=String(selected.id);
    if(data.cars.length)setReservationCarError(false);
  }

  function clampReservationNumber(value,min,max,fallback){const number=Math.trunc(Number(value));return Number.isFinite(number)?Math.max(min,Math.min(max,number)):fallback}
  function memberAccommodationKind(){return sleepSelect?.value==='Chatka'?'cabin':sleepSelect?.value==='Stan'?'tent':null}
  function matchingAccommodationOptions(){const kind=memberAccommodationKind();return reservationState.accommodationOptions.filter(option=>option.active&&option.kind===kind)}
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
    const previous=preferredId||accommodationOptionSelect.value,options=matchingAccommodationOptions();
    const prompt=options.length>1?'<option value="">Vyber konkrétní možnost</option>':'';
    accommodationOptionSelect.innerHTML=prompt+options.map(option=>{
      const availability=option.inventoryMode==='unlimited'?'bez omezení':option.soldOut?'VYPRODÁNO':`k dispozici: ${numericValue(option.freeUnits)}`,capacity=numericValue(option.capacityPerUnit),peopleWord=capacity===1?'osoba':capacity<=4?'osoby':'osob';
      const place=option.kind==='tent'?'jeden stan':'jednu chatku';
      return `<option value="${esc(option.id)}" ${option.soldOut?'disabled':''}>${esc(option.name)} · max. ${capacity} ${peopleWord} na ${place} · ${availability}</option>`;
    }).join('');
    const preferred=options.find(option=>option.id===previous&&!option.soldOut);
    if(preferred)accommodationOptionSelect.value=preferred.id;
    else if(options.length===1&&!options[0].soldOut)accommodationOptionSelect.value=options[0].id;
    else accommodationOptionSelect.value='';
  }
  function renderAccommodationPreview(){
    if(!accommodationPreview||!accommodationAvailability)return;
    const option=selectedAccommodationOption(),visibleCrewLimit=Math.max(MAX_RESERVATION_CREW,Number(crewInput?.value)||MAX_RESERVATION_CREW),people=clampReservationNumber(accommodationUnitsInput?.value,1,visibleCrewLimit,1);
    if(!option){const available=matchingAccommodationOptions();accommodationPreview.hidden=true;accommodationPreview.innerHTML='';accommodationAvailability.textContent=available.length&&available.every(item=>item.soldOut)?'Všechny možnosti tohoto typu jsou vyprodané.':available.length?'Vyber konkrétní možnost ubytování.':'Pro tento event zatím není tento typ ubytování dostupný.';accommodationAvailability.classList.toggle('is-warning',true);return}
    const pricing=priceAccommodation(option,people),free=option.freeUnits,hasCapacity=option.inventoryMode==='unlimited'||free>=pricing.unitCount;
    accommodationAvailability.classList.toggle('is-warning',!hasCapacity);
    const place=option.kind==='tent'?'jeden stan':'jednu chatku',capacity=numericValue(option.capacityPerUnit),peopleWord=capacity===1?'osoba':capacity<=4?'osoby':'osob';
    const availabilityCopy=option.inventoryMode==='unlimited'
      ? `Dostupné bez omezení · max. ${capacity} ${peopleWord} na ${place}.`
      : !hasCapacity?'Pro tvoji posádku už není dostatek volné kapacity.':free===1?'Zbývá poslední volná možnost.':free===2?'Zbývají poslední 2 možnosti.':`Aktuálně k dispozici: ${free}.`;
    accommodationAvailability.textContent=availabilityCopy;
    const rows=[
      [`${pricing.unitCount}× ${option.name} · ${pricing.nights} ${pricing.nights===1?'noc':'noci'}`,pricing.baseTotalCzk],
      ['Poplatek za osoby',pricing.personTotalCzk],
      ['Povlečení',pricing.beddingTotalCzk],
      [`Pobytová taxa · ${pricing.nights} ${pricing.nights===1?'noc':'noci'}`,pricing.cityTaxTotalCzk],
    ].filter(([,value])=>value>0);
    const detailOpen=$('[data-reservation-price-details]',accommodationPreview)?.open===true;
    accommodationPreview.hidden=false;
    accommodationPreview.innerHTML=`${accommodationVisualMarkup(option,{apiBaseUrl,nights:pricing.nights,className:'accommodation-visual--compact member-accommodation-preview'})}<div class="reservation-price-head"><span>${people} ${people===1?'osoba':people<=4?'osoby':'osob'} · ${pricing.unitCount}× ${esc(option.name)}</span></div><div class="reservation-price-estimate"><span>Orientačně celkem</span><b>${esc(formatCzk(pricing.totalCzk))}</b></div><details class="reservation-price-details" data-reservation-price-details><summary><span class="price-detail-show">+ Detail ceny</span><span class="price-detail-hide">− Skrýt detail</span></summary><div class="reservation-price-breakdown">${rows.map(([label,value])=>`<div><span>${esc(label)}</span><b>${esc(formatCzk(value))}</b></div>`).join('')}<div class="reservation-price-total"><strong>Celkem</strong><b>${esc(formatCzk(pricing.totalCzk))}</b></div><small>Konečnou cenu ověříme při odeslání rezervace.</small></div></details>`;
    bindAccommodationVisualFallbacks(accommodationPreview);
    const priceDetails=$('[data-reservation-price-details]',accommodationPreview);if(priceDetails)priceDetails.open=detailOpen;
  }
  function syncMemberSleep(source='form'){
    if(!reservationForm||!arrivalSelect||!sleepField||!crewInput||!accommodationUnitsInput||!sleepSelect||!accommodationOptionSelect||!accommodationPartialInput)return;
    const data=getData(),dayPass=arrivalSelect.value==='Jen na otočku',rawCrew=Number(crewInput.value),aboveLimit=Number.isInteger(rawCrew)&&rawCrew>MAX_RESERVATION_CREW;
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
    accommodationUnitsInput.min=withoutAccommodation?'0':'1';accommodationUnitsInput.max=String(crew);accommodationUnitsInput.disabled=!partial||!reservationState.registrationOpen;
    const options=matchingAccommodationOptions(),singleUsableOption=options.length===1&&!options[0].soldOut;
    if(accommodationOptionField)accommodationOptionField.hidden=withoutAccommodation||singleUsableOption;
    if(accommodationOptionLabel)accommodationOptionLabel.textContent=sleepSelect.value==='Chatka'?'Typ chatky':'Typ stanu';
    if(accommodationPartialField)accommodationPartialField.hidden=withoutAccommodation;
    if(accommodationPeopleField)accommodationPeopleField.hidden=!partial;
    accommodationOptionSelect.disabled=withoutAccommodation||!reservationState.registrationOpen||!options.length;
    if(withoutAccommodation){accommodationOptionSelect.value='';if(accommodationPreview)accommodationPreview.hidden=true;if(accommodationAvailability)accommodationAvailability.textContent='';return}
    renderAccommodationPreview();
  }
  function setReservationCarError(visible){const panel=$('[data-reservation-car-error]');if(panel)panel.hidden=!visible}

  function plannerReservationWindowState(){
    if(reservationState.registrationOpen)return 'open';
    const event=reservationState.event||{},openAt=Date.parse(event.registrationOpenAt||event.registration_open_at||''),closeAt=Date.parse(event.registrationCloseAt||event.registration_close_at||''),now=Date.now();
    if(Number.isFinite(openAt)&&now<openAt)return 'upcoming';
    if(Number.isFinite(closeAt)&&now>closeAt)return 'ended';
    return 'unavailable';
  }
  function isPlannerWaitingState(){const data=getData();return Boolean(activePlannerHandoff&&!reservationState.registrationOpen&&!data.reservation)}
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
    const waiting=isPlannerWaitingState(),carRequired=isPlannerCarRequiredState();section?.classList.toggle('is-planner-waiting',waiting);section?.classList.toggle('is-planner-car-required',carRequired);if(workbench)workbench.hidden=waiting||carRequired;
    if(!activePlannerHandoff){banner.hidden=true;banner.classList.remove('is-waiting');return}
    const closed=!reservationState.registrationOpen,title=$('[data-planner-handoff-title]'),copy=$('[data-planner-handoff-copy]'),recap=$('[data-planner-handoff-recap]'),next=$('[data-planner-handoff-next]'),continueButton=$('[data-planner-handoff-continue]'),nextCopy=$('[data-planner-handoff-next-copy]'),decision=$('[data-planner-handoff-decision]'),carPrompt=$('[data-planner-handoff-car]'),approved=$('[data-planner-handoff-approved]');
    banner.hidden=false;
    banner.classList.toggle('is-waiting',waiting);banner.dataset.reservationWindow=plannerReservationWindowState();
    if(waiting){title.textContent='TVŮJ PLÁN JE PŘIPRAVENÝ';copy.textContent='Výběr z Weekend Planneru jsme uložili. Jakmile spustíme rezervace na další United, dokončíš ho tady.'}
    else if(carRequired){title.textContent='Výběr z Weekend Planneru máme.';copy.textContent='Údaje jsme přenesli. Ještě přidej svoje E36 a rezervaci dokončíš.'}
    else if(closed){title.textContent='Tvůj nový plán jsme zachovali.';copy.textContent='Skutečná rezervace zůstává beze změny a její stav má vždy přednost.'}
    else if(plannerHandoffChoice==='kept'){title.textContent='Současná rezervace zůstává.';copy.textContent='Tvůj nový výběr jsme zachovali, ale do formuláře jsme ho nepřenesli.'}
    else if(!data.reservation){title.textContent='Výběr z Weekend Planneru máme.';copy.textContent='Údaje jsme předvyplnili. Zkontroluj je níže a odešli rezervaci.'}
    else{title.textContent='Výběr z Weekend Planneru máme.';copy.textContent='Příjezd, ubytování a posádku jsme přenesli. Zkontroluj detaily a rezervaci odešli.'}
    renderPlannerHandoffRecap(recap,activePlannerHandoff);
    next.hidden=!waiting;continueButton.disabled=true;continueButton.setAttribute('aria-disabled','true');nextCopy.textContent='Rezervace na další United ještě nejsou spuštěné.';
    decision.hidden=closed||!(data.reservation&&plannerHandoffChoice==='pending');
    carPrompt.hidden=!carRequired;
    approved.hidden=closed||!(plannerHandoffApplied&&data.reservation?.status==='approved');
    const submit=$('[data-reservation-submit]');if(submit&&reservationState.registrationOpen)submit.disabled=plannerHandoffApplied&&!data.cars.length;
  }
  function applyPlannerHandoffToForm({navigate=true}={}){
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
    plannerHandoffApplied=true;plannerHandoffChoice='applied';if(navigate)openSection('reservation');if(data.reservation)renderPlannerHandoff();else renderReservation();
  }
  function clearPlannerHandoff(){
    if(activePlannerHandoff?.draftId){try{localStorage.removeItem(`${plannerHandoffPrefix}${activePlannerHandoff.draftId}`)}catch(error){console.debug('Weekend Planner handoff could not be removed.',error)}}
    const url=new URL(window.location.href),fragment=new URLSearchParams(url.hash.replace(/^#/,''));url.searchParams.delete('draft');fragment.delete('handoff');url.hash=fragment.toString()?`#${fragment}`:'';
    try{history.replaceState(null,'',`${url.pathname}${url.search}${url.hash}`)}catch(error){console.debug('Weekend Planner address cleanup is unavailable.',error)}
    pendingPlannerHandoffId='';plannerHandoffMemory=null;activePlannerHandoff=null;plannerHandoffChoice='none';plannerHandoffApplied=false;renderPlannerHandoff();
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
    const elements=[$('[data-reservation-card]'),$('[data-reservation-overview-card]'),$('.reservation-mini'),$('[data-reservation-nav-status]')].filter(Boolean);
    for(const element of elements){for(const value of [...Object.keys(reservationStatusNames),'none'])element.classList.remove(`is-status-${value}`);element.classList.add(`is-status-${key}`)}
    const navStatus=$('[data-reservation-nav-status]');if(navStatus)navStatus.title=reservationStatusNames[status]||'Bez rezervace';
  }
  function reservationDescription(reservation){
    if(!reservation)return reservationState.message||(reservationState.registrationOpen?'Registrace je otevřená. Připrav a odešli svoji rezervaci.':'Aktuálně není otevřená registrace na žádný event.');
    if(reservation.status==='rejected')return reservationState.registrationOpen?'Rezervace nebyla schválena. Údaje můžeš upravit a znovu odeslat.':'Rezervace nebyla schválena. Registrace je už uzavřená.';
    if(reservation.status==='cancelled')return reservationState.registrationOpen?'Rezervace je zrušená. Pokud chceš, můžeš ji upravit a znovu odeslat.':'Rezervace je zrušená. Registrace je už uzavřená.';
    return {pending:reservation.changePending?'Změna rezervace čeká na schválení. Do té doby nic nedoplácej.':'Rezervace čeká na kontrolu United týmem.',approved:'Rezervace byla schválena United týmem.'}[reservation.status]||'Rezervace je uložená.';
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
    if(reservation){kicker.textContent='TVOJE REZERVACE';title.textContent='Zkontrolovat nebo upravit';return}
    if(reservationState.registrationOpen){kicker.textContent='DETAILY REZERVACE';title.textContent='Dokonči rezervaci';return}
    kicker.textContent='PŘIPRAV SI UNITED';title.textContent='Tvoje rezervace';
  }
  function renderSavedReservationPrice(reservation){
    const container=$('[data-reservation-saved-price]');if(!container)return;
    const snapshot=reservation?.accommodationSnapshot;
    if(!snapshot){container.hidden=true;container.innerHTML='';return}
    const rows=[
      [`${snapshot.unitCount}× ${snapshot.optionName} · ${snapshot.nights} ${snapshot.nights===1?'noc':'noci'}`,snapshot.baseTotalCzk],
      ['Poplatek za osoby',snapshot.personTotalCzk],
      ['Povlečení',snapshot.beddingTotalCzk],
      [`Pobytová taxa · ${snapshot.nights} ${snapshot.nights===1?'noc':'noci'}`,snapshot.cityTaxTotalCzk],
    ].filter(([,value])=>value>0);
    container.hidden=false;
    container.innerHTML=`${accommodationVisualMarkup({...snapshot,id:snapshot.optionId,name:snapshot.optionName},{apiBaseUrl,nights:snapshot.nights,className:'accommodation-visual--compact member-saved-accommodation-visual'})}<div><span>CENA UBYTOVÁNÍ</span><b>${esc(snapshot.peopleCount)} ${snapshot.peopleCount===1?'osoba':'osob'} · ${esc(snapshot.unitCount)}× ${esc(snapshot.optionName)}</b></div>${rows.map(([label,value])=>`<small><span>${esc(label)}</span><b>${esc(formatCzk(value))}</b></small>`).join('')}<strong><span>CELKEM</span><b>${esc(formatCzk(snapshot.totalCzk))}</b></strong>`;bindAccommodationVisualFallbacks(container);
  }
  function renderReservation(){
    const data=getData(),r=data.reservation,miniStatus=$('[data-reservation-status]'),year=$('[data-res-year]'),title=$('[data-res-title]'),car=$('[data-res-car]'),mailState=$('[data-reservation-mail-state]');
    const submit=$('[data-reservation-submit]');
    if(reservationForm){for(const field of reservationForm.elements)field.disabled=!reservationState.registrationOpen;renderAccommodationOptionChoices(r?.accommodationSnapshot?.optionId||accommodationOptionSelect?.value||'');syncMemberSleep()}
    const buttonLabels={pending:'Uložit změny',approved:'Upravit rezervaci',rejected:'Upravit a znovu odeslat',cancelled:'Obnovit rezervaci'};
    const buttonLabel=!reservationState.registrationOpen?'REGISTRACE JE UZAVŘENÁ':r?(buttonLabels[r.status]||'Uložit změny'):'Odeslat rezervaci';
    if(submit){submit.disabled=!reservationState.registrationOpen;if(!submit.dataset.originalHtml)submit.innerHTML=`${buttonLabel} <span>→</span>`}
    setReservationCardStatus(r?.status);renderActionCenter({reservation:r,registrationOpen:reservationState.registrationOpen,plannerWaiting:isPlannerWaitingState(),plannerUnavailable:plannerDraftSyncState==='error',event:reservationState.event,plannerEventYear:activePlannerHandoff?.eventYear});renderReservationCarPhoto(r);renderSavedReservationPrice(r);reservationPayments.renderReservationPayment(r);renderReservationFormCopy(r);renderPlannerHandoff();
    if(!r){
      const open=reservationState.registrationOpen,waiting=isPlannerWaitingState(),eventYear=reservationState.event?.year||waiting&&activePlannerHandoff.eventYear||'NEXT';
      if(miniStatus)miniStatus.textContent=waiting?'Plán připravený':open?'Bez rezervace':'Registrace zavřená';if(year)year.textContent=eventYear;if(title)title.textContent=waiting?'Tvůj plán je připravený':`United ${eventYear}`;if(car)car.textContent=waiting?'Dokončíš ho tady, jakmile spustíme rezervace.':open?'Vyber auto z garáže a odešli rezervaci.':'Aktuálně není otevřená registrace.';
      const stateKicker=$('.reservation-state>small');if(stateKicker)stateKicker.textContent='REGISTRACE';
      $('[data-reservation-state-symbol]').textContent=open?'+':'—';$('[data-reservation-state-label]').textContent=open?'JEŠTĚ NEMÁŠ REZERVACI':'UZAVŘENÁ';$('[data-reservation-year]').textContent=eventYear;$('[data-reservation-title]').textContent=`E36 United ${eventYear}`;$('[data-reservation-description]').textContent=waiting?'Tvůj plán je připravený. Dokončíš ho po otevření rezervací.':open?'Vyber auto, zkontroluj údaje a odešli rezervaci.':'Výběr si můžeš projít už teď. Odeslat ho půjde po otevření registrace.';$('[data-reservation-summary]').innerHTML='';
      if(mailState){mailState.classList.remove('is-confirmed');mailState.querySelector('span').textContent=open?'Po odeslání bude rezervace čekat na schválení.':'Odeslání zpřístupníme po otevření registrace.'}
      return;
    }
    const stateKicker=$('.reservation-state>small');if(stateKicker)stateKicker.textContent='STAV REZERVACE';
    const statusText=reservationStatusNames[r.status]||r.status||'Čeká na schválení';
    if(reservationForm){if(reservationForm.elements.carId&&r.carId)reservationForm.elements.carId.value=r.carId;if(reservationForm.elements.arrival)reservationForm.elements.arrival.value=r.arrival||'Pátek';if(reservationForm.elements.crew)reservationForm.elements.crew.value=r.crew||2;if(reservationForm.elements.sleep)reservationForm.elements.sleep.value=r.sleep||'Chatka';if(reservationForm.elements.accommodationUnits)reservationForm.elements.accommodationUnits.value=r.accommodationUnits??0;if(accommodationPartialInput)accommodationPartialInput.checked=r.accommodationUnits>0&&r.accommodationUnits<r.crew;renderAccommodationOptionChoices(r.accommodationSnapshot?.optionId||'');if(reservationForm.elements.showshine)reservationForm.elements.showshine.value=r.showshine||'Ne';if(reservationForm.elements.note)reservationForm.elements.note.value=r.note||'';syncMemberSleep()}
    if(miniStatus)miniStatus.textContent=statusText;if(year)year.textContent=r.year||'NEXT';if(title)title.textContent=r.title||'United rezervace';if(car)car.textContent=r.carSnapshot?`${r.carSnapshot.nickname||r.carSnapshot.model} · ${r.carSnapshot.body}`:'Auto zatím není vybrané';
    $('[data-reservation-state-symbol]').textContent=reservationStatusSymbols[r.status]||'·';$('[data-reservation-state-label]').textContent=r.changePending?'ZMĚNA ČEKÁ NA SCHVÁLENÍ':reservationStatusLoudNames[r.status]||String(r.status||'AKTUÁLNÍ').toUpperCase();$('[data-reservation-year]').textContent=r.year||'NEXT';$('[data-reservation-title]').textContent=r.title||'E36 United';
    const description=reservationDescription(r);$('[data-reservation-description]').textContent=description;
    const sleep=r.arrival==='Jen na otočku'?'Bez ubytování':r.sleep;
    const snapshot=r.accommodationSnapshot,accommodationSummary=snapshot?`${snapshot.peopleCount} ${snapshot.peopleCount===1?'osoba':'osob'} · ${snapshot.unitCount}× ${snapshot.optionName}`:sleep==='Bez ubytování'?'Bez ubytování':`${sleep||'—'} · ${r.accommodationUnits} osob · cena —`;
    const crewWord=Number(r.crew)===1?'osoba':Number(r.crew)>=5?'osob':'osoby';
    const summary=$('[data-reservation-summary]');summary.innerHTML=`<div><small>AUTO</small><b>${esc(r.carSnapshot?.nickname||r.carSnapshot?.model||'—')}</b></div><div><small>POBYT</small><b>${esc(r.arrival||'—')} · ${esc(r.crew)} ${crewWord}</b></div><div class="member-summary-accommodation">${snapshot?accommodationVisualMarkup({...snapshot,id:snapshot.optionId,name:snapshot.optionName},{apiBaseUrl,nights:snapshot.nights,className:'accommodation-visual--tiny'}):''}<span><small>UBYTOVÁNÍ</small><b>${esc(accommodationSummary)}</b></span></div>${snapshot?`<div><small>CELKEM</small><b>${esc(formatCzk(snapshot.totalCzk))}</b></div>`:''}`;bindAccommodationVisualFallbacks(summary);
    if(mailState){mailState.classList.toggle('is-confirmed',r.status==='approved');mailState.querySelector('span').textContent=description}
  }

  async function submitReservation(event){
    event.preventDefault();
    if(!getCurrentUser())return toast('Nejdřív se přihlas.');
    if(!reservationState.registrationOpen)return toast('Registrace na žádný event aktuálně není otevřená.');
    syncMemberSleep();const data=getData(),car=ensureSelectedReservationCar();
    if(!data.cars.length||!car){setReservationCarError(true);toast('Nejdřív přidej auto do garáže.');return}
    setReservationCarError(false);const fd=new FormData(event.currentTarget);
    const crew=Number(fd.get('crew'));
    if(!Number.isInteger(crew)||crew<1||crew>MAX_RESERVATION_CREW){toast(`Posádka musí mít 1 až ${MAX_RESERVATION_CREW} osob.`);crewInput?.focus();return}
    const arrival=fd.get('arrival')||'Pátek',sleep=arrival==='Jen na otočku'?'Bez ubytování':fd.get('sleep');
    const attendanceType=arrival==='Pátek'?'full_weekend':arrival==='Sobota'?'saturday_only':'day_visit';
    const wantsAccommodation=attendanceType!=='day_visit'&&sleep!=='Bez ubytování',accommodationOption=wantsAccommodation?selectedAccommodationOption():null;
    const accommodationUnits=wantsAccommodation?clampReservationNumber(accommodationUnitsInput.value,1,crew,crew):0;
    if(wantsAccommodation&&!accommodationOption){toast('Vyber konkrétní typ ubytování.');accommodationOptionSelect?.focus();return}
    if(accommodationOption?.inventoryMode==='limited'&&numericValue(accommodationOption.freeUnits)<accommodationUnitCount(accommodationUnits,accommodationOption)){toast(`${accommodationOption.name} už nemá dost volné kapacity pro tvoji posádku. Vyber jinou možnost.`);accommodationOptionSelect?.focus();return}
    const button=$('[data-reservation-submit]');setButtonBusy(button,true,'Odesílám rezervaci…');
    try{
      const payload=await apiRequest('/api/reservations/current',{method:'PUT',body:{reservationId:data.reservation?.id||null,carId:car.id,arrival,crew,attendanceType,accommodation:sleep,accommodationOptionId:accommodationOption?.id||null,accommodationUnits,showShine:fd.get('showshine'),note:fd.get('note')}});
      const reservation=normalizeReservation(payload?.reservation);if(!reservation)throw new Error('reservation_response_invalid');
      reservationState={registrationOpen:payload?.registrationOpen===true,event:payload?.event||reservationState.event,message:payload?.message||'',accommodationOptions:Array.isArray(payload?.accommodationOptions)?payload.accommodationOptions.map(normalizeAccommodationOption).filter(option=>option.id):reservationState.accommodationOptions};
      setReservation(reservation);if(activePlannerHandoff&&plannerHandoffApplied)clearPlannerHandoff();if(legacyPlannerDraftApplied)clearLegacyPlannerDraft();renderReservation();onReservationSaved();toast(payload?.message||'Rezervace byla uložena.');
    }catch(error){console.error('Reservation save failed',error);toast(formatApiError(error))}
    finally{setButtonBusy(button,false);renderReservation();if(activePlannerHandoff&&plannerHandoffApplied)applyPlannerHandoffToForm()}
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
      }catch(error){console.warn('Planner handoff promotion failed; local fallback retained.',error);plannerDraftSyncState='error';handoff=localHandoff}
    }
    if(handoff){
      activePlannerHandoff=handoff;plannerHandoffApplied=false;plannerHandoffChoice=data.reservation?'pending':'applied';
      if(!data.reservation)applyPlannerHandoffToForm({navigate:false});else renderPlannerHandoff();
      return;
    }
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
    arrivalSelect?.addEventListener('change',()=>syncMemberSleep('arrival'));
    crewInput?.addEventListener('input',()=>syncMemberSleep('crew'));crewInput?.addEventListener('change',()=>syncMemberSleep('crew'));
    accommodationUnitsInput?.addEventListener('input',()=>syncMemberSleep('accommodationUnits'));accommodationUnitsInput?.addEventListener('change',()=>syncMemberSleep('accommodationUnits'));
    sleepSelect?.addEventListener('change',()=>syncMemberSleep('accommodation'));
    accommodationOptionSelect?.addEventListener('change',()=>syncMemberSleep('option'));
    accommodationPartialInput?.addEventListener('change',()=>syncMemberSleep('partial'));
    syncMemberSleep();
    reservationForm?.elements?.carId?.addEventListener('change',()=>{if(ensureSelectedReservationCar())setReservationCarError(false)});
    $('[data-planner-handoff-use]')?.addEventListener('click',()=>{applyPlannerHandoffToForm();toast('Nový plán je připravený ve formuláři. Zkontroluj ho a rezervaci odešli.')});
    $('[data-planner-handoff-keep]')?.addEventListener('click',()=>{plannerHandoffChoice='kept';plannerHandoffApplied=false;renderReservation();renderPlannerHandoff();toast('Současná rezervace zůstala beze změny.')});
    $('[data-planner-handoff-overview]')?.addEventListener('click',()=>openSection('overview'));
    reservationForm?.addEventListener('submit',submitReservation);
  }

  return {applyPlannerDraft,bind,handleGarageCarSaved,hydratePlannerHandoffFromUrl,loadCurrentReservation,loadServerPlannerDraft,renderCarSelect,renderReservation,renderReservationCarPhoto,reset,setReservationCarError};
}
