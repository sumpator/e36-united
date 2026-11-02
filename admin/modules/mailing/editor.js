import {apiUpload} from '../../api.js?v=20260930-arrivals2';
import {adminState} from '../../state.js?v=20260930-arrivals2';
import { $, $$, escapeHtml, toast } from '../../ui.js?v=20260924-merch2';
import { resetMailingPreview, scheduleMailingPreview, setMailingPreviewDevice } from './preview.js?v=20260930-arrivals2';

const typeLabels={hero:'Úvod',heading:'Nadpis',rich_text:'Text',image:'Obrázek',cta:'Tlačítko',divider:'Oddělovač',highlight:'Zvýraznění',survey:'Anketa'};
let mediaEpoch=0;const imageUploads=new Map();
let initialized=false,currentCampaignId='',blocks=[],templateVersion='e36-default-v1',saveHandler=null,openHandler=()=>{},readOnly=false;

const copy=value=>JSON.parse(JSON.stringify(value));
const field=(label,key,value='',options={})=>`<label class="admin-field${options.wide?' admin-field--wide':''}"><span>${escapeHtml(label)}</span>${options.textarea?`<textarea data-block-field="${key}" rows="${options.rows||4}">${escapeHtml(value)}</textarea>`:`<input data-block-field="${key}" maxlength="${options.max||600}" value="${escapeHtml(value)}"${options.type?` type="${options.type}"`:''}/>`}</label>`;
const newId=prefix=>`${prefix}-${crypto.randomUUID()}`;

function freshBlock(type){
  if(type==='hero')return{id:newId('hero'),type,imageUrl:'',alt:'',kicker:'UNITED',heading:'Nový hero nadpis',text:''};
  if(type==='heading')return{id:newId('heading'),type,kicker:'UNITED',heading:'Nový nadpis'};
  if(type==='rich_text')return{id:newId('text'),type,text:'Napiš zprávu pro členy United.'};
  if(type==='image')return{id:newId('image'),type,imageUrl:'',alt:'',caption:''};
  if(type==='cta')return{id:newId('cta'),type,label:'Zjistit více',url:'https://www.e36united.cz/',variant:'primary'};
  if(type==='divider')return{id:newId('divider'),type,variant:'line',size:'medium'};
  if(type==='highlight')return{id:newId('highlight'),type,kicker:'DŮLEŽITÉ',text:'Krátká zvýrazněná zpráva.'};
  const questionId=newId('question');return{id:newId('survey'),type:'survey',questionId,question:'Nová otázka',text:'',answers:[{id:newId('answer'),label:'ANO'},{id:newId('answer'),label:'NE'}]};
}

function imageField(block){
 const pending=imageUploads.get(block.id),src=pending?.url||block.imageUrl;
 return field('Obrázek · absolutní HTTPS URL','imageUrl',block.imageUrl,{wide:true,max:1600})+'<div class="admin-mailing-image" data-mailing-image><label class="admin-button">'+(src?'Změnit obrázek':'Nahrát obrázek')+'<input data-mailing-image-file type="file" accept="image/jpeg,image/png" '+(pending?.busy?'disabled':'')+'></label>'+(src?'<img alt="Náhled obrázku do e-mailu" src="'+escapeHtml(src)+'"><button type="button" data-mailing-image-remove>Odebrat</button>':'')+'<p role="status" data-mailing-image-status>'+(pending?.busy?'Nahrávám obrázek…':pending?.error?'Nahrání selhalo. Ostatní obsah zůstal zachován.':'JPEG nebo PNG · nejvýše 8 MB')+'</p>'+(pending?.error?'<button type="button" data-mailing-image-retry>Zkusit nahrát znovu</button>':'')+'</div>';
}
function clearImageUpload(id){const item=imageUploads.get(id);item?.controller?.abort();if(item?.url)URL.revokeObjectURL(item.url);imageUploads.delete(id)}
function clearImageUploads(){mediaEpoch++;for(const id of imageUploads.keys())clearImageUpload(id)}
async function uploadImage(block,file){
 if(readOnly)return;clearImageUpload(block.id);const epoch=mediaEpoch,actor=adminState.currentUser,generation=adminState.sessionGeneration,item={file,url:URL.createObjectURL(file),controller:new AbortController(),busy:true,error:false};imageUploads.set(block.id,item);renderBlocks();dirty();
 try{
  const result=await apiUpload('/api/admin/mailing/media',file,{method:'POST',signal:item.controller.signal});
  if(epoch!==mediaEpoch||actor!==adminState.currentUser||generation!==adminState.sessionGeneration||imageUploads.get(block.id)!==item||!blocks.includes(block))return;
  if(!/^https:\/\/api\.e36united\.cz\/api\/mailing\/media\/[a-f0-9-]+\.(jpg|png)$/.test(result.imageUrl))throw Error('Neplatná adresa obrázku.');
  block.imageUrl=result.imageUrl;clearImageUpload(block.id);renderBlocks();dirty();
 }catch(error){if(imageUploads.get(block.id)!==item||epoch!==mediaEpoch)return;item.busy=false;item.error=true;renderBlocks()}
}

