import test from 'node:test';
import assert from 'node:assert/strict';
import {rewardProgress} from '../member/reward-progress.js';
import {getMember} from '../worker/domains/members.js';
import {memberRuntime} from './helpers/admin-member-runtime.mjs';
test('12-point milestones retain achievements while the next cycle restarts',()=>{
 for(const [total,milestones,remaining] of [[0,0,12],[11,0,1],[12,1,12],[22,1,2],[24,2,12],[36,3,12]]){
  const state=rewardProgress(total);assert.equal(state.milestones,milestones);assert.equal(state.remaining,remaining);assert.equal(state.justReached,total>0&&total%12===0);
  assert.equal('availableRewards' in state,false);assert.equal('usedRewards' in state,false);
 }
});
test('account reads only the existing authenticated member QR without provisioning',async()=>{
 const r=memberRuntime();try{
  const token='a'.repeat(48);r.db.prepare('INSERT INTO member_qr_identities(member_id,token) VALUES(?,?)').run('m',token);
  const response=await getMember(r.env,{uid:'m',email:'member@example.invalid',emailVerified:false},'http://localhost');
  const payload=await response.json();assert.equal(payload.member.qrPayload,'E36U1:'+token);assert.equal(payload.member.memberCode,'EU-MEMBER');
  const missing=await (await getMember(r.env,{uid:'n',email:'other@example.invalid',emailVerified:false},'http://localhost')).json();assert.equal(missing.member.qrPayload,null);assert.equal(r.writes,0);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM member_qr_identities').get().n,1);
 }finally{r.db.close()}
});
