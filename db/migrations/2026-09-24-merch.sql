-- Apply once, before the Worker. No existing business rows are updated.
CREATE TABLE merch_config (
 id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL DEFAULT 1,
 data TEXT NOT NULL CHECK(json_valid(data))
);
INSERT INTO merch_config(id,data) VALUES(1,'{"paused":true,"seller":{"name":"United Classic Cars, z.s.","street":"Valdštejnská 150/4","city":"Praha 1","postalCode":"","ico":"","taxStatus":"","email":"united@e36united.cz","phone":""},"shippingMinor":12900,"pickupInstructions":"Konkrétní předání po domluvě.","deliveryInformation":"","activeHours":72,"discountBasisPoints":null,"rewardThreshold":12,"bank":null,"documents":{},"termsVersion":"","legalApproved":false}');
CREATE TABLE merch_products (
 id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1,
 data TEXT NOT NULL CHECK(json_valid(data))
);
CREATE TABLE merch_addresses (
 member_id TEXT PRIMARY KEY REFERENCES members(id), data TEXT NOT NULL CHECK(json_valid(data)), updated_at TEXT NOT NULL
);
CREATE TABLE merch_orders (
 seq INTEGER PRIMARY KEY AUTOINCREMENT CHECK(seq < 1000000000),
 id TEXT NOT NULL UNIQUE, member_id TEXT NOT NULL REFERENCES members(id),
 request_key TEXT NOT NULL, request_hash TEXT NOT NULL,
 payment_vs TEXT NOT NULL UNIQUE CHECK(length(payment_vs)<=10),
 snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),
 state TEXT NOT NULL CHECK(json_valid(state)), revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
 UNIQUE(member_id,request_key)
);
CREATE INDEX merch_orders_member_created ON merch_orders(member_id,created_at DESC);
CREATE INDEX merch_orders_created ON merch_orders(created_at DESC);
CREATE TABLE merch_audit (
 id TEXT PRIMARY KEY, actor TEXT NOT NULL REFERENCES members(id),
 resource TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL,
 details TEXT NOT NULL CHECK(json_valid(details))
);
CREATE INDEX merch_audit_resource ON merch_audit(resource,created_at);
CREATE TABLE merch_outbox (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES merch_orders(id),
 kind TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','sending','sent','failed','uncertain')),
 created_at TEXT NOT NULL, sent_at TEXT, error_code TEXT,
 UNIQUE(order_id,kind)
);
CREATE TABLE merch_media (
 id TEXT PRIMARY KEY, object_key TEXT NOT NULL UNIQUE, content_type TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES members(id), created_at TEXT NOT NULL,
 public INTEGER NOT NULL DEFAULT 0 CHECK(public IN(0,1))
);
CREATE TRIGGER merch_variant_insert BEFORE INSERT ON merch_products
 WHEN EXISTS(SELECT 1 FROM merch_products p,json_each(p.data,'$.variants') v,json_each(NEW.data,'$.variants') n WHERE p.id<>NEW.id AND json_extract(v.value,'$.id')=json_extract(n.value,'$.id'))
 BEGIN SELECT RAISE(ABORT,'duplicate_merch_variant'); END;
CREATE TRIGGER merch_variant_update BEFORE UPDATE OF data ON merch_products
 WHEN EXISTS(SELECT 1 FROM merch_products p,json_each(p.data,'$.variants') v,json_each(NEW.data,'$.variants') n WHERE p.id<>NEW.id AND json_extract(v.value,'$.id')=json_extract(n.value,'$.id'))
 BEGIN SELECT RAISE(ABORT,'duplicate_merch_variant'); END;
-- Published product photographs stay available to immutable historical orders.
CREATE TRIGGER merch_publish_media_insert AFTER INSERT ON merch_products WHEN json_extract(NEW.data,'$.status')='published'
 BEGIN UPDATE merch_media SET public=1 WHERE 'r2:'||id IN(SELECT json_extract(value,'$.image') FROM json_each(NEW.data,'$.variants')); END;
CREATE TRIGGER merch_publish_media_update AFTER UPDATE OF data ON merch_products WHEN json_extract(NEW.data,'$.status')='published'
 BEGIN UPDATE merch_media SET public=1 WHERE 'r2:'||id IN(SELECT json_extract(value,'$.image') FROM json_each(NEW.data,'$.variants')); END;
-- Both allocators must honour the same namespace, including future event years.
CREATE TRIGGER merch_vs_insert BEFORE INSERT ON merch_orders WHEN EXISTS(SELECT 1 FROM reservations WHERE payment_vs=NEW.payment_vs)
 BEGIN SELECT RAISE(ABORT,'payment_vs_collision'); END;
CREATE TRIGGER reservation_merch_vs_insert BEFORE INSERT ON reservations WHEN NEW.payment_vs IS NOT NULL AND EXISTS(SELECT 1 FROM merch_orders WHERE payment_vs=NEW.payment_vs)
 BEGIN SELECT RAISE(ABORT,'payment_vs_collision'); END;
CREATE TRIGGER reservation_merch_vs_update BEFORE UPDATE OF payment_vs ON reservations WHEN NEW.payment_vs IS NOT NULL AND EXISTS(SELECT 1 FROM merch_orders WHERE payment_vs=NEW.payment_vs)
 BEGIN SELECT RAISE(ABORT,'payment_vs_collision'); END;
CREATE TRIGGER merch_snapshot_immutable BEFORE UPDATE OF snapshot,member_id,payment_vs,created_at,request_key,request_hash ON merch_orders
 BEGIN SELECT RAISE(ABORT,'immutable_order_snapshot'); END;
INSERT INTO schema_migrations(id,description) VALUES('2026-09-24-merch','Separate member merchandise orders, immutable snapshots, ledger and outbox');
