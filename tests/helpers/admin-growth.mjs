import {memberRuntime} from './admin-member-runtime.mjs';
export function adminGrowth(){
 const r=memberRuntime(),db=r.db;db.exec('BEGIN');
 for(let i=3;i<500;i++)db.prepare('INSERT INTO members(id,member_code,email,name,status) VALUES(?,?,?,?,?)').run('m'+i,'EU-'+i,'member'+i+'@example.invalid','Synthetic Member '+i,i%10?'active':'inactive');
 db.exec("INSERT INTO events(id,year,title) VALUES('future',2027,'United 2027')");
 const members=db.prepare('SELECT id FROM members ORDER BY id').all().map(m=>m.id),events=['e','old','future'];
 for(let i=3;i<750;i++)db.prepare('INSERT INTO cars(id,member_id,model,nickname) VALUES(?,?,?,?)').run('car'+i,members[i%500],'BMW '+(i%2?'328i':'325i'),'Car '+i);
 const cars=db.prepare('SELECT id,member_id FROM cars ORDER BY id').all();
 for(let i=2;i<750;i++)db.prepare('INSERT INTO car_photos(id,car_id,r2_key) VALUES(?,?,?)').run('photo'+i,cars[i].id,'synthetic/car/'+i);
 for(let i=1;i<750;i++)db.prepare('INSERT INTO gallery_submissions(id,member_id,car_id,r2_key,status) VALUES(?,?,?,?,?)').run('gallery'+i,cars[i].member_id,cars[i].id,'synthetic/gallery/'+i,i%10===0?'pending':i%10===1?'rejected':'approved');
 let serial=0;
 for(const event of events){let cursor=0,count=db.prepare('SELECT COUNT(*) n FROM reservations WHERE event_id=?').get(event).n;
  while(count<300){const member=members[cursor++%500];if(db.prepare('SELECT 1 FROM reservations WHERE event_id=? AND member_id=?').get(event,member)){continue}db.prepare('INSERT INTO reservations(id,member_id,event_id,status,crew,amount_due_czk,amount_paid_czk,car_id) VALUES(?,?,?,?,?,?,?,?)').run('reservation'+serial++,member,event,['approved','approved','pending','cancelled','rejected'][count%5],1+count%5,1000,count%4*400,cars.find(car=>car.member_id===member).id);count++}
  db.prepare('INSERT INTO event_accommodation_options(id,event_id,name,kind,inventory_mode,units_total,capacity_per_unit) VALUES(?,?,?,\'cabin\',\'limited\',100,4)').run('option-'+event,event,'Cabins');
  db.prepare(`INSERT INTO reservation_accommodation(reservation_id,option_id,option_name,kind,people_count,unit_count,unit_price_czk,person_price_czk,bedding_fee_per_person_czk,city_tax_per_person_per_night_czk,nights,base_total_czk,person_total_czk,bedding_total_czk,city_tax_total_czk,total_czk)
    SELECT id,?,'Cabins','cabin',crew,1,1000,0,0,0,2,1000,0,0,0,1000 FROM reservations WHERE event_id=? AND status IN('approved','pending')`).run('option-'+event,event);
 }
 let history=db.prepare('SELECT COUNT(*) n FROM united_history_claims').get().n;
 for(let i=0;history<1000;i++){const result=db.prepare('INSERT OR IGNORE INTO united_history_claims(id,member_id,event_id,attendance_status,sns_status) VALUES(?,?,?,?,?)').run('claim'+i,members[i%500],events[Math.floor(i/500)%3],i%10?'approved':'pending',i%20?'not_claimed':'pending');history+=Number(result.changes)}
 for(let i=1;i<5000;i++)db.prepare('INSERT INTO united_points_ledger(id,member_id,delta,source_type,source_key,reason) VALUES(?,?,1,\'fixture\',?,\'Synthetic\')').run('point'+i,members[i%500],'growth'+i);
 for(let i=0;i<100;i++)db.prepare('INSERT INTO mailing_contacts(id,email,normalized_email,current_member_id) VALUES(?,?,?,?)').run('contact'+i,'old'+i+'@example.invalid','old'+i+'@example.invalid',i<50?members[i+3]:null);
 for(let i=0;i<500;i++)db.prepare('INSERT INTO mailing_campaign_recipients(id,campaign_id,contact_id,member_id,email,normalized_email,eligibility_status) VALUES(?,\'camp\',?,?,?,?,\'eligible\')').run('recipient'+i,'contact'+(i%100),i%2?members[i%500]:null,'sent'+i+'@example.invalid','sent'+i+'@example.invalid');
 for(let i=0;i<1000;i++)db.prepare("INSERT INTO admin_operation_receipts(actor_id,operation_id,operation,entity_id,base_revision,payload_hash,http_status,cas_applied,primary_applied) VALUES('a',?,'payment','r',1,'synthetic',200,1,1)").run('receipt'+i);
 db.exec('COMMIT');return r;
}
