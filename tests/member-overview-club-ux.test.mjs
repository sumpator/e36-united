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

test('Member Card has exactly four help-enabled core blocks and the required rating label', () => {
  const stats = [...overview.matchAll(/class="member-card-stat(?: [^"]*)?" data-member-help="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(stats, ['since', 'verified', 'points', 'rating']);
  for (const label of ['UNITED OD', 'OVĚŘENÉ UNITED', 'UNITED POINTS', 'MEMBER RATING']) assert.match(overview, new RegExp(label));
  assert.match(overview, /data-overview-points-fill/);
  assert.match(js, /overviewFill\.style\.width/);
});

test('one reusable micro tutorial supports toggle, outside click, keyboard Escape and focus return', () => {
  assert.equal((html.match(/data-member-help-popover=""/g) || []).length, 1);
  for (const key of ['since', 'verified', 'points', 'rating', 'verification', 'points-system']) assert.ok(js.includes(`${key}:{`) || js.includes(`'${key}':{`), `missing ${key} help content`);
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

test('United Club is organized around Stopa, Points, Milníky and honest Výhody', () => {
  for (const label of ['Moje stopa', 'United Points', 'Milníky', 'Výhody']) assert.match(club, new RegExp(label, 'i'));
  assert.doesNotMatch(club, /Co jsem dokázal|points-ledger|data-points-rules/);
  assert.match(club, /data-earn-strip/);
  assert.match(club, /Proč ověření\?/);
  assert.match(club, /Jak to funguje/);
});

test('Earn Strip states only agreed point values and never invents unavailable photo progress', () => {
  const rewards = js.slice(js.indexOf('function renderRewards()'), js.indexOf('async function commit'));
  assert.match(rewards, /OVĚŘENÝ UNITED/);
  assert.match(rewards, /S&S TOP 3/);
  assert.match(rewards, /\+2 \/ \+1 U/);
  assert.match(rewards, /COMMUNITY FOTKY/);
  assert.match(rewards, /50 \+\$\{rules\.communityBonus\*2\} U/);
  assert.match(rewards, /Maximum 4 U · průběh zatím není dostupný/);
  assert.match(rewards, /3× \/ 5× UNITED/);
  assert.match(rewards, /bez přidělené bodové hodnoty/);
  assert.doesNotMatch(rewards, /apiRequest|fetch\(/);
});

test('mobile Earn Strip exposes a horizontal snap rail with a partial next card', () => {
  assert.match(css, /@media\(max-width:700px\)[\s\S]*?\.earn-strip\{display:flex[^}]*overflow-x:auto[^}]*scroll-snap-type:x mandatory/);
  assert.match(css, /\.earn-card\{flex:0 0 78%[^}]*scroll-snap-align:start/);
});

test('badges are meaningful milestones and future perks do not claim unsupported activation', () => {
  assert.doesNotMatch(js, /id:'garage'|id:'twelve'|Dřívější rezervace|Přednostní ubytování|Komunitní hlasování/);
  assert.match(js, /První United/);
  assert.match(js, /United Regular/);
  assert.match(js, /Veterán United/);
  assert.match(js, /Budoucí výhody se zde objeví až ve chvíli, kdy budou skutečně dostupné/);
});

test('portal preserves the closed registration default while live event state remains API-driven', () => {
  assert.match(js, /let reservationState=\{registrationOpen:false,event:null/);
  assert.doesNotMatch(js.slice(js.indexOf('function renderRewards()'), js.indexOf('async function commit')), /registrationOpen|apiRequest|fetch\(/);
});
