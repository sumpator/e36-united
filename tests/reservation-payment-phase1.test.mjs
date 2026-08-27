import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import qrcode from '../vendor/qrcode-generator.mjs';

const migration = readFileSync(new URL('../D1-reservation-payments-v1.sql', import.meta.url), 'utf8');
const workerSource = readFileSync(new URL('../cloudflare-worker-media.js', import.meta.url), 'utf8');
const worker = await import(`data:text/javascript;base64,${Buffer.from(`${workerSource}\nexport { paymentBalanceCzk, paymentStatusFor, isPaymentOverdue, buildSpayd, reservationPayment, ensureReservationPaymentVs, patchAdminReservationPayment, getAdminOverview };`).toString('base64')}`);

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE events (
      id TEXT PRIMARY KEY, year INTEGER NOT NULL, registration_status TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'CZK', payment_deadline TEXT,
      is_current INTEGER NOT NULL DEFAULT 0, accommodation_capacity INTEGER NOT NULL DEFAULT 0,
      reservation_capacity INTEGER NOT NULL DEFAULT 0, full_weekend_nights INTEGER NOT NULL DEFAULT 2,
      saturday_only_nights INTEGER NOT NULL DEFAULT 1, booking_commitment_czk INTEGER NOT NULL DEFAULT 0,
      booking_due_at TEXT, booking_paid_czk INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE reservations (
      id TEXT PRIMARY KEY, member_id TEXT NOT NULL, event_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      car_id TEXT, crew INTEGER NOT NULL DEFAULT 1, attendance_type TEXT, show_shine TEXT,
      accommodation TEXT, accommodation_units INTEGER NOT NULL DEFAULT 0,
      amount_due_czk INTEGER NOT NULL DEFAULT 0, amount_paid_czk INTEGER NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'unpaid', paid_at TEXT,
      payment_confirmed_by TEXT, payment_confirmed_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id)
    );
    CREATE TABLE admin_actions (
      id TEXT PRIMARY KEY, admin_member_id TEXT NOT NULL, action_type TEXT NOT NULL,
      entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, old_state_json TEXT,
      new_state_json TEXT, note TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE gallery_submissions (id TEXT PRIMARY KEY, status TEXT NOT NULL);
    INSERT INTO events (id, year, registration_status, currency, payment_deadline, is_current)
    VALUES ('united-2026', 2026, 'closed', 'CZK', '2026-12-01', 1),
           ('united-2025', 2025, 'closed', 'CZK', '2025-12-01', 0);
  `);
  db.exec(migration);
  return db;
}

function d1Binding(db) {
  class Statement {
    constructor(sql, bindings = []) { this.sql = sql; this.bindings = bindings; }
    bind(...bindings) { return new Statement(this.sql, bindings); }
    first() { return db.prepare(this.sql).get(...this.bindings) || null; }
    all() { return { results: db.prepare(this.sql).all(...this.bindings) }; }
    run() { const result = db.prepare(this.sql).run(...this.bindings); return { meta: { changes: Number(result.changes || 0) } }; }
  }
  return {
    prepare(sql) { return new Statement(sql); },
    batch(statements) {
      db.exec('BEGIN IMMEDIATE');
      try { const results = statements.map(statement => statement.run()); db.exec('COMMIT'); return results; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
}

function paymentRow(overrides = {}) {
  return {
    id: 'reservation-1', status: 'approved', amount_due_czk: 4800, amount_paid_czk: 0,
    payment_status: 'unpaid', payment_vs: '2026123456', paid_at: null,
    event_year: 2026, payment_currency: 'CZK', payment_deadline: '2026-12-01',
    payment_recipient_name: 'E36 UNITED TEST', payment_account_display: '123 / 9999',
    payment_iban: 'CZ5099990000000000000123', payment_message_prefix: 'E36 UNITED 2026', payment_test_mode: 1,
    ...overrides,
  };
}

test('migration only configures united-2026 and preserves closed registration', () => {
  const db = database();
  const current = db.prepare('SELECT * FROM events WHERE id=?').get('united-2026');
  const old = db.prepare('SELECT * FROM events WHERE id=?').get('united-2025');
  assert.equal(current.registration_status, 'closed');
  assert.equal(current.is_current, 1);
  assert.equal(current.payment_recipient_name, 'E36 UNITED TEST');
  assert.equal(current.payment_account_display, '123 / 9999');
  assert.equal(current.payment_iban, 'CZ5099990000000000000123');
  assert.equal(current.payment_message_prefix, 'E36 UNITED 2026');
  assert.equal(current.payment_test_mode, 1);
  assert.equal(old.payment_recipient_name, null);
});

test('payment variable symbols are unique, numeric, ten digits and stable', async () => {
  const db = database();
  db.prepare("INSERT INTO reservations (id,member_id,event_id) VALUES ('r1','m1','united-2026'),('r2','m2','united-2026')").run();
  const env = { DB: d1Binding(db) };
  const first = await worker.ensureReservationPaymentVs(env, 'r1', 2026);
  const second = await worker.ensureReservationPaymentVs(env, 'r2', 2026);
  assert.match(first, /^2026\d{6}$/);
  assert.match(second, /^2026\d{6}$/);
  assert.notEqual(first, second);
  assert.equal(await worker.ensureReservationPaymentVs(env, 'r1', 2026), first);
  assert.throws(() => db.prepare("UPDATE reservations SET payment_vs=? WHERE id='r2'").run(first), /UNIQUE constraint failed/);
});

test('payment status is derived exclusively from paid and due amounts', () => {
  assert.equal(worker.paymentBalanceCzk(6000, 4800), 1200);
  assert.equal(worker.paymentBalanceCzk(3000, 4800), -1800);
  assert.equal(worker.paymentStatusFor(0, 0), 'not_required');
  assert.equal(worker.paymentStatusFor(0, 1200), 'overpaid');
  assert.equal(worker.paymentStatusFor(4800, 0), 'unpaid');
  assert.equal(worker.paymentStatusFor(4800, 1200), 'underpaid');
  assert.equal(worker.paymentStatusFor(4800, 4800), 'paid');
  assert.equal(worker.paymentStatusFor(4800, 5000), 'overpaid');
});

test('overdue is a separate derived flag', () => {
  assert.equal(worker.isPaymentOverdue('2026-05-01', 4800, 0, new Date('2026-05-02T12:00:00Z')), true);
  assert.equal(worker.isPaymentOverdue('2026-05-01', 4800, 4800, new Date('2026-05-02T12:00:00Z')), false);
  assert.equal(worker.isPaymentOverdue('2026-05-03', 4800, 0, new Date('2026-05-02T12:00:00Z')), false);
  assert.equal(worker.isPaymentOverdue(null, 4800, 0, new Date('2026-05-02T12:00:00Z')), false);
});

test('SPAYD with a deadline contains remaining amount, IBAN, VS, message and the correct DT', () => {
  const payment = worker.reservationPayment(paymentRow({ amount_paid_czk: 1200 }));
  assert.equal(payment.remainingCzk, 3600);
  assert.equal(payment.spayd, 'SPD*1.0*ACC:CZ5099990000000000000123*AM:3600.00*CC:CZK*X-VS:2026123456*MSG:E36 UNITED 2026 2026123456*DT:20261201');
  const qr = qrcode(0, 'M'); qr.addData(payment.spayd, 'Byte'); qr.make();
  assert.ok(qr.getModuleCount() > 20);
});

test('NULL deadline keeps payment configuration ready and generates SPAYD without DT', () => {
  const payment = worker.reservationPayment(paymentRow({ payment_deadline: null, amount_paid_czk: 1200 }));
  assert.equal(payment.configurationReady, true);
  assert.notEqual(payment.spayd, null);
  assert.equal(payment.spayd, 'SPD*1.0*ACC:CZ5099990000000000000123*AM:3600.00*CC:CZK*X-VS:2026123456*MSG:E36 UNITED 2026 2026123456');
  assert.doesNotMatch(payment.spayd, /(?:^|\*)DT:/);
  assert.equal(payment.overdue, false);
});

test('pending member payment data exposes reconciliation but no payment instructions', () => {
  const pending = worker.reservationPayment(paymentRow({ status: 'pending', amount_paid_czk: 1200 }));
  assert.equal(pending.status, 'underpaid');
  assert.equal(pending.balanceCzk, 3600);
  assert.equal(pending.awaitingApproval, true);
  assert.equal(pending.actionable, false);
  assert.equal(pending.configurationReady, false);
  assert.equal(pending.recipientName, null);
  assert.equal(pending.accountDisplay, null);
  assert.equal(pending.spayd, null);
  const approved = worker.reservationPayment(paymentRow());
  assert.equal(approved.testMode, true);
  assert.equal(approved.variableSymbol, '2026123456');
  assert.equal(approved.configurationReady, true);
  assert.equal(approved.actionable, true);
});

test('zero remaining amount never produces a payment QR payload', () => {
  assert.equal(worker.reservationPayment(paymentRow({ amount_paid_czk: 4800 })).spayd, null);
  const overpaid = worker.reservationPayment(paymentRow({ amount_due_czk: 3000, amount_paid_czk: 4800 }));
  assert.equal(overpaid.balanceCzk, -1800);
  assert.equal(overpaid.overpaymentCzk, 1800);
  assert.equal(overpaid.status, 'overpaid');
  assert.equal(overpaid.spayd, null);
  const noCharge = worker.reservationPayment(paymentRow({ amount_due_czk: 0, amount_paid_czk: 0 }));
  assert.equal(noCharge.status, 'not_required');
  assert.equal(noCharge.spayd, null);
});

test('admin payment PATCH rejects negative and non-integer received amounts', async () => {
  for (const amountPaidCzk of [-1, 1.5, 'invalid']) {
    const db = database();
    db.prepare("INSERT INTO reservations (id,member_id,event_id,status,amount_due_czk,payment_vs) VALUES ('r1','m1','united-2026','approved',4800,'2026123456')").run();
    const request = new Request('https://api.e36united.cz/api/admin/reservations/r1/payment', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amountPaidCzk }) });
    const response = await worker.patchAdminReservationPayment(request, { DB: d1Binding(db) }, { uid: 'admin-1' }, 'r1', 'https://e36united.cz');
    assert.equal(response.status, 400);
    assert.equal(db.prepare("SELECT amount_paid_czk FROM reservations WHERE id='r1'").get().amount_paid_czk, 0);
  }
});

test('admin payment PATCH updates amount and audit atomically', async () => {
  const db = database();
  db.prepare("INSERT INTO reservations (id,member_id,event_id,status,amount_due_czk,payment_vs) VALUES ('r1','m1','united-2026','approved',4800,'2026123456')").run();
  const request = new Request('https://api.e36united.cz/api/admin/reservations/r1/payment', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amountPaidCzk: 1200 }) });
  const response = await worker.patchAdminReservationPayment(request, { DB: d1Binding(db) }, { uid: 'admin-1' }, 'r1', 'https://e36united.cz');
  assert.equal(response.status, 200);
  const row = db.prepare('SELECT amount_paid_czk,payment_status,payment_confirmed_by,payment_confirmed_at,paid_at FROM reservations WHERE id=?').get('r1');
  assert.equal(row.amount_paid_czk, 1200);
  assert.equal(row.payment_status, 'underpaid');
  assert.equal(row.payment_confirmed_by, 'admin-1');
  assert.ok(row.payment_confirmed_at);
  assert.equal(row.paid_at, null);
  const audit = db.prepare('SELECT * FROM admin_actions').get();
  assert.equal(audit.action_type, 'reservation_payment_update');
  assert.equal(audit.admin_member_id, 'admin-1');
  assert.equal(JSON.parse(audit.old_state_json).amountPaidCzk, 0);
  assert.equal(JSON.parse(audit.new_state_json).amountPaidCzk, 1200);
});

test('admin payment PATCH rejects client-supplied status and does not audit', async () => {
  const db = database();
  db.prepare("INSERT INTO reservations (id,member_id,event_id,status,amount_due_czk,payment_vs) VALUES ('r1','m1','united-2026','approved',4800,'2026123456')").run();
  const request = new Request('https://api.e36united.cz/api/admin/reservations/r1/payment', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amountPaidCzk: 1, paymentStatus: 'paid' }) });
  const response = await worker.patchAdminReservationPayment(request, { DB: d1Binding(db) }, { uid: 'admin-1' }, 'r1', 'https://e36united.cz');
  assert.equal(response.status, 400);
  assert.equal(db.prepare('SELECT amount_paid_czk FROM reservations WHERE id=?').get('r1').amount_paid_czk, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS value FROM admin_actions').get().value, 0);
});

test('admin payment PATCH handles full payment and overpayment without changing the reservation status', async () => {
  const db = database();
  db.prepare("INSERT INTO reservations (id,member_id,event_id,status,amount_due_czk,payment_vs) VALUES ('r1','m1','united-2026','approved',4800,'2026123456')").run();
  const env = { DB: d1Binding(db) };
  const patch = amountPaidCzk => worker.patchAdminReservationPayment(new Request('https://api.e36united.cz/api/admin/reservations/r1/payment', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amountPaidCzk }) }), env, { uid: 'admin-1' }, 'r1', 'https://e36united.cz');
  assert.equal((await patch(4800)).status, 200);
  let row = db.prepare('SELECT status,payment_status,paid_at FROM reservations WHERE id=?').get('r1');
  assert.equal(row.status, 'approved');
  assert.equal(row.payment_status, 'paid');
  assert.ok(row.paid_at);
  assert.equal((await patch(5000)).status, 200);
  row = db.prepare('SELECT status,payment_status,paid_at FROM reservations WHERE id=?').get('r1');
  assert.equal(row.status, 'approved');
  assert.equal(row.payment_status, 'overpaid');
  assert.ok(row.paid_at);
  assert.equal(db.prepare('SELECT COUNT(*) AS value FROM admin_actions').get().value, 2);
});

test('admin overview derives compact financial totals from active reservations', async () => {
  const db = database();
  db.prepare(`INSERT INTO reservations (id,member_id,event_id,status,amount_due_czk,amount_paid_czk,payment_status,payment_vs) VALUES
    ('r-unpaid','m1','united-2026','approved',4800,0,'paid','2026000001'),
    ('r-partial','m2','united-2026','pending',4800,1200,'unpaid','2026000002'),
    ('r-paid','m3','united-2026','approved',4800,4800,'unpaid','2026000003'),
    ('r-over','m4','united-2026','approved',4800,5000,'unpaid','2026000004'),
    ('r-rejected','m5','united-2026','rejected',9999,9999,'paid','2026000005')`).run();
  const response = await worker.getAdminOverview({ DB: d1Binding(db) }, new URL('https://api.e36united.cz/api/admin/overview?eventId=united-2026'), 'https://e36united.cz');
  assert.equal(response.status, 200);
  const payments = (await response.json()).overview.payments;
  assert.deepEqual({ unpaid: payments.unpaid, underpaid: payments.underpaid, paid: payments.paid, overpaid: payments.overpaid }, { unpaid: 1, underpaid: 1, paid: 1, overpaid: 1 });
  assert.equal(payments.amountDueCzk, 19200);
  assert.equal(payments.amountPaidCzk, 11000);
  assert.equal(payments.amountRemainingCzk, 8400);
});

test('payment endpoint routing is inside the existing requireAdmin branch', () => {
  const adminBranch = workerSource.indexOf('if (url.pathname.startsWith("/api/admin/"))');
  const authorization = workerSource.indexOf('const admin = await requireAdmin(env, auth);', adminBranch);
  const paymentRoute = workerSource.indexOf('adminReservationPaymentMatch', authorization);
  const memberRoutes = workerSource.indexOf('if (url.pathname === "/api/bootstrap"', paymentRoute);
  assert.ok(adminBranch >= 0 && authorization > adminBranch && paymentRoute > authorization && memberRoutes > paymentRoute);
});

test('test payment warning is present in both member and admin frontend', () => {
  const member = readFileSync(new URL('../member.js', import.meta.url), 'utf8');
  const admin = readFileSync(new URL('../admin.js', import.meta.url), 'utf8');
  assert.match(member, /TESTOVACÍ PLATBA – NEPLAŤTE/);
  assert.match(admin, /TESTOVACÍ PLATBA – NEPLAŤTE/);
});
