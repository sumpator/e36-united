import {expect,test} from '@playwright/test';

const monitors=new WeakMap();
export function installScreenshotReadiness(page){
 if(monitors.has(page))return;
 const network=new Map();monitors.set(page,network);
 page.on('request',request=>network.set(request.url(),{state:'pending'}));
 page.on('response',response=>network.set(response.url(),{state:'response',status:response.status()}));
 page.on('requestfinished',request=>network.set(request.url(),{...network.get(request.url()),state:'finished'}));
 page.on('requestfailed',request=>network.set(request.url(),{...network.get(request.url()),state:'failed',error:request.failure()?.errorText}));
}

export async function waitForScreenshotContent(page,{label,onSample=()=>{}}){
 installScreenshotReadiness(page);const network=monitors.get(page);let last;
 try{
  await expect.poll(async()=>{
   last=await page.evaluate(()=>{
    const relevant=image=>{
     if(!image.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))return false;
     const r=image.getBoundingClientRect();let left=Math.max(0,r.left),right=Math.min(innerWidth,r.right),top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom);
     for(let parent=image.parentElement;parent;parent=parent.parentElement){
      const style=getComputedStyle(parent),box=parent.getBoundingClientRect();
      if(/hidden|clip|auto|scroll/.test(style.overflowX)){left=Math.max(left,box.left);right=Math.min(right,box.right)}
      if(/hidden|clip|auto|scroll/.test(style.overflowY)){top=Math.max(top,box.top);bottom=Math.min(bottom,box.bottom)}
     }
     return right>left&&bottom>top;
    };
    const decodes=window.__e36ScreenshotDecodes||(window.__e36ScreenshotDecodes=new WeakMap());
    const images=[...document.images].filter(relevant).map(image=>{
     const source=image.currentSrc||image.src,identity=JSON.stringify([image.src,image.srcset,image.sizes,image.currentSrc]);let decoded=decodes.get(image);
     if(!decoded||decoded.identity!==identity){decoded={identity,state:'loading'};decodes.set(image,decoded)}
     if(image.complete&&image.naturalWidth>0&&decoded.state==='loading'){
      decoded.state='decoding';image.decode().then(()=>decoded.state='ready',error=>{decoded.state='error';decoded.error=String(error)});
     }
     const phase=!source?'missing-source':!image.complete?'loading':image.naturalWidth===0?'load-error':decoded.state;
     return {src:image.getAttribute('src'),url:source,currentSrc:image.currentSrc,complete:image.complete,naturalWidth:image.naturalWidth,loading:image.loading,phase,error:decoded.error};
    });
    return {fonts:{status:document.fonts.status,faces:[...document.fonts].map(font=>({family:font.family,status:font.status}))},images};
   });
   last.images.forEach(image=>image.network=network.get(image.url)||{state:'not-requested'});onSample(last);
   const pending=last.images.filter(image=>image.phase!=='ready');
   if(last.fonts.status!=='loaded'||last.fonts.faces.some(font=>font.status==='error'))pending.unshift({phase:'fonts',...last.fonts});
   return pending;
  },{message:`Screenshot ${label}: current visible fonts/images must be ready`}).toEqual([]);
 }catch(error){
  await test.info().attach(`${label}-readiness`,{body:JSON.stringify(last,null,2),contentType:'application/json'});
  throw new Error(`Screenshot ${label} content unavailable: ${JSON.stringify(last)}`,{cause:error});
 }
 return last;
}
