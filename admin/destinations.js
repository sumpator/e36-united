// Presentation/navigation IDs only. Never execute commands or accept arbitrary URLs.
export const ADMIN_AREAS = Object.freeze({
  dashboard:{label:'Přehled',views:['dashboard']},
  reservations:{label:'Rezervace',views:['reservations','accommodation']},
  payments:{label:'Platby',views:['payments']},
  community:{label:'Komunita',views:['members','gallery','club','united-club']},
  mailing:{label:'Mailing',views:['mailing']},
  settings:{label:'Nastavení',views:['event']},
});
export const VIEW_LABELS=Object.freeze({dashboard:'Přehled',reservations:'Rezervace',accommodation:'Ubytování',payments:'Platby',members:'Členové',gallery:'Fotky',club:'Historie & S&S','united-club':'United Club',mailing:'Mailing',event:'Nastavení ročníku'});
export const areaFor=(view,mode)=>view==='gallery'||view==='club'?'community':Object.keys(ADMIN_AREAS).find(key=>ADMIN_AREAS[key].views.includes(view))||'dashboard';
export const DESTINATIONS=Object.freeze({
  members:{label:'Členové',view:'members',scope:'global'},
  reservations:{label:'Všechny rezervace',view:'reservations'},
  active:{label:'Aktivní rezervace · pending + approved',view:'reservations',scope:'active'},
  pending:{label:'Čekající rezervace',view:'reservations',scope:'pending'},
  approved:{label:'Schválené rezervace',view:'reservations',scope:'approved'},
  rejected:{label:'Zamítnuté rezervace',view:'reservations',scope:'rejected'},
  cancelled:{label:'Zrušené rezervace',view:'reservations',scope:'cancelled'},
  draft:{label:'Koncepty rezervací',view:'reservations',scope:'draft'},
  outstanding:{label:'Aktivní rezervace se zbývající úhradou',view:'payments',scope:'outstanding'},
  overdue:{label:'Schválené rezervace po splatnosti',view:'payments',scope:'overdue'},
  awaiting:{label:'Aktivní nedoplatky · ne po splatnosti',view:'payments',scope:'awaiting'},
  overpaid:{label:'Přeplatky · všechny stavy',view:'payments',scope:'overpaid'},
  recorded:{label:'Evidované úhrady · všechny stavy',view:'payments',scope:'recorded'},
  activePaid:{label:'Úhrady aktivních rezervací',view:'payments',scope:'activePaid'},
  inactivePaid:{label:'Úhrady mimo aktivní rezervace',view:'payments',scope:'inactivePaid'},
  activeDue:{label:'Předpis aktivním rezervacím',view:'payments',scope:'activeDue'},
  applied:{label:'Úhrady přiřazené aktivním závazkům',view:'payments',scope:'applied'},
  paymentAttention:{label:'Platby vyžadující kontrolu',view:'payments',filter:'attention'},
  photos:{label:'Čekající fotky · globálně',view:'gallery',galleryMode:'community'},
  history:{label:'Historie / S&S ke kontrole · globálně',view:'gallery',galleryMode:'history'},
  accommodation:{label:'Ubytování · vybraný ročník',view:'accommodation'},
  settings:{label:'Nastavení vybraného ročníku',view:'event'},
});
export const QUICK_LINK_IDS=Object.freeze(['members','reservations','paymentAttention','outstanding','photos','history','accommodation','settings']);
const id=value=>/^[a-z0-9_-]{1,128}$/i.test(value||'')?value:'';
const date=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value?value:'';
export function cleanDrill(value={}){
  const result={};
  if(typeof value.scope==='string'&&DESTINATIONS[value.scope]?.scope===value.scope&&value.scope!=='global')result.scope=value.scope;
  if(id(value.option))result.option=id(value.option);
  if(['pending','approved'].includes(value.occupancy))result.occupancy=value.occupancy;
  if(['full_weekend','saturday_only','day_visit'].includes(value.attendance))result.attendance=value.attendance;
  if(['Ano','Ne','Možná'].includes(value.sns))result.sns=value.sns;
  if(date(value.from))result.from=value.from;
  if(date(value.to))result.to=value.to;
  return result;
}
export function destination(key,extra={}){
  if(!Object.hasOwn(DESTINATIONS,key))return null;const target=DESTINATIONS[key];
  return {...target,drill:cleanDrill({scope:target.scope,...extra})};
}
export function drillLabel(drill={}){
  return [DESTINATIONS[drill.scope]?.label,drill.option?'Ubytování: '+drill.option:null,
    drill.occupancy?VIEW_LABELS[drill.occupancy]||({pending:'Čekající poptávka',approved:'Potvrzené jednotky'})[drill.occupancy]:null,
    drill.attendance?({full_weekend:'Celý víkend',saturday_only:'Sobota',day_visit:'Na otočku'})[drill.attendance]:null,
    drill.sns?'Deklarovaný S&S zájem: '+drill.sns:null,
    drill.from||drill.to?'Vytvořeno (UTC): '+(drill.from||'od počátku')+' až '+(drill.to||'bez konce'):null].filter(Boolean).join(' · ');
}
