// Local artifacts only. No transport, account, provider or production write.
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {TRANSACTIONAL_TYPES,renderTransactionalEmail} from '../worker/domains/mailing/transactional-template.js';
import {transactionalExample,transactionalTestExample} from '../worker/domains/mailing/transactional-routes.js';
const root=resolve(process.argv[2]||'test-results/transactional-previews');mkdirSync(root,{recursive:true});
const index=[];
for(const [kind,[area,title]] of Object.entries(TRANSACTIONAL_TYPES)){
 const sample=transactionalExample(kind);
 if(kind==='reservation_rejected')sample.comment='Požadované ubytování již nemá kapacitu. Zvol prosím jiný dostupný typ.';
 const rendered=renderTransactionalEmail(kind,sample);
 writeFileSync(resolve(root,kind+'.html'),rendered.html);writeFileSync(resolve(root,kind+'.txt'),rendered.text+'\n');index.push({kind,area,title,subject:rendered.subject});
}
writeFileSync(resolve(root,'index.json'),JSON.stringify(index,null,2)+'\n');console.log(`${index.length} HTML/text previews: ${root}`);
const restricted=resolve(root,'restricted-test');mkdirSync(restricted,{recursive:true});
const candidates=['reservation_payment','merch_confirmation','reservation_rejected','arrival_invitation'];
for(const kind of candidates){
 const rendered=renderTransactionalEmail(kind,transactionalTestExample(kind));
 writeFileSync(resolve(restricted,kind+'.html'),rendered.html);writeFileSync(resolve(restricted,kind+'.txt'),rendered.text+'\n');
}
writeFileSync(resolve(restricted,'approval-required.json'),JSON.stringify({approved:false,recipients:null,messageCount:null,candidates},null,2)+'\n');
