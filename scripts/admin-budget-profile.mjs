import {captureDashboardBudget,captureDashboardOperation} from '../tests/helpers/admin-dashboard-budget.mjs';
import {backup} from 'node:sqlite';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,relative,sep} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {captureAdminBudget,captureAdminBudgetOperation} from '../tests/helpers/admin-budget-capture.mjs';

// Diagnostic executable only, not an application dependency. No network access.
const cli=process.env.SQLITE_SCAN_CLI;
assert.ok(cli,'Set SQLITE_SCAN_CLI to a SQLite shell with ENABLE_STMT_SCANSTATUS');
const dir=mkdtempSync(join(tmpdir(),'e36-budget-profile-'));
function literal(value){
  if(value===null)return 'NULL';
  if(typeof value==='number'){assert.ok(Number.isFinite(value));return String(value)}
  return "CAST(X'"+Buffer.from(String(value)).toString('hex')+"' AS TEXT)";
}
function boundSql(sql,args){
  let index=0;
  // Preserve quoted text/comments. Inline ONLY captured synthetic bound values;
  // .parameter writes between CAS statements would disturb SQLite changes().
  const result=sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|\?/g,token=>token==='?'?literal(args[index++]):token);
  assert.equal(index,args.length);return result;
}
try{
  const {runtime,report:current}=await (process.argv.includes('--stage3')?captureDashboardBudget():captureAdminBudget());
  const replay=process.argv.indexOf('--replay');
  const report=replay<0?current:JSON.parse(readFileSync(process.argv[replay+1],'utf8')).report;
  if(process.argv.includes('--before-index'))runtime.db.exec("DROP INDEX admin_reservations_page; DELETE FROM schema_migrations WHERE id='2026-09-08-admin-read-budget'");
  for(const endpoint of report)for(const q of endpoint.queries){
    q.bytecode=runtime.db.prepare('EXPLAIN '+q.sql).all(...q.args);
    q.plan=runtime.db.prepare('EXPLAIN QUERY PLAN '+q.sql).all(...q.args).map(p=>p.detail);
  }
  const tableCounts=Object.fromEntries(runtime.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(({name})=>[name,Number(runtime.db.prepare('SELECT COUNT(*) n FROM "'+name+'"').get().n)]));
  const roots=new Map(runtime.db.prepare('SELECT rootpage,tbl_name FROM sqlite_schema').all().map(r=>[r.rootpage,r.tbl_name]));
  await backup(runtime.db,join(dir,'fixture.sqlite'));
  const flattened=report.flatMap(endpoint=>endpoint.queries);
  for(const [i,q] of flattened.entries()){
    const commands=['.bail on','.mode off','.parameter init',...q.args.map((value,n)=>'.parameter set ?'+(n+1)+' "'+literal(value)+'"'),'.scanstats on',q.sql+';'];
    const execution=spawnSync(cli,['-readonly',join(dir,'fixture.sqlite')],{input:commands.join('\n')+'\n',encoding:'utf8',maxBuffer:32*1024*1024,windowsHide:true});
    const opens=new Map(q.bytecode.filter(o=>o.opcode==='OpenRead').map(o=>[o.p1,o.p2]));
    q.fastCountAllowance=q.bytecode.filter(o=>o.opcode==='Count').reduce((sum,o)=>sum+(tableCounts[roots.get(opens.get(o.p1))]||0),0);
    delete q.bytecode;
    if(execution.status!==0){
      // Complex legacy Mailing plans crash the stock shell's scanstatus display
      // (reproduced in 3.50.4 and 3.53.4). Re-execute UNCHANGED SQL with statement
      // counters, not that display; never turn an unavailable profile into zero.
      const fallback=spawnSync(cli,['-readonly',join(dir,'fixture.sqlite')],{input:commands.map(line=>line==='.scanstats on'?'.stats on':line).join('\n')+'\n',encoding:'utf8',maxBuffer:32*1024*1024,windowsHide:true});
      assert.equal(fallback.status,0,'Query '+i+': '+fallback.stderr);
      const vm=Number(fallback.stdout.match(/Virtual Machine Steps:\s+(\d+)/)?.[1]);
      assert.ok(vm>0,'Missing statement counters');
      q.profileError={exitCode:execution.status,stderr:execution.stderr};
      q.scanOutput=fallback.stdout.replace(/\r/g,'');
      q.localFullScanSteps=Number(fallback.stdout.match(/Fullscan Steps:\s+(\d+)/)?.[1]);
      q.localVmSteps=vm;q.localVisits=null;q.estimatedRows=vm+q.fastCountAllowance;
      q.estimationMethod='Coarse local VM-step ceiling + fast-count population, not a measured row count';
      continue;
    }
    assert.doesNotMatch(execution.stderr,/not available|error/i);
    const section=execution.stdout.replace(/\r/g,'');
    q.scanOutput=section;
    q.loops=[...section.matchAll(/^(.+?)\s+(\d+)\s+(\d+)%\s+(\d+)\s+(\d+)\s*$/gm)].map(m=>({access:m[1].trim(),loops:Number(m[4]),visits:Number(m[5])}));
    q.localVisits=q.loops.reduce((sum,l)=>sum+l.visits,0);
    q.indexProbeAllowance=q.loops.filter(l=>/USING INDEX|USING AUTOMATIC.*INDEX/.test(l.access)&&!l.access.includes('COVERING')).reduce((sum,l)=>sum+Math.max(l.visits,l.loops),0);
    q.estimatedRows=q.localVisits+q.indexProbeAllowance+q.fastCountAllowance;
  }
  for(const endpoint of report){
    assert.equal(endpoint.queries[0].localVisits,1,'Unrecognized scanstatus output or missing auth probe: '+endpoint.name);
    endpoint.estimatedRows=endpoint.queries.reduce((sum,q)=>sum+q.estimatedRows,0);endpoint.localVisits=endpoint.queries.some(q=>q.localVisits===null)?null:endpoint.queries.reduce((sum,q)=>sum+q.localVisits,0);console.log(endpoint.name,endpoint.localVisits,endpoint.estimatedRows);
  }
  const version=spawnSync(cli,['--version'],{encoding:'utf8',windowsHide:true}).stdout.trim();
  const storage=spawnSync(cli,['-readonly',join(dir,'fixture.sqlite'),'-json',"SELECT name,SUM(pgsize) bytes,SUM(ncell) cells FROM dbstat WHERE name='admin_reservations_page' GROUP BY name"],{encoding:'utf8',windowsHide:true});
  assert.equal(storage.status,0,storage.stderr);const indexStorage=storage.stdout.trim()?JSON.parse(storage.stdout):[];
  const output=resolve(process.argv[2]||'test-results/admin-budget-profile.json');mkdirSync(resolve(output,'..'),{recursive:true});
  const explicit=await (process.argv.includes('--stage3')?captureDashboardOperation():captureAdminBudgetOperation());
  await backup(runtime.db,join(dir,'explicit.sqlite'));
  const operationStatements=[...explicit.operation,...explicit.receipt];
  const opCommands=['.bail on','.mode off','BEGIN;'];
  operationStatements.forEach((q,i)=>opCommands.push('.print OP_'+i,'.stats on',boundSql(q.sql,q.args)+';','.stats off','.print END_OP_'+i));
  opCommands.push('COMMIT;');
  const opRun=spawnSync(cli,[join(dir,'explicit.sqlite')],{input:opCommands.join('\n')+'\n',encoding:'utf8',maxBuffer:4*1024*1024,windowsHide:true});
  assert.equal(opRun.status,0,opRun.stderr);
  const opText=opRun.stdout.replace(/\r/g,'');
  operationStatements.forEach((q,i)=>{const part=opText.split('OP_'+i+'\n')[1]?.split('END_OP_'+i)[0];
    q.localVmSteps=Number(part?.match(/Virtual Machine Steps:\s+(\d+)/)?.[1]);assert.ok(q.localVmSteps>0);
    q.localFullScanSteps=Number(part.match(/Fullscan Steps:\s+(\d+)/)?.[1]);
    q.estimatedRows=q.localVmSteps;q.estimationMethod='Conservative VM-step ceiling (including trigger programs), not measured rows_read';
  });
  explicit.operationEstimate=explicit.operation.reduce((sum,q)=>sum+q.estimatedRows,0);
  explicit.receiptEstimate=explicit.receipt.reduce((sum,q)=>sum+q.estimatedRows,0);
  writeFileSync(output,JSON.stringify({measurement:'LOCAL SQLite scanstatus, NOT Cloudflare meta.rows_read',version,tableCounts,indexStorage,explicit,report},null,2)+'\n');
  runtime.db.close();console.log('Report:',output);
}finally{
  // Only the unique directory created above, never a repository/user-data path.
  const leaf=relative(resolve(tmpdir()),resolve(dir));
  assert.ok(/^e36-budget-profile-[A-Za-z0-9]+$/.test(leaf)&&!leaf.includes(sep),'Unexpected cleanup target');
  rmSync(dir,{recursive:true,force:true});
}
