import { MailingDeliveryError } from '../delivery-errors.js';

export const SMTP2GO_DOMAIN = 'e36united.cz';
export const SMTP2GO_TRACKING_DOMAIN = 'link.e36united.cz';
export const SMTP2GO_REQUEST_BUDGET = 8;
const DEFAULT_BASE = 'https://eu-api.smtp2go.com/v3';
const MAX_REQUEST_BYTES = 20_000_000;

export function senderConfig(env = {}) {
  const name = String(env.MAILING_SENDER_NAME || 'E36 United').trim();
  const email = String(env.MAILING_SENDER_EMAIL || 'info@e36united.cz').trim().toLowerCase();
  const replyTo = String(env.MAILING_REPLY_TO || 'info@e36united.cz').trim().toLowerCase();
  return { name, email, replyTo, sender: `${name} <${email}>` };
}

export function normalizeProviderError(status) {
  const code = status === 401 || status === 403 ? 'provider_invalid_key' : status === 429 ? 'provider_rate_limit'
    : status >= 400 && status < 500 ? 'provider_rejected' : 'provider_unavailable';
  const error = new MailingDeliveryError(code, 502);
  error.definiteRejection = status >= 400 && status < 500;
  return error;
}

export function createSmtp2goAdapter(env, { fetchImpl = fetch, timeoutMs = 18000 } = {}) {
  let requests = 0;
  const base = String(env.SMTP2GO_API_BASE || DEFAULT_BASE).replace(/\/+$/, '');
  async function request(path, body = {}) {
    if (!env.SMTP2GO_API_KEY) throw new MailingDeliveryError('provider_not_configured', 503);
    if (requests >= SMTP2GO_REQUEST_BUDGET) throw new MailingDeliveryError('provider_request_budget', 503);
    const encodedBody=JSON.stringify(body);
    if(new TextEncoder().encode(encodedBody).byteLength>MAX_REQUEST_BYTES){const error=new MailingDeliveryError('provider_rejected',502);error.definiteRejection=true;throw error}
    requests++;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${base}${path}`, { method:'POST', redirect:'manual', signal:controller.signal,
        headers:{ 'X-Smtp2go-Api-Key':env.SMTP2GO_API_KEY, Accept:'application/json', 'Content-Type':'application/json' },
        body:encodedBody });
      if (!response.ok) { await response.body?.cancel(); throw normalizeProviderError(response.status); }
      const reader=response.body?.getReader();let size=0;const chunks=[];
      if(reader)try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;
        if(size>1024*1024){await reader.cancel();throw new MailingDeliveryError('provider_malformed',502)}chunks.push(value)}}finally{reader.releaseLock()}
      if(!size)throw new MailingDeliveryError('provider_malformed',502);
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
      let result;try{result=JSON.parse(new TextDecoder().decode(bytes))}catch{throw new MailingDeliveryError('provider_malformed',502)}
      if(result?.data?.error){const error=new MailingDeliveryError('provider_rejected',502);error.definiteRejection=true;throw error}
      return result;
    } catch(error) {
      if(error instanceof MailingDeliveryError)throw error;
      throw new MailingDeliveryError(controller.signal.aborted?'provider_timeout':'provider_unavailable',502);
    } finally { clearTimeout(timer); }
  }
  async function checkDomain(){
    const result=await request('/domain/view',{domain:SMTP2GO_DOMAIN}),domains=result?.data?.domains;
    if(!Array.isArray(domains))throw new MailingDeliveryError('provider_malformed',502);
    const entry=domains.find(item=>item?.domain?.fulldomain===SMTP2GO_DOMAIN);
    if(!entry)return {exists:false,verified:false,trackingVerified:false};
    const verified=entry.domain.dkim_verified===true&&entry.domain.rpath_verified===true;
    const tracker=Array.isArray(entry.trackers)&&entry.trackers.find(item=>item?.fulldomain===SMTP2GO_TRACKING_DOMAIN);
    return {exists:true,verified,trackingVerified:tracker?.cname_verified===true&&tracker?.enabled===true};
  }
  async function checkQuota(){
    const result=await request('/stats/email_cycle'),data=result?.data;
    if(!data||![data.cycle_used,data.cycle_remaining,data.cycle_max].every(Number.isSafeInteger))throw new MailingDeliveryError('provider_malformed',502);
    return {monthlyUsed:data.cycle_used,monthlyRemaining:data.cycle_remaining,monthlyAllowance:data.cycle_max,
      cycleStart:typeof data.cycle_start==='string'?data.cycle_start:null,cycleEnd:typeof data.cycle_end==='string'?data.cycle_end:null};
  }
  async function checkReadiness(){
    const sender=senderConfig(env),baseState={provider:'smtp2go',sender,domain:SMTP2GO_DOMAIN,trackingDomain:SMTP2GO_TRACKING_DOMAIN};
    if(!env.SMTP2GO_API_KEY)return {...baseState,state:'not_configured',ready:false,apiConnected:false};
    try{
      const domain=await checkDomain();
      if(!domain.exists)return {...baseState,...domain,state:'domain_missing',ready:false,apiConnected:true};
      if(!domain.verified)return {...baseState,...domain,state:'domain_unverified',ready:false,apiConnected:true};
      const quota=await checkQuota();
      return {...baseState,...domain,...quota,state:'ready',ready:true,apiConnected:true};
    }catch(error){return {...baseState,state:'api_error',ready:false,apiConnected:false,error:error.code||'provider_unavailable'} }
  }
  async function sendBatch(emails){
    if(!Array.isArray(emails)||emails.length<1||emails.length>1000)throw new MailingDeliveryError('invalid_batch',400);
    const result=await request('/email/batch',{emails}),items=result?.data;
    if(!Array.isArray(items)||items.length!==emails.length)throw new MailingDeliveryError('provider_batch_ambiguous',502);
    if(typeof result.request_id!=='string'||!result.request_id||result.request_id.length>200)throw new MailingDeliveryError('provider_batch_ambiguous',502);
    const emailIds=items.map(item=>typeof item?.email_id==='string'&&item.email_id.length<=200?item.email_id:null);
    if(emailIds.some(id=>!id)||new Set(emailIds).size!==emailIds.length)throw new MailingDeliveryError('provider_batch_ambiguous',502);
    return {requestId:result.request_id,emailIds};
  }
  return { checkReadiness,checkDomain,checkQuota,sendBatch,sendTest:sendBatch,
    viewWebhooks:()=>request('/webhook/view'),addWebhook:body=>request('/webhook/add',body),editWebhook:body=>request('/webhook/edit',body) };
}
