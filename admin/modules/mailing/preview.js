import { apiRequest } from '../../api.js?v=20260903-mailing-b';
import { $, $$ } from '../../ui.js?v=20260903-phase5';

let previewTimer=null,previewSequence=0;

export function setMailingPreviewDevice(device){
  const normalized=device==='mobile'?'mobile':'desktop';
  const stage=$('[data-mailing-preview-stage]');
  if(stage)stage.dataset.device=normalized;
  $$('[data-mailing-preview-device]').forEach(button=>{const active=button.dataset.mailingPreviewDevice===normalized;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active))});
}

export function scheduleMailingPreview(draft,{immediate=false}={}){
  clearTimeout(previewTimer);
  const snapshot=JSON.parse(JSON.stringify(draft));
  previewTimer=setTimeout(()=>renderMailingPreview(snapshot),immediate?0:260);
}

export async function renderMailingPreview(draft){
  const sequence=++previewSequence,status=$('[data-mailing-preview-status]'),frame=$('[data-mailing-preview-frame]');
  $('[data-mailing-preview-subject]').textContent=draft.subject||'Bez předmětu';
  $('[data-mailing-preview-preheader]').textContent=draft.preheader||'Bez preheaderu';
  status.hidden=false;status.textContent='Generuji náhled…';status.classList.remove('is-error');
  try{
    const payload=await apiRequest('/api/admin/mailing/render-preview',{method:'POST',body:{subject:draft.subject,preheader:draft.preheader,content:draft.content}});
    if(sequence!==previewSequence)return;
    frame.srcdoc=payload.preview?.html||'';
    status.hidden=true;
  }catch(error){
    if(sequence!==previewSequence)return;
    frame.removeAttribute('srcdoc');status.hidden=false;status.textContent=error.message||'Náhled se nepodařilo vygenerovat.';status.classList.add('is-error');
  }
}

export function resetMailingPreview(){clearTimeout(previewTimer);previewSequence++;const frame=$('[data-mailing-preview-frame]');if(frame)frame.removeAttribute('srcdoc');setMailingPreviewDevice('desktop')}
