import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const migration = readFileSync(new URL('../D1-event-accommodation-v1.sql', import.meta.url), 'utf8');
const paymentMigration = readFileSync(new URL('../D1-reservation-payments-v1.sql', import.meta.url), 'utf8');
const plannerMigration = readFileSync(new URL('../D1-member-planner-drafts-v1.sql', import.meta.url), 'utf8');
const workerSource = readFileSync(new URL('../cloudflare-worker-media.js', import.meta.url), 'utf8');
const workerModule = await import(`data:text/javascript;base64,${Buffer.from(`${workerSource}\nexport { putCurrentReservation, getCurrentReservation, patchAdminReservation, patchAdminReservationPayment, createAdminAccommodation, patchAdminAccommodation, patchAdminEvent, getAdminReservations, getAdminAccommodation, putAdminAccommodationPhoto, deleteAdminAccommodationPhoto, publicAccommodationMedia, calculateAccommodationPricing };`).toString('base64')}`);

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
      payment_confirmed_by TEXT, payment_confirmed_at TEXT,
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
  db.exec(plannerMigration);
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
    WHERE ra.option_id = ? AND r.status = 'approved'
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
        WHERE ra.option_id = o.id AND r.status = 'approved' AND r.id <> ?
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

async function submitWorkerReservation(db, { memberId, reservationId = null, people = 4, arrival = 'Pátek', accommodation = 'Chatka', optionId = 'cabin-a', accommodationUnits = people, extraBody = {} }) {
  db.prepare('INSERT OR IGNORE INTO members (id) VALUES (?)').run(memberId);
  db.prepare('INSERT OR IGNORE INTO cars (id, member_id, model, body, year, color, nickname) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(`car-${memberId}`, memberId, '328i', 'Coupé', 1996, 'Modrá', 'Test E36');
  const request = new Request('https://api.e36united.cz/api/reservations/current', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reservationId, carId: `car-${memberId}`, arrival, crew: people,
      attendanceType: arrival === 'Pátek' ? 'full_weekend' : 'saturday_only',
      accommodation, accommodationOptionId: optionId, accommodationUnits,
      showShine: 'Ne', note: '',
      ...extraBody,
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

async function setAdminPaidAmount(db, reservationId, amountPaidCzk) {
  const request = new Request(`https://api.e36united.cz/api/admin/reservations/${reservationId}/payment`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amountPaidCzk }),
  });
  return workerModule.patchAdminReservationPayment(request, { DB: d1Binding(db) }, { uid: 'admin' }, reservationId, 'https://e36united.cz');
}

class MemoryMedia {
  constructor(){this.objects=new Map();this.writes=0}
  async put(key,body,options={}){const bytes=new Uint8Array(await new Response(body).arrayBuffer()),etag=`etag-${++this.writes}`;this.objects.set(key,{bytes,etag,httpEtag:`"${etag}"`,httpMetadata:options.httpMetadata||{},customMetadata:options.customMetadata||{}})}
  async head(key){const value=this.objects.get(key);return value?{etag:value.etag,httpEtag:value.httpEtag,size:value.bytes.byteLength}:null}
  async get(key){const value=this.objects.get(key);return value?{body:value.bytes,etag:value.etag,httpEtag:value.httpEtag,writeHttpMetadata(headers){if(value.httpMetadata.contentType)headers.set('Content-Type',value.httpMetadata.contentType)}}:null}
  async delete(key){this.objects.delete(key)}
}

function configureTestPayment(db) {
  db.prepare(`
    UPDATE events
    SET payment_recipient_name='E36 UNITED TEST', payment_account_display='123 / 9999',
        payment_iban='CZ5099990000000000000123', payment_message_prefix='E36 UNITED 2026', payment_test_mode=1
    WHERE id='event-2026'
  `).run();
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
  addAllocation(db, { reservationId: 'r1', memberId: 'm1', units: 1, status: 'approved' });
  const response=await submitWorkerReservation(db,{memberId:'m2',people:4});
  assert.equal(response.status, 200);
  assert.equal(blockedUnits(db), 1);
  assert.equal(db.prepare("SELECT total_czk FROM reservation_accommodation WHERE reservation_id=(SELECT id FROM reservations WHERE member_id='m2')").get().total_czk, 5680);
  const reservationId=db.prepare("SELECT id FROM reservations WHERE member_id='m2'").get().id;
  const editResponse=await submitWorkerReservation(db,{memberId:'m2',reservationId,people:4});
  assert.equal(editResponse.status,200,'an edit excludes the member own existing allocation');
  assert.equal(db.prepare("SELECT COUNT(*) AS value FROM reservations WHERE member_id='m2'").get().value,1);
});

