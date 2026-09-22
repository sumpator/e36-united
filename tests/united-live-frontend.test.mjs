import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('member LIVE entry is explicit, app-like and keeps server state separate from mode entry', () => {
  const html = read('member.html');
  const main = read('member.js');
  const shell = read('member/shell.js');
  const live = read('member/modules/live.js');
  const navigation = read('portal-navigation.js');

  assert.match(html, /data-member-live-mode hidden/);
  assert.match(html, /Spustit UNITED LIVE\?/);
  assert.match(html, /Přepneš se do režimu pro sraz\. Zpět do portálu se můžeš kdykoliv vrátit\./);
  assert.match(html, />Spustit LIVE</);
  assert.match(html, />Zůstat v portálu</);
  assert.doesNotMatch(html, /data-live-quick|data-live-sheet/);
  assert.match(live, /const sessionKey='e36United\.memberLiveMode\.v1'/);
  assert.match(live, /requestState='loading'/);
  assert.match(live, /requestState=next\.active\?'active':'inactive'/);
  assert.match(live, /requestState='error'/);
  assert.match(live, /data-live-retry/);
  assert.match(live, /rememberedEvent\(\)===next\.event\.id/);
  assert.match(live, /function exitMode\(\{navigate=true,section='overview',clearSession=false\}/);
  assert.match(live, /exitMode\(\{navigate:false,clearSession:true\}\)/);
  assert.match(live, /<details class="live-card live-participation">/);
  assert.match(live, /\['show_shine','best_exhaust'\]/);
  assert.match(shell, /if\(id==='live'&&!liveConfirmed\)\{void onLiveEntry\?\.\(\);return false\}/);
  assert.match(navigation, /if \(selected === false\) return;/);
  assert.match(main, /await memberLive\.startup\(\{requested:true\}\)/);
  assert.match(main, /void memberLive\.startup\(\)/);
});

test('member LIVE is the final separated portal destination and bottom navigation stays focused', () => {
  const html = read('member.html');
  const sidebarStart = html.indexOf('<aside class="member-sidebar" data-portal-tablist>');
  const sidebarEnd = html.indexOf('</aside>', sidebarStart);
  const sidebar = html.slice(sidebarStart, sidebarEnd);
  assert.ok(sidebar.indexOf('data-member-section="account"') < sidebar.indexOf('data-member-section="live"'));
  assert.ok(sidebar.indexOf('data-member-section="live"') < html.indexOf('data-logout', sidebarStart));
  assert.deepEqual([...html.matchAll(/data-live-tab="([^"]+)"/g)].map(match => match[1]), ['now', 'program', 'rating', 'photos']);
});

test('admin LIVE loads after event selection and activation remains an explicit server mutation', () => {
  const html = read('admin.html');
  const main = read('admin.js');
  const shell = read('admin/shell.js');
  const command = read('admin/command-shell.js');
  const live = read('admin/modules/live.js');

  assert.match(html, /data-admin-live-mode hidden/);
  assert.match(html, /Spustit organizační UNITED LIVE\?/);
  assert.match(live, /Vstup do organizačního režimu stav nemění/);
  assert.match(main, /await refreshCoordinator\.trigger\('startup'\);await adminLive\.startup\(\)/);
  assert.match(shell, /new CustomEvent\('admin:liveentryrequest',\{cancelable:true/);
  assert.match(shell, /if\(request\.defaultPrevented\)return false/);
  assert.match(live, /async function setEnabled\(button\)/);
  assert.match(live, /\/api\/admin\/events\/\$\{encodeURIComponent\(eventId\(\)\)\}\/live/);
  assert.match(live, /button\.disabled=true/);
  assert.match(live, /toast\(enabled\?'UNITED LIVE je aktivní\.':'UNITED LIVE je vypnutý\.'\)/);
  assert.match(live, /function exitMode\(\{navigate=true,clearSession=false\}/);
  assert.match(live, /exitMode\(\{navigate:false,clearSession:true\}\)/);
  assert.ok(command.indexOf("navButton('settings', 'Nastavení')") < command.indexOf('liveButton()'));
  assert.ok(command.indexOf('liveButton()') < command.indexOf('logoutButton()'));
});
