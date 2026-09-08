import assert from 'node:assert/strict';
import {adminGrowth} from './admin-growth.mjs';
import {requireAdmin} from '../../worker/auth/admin.js';
import {getAdminDashboard,getAdminPreferences,saveAdminPreferences} from '../../worker/admin/dashboard.js';
import {getAdminReservations} from '../../worker/domains/reservations/index.js';
import {getAdminOperation} from '../../worker/admin/commands.js';
import {factoryPreferences} from '../../admin/dashboard-model.js';
const origin='https://example.invalid',auth={uid:'a'};
const describe=r=>r.queries.map(({sql,args})=>({sql,args,plan:r.db.prepare('EXPLAIN QUERY PLAN '+sql).all(...args).map(p=>p.detail),bytecode:r.db.prepare('EXPLAIN '+sql).all(...args)}));
export async function captureDashboardBudget(){
 const runtime=adminGrowth(),env={...runtime.env,ADMIN_READ:true},report=[];
 const cases=[['dashboard-analytics',()=>getAdminDashboard(env,new URL('/?eventId=e',origin),origin)],['dashboard-preferences',()=>getAdminPreferences(env,auth,origin)],
 ...['scope=outstanding','scope=inactivePaid','scope=awaiting','scope=overdue','scope=overpaid','scope=pending','option=option-e&occupancy=approved','option=option-e&occupancy=pending','scope=active&attendance=full_weekend','scope=active&sns=Ano','to=2026-09-08'].map(filter=>['drill-'+filter,()=>getAdminReservations(env,new URL('/?eventId=e&'+filter,origin),origin)])];
 const changes=runtime.db.prepare('SELECT total_changes() n').get().n;
 for(const[name,run]of cases){runtime.queries.length=0;await requireAdmin(env,auth);const response=await run();assert.equal(response.status,200);const body=await response.text();report.push({name,body,bytes:Buffer.byteLength(body),queries:describe(runtime)});}
 assert.equal(runtime.writes,0);assert.equal(runtime.db.prepare('SELECT total_changes() n').get().n,changes);
 return{runtime,report};
}
export async function captureDashboardOperation(){
 const r=adminGrowth(),value=factoryPreferences();
 // Max safe widget count, both compositions, to avoid pricing only an empty layout.
 for(const c of Object.values(value.compositions)){while(c.widgets.length<32)c.widgets.push({id:'future-'+c.widgets.length,size:'wide'});c.quickLinks=['members','reservations','photos','history'];}
 const request=new Request(origin+'/api/admin/preferences',{method:'PUT',headers:{'If-Match':'0','Idempotency-Key':'budget-preferences'},body:JSON.stringify(value)});
 r.queries.length=0;await requireAdmin(r.env,auth);assert.equal((await saveAdminPreferences(request,r.env,auth,origin)).status,200);
 const operation=describe(r);r.queries.length=0;await requireAdmin(r.env,auth);assert.equal((await getAdminOperation(r.env,auth,'budget-preferences',origin)).status,200);const receipt=describe(r);
 const localChanges=r.writes,storedBytes=Buffer.byteLength(r.db.prepare("SELECT configuration_json FROM admin_preferences WHERE id='a'").get().configuration_json);r.db.close();return{operation,receipt,localChanges,storedBytes,rowsRead:null,note:'Explicit synthetic preference save; never polling. Local VM-step ceiling, not Cloudflare billing.'};
}
export function dashboardBudget(profile,{hours=3,contexts=1,dashboardFraction=1}={}){
 const cost=name=>profile.report.find(r=>r.name===name).estimatedRows;
 const analyticsCalls=Math.ceil(hours*12*dashboardFraction),preferenceReads=Math.ceil(contexts+hours),drills=Math.ceil(hours*4),saves=contexts;
 const drillCost=Math.max(...profile.report.filter(r=>r.name.startsWith('drill-')).map(r=>r.estimatedRows));
 // New drill destinations replace existing lists, but conservatively charge them
 // fully as extra explicit actions instead of hiding old-endpoint costs.
 const rows=[{resource:'analytics',calls:analyticsCalls,queries:4,perCall:cost('dashboard-analytics')},{resource:'preferences-read',calls:preferenceReads,queries:2,perCall:Math.max(3,cost('dashboard-preferences'))},
 {resource:'extra-drill',calls:drills,queries:profile.report.find(r=>r.estimatedRows===drillCost).queries.length,perCall:drillCost},{resource:'preference-save',calls:saves,queries:profile.explicit.operation.length,perCall:profile.explicit.operationEstimate},{resource:'receipt',calls:saves,queries:profile.explicit.receipt.length,perCall:profile.explicit.receiptEstimate}];
 const total=rows.reduce((n,r)=>n+r.calls*r.perCall,0),dataRequests=rows.reduce((n,r)=>n+r.calls,0),queries=rows.reduce((n,r)=>n+r.calls*r.queries,0);
 return{hours,contexts,dashboardFraction,rows,total,withRetries:Math.ceil(total*1.1),dataRequests,queries,incomingWithOptionsAndRetries:Math.ceil(dataRequests*2*1.1),qualification:'Conservative incremental LOCAL fixture row-operation estimate; not actual Cloudflare meta.rows_read. Extra manual activity beyond stated envelope is not priced.'};
}
