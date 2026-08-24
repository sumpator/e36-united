import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const migration = readFileSync(new URL('../D1-event-accommodation-v1.sql', import.meta.url), 'utf8');
const paymentMigration = readFileSync(new URL('../D1-reservation-payments-v1.sql', import.meta.url), 'utf8');
const workerSource = readFileSync(new URL('../cloudflare-worker-media.js', import.meta.url), 'utf8');
const workerModule = await import(`data:text/javascript;base64,${Buffer.from(`${workerSource}\nexport { putCurrentReservation, patchAdminReservation, createAdminAccommodation, patchAdminAccommodation, patchAdminEvent, getAdminReservations, calculateAccommodationPricing };`).toString('base64')}`);

function database(events = [{ id: 'event-2026', year: 2026, status: 'open' }]) {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE events (
      id TEXT PRIMARY KEY, year INTEGER NOT NULL, registration_status TEXT NOT NULL,
      accommodation_capacity INTEGER NOT NULL DEFAULT 0,
      reservation_capacity INTEGER NOT NULL DEFAULT 0,
      booking_commitment_czk INTEGER NOT NULL DEFAULT 0,
      booking_due_at TEXT,
      booking_paid_czk INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'CZK', payment_deadline TEXT
    );
    CREATE TABLE reservations (
      id TEXT PRIMARY KEY, member_id TEXT NOT NULL, event_id TEXT NOT NULL,
      car_id TEXT, car_model TEXT, car_body TEXT, car_year INTEGER, car_color TEXT, car_nickname TEXT,
      arrival TEXT, crew INTEGER NOT NULL DEFAULT 1, accommodation TEXT, show_shine TEXT, note TEXT,
      status TEXT NOT NULL DEFAULT 'pending', attendance_type TEXT, accommodation_units INTEGER NOT NULL DEFAULT 0,
      amount_due_czk INTEGER NOT NULL DEFAULT 0, amount_paid_czk INTEGER NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'unpaid', paid_at TEXT, submitted_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_by TEXT, reviewed_at TEXT, review_note TEXT,
      UNIQUE(member_id, event_id), FOREIGN KEY (event_id) REFERENCES events(id)
    );
    CREATE TABLE members (id TEXT PRIMARY KEY, name TEXT, nickname TEXT, email TEXT, member_code TEXT);
    CREATE TABLE cars (id TEXT PRIMARY KEY, member_id TEXT NOT NULL, model TEXT, body TEXT, year INTEGER, color TEXT, nickname TEXT);
    CREATE TABLE admin_actions (
      id TEXT PRIMARY KEY, admin_member_id TEXT NOT NULL, action_type TEXT NOT NULL,
      entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, old_state_json TEXT,
      new_state_json TEXT, note TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const insertEvent = db.prepare('INSERT INTO events (id, year, registration_status) VALUES (?, ?, ?)');
  for (const event of events) insertEvent.run(event.id, event.year, event.status || 'closed');
  db.exec(migration);
  db.exec(paymentMigration);
  return db;
}

function addOption(db, overrides = {}) {
  const option = {
    id: 'cabin-a', eventId: 'event-2026', name: 'Chatka A', kind: 'cabin', inventory: 'limited',
    units: 10, capacity: 4, unitPrice: 2400, personPrice: 0, bedding: 120, tax: 50,
    ...overrides,
  };
  db.prepare(`
    INSERT INTO event_accommodation_options (
      id, event_id, name, kind, inventory_mode, units_total, capacity_per_unit,
      unit_price_czk, person_price_czk, bedding_fee_per_person_czk,
      city_tax_per_person_per_night_czk, active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(option.id, option.eventId, option.name, option.kind, option.inventory, option.units, option.capacity, option.unitPrice, option.personPrice, option.bedding, option.tax);
  return option;
}

function price({ people, capacity, unitPrice, personPrice = 0, bedding = 0, tax = 0, nights = 0 }) {
  const unitCount = Math.ceil(people / capacity);
  const base = unitCount * unitPrice * nights;
  const person = people * personPrice;
  const beddingTotal = people * bedding;
  const cityTax = people * nights * tax;
  return { unitCount, base, person, bedding: beddingTotal, cityTax, total: base + person + beddingTotal + cityTax };
}

function addAllocation(db, { reservationId, memberId, optionId = 'cabin-a', units = 1, people = 4, status = 'pending', total = 0 }) {
  db.prepare('INSERT INTO reservations (id, member_id, event_id, accommodation, accommodation_units, status, amount_due_czk) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(reservationId, memberId, 'event-2026', 'Chatka', people, status, total);
  db.prepare(`
    INSERT INTO reservation_accommodation (
      reservation_id, option_id, option_name, kind, people_count, unit_count,
      unit_price_czk, person_price_czk, bedding_fee_per_person_czk,
      city_tax_per_person_per_night_czk, nights, base_total_czk, person_total_czk,
      bedding_total_czk, city_tax_total_czk, total_czk
    ) VALUES (?, ?, 'Chatka A', 'cabin', ?, ?, 2400, 0, 120, 50, 2, 4800, 0, 480, 400, ?)
  `).run(reservationId, optionId, people, units, total);
}

function blockedUnits(db, optionId = 'cabin-a') {
  return Number(db.prepare(`
    SELECT COALESCE(SUM(ra.unit_count), 0) AS value
    FROM reservation_accommodation ra
    JOIN reservations r ON r.id = ra.reservation_id
    WHERE ra.option_id = ? AND r.status IN ('pending', 'approved')
  `).get(optionId).value);
}

function saveIfCapacity(db, { reservationId, memberId, units, people }) {
  const result = db.prepare(`
    INSERT INTO reservations (id, member_id, event_id, accommodation, accommodation_units, status)
    SELECT ?, ?, o.event_id, 'Chatka', ?, 'pending'
    FROM event_accommodation_options o
    WHERE o.id = 'cabin-a' AND (
      o.inventory_mode = 'unlimited' OR o.units_total >= ? + (
        SELECT COALESCE(SUM(ra.unit_count), 0)
        FROM reservation_accommodation ra
        JOIN reservations r ON r.id = ra.reservation_id
        WHERE ra.option_id = o.id AND r.status IN ('pending', 'approved') AND r.id <> ?
      )
    )
  `).run(reservationId, memberId, people, units, reservationId);
  if (!result.changes) return 409;
  db.prepare(`
    INSERT INTO reservation_accommodation (
      reservation_id, option_id, option_name, kind, people_count, unit_count,
      unit_price_czk, person_price_czk, bedding_fee_per_person_czk,
      city_tax_per_person_per_night_czk, nights, base_total_czk, person_total_czk,
      bedding_total_czk, city_tax_total_czk, total_czk
    ) VALUES (?, 'cabin-a', 'Chatka A', 'cabin', ?, ?, 2400, 0, 120, 50, 2, 2400, 0, 0, 0, 2400)
  `).run(reservationId, people, units);
  return 200;
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

async function submitWorkerReservation(db, { memberId, people = 4, arrival = 'Pátek', accommodation = 'Chatka', optionId = 'cabin-a', accommodationUnits = people }) {
  db.prepare('INSERT OR IGNORE INTO members (id) VALUES (?)').run(memberId);
  db.prepare('INSERT OR IGNORE INTO cars (id, member_id, model, body, year, color, nickname) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(`car-${memberId}`, memberId, '328i', 'Coupé', 1996, 'Modrá', 'Test E36');
  const request = new Request('https://api.e36united.cz/api/reservations/current', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      carId: `car-${memberId}`, arrival, crew: people,
      attendanceType: arrival === 'Pátek' ? 'full_weekend' : 'saturday_only',
      accommodation, accommodationOptionId: optionId, accommodationUnits,
      showShine: 'Ne', note: '',
    }),
  });
  return workerModule.putCurrentReservation(request, { DB: d1Binding(db) }, { uid: memberId }, 'https://e36united.cz');
}

async function setAdminReservationStatus(db, reservationId, status) {
  const request = new Request(`https://api.e36united.cz/api/admin/reservations/${reservationId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, reviewNote: '' }),
  });
  return workerModule.patchAdminReservation(request, { DB: d1Binding(db) }, { uid: 'admin' }, reservationId, 'https://e36united.cz');
}

