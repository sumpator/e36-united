// Offline conversion only; retain the supplied original and the complete frame.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const sharp=require(process.env.SHARP_MODULE||'sharp');
const root=fileURLToPath(new URL('../assets/images/about/',import.meta.url));
for(const width of [480,960,1600]){
 await sharp(root+'originals/onas_2025.jpg').rotate().resize({width,withoutEnlargement:true}).webp({quality:84}).toFile(root+`onas-2025-${width}.webp`);
}
console.log('Original retained; three uncropped about-history WebP sizes generated.');
