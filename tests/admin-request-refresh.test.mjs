import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminApiClient} from '../admin/request-client.js';
import {createAdminRefresh} from '../admin/refresh.js';
const json=(body={},status=200)=>new Response(JSON.stringify(body),{status});
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve}};
const user={uid:'a',getIdToken:async()=> 'token-a'};

test('Admin 401 refresh is bounded and never retries a request under a changed actor',async()=>{
  let context={user,generation:1,eventId:'e'},calls=0;
  const held=deferred();
  const api=createAdminApiClient({baseUrl:'https://example.invalid',getContext:()=>context,fetchRequest:async()=>{calls++;return held.promise}});
  const response=api.request('/test');await Promise.resolve();
  context={user:{uid:'b',getIdToken:async()=> 'token-b'},generation:2,eventId:'e'};held.resolve(json({},401));
  await assert.rejects(response,error=>error.stale===true);assert.equal(calls,1);
  calls=0;context={user,generation:3,eventId:'e'};
  const retry=createAdminApiClient({baseUrl:'https://example.invalid',getContext:()=>context,fetchRequest:async()=>{calls++;return json({},401)}});
  await assert.rejects(retry.request('/test'),error=>error.status===401);assert.equal(calls,2);
});

test('Admin token, response and body stalls all settle with finite deadlines',async()=>{
  for(const phase of ['token','fetch','body']){
    const api=createAdminApiClient({baseUrl:'https://example.invalid',timeoutMs:5,retryDelayMs:0,
      getContext:()=>({user:phase==='token'?{uid:'a',getIdToken:()=>new Promise(()=>{})}:user,generation:1,eventId:'e'}),
      fetchRequest:phase==='fetch'?()=>new Promise(()=>{}):async()=>({ok:true,status:200,text:()=>new Promise(()=>{})})});
    // Stable object identity matters; the token case below uses one captured object.
    if(phase==='token')continue;
    await assert.rejects(api.request('/test',{method:'PATCH'}),/Spojení/);
  }
  const stalled={uid:'a',getIdToken:()=>new Promise(()=>{})};
  const api=createAdminApiClient({baseUrl:'https://example.invalid',timeoutMs:5,getContext:()=>({user:stalled,generation:1,eventId:'e'})});
  await assert.rejects(api.request('/test',{method:'PATCH'}),/Spojení/);
});

test('Admin mutation is not retried for network loss; GET retries once and cancellation rejects late data',async()=>{
  for(const method of ['GET','PATCH']){
    let calls=0;const api=createAdminApiClient({baseUrl:'https://example.invalid',retryDelayMs:0,getContext:()=>({user,generation:1,eventId:'e'}),fetchRequest:async()=>{calls++;throw new TypeError('network')}});
    await assert.rejects(api.request('/test',{method}));assert.equal(calls,method==='GET'?2:1);
  }
  const hold=deferred(),controller=new AbortController();
  const api=createAdminApiClient({baseUrl:'https://example.invalid',getContext:()=>({user,generation:1,eventId:'e'}),fetchRequest:()=>hold.promise});
  const response=api.request('/test',{signal:controller.signal});controller.abort();
  await assert.rejects(response,error=>error.stale);hold.resolve(json({old:true}));
});

test('old event response is ignored even if transport ignores abort',async()=>{
  let context={user,generation:1,eventId:'old'};const hold=deferred();
  const api=createAdminApiClient({baseUrl:'https://example.invalid',getContext:()=>context,fetchRequest:()=>hold.promise});
  const response=api.request('/test');await Promise.resolve();context={...context,eventId:'new'};hold.resolve(json({event:'old'}));
  await assert.rejects(response,error=>error.stale);
});

test('one visible refresh coordinator polls at 60 seconds, coalesces triggers, and leaves hidden tabs idle',async()=>{
  let context={key:'a:e',authenticated:true,denied:false,visible:true};const timers=new Map();let serial=0,calls=0;
  const refresh=createAdminRefresh({readContext:()=>context,refresh:async()=>{calls++},setTimer:(fn,ms)=>{timers.set(++serial,{fn,ms});return serial},clearTimer:id=>timers.delete(id)});
  await refresh.trigger('startup');assert.equal(calls,1);assert.equal(timers.size,1);assert.equal([...timers.values()][0].ms,60_000);
  const next=[...timers.values()][0];timers.clear();await next.fn();await Promise.resolve();assert.equal(calls,2);
  context={...context,visible:false};refresh.suspend();assert.equal(timers.size,0);await refresh.trigger('focus');assert.equal(calls,2);
  context={...context,visible:true};await refresh.trigger('pageshow');assert.equal(calls,3);refresh.dispose();assert.equal(timers.size,0);
});

test('invalidating an in-flight refresh prevents pre-mutation/old context apply; domain failures remain stale',async()=>{
  let context={key:'a:e',authenticated:true,denied:false,visible:true};const hold=deferred(),states=[];let applies=0;
  const coordinator=createAdminRefresh({readContext:()=>context,setTimer:()=>1,clearTimer:()=>{},onState:state=>states.push(state.state),refresh:async({isCurrent})=>{await hold.promise;if(isCurrent())applies++;return{failed:['gallery']}}});
  const old=coordinator.trigger('poll');context={...context,key:'a:new'};coordinator.invalidate();hold.resolve();await old;assert.equal(applies,0);
  await coordinator.trigger('focus');assert.equal(applies,1);assert.equal(states.at(-1),'unavailable');
  context={...context,denied:true};coordinator.suspend();await coordinator.trigger('online');assert.equal(applies,1);assert.equal(states.at(-1),'denied');
});