test('1. four people in a max-four cabin use one physical unit', () => {
  assert.equal(price({ people: 4, capacity: 4, unitPrice: 2400 }).unitCount, 1);
});

test('2. five people in a max-four cabin use two physical units', () => {
  assert.equal(price({ people: 5, capacity: 4, unitPrice: 2400 }).unitCount, 2);
});

test('3. server unit price is charged per physical unit per night', () => {
  const event = { full_weekend_nights: 2, saturday_only_nights: 1 };
  const option = {
    capacity_per_unit: 4, unit_price_czk: 2400, person_price_czk: 0,
    bedding_fee_per_person_czk: 0, city_tax_per_person_per_night_czk: 0,
  };
  assert.equal(workerModule.calculateAccommodationPricing(event, option, 4, 'full_weekend').baseTotalCzk, 4800);
  assert.equal(workerModule.calculateAccommodationPricing(event, option, 4, 'saturday_only').baseTotalCzk, 2400);
  assert.equal(workerModule.calculateAccommodationPricing(event, option, 5, 'full_weekend').baseTotalCzk, 9600);
});

test('4. per-person price and bedding are charged once per accommodated person', () => {
  const event = { full_weekend_nights: 2, saturday_only_nights: 1 };
  const option = {
    capacity_per_unit: 4, unit_price_czk: 2400, person_price_czk: 80,
    bedding_fee_per_person_czk: 120, city_tax_per_person_per_night_czk: 0,
  };
  const friday = workerModule.calculateAccommodationPricing(event, option, 4, 'full_weekend');
  const saturday = workerModule.calculateAccommodationPricing(event, option, 4, 'saturday_only');
  assert.equal(friday.personTotalCzk, 320);
  assert.equal(saturday.personTotalCzk, 320);
  assert.equal(friday.beddingTotalCzk, 480);
  assert.equal(saturday.beddingTotalCzk, 480);
});

