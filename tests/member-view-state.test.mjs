import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveMemberHeroState, deriveMemberRating, deriveOverviewState } from '../member-portal-state.js';

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

test('overview: closed registration without enabled plans does not claim a persisted plan', () => {
  const view = deriveOverviewState({ registrationOpen: false, eventYear: 2026 });
  assert.equal(view.active, true);
  assert.equal(view.label, 'REGISTRACE NYNÍ NEJSOU OTEVŘENÉ');
  assert.equal(view.copy, 'Registrace nyní nejsou otevřené.');
  assert.equal(view.action, '');
});

test('overview: enabled and saved plans have explicit closed/open actions',()=>{
  const enabled=deriveOverviewState({registrationOpen:false,planEnabled:true,eventYear:2026});
  assert.equal(enabled.action,'Začít');assert.equal(enabled.copy,'Zatím přijímáme předběžné registrace.');
  const saved=deriveOverviewState({registrationOpen:false,plan:{status:'active'},eventYear:2026});
  assert.equal(saved.label,'MÁŠ PŘEDBĚŽNOU REGISTRACI.');assert.equal(saved.action,'Upravit');assert.match(saved.copy,/dáme Ti vědět/);
  const open=deriveOverviewState({registrationOpen:true,plan:{status:'active'},eventYear:2026});
  assert.equal(open.label,'POTVRĎ SVOU REGISTRACI!');assert.equal(open.action,'Zkontrolovat a potvrdit');assert.equal(open.copy,'Registrace jsou otevřené.');
});

test('overview: open registration without reservation exposes the event CTA', () => {
  const view = deriveOverviewState({ registrationOpen: true, eventYear: 2027 });
  assert.equal(view.active, true);
  assert.equal(view.label, 'REGISTRUJ SE NA UNITED');
  assert.equal(view.copy, '');
  assert.equal(view.action, 'Začít');
});

test('overview: pending and approved states are concise', () => {
  assert.equal(deriveOverviewState({ reservation: { status: 'pending' } }).label, 'REGISTRACE ČEKÁ NA SCHVÁLENÍ.');
  assert.equal(deriveOverviewState({ reservation: { status: 'approved' } }).label, 'TVOJE ÚČAST JE POTVRZENÁ.');
});

test('overview: changed pending reservation and overpayment are explicit non-payment states', () => {
  const pending = deriveOverviewState({ reservation: { status: 'pending', changePending: true, payment: { amountDueCzk: 6000, amountPaidCzk: 4800 } } });
  assert.equal(pending.label, 'ZMĚNA REGISTRACE ČEKÁ NA SCHVÁLENÍ');
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
  assert.equal(view.label,'REGISTRACE ČEKÁ NA SCHVÁLENÍ.');
  assert.equal(view.target,'reservation');
});

test('overview: planner sync error is not rendered as no plan', () => {
  const view=deriveOverviewState({plannerUnavailable:true,registrationOpen:false});
  assert.equal(view.active,true);
  assert.equal(view.label,'PŘEDBĚŽNOU REGISTRACI TEĎ NELZE OVĚŘIT');
});

test('member rating follows the complete BMW ladder and clamps invalid progress', () => {
  const expected = [[-1, '316i'], [0, '316i'], [1, '316i'], [2, '318is'], [3, '318is'], [4, '320i'], [5, '320i'], [6, '323i'], [7, '323i'], [8, '325i'], [9, '325i'], [10, '328i'], [11, '328i'], [12, 'M POWER'], [99, 'M POWER']];
  for (const [progress, rating] of expected) assert.equal(deriveMemberRating(progress), rating, `${progress} → ${rating}`);
  assert.equal(deriveMemberRating('invalid'), '316i');
});
