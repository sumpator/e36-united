import {adminState} from './state.js?v=20260913-approval-previews-r1';
import {adminCommand,bindCurrentEditors,forgetAdminEditor,editorProtected,allowAdminNavigation,adminEditorDirty} from './editors.js?v=20260913-approval-previews-r1';
import {COMPOSITIONS,validatePreferences} from './dashboard-model.js?v=20260913-approval-previews-r1';
import {COMMAND_WIDGETS as WIDGETS,commandDefaults as factoryPreferences,commandLayout,commandBadges} from './command-model.js?v=20260913-approval-previews-r1';
import {commandCard,metricInfo} from './command-cards.js?v=20260913-approval-previews-r1';
import {commandIcon} from './command-icons.js?v=20260913-approval-previews-r1';
import {renderCommandShell} from './command-shell.js?v=20260913-approval-previews-r1';
import {DESTINATIONS,QUICK_LINK_IDS,destination,drillLabel} from './destinations.js?v=20260913-approval-previews-r1';
import {dashboardKpi,chartModel,attentionModel,showValue} from './dashboard-data.js?v=20260913-approval-previews-r1';
import {$,escapeHtml as esc,toast} from './ui.js?v=20260913-approval-previews-r1';
import {createCardMedia} from './member-cards.js?v=20260913-approval-previews-r1';

let navigate=()=>{},refresh=()=>{},draft=null,pendingPreferences=null,acceptNext=false;
const approvalMedia=createCardMedia();
const clone=value=>JSON.parse(JSON.stringify(value));
const form=()=> $('[data-dashboard-preferences]');
const composition=()=>adminState.dashboardComposition;
const config=()=>adminState.dashboardPreferences||factoryPreferences();
const chosen=()=>config().compositions[composition()];
const moneyIds=new Set(['recorded','outstanding']);
const attrs=(key,drill={})=>`data-dashboard-destination="${esc(key)}" data-dashboard-drill="${esc(JSON.stringify(drill))}"`;
const button=(key,label,drill={})=>`<button type="button" ${attrs(key,drill)}>${esc(label)}</button>`;
const stamp=name=>{const r=adminState.resourceStates[name];return r?.lastSuccess?new Date(r.lastSuccess).toLocaleTimeString('cs-CZ'):'—'};
export const dashboardWantsPlanner=()=>chosen().widgets.some(w=>w.id==='planner');
export const dashboardWantsMailing=()=>chosen().widgets.some(w=>w.id==='mailing');

export function receiveDashboardPreferences(payload){
  if(!validatePreferences(payload.preferences))throw new Error('Neznámý nebo poškozený formát preferencí. Uložení není dostupné.');
  if(payload.stored===false)payload={...payload,preferences:factoryPreferences()};
  const root=form();
  if(!adminState.dashboardPreferences||acceptNext||!root.hidden&&!editorProtected(root,payload.revision,()=>receiveDashboardPreferences(payload))){
    adminState.dashboardPreferences=clone(payload.preferences);adminState.dashboardPreferenceRevision=payload.revision;
    acceptNext=false;pendingPreferences=null;
    if(!root.hidden){forgetAdminEditor(root);draft=clone(payload.preferences);writeDraft(false);editFields();bindCurrentEditors();}
    if(dashboardWantsPlanner()||dashboardWantsMailing())window.dispatchEvent(new CustomEvent('admin:dashboardready'));
  }else if(payload.revision!==adminState.dashboardPreferenceRevision){pendingPreferences=payload;editorProtected(root,payload.revision);}
}
export function clearDashboard(){approvalMedia.clear();draft=null;pendingPreferences=null;acceptNext=false;form().closest('dialog')?.close();form().hidden=true;form().inert=true;forgetAdminEditor(form());$('[data-dashboard-grid]').replaceChildren();$('[data-dashboard-attention]').replaceChildren();$('[data-dashboard-quick-links]').replaceChildren();$('[data-dashboard-preference-notice]').replaceChildren();}

