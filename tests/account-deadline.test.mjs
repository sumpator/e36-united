import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountAttempt} from '../member/session.js';
import {createMemberApiClient} from '../member/api.js';

test('one account budget reports slow at five seconds and expires all stages at ten',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 const events=[],first=Promise.withResolvers();
 const attempt=createAccountAttempt({onSlow:()=>events.push('slow'),onTimeout:()=>events.push('expired')});
 const stage=attempt.wait(first.promise);t.mock.timers.tick(5000);assert.deepEqual(events,['slow']);
 first.resolve('sdk');assert.equal(await stage,'sdk');
 const profile=attempt.wait(new Promise(()=>{}));const rejected=assert.rejects(profile,/account_load_timeout/);
 t.mock.timers.tick(5000);await rejected;assert.deepEqual(events,['slow','expired']);assert.equal(attempt.active,false);
 await assert.rejects(attempt.wait(Promise.resolve('late')),/account_load_timeout/);
 const next=createAccountAttempt();assert.equal(await next.wait('new'),'new');next.finish();t.mock.timers.tick(10000);assert.deepEqual(events,['slow','expired']);
});

test('API token, read retry and response body consume one request budget',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
 const token=Promise.withResolvers(),readStarted=Promise.withResolvers(),body=Promise.withResolvers();let calls=0;
 const user={getIdToken:()=>token.promise};
 const api=createMemberApiClient({baseUrl:'https://local.test',getCurrentUser:()=>user,fetchRequest:async()=>{calls++;readStarted.resolve();return {ok:true,status:200,text:()=>body.promise}}});
 const pending=api.request('/api/me',{deadlineAt:11000});const rejected=assert.rejects(pending,/api_network_error/);
 t.mock.timers.tick(6000);token.resolve('isolated');await readStarted.promise;
 t.mock.timers.tick(4000);await rejected;assert.equal(calls,1);body.resolve('{"private":"late"}');
});