function blockFields(block){
  if(block.type==='hero')return imageField(block)+field('Alt text','alt',block.alt,{wide:true,max:240})+field('Štítek','kicker',block.kicker,{max:100})+field('Nadpis','heading',block.heading,{max:180})+field('Krátký text','text',block.text,{wide:true,textarea:true,rows:3});
  if(block.type==='heading')return field('Štítek','kicker',block.kicker,{max:100})+field('Nadpis','heading',block.heading,{wide:true,max:180});
  if(block.type==='rich_text')return `${field('Text','text',block.text,{wide:true,textarea:true,rows:7})}<p class="admin-mailing-format-help">Podpora: prázdný řádek = odstavec, <code>**tučně**</code>, <code>_kurzíva_</code>, <code>[odkaz](https://…)</code> a seznamy začínající <code>- </code>.</p>`;
  if(block.type==='image')return imageField(block)+field('Alt text','alt',block.alt,{max:240})+field('Popisek','caption',block.caption,{max:400});
  if(block.type==='cta')return `${field('Text tlačítka','label',block.label,{max:120})}${field('Absolutní HTTPS URL','url',block.url,{max:1600})}<label class="admin-field"><span>Varianta</span><select data-block-field="variant"><option value="primary"${block.variant==='primary'?' selected':''}>Hlavní modré</option><option value="secondary"${block.variant==='secondary'?' selected':''}>Vedlejší</option></select></label>`;
  if(block.type==='divider')return `<label class="admin-field"><span>Typ</span><select data-block-field="variant"><option value="line"${block.variant==='line'?' selected':''}>Linka</option><option value="space"${block.variant==='space'?' selected':''}>Prázdná mezera</option></select></label><label class="admin-field"><span>Velikost</span><select data-block-field="size"><option value="small"${block.size==='small'?' selected':''}>Malá</option><option value="medium"${block.size==='medium'?' selected':''}>Střední</option><option value="large"${block.size==='large'?' selected':''}>Velká</option></select></label>`;
  if(block.type==='highlight')return field('Štítek','kicker',block.kicker,{max:100})+field('Zpráva','text',block.text,{wide:true,textarea:true,rows:4});
  const answers=block.answers.map((answer,index)=>`<div class="admin-mailing-answer" data-answer-id="${escapeHtml(answer.id)}"><span>${String(index+1).padStart(2,'0')}</span><input aria-label="Odpověď ${index+1}" maxlength="180" value="${escapeHtml(answer.label)}"/><button aria-label="Odebrat odpověď ${index+1}" data-mailing-answer-remove type="button"${block.answers.length<=2?' disabled':''}>×</button></div>`).join('');
  return `${field('Otázka','question',block.question,{wide:true,max:300})}${field('Vysvětlení','text',block.text,{wide:true,textarea:true,rows:3})}<details class="admin-mailing-stable-id"><summary>Technické údaje otázky</summary><code>${escapeHtml(block.questionId)}</code></details><div class="admin-mailing-answer-list" data-mailing-answer-list>${answers}</div><button class="admin-button" data-mailing-answer-add type="button"${block.answers.length>=5?' disabled':''}>+ Přidat odpověď</button>`;
}

