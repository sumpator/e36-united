import test from 'node:test';
import assert from 'node:assert/strict';
import { initUnitedAuth, authDiagnostic, authRecoveryCopy, authPersistenceNotice } from '../united-auth.js';

const config = { apiKey: 'public-key', projectId: 'e36-united', appId: 'app-id' };

function firebaseMocks(operations) {
  let observer = null;
  let observerError = null;
  const appModule = {
    getApps() { operations.push('getApps'); return []; },
    initializeApp() { operations.push('initializeApp'); return { name: 'app' }; },
  };
  const auth = { name:'auth', async authStateReady(){operations.push('authStateReady')}, _getPersistence(){return 'LOCAL'} };
  const authModule = {
    browserLocalPersistence: { type: 'LOCAL' },
    getAuth() { operations.push('getAuth'); return auth; },
    async setPersistence() { operations.push('setPersistence'); },
    onAuthStateChanged(auth, next, error) {
      operations.push('onAuthStateChanged');
      observer = next;
      observerError = error;
      return () => operations.push('unsubscribe');
    },
  };
  const importModule = async url => url.includes('firebase-app') ? appModule : authModule;
  return { importModule, emit: user => observer?.(user), fail: error => observerError?.(error) };
}

test('waits for native SDK restoration before deciding authenticated or anonymous state', async () => {
  const operations = [], states = [], mocks = firebaseMocks(operations);
  const controller = initUnitedAuth({ config, importModule: mocks.importModule, onStateChange: state => states.push(state.status) });
  await controller.ready;

  assert.deepEqual(states, ['loading']);
  assert.ok(operations.indexOf('authStateReady') < operations.indexOf('onAuthStateChanged'));

  mocks.emit(null);
  assert.deepEqual(states, ['loading', 'anonymous']);
  mocks.emit({ uid: 'member-1' });
  assert.deepEqual(states, ['loading', 'anonymous', 'authenticated']);
});

test('keeps loading visible while the Firebase SDK is slow', async () => {
  const states = [];
  let resolveApp, resolveAuth;
  const appPromise = new Promise(resolve => { resolveApp = resolve; });
  const authPromise = new Promise(resolve => { resolveAuth = resolve; });
  const importModule = url => url.includes('firebase-app') ? appPromise : authPromise;
  const controller = initUnitedAuth({ config, importModule, onStateChange: state => states.push(state.status) });

  await Promise.resolve();
  assert.deepEqual(states, ['loading']);

  const operations = [], mocks = firebaseMocks(operations);
  const [appModule, authModule] = await Promise.all([
    mocks.importModule('firebase-app'),
    mocks.importModule('firebase-auth'),
  ]);
  resolveApp(appModule);
  resolveAuth(authModule);
  await controller.ready;
  assert.deepEqual(states, ['loading']);
});

test('SDK failure is recoverable error, never an anonymous decision', async () => {
  const states = [], operations = [];
  const mocks = firebaseMocks(operations);
  let failing = true;
  const importModule = url => failing ? Promise.reject(new Error('offline')) : mocks.importModule(url);
  const controller = initUnitedAuth({ config, importModule, onStateChange: state => states.push(state.status) });

  assert.equal(await controller.ready, null);
  assert.deepEqual(states, ['loading', 'error']);
  assert.ok(!states.includes('anonymous'));

  failing = false;
  await controller.retry();
  assert.deepEqual(states, ['loading', 'error', 'loading']);
  mocks.emit({ uid: 'member-2' });
  assert.equal(states.at(-1), 'authenticated');
});

test('observer errors remain recoverable and do not emit anonymous', async () => {
  const states = [], operations = [], mocks = firebaseMocks(operations);
  const controller = initUnitedAuth({ config, importModule: mocks.importModule, onStateChange: state => states.push(state.status) });
  await controller.ready;
  mocks.fail(new Error('network-request-failed'));
  assert.deepEqual(states, ['loading', 'error']);
});

for (const stage of ['SDK', 'restore', 'observer']) test(`stalled ${stage} leaves loading and late work cannot revive the timed-out attempt`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const states=[],operations=[],mocks=firebaseMocks(operations),gate=Promise.withResolvers(),started=Promise.withResolvers();
  const app=await mocks.importModule('firebase-app'),auth=await mocks.importModule('firebase-auth');
  if(stage==='restore')auth.getAuth().authStateReady=()=>{started.resolve();return gate.promise};
  const controller=initUnitedAuth({config,timeoutMs:100,importModule:async url=>{if(stage==='SDK'){started.resolve();return gate.promise}return url.includes('firebase-app')?app:auth},onStateChange:state=>states.push(state.status)});
  if(stage==='observer')await controller.ready;else await started.promise;
  t.mock.timers.tick(100);
  assert.equal(states.at(-1),'error');
  assert.equal(controller.state.error.message,'auth_startup_timeout');
  gate.resolve(app);await controller.ready;mocks.emit({uid:'late'});
  assert.equal(states.at(-1),'error');assert.equal(states.includes('authenticated'),false);
  controller.stop();
});

for(const [kind,expected] of [['LOCAL','local'],['SESSION','session'],['NONE','memory']])test('native SDK persistence is reported without moving the user: '+kind,async()=>{
 const states=[],operations=[],mocks=firebaseMocks(operations),sdk=await mocks.importModule('firebase-auth');sdk.getAuth()._getPersistence=()=>kind;sdk.setPersistence=()=>{throw Error('Session must not be moved')};
 const controller=initUnitedAuth({config,importModule:mocks.importModule,onStateChange:s=>states.push(s.status)});await controller.ready;assert.equal(controller.context.persistence,expected);mocks.emit({uid:'member'});assert.equal(states.at(-1),'authenticated');controller.stop();
});

test('navigation and benefit controllers never compete to move shared persistence',async()=>{
 const operations=[],mocks=firebaseMocks(operations),sdk=await mocks.importModule('firebase-auth');sdk.setPersistence=()=>{throw Error('No persistence mutation is allowed')};const a=initUnitedAuth({config,importModule:mocks.importModule}),b=initUnitedAuth({config,importModule:mocks.importModule});await Promise.all([a.ready,b.ready]);assert.equal(a.context.auth,b.context.auth);assert.equal(operations.includes('setPersistence'),false);a.stop();b.stop();
});

test('recovery diagnostics exclude raw errors and storage contents',()=>{
 const secret='sensitive-synthetic-marker',state={stage:'restore',context:{persistence:'memory'},error:{code:'auth/network-request-failed',message:secret,customData:{token:secret}}};
 const diagnostic=authDiagnostic(state);assert.equal(diagnostic.code,'auth/network-request-failed');assert.equal(diagnostic.persistence,'memory');assert.equal(JSON.stringify(diagnostic).includes(secret),false);
 assert.equal(authDiagnostic({error:{code:secret,message:secret}}).code,'auth_unavailable');
 assert.match(authRecoveryCopy(state),/neznamená odhlášení/);assert.match(authRecoveryCopy({stage:'sdk'}),/případné blokování/);
 assert.match(authPersistenceNotice('memory'),/jen na této stránce/);assert.match(authPersistenceNotice('session'),/jen pro tento panel/);
 assert.equal(authPersistenceNotice('local'),'');assert.equal(authPersistenceNotice('unknown'),'');
});
