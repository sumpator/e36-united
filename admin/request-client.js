const stale = () => Object.assign(new Error('Požadavek již nepatří aktuální relaci.'), { name: 'AbortError', stale: true });

export function createAdminApiClient({baseUrl,getContext,fetchRequest=fetch,timeoutMs=20_000,retryDelayMs=250,onDenied=()=>{}}){
  const reads=new Map();
  async function performRequest(path,{method='GET',body,headers={},signal,consume='json',retry=true}={}){
    const captured=getContext();
    if(!captured.user)throw Object.assign(new Error('Přihlášení vypršelo.'),{status:401});
    const current=()=>{const next=getContext();return next.user===captured.user&&next.generation===captured.generation&&next.eventId===captured.eventId&&!signal?.aborted};
    const check=()=>{if(!current())throw stale()};
    let force=false,transientAttempts=0;
    for(;;){
      check();const controller=new AbortController();let timer,rejectAbort;
      const aborted=new Promise((_,reject)=>{rejectAbort=reject});
      const abort=()=>{controller.abort();rejectAbort(stale())};signal?.addEventListener('abort',abort,{once:true});
      try{
        const result=await Promise.race([
          (async()=>{
            const attemptCheck=()=>{check();if(controller.signal.aborted)throw stale()};
            const token=await captured.user.getIdToken(force);attemptCheck();
            const form=typeof FormData!=='undefined'&&body instanceof FormData;
            const response=await fetchRequest(`${baseUrl}${path}`,{method,cache:'no-store',signal:controller.signal,
              headers:{Authorization:`Bearer ${token}`,...(body!==undefined&&!form?{'Content-Type':'application/json'}:{}),...headers},
              body:body===undefined?undefined:form?body:JSON.stringify(body)});
            attemptCheck();
            if(response.status===401&&retry&&!force){await response.body?.cancel();return{refreshToken:true}}
            let payload;
            if(consume==='blob'&&response.ok)payload=await response.blob();
            else{const text=await response.text();try{payload=text?JSON.parse(text):{}}catch{throw new Error('Neplatná odpověď serveru. Obnov data; výsledek případného uložení ověř.')}}
            check();
            if(!response.ok){const error=Object.assign(new Error(payload.message||payload.error||`API ${response.status}`),{status:response.status,payload});
              const after=response.headers.get('Retry-After');error.retryAfterMs=after?Math.max(0,Math.min(30_000,Number.isFinite(Number(after))?Number(after)*1000:Date.parse(after)-Date.now())):retryDelayMs;throw error;}
            return{payload};
          })(),
          new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Object.assign(new Error('Spojení se serverem se nepodařilo dokončit.'),{network:true}))},timeoutMs)}),aborted,
        ]);
        check();if(result.refreshToken){force=true;continue}return result.payload;
      }catch(error){
        check();if(error.stale)throw error;
        if([401,403].includes(error.status)){onDenied(error);throw error}
        const transient=error.network||error instanceof TypeError||[429,502,503,504].includes(error.status);
        if(method==='GET'&&transient&&transientAttempts++===0){await new Promise(resolve=>setTimeout(resolve,error.retryAfterMs??retryDelayMs));check();continue}
        throw error;
      }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
    }
  }
  function request(path,options={}){
    if(options.method&&options.method!=='GET')return performRequest(path,options);
    const context=getContext(),key=JSON.stringify([context.generation,context.user?.uid,context.eventId,path,options.consume||'json',options.headers||{}]);
    const existing=reads.get(key);
    if(existing&&!existing.signal?.aborted)return existing.promise;
    const entry={signal:options.signal,promise:null};
    entry.promise=performRequest(path,options).finally(()=>{if(reads.get(key)===entry)reads.delete(key)});
    reads.set(key,entry);return entry.promise;
  }
  return{request};
}
