import {mailingRuntime} from './mailing-runtime.mjs';
import {routePrivatePollAdmin} from '../../worker/domains/private-polls.js';
import worker from '../../worker/index.js';
import {randomBytes} from 'node:crypto';
export const POLL='darts-20261027',ORIGIN='https://e36united.cz';
export async function privatePollRuntime(){
 const r=mailingRuntime(),tokens=[randomBytes(32).toString('base64url'),randomBytes(32).toString('base64url')];
 r.db.exec("INSERT INTO members(id,member_code,email,name,role) VALUES('reader','READER','reader@example.invalid','Reader','member')");
 async function admin(method,path,body,uid='admin'){
  const url=new URL('https://api.e36united.cz'+path),request=new Request(url,{method,headers:{Origin:ORIGIN,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  return routePrivatePollAdmin({request,env:r.env,url,origin:ORIGIN,auth:{uid}});
 }
 await admin('POST','/api/admin/private-polls',{id:POLL,title:'Šipky. Pivo. Stay United.'});
 for(const [i,token] of tokens.entries()){
  const result=await admin('POST','/api/admin/private-polls/'+POLL+'/invitations',{id:'invite-'+i,email:'guest-'+i+'@example.invalid',name:'Synthetic guest '+i,token});if(!result.ok)throw Error('Isolated provisioning failed');
 }
 const waits=[];
 const ctx={waitUntil(p){waits.push(p);throw Error('A private poll must not trigger email delivery')}};
 async function call({method='GET',body,token=tokens[0],path='/api/private-polls/'+POLL+'/response',headers={}}={}){
  const normalized=new Headers({Origin:ORIGIN,Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})});for(const [name,value] of Object.entries(headers))normalized.set(name,value);
  const request=new Request('https://api.e36united.cz'+path,{method,headers:normalized,...(body?{body:JSON.stringify(body)}:{})});
  return worker.fetch(request,r.env,ctx);
 }
 return {...r,tokens,admin,call,waits,row:(i=0)=>r.db.prepare('SELECT * FROM private_poll_invitations WHERE id=?').get('invite-'+i)};
}
