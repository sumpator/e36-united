import test from 'node:test';
import assert from 'node:assert/strict';
import { performMemberLogout } from '../member-logout.js';

test('successful Firebase signOut transitions member state to anonymous',async()=>{
  const state={authenticated:true,menuOpen:true,resets:0,feedback:''};
  const result=await performMemberLogout({
    signOut:async()=>{},
    onSuccess:()=>{state.authenticated=false;state.menuOpen=false;state.resets+=1;state.feedback='Odhlášeno.'},
    onFailure:()=>{state.feedback='failure'},
  });
  assert.equal(result,true);
  assert.deepEqual(state,{authenticated:false,menuOpen:false,resets:1,feedback:'Odhlášeno.'});
});

test('failed Firebase signOut keeps authenticated member state and reports recoverable feedback',async()=>{
  const state={authenticated:true,menuOpen:true,resets:0,feedback:''};
  const failure=new Error('network-request-failed');
  const result=await performMemberLogout({
    signOut:async()=>{throw failure},
    onSuccess:()=>{state.authenticated=false;state.resets+=1},
    onFailure:error=>{assert.equal(error,failure);state.feedback='retry'},
  });
  assert.equal(result,false);
  assert.deepEqual(state,{authenticated:true,menuOpen:true,resets:0,feedback:'retry'});
});
