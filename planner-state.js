const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID_PATTERN=/^[a-z0-9_-]{1,128}$/i;
const HANDOFF_LIFETIME=7*24*60*60*1000;
export const PLANNER_CLOCK_SKEW_MS=5*60*1000;

export function validatePlannerDraft(candidate,{now=Date.now()}={}){
  if(!candidate||candidate.version!==1||candidate.source!=='weekend-planner')return null;
  const draftId=String(candidate.draftId||''),createdAt=Date.parse(candidate.createdAt),expiresAt=Date.parse(candidate.expiresAt),eventYear=Number(candidate.eventYear),crew=Number(candidate.crew),units=Number(candidate.accommodationUnits);
  const attendanceByArrival={Pátek:'full_weekend',Sobota:'saturday_only','Jen na otočku':'day_visit'};
  if(!UUID_PATTERN.test(draftId)||!Number.isFinite(createdAt)||!Number.isFinite(expiresAt)||createdAt>now+PLANNER_CLOCK_SKEW_MS||expiresAt<=now||expiresAt<=createdAt||now-createdAt>HANDOFF_LIFETIME||expiresAt-createdAt>HANDOFF_LIFETIME)return null;
  if(!Number.isInteger(eventYear)||eventYear<2000||eventYear>2100)return null;
  if(!attendanceByArrival[candidate.arrival]||candidate.attendanceType!==attendanceByArrival[candidate.arrival])return null;
  if(!['Chatka','Stan','Bez ubytování'].includes(candidate.accommodation)||!Number.isInteger(crew)||crew<1||crew>8||!Number.isInteger(units)||units<0||units>crew||!['Ano','Ne','Možná'].includes(candidate.showShine))return null;
  if((candidate.arrival==='Jen na otočku'||candidate.accommodation==='Bez ubytování')&&units!==0)return null;
  if(candidate.arrival!=='Jen na otočku'&&candidate.accommodation!=='Bez ubytování'&&units<1)return null;
  const eventId=candidate.eventId==null?null:String(candidate.eventId);if(eventId!==null&&!ID_PATTERN.test(eventId))return null;
  const accommodationOptionId=candidate.accommodationOptionId==null?null:String(candidate.accommodationOptionId);if(accommodationOptionId!==null&&!ID_PATTERN.test(accommodationOptionId))return null;
  const fallbackDeparture=candidate.arrival==='Jen na otočku'?'Stejný den':'Neděle',departure=String(candidate.departure||fallbackDeparture),nights=Number(candidate.nights??(candidate.arrival==='Pátek'?2:candidate.arrival==='Sobota'?1:0));
  const validStay=candidate.arrival==='Pátek'?((departure==='Sobota'&&nights===1)||(departure==='Neděle'&&nights===2)):candidate.arrival==='Sobota'?(departure==='Neděle'&&nights===1):(departure==='Stejný den'&&nights===0);if(!validStay)return null;
  return {version:1,draftId,source:'weekend-planner',eventYear,eventId,createdAt:new Date(createdAt).toISOString(),expiresAt:new Date(expiresAt).toISOString(),arrival:candidate.arrival,departure,nights,attendanceType:candidate.attendanceType,accommodation:candidate.accommodation,accommodationOptionId,accommodationUnits:units,crew,showShine:candidate.showShine};
}

export function newerPlannerDraft(localDraft,serverDraft){
  if(!localDraft)return serverDraft||null;
  if(!serverDraft)return localDraft;
  return Date.parse(localDraft.createdAt)>Date.parse(serverDraft.createdAt)?localDraft:serverDraft;
}

export function shouldShowJoinCta({status,hasWaitingPlan=false,hasReservation=false}={}){
  if(status==='anonymous')return true;
  if(status!=='authenticated')return false;
  return !hasWaitingPlan&&!hasReservation;
}
