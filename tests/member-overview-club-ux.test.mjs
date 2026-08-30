import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../member.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../member.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../member.js', import.meta.url), 'utf8');
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

test('Member Card has a readable bottom Featured Achievements strip with no ID-side chip', () => {
  assert.match(overview, /member-card-achievements[\s\S]*FEATURED ACHIEVEMENTS[\s\S]*data-featured-achievements/);
  assert.doesNotMatch(overview, /data-identity-markers|member-identity-marker/);
  assert.match(css, /\.member-card-achievements\{grid-column:1\/-1[^}]*min-height:68px/);
  assert.match(css, /\.featured-achievement b\{[^}]*font-size:11px/);
  assert.match(js, /unlocked\.slice\(0,4\)/);
});

test('one reusable micro tutorial supports dynamic earning help, outside click, Escape and focus return', () => {
  assert.equal((html.match(/data-member-help-popover=""/g) || []).length, 1);
  for (const key of ['since', 'verified', 'points', 'rating', 'verification', 'points-system', 'earn-attendance', 'earn-showshine', 'earn-photos', 'earn-achievements']) assert.ok(js.includes(`${key}:{`) || js.includes(`'${key}':{`), `missing ${key} help content`);
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

test('Earn Strip states exact agreed rules and never invents photo progress', () => {
  const rewards = js.slice(js.indexOf('function renderRewards()'), js.indexOf('async function commit'));
  assert.match(rewards, /OVĚŘENÝ UNITED/);
  assert.match(rewards, /pointWord\(rules\.attendance\)/);
  assert.match(rewards, /S&S TOP 3/);
  assert.match(rewards, /1\. \+\$\{rules\.showShineWin\} · 2\. \+2 · 3\. \+1/);
  assert.match(rewards, /COMMUNITY FOTKY/);
  assert.match(rewards, /5 \+\$\{rules\.communityBonus\} · 20 \+\$\{rules\.communityBonus\} · 50 \+\$\{rules\.communityBonus\*2\}/);
  assert.match(js, /5 schválených fotek = \+1 bod[\s\S]*20 schválených fotek = \+1 bod[\s\S]*50 schválených fotek = \+2 body[\s\S]*Nad 50/);
  assert.match(js, /1\. místo = \+3 body[\s\S]*2\. místo = \+2 body[\s\S]*3\. místo = \+1 bod/);
  assert.doesNotMatch(rewards, /approvedPhoto|photoCount|apiRequest|fetch\(/);
});

test('mobile Earn Strip is a compact horizontal snap rail', () => {
  assert.match(css, /@media\(max-width:700px\)[\s\S]*?\.points-command-panel \.earn-strip\{[^}]*padding-inline:15px/);
  assert.match(css, /\.points-command-panel \.earn-card\{flex:0 0 min\(84%,270px\)[^}]*min-height:104px/);
  assert.match(css, /scroll-snap-type:x mandatory/);
});

test('Achievements unify identity and milestones using only reliable frontend data', () => {
  const achievements = js.slice(js.indexOf('const achievementDefs='), js.indexOf('function attended'));
  assert.match(achievements, /name:'Old School'[\s\S]*memberSince\(d\)[\s\S]*<=2022/);
  assert.match(achievements, /name:'Veterán'[\s\S]*3 nebo více ověřených účastí[\s\S]*verified\(d\)>=3/);
  assert.match(achievements, /name:'S&S vítěz'[\s\S]*h\.verified&&h\.winner/);
  assert.match(achievements, /name:'BMW Prospekt'[\s\S]*25 schválených komunitních fotek[\s\S]*deferred:true/);
  assert.doesNotMatch(achievements, /id:'garage'|Dřívější rezervace|formulář/);
  assert.match(club, /data-achievement-catalog/);
  assert.match(css, /\.achievement-card\.is-locked\{opacity:\.72/);
});

test('portal preserves the closed registration default while Club rendering remains frontend-only', () => {
  assert.match(js, /let reservationState=\{registrationOpen:false,event:null/);
  assert.doesNotMatch(js.slice(js.indexOf('function renderRewards()'), js.indexOf('async function commit')), /registrationOpen|apiRequest|fetch\(/);
});
