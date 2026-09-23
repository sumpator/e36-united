/* Blocking head bootstrap: no network, API writes or application rerender on change. */
(() => {
  'use strict';
  const key = 'e36UnitedAppearance';
  const root = document.documentElement;
  const valid = value => ['dark', 'light', 'system'].includes(value);
  let preference = 'dark';
  try { const saved = localStorage.getItem(key); if (valid(saved)) preference = saved; } catch {}
  const device = window.matchMedia('(prefers-color-scheme: light)');
  function apply() {
    const theme = preference === 'system' ? (device.matches ? 'light' : 'dark') : preference;
    root.dataset.theme = theme;
    root.dataset.appearance = preference;
    root.style.colorScheme = theme;
    document.querySelectorAll('[data-appearance-select]').forEach(control => { control.value = preference; });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'light' ? '#f3f5f8' : '#090a0c';
  }
  apply();
  document.addEventListener('DOMContentLoaded', apply, {once: true});
  document.addEventListener('change', event => {
    if (!event.target.matches('[data-appearance-select]') || !valid(event.target.value)) return;
    preference = event.target.value;
    try { localStorage.setItem(key, preference); } catch {}
    apply();
  });
  device.addEventListener('change', () => { if (preference === 'system') apply(); });
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    preference = valid(event.newValue) ? event.newValue : 'dark';
    apply();
  });
})();
