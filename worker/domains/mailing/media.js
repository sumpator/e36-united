import {json} from '../../http/responses.js';
import {cors} from '../../http/cors.js';
import {validateImageFile,verifiedImage,extensionFor} from '../media.js';

// Only this dedicated namespace is public. Member/garage/history keys never
// enter this path, and removing a block does not delete a shared object.
export async function publicMailingImage(request,env,url,origin){
 const match=url.pathname.match(/^\/api\/mailing\/media\/([a-f0-9-]{36}\.(?:jpg|png))$/);
 if(!match||!['GET','HEAD'].includes(request.method))return null;
 const object=await env.MEDIA.get('mailing/'+match[1]);
 if(!object)return json({error:'image_not_found'},404,origin);
 return cors(new Response(request.method==='HEAD'?null:object.body,{headers:{'Content-Type':match[1].endsWith('.png')?'image/png':'image/jpeg','Cache-Control':'public,max-age=31536000,immutable','X-Content-Type-Options':'nosniff','Content-Disposition':'inline'}}),origin);
}

export async function uploadMailingImage(request,env){
 const limit=9*1024*1024,reader=request.body?.getReader(),chunks=[];let length=0;
 if(!reader)throw Error('missing_image');
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();throw Error('image_too_large')}chunks.push(value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 let form;try{form=await new Response(bytes,{headers:{'Content-Type':request.headers.get('Content-Type')||''}}).formData()}catch{throw Error('invalid_image')}
 const file=form.get('file');
 if(!file||!['image/jpeg','image/png'].includes(file.type))throw Error('invalid_image_type');
 const error=await validateImageFile(file);if(error)throw Error('invalid_image');
 const image=verifiedImage(file),name=crypto.randomUUID()+'.'+extensionFor(image.type);
 await env.MEDIA.put('mailing/'+name,image.bytes,{httpMetadata:{contentType:image.type}});
 return {imageUrl:'https://api.e36united.cz/api/mailing/media/'+name};
}
