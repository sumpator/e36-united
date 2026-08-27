import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { accommodationFallbackSvg, accommodationVisualModel } from '../accommodation-visual.js';

const read=name=>readFileSync(new URL(`../${name}`,import.meta.url),'utf8');

const option={
  id:'cabin-a',name:'Chatka A',kind:'cabin',capacityPerUnit:4,inventoryMode:'limited',freeUnits:2,
  unitPriceCzk:2400,personPriceCzk:0,visual:{hasCustomPhoto:false,imageUrl:null,version:null},
};

test('fallback is deterministic, recognizable as generated and reflects only available parameters',()=>{
  const svg=accommodationFallbackSvg(option,{nights:2});
  assert.equal(svg,accommodationFallbackSvg(option,{nights:2}));
  assert.match(svg,/Chatka A/);assert.match(svg,/4 OSOBY/);assert.match(svg,/2 NOCI/);assert.match(svg,/2 VOLNÉ/);assert.match(svg,/GENEROVANÝ TECHNICKÝ PŘEHLED/);
  assert.doesNotMatch(svg,/Elektřina|Lůžka/);
});

test('custom photo wins and failed or removed custom media has a generated fallback',()=>{
  const custom=accommodationVisualModel({...option,visual:{hasCustomPhoto:true,imageUrl:'/api/accommodation/media/cabin-a?v=etag-2'}},{apiBaseUrl:'https://api.e36united.cz',nights:2});
  assert.equal(custom.custom,true);assert.equal(custom.src,'https://api.e36united.cz/api/accommodation/media/cabin-a?v=etag-2');assert.equal(custom.fallbackAlt,'Chatka A – generovaný přehled');assert.match(custom.fallbackSrc,/^data:image\/svg\+xml/);
  const removed=accommodationVisualModel(option,{apiBaseUrl:'https://api.e36united.cz',nights:2});assert.equal(removed.custom,false);assert.equal(removed.src,removed.fallbackSrc);
});

test('one shared visual module propagates through Planner, Member Portal and Admin contexts',()=>{
  const main=read('main.js'),member=read('member.js'),admin=read('admin.js'),worker=read('cloudflare-worker-media.js');
  assert.match(main,/import\('\.\/accommodation-visual\.js/);assert.match(main,/plannerAccommodationVisual\(liveOption\)/);assert.match(main,/accommodationVisualMarkup\(option/);
  assert.match(member,/from '\.\/accommodation-visual\.js/);assert.match(member,/member-accommodation-preview/);assert.match(member,/member-summary-accommodation/);
  assert.match(admin,/from '\.\/accommodation-visual\.js/);assert.match(admin,/admin-accommodation-visual/);assert.match(admin,/admin-drawer-accommodation/);
  assert.match(worker,/accommodationPhotoKey\(eventId, optionId\)/);assert.match(worker,/\?v=\$\{encodeURIComponent\(version\)\}/);
});

test('Admin photo picker is styled, locally previews and supports replace/remove without exposing native input',()=>{
  const admin=read('admin.js'),css=read('admin.css');
  assert.match(admin,/data-accommodation-photo-input hidden type="file"/);assert.match(admin,/URL\.createObjectURL\(file\)/);assert.match(admin,/data-accommodation-photo-upload/);assert.match(admin,/data-accommodation-photo-remove/);
  assert.match(css,/\.admin-photo-picker/);assert.match(css,/\.admin-accommodation-photo-preview/);
});
