import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {adminGrowth} from '../tests/helpers/admin-growth.mjs';
import {requireAdmin} from '../worker/auth/admin.js';
import {routeAdminMailing} from '../worker/domains/mailing/index.js';
const expected=JSON.parse(readFileSync(new URL('../docs/admin-mailing-widget-cost.json',import.meta.url),'utf8'));
const r=adminGrowth(),url=new URL('https://example.invalid/api/admin/mailing/overview'),env={...r.env,ADMIN_READ:true};
const originalFetch=globalThis.fetch;
try {
  globalThis.fetch=()=>{throw Error('Provider/network access forbidden in this local diagnostic');};
  const before=r.db.prepare('SELECT total_changes() n').get().n;r.queries.length=0;
  await requireAdmin(env,{uid:'a'});
  const response=await routeAdminMailing({request:new Request(url),env,url,auth:{uid:'a'},origin:url.origin});
  assert.equal(response.status,200);await response.json();
  assert.equal(r.db.prepare('SELECT total_changes() n').get().n,before);
  assert.equal(r.writes,0);assert.equal(r.queries.length,3);
  const current=r.queries.map(q=>({sql:q.sql,args:q.args,plan:r.db.prepare('EXPLAIN QUERY PLAN '+q.sql).all(...q.args).map(p=>p.detail)}));
  assert.deepEqual(current,expected.queries.map(({sql,args,plan})=>({sql,args,plan})));
  const population={members:r.db.prepare('SELECT COUNT(*) n FROM members').get().n,reservations:r.db.prepare('SELECT COUNT(*) n FROM reservations').get().n,contacts:r.db.prepare('SELECT COUNT(*) n FROM mailing_contacts').get().n};
  assert.deepEqual(population,expected.population);assert.equal(population.members,500);assert.equal(population.reservations,900);
  console.log(JSON.stringify({currentSqlAndPlansMatch:true,queriesPerRead:3,providerCalls:0,writes:0,localFullScanSteps:expected.queries[1].localFullScanSteps,localVmSteps:expected.queries[1].localVmSteps,coarseHourlyCeilingWithReserve:Math.ceil(expected.estimatedCeiling*12*1.1),actualCloudflareRowsRead:null}));
} finally {globalThis.fetch=originalFetch;r.db.close();}
