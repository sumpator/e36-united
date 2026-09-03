import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../member.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../member.css', import.meta.url), 'utf8');
const memberEntryJs = readFileSync(new URL('../member.js', import.meta.url), 'utf8');
const plannerJs = readFileSync(new URL('../member/modules/planner/index.js', import.meta.url), 'utf8');
const js = [
  memberEntryJs,
  readFileSync(new URL('../member/shell.js', import.meta.url), 'utf8'),
  readFileSync(new URL('../member/modules/overview.js', import.meta.url), 'utf8'),
].join('\n');
const overview = html.slice(html.indexOf('data-member-panel="overview"'), html.indexOf('data-member-panel="reservation"'));
const club = html.slice(html.indexOf('data-member-panel="club"'), html.indexOf('data-member-panel="photos"'));

test('authenticated hero remains dominant and nickname-led while the Member Card uses real identity', () => {
  assert.match(html, /<h1>Ahoj, <span data-member-nickname/);
  assert.match(html, /data-member-hero-media/);
  assert.match(overview, /aria-label="United Member Card"/);
  assert.match(overview, /member-card-identity[\s\S]*data-summary-name[\s\S]*data-summary-member-code/);
  assert.doesNotMatch(overview, /data-summary-nickname/);
});

test('Member Card keeps four centered core blocks and uses Czech Points terminology', () => {
  const stats = [...overview.matchAll(/class="member-card-stat(?: [^"]*)?" data-member-help="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(stats, ['since', 'verified', 'points', 'rating']);
  for (const label of ['UNITED OD', 'OVĚŘENÉ UNITED', 'UNITED POINTS', 'MEMBER RATING']) assert.match(overview, new RegExp(label));
  assert.match(overview, /data-overview-points="">0<\/b><em>\/ 12 bodů<\/em>/);
  assert.doesNotMatch(overview, /\/ 12 U/);
  assert.match(overview, /data-overview-points-fill/);
  assert.match(js, /overviewFill\.style\.width/);
  assert.match(css, /\.member-card-stat\{[^}]*align-items:center[^}]*text-align:center/);
  assert.match(css, /\.member-card-stat>small\{[^}]*justify-content:center[^}]*text-align:center/);
  assert.match(css, /\.member-card-points\{[^}]*justify-content:center/);
});

test('Member Card has a readable bottom server-featured Achievements strip with no ID-side chip', () => {
  assert.match(overview, /member-card-achievements[\s\S]*>ACHIEVEMENTS<[\s\S]*data-featured-achievements/);
  assert.doesNotMatch(overview, /data-identity-markers|member-identity-marker/);
  assert.match(css, /\.member-card-achievements\{grid-column:1\/-1[^}]*min-height:68px/);
  assert.match(css, /\.featured-achievement b\{[^}]*font-size:11px/);
  assert.match(js, /featuredAchievements[\s\S]*slice\(0,4\)/);
});