function renderBlocks(){
  const target=$('[data-mailing-block-list]');
  if(!blocks.length){target.innerHTML='<div class="admin-empty">Koncept nemá žádné bloky. Přidej první obsahový blok.</div>';return}
  const expanded=new Map([...target.querySelectorAll('[data-block-id]')].map(node=>[node.dataset.blockId,node.querySelector('details')?.open]));
  target.innerHTML=blocks.map((block,index)=>`<article class="admin-mailing-block" data-block-id="${escapeHtml(block.id)}" data-block-type="${escapeHtml(block.type)}"><header><div><span>${String(index+1).padStart(2,'0')}</span><strong>${escapeHtml(typeLabels[block.type]||block.type)}</strong></div><div class="admin-mailing-block-actions"><button aria-label="Posunout blok nahoru" data-block-action="up" type="button"${index===0?' disabled':''}>↑</button><button aria-label="Posunout blok dolů" data-block-action="down" type="button"${index===blocks.length-1?' disabled':''}>↓</button><button aria-label="Duplikovat blok" data-block-action="duplicate" type="button">⧉</button><button aria-label="Odstranit blok" data-block-action="remove" type="button">×</button></div></header><details ${expanded.get(block.id)===true?'open':''}><summary>${escapeHtml(block.heading||block.question||block.label||block.text?.slice(0,90)||typeLabels[block.type])}</summary><div class="admin-mailing-block-fields">${blockFields(block)}</div></details></article>`).join('');
}

function readBlock(node){
  const block=blocks.find(item=>item.id===node.dataset.blockId);if(!block)return null;
  $$('[data-block-field]',node).forEach(input=>{block[input.dataset.blockField]=input.value});
  if(block.type==='survey')block.answers=$$('[data-answer-id]',node).map(answer=>({id:answer.dataset.answerId,label:$('input',answer).value}));
  return block;
}

export function readMailingEditorDraft(){
  $$('[data-block-id]').forEach(readBlock);
  const form=$('[data-mailing-campaign-form]'),data=new FormData(form);
  return{internalName:String(data.get('internalName')||''),subject:String(data.get('subject')||''),preheader:String(data.get('preheader')||''),templateVersion,content:{template:templateVersion,blocks:copy(blocks)}};
}

function preview(){scheduleMailingPreview(readMailingEditorDraft())}
export function markMailingEditorDirty(){dirty()}
function dirty(){const state=$('[data-mailing-save-state]');state.textContent='Neuložené změny';state.classList.add('is-dirty');preview()}

function replaceBlocks(next){blocks=copy(next||[]);renderBlocks();preview()}

export function openMailingEditorDraft(draft,{campaignId=''}={}){
  clearImageUploads();readOnly=['prepared','sent','archived'].includes(draft.status);
  $$('input,textarea,select,button',$('[data-mailing-campaign-form]')).forEach(node=>node.disabled=false);
  currentCampaignId=campaignId;templateVersion=draft.templateVersion||draft.content?.template||'e36-default-v1';blocks=copy(draft.content?.blocks||[]);
  const form=$('[data-mailing-campaign-form]');form.elements.internalName.value=draft.internalName||'';form.elements.subject.value=draft.subject||'';form.elements.preheader.value=draft.preheader||'';
  $('[data-mailing-template-version]').textContent=templateVersion;$('[data-mailing-editor-mode]').textContent=campaignId?(draft.internalName||'Upravit koncept'):'Nový koncept.';
  const state=$('[data-mailing-save-state]');state.textContent=campaignId?'Koncept uložen':'Nový koncept';state.classList.remove('is-dirty');
  $('[data-mailing-save]').disabled=readOnly;
  renderBlocks();scheduleMailingPreview(readMailingEditorDraft(),{immediate:true});
  if(readOnly){$$('input,textarea,select,button',form).forEach(node=>node.disabled=true);state.textContent='Neměnný obsah kampaně'}
  openHandler(campaignId);
}

export function allowMailingLeave(){if($('[data-mailing-save-state]').classList.contains('is-dirty')&&!confirm('Zahodit neuložené změny kampaně?'))return false;clearImageUploads();return true}
export function activeMailingCampaignId(){return currentCampaignId}
export function markMailingEditorSaved(){const state=$('[data-mailing-save-state]');state.textContent='Uloženo';state.classList.remove('is-dirty')}
export function resetMailingEditor(){clearImageUploads();currentCampaignId='';blocks=[];resetMailingPreview()}

function cloneBlock(block){
  const cloned=copy(block);cloned.id=newId(block.type);
  if(cloned.type==='survey'){cloned.questionId=newId('question');cloned.answers=cloned.answers.map(answer=>({...answer,id:newId('answer')}))}
  return cloned;
}

