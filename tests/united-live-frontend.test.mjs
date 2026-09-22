import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('member LIVE entry switches the whole portal immediately and restores per account and event', () => {
  const html = read('member.html');
  const main = read('member.js');
  const shell = read('member/shell.js');
  const live = read('member/modules/live.js');
  const navigation = read('portal-navigation.js');

  assert.match(html, /data-member-live-mode hidden inert/);
  assert.match(html, /data-live-entry-confirm/);
  assert.match(html, /data-live-entry-cancel/);
  assert.match(live, /const storagePrefix='e36United\.memberLiveMode\.v2'/);
  assert.match(live, /localStorage\.getItem\(storageKey\(eventId\)\)/);
  assert.match(live, /const storageKey=eventId=>`\$\{storagePrefix\}\.\$\{accountId\(\)\}\.\$\{String\(eventId/);
  assert.match(live, /if\(state\?\.active&&rememberedEvent\(state\.event\.id\)\)/);
  assert.match(live, /function enterMode\(\{remember=true,focus=true\}=\{\}\)/);
  assert.match(live, /setLiveMode\(true\);render\(\)/);
  assert.match(live, /function exitMode\(\{navigate=true,section='overview',clearChoice=true\}=\{\}\)/);
  assert.match(live, /rememberEvent\(payload\.event\.id,false\)/);
  assert.match(shell, /appView\.inert=active/);
  assert.match(shell, /liveView\.inert=!active/);
  assert.match(shell, /setMainMobileMemberNavigation\(!active&&isAuthenticated\(\)\)/);
  assert.match(shell, /if\(id==='live'&&!liveConfirmed\)\{void onLiveEntry\?\.\(\);return false\}/);
  assert.match(navigation, /if \(selected === false\) return;/);
  assert.match(main, /await memberLive\.startup\(\{requested:true\}\)/);
  assert.match(main, /void memberLive\.startup\(\)/);
  assert.doesNotMatch(live, /sessionStorage/);
});

test('member LIVE exposes only Program, Show and Shine and Photos with QR and no reservation detail', () => {
  const html = read('member.html');
  const live = read('member/modules/live.js');
  const sidebarStart = html.indexOf('<aside class="member-sidebar" data-portal-tablist>');
  const sidebarEnd = html.indexOf('</aside>', sidebarStart);
  const sidebar = html.slice(sidebarStart, sidebarEnd);

  assert.ok(sidebar.indexOf('data-member-section="account"') < sidebar.indexOf('data-member-section="live"'));
  assert.ok(sidebar.indexOf('data-member-section="live"') < html.indexOf('data-logout', sidebarStart));
  assert.deepEqual([...html.matchAll(/data-live-tab="([^"]+)"/g)].map(match => match[1]), ['program', 'showshine', 'photos']);
  assert.deepEqual([...html.matchAll(/data-live-view="([^"]+)"/g)].map(match => match[1]), ['program', 'showshine', 'photos']);
  assert.match(html, /data-live-qr-dialog/);
  assert.match(live, /function normalizeView\(view\)\{if\(view==='now'\|\|view==='program'\)return'program';if\(view==='rating'\|\|view==='showshine'\)return'showshine'/);
  assert.match(live, /data-live-open-qr/);
  assert.match(live, /data-live-open-votes/);
  assert.match(live, /data-live-tab-direct="photos"/);
  assert.match(live, /getRegistrationCar\(\)/);
  assert.match(live, /payload\.me\?\.judge/);
  assert.match(html, /multiple name="photos"/);
  assert.match(html, /data-live-upload-previews/);
  assert.doesNotMatch(live, /live-participation|Moje účast a pobyt|reservation\.accommodation/);
});

test('admin LIVE is one compact workflow and keeps global state changes in settings', () => {
  const html = read('admin.html');
  const main = read('admin.js');
  const shell = read('admin/shell.js');
  const command = read('admin/command-shell.js');
  const live = read('admin/modules/live.js');

  assert.match(html, /data-admin-live-mode hidden inert/);
  assert.deepEqual([...html.matchAll(/data-admin-live-tab="([^"]+)"/g)].map(match => match[1]), ['showshine', 'members', 'program']);
  assert.match(html, /data-admin-live-more-toggle/);
  assert.match(html, /data-admin-live-settings/);
  assert.match(html, /data-admin-live-exit/);
  assert.doesNotMatch(html, /admin-live-toolbar/);
  assert.match(live, /function setMode\(active\)/);
  assert.match(live, /standard\.inert=active/);
  assert.match(live, /live\.inert=!active/);
  assert.match(live, /const storageKey=id=>`\$\{storagePrefix\}\.\$\{accountId\(\)\}\.\$\{String\(id/);
  assert.match(live, /function workflowView\(\)/);
  assert.match(live, /data-live-camera/);
  assert.match(live, /data-live-choose-member/);
  assert.match(live, /data-live-car-select/);
  assert.match(live, /data-live-start/);
  assert.match(live, /data-live-judge-form/);
  assert.match(live, /data-live-judge-submit/);
  assert.match(live, /data-live-judge-previews/);
  assert.match(live, /function settingsView\(\)/);
  assert.match(live, /data-admin-live-toggle/);
  assert.doesNotMatch(live, /data-live-judge-assign|\/live\/judges/);
  assert.ok(live.indexOf('modeActive=true;setMode(true);render();if(setAdminView') > 0);
  assert.equal((html.match(/data-admin-live-toggle/g) || []).length, 0);
  assert.match(main, /await refreshCoordinator\.trigger\('startup'\);await adminLive\.startup\(\)/);
  assert.match(shell, /new CustomEvent\('admin:liveentryrequest',\{cancelable:true/);
  assert.match(shell, /if\(request\.defaultPrevented\)return false/);
  assert.ok(command.indexOf("navButton('settings', 'Nastavení')") < command.indexOf('liveButton()'));
  assert.ok(command.indexOf('liveButton()') < command.indexOf('logoutButton()'));
});

test('admin member selection reuses registered cars and preserves dirty judge drafts', () => {
  const live = read('admin/modules/live.js');

  assert.match(live, /selectedCarId=member\?\.registeredCarId\|\|member\?\.cars\?\.\[0\]\?\.id/);
  assert.match(live, /car\.photoId/);
  assert.match(live, /\/api\/admin\/members\/\$\{encodeURIComponent\(member\.memberId\)\}\/media\/cars\/\$\{encodeURIComponent\(car\.id\)\}\/\$\{encodeURIComponent\(car\.photoId\)\}/);
  assert.match(live, /judgeDrafts\.set\(form\.dataset\.liveJudgeForm,judgeValues\(form\)\)/);
  assert.match(live, /if\(signature!==lastStateSignature&&!hasUnsavedJudge\(\)\)/);
  assert.match(live, /confirmLeaveJudge\(\)/);
  assert.doesNotMatch(live, /waitForTimeout/);
});