test('one reusable micro tutorial supports dynamic earning help, outside click, Escape and focus return', () => {
  assert.equal((html.match(/data-member-help-popover=""/g) || []).length, 1);
  for (const key of ['since', 'verified', 'points', 'rating', 'verification', 'points-system', 'earn-attendance', 'earn-showshine', 'earn-photos', 'earn-profile']) assert.ok(js.includes(`${key}:{`) || js.includes(`'${key}':{`), `missing ${key} help content`);
  assert.match(js, /event\.target\.closest\('\[data-member-help\]'\)/);
  assert.match(js, /event\.key==='Escape'/);
  assert.match(js, /restoreFocus:true/);
  assert.match(js, /aria-expanded','false'/);
  assert.match(js, /memberHelpPopover\.contains\(event\.target\)/);
});

test('idle Action Center is compact while active reservation and Planner content remain present', () => {
  assert.match(overview, /Všechno ready\.[\s\S]*Nemáš nic k vyřešení\./);
  assert.match(css, /\.action-center-empty\{min-height:64px/);
  assert.match(overview, /data-reservation-overview-card/);
  assert.match(html, /data-planner-handoff/);
});

test('United Club is one vertical Points, Stopa and Achievements page', () => {
  for (const label of ['UNITED POINTS', 'MOJE STOPA V UNITED', 'ACHIEVEMENTS']) assert.match(club, new RegExp(label, 'i'));
  assert.ok(club.indexOf('data-club-anchor="points"') < club.indexOf('data-club-anchor="history"'));
  assert.ok(club.indexOf('data-club-anchor="history"') < club.indexOf('data-club-anchor="achievements"'));
  assert.doesNotMatch(club, /data-club-tab|data-club-panel|MILNÍKY|VÝHODY|data-perks-list/);
  assert.match(club, /data-earn-strip/);
  assert.match(club, /Proč ověření\?/);
});

test('United Points Command Panel consolidates the meter and Merch reward', () => {
  assert.match(club, /points-command-panel[\s\S]*data-points-journey/);
  assert.match(club, /<span data-points-journey-score="">0<\/span> <em>\/ 12 bodů<\/em>/);
  assert.match(club, /12 bodů odemyká United Merch reward/);
  assert.match(club, /data-points-reward-state/);
  assert.doesNotMatch(club, /United Merch unlock|reward-main|data-reward-lock/);
});

test('Earn Strip keeps only four activity names and moves exact rules into help', () => {
  const rewards = memberEntryJs.slice(memberEntryJs.indexOf('function renderRewards()'), memberEntryJs.indexOf('bindGarage();'));
  for (const label of ['Účast na srazu','Umístění v Show & Shine','Nahrávání fotek','Doplnění profilu']) assert.match(rewards,new RegExp(label));
  assert.doesNotMatch(rewards,/\+1|\+2|\+3|25 schválených|50 schválených/);
  assert.match(js, /Každý ověřený sraz','\+1 bod'[\s\S]*3 ověřené srazy','\+3 body navíc'[\s\S]*5 ověřených srazů','\+3 body navíc'/);
  assert.match(js, /5 schválených fotek','\+1 bod'[\s\S]*25 schválených fotek','\+1 bod'[\s\S]*50 schválených fotek','\+3 body'/);
  assert.match(js, /Newsletter není podmínkou/);
});

test('mobile Earn Strip is a compact horizontal snap rail', () => {
  assert.match(css, /@media\(max-width:700px\)[\s\S]*?\.points-command-panel \.earn-strip\{[^}]*padding-inline:15px/);
  assert.match(css, /\.points-command-panel \.earn-card\{flex:0 0 min\(84%,270px\)[^}]*min-height:104px/);
  assert.match(css, /scroll-snap-type:x mandatory/);
});

test('Achievements render only authoritative server data with anchored desktop and mobile detail UX', () => {
  assert.match(js, /data\.club\?\.achievements/);
  assert.match(js, /data\.club\?\.featuredAchievements/);
  assert.doesNotMatch(js, /const achievementDefs=/);
  assert.match(club, /data-achievement-catalog/);
  assert.match(html, /data-achievement-popover/);
  assert.match(js, /getBoundingClientRect\(\)/);
  assert.match(css, /left:var\(--context-left\)!important[\s\S]*top:var\(--context-top\)!important/);
  assert.match(css, /@media\(max-width:700px\)[\s\S]*\.contextual-popover\.is-mobile-sheet\{left:10px!important[\s\S]*bottom:10px!important/);
});

test('portal preserves closed registration while Club state is loaded from the server', () => {
  assert.match(plannerJs, /let reservationState=\{registrationOpen:false,event:null/);
  assert.match(js, /apiRequest\('\/api\/united-club'\)/);
  assert.match(js, /points\(d=data\)\{return Number\(d\.club\?\.points\?\.available/);
  assert.doesNotMatch(js, /d\.history\.reduce|d\.bonuses|portalConfig\.points/);
});
