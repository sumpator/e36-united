import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ADMIN_VIEW_IDS,
  RESERVATION_VIEW_MODES,
  filterAdminPayments,
  filterAdminReservations,
  matchesAdminSearch,
  paymentNeedsAttention,
  reservationNeedsAction,
} from '../admin-view-model.js';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const html = read('admin.html');
const js = read('admin.js');
const css = read('admin.css');

const reservations = [
  {
    id: 'pending', status: 'pending', updatedAt: '2026-08-27T08:00:00Z',
    member: { name: 'Jan Šimek', nickname: 'Shimi', email: 'jan@example.cz', memberCode: 'EU-001' },
    carSnapshot: { model: 'M3', body: 'Coupé' },
    payment: { status: 'unpaid', amountDueCzk: 4800, amountPaidCzk: 0, remainingCzk: 4800, variableSymbol: '2026000001', overdue: false },
  },
  {
    id: 'paid', status: 'approved', updatedAt: '2026-08-27T09:00:00Z',
    member: { name: 'Eva Nováková', nickname: 'Evi', email: 'eva@example.cz' },
    payment: { status: 'paid', amountDueCzk: 3200, amountPaidCzk: 3200, remainingCzk: 0, variableSymbol: '2026000002', overdue: false },
  },
  {
    id: 'underpaid', status: 'approved', updatedAt: '2026-08-27T10:00:00Z',
    member: { name: 'Petr Dvořák', email: 'petr@example.cz' },
    payment: { status: 'underpaid', amountDueCzk: 5000, amountPaidCzk: 2000, remainingCzk: 3000, variableSymbol: '2026000003', overdue: true },
  },
];

test('admin has one persistent navigation target for each real agenda and one default active panel', () => {
  const panels = [...html.matchAll(/data-admin-panel="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(panels.sort(), [...ADMIN_VIEW_IDS].sort());
  for (const view of ADMIN_VIEW_IDS) {
    assert.match(html, new RegExp(`data-admin-jump="${view}"`));
    assert.match(html, new RegExp(`data-portal-target="${view}"`));
  }
  assert.equal((html.match(/admin-view-panel is-active/g) || []).length, 1);
  assert.match(html, /class="admin-view-panel is-active" data-admin-panel="dashboard"/);
  assert.doesNotMatch(html, /data-admin-panel="(?:reservations|payments|gallery|accommodation|event)"[^>]*data-admin-collapsible/);
});

test('view switching hides inactive agendas and persists the active agenda', () => {
  assert.match(js, /function setAdminView\(view,\{focus=true\}=\{\}\)/);
  assert.match(js, /panel\.hidden=!active/);
  assert.match(js, /rememberSessionChoice\('e36UnitedAdmin\.activeView',nextView\)/);
  assert.match(js, /adminPortalNavigation=initPortalNavigation\([^\n]+onSelect:view=>setAdminView\(view\)/);
  assert.match(css, /\.admin-view-panel\[hidden\]\{display:none!important\}/);
});

test('reservation search is accent-insensitive and supports member, car and variable symbol fields', () => {
  assert.equal(matchesAdminSearch(reservations[0], 'simek'), true);
  assert.equal(matchesAdminSearch(reservations[0], 'Shimi'), true);
  assert.equal(matchesAdminSearch(reservations[0], 'm3'), true);
  assert.equal(matchesAdminSearch(reservations[0], '2026000001'), true);
  assert.deepEqual(filterAdminReservations(reservations, { filter: 'approved', query: 'eva' }).map(item => item.id), ['paid']);
});

test('reservation quick/detail modes and operational filters use current reservation data', () => {
  assert.deepEqual(RESERVATION_VIEW_MODES, ['quick', 'detail']);
  assert.equal(reservationNeedsAction(reservations[0]), true);
  assert.equal(reservationNeedsAction(reservations[1]), false);
  assert.equal(reservationNeedsAction(reservations[2]), true);
  assert.deepEqual(filterAdminReservations(reservations, { filter: 'action' }).map(item => item.id), ['pending', 'underpaid']);
  assert.deepEqual(filterAdminReservations(reservations, { filter: 'paid' }).map(item => item.id), ['paid']);
  assert.match(html, /data-reservation-mode="quick"/);
  assert.match(html, /data-reservation-mode="detail"/);
  assert.match(js, /admin-reservation-table--\$\{quick\?'quick':'detail'\}/);
});

test('payments view is derived from existing reservation payment records', () => {
  assert.equal(paymentNeedsAttention(reservations[0]), true);
  assert.equal(paymentNeedsAttention(reservations[1]), false);
  assert.equal(paymentNeedsAttention(reservations[2]), true);
  assert.deepEqual(filterAdminPayments(reservations, { filter: 'attention' }).map(item => item.id), ['pending', 'underpaid']);
  assert.deepEqual(filterAdminPayments(reservations, { filter: 'paid', query: 'novakova' }).map(item => item.id), ['paid']);
  assert.match(html, /data-admin-panel="payments"/);
  assert.match(js, /function renderPaymentList\(\)/);
});

test('existing admin mutation workflows remain available through the established endpoints', () => {
  assert.match(js, /\/api\/admin\/reservations\/\$\{encodeURIComponent\(reservationId\)\}/);
  assert.match(js, /\/api\/admin\/reservations\/\$\{encodeURIComponent\(reservationId\)\}\/payment/);
  assert.match(js, /\/api\/admin\/gallery\/\$\{encodeURIComponent\(submissionId\)\}/);
  assert.match(js, /\/api\/admin\/accommodation\/\$\{encodeURIComponent\(optionId\)\}/);
  assert.match(js, /\/api\/admin\/events\/\$\{encodeURIComponent\(event\.id\)\}/);
  assert.match(html, /data-reservation-drawer/);
  assert.match(html, /data-gallery-lightbox/);
  assert.match(html, /data-event-settings-form/);
});

test('responsive workspace contains tables without allowing them to widen the page', () => {
  assert.match(css, /\.admin-workspace,\.admin-view-panel\{min-width:0\}/);
  assert.match(css, /\.admin-table-scroll\{[^}]*max-width:100%;overflow-x:auto/);
  assert.match(css, /@media\(max-width:720px\)[\s\S]*?\.admin-kpis\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
});
