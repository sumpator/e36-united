// A confirmed physical arrival is the identity. Claiming an account never copies it.
const one=(env,sql,args=[])=>env.DB.prepare(sql).bind(...args).first();
export async function arrivedParticipants(env,eventId,query='',memberId=null){
  const q=String(query).trim().slice(0,80),needle='%'+q.replace(/[\\%_]/g,'\\$&')+'%';
  const rows=(await env.DB.prepare(`SELECT a.id arrivalId,a.member_id memberId,a.car_key carId,a.model,a.body,a.garage_car_id garageCarId,
    a.arrived_at arrivedAt,COALESCE(NULLIF(m.nickname,''),NULLIF(a.nickname,''),NULLIF(m.name,''),NULLIF(a.name,''),'Účastník č. '||substr(a.id,-8)) name,
    (SELECT COUNT(*) FROM live_entry_vehicles v WHERE v.event_id=a.event_id AND v.car_id=a.car_key) competitionEntries,
    (SELECT id FROM live_car_photos WHERE event_id=a.event_id AND car_id=a.car_key ORDER BY rowid DESC LIMIT 1) livePhotoId,
    (SELECT id FROM car_photos WHERE car_id=a.garage_car_id ORDER BY sort_order,id LIMIT 1) photoId
    FROM event_arrivals a LEFT JOIN members m ON m.id=a.member_id
    WHERE a.event_id=? AND a.arrived_at IS NOT NULL AND (? IS NULL OR a.member_id=?)
    AND (?='' OR a.id LIKE ? ESCAPE '\\' OR a.name LIKE ? ESCAPE '\\' OR a.nickname LIKE ? ESCAPE '\\'
      OR a.model LIKE ? ESCAPE '\\' OR a.plate LIKE ? ESCAPE '\\' OR m.name LIKE ? ESCAPE '\\' OR m.nickname LIKE ? ESCAPE '\\' OR m.member_code LIKE ? ESCAPE '\\')
    ORDER BY a.arrived_at,a.id`).bind(eventId,memberId,memberId,q,...Array(8).fill(needle)).all()).results||[];
  return rows.map(r=>({arrivalId:r.arrivalId,memberId:r.memberId,name:r.name,status:'arrived',present:true,arrivedAt:r.arrivedAt,registeredCarId:r.carId,competitionEntries:Number(r.competitionEntries),cars:[{id:r.carId,model:r.model,body:r.body,source:'arrival',arrivalId:r.arrivalId,garageCarId:r.garageCarId,photoId:r.photoId,livePhotoId:r.livePhotoId}]}));
}

