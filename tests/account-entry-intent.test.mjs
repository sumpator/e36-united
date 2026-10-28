import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAccountIntent,accountAuthMode,ACCOUNT_USED_KEY,rememberAccountUse,hasUsedAccount} from '../member/deep-links.js';
const resolve=search=>resolveAccountIntent('https://www.e36united.cz/member.html'+search);
test('account intent distinguishes generic menus, handoffs, sections and private member details',()=>{
 for(const query of ['', '?mode=register&returnTo=%2F', '?mode=login&returnTo=%2Findex.html%23experience','?intent=account&returnTo=%2Fgalerie.html%23upload'])assert.deepEqual(resolve(query),{kind:'member',section:'overview'});
 for(const [query,section]of [['?section=garage','garage'],['?panel=history','club'],['?profile=EU-OTHER','club'],['?section=merch&order=order-1','merch'],['?draft=handoff&section=garage&returnTo=%2F','reservation'],['?section=invalid','overview']])assert.equal(resolve(query).section,section);
 assert.deepEqual(resolve('?returnTo='+encodeURIComponent('/member.html?section=merch&order=order-1')),{kind:'member',section:'merch',context:{order:'order-1'}});
 assert.equal(resolve('#arrival-invite=private-token').section,'overview');
 assert.deepEqual(resolve('?draft=handoff&returnTo='+encodeURIComponent('/index.html#planer')),{kind:'member',section:'reservation',returnTo:'/index.html#planer'});
 assert.deepEqual(resolve('?draft=handoff&returnTo='+encodeURIComponent('https://evil.test/#planer')),{kind:'member',section:'reservation'});
});
test('only known public action destinations can be resumed; arbitrary redirects fail closed',()=>{
 for(const path of ['/galerie.html?profile=EU-OTHER#upload','/merch.html?product=shirt'])assert.equal(resolve('?intent=return&returnTo='+encodeURIComponent(path)).destination,'https://www.e36united.cz'+path);
 assert.equal(resolve('?returnTo='+encodeURIComponent('/galerie.html#upload')).kind,'public');
 for(const path of ['https://evil.test/galerie.html','//evil.test/galerie.html','//www.e36united.cz/galerie.html','https://evil.test@www.e36united.cz/galerie.html','/api/me','/admin.html','/index.html','javascript:alert(1)','/\\evil.test/galerie.html','https://www.e36united.cz:444/galerie.html'])assert.deepEqual(resolve('?intent=return&returnTo='+encodeURIComponent(path)),{kind:'member',section:'overview'},path);
});
test('the account hint contains no identity and explicit form selection always wins',()=>{
 const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 assert.equal(accountAuthMode('',storage),'register');assert.equal(rememberAccountUse(storage),true);assert.deepEqual([...values],[[ACCOUNT_USED_KEY,'1']]);assert.equal(hasUsedAccount(storage),true);assert.equal(accountAuthMode('',storage),'login');assert.equal(accountAuthMode('?mode=register',storage),'register');assert.equal(accountAuthMode('?mode=login',storage),'login');values.clear();assert.equal(accountAuthMode('?mode=login',storage),'login');
 const denied={getItem(){throw Error('denied')},setItem(){throw Error('denied')}};assert.equal(hasUsedAccount(denied),false);assert.equal(rememberAccountUse(denied),false);assert.equal(accountAuthMode('',denied),'register');
});
