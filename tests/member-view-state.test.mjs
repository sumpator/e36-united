import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveMemberHeroState, deriveOverviewState } from '../member-portal-state.js';

test('hero: member without a car gets the branded garage CTA', () => {
  assert.deepEqual(deriveMemberHeroState({ cars: [] }), {
    state: 'no-car', car: null, photoId: '', carText: 'Tvoje E36 sem patří.', cta: 'Přidej první auto do garáže →', since: null,
  });
});

test('hero: primary car without a photo gets car identity and photo CTA', () => {
  const hero = deriveMemberHeroState({ cars: [{ id: 'car-1', primary: true, body: 'Coupé', model: '328i', nickname: 'Modrá' }], memberSince: 2022 });
  assert.equal(hero.state, 'no-photo');
  assert.equal(hero.carText, 'BMW E36 · Coupé · 328i · Modrá');
  assert.equal(hero.cta, 'Přidej fotku svého auta →');
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

test('overview: approved reservation with remaining payment is actionable', () => {
  const view = deriveOverviewState({ reservation: { status: 'approved', payment: { remainingCzk: 3600 } }, formatAmount: value => `${value} Kč` });
  assert.equal(view.label, 'ZBÝVÁ UHRADIT 3600 Kč');
  assert.match(view.copy, /Platební údaje/);
});
