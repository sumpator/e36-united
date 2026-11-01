import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyImpact,isTextOnlyHtmlChange} from '../scripts/ci-impact.mjs';
test('CI impact requires explicit reviewed cosmetic intent and a bounded set of paths',()=>{
  assert.equal(classifyImpact(['styles.css'],'fix(ui): behavior'),'functional');
  assert.equal(classifyImpact(['styles.css','assets/images/a.webp'],'style\n\nCI-Impact: cosmetic'),'cosmetic');
  for(const path of ['main.js','index.html','tests/e2e/a.spec.mjs','.github/workflows/ci.yml','worker/index.js','assets/icon.svg','unknown'])assert.equal(classifyImpact([path],'CI-Impact: cosmetic'),'functional',path);
  assert.equal(classifyImpact([],'CI-Impact: cosmetic'),'functional');
});
test('reviewed HTML copy may be cosmetic; markup, events and inline scripts remain functional',()=>{
 const before='<h1 class="title">Before</h1><script>start()</script>';
 assert.equal(isTextOnlyHtmlChange(before,before.replace('Before','After')),true);
 for(const after of [before.replace('title','other'),before.replace('<h1','<h1 onclick="go()"'),before.replace('start()','stop()')])assert.equal(isTextOnlyHtmlChange(before,after),false);
 assert.equal(classifyImpact(['index.html'],'CI-Impact: cosmetic',{textOnlyHtml:['index.html']}),'cosmetic');
 assert.equal(classifyImpact(['index.html'],'functional',{textOnlyHtml:['index.html']}),'functional');
});
