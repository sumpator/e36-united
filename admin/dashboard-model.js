import {QUICK_LINK_IDS} from './destinations.js?v=20260909-admin-member-modal-r4';
export const COMPOSITIONS=Object.freeze({preparation:'Příprava srazu',onsite:'Na srazu'});
export const WIDGETS=Object.freeze({
  reservations:{label:'Rezervace',kind:'kpi',sizes:['compact'],definition:'Pending + approved · rezervace',destination:'active'},
  people:{label:'Osoby',kind:'kpi',sizes:['compact'],definition:'Plánované osoby v pending + approved rezervacích',destination:'active'},
  recorded:{label:'Evidovaně uhrazeno',kind:'kpi',sizes:['compact'],definition:'Kč · všechny stavy včetně zrušených',destination:'recorded'},
  outstanding:{label:'Zbývá uhradit',kind:'kpi',sizes:['compact'],definition:'Kč · součet kladných nedoplatků aktivních rezervací',destination:'outstanding'},
  trend:{label:'Vývoj rezervací',kind:'chart',sizes:['wide','compact'],definition:'Zaznamenané rezervace · všechny stavy · created_at / UTC'},
  occupancy:{label:'Ubytování podle typu',kind:'chart',sizes:['wide','compact'],definition:'Fyzické jednotky · potvrzené a čekající odděleně'},
  finance:{label:'Finance v souvislostech',kind:'chart',sizes:['compact','wide'],definition:'Kč · předpis a aplikované úhrady v aktivních závazcích; ostatní úhrady odděleně'},
  statuses:{label:'Stavy rezervací',kind:'chart',sizes:['compact','wide'],definition:'Rezervace · disjunktní aktuální stavy, celý vybraný ročník'},
  attendance:{label:'Plánovaná účast',kind:'chart',sizes:['compact','wide'],definition:'Aktivní rezervace · deklarovaná účast, nikoli skutečný příjezd'},
  sns:{label:'Deklarovaný zájem S&S',kind:'chart',sizes:['compact','wide'],definition:'Aktivní rezervace · zájem, nikoli soutěžní přihlášky nebo výsledky'},
  members:{label:'Členské profily',kind:'kpi',sizes:['compact'],definition:'Globální D1 profily · nikoli úplný census Firebase',destination:'members'},
  planner:{label:'Registrace / Planner funnel',kind:'detail',sizes:['wide'],definition:'Volitelné forward-only pozorování · detaily nejvýše 50'},
});
const widget=(id,size=WIDGETS[id].sizes[0])=>({id,size});
export function factoryPreferences(){return{schemaVersion:1,compositions:{
  preparation:{widgets:['reservations','people','recorded','outstanding','trend','occupancy','finance','statuses','attendance','sns'].map(id=>widget(id)),quickLinks:[]},
  onsite:{widgets:['reservations','outstanding','statuses','trend','occupancy','attendance','sns'].map(id=>widget(id)),quickLinks:['members','reservations','paymentAttention','photos']},
}}}
// Accept safe future widget IDs without silently deleting or rewriting them on reads.
export function validatePreferences(value){
  if(!value||value.schemaVersion!==1||!value.compositions||Object.keys(value).some(k=>!['schemaVersion','compositions'].includes(k)))return false;
  if(Object.keys(value.compositions).sort().join()!=='onsite,preparation')return false;
  return Object.keys(COMPOSITIONS).every(key=>{
    const c=value.compositions[key];
    return c&&Object.keys(c).sort().join()==='quickLinks,widgets'&&Array.isArray(c.widgets)&&c.widgets.length<=32&&
      new Set(c.widgets.map(w=>w?.id)).size===c.widgets.length&&c.widgets.every(w=>w&&Object.keys(w).sort().join()==='id,size'&&
        /^[a-z][a-z0-9_-]{0,39}$/.test(w.id)&&['compact','wide'].includes(w.size)&&(!Object.hasOwn(WIDGETS,w.id)||WIDGETS[w.id].sizes.includes(w.size)))&&
      Array.isArray(c.quickLinks)&&c.quickLinks.length<=4&&new Set(c.quickLinks).size===c.quickLinks.length&&c.quickLinks.every(id=>QUICK_LINK_IDS.includes(id));
  });
}