test('a token resolving after a mutation deadline cannot send a late write',async()=>{
 let release,sends=0;const token=new Promise(resolve=>{release=resolve}),user={getIdToken:()=>token};
 const client=createAdminApiClient({baseUrl:'https://local.invalid',getContext:()=>({user,generation:1,eventId:'e'}),timeoutMs:10,fetchRequest:async()=>{sends++;return new Response('{}')}});
 await assert.rejects(client.request('/save',{method:'PATCH',body:{value:1}}),/Spojení/);
 release('late');await new Promise(resolve=>setTimeout(resolve,20));assert.equal(sends,0);
});

test('simultaneous GETs for one identity/resource share one request, but mutations never coalesce',async()=>{
 const hold=deferred();let calls=0;
 const api=createAdminApiClient({baseUrl:'https://local.invalid',getContext:()=>({user,generation:1,eventId:'e'}),fetchRequest:()=>{calls++;return hold.promise}});
 const a=api.request('/same'),b=api.request('/same');await Promise.resolve();assert.equal(calls,1);hold.resolve(json({value:1}));assert.deepEqual(await a,await b);
});
test('invalid successful JSON is unavailable, never an empty successful projection',async()=>{
 const api=createAdminApiClient({baseUrl:'https://local.invalid',getContext:()=>({user,generation:1,eventId:'e'}),fetchRequest:async()=>new Response('<html>error</html>')});
 await assert.rejects(api.request('/summary'),/Neplatná odpověď/);
});
test('known offline is idle; lifecycle storms coalesce and failures back off to a bounded five minutes',async()=>{
 let online=true,calls=0,release;const timers=new Map();let id=0;const hold=new Promise(resolve=>release=resolve);
 const c=createAdminRefresh({readContext:()=>({key:'a:e',authenticated:true,visible:true,online}),refresh:async()=>{calls++;if(calls===1)await hold;return{failed:['summary']}},setTimer:(fn,ms)=>{timers.set(++id,{fn,ms});return id},clearTimer:key=>timers.delete(key)});
 const first=c.trigger('focus'),onlineTrigger=c.trigger('online'),pageshow=c.trigger('pageshow');release();
 await Promise.all([first,onlineTrigger,pageshow]);assert.equal(calls,1);assert.equal([...timers.values()][0].ms,120000);
 online=false;c.suspend();await c.trigger('poll');assert.equal(calls,1);assert.equal(timers.size,0);
 online=true;await c.trigger('online');assert.equal([...timers.values()][0].ms,240000);await c.trigger('manual');assert.equal([...timers.values()][0].ms,300000);c.dispose();
});
test('resource timestamps prevent lifecycle events from broadly reloading fresh analytical data',async()=>{
 const {resourceDue,ADMIN_REFRESH}=await import('../admin/refresh-policy.js');const fresh={state:'fresh',context:'a',lastSuccess:1000};
 for(const reason of ['focus','online','pageshow','visible','context'])assert.equal(resourceDue(fresh,'a',ADMIN_REFRESH.analyticsMs,reason,2000),false);
 assert.equal(resourceDue(fresh,'a',ADMIN_REFRESH.analyticsMs,'poll',301000),true);assert.equal(resourceDue(fresh,'b',ADMIN_REFRESH.analyticsMs,'context',2000),true);assert.equal(resourceDue(fresh,'a',ADMIN_REFRESH.analyticsMs,'mutation',2000),true);
});

for(const boundary of ['hidden','offline'])test(`online refresh suspended by ${boundary} cannot dispatch a held token, queued refresh or stale timer`,async()=>{
 const token=deferred(),started=deferred(),timers=new Map();let serial=0,holdToken=false,refreshes=0;
 const context={key:'a:e',authenticated:true,denied:false,visible:true,online:true};
 const actor={uid:'a',getIdToken:()=>{if(holdToken){started.resolve();return token.promise}return Promise.resolve('test-token')}};
 const dispatches=[],signals=[];
 const api=createAdminApiClient({baseUrl:'https://example.invalid',getContext:()=>({user:actor,generation:1,eventId:'e'}),
  fetchRequest:async()=>{dispatches.push({visible:context.visible,online:context.online});return json()}});
 const coordinator=createAdminRefresh({readContext:()=>context,
  setTimer:(fn,ms)=>{timers.set(++serial,{fn,ms});return serial},clearTimer:id=>timers.delete(id),
  refresh:async({signal})=>{refreshes++;signals.push(signal);await Promise.allSettled([api.request('/summary',{signal}),api.request('/member',{signal})])}});
 try{
  await coordinator.trigger('startup');assert.equal(dispatches.length,2);
  const staleTimer=[...timers.values()][0];assert.equal(staleTimer.ms,60_000);
  context.online=false;coordinator.suspend();holdToken=true;context.online=true;
  const resumed=coordinator.trigger('online');await started.promise;
  const queued=coordinator.trigger('context'); // Queued behind the held online flight.
  context[boundary==='hidden'?'visible':'online']=false;coordinator.suspend();
  assert.equal(signals.at(-1).aborted,true);
  staleTimer.fn(); // Simulate a callback already dequeued before clearTimeout.
  token.resolve('test-token');await Promise.all([resumed,queued]);
  assert.deepEqual(dispatches,[{visible:true,online:true},{visible:true,online:true}]);
  assert.equal(refreshes,2);assert.equal(timers.size,0);assert.equal(coordinator.getState().inFlight,false);
 }finally{coordinator.dispose();token.resolve('test-token')}
});
