// Local read-only measurement of the additive page projection; no network or D1 CLI.
import assert from 'node:assert/strict';
import {memberRuntime} from '../tests/helpers/admin-member-runtime.mjs';
import {listAdminMembers} from '../worker/admin/members.js';
import {getAdminHistoryClaims} from '../worker/domains/club/history.js';
import {memberCardsSql} from '../worker/admin/member-cards.js';
const r=memberRuntime();
try{
 const report=[];
 for(const [name,handler,path]of [['members',listAdminMembers,'?eventId=e'],['history',getAdminHistoryClaims,'?eventId=e&year=all&status=all']]){
  const read=async cards=>{r.queries.length=0;const response=await handler(r.env,new URL('https://local.invalid/'+path+(cards?'&presentation=cards':'')),'local');assert.equal(response.status,200);return{data:await response.json(),queries:[...r.queries]}};
  const before=await read(false),after=await read(true),items=after.data.members||after.data.claims,ids=[...new Set(items.map(i=>i.memberId||i.member.id))];
  const added=after.queries.filter(q=>q.sql===memberCardsSql(ids.length));assert.equal(added.length,1);assert.equal(after.queries.length,before.queries.length+1);
  report.push({endpoint:name,pageRecords:items.length,uniqueMembers:ids.length,statementsBefore:before.queries.length,statementsAfter:after.queries.length,addedQuery:added[0],plan:r.db.prepare('EXPLAIN QUERY PLAN '+added[0].sql).all(...added[0].args).map(row=>row.detail)});
 }
 assert.equal(r.writes,0);assert.equal(r.mediaReads,0);
 console.log(JSON.stringify({measurement:'Local SQLite executed statements and EXPLAIN, not Cloudflare billing',actualCloudflareRowsRead:null,writes:r.writes,mediaReads:r.mediaReads,report},null,2));
}finally{r.db.close()}
