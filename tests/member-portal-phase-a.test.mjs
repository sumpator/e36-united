import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const memberHtml = read('member.html');
const memberJs = read('member.js');
const memberStateJs = read('member-portal-state.js');
const memberCss = read('member.css');
const portalNavigationJs = read('portal-navigation.js');
const merchHtml = read('merch.html');
const merchJs = read('merch.js');
const galleryHtml = read('galerie.html');
const galleryJs = read('gallery.js');
const authStatesCss = read('auth-states.css');

test('Phase A.1 main navigation contains seven real destinations in target order', () => {
  const sidebar = memberHtml.slice(memberHtml.indexOf('<aside class="member-sidebar"'), memberHtml.indexOf('</aside>'));
  const labels = [...sidebar.matchAll(/<b>([^<]+)<\/b>/g)].map(match => match[1].replace('&amp;', '&'));
  assert.deepEqual(labels, ['Přehled', 'Sraz & Ubytování', 'Garáž', 'Platby', 'United Merch', 'United Club', 'Účet']);
  for (const panel of ['overview', 'reservation', 'garage', 'payments', 'club', 'account']) assert.match(memberHtml, new RegExp(`data-member-panel="${panel}"`));
});

test('initial auth markup is loading, not anonymous', () => {
  assert.match(memberHtml, /data-auth-status-view/);
  assert.match(memberHtml, /data-auth-view="" hidden/);
  assert.match(memberHtml, /data-app-view="" hidden/);
  assert.match(merchHtml, /data-benefit-state="loading"/);
  assert.match(merchHtml, /data-benefit-anonymous hidden/);
  assert.match(galleryJs, /setAuthState\('loading'\)/);
});

test('all public member-aware pages use the shared auth bootstrap', () => {
  for (const source of [memberJs, merchJs, galleryJs]) assert.match(source, /initUnitedAuth/);
  for (const source of [merchHtml, galleryHtml]) assert.match(source, /auth-states\.css\?v=20260825-phase-a1/);
  assert.match(authStatesCss, /gallery-auth-state/);
  assert.match(authStatesCss, /member-benefit-loading\[hidden\].*display:none!important/);
  assert.match(authStatesCss, /data-benefit-retry\]\[hidden\].*display:none!important/);
  assert.doesNotMatch(merchJs, /catch\([^)]*\)\{renderAnonymous/);
  assert.doesNotMatch(galleryJs, /catch\([^)]*\)\{[^}]*setAuthState\(\)/);
});

test('login profile failure cannot automatically sign out an authenticated Firebase user', () => {
  const loginStart = memberJs.indexOf(`$('[data-auth-form="login"]')`);
  const registerStart = memberJs.indexOf(`$('[data-auth-form="register"]')`);
  const loginFlow = memberJs.slice(loginStart, registerStart);
  assert.ok(loginStart >= 0 && registerStart > loginStart);
  assert.doesNotMatch(loginFlow, /signOut/);
  assert.match(loginFlow, /restoreAuthenticatedSession/);
});

test('overview is an action center with no static Merch or Club promo cards', () => {
  const overview = memberHtml.slice(memberHtml.indexOf('data-member-panel="overview"'), memberHtml.indexOf('data-member-panel="reservation"'));
  assert.match(overview, /ACTION CENTER/);
  assert.match(overview, /Všechno ready/);
  assert.match(overview, /data-reservation-overview-card="" hidden/);
  assert.doesNotMatch(overview, /United Merch|badges-preview|points-card/);
  assert.match(memberJs, /deriveOverviewState/);
});

test('hero follows primary car and the authorized private-photo path', () => {
  assert.match(memberHtml, /data-member-hero/);
  assert.match(memberJs, /data\.cars\.find\(car=>car\.primary\)\|\|data\.cars\[0\]/);
  assert.match(memberJs, /getPrivateCarPhotoUrl\(photoId\)/);
  assert.match(memberJs, /URL\.revokeObjectURL/);
  assert.match(memberJs, /carPhotoRequestGeneration/);
  assert.match(memberJs, /stale_car_photo_request/);
  assert.match(memberStateJs, /Přidat fotku auta/);
  assert.match(memberStateJs, /Přidat první auto/);
});

test('community submissions stay available without being presented as car photos', () => {
  const club = memberHtml.slice(memberHtml.indexOf('data-member-panel="club"'), memberHtml.indexOf('</section>', memberHtml.indexOf('data-member-panel="club"')));
  assert.match(club, /data-club-tab="photos"/);
  assert.match(club, /fotky z United/i);
  assert.match(memberJs, /api\/gallery\/submissions/);
});

test('responsive hero and hybrid mobile navigation invariants remain explicit', () => {
  assert.match(memberCss, /Member Portal Phase A\.1/);
  assert.match(memberCss, /member-logged-hero[^}]*min-height:340px/);
  assert.match(memberCss, /@media\(max-width:1050px\)[\s\S]*min-height:290px/);
  assert.match(memberCss, /@media\(max-width:700px\)[\s\S]*min-height:270px/);
  assert.match(memberCss, /overflow-wrap:anywhere/);
  assert.match(memberCss, /object-fit:cover/);
  assert.match(portalNavigationJs, /scrollIntoView/);
  assert.match(portalNavigationJs, /event\.key === 'Escape'/);
  assert.match(portalNavigationJs, /event\.key !== 'Tab'/);
  assert.match(portalNavigationJs, /portal-sheet-open/);
  assert.match(portalNavigationJs, /returnFocus\?\.focus/);
});
