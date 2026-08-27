import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveMemberHeroState, deriveOverviewState } from '../member-portal-state.js';

test('hero: member without a car gets the branded garage CTA', () => {
  assert.deepEqual(deriveMemberHeroState({ cars: [] }), {
    state: 'no-car', car: null, photoId: '', carText: 'Tvoje E36 sem patří.', cta: 'Přidat první auto →', since: null,
  });
});

test('hero: primary car without a photo gets car identity and photo CTA', () => {
  const hero = deriveMemberHeroState({ cars: [{ id: 'car-1', primary: true, body: 'Coupé', model: '328i', nickname: 'Modrá' }], memberSince: 2022 });
  assert.equal(hero.state, 'no-photo');
  assert.equal(hero.carText, 'BMW E36 · Coupé · 328i · Modrá');
  assert.equal(hero.cta, 'Přidat fotku auta →');
  assert.equal(hero.since, 2022);
});

test('hero: primary car and its private photo win over other cars', () => {
  const hero = deriveMemberHeroState({ cars: [
    { id: 'secondary', body: 'Sedan', photos: [{ id: 'secondary-photo' }] },
    { id: 'primary', primary: true, body: 'Touring', model: '325i', photos: [{ id: 'private-primary-photo' }] },
  ] });
  assert.equal(hero.car.id, 'primary');
  assert.equal(hero.photoId, 'private-primary-photo');
  assert.equal(hero.state, 'photo-loading');
  assert.equal(hero.cta, '');
});

test('overview: closed registration without reservation has no false action', () => {
  const view = deriveOverviewState({ registrationOpen: false, eventYear: 2026 });
  assert.equal(view.active, false);
  assert.equal(view.action, '');
  assert.match(view.emptyCopy, /United 2026/);
});

test('overview: open registration without reservation exposes the event CTA', () => {
  const view = deriveOverviewState({ registrationOpen: true, eventYear: 2027 });
  assert.equal(view.active, true);
  assert.equal(view.label, 'JEŠTĚ NEMÁŠ REZERVACI');
  assert.equal(view.action, 'Vytvořit rezervaci');
});

test('overview: pending and approved states are concise', () => {
  assert.equal(deriveOverviewState({ reservation: { status: 'pending' } }).label, 'ČEKÁ NA SCHVÁLENÍ');
  assert.equal(deriveOverviewState({ reservation: { status: 'approved' } }).label, 'REZERVACE SCHVÁLENA');
});

test('overview: changed pending reservation and overpayment are explicit non-payment states', () => {
  const pending = deriveOverviewState({ reservation: { status: 'pending', changePending: true, payment: { amountDueCzk: 6000, amountPaidCzk: 4800 } } });
  assert.equal(pending.label, 'ZMĚNA REZERVACE ČEKÁ NA SCHVÁLENÍ');
  assert.match(pending.copy, /nic nedoplácej/i);
  assert.equal(pending.target, 'reservation');
  const overpaid = deriveOverviewState({ reservation: { status: 'approved', payment: { status: 'overpaid', overpaymentCzk: 1800 } }, formatAmount: value => `${value} Kč` });
  assert.equal(overpaid.label, 'PŘEPLATEK 1800 Kč');
  assert.match(overpaid.copy, /není potřeba nic platit/i);
});

test('overview: approved reservation with remaining payment is actionable', () => {
  const view = deriveOverviewState({ reservation: { status: 'approved', payment: { status: 'underpaid', remainingCzk: 3600 } }, formatAmount: value => `${value} Kč` });
  assert.equal(view.label, 'DOPLATEK 3600 Kč');
  assert.match(view.copy, /Platební údaje/);
  assert.equal(view.action, 'Otevřít platbu');
  assert.equal(view.target, 'payments');
});

test('overview: a real reservation wins over both waiting and unavailable planner state', () => {
  const reservation={status:'pending',payment:{remainingCzk:0}};
  const view=deriveOverviewState({reservation,registrationOpen:false,plannerWaiting:true,plannerUnavailable:true});
  assert.equal(view.label,'ČEKÁ NA SCHVÁLENÍ');
  assert.equal(view.target,'reservation');
});

test('overview: planner sync error is not rendered as no plan', () => {
  const view=deriveOverviewState({plannerUnavailable:true,registrationOpen:false});
  assert.equal(view.active,true);
  assert.equal(view.label,'PLÁN TEĎ NELZE OVĚŘIT');
});
