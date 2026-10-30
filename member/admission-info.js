// Approved display copy for the prepared 2027 event. Never used to price a reservation.
const admission2027 = Object.freeze([
  {amount:500,copy:'za auto do 31. 12. 2026'},
  {amount:600,copy:'za auto od 1. 1. 2027'},
  {amount:800,copy:'za auto na místě bez registrace'},
]);

export function admissionInfoMarkup(event){
  if(event?.id!=='united-2027'||Number(event.year)!==2027)return '';
  return `<section class="portal-admission-info" aria-label="Informační ceník vjezdu E36 United 2027"><h2>Vjezd na E36 United 2027</h2><p>Cena za celé auto, bez ohledu na počet lidí.</p><div class="portal-admission-rates">${admission2027.map(rate=>`<div><strong>${rate.amount} Kč</strong><span>${rate.copy}</span></div>`).join('')}</div><p>Informační ceník vjezdu. Ubytování je samostatná volitelná položka. Částku konkrétní rezervace a pokyny k úhradě najdeš v jejím platebním rozpisu.</p></section>`;
}
