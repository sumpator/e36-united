// Read-only presentation of the existing Member projections; no requests or policy.
import {escapeHtml as esc,formatMoney,formatDate} from './ui.js?v=20260924-merch2';
import {commandIcon} from './command-icons.js?v=20261014-admin1';

export const MEMBER_TABS=Object.freeze({overview:'Přehled',event:'Sraz a platby',club:'United Club',media:'Fotky & garáž',profile:'Profil a komunikace'});
export const memberSectionKey=tab=>({reservations:'event',merch:'event',garage:'media',photos:'media',history:'club',points:'club',mailing:'profile',qr:'overview'}[tab]||tab);
export const knownMemberTab=tab=>Object.hasOwn(MEMBER_TABS,memberSectionKey(tab));
const labels={active:'Aktivní',inactive:'Neaktivní',suspended:'Pozastavený',blocked:'Blokovaný',admin:'Administrátor',member:'Člen',pending:'Čeká na schválení',approved:'Schváleno',rejected:'Zamítnuto',cancelled:'Zrušeno',draft:'Koncept',not_submitted:'Nepodáno',not_claimed:'Nenárokováno',unpaid:'Neuhrazeno',paid:'Uhrazeno',underpaid:'Částečně uhrazeno',overpaid:'Přeplatek',not_required:'Bez platby',full_weekend:'Celý víkend',saturday_only:'Sobota',day_visit:'Jednodenní návštěva',none:'Bez ubytování',sedan:'Sedan',coupe:'Coupé',touring:'Touring',compact:'Compact',cabrio:'Cabrio',unknown:'Neznámý stav'};
export const memberLabel=value=>esc(value==null||value===''?'—':Object.hasOwn(labels,value)?labels[value]:value);
const mailingLabels={yes:'Ano',no:'Ne',unknown:'Neznámý stav',eligible:'Bez vyloučení',unsubscribed:'Odhlášeno',hard_bounce:'Trvale nedoručeno',soft_bounce:'Dočasně nedoručeno',blocked:'Blokováno',manually_suppressed:'Ručně vyloučeno',deliverable:'Doručitelné',prepared:'Připraveno',sent:'Odesláno',delivered:'Doručeno',rejected:'Odmítnuto'};
const mailingLabel=v=>Object.hasOwn(mailingLabels,v)?esc(mailingLabels[v]):value(v);
const value=v=>esc(v==null||v===''?'—':v);
const money=v=>Number.isFinite(v)?esc(formatMoney(v)):'—';
const date=v=>v?esc(formatDate(v)):'—';
const icon=name=>`<span class="admin-member-icon" aria-hidden="true">${commandIcon(name)}</span>`;
export const memberEmpty=(text,name='members')=>`<div class="admin-member-empty">${icon(name)}<p>${esc(text)}</p></div>`;
const card=(title,body,name='members',attrs='')=>`<article class="admin-member-card" ${attrs}><h3>${icon(name)}${esc(title)}</h3>${body}</article>`;
const facts=items=>`<dl class="admin-member-facts">${items.map(([label,html])=>`<div><dt>${esc(label)}</dt><dd>${html}</dd></div>`).join('')}</dl>`;
const tabLink=(tab,label=MEMBER_TABS[tab])=>`<button type="button" data-member-section="${tab}">${esc(label)} →</button>`;
export const memberReservationLink=item=>`<button type="button" data-member-reservation="${esc(item.id)}" data-member-event-id="${esc(item.eventId)}">Otevřít detail registrace</button>`;
const reservationFacts=r=>facts([['Stav',memberLabel(r.status)],['Osoby',value(r.crew)],['Typ účasti',memberLabel(r.attendanceType)],['Pobyt',value(r.stayName||r.accommodation)],['Příjezd',value(r.arrival)],['Ubytování',`${value(r.stayPeople)} osob / ${value(r.stayUnits??r.accommodationUnits)} jednotek / ${value(r.stayNights)} nocí`]]);
const paymentFacts=r=>{
 const known=Number.isFinite(r.amountDueCzk)&&Number.isFinite(r.amountPaidCzk);
 return facts([['Předpis',money(r.amountDueCzk)],['Evidovaně uhrazeno',money(r.amountPaidCzk)],['Zbývá uhradit',known?money(Math.max(0,r.amountDueCzk-r.amountPaidCzk)):'—'],['Přeplatek',known?money(Math.max(0,r.amountPaidCzk-r.amountDueCzk)):'—']]);
};
export function memberIdentity(m){
 const title=m.nickname||m.name||'Člen',initials=title.trim().split(/\s+/u).slice(0,2).map(s=>s[0]).join('').toLocaleUpperCase('cs-CZ');
 return '<span class="admin-member-monogram" aria-hidden="true">'+esc(initials)+'</span><div class="admin-member-identity-copy"><h2 id="admin-member-heading">'+esc(title)+'</h2></div>';
}
export function memberProfile(m){return m?card('Profil a kontakty',facts([['Jméno',value(m.name)],['Přezdívka',value(m.nickname)],['E-mail',value(m.email)],['Telefon',m.phone?value(m.phone):'Neuveden'],['Stav účtu',memberLabel(m.status)],['Role',memberLabel(m.role)]])+'<details><summary>Další údaje</summary>'+facts([['Členské ID',value(m.memberCode)],['Založeno',date(m.createdAt)]])+'</details>'):memberEmpty('Načítám profil…');}

