import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { accommodationFallbackSvg, accommodationImageFallbackSvg, accommodationVisualMarkup, accommodationVisualModel } from '../accommodation-visual.js';

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

test('Planner uses a text-free illustration while custom accommodation photos keep priority',()=>{
  const fallbackSvg=accommodationImageFallbackSvg(option);
  assert.doesNotMatch(fallbackSvg,/<text\b|Chatka A|4 OSOBY|2 NOCI|2 VOLNÉ|KČ|GENEROVANÝ/i);
  assert.match(fallbackSvg,/<svg\b/);assert.match(fallbackSvg,/<path\b/);
  const fallback=accommodationVisualModel(option,{apiBaseUrl:'https://api.e36united.cz',nights:2,mode:'image-only'});
  assert.equal(fallback.custom,false);assert.equal(fallback.src,fallback.fallbackSrc);assert.match(decodeURIComponent(fallback.fallbackSrc),/<svg\b/);
  const custom=accommodationVisualModel({...option,visual:{hasCustomPhoto:true,imageUrl:'/api/accommodation/media/cabin-a?v=etag-3'}},{apiBaseUrl:'https://api.e36united.cz',mode:'image-only'});
  assert.equal(custom.custom,true);assert.equal(custom.src,'https://api.e36united.cz/api/accommodation/media/cabin-a?v=etag-3');assert.equal(custom.fallbackSrc,fallback.fallbackSrc);
});

test('authenticated member can bootstrap/load Member Portal successfully with accommodation visual',()=>{
  const member=read('member.js'),start=member.indexOf('function renderAccommodationPreview(){'),end=member.indexOf('function syncMemberSleep(',start);
  assert.ok(start>=0&&end>start);
  const renderSource=member.slice(start,end),preview={hidden:true,innerHTML:''},availability={textContent:'',classList:{toggle(){}}};
  const execute=new Function('accommodationPreview','accommodationAvailability','selectedAccommodationOption','MAX_RESERVATION_CREW','crewInput','accommodationUnitsInput','clampReservationNumber','matchingAccommodationOptions','priceAccommodation','numericValue','$','accommodationVisualMarkup','apiBaseUrl','esc','formatCzk','bindAccommodationVisualFallbacks',`${renderSource};renderAccommodationPreview();`);
  assert.doesNotThrow(()=>execute(
    preview,availability,()=>option,5,{value:'2'},{value:'2'},(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback,
    ()=>[option],()=>({unitCount:1,nights:2,baseTotalCzk:2400,personTotalCzk:0,beddingTotalCzk:0,cityTaxTotalCzk:200,totalCzk:2600}),value=>Number(value||0),()=>null,
    accommodationVisualMarkup,'https://api.e36united.cz',String,value=>`${value} Kč`,()=>{},
  ));
  assert.equal(preview.hidden,false);
  assert.match(preview.innerHTML,/data-accommodation-fallback=/);
  assert.match(preview.innerHTML,/Orientačně celkem/);
});

test('one shared visual module propagates through Planner, Member Portal and Admin contexts',()=>{
  const main=read('main.js'),html=read('index.html'),member=read('member.js'),admin=read('admin.js'),worker=read('cloudflare-worker-media.js');
  const selectorSource=main.slice(main.indexOf('const renderPlannerAccommodationOptions'),main.indexOf('const renderPlannerPrice'));
  const standalonePreview=html.slice(html.indexOf('data-context-preview="sleep"'),html.indexOf('</aside>',html.indexOf('data-context-preview="sleep"')));
  assert.match(main,/import\('\.\/accommodation-visual\.js/);assert.match(main,/plannerAccommodationVisual\(liveOption\)/);assert.match(main,/mode:'image-only'/);
  assert.ok(main.indexOf('const plannerAccommodationVisual')<main.indexOf('if (planner)'));
  assert.doesNotMatch(selectorSource,/accommodationVisualMarkup|planner-accommodation-visual|<img\b/);assert.match(selectorSource,/planner-accommodation-card/);
  assert.match(standalonePreview,/data-context-sleep-image/);assert.doesNotMatch(standalonePreview,/data-context-sleep-(?:title|capacity|price|availability)|planner-context-copy/);
  assert.match(member,/from '\.\/accommodation-visual\.js/);assert.match(member,/member-accommodation-preview/);assert.match(member,/member-summary-accommodation/);
  assert.match(admin,/from '\.\/accommodation-visual\.js/);assert.match(admin,/admin-accommodation-visual/);assert.match(admin,/admin-drawer-accommodation/);
  assert.match(accommodationFallbackSvg(option,{nights:2}),/Chatka A|4 OSOBY|GENEROVANÝ TECHNICKÝ PŘEHLED/);
  assert.match(worker,/accommodationPhotoKey\(eventId, optionId\)/);assert.match(worker,/\?v=\$\{encodeURIComponent\(version\)\}/);
});

test('Admin photo picker is styled, locally previews and supports replace/remove without exposing native input',()=>{
  const admin=read('admin.js'),css=read('admin.css');
  assert.match(admin,/data-accommodation-photo-input hidden type="file"/);assert.match(admin,/URL\.createObjectURL\(file\)/);assert.match(admin,/data-accommodation-photo-upload/);assert.match(admin,/data-accommodation-photo-remove/);
  assert.match(css,/\.admin-photo-picker/);assert.match(css,/\.admin-accommodation-photo-preview/);
});
