import {PHOTO_MAX_EDGE,PHOTO_MAX_PIXELS} from '../../photo-limits.js';

// Container/marker validation, NOT an entropy/pixel decoder. Every loop advances
// through the bounded input; unusually fragmented containers are rejected.
const MAX_UNITS=4096;
const bad=()=>{throw new Error('Invalid image structure')};
const dimensions=(width,height)=>{
 if(!width||!height||width>PHOTO_MAX_EDGE||height>PHOTO_MAX_EDGE||width*height>PHOTO_MAX_PIXELS)bad();
 return {width,height};
};
const ascii=(b,p,n)=>String.fromCharCode(...b.subarray(p,p+n));
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
function crc(b,start,end){let value=0xffffffff;for(let p=start;p<end;p++)value=crcTable[(value^b[p])&255]^(value>>>8);return (value^0xffffffff)>>>0}

function png(b,v){
 if(b.length<45||!b.subarray(0,8).every((n,i)=>n===[137,80,78,71,13,10,26,10][i]))bad();
 let p=8,units=0,frame,idat=0,idatEnded=false,palette=false;const prefix=[];
 while(p<b.length){
  if(++units>MAX_UNITS||p+12>b.length)bad();const length=v.getUint32(p),type=ascii(b,p+4,4),end=p+12+length;
  if(end>b.length||!/^[A-Za-z]{4}$/.test(type)||crc(b,p+4,end-4)!==v.getUint32(end-4))bad();
  const data=p+8;
  if(type==='IHDR'){
   if(frame||p!==8||length!==13)bad();frame=dimensions(v.getUint32(data),v.getUint32(data+4));
   const depths={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
   if(!depths[b[data+9]]?.includes(b[data+8])||b[data+10]!==0||b[data+11]!==0||b[data+12]>1)bad();frame.color=b[data+9];
  }else if(!frame)bad();
  else if(type==='PLTE'){if(palette||idat||!length||length%3||length>768||[0,4].includes(frame.color))bad();palette=true}
  else if(type==='IDAT'){
   if(idatEnded||frame.color===3&&!palette)bad();idat+=length;
   for(let i=data;i<data+length&&prefix.length<2;i++)prefix.push(b[i]);
  }else if(type==='IEND'){
   if(length||end!==b.length||idat<6||prefix.length!==2||(prefix[0]&15)!==8||(prefix[0]>>>4)>7||((prefix[0]<<8)+prefix[1])%31||prefix[1]&32)bad();
   return dimensions(frame.width,frame.height);
  }else{
   if(idat)idatEnded=true;
   // Unknown critical chunks cannot safely be interpreted as a PNG image.
   if(type[0]===type[0].toUpperCase())bad();
   if(type==='fcTL'){if(length!==26)bad();const f=dimensions(v.getUint32(data+4),v.getUint32(data+8));if(v.getUint32(data+12)+f.width>frame.width||v.getUint32(data+16)+f.height>frame.height)bad()}
   if(type==='acTL'&&(length!==8||!v.getUint32(data)))bad();
  }
  p=end;
 }
 bad();
}

function jpeg(b,v){
 if(b.length<4||b[0]!==255||b[1]!==216)bad();let p=2,units=0,frame,marker,scans=0,entropy=0;
 const quant=new Set(),huffman=new Set();
 const sof=new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
 while(p<b.length){
  if(++units>MAX_UNITS||b[p++]!==255)bad();while(b[p]===255)p++;if(p>=b.length)bad();marker=b[p++];
  if(marker===0xd9){if(!frame||!scans||!entropy||p!==b.length)bad();return dimensions(frame.width,frame.height)}
  if(marker===0xd8||marker===0||marker===1||marker>=0xd0&&marker<=0xd7||p+2>b.length)bad();
  const length=v.getUint16(p),start=p+2,end=p+length;if(length<2||end>b.length)bad();
  if(sof.has(marker)){
   if(frame||length<11)bad();const n=b[start+5];if(n<1||n>4||length!==8+3*n||b[start]<1||b[start]>16)bad();
   frame={...dimensions(v.getUint16(start+3),v.getUint16(start+1)),marker,components:new Map()};
   for(let i=0;i<n;i++){const q=start+6+3*i,id=b[q],sampling=b[q+1];if(frame.components.has(id)||!(sampling>>>4)||!(sampling&15)||(sampling>>>4)>4||(sampling&15)>4||b[q+2]>3)bad();frame.components.set(id,b[q+2])}
  }else if(marker===0xdb){
   for(let q=start;q<end;){const info=b[q++],precision=info>>>4,table=info&15;if(precision>1||table>3||q+64*(precision+1)>end)bad();quant.add(table);for(let i=0;i<64;i++){if(!(precision?v.getUint16(q):b[q]))bad();q+=precision+1}}
  }else if(marker===0xc4){
   for(let q=start;q<end;){const info=b[q++];if((info>>>4)>1||(info&15)>3||q+16>end)bad();let count=0,space=1;for(let i=0;i<16;i++){const n=b[q++];count+=n;space=2*space-n;if(space<0)bad()}if(!count||count>256||q+count>end)bad();huffman.add(info);q+=count}
  }else if(marker===0xda){
   if(!frame)bad();const n=b[start];if(n<1||n>frame.components.size||length!==6+2*n)bad();const seen=new Set(),lossless=[0xc3,0xc7,0xcb,0xcf].includes(frame.marker),arithmetic=frame.marker>=0xc9;
   const ss=b[end-3],se=b[end-2],ah=b[end-1]>>>4,al=b[end-1]&15;
   if((lossless?(ss<1||ss>7||se!==0):(ss>se||se>63))||ah>13||al>13)bad();
   for(let i=0;i<n;i++){
    const id=b[start+1+2*i],tables=b[start+2+2*i];if(seen.has(id)||!frame.components.has(id))bad();seen.add(id);
    if(!lossless&&!quant.has(frame.components.get(id)))bad();
    if(!arithmetic){if(ss===0&&ah===0&&!huffman.has(tables>>>4))bad();if(se>0&&!huffman.has(16+(tables&15)))bad()}
   }
   scans++;p=end;let scanBytes=0;
   while(p<b.length){if(b[p]!==255){p++;scanBytes++;continue}const next=b[p+1];if(next===0){p+=2;scanBytes++;continue}if(next>=0xd0&&next<=0xd7){p+=2;continue}if(next===255){p++;continue}break}
   if(!scanBytes)bad();entropy+=scanBytes;continue;
  }
  p=end;
 }
 bad();
}

function webp(b,v){
 if(b.length<26||ascii(b,0,4)!=='RIFF'||ascii(b,8,4)!=='WEBP'||v.getUint32(4,true)+8!==b.length)bad();
 let units=0,canvas,animation=false,animHeader=false,frames=0,still;
 const u24=p=>b[p]+(b[p+1]<<8)+(b[p+2]<<16);
 function bitstream(type,start,end){
  if(type==='VP8 '){
   if(end-start<11||b[start]&1||((b[start]>>>1)&7)>3||!(b[start]&16)||ascii(b,start+3,3)!=='\x9d\x01\x2a')bad();
   const partition=u24(start)>>>5;if(!partition||start+10+partition>=end)bad();return dimensions(v.getUint16(start+6,true)&0x3fff,v.getUint16(start+8,true)&0x3fff);
  }
  if(end-start<6||b[start]!==0x2f)bad();const bits=v.getUint32(start+1,true);if(bits>>>29)bad();return dimensions(1+(bits&0x3fff),1+((bits>>>14)&0x3fff));
 }
 function chunks(start,end,frame){
  let p=start,image,alpha=false;
  while(p<end){
   if(++units>MAX_UNITS||p+8>end)bad();const type=ascii(b,p,4),length=v.getUint32(p+4,true),data=p+8,next=data+length+(length&1);
   if(next>end||length&1&&b[next-1]!==0)bad();
   if(type==='VP8X'){
    if(frame||canvas||p!==12||length!==10||b[data]&0xc1||b[data+1]||b[data+2]||b[data+3])bad();canvas=dimensions(1+u24(data+4),1+u24(data+7));animation=!!(b[data]&2);
   }else if(type==='ANIM'){if(frame||!animation||animHeader||length!==6||frames||still)bad();animHeader=true}
   else if(type==='ANMF'){
    if(frame||!animation||!animHeader||length<24)bad();const f=dimensions(1+u24(data+6),1+u24(data+9));
    if(2*u24(data)+f.width>canvas.width||2*u24(data+3)+f.height>canvas.height||b[data+15]&0xfc)bad();
    const content=chunks(data+16,data+length,true);if(!content||content.width!==f.width||content.height!==f.height)bad();frames++;
   }else if(type==='ALPH'){if(!canvas||alpha||image||length<2||(b[data]&3)>1)bad();alpha=true}
   else if(type==='VP8 '||type==='VP8L'){
    if(image||!frame&&animation||type==='VP8L'&&alpha)bad();image=bitstream(type,data,data+length);
    if(!frame){if(still)bad();still=image;if(canvas&&(canvas.width!==image.width||canvas.height!==image.height))bad();}
   }else if(frame&&['VP8X','ANIM','ANMF'].includes(type))bad();
   p=next;
  }
  return image;
 }
 chunks(12,b.length,false);if(animation?(!animHeader||!frames||still):!still)bad();return canvas||still;
}

export function inspectImageContent(bytes){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),v=new DataView(b.buffer,b.byteOffset,b.byteLength);
 if(b[0]===137)return {type:'image/png',...png(b,v)};
 if(b[0]===255&&b[1]===216)return {type:'image/jpeg',...jpeg(b,v)};
 if(ascii(b,0,4)==='RIFF')return {type:'image/webp',...webp(b,v)};
 bad();
}