function chartMarkup(model){
  if(!model)return '<p>Data zatím nejsou dostupná.</p>';
  const rows=model.rows,max=Math.max(1,...rows.flatMap(r=>[r.value,r.pending,r.capacity]).filter(Number.isFinite));
  const known=rows.every(r=>Number.isFinite(r.value));
  const visual=!rows.length?'<p>Žádná zaznamenaná data.</p>':model.kind==='line'?`<svg viewBox="0 0 600 120" role="img" aria-label="Kumulativní počet rezervací; přesné hodnoty v tabulce"><path d="${rows.map((r,i)=>`${i?'L':'M'}${rows.length===1?300:10+i*580/(rows.length-1)},${110-100*(r.value||0)/max}`).join(' ')}"/><circle cx="${rows.length===1?300:590}" cy="${110-100*(rows.at(-1).value||0)/max}" r="4"/></svg>`:
    `<div class="dashboard-bars">${rows.map(r=>`<div><span>${esc(r.label)}</span><div class="dashboard-bar-track"><i style="width:${Number.isFinite(r.value)?100*r.value/max:0}%"></i>${model.kind==='occupancy'?`<em style="width:${Number.isFinite(r.pending)?100*r.pending/max:0}%"></em>`:''}</div><b>${esc(showValue(r.value,model.unit))}${model.kind==='occupancy'?` / ${r.unlimited?'bez limitu':esc(showValue(r.capacity))}`:''}</b></div>`).join('')}</div>`;
  return `<p class="dashboard-definition">${model.kind==='line'?'Celkem vytvořených rezervací v čase':esc(model.definition)}</p>${model.kind==='line'?metricInfo(model.definition):''}${known?visual:'<p>Část údajů není dostupná; graf nelze spolehlivě zobrazit.</p>'}${model.kind==='occupancy'?'<p class="dashboard-legend">Modrá: potvrzené jednotky · Oranžová: čekající poptávka. Čekající nejsou obsazenost.</p>':''}${model.missing?`<p>Bez ověřitelného data vytvoření: ${esc(model.missing)} rezervací; nejsou uměle přiřazeny k datu.</p>`:''}<details data-dashboard-table><summary>Zobrazit data</summary><div class="dashboard-table-scroll"><table><caption>${esc(model.unit)}</caption><thead><tr><th scope="col">Položka</th><th scope="col">${model.kind==='line'?'Kumulativně':'Hodnota'}</th>${model.kind==='line'?'<th scope="col">Nové</th>':model.kind==='occupancy'?'<th scope="col">Čekající</th><th scope="col">Kapacita</th>':''}</tr></thead><tbody>${rows.map(r=>`<tr><th scope="row">${esc(r.label)}</th><td>${Number.isFinite(r.value)?button(r.destination,showValue(r.value,model.unit),r.drill):'—'}</td>${model.kind==='line'?`<td>${esc(showValue(r.added))}</td>`:model.kind==='occupancy'?`<td>${Number.isFinite(r.pending)?button(r.destination,showValue(r.pending),r.pendingDrill):'—'}</td><td>${r.unlimited?'Bez limitu':esc(showValue(r.capacity))}</td>`:''}</tr>`).join('')}</tbody></table></div></details>`;
}
function paintCard(card,widget){
  const meta=WIDGETS[widget.id],model=meta.kind==='kpi'?dashboardKpi(widget.id,adminState.summary):chartModel(widget.id,adminState.summary,adminState.dashboardAnalytics,adminState.dashboardRange);
  const key=JSON.stringify([widget,model,meta.kind==='command'?[adminState.summary,adminState.dashboardAnalytics,adminState.dashboardMailing]:null]);if(card.dataset.model===key||card.contains(document.activeElement)||card.dataset.model&&card.matches(':hover'))return;
  const open=[...card.querySelectorAll('details')].map(detail=>detail.open);
  const restoreDetails=()=>card.querySelectorAll('details').forEach((detail,i)=>{detail.open=!!open[i]});
  card.dataset.model=key;
  card.className=`dashboard-card dashboard-${meta.kind} dashboard-size-${widget.size}`;
  card.style.setProperty('--widget-span',widget.span||4);
  if(meta.kind==='command'){if(widget.id==='approvals')approvalMedia.clear();card.innerHTML=`<h3><span class="command-heading-icon">${commandIcon(widget.id)}</span>${esc(meta.label)}</h3>${commandCard(widget.id,adminState,button,chartMarkup)}`;restoreDetails();if(widget.id==='approvals')approvalMedia.hydrate(card);return;}
  card.innerHTML=`<h3><span class="command-heading-icon">${commandIcon(widget.id)}</span>${esc(meta.label)}</h3>${meta.kind==='kpi'?`<p class="dashboard-kpi-value" data-kpi-${widget.id}>${Number.isFinite(model)?button(meta.destination,showValue(model,moneyIds.has(widget.id)?'Kč':null)):'—'}</p><p class="dashboard-definition">${esc(meta.definition)}</p>`:meta.kind==='detail'?'<p>Volitelný diagnostický panel níže. Neúplné historické sledování není úplný census.</p>':`${widget.id==='trend'?`<label>Období <select data-dashboard-range aria-label="Rozsah vývoje rezervací"><option value="7">7 dní</option><option value="30">30 dní</option><option value="all">Celé období</option></select></label>`:''}${chartMarkup(model)}`}`;
  restoreDetails();
  if(card.querySelector('[data-dashboard-range]'))card.querySelector('[data-dashboard-range]').value=adminState.dashboardRange;
}
export function renderDashboard(){
  renderCommandShell();
  $('[data-dashboard-title]').textContent=COMPOSITIONS[composition()];$('[data-dashboard-composition]').value=composition();
  const notice=$('[data-dashboard-preference-notice]');
  const text=pendingPreferences?'Na serveru je novější rozložení. Aktuální přehled ani rozepsané změny nebyly přepsány.':'';
  if(notice.dataset.notice!==text){notice.dataset.notice=text;notice.textContent=text;if(pendingPreferences){const b=document.createElement('button');b.type='button';b.dataset.dashboardApply='';b.textContent='Načíst novější rozložení';notice.append(' ',b)}}
  const valid=name=>{const value=adminState.resourceStates[name];return !document.hidden&&navigator.onLine&&value?.state==='fresh'&&Date.now()-value.lastSuccess<=300_000};
  const summaryFresh=valid('summary'),analyticsFresh=valid('dashboard-analytics');
  const age=$('[data-dashboard-age]');age.hidden=summaryFresh&&analyticsFresh;age.textContent=age.hidden?'':`Část přehledu může být zastaralá. Souhrn: ${stamp('summary')} · vývoj: ${stamp('dashboard-analytics')}.`;
  const attention=attentionModel(adminState.summary,adminState.dashboardAnalytics,{summaryFresh,analyticsFresh});
  $('[data-dashboard-attention-state]').textContent=attention.allClear?'Vše vyřízeno v ověřených zdrojích.':attention.complete?'Položky k ověření podle zdroje:':'Nelze potvrdit, že je vše vyřízeno: některá data chybí nebo jsou zastaralá.';
  const attentionRoot=$('[data-dashboard-attention]'),attentionKey=JSON.stringify(attention);
  if(attentionRoot.dataset.model!==attentionKey&&!attentionRoot.contains(document.activeElement)){attentionRoot.dataset.model=attentionKey;attentionRoot.innerHTML=attention.rows.map(r=>`<article><small>${esc(r.scope)}</small>${`<button type="button" ${attrs(r.destination)}>${esc(r.label)}: <span ${({'pending':'data-attention-reservations','history':'data-attention-history','photos':'data-attention-gallery'})[r.destination]||''}>${esc(showValue(r.value))}</span></button>`}<small>${esc(r.reason)}${r.oldest&&Number.isFinite(Date.parse(r.oldest))?' · nejstarší '+esc(new Date(r.oldest).toLocaleString('cs-CZ')):''}</small></article>`).join('');}
  const quick=$('[data-dashboard-quick-links]'),links=chosen().quickLinks.join(',');if(quick.dataset.links!==links){quick.dataset.links=links;quick.innerHTML=chosen().quickLinks.map(id=>button(id,DESTINATIONS[id].label)).join('');}quick.hidden=!links;
  const grid=$('[data-dashboard-grid]'),widgets=commandLayout(chosen().widgets);
  for(const child of [...grid.children])if(!widgets.some(w=>w.id===child.dataset.widget))child.remove();
  widgets.forEach((widget,i)=>{let card=grid.querySelector(`[data-widget="${widget.id}"]`);if(!card){card=document.createElement('article');card.dataset.widget=widget.id;grid.append(card)}if(grid.children[i]!==card)grid.insertBefore(card,grid.children[i]||null);paintCard(card,widget)});
  $('[data-dashboard-attention]').closest('section').hidden=true;
  const clear=$('[data-command-clear]'),badges=commandBadges(adminState.summary);
  if(clear)clear.textContent=!summaryFresh||!Number.isFinite(badges.dashboard)?'Nelze potvrdit, že je vše vyřízeno: data jsou zastaralá nebo nedostupná.':badges.dashboard===0?'Vše ke kontrole je vyřízeno.':'';
  let empty=$('[data-command-empty]');if(!empty){empty=document.createElement('p');empty.dataset.commandEmpty='';grid.after(empty)}empty.hidden=widgets.length>0;empty.textContent='Přehled je prázdný. Moduly můžeš zapnout přes Nastavit zobrazení.';
  $('[data-admin-funnel]').hidden=!dashboardWantsPlanner();
  $('[data-dashboard-edit]').disabled=!adminState.dashboardPreferences||!form().hidden;
  renderDashboardDrill();
}
export function renderDashboardDrill(){
  for(const view of ['reservations','payments']){const panel=$(`[data-admin-panel="${view}"]`);let chip=panel.querySelector('[data-dashboard-filter]');if(!chip){chip=document.createElement('p');chip.dataset.dashboardFilter='';panel.prepend(chip)}const label=drillLabel(adminState.dashboardDrill);chip.hidden=!label;if(chip.dataset.label!==label){chip.dataset.label=label;chip.textContent=label;const b=document.createElement('button');b.type='button';b.dataset.dashboardClear='';b.textContent='Zrušit filtr z přehledu';chip.append(' ',b)}}
}
function writeDraft(changed=true){form().elements.configuration.value=JSON.stringify(draft);if(changed)form().elements.configuration.dispatchEvent(new Event('input',{bubbles:true}));}
function readDraft(){try{const v=JSON.parse(form().elements.configuration.value);if(validatePreferences(v))draft=v}catch{}}
function editFields(){
  const c=draft.compositions[composition()],ids=c.widgets.map(w=>w.id),fields=$('[data-dashboard-edit-fields]');
  const previewOpen=fields.querySelector('[data-layout-preview]')?.open??!matchMedia('(max-width:600px)').matches;
  const active=document.activeElement,activeRow=active?.closest('[data-edit-widget]')?.dataset.editWidget;
  const focusAttribute=['data-widget-toggle','data-widget-size','data-widget-move','data-quick-link'].find(a=>active?.hasAttribute(a));
  const focusValue=focusAttribute?active.getAttribute(focusAttribute):null;
  const ordered=[...c.widgets.filter(w=>Object.hasOwn(WIDGETS,w.id)),...Object.keys(WIDGETS).filter(id=>!ids.includes(id)).map(id=>({id,size:WIDGETS[id].sizes[0]}))];
  fields.innerHTML=`<p class="command-composition-label">${esc(COMPOSITIONS[composition()])} · Rozložení pro tvůj účet</p><fieldset class="command-module-list"><legend>Zobrazené moduly</legend>${ordered.map(w=>{
    const enabled=ids.includes(w.id),i=ids.indexOf(w.id),label=WIDGETS[w.id].label;
    return `<div class="command-module-row" data-edit-widget="${esc(w.id)}" data-enabled="${enabled}"><label class="command-module-toggle"><input type="checkbox" data-widget-toggle="${esc(w.id)}" ${enabled?'checked':''}/><span>${esc(label)}</span></label><div class="command-module-options"><label>Velikost <select data-widget-size aria-label="Velikost ${esc(label)}" ${!enabled?'disabled':''}>${WIDGETS[w.id].sizes.map(s=>`<option value="${s}" ${w.size===s?'selected':''}>${s==='wide'?'Široký':'Kompaktní'}</option>`).join('')}</select></label><div class="command-move"><button type="button" data-widget-move="-1" ${!enabled||i===0?'disabled':''} aria-label="${esc(label)} nahoru">↑</button><button type="button" data-widget-move="1" ${!enabled||i===c.widgets.length-1?'disabled':''} aria-label="${esc(label)} dolů">↓</button></div></div></div>`;
  }).join('')}</fieldset><details class="command-layout-preview" data-layout-preview ${previewOpen?'open':''}><summary>Náhled rozložení</summary><div class="command-preview" aria-label="Náhled výsledného rozložení">${commandLayout(c.widgets).map(w=>`<div data-preview-widget="${esc(w.id)}" style="--widget-span:${w.span}"><span>${esc(WIDGETS[w.id].label)}</span>${w.id==='trend'?'<svg viewBox="0 0 120 32" aria-hidden="true"><path d="M2 30 L25 24 L44 26 L65 14 L88 11 L118 2"/></svg>':'<i></i><i></i><i></i>'}</div>`).join('')||'<p>Prázdný přehled</p>'}</div></details><fieldset class="command-quick-controls"><legend>Rychlé odkazy · nejvýše 4</legend>${QUICK_LINK_IDS.map(id=>`<label><input type="checkbox" data-quick-link="${id}" ${c.quickLinks.includes(id)?'checked':''}>${esc(DESTINATIONS[id].label)}</label>`).join('')}</fieldset>`;
  if(focusAttribute){
    const scope=activeRow?fields.querySelector('[data-edit-widget="'+CSS.escape(activeRow)+'"]'):fields;
    scope?.querySelector('['+focusAttribute+'="'+CSS.escape(focusValue)+'"]')?.focus({preventScroll:true});
  }
}
function closeEditor(){form().closest('dialog')?.close();form().hidden=true;form().inert=true;forgetAdminEditor(form());draft=null;renderDashboard();$('[data-dashboard-edit]')?.focus({preventScroll:true});}
export function initializeDashboard({onNavigate,onRefresh}){
  navigate=onNavigate;refresh=onRefresh;form().inert=true;
  const dialog=document.createElement('dialog');dialog.className='command-settings';dialog.setAttribute('aria-labelledby','command-settings-title');form().before(dialog);dialog.append(form());
  const heading=document.createElement('header');heading.innerHTML=`<h2 id="command-settings-title">${commandIcon('settings')} Nastavit zobrazení</h2><button type="button" data-dashboard-close aria-label="Zavřít nastavení">×</button>`;form().prepend(heading);
  const revalidate=document.createElement('button');revalidate.type='button';revalidate.dataset.dashboardRevalidate='';revalidate.textContent='Ověřit aktuální verzi ze serveru';form().querySelector('.dashboard-edit-actions').before(revalidate);
  dialog.addEventListener('cancel',event=>{event.preventDefault();if(allowAdminNavigation())closeEditor()});
  dialog.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const controls=[...dialog.querySelectorAll('button,input,select,textarea,a[href],summary,[tabindex]')].filter(n=>!n.disabled&&n.tabIndex>=0&&n.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  });
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if((event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)&&allowAdminNavigation())closeEditor()}});
  document.addEventListener('change',event=>{
    if(event.target.matches('[data-dashboard-composition]')){if(!allowAdminNavigation()){event.target.value=composition();return}const next=event.target.value;closeEditor();adminState.dashboardComposition=next;window.dispatchEvent(new CustomEvent('admin:dashboardchoice'));renderDashboard();void refresh();}
    if(event.target.matches('[data-dashboard-range]')){adminState.dashboardRange=event.target.value;event.target.blur();window.dispatchEvent(new CustomEvent('admin:dashboardchoice'));renderDashboard();}
    if(!draft||!event.target.closest('[data-dashboard-edit-fields]'))return;
    const c=draft.compositions[composition()],id=event.target.closest('[data-edit-widget]')?.dataset.editWidget;
    if(event.target.matches('[data-widget-toggle]')){const key=event.target.dataset.widgetToggle;if(event.target.checked)c.widgets.push({id:key,size:WIDGETS[key].sizes[0]});else c.widgets=c.widgets.filter(w=>w.id!==key);}
    if(event.target.matches('[data-widget-size]'))c.widgets.find(w=>w.id===id).size=event.target.value;
    if(event.target.matches('[data-widget-add]')&&WIDGETS[event.target.value])c.widgets.push({id:event.target.value,size:WIDGETS[event.target.value].sizes[0]});
    if(event.target.matches('[data-quick-link]')){const key=event.target.dataset.quickLink;if(event.target.checked){if(c.quickLinks.length===4){event.target.checked=false;toast('Nejvýše čtyři rychlé odkazy.');return}c.quickLinks.push(key)}else c.quickLinks=c.quickLinks.filter(v=>v!==key)}
    writeDraft();editFields();
  });
  document.addEventListener('click',event=>{
    const target=event.target.closest('button');if(!target)return;
    if(target.hasAttribute('data-dashboard-preview')){try{const raw=JSON.parse(target.dataset.dashboardPreview),base=destination(raw.destination);if(base)navigate({...base,queueMember:raw.queueMember,reservationId:raw.reservationId,historyYear:raw.historyYear,historyClaimType:raw.historyClaimType});}catch{}return;}
    if(target.hasAttribute('data-dashboard-destination')){const next=destination(target.dataset.dashboardDestination,JSON.parse(target.dataset.dashboardDrill||'{}'));if(next)navigate(next);}
    if(target.hasAttribute('data-dashboard-revalidate'))void refresh('manual');
    if(target.hasAttribute('data-dashboard-clear'))navigate(destination(adminState.activeAdminView==='payments'?'recorded':'reservations'),{clear:true});
    if(target.hasAttribute('data-dashboard-edit')){draft=clone(config());form().hidden=false;form().inert=false;writeDraft(false);editFields();bindCurrentEditors();dialog.showModal();renderDashboard();form().querySelector('button')?.focus();}
    if((target.hasAttribute('data-dashboard-cancel')||target.hasAttribute('data-dashboard-close'))&&allowAdminNavigation())closeEditor();
    if(target.hasAttribute('data-dashboard-apply')&&pendingPreferences&&allowAdminNavigation()){const next=pendingPreferences;closeEditor();acceptNext=true;receiveDashboardPreferences(next);renderDashboard();void refresh();}
    if(target.hasAttribute('data-dashboard-reset')&&draft&&window.confirm(`Obnovit tovární rozložení pouze „${COMPOSITIONS[composition()]}“? Změna se odešle až tlačítkem Uložit.`)){draft.compositions[composition()]=factoryPreferences().compositions[composition()];writeDraft();editFields();}
    const id=target.closest('[data-edit-widget]')?.dataset.editWidget;
    if(draft&&id){const list=draft.compositions[composition()].widgets,i=list.findIndex(w=>w.id===id);if(target.hasAttribute('data-widget-hide'))list.splice(i,1);else if(target.hasAttribute('data-widget-move')){const j=i+Number(target.dataset.widgetMove);if(j>=0&&j<list.length)[list[i],list[j]]=[list[j],list[i]];}else return;writeDraft();editFields();}
    if(target.hasAttribute('data-recovery-action'))queueMicrotask(()=>{if(draft){readDraft();editFields();}});
  });
  form().addEventListener('submit',async event=>{event.preventDefault();readDraft();if(!validatePreferences(draft))return;const save=$('[data-dashboard-save]');save.disabled=true;
    try{const result=await adminCommand('/api/admin/preferences',{method:'PUT',body:draft,editor:form(),submitted:{':configuration':form().elements.configuration.value}});if(adminEditorDirty(form())){toast('Rozložení uloženo; další rozepsané změny zůstávají neuložené.');return}acceptNext=true;if(result.preferences)receiveDashboardPreferences({...result,revision:result.operation.revision});await refresh('manual');closeEditor();toast('Rozložení uloženo pro tento účet.');}
    catch(error){toast(error.message||'Rozložení nelze uložit.');}finally{save.disabled=false;}
  });
  window.addEventListener('admin:discardfiles',()=>{if(draft)closeEditor()});
  // Focused controls are never replaced by a background refresh. Paint after the user leaves.
  document.addEventListener('focusout',event=>{if(event.target.closest('[data-widget]'))queueMicrotask(renderDashboard)});
  document.addEventListener('pointerout',event=>{const card=event.target.closest('[data-widget]');if(card&&!card.contains(event.relatedTarget))queueMicrotask(renderDashboard)});
}
