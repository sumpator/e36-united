import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const memberHtml = read('member.html');
const memberJs = read('member.js');
const memberSessionJs = read('member/session.js');
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
  assert.match(sidebar, /member-nav-external member-nav-shop" href="merch\.html"><b>United Merch<\/b>/);
  assert.doesNotMatch(sidebar, /member-nav-external[^>]*>[\s\S]*?<span>\d{2}<\/span>/);
  assert.doesNotMatch(memberHtml, /data-member-panel="merch"/);
  assert.match(memberCss, /@media\(max-width:1050px\)[^\n]*member-portal-nav \.member-nav-external\{display:none\}/);
});

test('authenticated main mobile menu contains all Member Portal sections', () => {
  const start = memberHtml.indexOf('data-member-main-mobile-nav');
  const mobile = memberHtml.slice(start, memberHtml.indexOf('</div>', start));
  const labels = [...mobile.matchAll(/data-main-member-section="[^"]+"[^>]*>([^<]+)<\/button>/g)].map(match => match[1].replace('&amp;', '&'));
  assert.deepEqual(labels, ['Přehled', 'Sraz & Ubytování', 'Garáž', 'Platby', 'United Club', 'Moje fotky', 'Účet']);
  assert.match(memberHtml, /data-member-main-mobile-nav="" hidden=""/);
  assert.match(memberJs, /setMainMobileMemberNavigation\(true\)/);
  assert.match(memberJs, /setMainMobileMemberNavigation\(false\)/);
});

test('main mobile menu adds unnumbered logout after its divider and reuses the shared logout function', () => {
  const start = memberHtml.indexOf('data-member-main-mobile-nav');
  const mobile = memberHtml.slice(start, memberHtml.indexOf('</div>', start));
  const divider = mobile.indexOf('member-main-mobile-divider'), logout = mobile.indexOf('member-main-mobile-logout');
  assert.ok(divider > 0 && logout > divider);
  assert.doesNotMatch(mobile.slice(logout), /<span>\d{2}<\/span>/);
  assert.match(memberJs, /async function logoutMember\(\)/);
  assert.match(memberJs, /performMemberLogout/);
  assert.match(memberJs, /onSuccess:\(\)=>\{memberPortalNavigation\?\.close/);
  assert.match(memberJs, /Tvoje přihlášení zůstalo aktivní/);
  assert.match(memberJs, /\$\$\('\[data-logout\]'\)\.forEach\(button=>button\.addEventListener\('click',logoutMember\)\)/);
});

test('desktop sidebar action, main mobile menu and Account expose shared logout outside the bordered navigation card', () => {
  const heroStart = memberHtml.indexOf('data-member-hero=');
  const hero = memberHtml.slice(heroStart, memberHtml.indexOf('<div class="container member-shell">', heroStart));
  const navStart = memberHtml.indexOf('<div class="member-portal-nav');
  const nav = memberHtml.slice(navStart, memberHtml.indexOf('<div class="member-content">', navStart));
  const sidebarStart = memberHtml.indexOf('<aside class="member-sidebar"');
  const sidebarEnd = memberHtml.indexOf('</aside>', sidebarStart);
  const sidebar = memberHtml.slice(sidebarStart, sidebarEnd);
  const account = memberHtml.slice(memberHtml.indexOf('data-member-panel="account"'));
  assert.doesNotMatch(hero, /data-logout|member-hero-logout/);
  assert.doesNotMatch(sidebar, /data-logout/);
  assert.ok(nav.indexOf('member-sidebar-logout') > nav.indexOf('</aside>'));
  assert.doesNotMatch(nav, /data-portal-menu-open|data-portal-sheet/);
  assert.match(account, /account-logout" data-logout=""/);
  assert.equal((memberHtml.match(/data-logout=""/g)||[]).length,3);
  assert.match(memberCss, /\.member-sidebar-logout\{width:100%;min-height:44px;margin-top:10px/);
  assert.match(memberCss, /@media\(max-width:1050px\)\{\.member-sidebar-logout\{display:none\}\}/);
  assert.match(memberJs, /\$\$\('\[data-logout\]'\)\.forEach\(button=>button\.addEventListener\('click',logoutMember\)\)/);
});

test('duplicate internal mobile hamburger is removed while the horizontal scroller remains', () => {
  const navStart = memberHtml.indexOf('<div class="member-portal-nav');
  const nav = memberHtml.slice(navStart, memberHtml.indexOf('<div class="member-content">', navStart));
  assert.doesNotMatch(nav, /portal-menu-button|data-portal-menu-open|portal-nav-sheet|data-portal-sheet/);
  assert.match(nav, /portal-nav-viewport[\s\S]*?<aside class="member-sidebar" data-portal-tablist>/);
  assert.equal((nav.match(/data-member-section="/g)||[]).length,7);
  assert.match(memberCss, /@media\(max-width:1050px\)\{\.member-portal-nav\{grid-template-columns:minmax\(0,1fr\)\}\}/);
  assert.match(portalNavigationJs, /scrollIntoView/);
});

test('main mobile submenu delegates section state to openSection and closes the hamburger', () => {
  assert.match(memberJs, /\$\$\('\[data-main-member-section\]'\)\.forEach\(button=>button\.addEventListener\('click',\(\)=>\{openSection\(button\.dataset\.mainMemberSection\);closeMainMenu\(\)\}\)\)/);
  assert.match(memberJs, /\$\$\('\[data-main-member-section\]'\)\.forEach\(button=>button\.classList\.toggle\('is-active',button\.dataset\.mainMemberSection===id\)\)/);
  assert.match(memberJs, /data-member-entry[\s\S]*openSection\('overview'\)/);
});

test('Můj United active underline belongs to its label, not the decorative marker', () => {
  assert.match(memberHtml, /nav-member-label">Můj United<\/span>/);
  assert.match(memberCss, /\.member-top-nav a\.nav-member\.active::after\{display:none\}/);
  assert.match(memberCss, /\.member-top-nav \.nav-member\.active \.nav-member-label::after/);
  assert.match(memberCss, /\.member-top-nav a\.nav-member\.active\{text-decoration:none\}/);
});

test('authenticated entry always starts on Overview without planner or URL auto-navigation', () => {
  assert.match(memberHtml, /member-nav-item is-active" data-member-section="overview"/);
  assert.match(memberHtml, /member-section is-active" data-member-panel="overview"/);
  assert.match(memberJs, /showApp\(\);\s*openSection\('overview'\);\s*await applyPlannerDraft/);
  assert.doesNotMatch(memberJs, /requestedMemberPanel/);
  assert.match(memberJs, /applyPlannerHandoffToForm\(\{navigate:false\}\)/);
  const draftFlow = memberJs.slice(memberJs.indexOf('async function applyPlannerDraft'), memberJs.indexOf('const menuBtn='));
  assert.doesNotMatch(draftFlow, /openSection\('reservation'\)/);
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
  for (const source of [memberSessionJs, merchJs, galleryJs]) assert.match(source, /initUnitedAuth/);
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

test('United Club is one coherent Points, history and Achievements page on every viewport', () => {
  const clubStart = memberHtml.indexOf('data-member-panel="club"');
  const club = memberHtml.slice(clubStart, memberHtml.indexOf('data-member-panel="photos"', clubStart));
  assert.doesNotMatch(club, /data-club-tab|data-club-panel/);
  assert.ok(club.indexOf('data-club-anchor="points"') < club.indexOf('data-club-anchor="history"'));
  assert.ok(club.indexOf('data-club-anchor="history"') < club.indexOf('data-club-anchor="achievements"'));
  assert.match(club, /MOJE STOPA V UNITED/);
  assert.match(club, /ACHIEVEMENTS/);
  assert.doesNotMatch(club, /MILNÍKY|VÝHODY/);
  assert.doesNotMatch(memberJs, /mobileClubQuery|openClubTab/);
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
