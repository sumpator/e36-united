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

test('main navigation contains exactly seven internal panels in target order', () => {
  const sidebar = memberHtml.slice(memberHtml.indexOf('<aside class="member-sidebar"'), memberHtml.indexOf('</aside>'));
  const labels = [...sidebar.matchAll(/data-member-section="[^"]+"[^>]*>[\s\S]*?<b>([^<]+)<\/b>/g)].map(match => match[1].replace('&amp;', '&'));
  assert.deepEqual(labels, ['Přehled', 'Sraz & Ubytování', 'Garáž', 'Platby', 'United Club', 'Moje fotky', 'Účet']);
  for (const panel of ['overview', 'reservation', 'garage', 'payments', 'club', 'photos', 'account']) assert.match(memberHtml, new RegExp(`data-member-panel="${panel}"`));
});

test('United Merch is a separated external destination, never an internal panel', () => {
  const sidebar = memberHtml.slice(memberHtml.indexOf('<aside class="member-sidebar"'), memberHtml.indexOf('</aside>'));
  const sheet = memberHtml.slice(memberHtml.indexOf('<nav aria-label="Všechny sekce Můj United"'), memberHtml.indexOf('</nav>', memberHtml.indexOf('<nav aria-label="Všechny sekce Můj United"')));
  assert.match(sidebar, /member-nav-external member-nav-shop" href="merch\.html"><b>United Merch<\/b>/);
  assert.doesNotMatch(sidebar, /member-nav-external[^>]*>[\s\S]*?<span>\d{2}<\/span>/);
  assert.doesNotMatch(memberHtml, /data-member-panel="merch"/);
  assert.match(sheet, /portal-nav-sheet-divider/);
  assert.match(sheet, /portal-nav-sheet-external" href="merch\.html"><b>United Merch ↗<\/b>/);
  assert.match(memberCss, /@media\(max-width:1050px\)[^\n]*member-portal-nav \.member-nav-external\{display:none\}/);
});

test('mobile menu sheet keeps internal 01–07 before its Merch divider', () => {
  const start = memberHtml.indexOf('<nav aria-label="Všechny sekce Můj United"');
  const sheet = memberHtml.slice(start, memberHtml.indexOf('</nav>', start));
  const divider = sheet.indexOf('portal-nav-sheet-divider');
  const internal = sheet.slice(0, divider);
  const labels = [...internal.matchAll(/data-portal-target="[^"]+"[^>]*>[\s\S]*?<b>([^<]+)<\/b>/g)].map(match => match[1].replace('&amp;', '&'));
  assert.deepEqual(labels, ['Přehled', 'Sraz & Ubytování', 'Garáž', 'Platby', 'United Club', 'Moje fotky', 'Účet']);
  assert.ok(divider > 0 && sheet.indexOf('United Merch ↗') > divider);
});

test('mobile menu adds unnumbered logout after Merch and reuses the shared logout function', () => {
  const start = memberHtml.indexOf('<nav aria-label="Všechny sekce Můj United"');
  const sheet = memberHtml.slice(start, memberHtml.indexOf('</nav>', start));
  const merch = sheet.indexOf('United Merch ↗'), secondDivider = sheet.indexOf('portal-nav-sheet-divider', sheet.indexOf('portal-nav-sheet-divider') + 1), logout = sheet.indexOf('portal-nav-sheet-logout');
  assert.ok(merch > 0 && secondDivider > merch && logout > secondDivider);
  assert.doesNotMatch(sheet.slice(logout), /<span>\d{2}<\/span>/);
  assert.match(memberJs, /async function logoutMember\(\)/);
  assert.match(memberJs, /performMemberLogout/);
  assert.match(memberJs, /onSuccess:\(\)=>\{memberPortalNavigation\?\.close/);
  assert.match(memberJs, /Tvoje přihlášení zůstalo aktivní/);
  assert.match(memberJs, /\$\$\('\[data-logout\]'\)\.forEach\(button=>button\.addEventListener\('click',logoutMember\)\)/);
});

test('desktop hero, mobile menu and Account expose shared logout outside the sidebar', () => {
  const heroStart = memberHtml.indexOf('data-member-hero=');
  const hero = memberHtml.slice(heroStart, memberHtml.indexOf('<div class="container member-shell">', heroStart));
  const sidebarStart = memberHtml.indexOf('<aside class="member-sidebar"');
  const sidebar = memberHtml.slice(sidebarStart, memberHtml.indexOf('</aside>', sidebarStart));
  const account = memberHtml.slice(memberHtml.indexOf('data-member-panel="account"'));
  assert.match(hero, /member-logged-actions member-logged-actions--desktop[^>]*>[\s\S]*?data-logout=""/);
  assert.doesNotMatch(sidebar, /data-logout/);
  assert.match(account, /account-logout" data-logout=""/);
  assert.equal((memberHtml.match(/data-logout=""/g)||[]).length,3);
  assert.match(memberJs, /\$\$\('\[data-logout\]'\)\.forEach\(button=>button\.addEventListener\('click',logoutMember\)\)/);
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

test('community submissions keep the existing flow in their own main panel', () => {
  const club = memberHtml.slice(memberHtml.indexOf('data-member-panel="club"'), memberHtml.indexOf('</section>', memberHtml.indexOf('data-member-panel="club"')));
  const photos = memberHtml.slice(memberHtml.indexOf('data-member-panel="photos"'), memberHtml.indexOf('data-member-panel="account"'));
  assert.doesNotMatch(club, /Moje fotky|data-club-tab="photos"|data-member-gallery-form/);
  assert.match(photos, /data-member-gallery-form/);
  assert.match(photos, /fotky z United/i);
  assert.match(memberJs, /api\/gallery\/submissions/);
});

test('United Club keeps four desktop tabs and becomes one vertical mobile page', () => {
  const clubStart = memberHtml.indexOf('data-member-panel="club"');
  const club = memberHtml.slice(clubStart, memberHtml.indexOf('data-member-panel="photos"', clubStart));
  const tabs = [...club.matchAll(/data-club-tab="([^"]+)"[^>]*>([^<]+)<\/button>/g)].map(match => [match[1], match[2]]);
  assert.deepEqual(tabs, [['history', 'Historie'], ['points', 'Points'], ['badges', 'Badges'], ['perks', 'Perks']]);
  assert.ok(club.indexOf('data-club-panel="history"') < club.indexOf('data-club-anchor="points"'));
  assert.ok(club.indexOf('data-club-anchor="points"') < club.indexOf('data-club-anchor="badges"'));
  assert.ok(club.indexOf('data-club-anchor="badges"') < club.indexOf('data-club-anchor="perks"'));
  assert.match(memberCss, /@media\(max-width:700px\)[^\n]*\.united-club-tabs\{display:none\}/);
  assert.match(memberJs, /mobileClubQuery\.matches[^\n]*panel\.hidden=false/);
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
