import test from 'node:test';
import assert from 'node:assert/strict';
import { initUnitedAuth } from '../united-auth.js';

const config = { apiKey: 'public-key', projectId: 'e36-united', appId: 'app-id' };

function firebaseMocks(operations) {
  let observer = null;
  let observerError = null;
  const appModule = {
    getApps() { operations.push('getApps'); return []; },
    initializeApp() { operations.push('initializeApp'); return { name: 'app' }; },
  };
  const authModule = {
    browserLocalPersistence: { type: 'LOCAL' },
    getAuth() { operations.push('getAuth'); return { name: 'auth' }; },
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

test('waits for local persistence before deciding authenticated or anonymous state', async () => {
  const operations = [], states = [], mocks = firebaseMocks(operations);
  const controller = initUnitedAuth({ config, importModule: mocks.importModule, onStateChange: state => states.push(state.status) });
  await controller.ready;

  assert.deepEqual(states, ['loading']);
  assert.ok(operations.indexOf('setPersistence') < operations.indexOf('onAuthStateChanged'));

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

for (const stage of ['SDK', 'persistence', 'observer']) test(`stalled ${stage} leaves loading and late work cannot revive the timed-out attempt`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const states=[],operations=[],mocks=firebaseMocks(operations),gate=Promise.withResolvers(),started=Promise.withResolvers();
  const app=await mocks.importModule('firebase-app'),auth=await mocks.importModule('firebase-auth');
  if(stage==='persistence')auth.setPersistence=()=>{started.resolve();return gate.promise};
  const controller=initUnitedAuth({config,timeoutMs:100,importModule:async url=>{if(stage==='SDK'){started.resolve();return gate.promise}return url.includes('firebase-app')?app:auth},onStateChange:state=>states.push(state.status)});
  if(stage==='observer')await controller.ready;else await started.promise;
  t.mock.timers.tick(100);
  assert.equal(states.at(-1),'error');
  assert.equal(controller.state.error.message,'auth_startup_timeout');
  gate.resolve(app);await controller.ready;mocks.emit({uid:'late'});
  assert.equal(states.at(-1),'error');assert.equal(states.includes('authenticated'),false);
  controller.stop();
});

test('unavailable persistent storage falls back to memory without changing the auth decision',async()=>{
 const states=[],operations=[],mocks=firebaseMocks(operations),auth=await mocks.importModule('firebase-auth');
 auth.inMemoryPersistence={type:'NONE'};const selected=[];
 auth.setPersistence=async(_,p)=>{selected.push(p.type);if(p.type==='LOCAL')throw Object.assign(new Error('blocked'),{code:'auth/web-storage-unsupported'})};
 const controller=initUnitedAuth({config,importModule:mocks.importModule,onStateChange:s=>states.push(s.status)});
 await controller.ready;assert.deepEqual(selected,['LOCAL','NONE']);assert.deepEqual(states,['loading']);
 mocks.emit({uid:'member'});assert.equal(states.at(-1),'authenticated');controller.stop();
});
