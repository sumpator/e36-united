import {json} from '../http/responses.js';
import {isAllowedOrigin,cors} from '../http/cors.js';
import {requireAdmin} from '../auth/admin.js';

const idPattern=/^[a-zA-Z0-9_-]{1,80}$/;
const tokenPattern=/^[a-zA-Z0-9_-]{43}$/;
export async function hashPollToken(token){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
async function bodyJson(request){
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))return null;
 const reader=request.body?.getReader();if(!reader)return null;
 let text='',size=0;const decoder=new TextDecoder();
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192){await reader.cancel();return null}text+=decoder.decode(value,{stream:true})}text+=decoder.decode();return JSON.parse(text)}catch{return null}finally{reader.releaseLock()}
}
function state(row){return {ok:true,poll:{id:row.poll_id,title:row.title,closed:Boolean(row.closed_at)},response:{answer:row.answer,score:row.score,version:row.version,updatedAt:row.updated_at}}}
async function invitation(env,pollId,hash){
 return env.DB.prepare('SELECT i.*,p.title,p.closed_at FROM private_poll_invitations i JOIN private_polls p ON p.id=i.poll_id WHERE i.poll_id=? AND i.token_hash=?').bind(pollId,hash).first();
}
export async function routePrivatePoll({request,env,url,origin}){
 const match=url.pathname.match(/^\/api\/private-polls\/([a-zA-Z0-9_-]{1,80})\/response$/);
 if(!match)return json({ok:false,error:'not_found'},404,origin);
 if(!isAllowedOrigin(origin))return json({ok:false,error:'origin_forbidden'},403,origin);
 if(!['GET','HEAD','POST'].includes(request.method))return json({ok:false,error:'method_not_allowed'},405,origin);
 if(/prefetch|prerender/i.test([request.headers.get('Purpose'),request.headers.get('Sec-Purpose')].join(' ')))return json({ok:false,error:'prefetch_not_allowed'},403,origin);
 const token=(request.headers.get('Authorization')||'').match(/^Bearer ([a-zA-Z0-9_-]{43})$/)?.[1]||'';
 if(!tokenPattern.test(token))return json({ok:false,error:'invalid_invitation'},404,origin);
 const hash=await hashPollToken(token),row=await invitation(env,match[1],hash);
 if(!row)return json({ok:false,error:'invalid_invitation'},404,origin);
 if(request.method==='HEAD')return cors(new Response(null,{status:200,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}}),origin);
 if(request.method==='GET')return json(state(row),200,origin);
 // Bearer capability plus an allowed browser origin; GET/HEAD never write.
 if(!origin)return json({ok:false,error:'origin_required'},403,origin);
 const body=await bodyJson(request);
 if(!body||!['yes','no','maybe'].includes(body.answer)||!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<0||typeof body.operationId!=='string'||!idPattern.test(body.operationId)||
  !(body.score===null||(Number.isInteger(body.score)&&body.score>=0&&body.score<=10))||(body.answer!=='yes'&&body.score!==null))return json({ok:false,error:'invalid_response'},400,origin);
 if(row.last_operation_id===body.operationId){
  if(row.answer!==body.answer||row.score!==body.score)return json({ok:false,error:'operation_reused'},409,origin);
  return json(state(row),200,origin);
 }
 if(row.closed_at)return json({...state(row),ok:false,error:'poll_closed'},403,origin);
 const result=await env.DB.prepare(`UPDATE private_poll_invitations SET answer=?,score=?,version=version+1,last_operation_id=?,updated_at=?
  WHERE id=? AND version=? AND NOT EXISTS(SELECT 1 FROM private_polls WHERE id=? AND closed_at IS NOT NULL)`)
  .bind(body.answer,body.score,body.operationId,new Date().toISOString(),row.id,body.expectedVersion,row.poll_id).run();
 const current=await invitation(env,row.poll_id,hash);
 // Concurrent retry of the same request is also idempotent.
 if(!result.meta.changes&&!(current.last_operation_id===body.operationId&&current.answer===body.answer&&current.score===body.score))return json({...state(current),ok:false,error:'version_conflict'},409,origin);
 return json(state(current),200,origin);
}
export async function routePrivatePollAdmin({request,env,url,origin,auth}){
 if(!auth?.uid||!await requireAdmin(env,auth))return json({ok:false,error:'admin_forbidden'},403,origin);
 const match=url.pathname.match(/^\/api\/admin\/private-polls(?:\/([a-zA-Z0-9_-]{1,80})\/(invitations|results))?$/);
 if(!match)return json({ok:false,error:'not_found'},404,origin);
 if(match[2]==='results'&&request.method==='GET'){
  const poll=await env.DB.prepare('SELECT id,title,closed_at FROM private_polls WHERE id=?').bind(match[1]).first();
  if(!poll)return json({ok:false,error:'not_found'},404,origin);
  const rows=await env.DB.prepare('SELECT id,recipient_email recipient,recipient_name name,answer,score,version,updated_at updatedAt FROM private_poll_invitations WHERE poll_id=? ORDER BY recipient_email').bind(match[1]).all();
  return json({ok:true,poll,results:rows.results},200,origin);
 }
 if(request.method!=='POST'||match[2]==='results')return json({ok:false,error:'method_not_allowed'},405,origin);
 const body=await bodyJson(request);
 if(!body||typeof body.id!=='string'||!idPattern.test(body.id))return json({ok:false,error:'invalid_poll'},400,origin);
 if(!match[1]){
  if(typeof body.title!=='string'||!body.title.trim()||body.title.length>160)return json({ok:false,error:'invalid_poll'},400,origin);
  await env.DB.prepare('INSERT INTO private_polls(id,title,created_by) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING').bind(body.id,body.title.trim(),auth.uid).run();
  const poll=await env.DB.prepare('SELECT id,title FROM private_polls WHERE id=?').bind(body.id).first();
  return json({ok:poll.title===body.title.trim(),poll},poll.title===body.title.trim()?200:409,origin);
 }
 const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof body.name!=='string'||body.name.length>160||!tokenPattern.test(body.token||''))return json({ok:false,error:'invalid_invitation'},400,origin);
 const poll=await env.DB.prepare('SELECT id,closed_at FROM private_polls WHERE id=?').bind(match[1]).first();
 if(!poll||poll.closed_at)return json({ok:false,error:'poll_not_open'},409,origin);
 const hash=await hashPollToken(body.token);
 // Explicit conflict handling: never replace another recipient or rotate an existing link silently.
 await env.DB.prepare('INSERT INTO private_poll_invitations(id,poll_id,recipient_email,recipient_name,token_hash) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING').bind(body.id,match[1],email,body.name,hash).run();
 const row=await env.DB.prepare('SELECT id,poll_id,recipient_email,recipient_name,token_hash FROM private_poll_invitations WHERE id=?').bind(body.id).first();
 if(!row||row.poll_id!==match[1]||row.recipient_email!==email||row.recipient_name!==body.name||row.token_hash!==hash)return json({ok:false,error:'invitation_conflict'},409,origin);
 return json({ok:true,id:row.id},200,origin);
}
