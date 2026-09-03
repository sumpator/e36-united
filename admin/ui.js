import qrcode from '../vendor/qrcode-generator.mjs';

export const $=(selector,root=document)=>root.querySelector(selector);
export const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];

const money=new Intl.NumberFormat('cs-CZ',{style:'currency',currency:'CZK',maximumFractionDigits:0});
const dateTime=new Intl.DateTimeFormat('cs-CZ',{dateStyle:'medium',timeStyle:'short'});

export function toast(message){const el=$('[data-toast]');el.textContent=message;el.classList.add('is-visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('is-visible'),3200)}
export function escapeHtml(value=''){return String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
export function numeric(value){return Number(value||0)}
export function formatMoney(value){return money.format(numeric(value))}
export function formatDate(value,withTime=true){if(!value)return '—';const normalized=/Z$|[+-]\d\d:\d\d$/.test(value)?value:`${value.replace(' ','T')}Z`;const date=new Date(normalized);if(Number.isNaN(date.getTime()))return value;return withTime?dateTime.format(date):new Intl.DateTimeFormat('cs-CZ',{dateStyle:'medium'}).format(date)}
export function statusLabel(status){return({pending:'Čeká',approved:'Schválená',rejected:'Zamítnutá',cancelled:'Zrušená'})[status]||status||'—'}
export function galleryStatusLabel(status){return({pending:'Čeká na schválení',approved:'Schválena',rejected:'Zamítnuta'})[status]||status||'—'}
export function paymentLabel(status){return({paid:'Zaplaceno',unpaid:'K platbě',underpaid:'Doplatek',overpaid:'Přeplatek',not_required:'Bez platby',overdue:'Po splatnosti',early_paid:'Zaplaceno',refunded:'Vráceno'})[status]||status||'—'}
export function paymentQrSvg(spayd){if(!spayd)return '';try{const qr=qrcode(0,'M');qr.addData(spayd,'Byte');qr.make();return qr.createSvgTag({cellSize:4,margin:8,scalable:true})}catch(error){console.error('QR payment render failed',error);return ''}}
export function attendanceLabel(type){return({full_weekend:'Full weekend',saturday_only:'Sobota',day_visit:'Day visit'})[type]||type||'—'}
export function attendanceShortLabel(item){
  if(item.attendanceType==='full_weekend')return item.arrival==='Pátek'?'Pá → Ne':'Full weekend';
  if(item.attendanceType==='saturday_only')return 'Sobota';
  if(item.attendanceType==='day_visit')return 'Na otočku';
  return item.arrival||'—';
}
export function recordsLabel(count){return `${count} ${count===1?'záznam':count>1&&count<5?'záznamy':'záznamů'}`}
export function photosLabel(count){return `${count} ${count===1?'fotografie':count>1&&count<5?'fotografie':'fotografií'}`}

export function readSessionChoice(key,allowed,fallback){
  try{const value=sessionStorage.getItem(key);return allowed.includes(value)?value:fallback}catch{return fallback}
}
export function readSessionValue(key,fallback=''){try{return sessionStorage.getItem(key)??fallback}catch{return fallback}}
export function readSessionYear(key){const value=readSessionValue(key,'');return value==='all'||/^\d{4}$/.test(value)?value:''}
export function rememberSessionChoice(key,value){try{sessionStorage.setItem(key,value)}catch{}}
