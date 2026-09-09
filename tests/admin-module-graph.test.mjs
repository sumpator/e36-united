import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ADMIN_RELEASE_TOKEN as token} from '../scripts/check-admin-module-graph.mjs';

const checker=fileURLToPath(new URL('../scripts/check-admin-module-graph.mjs',import.meta.url));
const graph=fixture=>{
  const run=spawnSync(process.execPath,['--no-warnings','--experimental-vm-modules',checker,...(fixture?['--fixture']:[])],{encoding:'utf8',input:fixture?JSON.stringify(fixture):undefined});
  assert.equal(run.error,undefined);assert.equal(run.signal,null);
  const result=JSON.parse(run.stdout);assert.equal(run.status,result.errors.length?1:0,run.stderr);
  return result;
};
const fixture=()=>({'admin.html':`<script type="module" src="admin.js?v=${token}"></script>`,'admin.js':`import './nested.js?v=${token}';`,'nested.js':'export const value=1;'});

test('complete Admin browser graph has one release URL per source, no unversioned edge or cycle',()=>{
  const result=graph();assert.deepEqual(result.errors,[]);assert.deepEqual(result.cycles,[]);
  assert.ok(result.files.includes('admin/destinations.js'));assert.ok(result.files.includes('admin/modules/mailing/delivery.js'));
  assert.ok(result.files.includes('vendor/qrcode-generator.mjs'));
  assert.ok(result.edges.every(e=>e.token===token));
  assert.equal(new Set(result.edges.filter(e=>e.to==='admin/state.js').map(e=>e.specifier.split('?')[1])).size,1);
  assert.equal(result.external.length,2);
  assert.ok(result.files.every(f=>!f.startsWith('worker/')&&!f.startsWith('tests/')));
});
test('graph catches a future side-effect import and follows multiline re-exports',()=>{
  const f=fixture();f['nested.js']=`export {value}\n from './deep.js?v=${token}'; import './new-module.js';`;
  f['deep.js']='export const value=1';f['new-module.js']='';
  const r=graph(f);assert.ok(r.files.includes('deep.js'));assert.ok(r.errors.some(e=>e.includes('./new-module.js')));
});
test('graph rejects mixed state URLs, obsolete versions and extra URL identity components',()=>{
  const f=fixture();f['admin.js']+=`import './nested.js?v=old'; import './nested.js?v=${token}#second';`;
  const r=graph(f);assert.ok(r.errors.some(e=>e.startsWith('Multiple runtime URLs for nested.js')));
  assert.ok(r.errors.some(e=>e.includes('v=old')));assert.ok(r.errors.some(e=>e.includes('#second')));
});
test('HTML entry must match the same current token and inline modules cannot bypass the check',()=>{
  const f=fixture();f['admin.html']='<script src="admin.js?v=old" type="module"></script>';
  assert.ok(graph(f).errors.some(e=>e.includes('admin.html -> admin.js?v=old')));
  f['admin.html']+='<script type="module">import "./unversioned.js"</script>';
  assert.ok(graph(f).errors.some(e=>e.includes('Inline module')));
});
test('parser ignores commented imports, excludes only reviewed Firebase, and does not traverse Node/Worker roots',()=>{
  const f=fixture();f['admin.js']+=`/* import './never.js'; */\nimport 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';`;
  f['worker/index.js']="import './normal-server.js';";f['tests/example.mjs']="import './normal-node.js';";
  assert.deepEqual(graph(f).errors,[]);
  f['admin.js']+="import 'https://unreviewed.invalid/module.js';";
  assert.ok(graph(f).errors.some(e=>e.includes('Unreviewed external')));
});
test('same-origin absolute imports are checked and missing nested modules fail closed',()=>{
  const f=fixture();f['nested.js']=`export * from 'https://e36united.cz/missing.js?v=${token}';`;
  assert.ok(graph(f).errors.some(e=>e.includes('Missing module missing.js')));
  f['missing.js']='';assert.deepEqual(graph(f).errors,[]);
});
