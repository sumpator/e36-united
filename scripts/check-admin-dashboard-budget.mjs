import {readFileSync} from 'node:fs';
import {dashboardBudget} from '../tests/helpers/admin-dashboard-budget.mjs';
const profile=JSON.parse(readFileSync(new URL('../docs/admin-stage3-budget.json',import.meta.url),'utf8'));
const scenarios={normalWeek:dashboardBudget(profile),eventDay10h:dashboardBudget(profile,{hours:10,contexts:2}),eventDay12h:dashboardBudget(profile,{hours:12,contexts:2}),
 synthetic3x12h:dashboardBudget(profile,{hours:36,contexts:3,dashboardFraction:1/12}),synthetic3x24h:dashboardBudget(profile,{hours:72,contexts:3,dashboardFraction:1/12}),allDashboard3x12h:dashboardBudget(profile,{hours:36,contexts:3})};
console.log(JSON.stringify({stage2TargetMet:false,stage2AcceptedWithRetries:3904805,measurement:'LOCAL estimates, NOT Cloudflare meta.rows_read',scenarios},null,2));
