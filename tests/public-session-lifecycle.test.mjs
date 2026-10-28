import test from 'node:test';
import assert from 'node:assert/strict';
import { initPublicMemberState } from '../public-member-state.js';

for (const stage of ['token', 'response', 'body']) test(`public session ${stage} stalls end truthfully without losing authentication`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const states=[],gate=Promise.withResolvers(),started=Promise.withResolvers();let notify;
  const user={getIdToken:()=>{if(stage==='token'){started.resolve();return gate.promise}return Promise.resolve('test')}};
  const controller=initPublicMemberState({config:{},apiBaseUrl:'https://local.test',timeoutMs:100,
    authFactory:options=>{notify=options.onStateChange;return{stop(){}}},onStateChange:s=>states.push(s),
    fetchImpl:async()=>{if(stage==='response'){started.resolve();return gate.promise}return{ok:true,json:()=>{started.resolve();return gate.promise}}}});
  notify({status:'authenticated',user});
  await started.promise;
  t.mock.timers.tick(100);
  await Promise.resolve();await Promise.resolve();
  assert.equal(states.at(-1).status,'error');assert.equal(states.at(-1).authenticated,true);
  notify({status:'anonymous'});gate.resolve({hasReservation:true});
  await Promise.resolve();await Promise.resolve();
  assert.equal(states.at(-1).status,'anonymous');controller.stop();
});
