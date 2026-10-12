import {inspectImageContent} from './image-content.js';
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const verified=new WeakMap();

async function validateImageFile(file) {
  if (!file || typeof file !== "object" || typeof file.size !== "number" || typeof file.type !== "string") return "Missing file";
  if (!IMAGE_TYPES.has(file.type)) return "Only JPG, PNG and WEBP are allowed";
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES) return "Image is too large";
  try{
    const bytes=await boundedImageBytes(file.stream(),file.size);if(bytes.length!==file.size)throw new Error('Invalid size');const image=inspectImageContent(bytes);
    if(image.type!==file.type)return 'Deklarovaný typ neodpovídá obsahu fotografie.';
    verified.set(file,{...image,bytes});
  }catch{return 'Soubor neobsahuje platnou nebo bezpečně velkou fotografii JPG, PNG či WebP.'}
  return "";
}

// Bounded to the server's existing 8 MiB limit, even for a misleading source.
export async function boundedImageBytes(stream,size=MAX_IMAGE_BYTES){
  if(!Number.isInteger(size)||size<1||size>MAX_IMAGE_BYTES)throw new Error('Image is too large');
  const bytes=new Uint8Array(size),reader=stream.getReader();let length=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;if(length+value.byteLength>size){await reader.cancel();throw new Error('Image is too large')}bytes.set(value,length);length+=value.byteLength;}}
  finally{reader.releaseLock()}
  return bytes.subarray(0,length);
}
export function verifiedImage(file){const image=verified.get(file);if(!image)throw new Error('Image not validated');return image}

function extensionFor(type) {
  return type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
}

export { extensionFor, validateImageFile };
