// Independent test-only decoder for the fixed v4/M byte-mode Member symbol.
// Reads the rendered SVG modules, BCH format bits, unmasking and interleaved bytes.
// Not a camera decoder; no error correction is attempted on damaged symbols.
export function decodeMemberQrSvg(svg){
 const size=Number(svg.match(/viewBox="0 0 (\d+) /)?.[1]),n=(size-48)/6;
 if(n!==33)throw Error('Expected version 4 QR');
 const matrix=Array.from({length:n},()=>Array(n).fill(false));
 for(const match of svg.matchAll(/M(\d+),(\d+)l6,0 0,6 -6,0 0,-6z/g))matrix[(Number(match[2])-24)/6][(Number(match[1])-24)/6]=true;
 let format=0;for(let i=0;i<15;i++){const row=i<6?i:i<8?i+1:n-15+i;if(matrix[row][8])format|=1<<i}
 const degree=value=>31-Math.clz32(value);
 let bits=-1;for(let candidate=0;candidate<32;candidate++){let remainder=candidate<<10;while(degree(remainder)>=10)remainder^=0x537<<(degree(remainder)-10);if((((candidate<<10)|remainder)^0x5412)===format)bits=candidate}
 if(bits<0||(bits>>3)!==0)throw Error('Invalid format or non-M correction level');const mask=bits&7;
 const used=Array.from({length:n},()=>Array(n).fill(false)),mark=(r,c)=>{if(r>=0&&r<n&&c>=0&&c<n)used[r][c]=true};
 for(const[r,c]of [[0,0],[n-7,0],[0,n-7]])for(let y=-1;y<=7;y++)for(let x=-1;x<=7;x++)mark(r+y,c+x);
 for(let y=24;y<=28;y++)for(let x=24;x<=28;x++)mark(y,x);
 for(let i=8;i<n-8;i++){mark(6,i);mark(i,6)}
 for(let i=0;i<15;i++){mark(i<6?i:i<8?i+1:n-15+i,8);mark(8,i<8?n-i-1:i<9?15-i:15-i-1)}mark(n-8,8);
 const masks=[(r,c)=>(r+c)%2===0,r=>r%2===0,(r,c)=>c%3===0,(r,c)=>(r+c)%3===0,(r,c)=>(Math.floor(r/2)+Math.floor(c/3))%2===0,(r,c)=>(r*c)%2+(r*c)%3===0,(r,c)=>((r*c)%2+(r*c)%3)%2===0,(r,c)=>((r*c)%3+(r+c)%2)%2===0];
 const stream=[];let row=n-1,step=-1;
 for(let col=n-1;col>0;col-=2){if(col===6)col--;for(;;){for(let offset=0;offset<2;offset++)if(!used[row][col-offset])stream.push(Number(matrix[row][col-offset]!==masks[mask](row,col-offset)));row+=step;if(row<0||row>=n){row-=step;step=-step;break}}}
 const bytes=[];for(let i=0;i+7<stream.length;i+=8)bytes.push(stream.slice(i,i+8).reduce((v,b)=>(v<<1)|b,0));
 const data=[...Array.from({length:32},(_,i)=>bytes[i*2]),...Array.from({length:32},(_,i)=>bytes[i*2+1])];let cursor=0;
 const read=count=>{let result=0;while(count--){result=(result<<1)|((data[Math.floor(cursor/8)]>>(7-cursor%8))&1);cursor++}return result};
 if(read(4)!==4)throw Error('Expected byte mode');const length=read(8),decoded=[];for(let i=0;i<length;i++)decoded.push(read(8));return new TextDecoder().decode(new Uint8Array(decoded));
}
