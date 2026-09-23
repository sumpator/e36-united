// Offline asset build only. Originals stay untouched. Run with an installed sharp
// package (or SHARP_MODULE pointing to the workstation's bundled copy).
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const sharp=require(process.env.SHARP_MODULE||'sharp');
const root=fileURLToPath(new URL('../assets/images/merch/',import.meta.url));
const sources={
 'polo-navy':'IMG_1570.PNG','polo-white':'IMG_1571.PNG','polo-blue':'IMG_1572.PNG',
 'stay-men-black':'V3M.jpg','stay-women-black':'V3W.jpg',
 'stay-women-blue':'stayUNITEDblue.jpg','stay-women-pink':'stayunitedpink.jpg',
 'cars-men-black':'V1M.jpg','cars-women-black':'V1W.jpg','cars-women-grey-v':'damskeVgrey.jpg',
};
await mkdir(root,{recursive:true});
for(const [id,file] of Object.entries(sources)){
 const input=root+'originals/'+file;
 for(const [suffix,width] of [['card',480],['detail',1000],['zoom',1800]]){
  let pipeline=sharp(input).rotate();
  // The complete polo, including both sleeves and hem, occupies x=0..879.
  // Keep the collage intact for detail/zoom; only the catalog is cropped.
  if(id.startsWith('polo-')&&suffix==='card'){
   // Exclude the top collage strip without trimming the right sleeve below it.
   // This mask touches only the detail panel, never the product silhouette.
   const mask=Buffer.from('<svg width="880" height="1254"><path d="M0 0H833V310L863 415H880V1254H0Z" fill="white"/></svg>');
   const crop=await pipeline.extract({left:0,top:0,width:880,height:1254}).ensureAlpha().composite([{input:mask,blend:'dest-in'}]).png().toBuffer();
   pipeline=sharp(crop);
  }
  await pipeline.resize({width,withoutEnlargement:true}).webp({quality:suffix==='zoom'?90:84}).toFile(root+id+'-'+suffix+'.webp');
 }
 if(id.startsWith('polo-')){
  for(const [i,top,height] of [[1,38,370],[2,424,376],[3,819,388]]){
   await sharp(input).extract({left:878,top,width:355,height}).webp({quality:90}).toFile(root+id+'-close-'+i+'.webp');
  }
 }
}
console.log('10 original images retained; 30 responsive exports and 9 existing polo close-ups generated.');