export function initializeMailingEditor({onSave,onOpen=()=>{}}){
  if(initialized)return;initialized=true;saveHandler=onSave;openHandler=onOpen;
  const form=$('[data-mailing-campaign-form]');
  form.addEventListener('input',event=>{const node=event.target.closest('[data-block-id]');if(node){if(event.target.dataset.blockField==='imageUrl'){clearImageUpload(node.dataset.blockId);const box=node.querySelector('[data-mailing-image]');box.querySelector('img')?.remove();box.querySelector('[data-mailing-image-retry]')?.remove();box.querySelector('[data-mailing-image-status]').textContent='JPEG nebo PNG · nejvýše 8 MB';box.querySelector('input').disabled=false;}readBlock(node);}dirty()});
  form.addEventListener('change',event=>{const node=event.target.closest('[data-block-id]');if(node)readBlock(node);if(event.target.matches('[data-mailing-image-file]')){const file=event.target.files?.[0],block=blocks.find(b=>b.id===node.dataset.blockId);if(!file||readOnly)return;if(!['image/jpeg','image/png'].includes(file.type)||file.size>8*1024*1024){toast('Vyber JPEG nebo PNG do 8 MB.');event.target.value='';return}void uploadImage(block,file);return}dirty()});
  window.addEventListener('admin:accesslost',clearImageUploads);
  form.addEventListener('submit',async event=>{event.preventDefault();if(!saveHandler||readOnly)return;if([...imageUploads.values()].some(item=>item.busy)){toast('Počkej na dokončení nahrávání obrázku.');return;}const button=$('[data-mailing-save]');button.disabled=true;try{await saveHandler(readMailingEditorDraft())}catch(error){const state=$('[data-mailing-save-state]');state.textContent='Uložení selhalo';state.classList.add('is-dirty');toast(error.message||'Koncept kampaně se nepodařilo uložit.')}finally{button.disabled=false}});
  document.addEventListener('click',event=>{
    const device=event.target.closest('[data-mailing-preview-device]');if(device){setMailingPreviewDevice(device.dataset.mailingPreviewDevice);return}
    if(readOnly)return;
    if(event.target.closest('[data-mailing-add-block]')){const type=$('[data-mailing-add-type]').value;blocks.push(freshBlock(type));renderBlocks();$('[data-mailing-block-list]').lastElementChild.querySelector('details').open=true;dirty();return}
    const article=event.target.closest('[data-block-id]');if(!article)return;
    readBlock(article);const imageBlock=blocks.find(item=>item.id===article.dataset.blockId);if(event.target.closest('[data-mailing-image-remove]')){clearImageUpload(imageBlock.id);imageBlock.imageUrl='';renderBlocks();dirty();return}if(event.target.closest('[data-mailing-image-retry]')){const file=imageUploads.get(imageBlock.id)?.file;if(file)void uploadImage(imageBlock,file);return}
    const index=blocks.findIndex(block=>block.id===article.dataset.blockId);if(index<0)return;
    const action=event.target.closest('[data-block-action]')?.dataset.blockAction;
    if(action==='up'&&index>0)[blocks[index-1],blocks[index]]=[blocks[index],blocks[index-1]];
    else if(action==='down'&&index<blocks.length-1)[blocks[index+1],blocks[index]]=[blocks[index],blocks[index+1]];
    else if(action==='duplicate')blocks.splice(index+1,0,cloneBlock(blocks[index]));
    else if(action==='remove'){clearImageUpload(blocks[index].id);blocks.splice(index,1);}
    else if(event.target.closest('[data-mailing-answer-add]')&&blocks[index].answers.length<5)blocks[index].answers.push({id:newId('answer'),label:'NOVÁ ODPOVĚĎ'});
    else if(event.target.closest('[data-mailing-answer-remove]')&&blocks[index].answers.length>2){const answer=event.target.closest('[data-answer-id]');blocks[index].answers=blocks[index].answers.filter(item=>item.id!==answer.dataset.answerId)}
    else return;
    const focusedId=article.dataset.blockId;renderBlocks();dirty();
    const replacement=$$('[data-block-id]').find(node=>node.dataset.blockId===focusedId)||$('[data-block-id]');
    const focusTarget=action?replacement?.querySelector(`[data-block-action="${action}"]:not(:disabled)`):null;
    (focusTarget||replacement?.querySelector('summary'))?.focus();
  });
}