function clubFacts(p){return `<div class="admin-member-rating"><small>Hodnost United</small><strong>${value(p.rating?.name)}</strong></div>`+facts([['Dostupné body',value(p.points?.available)],['Celkem získané body',value(p.points?.lifetime)]]);}
function achievements(items,compact=false){
 const visible=compact?(items||[]).slice(0,3):items||[];
 return visible.length?`<div class="admin-member-achievements ${compact?'admin-member-achievements--compact':''}">${visible.map(a=>`<div>${icon('united-club')}<div><strong>${value(a.name)}</strong>${compact?'':`<small>${value(a.tier)}</small><p>${value(a.condition)}</p>`}</div></div>`).join('')}</div>`:memberEmpty('V tomto přehledu nejsou žádné achievementy.','united-club');
}
export function memberOverview(header,club,{headerState,clubState}={}){
 const m=header?.member,res=header?.reservations||[],car=header?.heroCar;
 const contact=m?facts([['Jméno',value(m.name)],['E-mail',value(m.email)],['Telefon',m.phone?value(m.phone):'Neuveden'],['Stav účtu',memberLabel(m.status)],['Role',memberLabel(m.role)]]):memberEmpty(headerState?.state==='unavailable'?'Profil se nepodařilo načíst.':'Načítám profil…');
 return '<div class="admin-member-overview" data-member-overview>'+card('Člen',contact+'<div class="admin-member-shortcuts">'+tabLink('profile','Profil a komunikace')+tabLink('qr','Zobrazit členské QR')+'</div><details><summary>Další údaje</summary>'+facts([['Členské ID',value(m?.memberCode)],['Založeno',date(m?.createdAt)]])+'</details>')+card(header?.event?.title||'Sraz a platby',header?(res.length?res.map(r=>facts([['Registrace',memberLabel(r.status)],['Posádka',value(r.crew)]])+paymentFacts(r)).join(''):'<p>Pro tento ročník nemá registraci ani platby za sraz.</p>'):(headerState?.state==='unavailable'?'<p>Registraci se nepodařilo načíst.</p>':'<p>Načítám sraz…</p>'))+card('United Club',(club?clubFacts(club):memberEmpty(clubState?.state==='unavailable'?'United Club se nepodařilo načíst.':'Načítám United Club…'))+tabLink('club'),'united-club')+card('Hlavní auto',(car?'<p>'+[value(car.nickname),value(car.model),memberLabel(car.body)].join(' · ')+'</p>':'<p>Hlavní auto není vybrané.</p>')+tabLink('media','Fotky a garáž'),'reservations')+'</div>';
}

