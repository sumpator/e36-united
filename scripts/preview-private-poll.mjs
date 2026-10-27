// Local synthetic preview only: no credentials, external fetch, email or production services.
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,relative,extname} from 'node:path';
import {privatePollRuntime,POLL} from '../tests/helpers/private-poll-runtime.mjs';
const runtime=await privatePollRuntime(),root=resolve('invitations'),port=4188;
const base='http://127.0.0.1:'+port,link=base+'/invitations/darts.html#'+new URLSearchParams({poll:POLL,token:runtime.tokens[0],answer:'yes'});
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,base);
  if(url.pathname==='/'){res.writeHead(302,{Location:link});res.end();return}
  if(url.pathname==='/firebase-config.js'){
   res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});res.end('export const portalConfig={apiBaseUrl:'+JSON.stringify(base)+'};');return;
  }
  if(url.pathname.startsWith('/api/')){
   if(!url.pathname.startsWith('/api/private-polls/')){res.writeHead(401);res.end();return}
   if(!['GET','HEAD','POST'].includes(req.method)){res.writeHead(405);res.end();return}
   let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>8192){res.writeHead(413);res.end();return}chunks.push(chunk)}
   const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):undefined;
   const headers={...req.headers,origin:'https://e36united.cz'};delete headers.host;delete headers['content-length'];
   const response=await runtime.call({path:url.pathname,method:req.method,body,token:req.headers.authorization?.slice(7),headers});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  if(!['GET','HEAD'].includes(req.method)||!url.pathname.startsWith('/invitations/')){res.writeHead(404);res.end();return}
  const name=decodeURIComponent(url.pathname.slice('/invitations/'.length));
  if(name.split(/[\\/]/).some(s=>s==='..'||s.startsWith('.'))||!mime[extname(name)]){res.writeHead(404);res.end();return}
  const file=resolve(root,name);if(relative(root,file).startsWith('..')){res.writeHead(404);res.end();return}
  const bytes=readFileSync(file);res.writeHead(200,{'Content-Type':mime[extname(file)],'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end(req.method==='HEAD'?undefined:bytes);
 }catch{res.writeHead(400);res.end('Local preview request failed')}
});
server.listen(port,'127.0.0.1',()=>{
 mkdirSync('.local-evidence/darts-poll-20261027',{recursive:true});
 writeFileSync('.local-evidence/darts-poll-20261027/preview.json',JSON.stringify({url:link,secondRecipient:base+'/invitations/darts.html#'+new URLSearchParams({poll:POLL,token:runtime.tokens[1]}),syntheticOnly:true,storage:'isolated SQLite in memory, lost on preview restart',emailsSent:0,productionWrites:0},null,2));
 console.log(link);
});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.closeAllConnections();server.close();runtime.close();process.exit(0)});
