import { memberRuntime } from './admin-member-runtime.mjs';
import { readFileSync } from 'node:fs';
import { paymentStatement, reservationPrice } from '../../worker/domains/arrivals.js';
import { calculateAccommodationPricing } from '../../worker/domains/reservations/pricing.js';

export const SUITE='LOCAL-ARRIVALS-V1';
export const EVENT='local-arrivals-v1';
const owned=new WeakSet();
export function arrivalsRuntime({guestSchema=true}={}){
  const schema=readFileSync(new URL('../../db/schema.sql',import.meta.url),'utf8');
  const r=memberRuntime({schema:guestSchema?schema:schema.split('-- Confirmed-arrival competition identity')[0]+'\nCOMMIT;'});owned.add(r);
  if(!r.db.prepare("SELECT id FROM schema_migrations WHERE id='2026-09-30-arrivals'").get())r.db.exec(readFileSync(new URL('../../db/migrations/2026-09-30-arrivals.sql',import.meta.url),'utf8'));
  let queue=Promise.resolve();const batch=r.env.DB.batch.bind(r.env.DB);
  r.env.DB.batch=statements=>{const work=queue.then(()=>batch(statements));queue=work.catch(()=>{});return work};
  // No remote binding and no provider credentials. Any accidental provider call fails the test.
  return r;
}
export async function seedArrivals(r){
  if(!owned.has(r))throw new Error('This seed accepts only its isolated in-memory runtime. Never a production DB.');
  r.db.exec(`INSERT OR IGNORE INTO events(id,year,title,registration_status,admission_registered_czk,admission_onsite_czk) VALUES('${EVENT}',2091,'${SUITE} — SYNTHETIC ONLY','closed',300,500);`);
  r.db.prepare("INSERT OR IGNORE INTO event_accommodation_options(id,event_id,name,kind,inventory_mode,units_total,capacity_per_unit,unit_price_czk) VALUES('fixture-cabin',?,'LOCAL-ARRIVALS-V1 cabin','cabin','limited',20,4,500)").run(EVENT);
  const cases=[['paid',1300],['partial',500],['overpaid',1600],['free',0],['othercar',1300],['unregistered',null]];
  for(const [id,paid] of cases){
    const member='fixture-'+id,car='car-'+id,res='reservation-'+id;
    r.db.prepare("INSERT OR IGNORE INTO members(id,member_code,email,name) VALUES(?,?,?,?)").run(member,'TEST-'+id,id+'@arrivals.invalid',SUITE+' '+id);
    r.db.prepare("INSERT OR IGNORE INTO cars(id,member_id,model,body) VALUES(?,?,'BMW E36 · test','Sedan')").run(car,member);
    r.db.prepare('INSERT OR IGNORE INTO member_qr_identities(member_id,token) VALUES(?,?)').run(member,Buffer.from(id).toString('hex').padEnd(48,'0'));
    if(paid==null)continue;
    const option=r.db.prepare("SELECT * FROM event_accommodation_options WHERE id='fixture-cabin'").get(),event=r.db.prepare('SELECT * FROM events WHERE id=?').get(EVENT);
    const accommodation=calculateAccommodationPricing(event,option,2,'full_weekend'),price=reservationPrice(event.admission_registered_czk,accommodation.totalCzk);
    r.db.prepare(`INSERT OR IGNORE INTO reservations(id,member_id,event_id,car_id,car_model,car_body,crew,arrival,accommodation,show_shine,status,admission_czk,amount_due_czk) VALUES(?,?,?,?,'BMW E36 · test','Sedan',2,'Pátek','Chatka','Ano','approved',?,?)`).run(res,member,EVENT,car,price.admission,price.total);
    r.db.prepare("INSERT OR IGNORE INTO reservation_accommodation(reservation_id,option_id,option_name,kind,people_count,unit_count,unit_price_czk,nights,base_total_czk,total_czk) VALUES(?,'fixture-cabin','LOCAL-ARRIVALS-V1 cabin','cabin',2,1,500,2,?,?)").run(res,accommodation.baseTotalCzk,accommodation.totalCzk);
    if(paid&&!r.db.prepare('SELECT id FROM event_payments WHERE id=?').get('payment-'+id))await paymentStatement(r.env,{id:'payment-'+id,eventId:EVENT,reservationId:res,amount:paid,method:'bank',actorId:'a',reason:SUITE+' bank fixture'}).run();
  }
  r.db.prepare("INSERT OR IGNORE INTO cars(id,member_id,model,body) VALUES('car-othercar-2','fixture-othercar','BMW E36 Touring · test','Touring')").run();
  return {suite:SUITE,eventId:EVENT};
}
