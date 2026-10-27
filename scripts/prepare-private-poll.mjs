// Offline only. Produces private Admin API payloads and personalized email files; never sends.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Usage: node scripts/prepare-private-poll.mjs private-recipients.json .local-evidence/private-poll-bundle');
const destination=resolve(output),privateRoot=resolve('.local-evidence');
if(!relative(privateRoot,destination)||isAbsolute(relative(privateRoot,destination))||relative(privateRoot,destination).startsWith('..'))throw Error('Output must be a new directory inside ignored .local-evidence');
if(existsSync(destination))throw Error('Existing bundle must be preserved, not regenerated');
const definition=JSON.parse(readFileSync(input,'utf8'));
if(typeof definition.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(definition.id)||typeof definition.title!=='string'||!definition.title.trim()||definition.title.length>160||!Array.isArray(definition.recipients)||!definition.recipients.length||definition.recipients.length>100)throw Error('Invalid poll definition');
const seen=new Set();
const template=readFileSync(new URL('../invitations/darts-email.html',import.meta.url),'utf8'),text=readFileSync(new URL('../invitations/darts-email.txt',import.meta.url),'utf8');
const invitations=definition.recipients.map(recipient=>{
 const email=recipient.email?.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||seen.has(email))throw Error('Invalid or duplicate recipient');seen.add(email);
 const token=randomBytes(32).toString('base64url');
 return {id:randomUUID(),email,name:recipient.name||'',token};
});
mkdirSync(destination,{recursive:true});
writeFileSync(resolve(destination,'admin-payloads.json'),JSON.stringify({poll:{id:definition.id,title:definition.title},invitations},null,2),{flag:'wx'});
for(const [index,invite] of invitations.entries()){
 const replacements=Object.fromEntries(['yes','no','maybe'].map(answer=>{
  const url=new URL('https://e36united.cz/invitations/darts.html');url.hash=new URLSearchParams({poll:definition.id,token:invite.token,answer}).toString();return [answer.toUpperCase()+'_URL',url.href];
 }));
 const replace=(source,html)=>source.replace(/\{\{(YES_URL|NO_URL|MAYBE_URL)\}\}/g,(_,key)=>html?replacements[key].replaceAll('&','&amp;'):replacements[key]);
 writeFileSync(resolve(destination,'recipient-'+(index+1)+'.html'),replace(template,true),{flag:'wx'});
 writeFileSync(resolve(destination,'recipient-'+(index+1)+'.txt'),replace(text,false),{flag:'wx'});
}
console.log(JSON.stringify({prepared:invitations.length,output:destination,emailsSent:0,productionWrites:0,warning:'Links become usable only after approved migration, Worker/Pages deployment and authorized Admin provisioning. Keep bundle private.'}));
