// Independent test-only decoder for the Member byte-mode symbols used by the UI.
// Reads rendered SVG modules, BCH format bits, unmasking and interleaved bytes.
function qrBytes(svg,centerOverlayRatio=0){
 const size=Number(svg.match(/viewBox="0 0 (\d+) /)?.[1]),n=(size-48)/6,version=(n-17)/4;
 if(!Number.isInteger(version)||version<1||version>6)throw Error('Unsupported QR version');
 const matrix=Array.from({length:n},()=>Array(n).fill(false));
 for(const match of svg.matchAll(/M(\d+),(\d+)l6,0 0,6 -6,0 0,-6z/g))matrix[(Number(match[2])-24)/6][(Number(match[1])-24)/6]=true;
 if(centerOverlayRatio){const side=size*centerOverlayRatio,low=(size-side)/2,high=(size+side)/2;for(let row=0;row<n;row++)for(let col=0;col<n;col++){const x=24+col*6,y=24+row*6;if(x<high&&x+6>low&&y<high&&y+6>low)matrix[row][col]=false}}
 let format=0;for(let i=0;i<15;i++){const row=i<6?i:i<8?i+1:n-15+i;if(matrix[row][8])format|=1<<i}
 const degree=value=>31-Math.clz32(value);
 let bits=-1;for(let candidate=0;candidate<32;candidate++){let remainder=candidate<<10;while(degree(remainder)>=10)remainder^=0x537<<(degree(remainder)-10);if((((candidate<<10)|remainder)^0x5412)===format)bits=candidate}
 if(bits<0)throw Error('Invalid format');const level=bits>>3,mask=bits&7;
 const used=Array.from({length:n},()=>Array(n).fill(false)),mark=(r,c)=>{if(r>=0&&r<n&&c>=0&&c<n)used[r][c]=true};
 for(const[r,c]of [[0,0],[n-7,0],[0,n-7]])for(let y=-1;y<=7;y++)for(let x=-1;x<=7;x++)mark(r+y,c+x);
 if(version>=2){const center=18+4*(version-2);for(let y=center-2;y<=center+2;y++)for(let x=center-2;x<=center+2;x++)mark(y,x)}
 for(let i=8;i<n-8;i++){mark(6,i);mark(i,6)}
 for(let i=0;i<15;i++){mark(i<6?i:i<8?i+1:n-15+i,8);mark(8,i<8?n-i-1:i<9?15-i:15-i-1)}mark(n-8,8);
 const masks=[(r,c)=>(r+c)%2===0,r=>r%2===0,(r,c)=>c%3===0,(r,c)=>(r+c)%3===0,(r,c)=>(Math.floor(r/2)+Math.floor(c/3))%2===0,(r,c)=>(r*c)%2+(r*c)%3===0,(r,c)=>((r*c)%2+(r*c)%3)%2===0,(r,c)=>((r*c)%3+(r+c)%2)%2===0];
 const stream=[];let row=n-1,step=-1;
 for(let col=n-1;col>0;col-=2){if(col===6)col--;for(;;){for(let offset=0;offset<2;offset++)if(!used[row][col-offset])stream.push(Number(matrix[row][col-offset]!==masks[mask](row,col-offset)));row+=step;if(row<0||row>=n){row-=step;step=-step;break}}}
 const bytes=[];for(let i=0;i+7<stream.length;i+=8)bytes.push(stream.slice(i,i+8).reduce((v,b)=>(v<<1)|b,0));
 return{bytes,version,level};
}

const gfExp=Array(512),gfLog=Array(256);for(let index=0,value=1;index<255;index++){gfExp[index]=value;gfLog[value]=index;value<<=1;if(value&0x100)value^=0x11d}for(let index=255;index<512;index++)gfExp[index]=gfExp[index-255];
const gfMul=(a,b)=>a&&b?gfExp[gfLog[a]+gfLog[b]]:0;
const normalize=poly=>{let start=0;while(start<poly.length-1&&!poly[start])start++;return poly.slice(start)};
const degree=poly=>poly.length-1;
const coefficient=(poly,power)=>poly[poly.length-1-power];
const addPoly=(a,b)=>{const length=Math.max(a.length,b.length),out=Array(length).fill(0);for(let index=0;index<length;index++)out[index]=(a[index-(length-a.length)]||0)^(b[index-(length-b.length)]||0);return normalize(out)};
const scalePoly=(poly,value)=>normalize(poly.map(item=>gfMul(item,value)));
const multiplyPoly=(a,b)=>{if(!a.some(Boolean)||!b.some(Boolean))return[0];const out=Array(a.length+b.length-1).fill(0);for(let ai=0;ai<a.length;ai++)for(let bi=0;bi<b.length;bi++)out[ai+bi]^=gfMul(a[ai],b[bi]);return normalize(out)};
const multiplyMonomial=(poly,power,value)=>normalize(poly.map(item=>gfMul(item,value)).concat(Array(power).fill(0)));
const monomial=(power,value)=>value?[value,...Array(power).fill(0)]:[0];
const evaluate=(poly,value)=>poly.reduce((result,item)=>gfMul(result,value)^item,0);
function euclidean(a,b,correctionBytes){
 if(degree(a)<degree(b))[a,b]=[b,a];let previous=a,current=b,previousFactor=[0],factor=[1];
 while(degree(current)>=correctionBytes/2){const older=previous,olderFactor=previousFactor;previous=current;previousFactor=factor;if(!previous.some(Boolean))throw Error('Uncorrectable QR');current=older;let quotient=[0],inverse=gfExp[255-gfLog[coefficient(previous,degree(previous))]];while(current.some(Boolean)&&degree(current)>=degree(previous)){const power=degree(current)-degree(previous),value=gfMul(coefficient(current,degree(current)),inverse);quotient=addPoly(quotient,monomial(power,value));current=addPoly(current,multiplyMonomial(previous,power,value))}factor=addPoly(multiplyPoly(quotient,previousFactor),olderFactor)}
 const denominator=coefficient(factor,0);if(!denominator)throw Error('Uncorrectable QR');const inverse=gfExp[255-gfLog[denominator]];return[scalePoly(factor,inverse),scalePoly(current,inverse)];
}
function errorLocations(locator){const count=degree(locator);if(count===1)return[coefficient(locator,1)];const found=[];for(let value=1;value<256&&found.length<count;value++)if(evaluate(locator,value)===0)found.push(gfExp[255-gfLog[value]]);if(found.length!==count)throw Error('Uncorrectable QR');return found}
function errorMagnitudes(evaluator,locations){return locations.map((location,index)=>{const inverse=gfExp[255-gfLog[location]];let denominator=1;for(let other=0;other<locations.length;other++)if(other!==index)denominator=gfMul(denominator,gfMul(locations[other],inverse)^1);return gfMul(evaluate(evaluator,inverse),gfExp[255-gfLog[denominator]])})}
function correctBlock(received,correctionBytes){const syndrome=Array(correctionBytes).fill(0);let clean=true;for(let index=0;index<correctionBytes;index++){const value=evaluate(received,gfExp[index]);syndrome[correctionBytes-1-index]=value;if(value)clean=false}if(clean)return received;const[locator,evaluator]=euclidean(monomial(correctionBytes,1),syndrome,correctionBytes),locations=errorLocations(locator),magnitudes=errorMagnitudes(evaluator,locations);locations.forEach((location,index)=>{const position=received.length-1-gfLog[location];if(position<0)throw Error('Uncorrectable QR');received[position]^=magnitudes[index]});return received}
function decodeBytes(bytes,version,level,{correct=false}={}){
 const layouts={'4:0':{blocks:2,data:32,ecc:18},'6:2':{blocks:4,data:15,ecc:28}},layout=layouts[`${version}:${level}`];
 if(!layout)throw Error('Unsupported QR block layout');
 const data=[];for(let block=0;block<layout.blocks;block++){const received=[];for(let i=0;i<layout.data;i++)received.push(bytes[i*layout.blocks+block]);for(let i=0;i<layout.ecc;i++)received.push(bytes[(layout.data+i)*layout.blocks+block]);if(correct)correctBlock(received,layout.ecc);data.push(...received.slice(0,layout.data))}let cursor=0;
 const read=count=>{let result=0;while(count--){result=(result<<1)|((data[Math.floor(cursor/8)]>>(7-cursor%8))&1);cursor++}return result};
 if(read(4)!==4)throw Error('Expected byte mode');const length=read(8),decoded=[];for(let i=0;i<length;i++)decoded.push(read(8));return new TextDecoder().decode(new Uint8Array(decoded));
}

export function decodeMemberQrSvg(svg){const{bytes,version,level}=qrBytes(svg);return decodeBytes(bytes,version,level)}
export function decodeMemberQrSvgWithCenteredLogo(svg){const{bytes,version,level}=qrBytes(svg,.15);return decodeBytes(bytes,version,level,{correct:true})}
