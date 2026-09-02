import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { selectImageFiles } from '../image-upload.js';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const memberHtml = read('member.html');
const memberJs = read('member.js');
const memberCss = read('member.css');
const galleryJs = read('gallery.js');
const worker = {
  ...await import('../worker/domains.js'),
  default: (await import('../cloudflare-worker-media.js')).default,
};
const garage = await import('../worker/domains/garage.js');

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE members (id TEXT PRIMARY KEY);
    CREATE TABLE cars (
      id TEXT PRIMARY KEY, member_id TEXT NOT NULL, nickname TEXT, model TEXT NOT NULL,
      body TEXT NOT NULL, year INTEGER, color TEXT, is_primary INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE car_photos (
      id TEXT PRIMARY KEY, car_id TEXT NOT NULL, r2_key TEXT NOT NULL, mime_type TEXT,
      size_bytes INTEGER, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE gallery_submissions (
      id TEXT PRIMARY KEY, member_id TEXT NOT NULL, r2_key TEXT NOT NULL, caption TEXT,
      status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_at TEXT
    );
    INSERT INTO members (id) VALUES ('member-a'), ('member-b');
    INSERT INTO cars (id,member_id,nickname,model,body,year,color,is_primary) VALUES
      ('car-a','member-a','Old','325i','Sedan',1994,'Black',1),
      ('car-a2','member-a','Second','318i','Touring',1996,'Green',0),
      ('car-b','member-b','Other','328i','Coupe',1997,'Blue',1);
    INSERT INTO car_photos (id,car_id,r2_key,mime_type,size_bytes,sort_order) VALUES
      ('photo-old','car-a','cars/member-a/car-a/photo-old.jpg','image/jpeg',10,0);
  `);
  return db;
}

function d1(db) {
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

function jsonRequest(body) {
  return new Request('https://api.e36united.cz/api/cars/car-a', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

test('Garage create keeps UID ownership, current primary behavior and list shape', async () => {
  const db = database(), DB = d1(db);
  const profilePointStatement = (env, memberId) => env.DB.prepare('UPDATE members SET id = id WHERE id = ?').bind(memberId);
  const request = new Request('https://api.e36united.cz/api/cars', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: 'New', model: '320i', body: 'Cabrio', year: 1995, color: 'Red' }),
  });

  const response = await garage.createCar(request, { DB }, { uid: 'member-a' }, 'https://e36united.cz', profilePointStatement);
  const payload = await response.json();
  const created = db.prepare('SELECT member_id,nickname,model,body,year,color,is_primary FROM cars WHERE id = ?').get(payload.car.id);
  assert.equal(response.status, 201);
  assert.deepEqual({ ...created }, { member_id: 'member-a', nickname: 'New', model: '320i', body: 'Cabrio', year: 1995, color: 'Red', is_primary: 0 });

  const listed = await (await garage.listCars({ DB }, { uid: 'member-a' }, 'https://e36united.cz')).json();
  assert.equal(listed.cars.length, 3);
  assert.equal(listed.cars.find(car => car.id === payload.car.id).primary, false);
});

test('Garage delete remains owner-scoped and promotes the next owned car', async () => {
  const db = database(), DB = d1(db), deleted = [];
  const response = await garage.deleteCar({ DB, MEDIA: { async delete(key) { deleted.push(key); } } }, { uid: 'member-a' }, 'car-a', 'https://e36united.cz');
  assert.equal(response.status, 200);
  assert.equal(db.prepare("SELECT id FROM cars WHERE id='car-a'").get(), undefined);
  assert.equal(db.prepare("SELECT is_primary FROM cars WHERE id='car-a2'").get().is_primary, 1);
  assert.deepEqual(deleted, ['cars/member-a/car-a/photo-old.jpg']);
  assert.equal(db.prepare("SELECT member_id FROM cars WHERE id='car-b'").get().member_id, 'member-b');
});

test('Garage edit updates the owned row without changing its ID or creating a duplicate', async () => {
  const db = database(), DB = d1(db);
  const saved = await worker.updateCar(jsonRequest({ nickname: 'Updated', model: 'M3', body: 'Coupé', year: 1998, color: 'Silver', primary: true }), { DB }, { uid: 'member-a' }, 'car-a', 'https://e36united.cz');
  assert.equal(saved.status, 200);
  assert.deepEqual({ ...db.prepare("SELECT id,nickname,model,body,year,color,is_primary FROM cars WHERE id='car-a'").get() }, { id: 'car-a', nickname: 'Updated', model: 'M3', body: 'Coupé', year: 1998, color: 'Silver', is_primary: 1 });
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM cars WHERE member_id='member-a'").get().count, 2);
});

test('Garage edit rejects another member car and leaves it unchanged', async () => {
  const db = database(), DB = d1(db), before = db.prepare("SELECT * FROM cars WHERE id='car-b'").get();
  const response = await worker.updateCar(jsonRequest({ nickname: 'Stolen', model: 'M3', body: 'Coupé', year: 1998, color: 'Red', primary: true }), { DB }, { uid: 'member-a' }, 'car-b', 'https://e36united.cz');
  assert.equal(response.status, 404);
  assert.deepEqual(db.prepare("SELECT * FROM cars WHERE id='car-b'").get(), before);
});

test('new car edit, photo replacement and private gallery routes still require Firebase authentication', async () => {
  const routes = [
    ['https://api.e36united.cz/api/cars/car-a', 'PUT'],
    ['https://api.e36united.cz/api/cars/car-a/photos', 'PUT'],
    ['https://api.e36united.cz/api/gallery/mine/media/gallery-a', 'GET'],
  ];
  for (const [url, method] of routes) {
    const response = await worker.default.fetch(new Request(url, { method }), {});
    assert.equal(response.status, 401);
    assert.equal((await response.json()).authenticated, false);
  }
});

test('replacement photo keeps the old DB row and object if the D1 switch fails', async () => {
  const db = database(), DB = d1(db), objects = new Map([['cars/member-a/car-a/photo-old.jpg', { old: true }]]);
  const MEDIA = { async put(key) { objects.set(key, { fresh: true }); }, async delete(key) { objects.delete(key); } };
  const failingDB = { ...DB, batch() { throw new Error('simulated D1 failure'); } };
  const form = new FormData(); form.append('file', new File([new Uint8Array([1, 2, 3])], 'new.jpg', { type: 'image/jpeg' }));
  await assert.rejects(worker.replaceCarPhoto(new Request('https://api.e36united.cz/api/cars/car-a/photos', { method: 'PUT', body: form }), { DB: failingDB, MEDIA }, { uid: 'member-a' }, 'car-a', 'https://e36united.cz'), /simulated D1 failure/);
  assert.equal(db.prepare("SELECT id FROM car_photos WHERE car_id='car-a'").get().id, 'photo-old');
  assert.deepEqual([...objects.keys()], ['cars/member-a/car-a/photo-old.jpg']);
});

test('replacement photo switches the same car to one new object and removes the old object after success', async () => {
  const db = database(), DB = d1(db), objects = new Map([['cars/member-a/car-a/photo-old.jpg', { old: true }]]);
  const MEDIA = { async put(key) { objects.set(key, { fresh: true }); }, async delete(key) { objects.delete(key); } };
  const form = new FormData(); form.append('file', new File([new Uint8Array([4, 5, 6])], 'replacement.webp', { type: 'image/webp' }));
  const response = await worker.replaceCarPhoto(new Request('https://api.e36united.cz/api/cars/car-a/photos', { method: 'PUT', body: form }), { DB, MEDIA }, { uid: 'member-a' }, 'car-a', 'https://e36united.cz');
  const payload = await response.json(), row = db.prepare("SELECT id,car_id,r2_key,mime_type,sort_order FROM car_photos WHERE car_id='car-a'").get();
  assert.equal(response.status, 200); assert.equal(payload.replaced[0], 'photo-old');
  assert.equal(row.car_id, 'car-a'); assert.equal(row.mime_type, 'image/webp'); assert.equal(row.sort_order, 0);
  assert.equal(objects.has('cars/member-a/car-a/photo-old.jpg'), false); assert.equal(objects.has(row.r2_key), true);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM car_photos WHERE car_id='car-a'").get().count, 1);
});

test('member gallery API batches by 24 and keeps media ownership private', async () => {
  const db = database(), DB = d1(db);
  for (let index = 0; index < 30; index++) db.prepare('INSERT INTO gallery_submissions (id,member_id,r2_key,caption,status,created_at) VALUES (?,?,?,?,?,?)').run(`gallery-${index}`, 'member-a', `gallery/member-a/${index}.jpg`, `Photo ${index}`, 'pending', `2026-08-27T12:${String(index).padStart(2, '0')}:00Z`);
  db.prepare("INSERT INTO gallery_submissions (id,member_id,r2_key,caption,status) VALUES ('gallery-other','member-b','gallery/member-b/x.jpg','Other','pending')").run();
  const response = await worker.listMyGallery({ DB }, { uid: 'member-a' }, new URL('https://api.e36united.cz/api/gallery/mine?limit=24&offset=0'), 'https://e36united.cz');
  const payload = await response.json();
  assert.equal(payload.submissions.length, 24); assert.equal(payload.pagination.hasMore, true); assert.equal(payload.pagination.nextOffset, 24);
  assert.ok(payload.submissions.every(photo => photo.imageUrl.startsWith('/api/gallery/mine/media/')));
  const forbidden = await worker.privateMemberGalleryMedia({ DB, MEDIA: { get() { throw new Error('must not read R2'); } } }, { uid: 'member-a' }, 'gallery-other', 'https://e36united.cz');
  assert.equal(forbidden.status, 404);
});

test('shared image selection filters invalid, oversized and excess files', () => {
  const files = [
    { name: 'a.jpg', type: 'image/jpeg', size: 100 },
    { name: 'b.webp', type: 'image/webp', size: 100 },
    { name: 'bad.txt', type: 'text/plain', size: 100 },
    { name: 'huge.png', type: 'image/png', size: 13 * 1024 * 1024 },
  ];
  const result = selectImageFiles(files, { maxFiles: 1 });
  assert.deepEqual(result.files.map(file => file.name), ['a.jpg']);
  assert.equal(result.invalidType, true); assert.equal(result.tooLarge, true); assert.equal(result.truncated, true);
});

test('member UI reuses one edit/add form with custom pickers, thumbnails, batching and viewer controls', () => {
  assert.equal((memberHtml.match(/data-car-form=""/g) || []).length, 1);
  for (const marker of ['data-edit-car', "method:'PUT'", 'Uložit změny', 'data-car-photo-input', 'data-car-photo-preview', 'data-member-photo-previews', 'data-member-gallery-more', 'data-member-gallery-lightbox']) assert.match(`${memberHtml}\n${memberJs}`, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(memberJs, /for\(const field of \['nickname','body','model','year','color'\]\)/);
  assert.doesNotMatch(memberHtml, /Profilová fotka[^<]*<\/span><input[^>]+type="file"/);
  assert.match(memberCss, /\.image-upload-input\{[^}]*clip:rect/);
  assert.match(memberCss, /\.member-gallery-list\{[^}]*grid-template-columns/);
  assert.match(memberCss, /\.member-gallery-thumb img\{[^}]*object-fit:cover/);
  assert.match(memberCss, /@media\(hover:none\),\(pointer:coarse\)\{\.car-edit\{opacity:1/);
  assert.match(memberJs, /IntersectionObserver/);
  assert.match(memberJs, /limit=24&offset=/);
  assert.match(memberJs, /event\.key==='Escape'/);
  assert.match(galleryJs, /createImagePreviewController/);
});