test('7. a reservation beyond physical inventory returns conflict', async () => {
  const db = database(); addOption(db, { units: 1 });
  addAllocation(db, { reservationId: 'r1', memberId: 'm1', units: 1, status: 'approved' });
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
  addAllocation(db, { reservationId: 'r1', memberId: 'm1', optionId, units: 2, status: 'approved' });
  const request=new Request(`https://api.e36united.cz/api/admin/accommodation/${optionId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({unitsTotal:1})});
  const response=await workerModule.patchAdminAccommodation(request,{DB:d1Binding(db)},{uid:'admin'},optionId,'https://e36united.cz');
  assert.equal(response.status,409);
  assert.equal(db.prepare('SELECT units_total FROM event_accommodation_options WHERE id=?').get(optionId).units_total, 3);
  assert.equal(db.prepare('SELECT COUNT(*) AS value FROM admin_actions').get().value,1,'only the successful create is audited');
});

test('10a. capacity may be reduced exactly to approved usage', async () => {
  const db=database();addOption(db,{units:10});addAllocation(db,{reservationId:'r-approved',memberId:'m-approved',units:8,status:'approved'});
  const request=new Request('https://api.e36united.cz/api/admin/accommodation/cabin-a',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({unitsTotal:8})});
  const response=await workerModule.patchAdminAccommodation(request,{DB:d1Binding(db)},{uid:'admin'},'cabin-a','https://e36united.cz');
  assert.equal(response.status,200);assert.equal(db.prepare("SELECT units_total FROM event_accommodation_options WHERE id='cabin-a'").get().units_total,8);
});

test('10b. capacity reduction below ten approved units is blocked with a clear message', async () => {
  const db=database();addOption(db,{units:10});addAllocation(db,{reservationId:'r-approved',memberId:'m-approved',units:10,status:'approved'});
  const request=new Request('https://api.e36united.cz/api/admin/accommodation/cabin-a',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({unitsTotal:8})});
  const response=await workerModule.patchAdminAccommodation(request,{DB:d1Binding(db)},{uid:'admin'},'cabin-a','https://e36united.cz');
  assert.equal(response.status,409);assert.equal((await response.json()).message,'Kapacitu nelze snížit na 8. Aktuálně je potvrzeno 10 jednotek.');
});

test('10c. pending demand remains visible when capacity is reduced to approved usage', async () => {
  const db=database();addOption(db,{units:10});addAllocation(db,{reservationId:'r-approved',memberId:'m-approved',units:8,status:'approved'});addAllocation(db,{reservationId:'r-pending',memberId:'m-pending',units:2,status:'pending'});
  const request=new Request('https://api.e36united.cz/api/admin/accommodation/cabin-a',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({unitsTotal:8})});
  const response=await workerModule.patchAdminAccommodation(request,{DB:d1Binding(db)},{uid:'admin'},'cabin-a','https://e36united.cz'),option=(await response.json()).option;
  assert.equal(response.status,200);assert.deepEqual({approved:option.approvedUnits,pending:option.pendingUnits,free:option.freeUnits,conflict:option.pendingConflictUnits},{approved:8,pending:2,free:0,conflict:2});
});

test('10d. approval at full capacity is rejected while the last available approval succeeds', async () => {
  const full=database();addOption(full,{units:10});addAllocation(full,{reservationId:'r-approved',memberId:'m-approved',units:10,status:'approved'});addAllocation(full,{reservationId:'r-pending',memberId:'m-pending',units:1,status:'pending'});
  assert.equal((await setAdminReservationStatus(full,'r-pending','approved')).status,409);assert.equal(blockedUnits(full),10);
  const available=database();addOption(available,{units:10});addAllocation(available,{reservationId:'r-approved',memberId:'m-approved',units:9,status:'approved'});addAllocation(available,{reservationId:'r-pending',memberId:'m-pending',units:1,status:'pending'});
  assert.equal((await setAdminReservationStatus(available,'r-pending','approved')).status,200);assert.equal(blockedUnits(available),10);
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
  const response = await submitWorkerReservation(db, { memberId: 'm1', people: 5 });
  assert.equal(response.status, 200);
  const snapshot = db.prepare("SELECT people_count,unit_count FROM reservation_accommodation WHERE reservation_id=(SELECT id FROM reservations WHERE member_id='m1')").get();
  assert.deepEqual({ ...snapshot }, { people_count: 5, unit_count: 2 });
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
  const reservationId = db.prepare("SELECT id FROM reservations WHERE member_id='m1'").get().id;
  assert.equal(db.prepare("SELECT total_czk FROM reservation_accommodation WHERE reservation_id=(SELECT id FROM reservations WHERE member_id='m1')").get().total_czk, 5680);
  db.prepare("UPDATE event_accommodation_options SET capacity_per_unit=2,unit_price_czk=3000 WHERE id='cabin-a'").run();
  assert.equal((await submitWorkerReservation(db, { memberId: 'm1', reservationId, people: 4 })).status, 200);
  const snapshot = db.prepare("SELECT people_count,unit_count,unit_price_czk,total_czk FROM reservation_accommodation WHERE reservation_id=(SELECT id FROM reservations WHERE member_id='m1')").get();
  assert.deepEqual({ ...snapshot }, { people_count: 4, unit_count: 2, unit_price_czk: 3000, total_czk: 12880 });
});

test('19. pending member requests remain demand and do not consume confirmed capacity', async () => {
  const db = database(); addOption(db, { units: 1 });
  const responses = await Promise.all([
    submitWorkerReservation(db, { memberId: 'm1', people: 4 }),
    submitWorkerReservation(db, { memberId: 'm2', people: 4 }),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 200]);
  assert.equal(blockedUnits(db), 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS value FROM reservations').get().value, 2);
});

test('20. concurrent pending approvals cannot both take the final unit', async () => {
  const db = database(); addOption(db, { units: 1 });
  addAllocation(db, { reservationId: 'r1', memberId: 'm1', status: 'pending' });
  addAllocation(db, { reservationId: 'r2', memberId: 'm2', status: 'pending' });
  const responses = await Promise.all([
    setAdminReservationStatus(db, 'r1', 'approved'),
    setAdminReservationStatus(db, 'r2', 'approved'),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.equal(blockedUnits(db), 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS value FROM admin_actions').get().value, 1);
});

test('21. capacity lowering and a concurrent approval cannot create confirmed overbooking', async () => {
  const db = database(); addOption(db, { units: 1 });
  addAllocation(db, { reservationId: 'r1', memberId: 'm1', status: 'pending' });
  const request = new Request('https://api.e36united.cz/api/admin/accommodation/cabin-a', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unitsTotal: 0 }),
  });
  const responses = await Promise.all([
    workerModule.patchAdminAccommodation(request, { DB: d1Binding(db) }, { uid: 'admin' }, 'cabin-a', 'https://e36united.cz'),
    setAdminReservationStatus(db, 'r1', 'approved'),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const unitsTotal = db.prepare("SELECT units_total FROM event_accommodation_options WHERE id='cabin-a'").get().units_total;
  assert.ok(blockedUnits(db) <= unitsTotal);
});

test('22. a second active create is rejected without changing the existing reservation', async () => {
  const db = database(); addOption(db);
  const first = await submitWorkerReservation(db, { memberId: 'm1', people: 4 });
  assert.equal(first.status, 200);
  const original = db.prepare("SELECT id,crew,status FROM reservations WHERE member_id='m1'").get();
  const duplicate = await submitWorkerReservation(db, { memberId: 'm1', people: 2 });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error, 'active_reservation_exists');
  assert.deepEqual({ ...db.prepare("SELECT id,crew,status FROM reservations WHERE member_id='m1'").get() }, { ...original });
  db.prepare("UPDATE reservations SET status='approved' WHERE member_id='m1'").run();
  const approvedDuplicate = await submitWorkerReservation(db, { memberId: 'm1', people: 2 });
  assert.equal(approvedDuplicate.status, 409);
  assert.equal((await approvedDuplicate.json()).error, 'active_reservation_exists');
  assert.deepEqual({ ...db.prepare("SELECT id,crew,status FROM reservations WHERE member_id='m1'").get() }, { id: original.id, crew: original.crew, status: 'approved' });
});

test('23. another member may reserve the same event and one member may reserve another event', async () => {
  const db = database([
    { id: 'event-2026', year: 2026, status: 'open' },
    { id: 'event-2027', year: 2027, status: 'open' },
  ]);
  db.exec("UPDATE events SET is_current=0; UPDATE events SET is_current=1 WHERE id='event-2026'");
  addOption(db, { id: 'cabin-2026', eventId: 'event-2026' });
  assert.equal((await submitWorkerReservation(db, { memberId: 'm1', optionId: 'cabin-2026' })).status, 200);
  assert.equal((await submitWorkerReservation(db, { memberId: 'm2', optionId: 'cabin-2026' })).status, 200);
  db.exec("UPDATE events SET is_current=0; UPDATE events SET is_current=1 WHERE id='event-2027'");
  addOption(db, { id: 'cabin-2027', eventId: 'event-2027' });
  assert.equal((await submitWorkerReservation(db, { memberId: 'm1', optionId: 'cabin-2027' })).status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS value FROM reservations WHERE member_id='m1'").get().value, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS value FROM reservations WHERE event_id='event-2026'").get().value, 2);
});

test('24. explicit edits keep the reservation id and cannot target another member reservation', async () => {
  const db = database(); addOption(db);
  assert.equal((await submitWorkerReservation(db, { memberId: 'm1', people: 4 })).status, 200);
  const reservationId = db.prepare("SELECT id FROM reservations WHERE member_id='m1'").get().id;
  const edit = await submitWorkerReservation(db, { memberId: 'm1', reservationId, people: 3, accommodationUnits: 3 });
  assert.equal(edit.status, 200);
  assert.deepEqual({ ...db.prepare("SELECT id,crew,status FROM reservations WHERE member_id='m1'").get() }, { id: reservationId, crew: 3, status: 'pending' });
  const attack = await submitWorkerReservation(db, { memberId: 'm2', reservationId, people: 2, accommodationUnits: 2 });
  assert.equal(attack.status, 404);
  assert.equal((await attack.json()).error, 'reservation_not_found');
  assert.equal(db.prepare("SELECT COUNT(*) AS value FROM reservations WHERE member_id='m2'").get().value, 0);
});

test('25. rejected and cancelled history requires an explicit same-id resubmission', async () => {
  for (const status of ['rejected', 'cancelled']) {
    const db = database(); addOption(db);
    assert.equal((await submitWorkerReservation(db, { memberId: 'm1' })).status, 200);
    const reservationId = db.prepare("SELECT id FROM reservations WHERE member_id='m1'").get().id;
    db.prepare('UPDATE reservations SET status=? WHERE id=?').run(status, reservationId);
    const implicit = await submitWorkerReservation(db, { memberId: 'm1', people: 3, accommodationUnits: 3 });
    assert.equal(implicit.status, 409);
    assert.equal((await implicit.json()).error, 'reservation_edit_required');
    assert.equal(db.prepare('SELECT status FROM reservations WHERE id=?').get(reservationId).status, status);
    const explicit = await submitWorkerReservation(db, { memberId: 'm1', reservationId, people: 3, accommodationUnits: 3 });
    assert.equal(explicit.status, 200);
    assert.deepEqual({ ...db.prepare('SELECT id,status,crew FROM reservations WHERE member_id=?').get('m1') }, { id: reservationId, status: 'pending', crew: 3 });
  }
});

test('26. concurrent same-member creates produce one reservation and one controlled conflict', async () => {
  const db = database(); addOption(db);
  const responses = await Promise.all([
    submitWorkerReservation(db, { memberId: 'm1', people: 4 }),
    submitWorkerReservation(db, { memberId: 'm1', people: 4 }),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.equal(db.prepare("SELECT COUNT(*) AS value FROM reservations WHERE member_id='m1' AND event_id='event-2026'").get().value, 1);
});

test('27. crew accepts only integers from one through five', async () => {
  for (const people of [1, 5]) {
    const db = database();
    const response = await submitWorkerReservation(db, { memberId: `ok-${people}`, people, arrival: 'Jen na otočku' });
    assert.equal(response.status, 200, `crew ${people} is accepted`);
  }
  for (const [index, people] of [0, -1, 6, 8, 999, 1.5, 'abc'].entries()) {
    const db = database();
    const response = await submitWorkerReservation(db, { memberId: `bad-${index}`, people, arrival: 'Jen na otočku' });
    assert.equal(response.status, 400, `crew ${people} is rejected`);
    assert.equal((await response.json()).error, 'invalid_crew');
    assert.equal(db.prepare('SELECT COUNT(*) AS value FROM reservations').get().value, 0);
  }
});

test('28. a legacy crew-eight reservation stays readable and unchanged until reduced', async () => {
  const db = database();
  db.prepare("INSERT INTO members (id) VALUES ('legacy-member')").run();
  db.prepare("INSERT INTO cars (id,member_id,model,body,year) VALUES ('car-legacy-member','legacy-member','328i','Coupé',1996)").run();
  db.prepare("INSERT INTO reservations (id,member_id,event_id,car_id,crew,arrival,accommodation,accommodation_units,show_shine,status) VALUES ('legacy-eight','legacy-member','event-2026','car-legacy-member',8,'Jen na otočku','Bez ubytování',0,'Ne','approved')").run();
  const adminResponse = await workerModule.getAdminReservations({ DB: d1Binding(db) }, new URL('https://api.e36united.cz/api/admin/reservations?eventId=event-2026'), 'https://e36united.cz');
  assert.equal(adminResponse.status, 200);
  assert.equal((await adminResponse.json()).reservations.find(row => row.id === 'legacy-eight').crew, 8);
  const readable = await workerModule.getCurrentReservation({ DB: d1Binding(db) }, { uid: 'legacy-member' }, 'https://e36united.cz');
  assert.equal(readable.status, 200);
  assert.equal((await readable.json()).reservation.crew, 8);
  const unchanged = await submitWorkerReservation(db, { memberId: 'legacy-member', reservationId: 'legacy-eight', people: 8, arrival: 'Jen na otočku' });
  assert.equal(unchanged.status, 400);
  assert.deepEqual({ ...db.prepare("SELECT id,crew,status FROM reservations WHERE id='legacy-eight'").get() }, { id: 'legacy-eight', crew: 8, status: 'approved' });
  const reduced = await submitWorkerReservation(db, { memberId: 'legacy-member', reservationId: 'legacy-eight', people: 5, arrival: 'Jen na otočku' });
  assert.equal(reduced.status, 200);
  assert.deepEqual({ ...db.prepare("SELECT id,crew,status FROM reservations WHERE id='legacy-eight'").get() }, { id: 'legacy-eight', crew: 5, status: 'pending' });
});

test('29. paid reservations reconcile the four required edit scenarios without changing identity', async t => {
  const scenarios = [
    { name: 'fully paid becomes more expensive', paid: 4800, total: 6000, status: 'underpaid', remaining: 1200, overpayment: 0, qrAmount: '1200.00' },
    { name: 'fully paid keeps the same total', paid: 4800, total: 4800, status: 'paid', remaining: 0, overpayment: 0, qrAmount: null },
    { name: 'fully paid becomes cheaper', paid: 4800, total: 3000, status: 'overpaid', remaining: 0, overpayment: 1800, qrAmount: null },
    { name: 'partially paid becomes more expensive', paid: 1200, total: 5000, status: 'underpaid', remaining: 3800, overpayment: 0, qrAmount: '3800.00' },
  ];

  for (const scenario of scenarios) await t.test(scenario.name, async () => {
    const db = database();
    addOption(db, { capacity: 5, unitPrice: 2400, bedding: 0, tax: 0 });
    configureTestPayment(db);
    assert.equal((await submitWorkerReservation(db, { memberId: 'm1', people: 4 })).status, 200);
    const created = db.prepare("SELECT id,payment_vs FROM reservations WHERE member_id='m1'").get();
    assert.equal((await setAdminReservationStatus(db, created.id, 'approved')).status, 200);
    assert.equal((await setAdminPaidAmount(db, created.id, scenario.paid)).status, 200);
    const beforeEdit = db.prepare('SELECT id,payment_vs,amount_paid_czk,paid_at FROM reservations WHERE id=?').get(created.id);

    db.prepare("UPDATE event_accommodation_options SET unit_price_czk=? WHERE id='cabin-a'").run(scenario.total / 2);
    const editResponse = await submitWorkerReservation(db, { memberId: 'm1', reservationId: created.id, people: 3, accommodationUnits: 3 });
    assert.equal(editResponse.status, 200);
    const pending = (await editResponse.json()).reservation;
    assert.equal(pending.id, created.id);
    assert.equal(pending.status, 'pending');
    assert.equal(pending.changePending, true);
    assert.equal(pending.amountDueCzk, scenario.total);
    assert.equal(pending.amountPaidCzk, scenario.paid);
    assert.equal(pending.payment.variableSymbol, created.payment_vs);
    assert.equal(pending.payment.amountPaidCzk, scenario.paid);
    assert.equal(pending.payment.spayd, null);
    assert.equal(pending.payment.actionable, false);
    assert.equal(pending.payment.configurationReady, false);
    const storedPending = db.prepare('SELECT id,payment_vs,amount_paid_czk,paid_at FROM reservations WHERE id=?').get(created.id);
    assert.deepEqual({ ...storedPending }, { ...beforeEdit });

    assert.equal((await setAdminReservationStatus(db, created.id, 'approved')).status, 200);
    const approvedResponse = await workerModule.getCurrentReservation({ DB: d1Binding(db) }, { uid: 'm1' }, 'https://e36united.cz');
    assert.equal(approvedResponse.status, 200);
    const approved = (await approvedResponse.json()).reservation;
    assert.equal(approved.id, created.id);
    assert.equal(approved.payment.variableSymbol, created.payment_vs);
    assert.equal(approved.payment.amountPaidCzk, scenario.paid);
    assert.equal(approved.payment.balanceCzk, scenario.total - scenario.paid);
    assert.equal(approved.payment.status, scenario.status);
    assert.equal(approved.payment.remainingCzk, scenario.remaining);
    assert.equal(approved.payment.overpaymentCzk, scenario.overpayment);
    if (scenario.qrAmount) assert.match(approved.payment.spayd, new RegExp(`(?:^|\\*)AM:${scenario.qrAmount}(?:\\*|$)`));
    else assert.equal(approved.payment.spayd, null);
  });
});

test('30. member reservation writes reject protected finance and VS fields without changing stored money', async () => {
  const db = database(); addOption(db, { capacity: 5, unitPrice: 2400, bedding: 0, tax: 0 });
  assert.equal((await submitWorkerReservation(db, { memberId: 'm1' })).status, 200);
  const before = db.prepare("SELECT id,amount_due_czk,amount_paid_czk,payment_status,payment_vs FROM reservations WHERE member_id='m1'").get();
  const response = await submitWorkerReservation(db, {
    memberId: 'm1', reservationId: before.id, people: 3, accommodationUnits: 3,
    extraBody: { amountDueCzk: -1, amountPaidCzk: 999999, paymentStatus: 'paid', paymentVs: '1' },
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'protected_financial_fields');
  assert.deepEqual({ ...db.prepare('SELECT id,amount_due_czk,amount_paid_czk,payment_status,payment_vs FROM reservations WHERE id=?').get(before.id) }, { ...before });
});

test('31. accommodation photo upload, replacement, public delivery and removal share one R2 object', async () => {
  const db=database();addOption(db);const MEDIA=new MemoryMedia(),env={DB:d1Binding(db),MEDIA};
  const upload=async bytes=>{const form=new FormData();form.append('file',new Blob([bytes],{type:'image/jpeg'}),'cabin.jpg');return workerModule.putAdminAccommodationPhoto(new Request('https://api.e36united.cz/api/admin/accommodation/cabin-a/photo',{method:'PUT',body:form}),env,{uid:'admin'},'cabin-a','https://e36united.cz')};
  const first=await upload('first-photo');assert.equal(first.status,200);const firstVisual=(await first.json()).visual;assert.equal(firstVisual.hasCustomPhoto,true);assert.match(firstVisual.imageUrl,/\/api\/accommodation\/media\/cabin-a\?v=/);
  const second=await upload('replacement-photo');assert.equal(second.status,200);const secondVisual=(await second.json()).visual;assert.notEqual(secondVisual.version,firstVisual.version,'replacement changes the cache version');
  const publicResponse=await workerModule.publicAccommodationMedia(env,'cabin-a',new URL(`https://api.e36united.cz${secondVisual.imageUrl}`),'https://e36united.cz');assert.equal(publicResponse.status,200);assert.equal(await publicResponse.text(),'replacement-photo');assert.match(publicResponse.headers.get('Cache-Control'),/immutable/);
  const removed=await workerModule.deleteAdminAccommodationPhoto(env,{uid:'admin'},'cabin-a','https://e36united.cz');assert.equal(removed.status,200);assert.equal((await removed.json()).visual.hasCustomPhoto,false);
  const listing=await workerModule.getAdminAccommodation(env,new URL('https://api.e36united.cz/api/admin/accommodation?eventId=event-2026'),'https://e36united.cz');assert.equal((await listing.json()).options[0].visual.hasCustomPhoto,false);
});

test('32. unauthenticated accommodation photo mutation is rejected before R2 or D1 access', async () => {
  let touched=false;const env={DB:{prepare(){touched=true;throw new Error('DB must not be touched')}},MEDIA:{put(){touched=true;throw new Error('R2 must not be touched')}}};
  const response=await workerModule.default.fetch(new Request('https://api.e36united.cz/api/admin/accommodation/cabin-a/photo',{method:'PUT'}),env);
  assert.equal(response.status,401);assert.equal(touched,false);
});
