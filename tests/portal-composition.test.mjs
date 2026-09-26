import test from 'node:test';
import assert from 'node:assert/strict';
import {rewardProgress,pointWord,milestoneLabel} from '../member/reward-progress.js';
import {normalizeMemberBenefit} from '../merch.js';
test('Club and public Merch share unbounded totals and next twelve-point milestone',()=>{
 for(const [total,cycles,left] of [[0,0,12],[11,0,1],[12,1,12],[22,1,2],[24,2,12],[36,3,12],[121,10,11]]){
  const state=rewardProgress(total),shop=normalizeMemberBenefit({points:{available:total}});
  assert.equal(state.total,total);assert.equal(state.milestones,cycles);assert.equal(state.remaining,left);
  assert.equal(shop.meter,state.cycle);assert.equal(shop.remaining,left);assert.equal(shop.available,total);
  assert.equal(state.justReached,total>0&&total%12===0);assert.equal('availableRewards' in state,false);
 }
 assert.equal(pointWord(1),'bod');assert.equal(pointWord(2),'body');assert.equal(pointWord(12),'bodů');
 assert.equal(milestoneLabel(1),'dosažený milník');assert.equal(milestoneLabel(2),'dosažené milníky');assert.equal(milestoneLabel(10),'dosažených milníků');
});