export async function startArrivedShowShine(env,auth,eventId,body){
  const fail=(error,extra={})=>({status:409,body:{ok:false,error,...extra}});
  const category=String(body.category||''),carId=String(body.carId||''),expected=Number(body.expectedVersion);
  const categories=['Sedan','Coupé','Touring','Cabrio','Compact','Z3','///M Power'];
  if(!categories.includes(category))return fail('category_required');
  if(!Number.isInteger(expected)||expected<1||!carId)return fail('invalid_entry');
  const isM=category==='///M Power';
  if(isM&&body.originalM!==true)return fail('original_m_confirmation_required');
  // The fallback supports an old member frontend during the controlled rollout.
  const arrival=body.arrivalId?await one(env,'SELECT * FROM event_arrivals WHERE id=? AND event_id=? AND car_key=? AND arrived_at IS NOT NULL',[body.arrivalId,eventId,carId]):await one(env,'SELECT * FROM event_arrivals WHERE event_id=? AND car_key=? AND member_id=? AND arrived_at IS NOT NULL',[eventId,carId,body.memberId||'']);
  if(!arrival)return fail('confirmed_arrival_required');
  if(!isM&&arrival.body!==category)return fail('category_mismatch',{actualCategory:arrival.body});
  const existing=await one(env,"SELECT e.* FROM live_entries e JOIN live_entry_vehicles v ON v.entry_id=e.id WHERE e.event_id=? AND e.discipline='show_shine' AND v.car_id=?",[eventId,carId]);
  if(existing?.category&&existing.category!==category)return fail('entry_category_conflict');
  const state=await one(env,"SELECT * FROM live_competition_state WHERE event_id=? AND discipline='show_shine'",[eventId])||{version:1,status:'idle'};
  const event=await one(env,'SELECT live_enabled FROM events WHERE id=?',[eventId]);
  if(!event?.live_enabled)return fail('live_disabled');
  const blocked=await one(env,"SELECT category,status FROM live_category_state WHERE event_id=? AND discipline='show_shine' AND (category=? AND status='closed' OR category<>? AND status='live')",[eventId,category,category]);
  if(blocked)return fail(blocked.status==='closed'?'category_closed':'another_category_open');
  if(existing?.voting_closed)return fail('entry_closed');
  if(state.status==='published')return fail('judging_closed');
  if(state.status==='live'&&existing?.id===state.current_entry_id)return {status:200,body:{ok:true,entryId:existing.id,replayed:true}};
  if(state.current_entry_id)return fail('current_entry_active');
  if(Number(state.version)!==expected)return fail('stale_live_state');
  const entryId=existing?.id||crypto.randomUUID();
  // Re-evaluate every precondition inside ONE D1 transaction. No orphan entry on failure.
  const guard=`EXISTS(SELECT 1 FROM members WHERE id=? AND role='admin' AND status='active')
    AND EXISTS(SELECT 1 FROM events WHERE id=? AND live_enabled=1)
    AND EXISTS(SELECT 1 FROM event_arrivals WHERE id=? AND event_id=? AND car_key=? AND version=? AND arrived_at IS NOT NULL ${isM?'':'AND body=?'})
    AND NOT EXISTS(SELECT 1 FROM live_competition_state WHERE event_id=? AND discipline='show_shine' AND (version<>? OR status='published' OR current_entry_id IS NOT NULL))
    AND NOT EXISTS(SELECT 1 FROM live_competition_state WHERE event_id=? AND discipline<>'show_shine' AND status IN ('live','paused'))
    AND NOT EXISTS(SELECT 1 FROM live_category_state WHERE event_id=? AND discipline='show_shine' AND (category=? AND status='closed' OR category<>? AND status='live'))
    AND NOT EXISTS(SELECT 1 FROM live_entries e JOIN live_entry_vehicles v ON v.entry_id=e.id WHERE e.event_id=? AND e.discipline='show_shine' AND v.car_id=? AND (e.id<>? OR e.voting_closed=1 OR (e.category IS NOT NULL AND e.category<>?)))`;
  const args=[auth.uid,eventId,arrival.id,eventId,carId,arrival.version,...(isM?[]:[category]),eventId,expected,eventId,eventId,category,category,eventId,carId,entryId,category];
  const writes=[
    env.DB.prepare(`INSERT INTO live_competition_state(event_id,discipline,status,updated_by) SELECT ?,'show_shine','idle',? WHERE ${guard} ON CONFLICT DO NOTHING`).bind(eventId,auth.uid,...args),
    env.DB.prepare(`INSERT INTO live_category_state(event_id,discipline,category,status,updated_by) SELECT ?,'show_shine',?,'idle',? WHERE ${guard} ON CONFLICT DO NOTHING`).bind(eventId,category,auth.uid,...args),
    env.DB.prepare(`INSERT INTO live_entries(id,event_id,discipline,arrival_id,category,original_m_confirmed_by) SELECT ?,?,'show_shine',?,?,? WHERE ${guard} ON CONFLICT DO NOTHING`).bind(entryId,eventId,arrival.id,category,isM?auth.uid:null,...args),
    env.DB.prepare(`UPDATE live_entries SET category=?,original_m_confirmed_by=? WHERE id=? AND category IS NULL AND ${guard}`).bind(category,isM?auth.uid:null,entryId,...args),
    env.DB.prepare(`UPDATE live_category_state SET status='live',version=CASE WHEN status='idle' THEN version+1 ELSE version END,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND discipline='show_shine' AND category=? AND ${guard}`).bind(auth.uid,eventId,category,...args),
    env.DB.prepare(`UPDATE live_competition_state SET status='live',current_entry_id=?,version=version+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND discipline='show_shine' AND version=? AND ${guard}`).bind(entryId,auth.uid,eventId,expected,...args),
    env.DB.prepare("UPDATE live_entries SET presented_at=COALESCE(presented_at,CURRENT_TIMESTAMP) WHERE id=? AND EXISTS(SELECT 1 FROM live_competition_state WHERE event_id=? AND discipline='show_shine' AND current_entry_id=? AND version=?)").bind(entryId,eventId,entryId,expected+1),
  ];
  const result=await env.DB.batch(writes);
  if(!result[5]?.meta.changes){
    const replay=await one(env,"SELECT e.id FROM live_competition_state s JOIN live_entries e ON e.id=s.current_entry_id JOIN live_entry_vehicles v ON v.entry_id=e.id WHERE s.event_id=? AND s.discipline='show_shine' AND s.status='live' AND e.category=? AND v.car_id=?",[eventId,category,carId]);
    return replay?{status:200,body:{ok:true,entryId:replay.id,replayed:true}}:fail('stale_live_state');
  }
  return {status:existing?200:201,body:{ok:true,entryId,replayed:!!existing}};
}
