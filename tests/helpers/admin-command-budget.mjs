import assert from 'node:assert/strict';
import {adminGrowth} from './admin-growth.mjs';
import {requireAdmin} from '../../worker/auth/admin.js';
import {getAdminDashboard} from '../../worker/admin/dashboard.js';
import {getAdminReservations} from '../../worker/domains/reservations/index.js';
export async function captureCommandBudget(){
  const runtime=adminGrowth(),env={...runtime.env,ADMIN_READ:true},origin='https://example.invalid',report=[];
  const pending=runtime.db.prepare("SELECT id FROM reservations WHERE event_id='e' AND status='pending' ORDER BY id LIMIT 1").get().id;
  const cases=[['analytics-before',()=>getAdminDashboard(env,new URL('/?eventId=e',origin),origin)],
    ['analytics-command',()=>getAdminDashboard(env,new URL('/?eventId=e&presentation=command',origin),origin)],
    ...[false,true].map(command=>['detail-'+(command?'command':'before'),()=>getAdminReservations(env,new URL('/?eventId=e&id='+pending+'&projection=detail'+(command?'&presentation=command':''),origin),origin)])];
  const before=runtime.db.prepare('SELECT total_changes() n').get().n;
  for(const[name,run]of cases){runtime.queries.length=0;await requireAdmin(env,{uid:'a'});const response=await run();assert.equal(response.status,200);const body=await response.text();
    report.push({name,bytes:Buffer.byteLength(body),queries:runtime.queries.map(q=>({...q,plan:runtime.db.prepare('EXPLAIN QUERY PLAN '+q.sql).all(...q.args).map(p=>p.detail)}))});}
  assert.equal(runtime.db.prepare('SELECT total_changes() n').get().n,before);assert.equal(runtime.writes,0);
  return {runtime,report};
}
export function commandIncrement(profile,{memberHours=0,mailingHours=0,dashboardHours=0,detailHours=0,explicitDetails=0,optionalMailingHours=0}={}){
  const cost=name=>profile.report.find(r=>r.name===name).estimatedRows;
  const rows=[{source:'Shared summary over Member / Mailing',calls:Math.ceil((memberHours+mailingHours)*12),perCall:4271},
    {source:'Exact recent preview within dashboard request',calls:Math.ceil(dashboardHours*12),perCall:cost('analytics-command')-cost('analytics-before')},
    {source:'Selected-car / QR context within detail request',calls:Math.ceil(detailHours*60)+explicitDetails,perCall:Math.max(6,cost('detail-command')-cost('detail-before'))},
    {source:'One visible selected-car photo per explicit detail',calls:explicitDetails,perCall:6},
    {source:'Optional stored Mailing widget',calls:Math.ceil(optionalMailingHours*12),perCall:374432}];
  const estimated=rows.reduce((sum,r)=>sum+r.calls*r.perCall,0);
  return{rows,estimated,withRetries:Math.ceil(estimated*1.1),actualCloudflareRowsRead:null};
}