test('5. Friday and Saturday use event-configured night counts', () => {
  const event = { full_weekend_nights: 2, saturday_only_nights: 1 };
  const option = {
    capacity_per_unit: 4, unit_price_czk: 2400, person_price_czk: 0,
    bedding_fee_per_person_czk: 0, city_tax_per_person_per_night_czk: 50,
  };
  const friday = workerModule.calculateAccommodationPricing(event, option, 4, 'full_weekend');
  const saturday = workerModule.calculateAccommodationPricing(event, option, 4, 'saturday_only');
  assert.equal(friday.cityTaxTotalCzk, 400);
  assert.equal(saturday.cityTaxTotalCzk, 200);
});

test('6. the final available cabin can be reserved', async () => {
  const db = database(); addOption(db, { units: 2 });
  addAllocation(db, { reservationId: 'r1', memberId: 'm1', units: 1 });
  const response=await submitWorkerReservation(db,{memberId:'m2',people:4});
  assert.equal(response.status, 200);
  assert.equal(blockedUnits(db), 2);
  assert.equal(db.prepare("SELECT total_czk FROM reservation_accommodation WHERE reservation_id=(SELECT id FROM reservations WHERE member_id='m2')").get().total_czk, 5680);
  const editResponse=await submitWorkerReservation(db,{memberId:'m2',people:4});
  assert.equal(editResponse.status,200,'an edit excludes the member own existing allocation');
  assert.equal(db.prepare("SELECT COUNT(*) AS value FROM reservations WHERE member_id='m2'").get().value,1);
});

test('7. a reservation beyond physical inventory returns conflict', async () => {
  const db = database(); addOption(db, { units: 1 });
  addAllocation(db, { reservationId: 'r1', memberId: 'm1', units: 1 });
  const response=await submitWorkerReservation(db,{memberId:'m2',people:4});
  assert.equal(response.status, 409);
  assert.equal(db.prepare("SELECT COUNT(*) AS value FROM reservations WHERE member_id='m2'").get().value, 0);
});

test('8. rejected reservations release blocked capacity', () => {
  const db = database(); addOption(db, { units: 1 });
  addAllocation(db, { reservationId: 'r1', memberId: 'm1', units: 1, status: 'rejected' });
  assert.equal(blockedUnits(db), 0);
  assert.equal(saveIfCapacity(db, { reservationId: 'r2', memberId: 'm2', units: 1, people: 4 }), 200);
});

test('9. re-approval is rejected when capacity is already full', async () => {
  const db = database(); addOption(db, { units: 1 });
  addAllocation(db, { reservationId: 'r1', memberId: 'm1', units: 1, status: 'rejected' });
  addAllocation(db, { reservationId: 'r2', memberId: 'm2', units: 1, status: 'approved' });
  const request=new Request('https://api.e36united.cz/api/admin/reservations/r1',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'approved',reviewNote:''})});
  const response=await workerModule.patchAdminReservation(request,{DB:d1Binding(db)},{uid:'admin'},'r1','https://e36united.cz');
  assert.equal(response.status,409);
  assert.equal(db.prepare("SELECT status FROM reservations WHERE id='r1'").get().status,'rejected');
  assert.equal(db.prepare('SELECT COUNT(*) AS value FROM admin_actions').get().value,0);
});

