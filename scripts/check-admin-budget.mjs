import {readFileSync} from 'node:fs';
import {budgetClosure} from '../tests/helpers/admin-budget-scenario.mjs';
const input=process.argv[2]||'docs/admin-budget-after.json';
const model=budgetClosure(JSON.parse(readFileSync(input,'utf8')));
console.log(JSON.stringify(model,null,2));
// A failed acceptance condition is intentionally a nonzero diagnostic result.
if(!model.targetMet)process.exitCode=1;
