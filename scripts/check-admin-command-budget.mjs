import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {captureCommandBudget,commandIncrement} from '../tests/helpers/admin-command-budget.mjs';

const profile=JSON.parse(readFileSync(new URL('../docs/admin-command-budget.json',import.meta.url),'utf8'));
const {runtime,report}=await captureCommandBudget();
try {
  assert.equal(runtime.db.prepare('SELECT COUNT(*) n FROM members').get().n,500);
  assert.equal(runtime.db.prepare('SELECT COUNT(*) n FROM reservations').get().n,900);
  for(const actual of report){
    const saved=profile.report.find(row=>row.name===actual.name);
    assert.deepEqual(actual.queries.map(q=>[q.sql,q.args,q.plan]),saved.queries.map(q=>[q.sql,q.args,q.plan]));
    assert.ok(saved.estimatedRows>0);
  }
  assert.equal(runtime.writes,0);
  const scenarios={
    synthetic3x12h:commandIncrement(profile,{memberHours:24,dashboardHours:3,detailHours:6,explicitDetails:96}),
    synthetic3x24h:commandIncrement(profile,{memberHours:48,dashboardHours:6,detailHours:12,explicitDetails:192}),
    dashboardOnly3h:commandIncrement(profile,{dashboardHours:3}),
    memberOnly3h:commandIncrement(profile,{memberHours:3}),
    memberOnly12h:commandIncrement(profile,{memberHours:12}),
    optionalMailingWidgetOneHour:commandIncrement(profile,{optionalMailingHours:1})
  };
  assert.equal(scenarios.synthetic3x12h.withRetries,1393326);
  console.log(JSON.stringify({measurement:profile.measurement,currentSqlAndPlansMatch:true,
    stage2TargetMet:false,stage2AcceptedWithRetries:3904805,scenarios},null,2));
} finally { runtime.db.close(); }
