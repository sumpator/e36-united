import test from 'node:test';
import assert from 'node:assert/strict';
import {initPublicMemberState,renderAccountLinks} from '../public-member-state.js';
import {ACCOUNT_USED_KEY} from '../member/deep-links.js';

function linksRoot(){
 const span={textContent:'Účet',className:'nav-member-label'};
 const links=[span,null,span,null].map(label=>({href:'member.html',textContent:'Účet',label,attributes:new Set(),querySelector:()=>label,toggleAttribute(name,present){if(present)this.attributes.add(name);else this.attributes.delete(name)}}));
 return {links,querySelectorAll:()=>links};
}
function storageFixture(initial){const values=new Map(initial?[[ACCOUNT_USED_KEY,'1']]:[]);return {values,getItem:key=>values.get(key)??null};}
function storageEvent(target,key,storage){const event=new Event('storage');Object.defineProperties(event,{key:{value:key},storageArea:{value:storage}});target.dispatchEvent(event);}

test('all account menu clones reflect the resolved state and use the account intent without a public return',()=>{
 const root=linksRoot();
 for(const [state,label,mode,busy] of [
  [{status:'loading',knownAccount:true},'Účet',null,true],
  [{status:'anonymous',knownAccount:false},'Registrovat se','register',false],
  [{status:'anonymous',knownAccount:true},'Přihlásit se','login',false],
  [{status:'authenticated',authenticated:true,knownAccount:true},'Můj United účet',null,false],
  [{status:'error',authenticated:true,knownAccount:false},'Můj United účet',null,false],
  [{status:'error',authenticated:false,knownAccount:true},'Účet',null,false],
 ]){
  renderAccountLinks(state,root);
  for(const link of root.links){assert.equal((link.label||link).textContent,label);const url=new URL(link.href,'https://www.e36united.cz/');assert.equal(url.pathname,'/member.html');assert.equal(url.searchParams.get('intent'),'account');assert.equal(url.searchParams.get('mode'),mode);assert.equal(url.searchParams.has('returnTo'),false);assert.equal(link.attributes.has('aria-busy'),busy);if(link.label)assert.equal(link.label.className,'nav-member-label');}
 }
});

test('a marker storage event refreshes cached public navigation without treating the marker as a session',()=>{
 const storage=storageFixture(),eventTarget=new EventTarget(),states=[];let notify,fetches=0,stops=0;
 const controller=initPublicMemberState({config:{},apiBaseUrl:'https://local.test',storage,eventTarget,onStateChange:state=>states.push(state),authFactory:options=>{notify=options.onStateChange;return {stop(){stops++}}},fetchImpl:async()=>{fetches++;throw new Error('Anonymous storage update must not request an API')}});
 notify({status:'anonymous'});assert.equal(states.at(-1).knownAccount,false);
 const before=states.length;storage.values.set(ACCOUNT_USED_KEY,'1');storageEvent(eventTarget,'unrelated-key',storage);assert.equal(states.length,before);
 storageEvent(eventTarget,ACCOUNT_USED_KEY,storage);assert.equal(states.at(-1).knownAccount,true);assert.equal(states.at(-1).status,'anonymous');assert.equal(states.at(-1).authenticated,false);assert.equal(fetches,0);
 const root=linksRoot();renderAccountLinks(states.at(-1),root);assert.equal(root.links[1].textContent,'Přihlásit se');
 storage.values.clear();storageEvent(eventTarget,null,storage);assert.equal(states.at(-1).knownAccount,false);renderAccountLinks(states.at(-1),root);assert.equal(root.links[1].textContent,'Registrovat se');
 const finalCount=states.length;controller.stop();controller.stop();storage.values.set(ACCOUNT_USED_KEY,'1');storageEvent(eventTarget,ACCOUNT_USED_KEY,storage);notify({status:'authenticated',user:{getIdToken:()=>{throw new Error('Stopped service must not read a token')}}});assert.equal(states.length,finalCount);assert.equal(stops,1);assert.equal(fetches,0);
});

