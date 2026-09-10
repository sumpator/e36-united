import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Execute the unchanged manager with controlled IO/DOM ownership, not a duplicate implementation.
const source=readFileSync(new URL('../admin/member-cards.js',import.meta.url),'utf8').replace(/^import .*;\r?$/gm,'').replace(/export /g,'');
function harness({holdDecode=false}={}){
 const requests=[],revokes=[],images=[];let observer,created=0;
 const state={currentUser:{uid:'a'},sessionGeneration:1,denied:false};
 const api=(path,{signal})=>new Promise(resolve=>requests.push({path,signal,resolve}));
 class Observer{constructor(cb){this.cb=cb;observer=this}observe(){}unobserve(){}disconnect(){this.disconnected=true}}
 const urls={createObjectURL:()=>`blob:${++created}`,revokeObjectURL:url=>{assert.equal(images.some(i=>i.isConnected&&i.src===url),false);revokes.push(url)}};
 const decoders=[];class Image{decode(){return holdDecode?new Promise(resolve=>decoders.push(resolve)):Promise.resolve()}removeAttribute(){this.src=''}}
 const manager=new Function('apiRequest','adminState','IntersectionObserver','URL','Image',source+';return createCardMedia();')(api,state,Observer,urls,Image);
 const img=()=>{const i={dataset:{cardMedia:'/private/photo',cardVersion:'1'},isConnected:true,src:'',remove(){this.isConnected=false},removeAttribute(name){if(name==='src')this.src=''}};images.push(i);return i};
 const root=list=>({querySelectorAll:()=>list});
 return {manager,requests,revokes,img,root,state,decoders,get created(){return created},visible:list=>observer.cb(list.map(target=>({target,isIntersecting:true}))),get observer(){return observer}};
}
// One event-loop turn drains the promise chain; no elapsed-time assumption.
const settled=()=>new Promise(setImmediate);
test('card photo is lazy/coalesced, consumers detach before exactly-once revoke and return reloads',async()=>{
 const h=harness(),a=h.img(),b=h.img();h.manager.hydrate(h.root([a,b]));assert.equal(h.requests.length,0);
 h.visible([a,b]);assert.equal(h.requests.length,1);h.requests[0].resolve(new Blob(['photo']));await settled();
 assert.equal(a.src,'blob:1');assert.equal(b.src,a.src);
 h.manager.clear();h.manager.clear();assert.equal(h.observer.disconnected,true);assert.equal(h.requests[0].signal.aborted,true);assert.deepEqual(h.revokes,['blob:1']);
 const c=h.img();h.manager.hydrate(h.root([c]));h.visible([c]);h.requests[1].resolve(new Blob(['photo']));await settled();assert.equal(c.src,'blob:2');h.manager.clear();assert.deepEqual(h.revokes,['blob:1','blob:2']);
});
test('card photo late response cannot assign after close, actor change or denied state',async()=>{
 for(const change of ['close','actor','denied']){
  const h=harness(),img=h.img();h.manager.hydrate(h.root([img]));h.visible([img]);
  if(change==='close')h.manager.clear();else if(change==='actor')h.state.currentUser={uid:'b'};else h.state.denied=true;
  h.requests[0].resolve(new Blob(['late']));await settled();assert.equal(img.src,'');assert.equal(h.created,0);h.manager.clear();assert.deepEqual(h.revokes,[]);
 }
});
test('rapid close during off-DOM decode defers exactly one revoke and never exposes the retired URL',async()=>{
 const h=harness({holdDecode:true}),img=h.img();h.manager.hydrate(h.root([img]));h.visible([img]);h.requests[0].resolve(new Blob(['photo']));await settled();assert.equal(h.decoders.length,1);assert.equal(img.src,'');
 h.manager.clear();h.manager.clear();assert.deepEqual(h.revokes,[]);h.decoders[0]();await settled();assert.deepEqual(h.revokes,['blob:1']);assert.equal(img.src,'');h.manager.clear();assert.deepEqual(h.revokes,['blob:1']);
});
