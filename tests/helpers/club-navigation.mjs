import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Approved portal-next / portal-composition: three Club views, with Members a
// separate secondary action. Exercise the real tab controller, including fallback.
export function assertClubNavigation(club) {
  const names = ['points', 'history', 'achievements'];
  assert.deepEqual([...club.matchAll(/data-club-tab="([^"]+)"/g)].map(m => m[1]), names);
  assert.deepEqual([...club.matchAll(/data-club-anchor="([^"]+)"/g)].map(m => m[1]), names);
  for (const label of ['Body a výhody', 'Moje účasti', 'Moje ocenění']) assert.ok(club.includes(label));
  const buttons = names.map(name => ({ dataset: { clubTab: name }, setAttribute(key, value) { this[key] = value; }, addEventListener(_name, fn) { this.click = fn; } }));
  const panels = names.map(name => ({ dataset: { clubAnchor: name }, hidden: false }));
  const context = vm.createContext({ document: { querySelectorAll: selector => selector === '[data-club-tab]' ? buttons : panels } });
  vm.runInContext(readFileSync(new URL('../../member/club-tabs.js', import.meta.url), 'utf8'), context);
  for (const name of [...names, 'invalid']) {
    vm.runInContext(`select(${JSON.stringify(name)})`, context);
    const active = name === 'invalid' ? 'points' : name;
    assert.deepEqual(panels.map(p => p.hidden), names.map(n => n !== active));
    assert.deepEqual(buttons.map(b => b['aria-pressed']), names.map(n => String(n === active)));
  }
  buttons[1].click();
  assert.equal(panels[1].hidden, false);
  assert.equal(panels.filter(p => !p.hidden).length, 1);
  assert.match(club, /data-open-club-members/);
}
