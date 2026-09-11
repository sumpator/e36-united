import { ADMIN_REFRESH } from './refresh-policy.js?v=20260911-request-confirm-r2';
// One timer, one active context, one in-flight refresh. Dependencies are injected for race tests.
export function createAdminRefresh({readContext,refresh,onState=()=>{},intervalMs=ADMIN_REFRESH.operationalMs,
  setTimer=setTimeout,clearTimer=clearTimeout,now=Date.now}){
  let timer=null,flight=null,generation=0,queued=false,failures=0,lastSuccess=null,disposed=false;
  const eligible=()=>{const c=readContext();return !disposed&&c.authenticated&&!c.denied&&c.visible&&c.online!==false};
  const cancelTimer=()=>{if(timer!==null)clearTimer(timer);timer=null};
  const schedule=()=>{cancelTimer();if(eligible())timer=setTimer(()=>{timer=null;void trigger('poll')},Math.min(ADMIN_REFRESH.maxBackoffMs,intervalMs*2**Math.min(failures,3)))};
  const publish=(state,extra={})=>onState({state,lastSuccess,...extra});
  async function trigger(reason='manual'){
    if(!eligible()){cancelTimer();return}
    if(flight){queued=queued||['mutation','context','startup','navigation','detail'].includes(reason);return flight.promise}
    cancelTimer();const controller=new AbortController(),captured=readContext(),myGeneration=generation;
    const isCurrent=()=>eligible()&&generation===myGeneration&&readContext().key===captured.key&&!controller.signal.aborted;
    publish('loading');
    const task={controller,promise:null};flight=task;
    task.promise=(async()=>{
      try{
        const result=await refresh({context:captured,signal:controller.signal,isCurrent,reason});
        if(!isCurrent())return;
        if(result?.failed){failures++;publish(lastSuccess?'stale':'unavailable',{domains:result.failed})}
        else{failures=0;lastSuccess=now();publish('fresh')}
      }catch(error){if(isCurrent()){failures++;publish(lastSuccess?'stale':'unavailable')}}
      finally{
        if(flight!==task)return;flight=null;
        if(queued&&eligible()){queued=false;void trigger('coalesced')}else schedule();
      }
    })();return task.promise;
  }
  function invalidate(){generation++;queued=false;cancelTimer();flight?.controller.abort();flight=null}
  function suspend(){invalidate();publish(readContext().denied?'denied':lastSuccess?'stale':'not_requested')}
  return{trigger,invalidate,suspend,dispose(){disposed=true;suspend()},getState:()=>({inFlight:!!flight,timer:timer!==null,generation,failures,lastSuccess})};
}
