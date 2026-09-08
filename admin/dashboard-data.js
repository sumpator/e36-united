// One chart model feeds both SVG and exact tables. No independent financial policy.
const money=new Intl.NumberFormat('cs-CZ',{style:'currency',currency:'CZK',maximumFractionDigits:0});
export const showValue=(value,unit)=>Number.isFinite(value)?unit==='Kč'?money.format(value):new Intl.NumberFormat('cs-CZ').format(value):'—';
const row=(label,value,destination,extra={})=>({label,value,destination,...extra});
export function dashboardKpi(id,summary){
  const o=summary?.overview,p=o?.payments;
  return {reservations:o?.reservations,people:o?.people,recorded:p?.amountPaidCzk,outstanding:p?.amountRemainingCzk,members:summary?.community?.members}[id];
}
export function trendModel(payload,range='all'){
  if(!payload?.days)return null;
  const today=payload.freshness.generatedAt.slice(0,10),days=payload.days.filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.day)).sort((a,b)=>a.day.localeCompare(b.day));
  const start=range==='all'?null:new Date(Date.parse(today+'T00:00:00Z')-(Number(range)-1)*86400000).toISOString().slice(0,10);
  let cumulative=0;const byDate=new Map();
  for(const d of days){cumulative+=d.count;byDate.set(d.day,{...d,cumulative})}
  const shown=start?Array.from({length:Number(range)},(_,i)=>new Date(Date.parse(start+'T00:00:00Z')+i*86400000).toISOString().slice(0,10)):days.map(d=>d.day);
  let total=days.filter(d=>start&&d.day<start).reduce((n,d)=>n+d.count,0);
  const rows=shown.map(day=>{const added=byDate.get(day)?.count||0;total+=added;return row(day,total,'reservations',{added,drill:{to:day}})});
  return {rows,unit:'rezervace',definition:'Kumulativně vytvořené rezervace všech stavů, včetně základu před zvoleným rozsahem. UTC / created_at; nejde o aktuální aktivní rezervace.',
    range,start,end:range==='all'?days.at(-1)?.day||today:today,missing:payload.missingDateCount||0,kind:'line'};
}
export function chartModel(id,summary,analytics,range='all'){
  if(id==='trend')return trendModel(analytics,range);
  const o=summary?.overview;if(!o)return null;const p=o.payments;
  if(id==='occupancy')return{unit:'fyzické jednotky',kind:'occupancy',definition:'Potvrzené jednotky (approved) a samostatná čekající poptávka (pending); kapacita ve stejných jednotkách.',
    rows:(o.accommodation?.options||[]).map(v=>row(v.name,v.confirmedUnits,'reservations',{pending:v.pendingUnits,capacity:v.unitsTotal,unlimited:v.inventoryMode==='unlimited',drill:{option:v.id,occupancy:'approved'},pendingDrill:{option:v.id,occupancy:'pending'}}))};
  if(id==='finance')return p?{unit:'Kč',kind:'bars',definition:'Každý řádek má vlastní populaci; nesčítat všechny úhrady s aktivním nedoplatkem.',
    rows:[row('Předpis aktivním',p.amountDueCzk,'activeDue'),row('Aplikováno na aktivní závazky',p.appliedToActiveCzk,'applied'),
      row('Zbývá aktivním',p.amountRemainingCzk,'outstanding'),row('Evidováno celkem · všechny stavy',p.amountPaidCzk,'recorded'),
      row('Úhrady mimo aktivní · i zrušené',p.inactivePaidCzk,'inactivePaid'),row('Přeplatky · všechny stavy',p.overpaymentCzk,'overpaid')]}:null;
  if(id==='statuses')return{unit:'rezervace',kind:'bars',definition:'Disjunktní stavy všech uložených rezervací vybraného ročníku.',
    rows:[['pending','Čekající'],['approved','Schválené'],['rejected','Zamítnuté'],['cancelled','Zrušené'],['draft','Koncepty']].map(([key,label])=>row(label,o.statuses?.[key],key))};
  if(id==='attendance')return{unit:'aktivní rezervace',kind:'bars',definition:'Plánovaná účast pending + approved rezervací. Nikoli skutečný příjezd / check-in.',
    rows:[['fullWeekend','Celý víkend','full_weekend'],['saturdayOnly','Sobota','saturday_only'],['dayVisit','Na otočku','day_visit']].map(([key,label,type])=>row(label,o.attendance?.[key],'active',{drill:{attendance:type}}))};
  if(id==='sns')return{unit:'aktivní rezervace',kind:'bars',definition:'Deklarovaný zájem pending + approved rezervací. Nikoli přihlášky, hodnocení nebo výsledky.',
    rows:[['yes','Ano'],['maybe','Možná'],['no','Ne']].map(([key,label])=>row(label,o.showShine?.[key],'active',{drill:{sns:label}}))};
  return null;
}
export function attentionModel(summary,analytics,{summaryFresh=false,analyticsFresh=false}={}){
  const o=summary?.overview,a=summary?.attention;
  const rows=[row('Čekající rezervace',o?.statuses?.pending,'pending',{scope:'Vybraný ročník',reason:'Ke schválení',oldest:analytics?.attention?.oldestPendingAt}),
    row('Čeká na úhradu',analytics?.attention?.awaiting,'awaiting',{scope:'Vybraný ročník',reason:'Aktivní nedoplatky, které nejsou po splatnosti'}),
    row('Po splatnosti',o?.payments?.overdue,'overdue',{scope:'Vybraný ročník',reason:'Podle uložené splatnosti schválených rezervací'}),
    row('Přeplatky',o?.payments?.overpaid,'overpaid',{scope:'Vybraný ročník · všechny stavy',reason:'Ke kontrole, bez automatického refundu'}),
    row('Fotky ke schválení',a?.gallery,'photos',{scope:'Globálně',reason:'Komunitní galerie',oldest:o?.gallery?.oldestPendingAt}),
    row('Historie / S&S ke kontrole',a?.history,'history',{scope:'Globálně',reason:'Unikátní žádosti, komponenty se mohou překrývat',oldest:o?.history?.oldestPendingAt})];
  const complete=summaryFresh&&analyticsFresh&&rows.every(r=>Number.isFinite(r.value));
  return{rows,complete,allClear:complete&&rows.every(r=>r.value===0)};
}
