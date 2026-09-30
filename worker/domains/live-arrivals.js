import { JUDGE_SQL, isEventJudge } from '../auth/judge.js';
const one=(env,sql,args=[])=>env.DB.prepare(sql).bind(...args).first();
// One stable car row, enriched by its arrival/registration; no name-based merging.
export async function participantList(env,eventId,query='',{memberId=null,category='',offset=0}={}){
 const q=String(query).trim().slice(0,80),needle='%'+q.replace(/[\\%_]/g,'\\$&')+'%',page=Math.max(0,Math.min(100000,Number(offset)||0));
 const rows=(await env.DB.prepare(`WITH offered AS (
 SELECT c.id carId,COALESCE(a.member_id,c.member_id) memberId,c.model,c.body,c.nickname,c.source,a.id arrivalId,a.arrived_at arrivedAt,a.plate,c.photo_id photoId,r.id reservationId,
 COALESCE(NULLIF(m.nickname,''),NULLIF(m.name,''),NULLIF(a.nickname,''),NULLIF(a.name,''),NULLIF(cc.participant_name,''),'Účastník č. '||substr(c.id,-8)) name,m.member_code memberCode
 FROM live_vehicle_catalog c LEFT JOIN event_arrivals a ON a.car_key=c.id AND a.event_id=?
 LEFT JOIN members m ON m.id=COALESCE(a.member_id,c.member_id)
 LEFT JOIN reservations r ON r.car_id=c.id AND r.event_id=? AND r.member_id=m.id
 LEFT JOIN live_competition_cars cc ON cc.id=c.id
 WHERE (c.event_id IS NULL OR c.event_id=?) AND (m.id IS NULL OR m.status='active')
 UNION ALL
 SELECT a.car_key,a.member_id,a.model,a.body,'','arrival',a.id,a.arrived_at,a.plate,NULL,a.reservation_id,
 COALESCE(NULLIF(m.nickname,''),NULLIF(m.name,''),NULLIF(a.nickname,''),NULLIF(a.name,''),'Účastník č. '||substr(a.id,-8)),m.member_code
 FROM event_arrivals a LEFT JOIN members m ON m.id=a.member_id WHERE a.event_id=?
 AND NOT EXISTS(SELECT 1 FROM live_vehicle_catalog c WHERE c.id=a.car_key AND (c.event_id IS NULL OR c.event_id=a.event_id))
 UNION ALL
 SELECT NULL,m.id,'','','','member',NULL,NULL,'',NULL,NULL,COALESCE(NULLIF(m.nickname,''),m.name),m.member_code
 FROM members m WHERE m.status='active' AND NOT EXISTS(SELECT 1 FROM live_vehicle_catalog c WHERE c.member_id=m.id AND (c.event_id IS NULL OR c.event_id=?))
 )
 SELECT o.*,(SELECT id FROM live_car_photos f WHERE f.event_id=? AND f.car_id=o.carId ORDER BY rowid DESC LIMIT 1) livePhotoId,
 (SELECT COUNT(*) FROM live_entry_vehicles v WHERE v.event_id=? AND v.car_id=o.carId) competitionEntries
 FROM offered o WHERE (? IS NULL OR memberId=?) AND (?='' OR name LIKE ? ESCAPE '\\' OR model LIKE ? ESCAPE '\\' OR nickname LIKE ? ESCAPE '\\' OR memberCode LIKE ? ESCAPE '\\' OR plate LIKE ? ESCAPE '\\' OR carId LIKE ? ESCAPE '\\' OR arrivalId LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM members m WHERE m.id=o.memberId AND m.name LIKE ? ESCAPE '\\'))
 ORDER BY CASE WHEN arrivedAt IS NOT NULL AND (body=? OR ?='///M Power') THEN 0 WHEN arrivedAt IS NOT NULL THEN 1 WHEN reservationId IS NOT NULL THEN 2 ELSE 3 END,name,carId,memberId LIMIT 51 OFFSET ?`).bind(...Array(7).fill(eventId),memberId,memberId,q,...Array(8).fill(needle),category,category,page).all()).results||[];
 return {members:rows.slice(0,50).map(r=>({key:r.carId?'car:'+r.carId:'member:'+r.memberId,arrivalId:r.arrivalId,memberId:r.memberId,name:r.name,memberCode:r.memberCode,present:!!r.arrivedAt,arrivedAt:r.arrivedAt,registeredCarId:r.carId,competitionEntries:Number(r.competitionEntries),cars:r.carId?[{id:r.carId,model:r.model,body:r.body,nickname:r.nickname,source:r.source,arrivalId:r.arrivalId,photoId:r.photoId,livePhotoId:r.livePhotoId}]:[]})),hasMore:rows.length>50,nextOffset:page+50};
}
export async function startArrivedShowShine(env,auth,eventId,body){
 const fail=(error,extra={})=>({status:409,body:{ok:false,error,...extra}});
 if(!await isEventJudge(env,auth.uid,eventId))return {status:403,body:{ok:false,error:'judge_forbidden'}};
 const category=String(body.category||''),carId=String(body.carId||''),expected=Number(body.expectedVersion),isM=category==='///M Power';
 if(!['Sedan','Coupé','Touring','Cabrio','Compact','Z3','///M Power'].includes(category))return fail('category_required');
 if(!Number.isInteger(expected)||expected<1||!carId)return fail('invalid_entry');
 if(isM&&body.originalM!==true)return fail('original_m_confirmation_required');
 const arrival=await one(env,'SELECT * FROM event_arrivals WHERE event_id=? AND car_key=? AND arrived_at IS NOT NULL',[eventId,carId]);
 if(body.arrivalId&&body.arrivalId!==arrival?.id)return fail('invalid_car');
 const car=await one(env,'SELECT * FROM live_vehicle_catalog WHERE id=? AND (event_id IS NULL OR event_id=?)',[carId,eventId]);
 if(!arrival&&!car)return fail('invalid_car');
 const owner=arrival?.member_id||car?.member_id||null,carBody=arrival?.body||car?.body;
 if(owner&&!await one(env,"SELECT id FROM members WHERE id=? AND status='active'",[owner]))return fail('invalid_member');
 if(!isM&&carBody!==category)return fail('category_mismatch',{actualCategory:carBody});
 const existing=await one(env,"SELECT e.* FROM live_entries e JOIN live_entry_vehicles v ON v.entry_id=e.id WHERE e.event_id=? AND e.discipline='show_shine' AND v.car_id=?",[eventId,carId]);
 if(existing?.category&&existing.category!==category)return fail('entry_category_conflict');
 const state=await one(env,"SELECT * FROM live_competition_state WHERE event_id=? AND discipline='show_shine'",[eventId])||{version:1,status:'idle'};
 if(!(await one(env,'SELECT live_enabled FROM events WHERE id=?',[eventId]))?.live_enabled)return fail('live_disabled');
 const blocked=await one(env,"SELECT category,status FROM live_category_state WHERE event_id=? AND discipline='show_shine' AND (category=? AND status='closed' OR category<>? AND status='live')",[eventId,category,category]);
 if(blocked)return fail(blocked.status==='closed'?'category_closed':'another_category_open');
 if(existing?.voting_closed)return fail('entry_closed');
 if(state.status==='published')return fail('judging_closed');
 if(state.status==='live'&&existing?.id===state.current_entry_id)return {status:200,body:{ok:true,entryId:existing.id,replayed:true}};
 if(state.current_entry_id)return fail('current_entry_active');
 if(Number(state.version)!==expected)return fail('stale_live_state');
 const entryId=existing?.id||crypto.randomUUID();
 const identityGuard=arrival?"EXISTS(SELECT 1 FROM event_arrivals WHERE id=? AND event_id=? AND car_key=? AND version=? AND arrived_at IS NOT NULL)":"EXISTS(SELECT 1 FROM live_vehicle_catalog WHERE id=? AND (event_id IS NULL OR event_id=?) AND member_id IS ? AND body=?)";
 const identityArgs=arrival?[arrival.id,eventId,carId,arrival.version]:[carId,eventId,car.member_id,car.body];
 const guard=`EXISTS(${JUDGE_SQL}) AND EXISTS(SELECT 1 FROM events WHERE id=? AND live_enabled=1)
 AND ${identityGuard} AND (? IS NULL OR EXISTS(SELECT 1 FROM members WHERE id=? AND status='active'))
 AND NOT EXISTS(SELECT 1 FROM live_competition_state WHERE event_id=? AND discipline='show_shine' AND (version<>? OR status='published' OR current_entry_id IS NOT NULL))
 AND NOT EXISTS(SELECT 1 FROM live_competition_state WHERE event_id=? AND discipline<>'show_shine' AND status IN ('live','paused'))
 AND NOT EXISTS(SELECT 1 FROM live_category_state WHERE event_id=? AND discipline='show_shine' AND (category=? AND status='closed' OR category<>? AND status='live'))
 AND NOT EXISTS(SELECT 1 FROM live_entries e JOIN live_entry_vehicles v ON v.entry_id=e.id WHERE e.event_id=? AND e.discipline='show_shine' AND v.car_id=? AND (e.id<>? OR e.voting_closed=1 OR (e.category IS NOT NULL AND e.category<>?)))`;
 const args=[auth.uid,eventId,eventId,...identityArgs,owner,owner,eventId,expected,eventId,eventId,category,category,eventId,carId,entryId,category];
 const writes=[
 env.DB.prepare(`INSERT INTO live_competition_state(event_id,discipline,status,updated_by) SELECT ?,'show_shine','idle',? WHERE ${guard} ON CONFLICT DO NOTHING`).bind(eventId,auth.uid,...args),
 env.DB.prepare(`INSERT INTO live_category_state(event_id,discipline,category,status,updated_by) SELECT ?,'show_shine',?,'idle',? WHERE ${guard} ON CONFLICT DO NOTHING`).bind(eventId,category,auth.uid,...args),
 env.DB.prepare(`INSERT INTO live_entries(id,event_id,discipline,member_id,car_id,competition_car_id,arrival_id,category,original_m_confirmed_by) SELECT ?,?,'show_shine',?,?,?,?,?,? WHERE ${guard} ON CONFLICT DO NOTHING`).bind(entryId,eventId,arrival?null:car.member_id,arrival?null:car.source==='garage'?carId:null,arrival?null:car.source==='competition'?carId:null,arrival?.id||null,category,isM?auth.uid:null,...args),
 env.DB.prepare(`UPDATE live_entries SET category=?,original_m_confirmed_by=? WHERE id=? AND category IS NULL AND ${guard}`).bind(category,isM?auth.uid:null,entryId,...args),
 env.DB.prepare(`UPDATE live_category_state SET status='live',version=CASE WHEN status='idle' THEN version+1 ELSE version END,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND discipline='show_shine' AND category=? AND ${guard}`).bind(auth.uid,eventId,category,...args),
 env.DB.prepare(`UPDATE live_competition_state SET status='live',current_entry_id=?,version=version+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND discipline='show_shine' AND version=? AND ${guard}`).bind(entryId,auth.uid,eventId,expected,...args),
 env.DB.prepare("UPDATE live_entries SET presented_at=COALESCE(presented_at,CURRENT_TIMESTAMP) WHERE id=? AND EXISTS(SELECT 1 FROM live_competition_state WHERE event_id=? AND discipline='show_shine' AND current_entry_id=? AND version=?)").bind(entryId,eventId,entryId,expected+1)
 ];
 const result=await env.DB.batch(writes);
 if(!result[5]?.meta.changes){const replay=await one(env,"SELECT e.id FROM live_competition_state s JOIN live_entries e ON e.id=s.current_entry_id JOIN live_entry_vehicles v ON v.entry_id=e.id WHERE s.event_id=? AND s.discipline='show_shine' AND s.status='live' AND e.category=? AND v.car_id=?",[eventId,category,carId]);return replay?{status:200,body:{ok:true,entryId:replay.id,replayed:true}}:fail('stale_live_state')}
 return {status:existing?200:201,body:{ok:true,entryId,replayed:!!existing}};
}
