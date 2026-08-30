import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const html = read('member.html');
const js = read('member.js');
const css = read('member.css');
const config = read('firebase-config.js');

function panel(name, nextName) {
  const start = html.indexOf(`data-member-panel="${name}"`);
  const end = nextName ? html.indexOf(`data-member-panel="${nextName}"`, start) : html.length;
  assert.ok(start >= 0 && end > start, `panel ${name} exists`);
  return html.slice(start, end);
}

test('hero keeps identity and onboarding CTA without session controls', () => {
  const hero = html.slice(html.indexOf('data-member-hero='), html.indexOf('<div class="container member-shell">'));
  assert.match(hero, /UNITED MEMBER/);
  assert.match(hero, /data-member-hero-attended/);
  assert.doesNotMatch(hero, /data-logout|member-logged-actions|member-hero-logout/);
  assert.match(js, /cta\.hidden=!view\.cta/);
  assert.match(js, /cta\.hidden=false/);
});

test('mobile auth is compact while desktop auth content and tab behavior remain intact', () => {
  assert.match(html, /auth-copy-desktop">Historie srazů, tvoje auta, rezervace, body a Achievements na jednom místě/);
  assert.match(html, /auth-copy-mobile">Tvůj profil, auta a srazy na jednom místě/);
  for (const proof of ['12 / 12', 'GARAGE', 'ACHIEVEMENTS']) assert.match(html, new RegExp(proof));
  assert.match(html, /BMW E36 COMMUNITY ACCESS/);
  assert.match(css, /\.member-auth\{grid-template-columns:minmax\(0,1\.12fr\) minmax\(430px,\.88fr\)/);
  assert.match(css, /\.member-auth-media\{min-height:680px/);
  assert.match(css, /\.auth-copy-mobile\{display:none\}/);
  assert.match(css, /\.member-auth\{min-height:auto;gap:0;padding:0\}/);
  assert.match(css, /@media\(max-width:620px\)\{[\s\S]*?\.member-auth-media\{min-height:210px/);
  assert.match(css, /auth-visual-kicker>span:last-child,\.auth-proof,\.auth-panel-top,\.auth-panel-intro,\.demo-hint,\.auth-trust-row\{display:none\}/);
  assert.match(css, /\.auth-copy-desktop\{display:none\}\.auth-copy-mobile\{display:inline\}/);
  assert.match(css, /\.auth-tabs button\{min-width:0;min-height:52px/);
  assert.match(css, /\.auth-form input\{min-height:48px/);
  assert.match(js, /\$\$\('\[data-auth-tab\]'\)\.forEach\(btn=>btn\.addEventListener\('click',\(\)=>activateAuthTab\(btn\.dataset\.authTab\)\)\)/);
});

test('Member Card renders real profile identity and meaningful progress data', () => {
  const overview = panel('overview', 'reservation');
  for (const attribute of ['data-summary-name', 'data-summary-member-code', 'data-member-since', 'data-attendance-count', 'data-member-rating', 'data-overview-points']) assert.match(overview, new RegExp(attribute));
  assert.match(overview, /aria-label="United Member Card"/);
  assert.match(overview, /<strong data-summary-name/);
  assert.match(overview, /<span class="member-card-code" data-summary-member-code/);
  assert.doesNotMatch(overview, /data-summary-nickname|MEMBER SUMMARY/);
  assert.match(js, /summaryName\.textContent=p\.name\|\|'United Member'/);
  assert.match(js, /summaryCode\.textContent=p\.memberCode/);
  assert.match(js, /ratingEl\.textContent=data\.club\?\.rating\?\.name\|\|'316i'/);
  assert.match(css, /\.member-card\{display:grid/);
});

test('Garage exposes one shared add/edit form and one profile-photo selector', () => {
  assert.match(js, /data-edit-car/);
  assert.match(js, /openCarModal\(car\)/);
  assert.match(js, /selectedCarPhoto=selection\.files\[0\]\|\|null/);
  assert.match(js, /method:carId\?'PUT':'POST'/);
  assert.equal((html.match(/data-car-form=""/g)||[]).length,1);
  assert.doesNotMatch(html, /Profilová fotka[^<]*max 3|name="photos"[^>]*multiple/);
});

test('Payments are driven only by approved reservation payment data', () => {
  const payments = panel('payments', 'club');
  assert.match(payments, /Aktuálně nemáš žádnou platbu k řešení/);
  assert.match(js, /if\(reservation\.status!==\'approved\'\)/);
  assert.match(js, /ZMĚNA ČEKÁ NA SCHVÁLENÍ/);
  assert.match(js, /QR ani nové platební instrukce teď nejsou dostupné/);
  for (const status of ['not_required', 'unpaid', 'underpaid', 'paid', 'overpaid']) assert.match(js, new RegExp(`${status}:`));
  assert.match(js, /payment\.overdue/);
  assert.match(js, /paymentQrSvg\(payment\.spayd\)/);
  assert.match(js, /!settled&&payment\.status!=='overpaid'/);
  assert.match(js, /data-payment-open/);
});

test('Account renders real profile data, safe existing profile update and relocated logout', () => {
  const account = panel('account');
  for (const attribute of ['data-account-form', 'data-account-email', 'data-account-member-code', 'data-account-since', 'data-account-verification', 'data-logout']) assert.match(account, new RegExp(attribute));
  assert.match(account, /Doručovací adresu bude možné uložit/);
  assert.doesNotMatch(account, /name="address|name="street|name="city/);
  assert.match(js, /apiRequest\('\/api\/bootstrap'/);
  assert.match(js, /data\.profile=normalizeMember/);
});

test('Points Journey reads server totals and no longer exposes writable scoring configuration', () => {
  assert.doesNotMatch(config, /points:|unitedYears|memberLocalPrefix/);
  assert.match(html, /data-points-journey/);
  assert.match(js, /loadUnitedClub\(\)[\s\S]*apiRequest\('\/api\/united-club'\)/);
  assert.match(js, /d\.club\?\.points\?\.available/);
  assert.match(js, /d\.club\?\.points\?\.lifetime/);
  assert.match(js, /data\.club\?\.rewardThreshold/);
  assert.match(js, /data-earn-strip/);
  assert.match(js, /Umístění v Show & Shine/);
  assert.doesNotMatch(js, /portalConfig\.points|history\.reduce\(.*Points|bonuses/);
});

test('readability and motion polish preserve reduced-motion behavior', () => {
  assert.match(css, /member-nav-item b\{font-size:14px/);
  assert.match(css, /member-card-identity strong\{[^}]*font-size:clamp/);
  assert.match(css, /history-year-status small\{font-size:12px/);
  assert.match(css, /achievement-copy p\{[^}]*font-size:12px/);
  assert.match(css, /achievement-card\.is-locked\{opacity:\.72/);
  assert.match(css, /member-payment-copy dd\{font-size:14px/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)[\s\S]*points-journey-track/);
});
