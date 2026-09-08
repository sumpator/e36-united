// Historical arithmetic is kept separately in admin-budget-model.mjs. These are
// calls in the SAME 12h workload, not three permanently active screens per tick.
export const PERIODIC_PER_CONTEXT={summary:48,'reservation-list':60,'reservation-detail':120,gallery:30,'member-header':480,'member-garage':240};
export function budgetClosure(profile,{before=false,contexts=3,hours=12}={}){
  const lookup=name=>profile.report.find(e=>e.name===name).estimatedRows;
  // Rounding/allowances remain explicit. A measured first BMW suggestion page
  // is NOT the bound for all search terms, pages, members or explicit mutations.
  const costs={summary:lookup('summary'),'reservation-list':lookup('reservation-list'),
    'reservation-detail':lookup(before?'reservation-pending-detail':'reservation-pending-detail-only'),
    gallery:lookup('gallery'),'member-header':20,'member-garage':100,'member-tab':100,
    search:5000,operation:Math.max(1000,profile.explicit.operationEstimate),receipt:profile.explicit.receiptEstimate,image:6,events:lookup('events'),funnel:lookup('funnel'),'member-list':lookup('member-list')};
  const explicit={summary:33,'reservation-list':32,'reservation-detail':32,'member-header':60,'member-tab':60,search:60,operation:20,receipt:20,image:390,events:1,funnel:1,'member-list':1};
  const scale=contexts*hours/12;
  const rows=Object.entries(costs).map(([resource,perCall])=>{const polling=PERIODIC_PER_CONTEXT[resource]||0,actions=explicit[resource]||0;return {resource,perCall,pollingCalls:polling*scale,explicitCalls:actions*scale,total:(polling+actions)*scale*perCall}});
  const total=Math.ceil(rows.reduce((sum,r)=>sum+r.total,0)),withRetries=Math.ceil(total*110/100);
  const dataRequests=rows.reduce((sum,r)=>sum+r.pollingCalls+r.explicitCalls,0);
  return {rows,total,withRetries,target:1000000,targetMet:withRetries<=1000000,dataRequests,incomingWithOptionsAndRetries:Math.ceil(dataRequests*2*1.1),
    qualification:'Fixture-specific conservative local estimate, not Cloudflare rows_read; no extra Member-close/manual bursts or prolonged global Mailing session in the original worked scenario.'};
}
