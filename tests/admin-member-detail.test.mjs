import test from 'node:test';
import {memberQrSvg} from '../admin/member-detail.js';
import {decodeMemberQrSvg} from './helpers/decode-member-qr.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {memberRuntime} from './helpers/admin-member-runtime.mjs';
import {getAdminMember,listAdminMembers,resolveAdminMemberQr,adminMemberMedia} from '../worker/admin/members.js';
import {provisionMemberQrBatch,memberQrInsert} from '../worker/admin/member-qr.js';
import {loadMailingContacts} from '../worker/domains/mailing/contacts.js';
const origin='https://e36united.cz',url=path=>new URL(path,origin);
test('Member list/search is bounded, stable, deduplicates multi-car matches and never guesses identity',async()=>{
 const r=memberRuntime();const search=async q=>(await(await listAdminMembers(r.env,url('/?q='+encodeURIComponent(q)),origin)).json());
 assert.equal((await search('BMW')).pagination.total,2);assert.deepEqual((await search('BMW')).members.map(m=>m.memberId),['m','n']);
 assert.equal((await search('Same Name')).members.length,2);assert.equal((await search('EU-MEMBER')).members[0].memberId,'m');
 assert.equal((await search('%_')).error,'invalid_search');assert.equal((await search('a')).error,'invalid_search');
 for(let i=0;i<35;i++)r.db.prepare('INSERT INTO members(id,member_code,email,name) VALUES(?,?,?,?)').run('x'+i,'EU-'+i,i+'@example.invalid','Synthetic');
 const list=await(await listAdminMembers(r.env,url('/?page=2'),origin)).json();assert.equal(list.pagination.total,38);assert.equal(list.members.length,8);assert.ok(!JSON.stringify(list).includes('token'));assert.equal(r.writes,0);r.db.close();
});
test('Member tabs are independent pure reads with exact scoped finance, Club semantics and actual Mailing relation',async()=>{
 const r=memberRuntime();const get=async(id,tab)=>(await(await getAdminMember(r.env,url('/?eventId=e'),id,tab,origin)).json());
 const header=await get('m');assert.equal(header.reservations[0].amountPaidCzk,200);assert.equal(header.reservations[0].variableSymbol,null);assert.equal(header.member.memberId,'m');
 assert.deepEqual((await get('n')).reservations,[]);r.db.exec("UPDATE members SET status='inactive' WHERE id='n'");assert.equal((await get('n')).member.status,'inactive');
 for(const tab of ['reservations','garage','photos','history','points','mailing'])assert.ok((await get('m',tab)).pagination.total>0,tab);
 const club=await get('m','club');assert.equal(club.points.available,4);assert.equal(club.rating.key,'320i');assert.ok(club.achievements.some(a=>a.name==='S&S TOP 3 · 2025'));
 assert.equal((await get('m','mailing')).contact.id,'linked');assert.equal((await get('n','mailing')).contact,null);
 for(let i=0;i<25;i++)r.db.prepare('INSERT INTO united_points_ledger(id,member_id,delta,source_type,source_key,reason) VALUES(?,?,?,?,?,?)').run('page'+i,'m',1,'fixture','page'+i,'Synthetic history');const historyPage=await(await getAdminMember(r.env,url('/?page=2'),'m','points',origin)).json();assert.equal(historyPage.pagination.total,26);assert.equal(historyPage.items.length,6);
 const contacts=await loadMailingContacts(r.env);assert.equal(contacts.find(c=>c.id==='linked').canonicalMemberId,'m');assert.equal(contacts.find(c=>c.id==='legacy').canonicalMemberId,null);
 assert.equal((await get('m','qr')).payload,null);assert.equal(r.writes,0);assert.equal(r.mediaReads,0);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM admin_operation_receipts').get().n,0);r.db.close();
});
test('private Member media requires exact member/car/photo or member/claim/evidence relation',async()=>{
 const r=memberRuntime();const image=await adminMemberMedia(r.env,'m','cars','c','p',origin);assert.equal(image.status,200);assert.equal(image.headers.get('Access-Control-Allow-Origin'),origin);assert.equal(image.headers.get('Cache-Control'),'private, no-store');
 assert.equal((await adminMemberMedia(r.env,'n','cars','c','p',origin)).status,404);assert.equal((await adminMemberMedia(r.env,'m','cars','c2','p',origin)).status,404);
 assert.equal((await adminMemberMedia(r.env,'m','history','h','hp',origin)).status,200);assert.equal((await adminMemberMedia(r.env,'n','history','h','hp',origin)).status,404);
 assert.equal(r.mediaReads,2);assert.equal(r.writes,0);r.db.close();
});
test('QR explicit provisioning is unique, stable, non-destructive and resolver performs no tracking writes',async()=>{
 const r=memberRuntime();assert.deepEqual(await provisionMemberQrBatch(r.env),{provisioned:3});assert.equal((await provisionMemberQrBatch(r.env)).provisioned,0);
 const before=r.db.prepare('SELECT * FROM member_qr_identities ORDER BY member_id').all();assert.equal(new Set(before.map(q=>q.token)).size,3);assert.ok(before.every(q=>/^[a-f0-9]{48}$/.test(q.token)));
 await r.env.DB.batch([memberQrInsert(r.env,'m')]);assert.deepEqual(r.db.prepare('SELECT * FROM member_qr_identities ORDER BY member_id').all(),before);
 const writes=r.writes,payload='E36U1:'+before.find(q=>q.member_id==='m').token;
 const resolve=body=>resolveAdminMemberQr(new Request(origin,{method:'POST',body:JSON.stringify(body)}),r.env,origin);
 assert.equal((await(await resolve({payload})).json()).memberId,'m');assert.equal((await resolve({payload:'E36U2:bad'})).status,400);assert.equal((await resolve({payload:'x'.repeat(300)})).status,400);assert.equal((await resolve({payload:[payload]})).status,400);assert.equal(r.writes,writes);
 r.db.exec("INSERT INTO members(id,member_code,email,name) VALUES('new','EU-NEW','new@example.invalid','New')");await r.env.DB.batch([memberQrInsert(r.env,'new')]);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM member_qr_identities').get().n,4);assert.deepEqual(r.db.prepare('PRAGMA foreign_key_check').all(),[]);r.db.close();
});
test('exact Stage 2 forward migration applies to populated predecessor without business changes',()=>{
 const schema=readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8');const migration=readFileSync(new URL('../db/migrations/2026-09-08-admin-member-identity.sql',import.meta.url),'utf8').trim();assert.ok(schema.includes(migration));
 const db=new DatabaseSync(':memory:');db.exec(schema.split('-- Stage 2: apply once')[0]+'COMMIT;');db.exec("INSERT INTO members(id,member_code,email,name) VALUES('existing','EU-EXISTING','existing@example.invalid','Existing')");const before=db.prepare('SELECT * FROM members').all();db.exec(migration);assert.deepEqual(db.prepare('SELECT * FROM members').all(),before);assert.equal(db.prepare('SELECT COUNT(*) n FROM member_qr_identities').get().n,0);assert.throws(()=>db.exec(migration),/already exists/);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);db.close();
});
test('rendered local QR SVG decodes to the exact versioned opaque identity with a four-module quiet zone',()=>{
 const payload='E36U1:'+'0123456789abcdef'.repeat(3),svg=memberQrSvg(payload);
 assert.equal(decodeMemberQrSvg(svg),payload);assert.ok(svg.includes('fill="white"'));assert.equal(memberQrSvg('E36U1:email@example.invalid'),'');
});
