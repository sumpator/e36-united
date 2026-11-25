import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const args=process.argv.slice(2);
const run=(specs,grep)=>spawnSync('pnpm',['exec','playwright','test',...specs,'--grep',grep,'--reporter=line',...args],{stdio:'inherit'}).status;
const main=readFileSync('main.js');
const spec='public-planner-stability.spec.mjs';
try {
  writeFileSync('main.js',readFileSync('tests/e2e/probe-original-main.js'));
  console.log('BASELINE 86f1407');
  console.log('Baseline probe exit code',run([spec],'mobile cabin selection at the Planner fragment'));
}finally {writeFileSync('main.js',main)}
console.log('CANDIDATE');
process.exitCode=run([spec,'auth-continuity.spec.mjs','event-stay-handoff.spec.mjs'],'mobile cabin selection at the Planner fragment|keeps accommodation control and viewport|PUBLIC NAV delayed|public planner to approval and mail: friday_only')??1;
