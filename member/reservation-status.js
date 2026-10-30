// Presentation only: payment state/eligibility comes from the existing server response.
export function reservationStatusPresentation(reservation,{plan=false,draft=false,open=false,error=false}={}){
  if(error&&!reservation)return {tone:'error',symbol:'!',label:'Chyba načtení',payment:''};
  if(!reservation)return plan?{tone:'neutral',symbol:'◷',label:'Předběžná rezervace',payment:''}:draft||open?{tone:'action',symbol:'!',label:'K dokončení',payment:''}:{tone:'neutral',symbol:'—',label:'Bez rezervace',payment:''};
  const states={approved:{tone:'confirmed',symbol:'✓',label:'Potvrzeno'},pending:{tone:'waiting',symbol:'◷',label:'Čeká na tým'},rejected:{tone:'rejected',symbol:'×',label:'Zamítnuto'},cancelled:{tone:'neutral',symbol:'—',label:'Zrušeno'}};
  const view={...(states[reservation.status]||{tone:'neutral',symbol:'·',label:'Stav rezervace'}),payment:''};
  if(reservation.changePending||reservation.cancellationPending)view.label+=' · žádost čeká na tým';
  const payment=reservation.payment;
  if(reservation.status==='approved'&&payment){
    view.payment=payment.awaitingApproval||reservation.changePending?'Platba čeká na schválení změny':({unpaid:'K úhradě',underpaid:'K doplacení',paid:'Zaplaceno',overpaid:'Přeplatek',not_required:'Bez platby'})[payment.status]||'';
    view.paymentTone=['unpaid','underpaid'].includes(payment.status)?'action':'neutral';
  }
  return view;
}
