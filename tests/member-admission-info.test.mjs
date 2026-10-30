import test from 'node:test';
import assert from 'node:assert/strict';
import {admissionInfoMarkup} from '../member/admission-info.js';

test('approved informational rates belong only to the prepared United 2027 event',()=>{
 for(const event of [null,{}, {id:'united-2026',year:2026}, {id:'united-2027',year:2026}, {id:'other',year:2027}])assert.equal(admissionInfoMarkup(event),'');
 const markup=admissionInfoMarkup({id:'united-2027',year:2027});
 for(const copy of ['500 Kč','600 Kč','800 Kč','31. 12. 2026','1. 1. 2027','na místě bez registrace','Cena za celé auto, bez ohledu na počet lidí.','Ubytování je samostatná volitelná položka.','platebním rozpisu'])assert.ok(markup.includes(copy),copy);
 assert.doesNotMatch(markup,/QR|spayd|name=".*price/);
});