test('marker changes preserve an authenticated navigation summary and never reload it',async()=>{
 const storage=storageFixture(true),eventTarget=new EventTarget(),states=[],ready=Promise.withResolvers();let notify,tokens=0,fetches=0;
 const controller=initPublicMemberState({config:{},apiBaseUrl:'https://local.test',storage,eventTarget,onStateChange:state=>{states.push(state);if(state.status==='authenticated')ready.resolve()},authFactory:options=>{notify=options.onStateChange;return{stop(){}}},fetchImpl:async()=>{fetches++;return new Response(JSON.stringify({hasWaitingPlan:true,hasReservation:true}),{headers:{'Content-Type':'application/json'}})}});
 notify({status:'authenticated',user:{getIdToken:async()=>{tokens++;return 'isolated-test-token'}}});await ready.promise;
 storage.values.clear();storageEvent(eventTarget,ACCOUNT_USED_KEY,storage);
 assert.deepEqual({status:states.at(-1).status,authenticated:states.at(-1).authenticated,hasWaitingPlan:states.at(-1).hasWaitingPlan,hasReservation:states.at(-1).hasReservation,knownAccount:states.at(-1).knownAccount},{status:'authenticated',authenticated:true,hasWaitingPlan:true,hasReservation:true,knownAccount:false});assert.equal(tokens,1);assert.equal(fetches,1);
 notify({status:'anonymous'});assert.equal(storage.getItem(ACCOUNT_USED_KEY),null);controller.stop();
});

test('a marker event during a slow read cannot start another request or revive a logged-out account',async()=>{
 const storage=storageFixture(),eventTarget=new EventTarget(),states=[],started=Promise.withResolvers(),response=Promise.withResolvers(),bodyRead=Promise.withResolvers();let notify,fetches=0;
 const controller=initPublicMemberState({config:{},apiBaseUrl:'https://local.test',storage,eventTarget,onStateChange:state=>states.push(state),authFactory:options=>{notify=options.onStateChange;return{stop(){}}},fetchImpl:async()=>{fetches++;started.resolve();return response.promise}});
 notify({status:'authenticated',user:{getIdToken:async()=>'isolated-test-token'}});await started.promise;
 storage.values.set(ACCOUNT_USED_KEY,'1');storageEvent(eventTarget,ACCOUNT_USED_KEY,storage);assert.equal(states.at(-1).status,'loading');assert.equal(states.at(-1).authenticated,true);assert.equal(states.at(-1).knownAccount,true);assert.equal(fetches,1);
 notify({status:'anonymous'});response.resolve({ok:true,json(){bodyRead.resolve();return {hasReservation:true,hasWaitingPlan:true}}});await bodyRead.promise;await Promise.resolve();await Promise.resolve();
 assert.equal(states.at(-1).status,'anonymous');assert.equal(states.at(-1).authenticated,false);assert.equal(states.at(-1).hasReservation,false);assert.equal(storage.getItem(ACCOUNT_USED_KEY),'1');controller.stop();
});

test('unavailable account-marker storage falls back safely and unrelated storage areas are ignored',()=>{
 const storage={getItem(){throw new DOMException('Denied','SecurityError')}},eventTarget=new EventTarget(),states=[];let notify;
 const controller=initPublicMemberState({config:{},apiBaseUrl:'https://local.test',storage,eventTarget,onStateChange:state=>states.push(state),authFactory:options=>{notify=options.onStateChange;return{stop(){}}},fetchImpl:()=>{throw new Error('No API request expected')}});
 notify({status:'anonymous'});assert.equal(states.at(-1).knownAccount,false);const before=states.length;storageEvent(eventTarget,ACCOUNT_USED_KEY,{});assert.equal(states.length,before);storageEvent(eventTarget,ACCOUNT_USED_KEY,storage);assert.equal(states.at(-1).knownAccount,false);const root=linksRoot();renderAccountLinks(states.at(-1),root);assert.equal(root.links[1].textContent,'Registrovat se');controller.stop();
});
