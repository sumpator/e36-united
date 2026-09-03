import { createImagePreviewController, selectImageFiles } from '../../../image-upload.js?v=20260827-garage-photos';
import { $, $$, esc, setButtonBusy, toast } from '../../ui.js?v=20260902-phase3';

export function createMemberHistory({apiRequest,apiRequestForm,apiRequestBlob,getCurrentUser,getData,refreshClub,renderAll,formatApiError}){
  const fallbackHistoryCategories=[['sedan','Sedan'],['coupe','Coupé'],['touring','Touring'],['cabrio','Cabrio'],['compact','Compact'],['z3','Z3'],['mpower','///M Power']];
  const historyEditor=$('[data-history-editor]');
  const historyEvidenceUrls=new Map();
  const historyEvidenceUrlRequests=new Map();
  let historyEvidenceRequestGeneration=0;
  let historyPreviewControllers=[];
  let historyEditorReturnFocus=null;
  let historyEditorSelectedEventId='';
  let historyEditorMode='view';
  let bound=false;

  function historyCategoryOptions(){
    const configured=Object.entries(window.E36_SHOWSHINE?.categories||{}).map(([value,category])=>[value,String(category?.label||'').trim()]).filter(([,label])=>label);
    return configured.length?configured:fallbackHistoryCategories;
  }
  function historyCategoryLabel(value){return historyCategoryOptions().find(([key])=>key===String(value||'').toLowerCase())?.[1]||String(value||'Bez kategorie')}
  function historyDomId(value){return String(value||'event').replace(/[^a-zA-Z0-9_-]/g,'-')}
  function historyAccoladesMarkup(sns={}){
    if(sns.status!=='approved')return '';
    const placement=Number(sns.placement),medal=placement===1?'gold':placement===2?'silver':placement===3?'bronze':'';
    const accolades=[medal?`<i class="history-accolade history-medal history-medal--${medal}"><span aria-hidden="true">●</span>${placement}. MÍSTO</i>`:'',sns.bestOfBest?'<i class="history-accolade history-accolade--bob"><span aria-hidden="true">◆</span>BEST OF THE BEST</i>':'',sns.bestExhaust?'<i class="history-accolade history-accolade--exhaust"><span aria-hidden="true">◈</span>NEJ ZVUK VÝFUKU</i>':''].filter(Boolean);
    return accolades.length?`<span aria-label="Schválená Show &amp; Shine ocenění" class="history-accolades">${accolades.join('')}</span>`:'';
  }
  function historySubmittedSummary(item,{attendance=true}={}){
    const sns=item.showShine||{},details=[];
    if(attendance)details.push(`<b>Účast na United ${item.eventYear}</b>`);
    if(!sns.competed)details.push('<span>Pouze účast</span>');
    else{
      const result=[historyCategoryLabel(sns.category),sns.placement?`${Number(sns.placement)}. místo`:null].filter(Boolean).join(' · ');
      details.push(`<span>${esc(result)}</span>`);
      if(sns.bestOfBest)details.push('<span>Best of the Best</span>');
      if(sns.bestExhaust)details.push('<span>Nej zvuk výfuku</span>');
    }
    return `<div class="history-claim-summary"><small>ODESLÁNO KE KONTROLE</small>${details.join('')}</div>`;
  }
  function renderHistory(){
    const grid=$('[data-history-grid]'),data=getData();if(!grid)return;const history=data.club?.history||[];
    grid.innerHTML=history.length?history.map(item=>{
      const status=item.attendance?.status||'not_claimed',approved=status==='approved',pending=status==='pending',rejected=status==='rejected',sns=item.showShine||{},primaryEvidence=approved?item.evidence?.[0]:null,tag=item.concluded?'button':'article';
      const snsState=sns.status==='pending'?'<span class="history-sns-state is-pending">S&amp;S ČEKÁ NA KONTROLU</span>':historyAccoladesMarkup(sns);
      const attrs=item.concluded?`aria-controls="history-editor-modal" aria-label="Otevřít historii United ${item.eventYear}" data-open-history-year="${esc(item.eventId)}" type="button"`:'';
      return `<${tag} ${attrs} class="history-year ${approved?'is-attended':''} ${pending?'is-pending':''} ${rejected?'is-rejected':''} ${primaryEvidence?'has-evidence-photo':''}">${primaryEvidence?`<span aria-hidden="true" class="history-year-media"><img alt="" data-history-card-evidence-id="${esc(primaryEvidence.id)}"/></span>`:''}<div class="history-year-number">${item.eventYear}</div><div class="history-year-status"><div><b>${approved?'OVĚŘENO':pending?'ČEKÁ NA KONTROLU':rejected?'VRÁCENO K ÚPRAVĚ':item.concluded?'NEUVEDENO':'ROČNÍK NENÍ UKONČEN'}</b><small>${approved?'Účast potvrzena United týmem':pending?'Odeslaná účast čeká na ověření.':rejected?esc(item.attendance.reviewNote||'Doplň údaje a odešli znovu.'):item.concluded?'Historii můžeš doplnit.':'Není možné podat historickou žádost.'}</small>${snsState}</div><span aria-hidden="true" class="history-check">${approved?'✓':pending?'…':rejected?'!':'→'}</span></div></${tag}>`;
    }).join(''):'<article class="history-empty">Zatím nejsou dostupné žádné ročníky.</article>';
    $$('[data-open-history-year]',grid).forEach(button=>button.addEventListener('click',event=>openHistoryEditor(event.currentTarget,button.dataset.openHistoryYear)));
    void hydrateHistoryCardEvidence();
  }

  function clearHistoryEvidenceUrls(){historyEvidenceRequestGeneration+=1;for(const url of historyEvidenceUrls.values())URL.revokeObjectURL(url);historyEvidenceUrls.clear();historyEvidenceUrlRequests.clear()}
  async function getPrivateHistoryEvidenceUrl(photoId){
    if(historyEvidenceUrls.has(photoId))return historyEvidenceUrls.get(photoId);
    if(historyEvidenceUrlRequests.has(photoId))return await historyEvidenceUrlRequests.get(photoId);
    const generation=historyEvidenceRequestGeneration,userId=getCurrentUser()?.uid;
    let request;request=apiRequestBlob(`/api/history/evidence/${encodeURIComponent(photoId)}`).then(blob=>{
      const evidenceStillOwned=(getData().club?.history||[]).some(item=>(item.evidence||[]).some(photo=>String(photo.id)===String(photoId)));
      if(generation!==historyEvidenceRequestGeneration||userId!==getCurrentUser()?.uid||!evidenceStillOwned)throw new Error('stale_history_evidence_request');
      const existing=historyEvidenceUrls.get(photoId);if(existing)return existing;const url=URL.createObjectURL(blob);historyEvidenceUrls.set(photoId,url);return url;
    }).finally(()=>{if(historyEvidenceUrlRequests.get(photoId)===request)historyEvidenceUrlRequests.delete(photoId)});
    historyEvidenceUrlRequests.set(photoId,request);return await request;
  }
  function historySnsFields(item,{attendanceApproved=false}={}){
    const sns=item.showShine||{},canAmend=attendanceApproved&&['not_claimed','rejected'].includes(sns.status);
    if(attendanceApproved&&!canAmend)return `<div class="history-editor-state"><b>${sns.status==='pending'?'SHOW & SHINE ČEKÁ NA KONTROLU':sns.status==='approved'?'SHOW & SHINE OVĚŘENO':'DOCHÁZKA JE UZAMČENÁ'}</b>${sns.reviewNote?`<small>${esc(sns.reviewNote)}</small>`:''}</div>`;
    const prefill=!!sns.competed&&sns.status!=='not_claimed',category=String(sns.category||'').toLowerCase(),placement=String(sns.placement||''),menuId=`history-category-${historyDomId(item.eventId)}`,categoryOptions=historyCategoryOptions().map(([value,label])=>`<button aria-selected="${value===category}" data-history-category-value="${esc(value)}" role="option" type="button">${esc(label)}</button>`).join('');
    return `<div class="history-sns-question"><span>${canAmend?'CHCEŠ DOPLNIT NEBO OPRAVIT SHOW &amp; SHINE?':'SOUTĚŽIL/A JSI V SHOW &amp; SHINE?'}</span><input class="history-native-control" data-history-sns-input="" name="snsCompeted" type="checkbox" value="on" ${prefill?'checked':''}/><div aria-label="Show &amp; Shine" class="history-binary-choice" role="group"><button aria-pressed="${!prefill}" class="${!prefill?'is-selected':''}" data-history-sns-choice="no" type="button">NE</button><button aria-pressed="${prefill}" class="${prefill?'is-selected':''}" data-history-sns-choice="yes" type="button">ANO</button></div></div><div class="history-sns-fields" data-history-sns-fields="" ${prefill?'':'hidden'}><div class="history-category-field" data-history-category-field=""><span class="history-form-label">KATEGORIE</span><input data-history-category-input="" name="snsCategory" type="hidden" value="${esc(category)}"/><button aria-controls="${menuId}" aria-expanded="false" aria-haspopup="listbox" class="history-category-trigger" data-history-category-trigger="" type="button"><span data-history-category-label="">${category?esc(historyCategoryLabel(category)):'Vyber kategorii'}</span><i aria-hidden="true">⌄</i></button><div aria-label="Kategorie Show &amp; Shine" class="history-category-menu" data-history-category-menu="" hidden id="${menuId}" role="listbox">${categoryOptions}</div></div><fieldset class="history-placement-field"><legend class="history-form-label">UMÍSTĚNÍ</legend><div class="history-placement-options"><label class="is-neutral"><input ${placement?'':'checked'} class="history-native-control" name="snsPlacement" type="radio" value=""/><span>BEZ TOP 3</span></label><label class="is-bronze"><input ${placement==='3'?'checked':''} class="history-native-control" name="snsPlacement" type="radio" value="3"/><span>3. MÍSTO</span></label><label class="is-silver"><input ${placement==='2'?'checked':''} class="history-native-control" name="snsPlacement" type="radio" value="2"/><span>2. MÍSTO</span></label><label class="is-gold"><input ${placement==='1'?'checked':''} class="history-native-control" name="snsPlacement" type="radio" value="1"/><span>1. MÍSTO</span></label></div></fieldset><fieldset class="history-award-field"><legend class="history-form-label">DALŠÍ OCENĚNÍ</legend><div class="history-award-options"><label class="history-award-chip"><input class="history-native-control" name="snsBestOfBest" type="checkbox" value="on" ${sns.bestOfBest?'checked':''}/><span>◆ BEST OF THE BEST</span></label><label class="history-award-chip"><input class="history-native-control" name="snsBestExhaust" type="checkbox" value="on" ${sns.bestExhaust?'checked':''}/><span>◈ NEJ ZVUK VÝFUKU</span></label></div></fieldset></div>`;
  }
  function historyEvidenceMarkup(item){return item.evidence?.length?`<div class="history-existing-evidence">${item.evidence.map(photo=>`<span><img alt="Důkaz účasti United ${item.eventYear}" data-history-evidence-id="${esc(photo.id)}"/><i>Soukromý důkaz</i></span>`).join('')}</div>`:''}
  function historySnsDetailMarkup(item){
    const sns=item.showShine||{};if(!sns.competed)return '<div class="history-sns-detail"><small>SHOW &amp; SHINE</small><b>NEUVEDENO</b></div>';
    const result=[historyCategoryLabel(sns.category),sns.placement?`${Number(sns.placement)}. místo`:null].filter(Boolean).join(' · '),awards=[sns.bestOfBest?'Best of the Best':'',sns.bestExhaust?'Nej zvuk výfuku':''].filter(Boolean);
    return `<div class="history-sns-detail"><small>SHOW &amp; SHINE</small><b>${esc(result||'Účast')}</b>${awards.length?`<span>${esc(awards.join(' · '))}</span>`:''}</div>`;
  }
  function historyEditorItemState(item){
    const attendance=item.attendance?.status||'not_claimed',sns=item.showShine?.status||'not_claimed';if(attendance==='pending'||sns==='pending')return {key:'pending',label:'ČEKÁ'};if(attendance==='approved')return {key:'verified',label:'OVĚŘENO'};if(attendance==='rejected'||sns==='rejected')return {key:'rejected',label:'K ÚPRAVĚ'};return {key:'empty',label:'NEUVEDENO'};
  }
  function historyEditorOverview(item){
    const attendance=item.attendance?.status||'not_claimed',sns=item.showShine||{},attendanceLabel=attendance==='approved'?'OVĚŘENA':attendance==='pending'?'ČEKÁ NA KONTROLU':attendance==='rejected'?'VRÁCENA K ÚPRAVĚ':'NEUVEDENA',snsLabel=sns.status==='approved'?'OVĚŘENO':sns.status==='pending'?'ČEKÁ NA KONTROLU':sns.status==='rejected'?'VRÁCENO K ÚPRAVĚ':'NEUVEDENO',canOpenEdit=attendance==='approved';
    return `<article class="history-editor-card history-editor-overview" data-history-event="${esc(item.eventId)}" tabindex="-1"><header><strong>UNITED ${item.eventYear}</strong><span>DETAIL HISTORIE</span></header><div class="history-editor-status-grid"><div class="is-${attendance}"><small>DOCHÁZKA</small><b>${attendanceLabel}</b></div><div class="is-${sns.status||'not_claimed'}"><small>SHOW &amp; SHINE</small><b>${snsLabel}</b></div></div>${historyEvidenceMarkup(item)}${historySnsDetailMarkup(item)}<p>${attendance==='approved'?'Schválená docházka zůstává vždy autoritativní. Nové S&S údaje se projeví až po další kontrole Adminem.':'Odeslané údaje se projeví až po kontrole United týmem.'}</p>${canOpenEdit?`<button class="member-secondary history-edit-selected" data-history-edit-selected="${esc(item.eventId)}" type="button">Upravit údaje</button>`:''}</article>`;
  }
  function historyClaimForm(item,{mode='edit'}={}){
    const status=item.attendance?.status||'not_claimed',approved=status==='approved',pending=status==='pending';
    const cardClass='history-editor-card is-focused-target',focusAttrs=`data-history-event="${esc(item.eventId)}" tabindex="-1"`;
    if(approved&&mode==='view')return historyEditorOverview(item);
    if(pending)return `<article class="${cardClass}" ${focusAttrs}><header><strong>UNITED ${item.eventYear}</strong><span>ČEKÁ NA KONTROLU</span></header>${historyEvidenceMarkup(item)}${historySubmittedSummary(item)}<p>Docházka a Show &amp; Shine se ověřují samostatně. Zatím se nepřipisují žádné body.</p></article>`;
    if(!approved&&item.showShine?.status==='approved')return `<article class="${cardClass}" ${focusAttrs}><header><strong>UNITED ${item.eventYear}</strong><span>ÚDAJE JSOU UZAMČENÉ</span></header>${historyEvidenceMarkup(item)}${historySnsDetailMarkup(item)}<div class="history-editor-limitation"><b>Schválené Show &amp; Shine nelze bezpečně přepsat.</b><span>Současné API by při výměně důkazu změnilo i schválené S&amp;S. Proto tento rok zůstává uzamčený, dokud nebude k dispozici samostatný amendment workflow.</span></div></article>`;
    if(approved&&['pending','approved'].includes(item.showShine?.status))return `<article class="${cardClass}" ${focusAttrs}><header><strong>UNITED ${item.eventYear}</strong><span>DOCHÁZKA OVĚŘENA</span></header>${historyEvidenceMarkup(item)}${item.showShine?.status==='pending'?historySubmittedSummary(item,{attendance:false}):historySnsDetailMarkup(item)}<div class="history-editor-limitation"><b>${item.showShine?.status==='pending'?'Show & Shine právě čeká na kontrolu.':'Schválené Show & Shine je autoritativní.'}</b><span>${item.showShine?.status==='pending'?'Další změna bude možná až po rozhodnutí Admina.':'Současné API neumí schválené S&S bezpečně měnit. Docházka i schválený výsledek proto zůstávají beze změny.'}</span></div><button class="member-secondary history-detail-back" data-history-view-selected="${esc(item.eventId)}" type="button">Zpět na detail</button></article>`;
    if(approved)return `<form class="${cardClass}" data-attendance-approved="true" data-history-claim-form="" ${focusAttrs}><input name="eventId" type="hidden" value="${esc(item.eventId)}"/><header><strong>UNITED ${item.eventYear}</strong><span>DOPLŇ SHOW &amp; SHINE</span></header><p>Schválenou účast nelze odebrat. Pokud jsi soutěžil/a, doplň výsledek ke kontrole.</p>${historyEvidenceMarkup(item)}${item.showShine?.reviewNote?`<div class="history-rejection-note"><b>DŮVOD S&S ZAMÍTNUTÍ</b><span>${esc(item.showShine.reviewNote)}</span></div>`:''}${historySnsFields(item,{attendanceApproved:true})}<button class="member-primary member-primary--compact" data-history-submit="" disabled type="submit">Odeslat S&amp;S ke kontrole</button></form>`;
    return `<form class="${cardClass}" data-attendance-approved="false" data-history-claim-form="" ${focusAttrs}><input name="eventId" type="hidden" value="${esc(item.eventId)}"/><header><strong>UNITED ${item.eventYear}</strong><span>${status==='rejected'?'DOPLŇ A ODEŠLI ZNOVU':'DOLOŽ SVOJI ÚČAST'}</span></header><p>Nahraj důkaz účasti a případně doplň Show &amp; Shine.</p>${historyEvidenceMarkup(item)}${status==='rejected'?`<div class="history-rejection-note"><b>DŮVOD ZAMÍTNUTÍ</b><span>${esc(item.attendance.reviewNote||'Doplň důkaz účasti.')}</span></div>`:''}<div class="history-claim-fields" data-history-claim-fields=""><label class="history-evidence-upload"><span>${status==='rejected'?'NOVÝ DŮKAZ ÚČASTI · POVINNÉ':'DŮKAZ ÚČASTI · POVINNÉ'}</span><input accept="image/jpeg,image/png,image/webp" data-history-evidence-input="" multiple name="evidence" type="file"/><b>Vybrat 1–4 soukromé fotografie</b><small>${status==='rejected'?'Nové fotky po schválení bezpečně nahradí předchozí důkaz.':'Fotky uvidíš pouze ty a oprávněný Admin.'}</small></label><div class="image-selection-preview-grid" data-history-evidence-preview=""></div>${historySnsFields(item)}<button class="member-primary member-primary--compact" data-history-submit="" disabled type="submit">Odeslat ke kontrole</button></div></form>`;
  }
  function closeHistoryCategoryField(field,{restoreFocus=false}={}){if(!field)return;const menu=$('[data-history-category-menu]',field),trigger=$('[data-history-category-trigger]',field);if(menu)menu.hidden=true;if(trigger)trigger.setAttribute('aria-expanded','false');if(restoreFocus)trigger?.focus()}
  function closeHistoryCategoryMenus({except=null}={}){$$('[data-history-category-field]',historyEditor||document).forEach(field=>{if(field!==except)closeHistoryCategoryField(field)})}
  function setHistoryCategory(field,value){
    const input=$('[data-history-category-input]',field),label=$('[data-history-category-label]',field);if(!input||!label)return;input.value=value;label.textContent=historyCategoryLabel(value);$$('[data-history-category-value]',field).forEach(option=>option.setAttribute('aria-selected',String(option.dataset.historyCategoryValue===value)));syncHistorySubmitState(field.closest('form'));
  }
  function setHistorySnsChoice(form,choice){
    const yes=choice==='yes',input=$('[data-history-sns-input]',form),fields=$('[data-history-sns-fields]',form);if(!input)return;input.checked=yes;if(fields)fields.hidden=!yes;$$('[data-history-sns-choice]',form).forEach(button=>{const selected=button.dataset.historySnsChoice===choice;button.classList.toggle('is-selected',selected);button.setAttribute('aria-pressed',String(selected))});if(!yes)closeHistoryCategoryMenus();syncHistorySubmitState(form);
  }
  function syncHistorySubmitState(form){
    if(!form)return;const button=$('[data-history-submit]',form);if(!button)return;const approved=form.dataset.attendanceApproved==='true',sns=$('[data-history-sns-input]',form)?.checked===true,category=$('[data-history-category-input]',form)?.value||'',evidenceReady=approved||Number($('[data-history-evidence-input]',form)?.files?.length||0)>0;button.disabled=!evidenceReady||(sns&&!category)||(approved&&!sns);
  }
  async function hydrateHistoryCardEvidence(){
    for(const img of $$('[data-history-card-evidence-id]',$('[data-history-grid]')||document)){
      const id=img.dataset.historyCardEvidenceId;if(!id)continue;
      try{img.src=await getPrivateHistoryEvidenceUrl(id)}catch(error){console.warn('History card evidence unavailable',id,error);const media=img.closest('.history-year-media');media?.closest('.history-year')?.classList.remove('has-evidence-photo');media?.remove()}
    }
  }
  async function hydrateHistoryEvidence(){
    for(const img of $$('[data-history-evidence-id]',historyEditor||document)){
      const id=img.dataset.historyEvidenceId;
      try{const url=await getPrivateHistoryEvidenceUrl(id);if(img.isConnected)img.src=url}catch(error){console.warn('History evidence thumbnail unavailable',error)}
    }
  }
  function preferredHistoryEditorMode(item){const attendance=item?.attendance?.status||'not_claimed';return attendance==='approved'||attendance==='pending'?'view':'edit'}
  function defaultHistoryEditorItem(items=[]){return items.find(item=>historyEditorItemState(item).key==='pending')||items.find(item=>['empty','rejected'].includes(historyEditorItemState(item).key))||items[0]||null}
  function historyYearSelectorMarkup(item,selected){const state=historyEditorItemState(item);return `<button aria-current="${selected?'true':'false'}" aria-label="United ${item.eventYear}: ${state.label}" class="history-editor-year is-${state.key} ${selected?'is-selected':''}" data-history-year-select="${esc(item.eventId)}" type="button"><strong>${item.eventYear}</strong><span>${state.key==='verified'?'<i aria-hidden="true">✓</i>':''}${state.label}</span></button>`}
  function renderHistoryEditor(selectedEventId='',mode=''){
    const data=getData(),list=$('[data-history-editor-list]'),nav=$('[data-history-year-nav]');if(!list||!nav)return '';historyPreviewControllers.forEach(controller=>controller.clear());historyPreviewControllers=[];
    const concluded=(data.club?.history||[]).filter(item=>item.concluded).sort((a,b)=>Number(b.eventYear)-Number(a.eventYear));let selected=concluded.find(item=>String(item.eventId)===String(selectedEventId||historyEditorSelectedEventId));if(!selected||!selectedEventId)selected=selectedEventId?selected:defaultHistoryEditorItem(concluded);if(!selected)selected=defaultHistoryEditorItem(concluded);historyEditorSelectedEventId=selected?.eventId||'';historyEditorMode=mode||preferredHistoryEditorMode(selected);nav.innerHTML=concluded.map(item=>historyYearSelectorMarkup(item,String(item.eventId)===String(historyEditorSelectedEventId))).join('');list.dataset.selectedEvent=historyEditorSelectedEventId;list.innerHTML=selected?historyClaimForm(selected,{mode:historyEditorMode}):'<article class="history-editor-empty"><b>Zatím tu není žádný ukončený ročník.</b><p>Ročník se nabídne až podle skutečného data konce uloženého na serveru.</p></article>';
    const completeButton=$('[data-history-complete]');if(completeButton){completeButton.disabled=!!data.club?.historyCompletedAt;completeButton.textContent=data.club?.historyCompletedAt?'Historie je zkontrolovaná ✓':'Mám historii zkontrolovanou'}
    $$('[data-history-year-select]',nav).forEach(button=>button.addEventListener('click',()=>{const item=concluded.find(entry=>String(entry.eventId)===String(button.dataset.historyYearSelect));renderHistoryEditor(button.dataset.historyYearSelect,preferredHistoryEditorMode(item));requestAnimationFrame(()=>$('[data-history-event]',list)?.focus({preventScroll:true}))}));
    $('[data-history-edit-selected]',list)?.addEventListener('click',buttonEvent=>{renderHistoryEditor(buttonEvent.currentTarget.dataset.historyEditSelected,'edit');requestAnimationFrame(()=>$('[data-history-event]',list)?.focus({preventScroll:true}))});
    $('[data-history-view-selected]',list)?.addEventListener('click',buttonEvent=>{renderHistoryEditor(buttonEvent.currentTarget.dataset.historyViewSelected,'view');requestAnimationFrame(()=>$('[data-history-event]',list)?.focus({preventScroll:true}))});
    $$('[data-history-sns-choice]',list).forEach(button=>button.addEventListener('click',()=>setHistorySnsChoice(button.closest('form'),button.dataset.historySnsChoice)));
    $$('[data-history-category-trigger]',list).forEach(trigger=>trigger.addEventListener('click',()=>{const field=trigger.closest('[data-history-category-field]'),menu=$('[data-history-category-menu]',field),opening=menu?.hidden!==false;closeHistoryCategoryMenus({except:field});if(menu)menu.hidden=!opening;trigger.setAttribute('aria-expanded',String(opening));if(opening)$('[data-history-category-value]',field)?.focus()}));
    $$('[data-history-category-value]',list).forEach(option=>option.addEventListener('click',()=>{const field=option.closest('[data-history-category-field]');setHistoryCategory(field,option.dataset.historyCategoryValue);closeHistoryCategoryField(field,{restoreFocus:true})}));
    $$('input[name="snsPlacement"],input[name="snsBestOfBest"],input[name="snsBestExhaust"]',list).forEach(input=>input.addEventListener('change',()=>syncHistorySubmitState(input.closest('form'))));
    $$('[data-history-evidence-input]',list).forEach(input=>{const form=input.closest('form'),controller=createImagePreviewController(form.querySelector('[data-history-evidence-preview]'));historyPreviewControllers.push(controller);input.addEventListener('change',()=>{const selection=selectImageFiles(input.files,{maxFiles:4,maxBytes:8*1024*1024});if(selection.invalidType||selection.tooLarge||selection.truncated){input.value='';controller.clear();syncHistorySubmitState(form);return toast(selection.tooLarge?'Jedna důkazní fotka může mít nejvýše 8 MB.':selection.truncated?'Vyber nejvýše 4 fotografie.':'Vyber JPG, PNG nebo WebP.')}controller.render(selection.files);syncHistorySubmitState(form)})});
    $$('[data-history-claim-form]',list).forEach(form=>{form.addEventListener('submit',submitHistoryEditorForm);syncHistorySubmitState(form)});void hydrateHistoryEvidence();return historyEditorSelectedEventId;
  }
  async function submitHistoryEditorForm(event){
    event.preventDefault();const data=getData(),form=event.currentTarget,button=form.querySelector('button[type="submit"]'),fd=new FormData(form),approved=(data.club?.history||[]).find(item=>String(item.eventId)===String(fd.get('eventId')))?.attendance?.status==='approved';
    if(approved&&!fd.get('snsCompeted'))return toast('Zvol ANO a doplň Show & Shine.');
    if(fd.get('snsCompeted')&&!fd.get('snsCategory'))return toast('Vyber Show & Shine kategorii.');
    const upload=new FormData();upload.append('eventId',fd.get('eventId'));if(fd.get('snsCompeted')){upload.append('snsCompeted',fd.get('snsCompeted'));upload.append('snsCategory',fd.get('snsCategory'));if(fd.get('snsPlacement'))upload.append('snsPlacement',fd.get('snsPlacement'));for(const key of ['snsBestOfBest','snsBestExhaust'])if(fd.get(key))upload.append(key,fd.get(key))}
    if(!approved){const input=form.querySelector('[data-history-evidence-input]'),files=selectImageFiles(input?.files,{maxFiles:4,maxBytes:8*1024*1024}).files;if(!files.length)return toast('Přilož alespoň jednu důkazní fotografii.');for(const file of files)upload.append('files',file,file.name)}
    setButtonBusy(button,true,'Odesílám…');try{await apiRequestForm('/api/history/claims',upload);await refreshClub();renderAll();renderHistoryEditor(fd.get('eventId'),'view');toast('Žádost byla odeslána United týmu.')}catch(error){console.error('History claim failed',error);toast(formatApiError(error))}finally{setButtonBusy(button,false);syncHistorySubmitState(form)}
  }
  function openHistoryEditor(trigger=null,eventId=''){if(!historyEditor)return;historyEditorReturnFocus=trigger;const selectedEvent=renderHistoryEditor(eventId,eventId?'view':'');historyEditor.hidden=false;document.body.classList.add('modal-open');requestAnimationFrame(()=>{const target=$('[data-history-event]',historyEditor);if(target){target.focus({preventScroll:true});if(eventId)target.scrollIntoView({block:'start'})}else $(`[data-history-year-select="${historyDomId(selectedEvent)}"]`,historyEditor)?.focus()})}
  function closeHistoryEditor({restoreFocus=false}={}){if(!historyEditor)return;historyEditor.hidden=true;document.body.classList.remove('modal-open');historyPreviewControllers.forEach(controller=>controller.clear());historyPreviewControllers=[];const trigger=historyEditorReturnFocus;historyEditorReturnFocus=null;if(restoreFocus)trigger?.focus?.()}
  function bind(){
    if(bound)return;bound=true;
    $('[data-open-history-editor]')?.addEventListener('click',event=>openHistoryEditor(event.currentTarget));
    $$('[data-close-history-editor]').forEach(button=>button.addEventListener('click',()=>closeHistoryEditor({restoreFocus:true})));
    document.addEventListener('click',event=>{if(!event.target.closest('[data-history-category-field]'))closeHistoryCategoryMenus()});
    document.addEventListener('keydown',event=>{if(event.key!=='Escape'||historyEditor?.hidden)return;const openMenu=$('[data-history-category-menu]:not([hidden])',historyEditor);if(openMenu){event.preventDefault();closeHistoryCategoryField(openMenu.closest('[data-history-category-field]'),{restoreFocus:true});return}closeHistoryEditor({restoreFocus:true})});
    $('[data-history-complete]')?.addEventListener('click',async event=>{const button=event.currentTarget;setButtonBusy(button,true,'Ukládám…');try{await apiRequest('/api/history/completed',{method:'POST',body:{complete:true}});await refreshClub();renderAll();renderHistoryEditor();toast('Historie je označená jako zkontrolovaná.')}catch(error){console.error(error);toast(formatApiError(error))}finally{setButtonBusy(button,false)}});
  }

  return {bind,renderHistory,reset:clearHistoryEvidenceUrls};
}
