export function normalizeAccommodationOption(source){
  return {
    id:String(source?.id||''),eventId:String(source?.eventId||''),name:String(source?.name||''),kind:source?.kind==='tent'?'tent':'cabin',
    inventoryMode:source?.inventoryMode==='unlimited'?'unlimited':'limited',unitsTotal:Number(source?.unitsTotal||0),blockedUnits:Number(source?.blockedUnits||0),approvedUnits:Number(source?.approvedUnits||source?.blockedUnits||0),pendingUnits:Number(source?.pendingUnits||0),
    freeUnits:source?.freeUnits==null?null:Number(source.freeUnits),capacityPerUnit:Math.max(1,Number(source?.capacityPerUnit||1)),unitPriceCzk:Number(source?.unitPriceCzk||0),
    personPriceCzk:Number(source?.personPriceCzk||0),beddingFeePerPersonCzk:Number(source?.beddingFeePerPersonCzk||0),cityTaxPerPersonPerNightCzk:Number(source?.cityTaxPerPersonPerNightCzk||0),
    active:source?.active!==false,soldOut:source?.soldOut===true,visual:source?.visual||{hasCustomPhoto:false,imageUrl:null,version:null},
  };
}

export function normalizeAccommodationSnapshot(source){
  if(!source?.optionId)return null;
  return {
    optionId:String(source.optionId),optionName:String(source.optionName||''),kind:String(source.kind||''),capacityPerUnit:Math.max(1,Number(source.capacityPerUnit||1)),peopleCount:Number(source.peopleCount||0),unitCount:Number(source.unitCount||0),
    unitPriceCzk:Number(source.unitPriceCzk||0),personPriceCzk:Number(source.personPriceCzk||0),beddingFeePerPersonCzk:Number(source.beddingFeePerPersonCzk||0),cityTaxPerPersonPerNightCzk:Number(source.cityTaxPerPersonPerNightCzk||0),nights:Number(source.nights||0),
    baseTotalCzk:Number(source.baseTotalCzk||0),personTotalCzk:Number(source.personTotalCzk||0),beddingTotalCzk:Number(source.beddingTotalCzk||0),cityTaxTotalCzk:Number(source.cityTaxTotalCzk||0),totalCzk:Number(source.totalCzk||0),visual:source.visual||{hasCustomPhoto:false,imageUrl:null,version:null},
  };
}

export function normalizePayment(source){
  if(!source||typeof source!=='object')return null;
  return {
    amountDueCzk:Number(source.amountDueCzk||0),amountPaidCzk:Number(source.amountPaidCzk||0),balanceCzk:Number(source.balanceCzk||0),remainingCzk:Number(source.remainingCzk||0),overpaymentCzk:Number(source.overpaymentCzk||0),
    status:String(source.status||'unpaid'),overdue:source.overdue===true,variableSymbol:source.variableSymbol?String(source.variableSymbol):'',
    recipientName:String(source.recipientName||''),accountDisplay:String(source.accountDisplay||''),iban:String(source.iban||''),currency:String(source.currency||'CZK'),
    message:String(source.message||''),deadline:String(source.deadline||''),testMode:source.testMode!==false,configurationReady:source.configurationReady===true,
    actionable:source.actionable===true,awaitingApproval:source.awaitingApproval===true,spayd:source.spayd?String(source.spayd):'',paidAt:String(source.paidAt||''),
  };
}

export function normalizeReservation(source){
  if(!source)return null;
  const snapshot=source.carSnapshot||{};
  return {
    id:source.id||'',
    eventId:source.eventId||'',
    year:source.eventYear||source.year||'NEXT',
    title:source.title||'Příští E36 United',
    carId:source.carId||snapshot.id||'',
    carSnapshot:{
      id:snapshot.id||source.carId||'',
      nickname:snapshot.nickname||'',
      model:snapshot.model||'',
      body:snapshot.body||'',
      year:snapshot.year||'',
      color:snapshot.color||'',
    },
    arrival:source.arrival||'Pátek',
    crew:Number(source.crew||1),
    sleep:source.accommodation||source.sleep||'Bez ubytování',
    attendanceType:source.attendanceType||'',
    accommodationUnits:Number(source.accommodationUnits||0),
    accommodationSnapshot:normalizeAccommodationSnapshot(source.accommodationSnapshot),
    showshine:source.showShine||source.showshine||'Ne',
    note:source.note||'',
    status:source.status||'pending',
    changePending:source.changePending===true,
    paymentStatus:source.paymentStatus||'unpaid',
    amountDueCzk:Number(source.amountDueCzk||0),
    amountPaidCzk:Number(source.amountPaidCzk||0),
    payment:normalizePayment(source.payment),
    submittedAt:source.submittedAt||'',
    updatedAt:source.updatedAt||'',
  };
}