export function memberReservation(r){return card(r.title||String(r.year||'Registrace'),`<div class="admin-member-reservation-columns"><div>${reservationFacts(r)}${facts([['Auto',value(r.carModel)],['S&S',value(r.showShine)]])}</div><div>${paymentFacts(r)}${facts([['VS (uložené)',value(r.variableSymbol)],['Uložený platební stav',memberLabel(r.storedPaymentStatus)],['Uhrazeno dne',date(r.paidAt)]])}</div></div>${memberReservationLink(r)}`,'reservations');}
export function memberPhoto(item){return `<button type="button" class="admin-member-photo" data-member-image="${esc(item.mediaPath)}" aria-label="Otevřít fotografii v plné velikosti"><img alt="Soukromá fotografie člena" width="360" height="240" loading="lazy" data-member-media="${esc(item.mediaPath)}" data-media-version="${esc(item.version||'')}"/></button>`;}
const statusTone=status=>['approved','pending','rejected'].includes(status)?status:'neutral';
const statusAction=item=>`<button type="button" class="admin-member-status-action is-${statusTone(item.status)}" data-member-photo-moderation data-photo-status="${esc(item.status||'all')}">${memberLabel(item.status)} <span aria-hidden="true">→</span></button>`;
const historyStatus=(label,status)=>`<span class="admin-member-history-status is-${statusTone(status)}"><small>${esc(label)}</small><b>${memberLabel(status)}</b></span>`;
function memberHistory(p){
 const notes=[p.attendanceNote?`<p><b>Účast:</b> ${value(p.attendanceNote)}</p>`:'',p.snsNote?`<p><b>S&S:</b> ${value(p.snsNote)}</p>`:''].filter(Boolean).join('');
 const detail=[p.category?`<span>${value(p.category)}</span>`:'',p.placement?`<span>${value(p.placement)}. místo</span>`:''].filter(Boolean).join('');
 return `<article class="admin-member-card admin-member-history-card"><h3>${icon('history')}United ${value(p.year)}</h3><div class="admin-member-history-summary">${historyStatus('Účast',p.attendanceStatus)}${historyStatus('S&S',p.snsStatus)}</div>${detail?`<div class="admin-member-history-detail">${detail}</div>`:''}${notes?`<div class="admin-member-history-notes">${notes}</div>`:''}<div class="admin-member-photo-grid">${(p.photos||[]).map(memberPhoto).join('')}</div><button type="button" data-member-history="${esc(p.eventId)}">Otevřít existující moderaci historie</button></article>`;
}
export function memberSection(payload,qrSvg){
 const tab=payload.context.tab,items=payload.items||[];
 if(tab==='club')return card('United Club',clubFacts(payload),'united-club')+card('Achievementy',achievements(payload.achievements),'united-club');
 if(tab==='qr')return card('Členské QR',payload.payload?`<div class="admin-member-qr" aria-label="Členská QR identita">${qrSvg(payload.payload)}</div><p>Identifikace člena, nikoli vstupenka nebo potvrzení platby. Bez oprávnění ke změnám.</p>`:memberEmpty('Členské QR zatím nebylo vydáno. Tento pohled je nevytváří.','members'));
 let before='';
 if(tab==='mailing')before=card('Propojený kontakt',payload.contact?facts([['Uložené propojení',value(payload.contact.email)],['Souhlas',mailingLabel(payload.contact.mailingConsent)],['Vyloučení z rozesílky',mailingLabel(payload.contact.suppressionStatus)],['Doručitelnost',mailingLabel(payload.contact.deliverabilityStatus)]]):memberEmpty('Žádný uložený propojený kontakt. Shoda e-mailu sama o sobě není vazba.'),'mailing');
 const empty={event:'Na tento ročník zatím nemá registraci.',reservations:'V této části historie nejsou registrace.',garage:'Člen zatím nemá vůz v Garáži.',photos:'V této části nejsou členské fotografie.',history:'V této části nejsou záznamy historie ani S&S.',points:'V této části nejsou pohyby bodů.',mailing:'Nejsou zde záznamy kampaní.'};
 if(!items.length)return before+memberEmpty(empty[tab]||'Žádné záznamy v tomto rozsahu.',tab);
 const rows=items.map(p=>{
  if(tab==='reservations')return memberReservation(p);
  if(tab==='garage')return card(p.nickname||p.model,`${p.primaryCar?'<span class="admin-member-status">Hlavní auto</span>':''}${facts([['Model',value(p.model)],['Karoserie',memberLabel(p.body)],['Rok',value(p.year)],['Barva',value(p.color)]])}<div class="admin-member-photo-grid">${(p.photos||[]).map(memberPhoto).join('')}</div>`,'reservations');
  if(tab==='photos')return card(p.caption||'Členská fotografie',memberPhoto(p)+statusAction(p)+(p.reviewNote?`<small class="admin-member-review-note">${value(p.reviewNote)}</small>`:''),'photos');
  if(tab==='history')return memberHistory(p);
  if(tab==='points')return `<article class="admin-member-card admin-member-ledger"><strong>${value(p.delta)} bodů</strong><div><p>${value(p.reason)}</p><small>${date(p.createdAt)}</small></div></article>`;
  if(tab==='mailing')return card(p.campaign,`<p>${mailingLabel(p.deliveryStatus)}</p><small>${p.sentAt?date(p.sentAt):'Neodesláno'}</small>`,'mailing');
  return '';
 }).join('');
 return before+`<div class="admin-member-section-grid ${['garage','photos'].includes(tab)?'admin-member-section-grid--media':''} ${tab==='history'?'admin-member-section-grid--history':''}">${rows}</div>`;
}
