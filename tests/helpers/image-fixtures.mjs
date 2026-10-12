import {readFileSync} from 'node:fs';
const paths={
 'image/jpeg':'../../assets/images/program/sunday.jpg',
 'image/png':'../../united-logo-blue-silver-transparent.png',
 'image/webp':'../../assets/images/showshine/ss_coupe.webp',
};
export const imageFixture=type=>readFileSync(new URL(paths[type],import.meta.url));
// Real JPEG pixels, with a legal COM marker to distinguish replacement attempts.
export function jpegFixture(label=''){
 const bytes=imageFixture('image/jpeg');if(!label)return bytes;
 const text=Buffer.from(label),marker=Buffer.alloc(4);marker[0]=255;marker[1]=254;marker.writeUInt16BE(text.length+2,2);
 return Buffer.concat([bytes.subarray(0,2),marker,text,bytes.subarray(2)]);
}
