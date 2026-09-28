import { compressImageBlob } from './member/media.js?v=20260928-flow1';
import { IMAGE_UPLOAD_TYPES } from './image-upload.js?v=20260827-garage-photos';
import { validatePhotoInput, PHOTO_INPUT_MAX_BYTES, PHOTO_OUTPUT_MAX_BYTES, PHOTO_MAX_PIXELS, PHOTO_MAX_EDGE } from './photo-limits.js?v=20260928-flow1';

// One queue per editor. Successful items are receipts, never part of a retry.
export function createPhotoBatch({maxFiles=8,items=[],onChange=()=>{},onNotice=()=>{}}={}){
  let running=false,generation=0;
  const emit=()=>onChange(items);
  function add(files){
    if(running)return;
    for(const file of Array.from(files||[])){
      if(!IMAGE_UPLOAD_TYPES.includes(file.type)){onNotice(`${file.name}: podporujeme JPG, PNG a WebP. HEIC nejdřív ulož jako JPG.`);continue}
      if(!file.size||file.size>PHOTO_INPUT_MAX_BYTES){onNotice(`${file.name}: vstupní soubor musí mít 1 B až 50 MiB.`);continue}
      if(items.some(item=>item.file.name===file.name&&item.file.size===file.size&&item.file.lastModified===file.lastModified))continue;
      if(items.filter(item=>item.status!=='uploaded').length>=maxFiles){onNotice(`Najednou můžeš připravit nejvýše ${maxFiles} fotografií.`);break}
      const item={id:crypto.randomUUID(),file,url:'',status:'ready',error:'',receipt:null};
      items.push(item);
      item.validation=validatePhotoInput(file).then(()=>{
        if(items.includes(item)){item.url=URL.createObjectURL(file);emit()}
        return null;
      }).catch(error=>{if(items.includes(item)){item.status='error';item.error=error.message;emit()}return error});
    }
    emit();
  }
  function remove(id){if(running)return;const index=items.findIndex(item=>item.id===id);if(index<0)return;URL.revokeObjectURL(items[index].url);items.splice(index,1);emit()}
  function clear(){generation++;for(const item of items)URL.revokeObjectURL(item.url);items.splice(0);emit()}
  async function send(upload,onSaved=()=>{}){
    if(running)return null;
    running=true;const epoch=generation,result={saved:0,failed:0};
    try{
      for(const item of items.filter(item=>item.status!=='uploaded')){
        if(epoch!==generation)break;
        item.status='processing';item.error='';emit();
        try{
          const invalid=await item.validation;if(invalid)throw invalid;
          if(epoch!==generation)break;
          item.blob ||= await compressImageBlob(item.file,1800,.82,{maxInputBytes:PHOTO_INPUT_MAX_BYTES,maxPixels:PHOTO_MAX_PIXELS,maxEdge:PHOTO_MAX_EDGE});
          if(item.blob.size>PHOTO_OUTPUT_MAX_BYTES)throw new Error('Fotografii se nepodařilo zmenšit pod 8 MiB.');
          if(epoch!==generation)break;
          item.status='uploading';emit();
          const receipt=await upload(item.blob,item);
          if(!receipt?.ok)throw new Error('Server nepotvrdil uložení. Zkus znovu stejnou fotografii.');
          if(epoch!==generation)break;
          item.receipt=receipt;item.status='uploaded';result.saved++;emit();
          // A failed refresh must not turn a confirmed upload back into a retry.
          try{await onSaved(receipt,item)}catch{onNotice('Fotografie je uložená, přehled se nepodařilo obnovit.');}
        }catch(error){if(epoch!==generation)break;item.status='error';item.error=error?.status===429?'Dnešní limit byl dosažen.':error?.message||'Nahrání selhalo. Zkus znovu.';result.failed++;emit()}
      }
    }finally{running=false;emit()}
    return result;
  }
  return {items,add,remove,clear,send,get busy(){return running},get pending(){return items.some(item=>item.status!=='uploaded')}};
}

export function renderPhotoBatch(container,batch){
  if(!container)return;
  container.replaceChildren();container.classList.add('photo-batch');
  for(const item of batch.items){
    const figure=document.createElement('figure'),image=document.createElement('img'),caption=document.createElement('figcaption'),name=document.createElement('b'),status=document.createElement('small'),remove=document.createElement('button');
    figure.dataset.uploadState=item.status;if(item.url)image.src=item.url;else image.hidden=true;image.alt=`Náhled ${item.file.name}`;image.onerror=()=>{image.hidden=true};
    name.textContent=item.file.name;status.setAttribute('role','status');status.textContent=({ready:'Připraveno',processing:'Zmenšuji…',uploading:'Odesílám…',uploaded:'Uloženo',error:item.error})[item.status];
    remove.type='button';remove.textContent='Odebrat';remove.disabled=batch.busy;remove.setAttribute('aria-label',`Odebrat ${item.file.name}`);remove.onclick=()=>batch.remove(item.id);
    caption.append(name,status,remove);figure.append(image,caption);container.append(figure);
  }
}