test('10. admin cannot lower capacity below active blocked units', async () => {
  const db = database();
  const createRequest=new Request('https://api.e36united.cz/api/admin/accommodation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventId:'event-2026',name:'Chatka A',kind:'cabin',inventoryMode:'limited',unitsTotal:3,capacityPerUnit:4,unitPriceCzk:2400,personPriceCzk:0,beddingFeePerPersonCzk:120,cityTaxPerPersonPerNightCzk:50,active:true})});
  const createResponse=await workerModule.createAdminAccommodation(createRequest,{DB:d1Binding(db)},{uid:'admin'},'https://e36united.cz');
  assert.equal(createResponse.status,201);
  const optionId=(await createResponse.json()).option.id;
  addAllocation(db, { reservationId: 'r1', memberId: 'm1', optionId, units: 2 });
  const request=new Request(`https://api.e36united.cz/api/admin/accommodation/${optionId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({unitsTotal:1})});
  const response=await workerModule.patchAdminAccommodation(request,{DB:d1Binding(db)},{uid:'admin'},optionId,'https://e36united.cz');
  assert.equal(response.status,409);
  assert.equal(db.prepare('SELECT units_total FROM event_accommodation_options WHERE id=?').get(optionId).units_total, 3);
  assert.equal(db.prepare('SELECT COUNT(*) AS value FROM admin_actions').get().value,1,'only the successful create is audited');
});

test('11. later price changes do not alter an existing reservation snapshot', () => {
  const db = database(); addOption(db);
  addAllocation(db, { reservationId: 'r1', memberId: 'm1', units: 1, total: 5680 });
  db.prepare("UPDATE event_accommodation_options SET capacity_per_unit=2, unit_price_czk=9999, bedding_fee_per_person_czk=999 WHERE id='cabin-a'").run();
  const snapshot = db.prepare("SELECT unit_count, unit_price_czk, bedding_fee_per_person_czk, total_czk FROM reservation_accommodation WHERE reservation_id='r1'").get();
  assert.deepEqual({ ...snapshot }, { unit_count: 1, unit_price_czk: 2400, bedding_fee_per_person_czk: 120, total_czk: 5680 });
});

test('12. legacy reservation without snapshot remains readable', () => {
  const db = database(); addOption(db);
  db.prepare("INSERT INTO reservations (id,member_id,event_id,accommodation,accommodation_units,status) VALUES ('legacy','m1','event-2026','Chatka',3,'approved')").run();
  const row = db.prepare('SELECT r.accommodation, r.accommodation_units, ra.reservation_id AS snapshot_id FROM reservations r LEFT JOIN reservation_accommodation ra ON ra.reservation_id=r.id WHERE r.id=?').get('legacy');
  assert.deepEqual({ ...row }, { accommodation: 'Chatka', accommodation_units: 3, snapshot_id: null });
});

test('13. event selector scopes reservations to the selected year', async () => {
  const db = database([{ id: 'event-2025', year: 2025, status: 'closed' }, { id: 'event-2026', year: 2026, status: 'open' }]);
  db.prepare("INSERT INTO members (id,name,email,member_code) VALUES ('m25','Member 25','m25@example.test','EU-25'),('m26','Member 26','m26@example.test','EU-26')").run();
  db.prepare("INSERT INTO reservations (id,member_id,event_id,status) VALUES ('r25','m25','event-2025','approved'),('r26','m26','event-2026','pending')").run();
  const response25=await workerModule.getAdminReservations({DB:d1Binding(db)},new URL('https://api.e36united.cz/api/admin/reservations?eventId=event-2025'),'https://e36united.cz');
  const response26=await workerModule.getAdminReservations({DB:d1Binding(db)},new URL('https://api.e36united.cz/api/admin/reservations?eventId=event-2026'),'https://e36united.cz');
  assert.deepEqual((await response25.json()).reservations.map(row=>row.id),['r25']);
  assert.deepEqual((await response26.json()).reservations.map(row=>row.id),['r26']);
});

test('14. explicit current event is not automatically MAX(year)', async () => {
  const db = database([{ id: 'event-2025', year: 2025, status: 'closed' }, { id: 'event-2026', year: 2026, status: 'open' }]);
  const request=new Request('https://api.e36united.cz/api/admin/events/event-2025',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({isCurrent:true})});
  const response=await workerModule.patchAdminEvent(request,{DB:d1Binding(db)},{uid:'admin'},'event-2025','https://e36united.cz');
  assert.equal(response.status,200);
  db.prepare("INSERT INTO events (id,year,registration_status,is_current,full_weekend_nights,saturday_only_nights) VALUES ('event-2027',2027,'closed',0,2,1)").run();
  const current = db.prepare('SELECT id FROM events ORDER BY is_current DESC, year DESC LIMIT 1').get();
  assert.equal(current.id, 'event-2025');
  assert.equal(db.prepare('SELECT COUNT(*) AS value FROM events WHERE is_current=1').get().value,1);
  assert.throws(() => db.prepare("UPDATE events SET is_current=1 WHERE id='event-2026'").run(), /UNIQUE constraint failed/);
});

test('15. migration preserves every legacy reservation and selects the newest existing event once', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE events (
      id TEXT PRIMARY KEY, year INTEGER NOT NULL, registration_status TEXT NOT NULL,
      accommodation_capacity INTEGER NOT NULL DEFAULT 0, reservation_capacity INTEGER NOT NULL DEFAULT 0,
      booking_commitment_czk INTEGER NOT NULL DEFAULT 0, booking_due_at TEXT, booking_paid_czk INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE reservations (
      id TEXT PRIMARY KEY, member_id TEXT NOT NULL, event_id TEXT NOT NULL,
      accommodation TEXT, accommodation_units INTEGER NOT NULL, status TEXT NOT NULL,
      amount_due_czk INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO events (id,year,registration_status,accommodation_capacity,reservation_capacity,booking_commitment_czk,booking_due_at,booking_paid_czk) VALUES
      ('event-2024',2024,'closed',40,100,10000,'2024-05-01',5000),
      ('event-2025',2025,'closed',50,120,12000,'2025-05-01',12000),
      ('event-2026',2026,'open',60,150,18000,'2026-05-01',3000);
    INSERT INTO reservations (id,member_id,event_id,accommodation,accommodation_units,status,amount_due_czk) VALUES
      ('legacy-pending','m1','event-2026','Chatka',4,'pending',0),
      ('legacy-approved','m2','event-2026','Stan',2,'approved',0),
      ('legacy-rejected','m3','event-2025','Chatka',3,'rejected',0),
      ('legacy-cancelled','m4','event-2025','Stan',1,'cancelled',0),
      ('legacy-none','m5','event-2024','Bez ubytování',0,'approved',0);
  `);
  const beforeReservations = db.prepare('SELECT * FROM reservations ORDER BY id').all();
  const beforeEvents = db.prepare('SELECT id,year,registration_status,accommodation_capacity,reservation_capacity,booking_commitment_czk,booking_due_at,booking_paid_czk FROM events ORDER BY id').all();

  db.exec(migration);

  assert.deepEqual(db.prepare('SELECT id,year,registration_status,accommodation_capacity,reservation_capacity,booking_commitment_czk,booking_due_at,booking_paid_czk FROM events ORDER BY id').all(), beforeEvents);
  assert.deepEqual(db.prepare('SELECT id,member_id,event_id,accommodation,accommodation_units,status,amount_due_czk FROM reservations ORDER BY id').all(), beforeReservations);
  assert.equal(db.prepare('SELECT COUNT(*) AS value FROM reservations').get().value, 5);
  assert.equal(db.prepare('SELECT COUNT(*) AS value FROM reservation_accommodation').get().value, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS value FROM event_accommodation_options').get().value, 0);
  assert.equal(db.prepare('SELECT id FROM events WHERE is_current=1').get().id, 'event-2026');

  db.prepare("INSERT INTO events (id,year,registration_status) VALUES ('event-2030',2030,'closed')").run();
  assert.equal(db.prepare('SELECT id FROM events WHERE is_current=1').get().id, 'event-2026');
});

test('16. unlimited inventory ignores units_total but keeps a positive capacity per unit', async () => {
  const db = database(); addOption(db, { inventory: 'unlimited', units: 0, capacity: 4 });
  const response = await submitWorkerReservation(db, { memberId: 'm1', people: 8 });
  assert.equal(response.status, 200);
  const snapshot = db.prepare("SELECT people_count,unit_count FROM reservation_accommodation WHERE reservation_id=(SELECT id FROM reservations WHERE member_id='m1')").get();
  assert.deepEqual({ ...snapshot }, { people_count: 8, unit_count: 2 });
});

test('17. day visit ignores a supplied option and stores no accommodation charge or allocation', async () => {
  const db = database(); addOption(db, { units: 1 });
  const response = await submitWorkerReservation(db, { memberId: 'm1', people: 4, arrival: 'Jen na otočku' });
  assert.equal(response.status, 200);
  const reservation = db.prepare("SELECT attendance_type,accommodation,accommodation_units,amount_due_czk FROM reservations WHERE member_id='m1'").get();
  assert.deepEqual({ ...reservation }, { attendance_type: 'day_visit', accommodation: 'Bez ubytování', accommodation_units: 0, amount_due_czk: 0 });
  const noAccommodationResponse = await submitWorkerReservation(db, { memberId: 'm2', people: 4, accommodation: 'Bez ubytování', accommodationUnits: 4 });
  assert.equal(noAccommodationResponse.status, 200);
  const noAccommodation = db.prepare("SELECT accommodation,accommodation_units,amount_due_czk FROM reservations WHERE member_id='m2'").get();
  assert.deepEqual({ ...noAccommodation }, { accommodation: 'Bez ubytování', accommodation_units: 0, amount_due_czk: 0 });
  assert.equal(db.prepare('SELECT COUNT(*) AS value FROM reservation_accommodation').get().value, 0);
  assert.equal(blockedUnits(db), 0);
});

test('18. an explicit member edit reprices and replaces the snapshot from current configuration', async () => {
  const db = database(); addOption(db);
  assert.equal((await submitWorkerReservation(db, { memberId: 'm1', people: 4 })).status, 200);
  assert.equal(db.prepare("SELECT total_czk FROM reservation_accommodation WHERE reservation_id=(SELECT id FROM reservations WHERE member_id='m1')").get().total_czk, 5680);
  db.prepare("UPDATE event_accommodation_options SET capacity_per_unit=2,unit_price_czk=3000 WHERE id='cabin-a'").run();
  assert.equal((await submitWorkerReservation(db, { memberId: 'm1', people: 4 })).status, 200);
  const snapshot = db.prepare("SELECT people_count,unit_count,unit_price_czk,total_czk FROM reservation_accommodation WHERE reservation_id=(SELECT id FROM reservations WHERE member_id='m1')").get();
  assert.deepEqual({ ...snapshot }, { people_count: 4, unit_count: 2, unit_price_czk: 3000, total_czk: 12880 });
});

test('19. two concurrent member requests cannot both take the final limited unit', async () => {
  const db = database(); addOption(db, { units: 1 });
  const responses = await Promise.all([
    submitWorkerReservation(db, { memberId: 'm1', people: 4 }),
    submitWorkerReservation(db, { memberId: 'm2', people: 4 }),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.equal(blockedUnits(db), 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS value FROM reservations').get().value, 1);
});

test('20. concurrent rejected and cancelled re-approvals cannot both take the final unit', async () => {
  const db = database(); addOption(db, { units: 1 });
  addAllocation(db, { reservationId: 'r1', memberId: 'm1', status: 'rejected' });
  addAllocation(db, { reservationId: 'r2', memberId: 'm2', status: 'cancelled' });
  const responses = await Promise.all([
    setAdminReservationStatus(db, 'r1', 'approved'),
    setAdminReservationStatus(db, 'r2', 'approved'),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.equal(blockedUnits(db), 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS value FROM admin_actions').get().value, 1);
});

test('21. capacity lowering and a concurrent final reservation cannot create overbooking', async () => {
  const db = database(); addOption(db, { units: 1 });
  const request = new Request('https://api.e36united.cz/api/admin/accommodation/cabin-a', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unitsTotal: 0 }),
  });
  const responses = await Promise.all([
    workerModule.patchAdminAccommodation(request, { DB: d1Binding(db) }, { uid: 'admin' }, 'cabin-a', 'https://e36united.cz'),
    submitWorkerReservation(db, { memberId: 'm1', people: 4 }),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const unitsTotal = db.prepare("SELECT units_total FROM event_accommodation_options WHERE id='cabin-a'").get().units_total;
  assert.ok(blockedUnits(db) <= unitsTotal);
});
