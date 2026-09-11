// Command projections are partial. Absence is not null/zero, and a receipt is not a record.
export function mergeReservation(current,incoming,minimumRevision=0){
  if(!incoming||!current||incoming.id!==current.id||incoming.eventId&&current.eventId&&incoming.eventId!==current.eventId)return current;
  if(Number(incoming.revision||0)<Math.max(Number(current.revision||0),minimumRevision))return current;
  const next={...current,...incoming};
  for(const key of ['payment','member','carSnapshot','accommodationSnapshot','reviewContext']){
    if(incoming[key]&&typeof incoming[key]==='object'&&!Array.isArray(incoming[key]))next[key]={...current[key],...incoming[key]};
  }
  return next;
}

// Only submitted controls advance their baseline. Live text typed after send and
// unrelated controls remain a draft; the caller retains a conflicting revision.
export function confirmedFields(base,live,submitted){
  const next={...base,...submitted};
  return {base:next,delta:Object.fromEntries(Object.entries(live).filter(([key,value])=>value!==next[key]))};
}

export function commandReceiptMatches(receipt,operation){
  const parts=operation.path.split('/').filter(Boolean).map(decodeURIComponent),domain=parts[2];
  const type=domain==='reservations'?(parts[4]==='payment'?'payment':parts[4]==='requests'?'reservation-request':'reservation'):domain==='events'?'event':domain==='history'?'history-'+parts[5]:domain==='accommodation'&&!parts[3]?'accommodation-create':domain;
  const entity=domain==='preferences'?operation.actor:domain==='history'?parts[4]:parts[3];
  return receipt?.state==='confirmed'&&receipt.id===operation.id&&receipt.actorId===operation.actor&&receipt.operation===type&&
    (entity?receipt.entityId===entity:type==='accommodation-create'&&typeof receipt.entityId==='string')&&
    (receipt.eventId||null)===(operation.eventId||null)&&receipt.baseRevision===operation.revision&&Number.isSafeInteger(receipt.revision)&&receipt.revision>=operation.revision;
}
