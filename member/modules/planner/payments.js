import qrcode from '../../../vendor/qrcode-generator.mjs';
import { $, esc } from '../../ui.js?v=20260902-phase3';

const czkFormatter=new Intl.NumberFormat('cs-CZ',{style:'currency',currency:'CZK',maximumFractionDigits:0});
const numericValue=value=>Number(value||0);

export function formatCzk(value){return czkFormatter.format(numericValue(value))}

function paymentLabel(status){return({unpaid:'K platbě',underpaid:'Doplatek',paid:'Zaplaceno',overpaid:'Přeplatek',not_required:'Bez platby'})[status]||'Platba'}

function paymentQrSvg(spayd){
  if(!spayd)return '';
  try{const qr=qrcode(0,'M');qr.addData(spayd,'Byte');qr.make();return qr.createSvgTag({cellSize:4,margin:8,scalable:true})}
  catch(error){console.error('QR payment render failed',error);return ''}
}

export function createReservationPayments(){
  function paymentCard(reservation){
    const payment=reservation?.payment;if(!reservation||!payment)return '';
    const cancelled=reservation.status==='cancelled';
    if(cancelled)return `<article class="member-payment-card payment-status-cancelled"><div class="member-payment-copy"><span class="member-kicker">ZRUŠENÁ REZERVACE</span><h4>Další platba se nepožaduje.</h4><dl><div><dt>Cena v historii</dt><dd>${esc(formatCzk(payment.amountDueCzk))}</dd></div><div><dt>Evidovaně uhrazeno</dt><dd>${esc(formatCzk(payment.amountPaidCzk))}</dd></div></dl>${payment.amountPaidCzk>0?'<p>Finanční vypořádání řeší organizátor. Automatické vrácení peněz se neprovádí.</p>':'<p>Rezervace je zrušená a není co doplácet.</p>'}</div></article>`;
    if(reservation.status!=='approved'){
      const pendingTitle=reservation.changePending?'ZMĚNA ČEKÁ NA SCHVÁLENÍ':'ČEKÁ NA SCHVÁLENÍ',pendingPriceLabel=reservation.changePending?'Aktuální cena':'Cena rezervace';
      return `<article class="member-payment-card payment-status-pending"><div class="member-payment-layout"><div class="member-payment-copy"><span class="member-kicker">${pendingTitle}</span><h4>Do schválení nic nového nedoplácej.</h4><dl><div><dt>${pendingPriceLabel}</dt><dd>${esc(formatCzk(payment.amountDueCzk))}</dd></div><div><dt>Již zaplaceno</dt><dd>${esc(formatCzk(payment.amountPaidCzk))}</dd></div></dl><p>United tým rezervaci zkontroluje. QR ani nové platební instrukce teď nejsou dostupné.</p></div></div></article>`;
    }
    if(payment.remainingCzk>0&&!payment.configurationReady)return '<article class="member-payment-card"><div class="member-payment-copy"><span class="member-kicker">PLATBA REZERVACE</span><h3>Platební údaje připravujeme.</h3><p>Chybějící platební údaje nelze bezpečně zobrazit. Zkus načtení zopakovat později.</p></div></article>';
    const settled=payment.remainingCzk<=0,qr=!settled&&payment.status!=='overpaid'?paymentQrSvg(payment.spayd):'';
    const deadline=payment.deadline?new Intl.DateTimeFormat('cs-CZ',{dateStyle:'long'}).format(new Date(`${payment.deadline}T12:00:00`)):'—';
    const eventLabel=reservation.year&&reservation.year!=='NEXT'?`E36 United ${reservation.year}`:reservation.title||'E36 United';
    const statusCopy=`${paymentLabel(payment.status)}${payment.overdue?' · po splatnosti':''}`;
    const paymentTitle=payment.status==='overpaid'?`Přeplatek ${formatCzk(payment.overpaymentCzk)}`:payment.status==='underpaid'?`Doplatek ${formatCzk(payment.remainingCzk)}`:payment.status==='unpaid'?`K platbě ${formatCzk(payment.remainingCzk)}`:'Zaplaceno';
    const balanceLabel=payment.status==='overpaid'?'Přeplatek':payment.status==='underpaid'?'Doplatek':payment.status==='unpaid'?'K platbě':'Stav';
    const balanceValue=payment.status==='overpaid'?formatCzk(payment.overpaymentCzk):payment.status==='paid'?'Zaplaceno':formatCzk(payment.remainingCzk);
    const instructionRows=payment.configurationReady?`<div><dt>Příjemce</dt><dd>${esc(payment.recipientName)}</dd></div><div><dt>Účet</dt><dd>${esc(payment.accountDisplay)}</dd></div><div><dt>Variabilní symbol</dt><dd>${esc(payment.variableSymbol)}</dd></div><div><dt>Zpráva</dt><dd>${esc(payment.message)}</dd></div><div><dt>Splatnost</dt><dd>${esc(deadline)}</dd></div>`:'';
    return `<article class="member-payment-card payment-status-${esc(payment.status)}">${payment.testMode?'<div class="payment-test-warning">TESTOVACÍ PLATBA – NEPLAŤTE</div>':''}<div class="payment-item-head"><div><span class="member-kicker">REZERVACE / EVENT</span><h3>${esc(eventLabel)}</h3></div><span class="payment-status-pill">${esc(statusCopy)}</span></div><div class="member-payment-layout"><div class="member-payment-copy"><h4>${esc(paymentTitle)}</h4><dl><div><dt>Cena rezervace</dt><dd>${esc(formatCzk(payment.amountDueCzk))}</dd></div><div><dt>Již zaplaceno</dt><dd>${esc(formatCzk(payment.amountPaidCzk))}</dd></div><div class="member-payment-remaining"><dt>${esc(balanceLabel)}</dt><dd>${esc(balanceValue)}</dd></div>${instructionRows}</dl></div>${qr?`<div class="member-payment-qr"><div>${qr}</div><strong>Naskenuj v bankovní aplikaci</strong><small>QR obsahuje aktuální splatnou částku, stejný VS, zprávu a splatnost.</small></div>`:''}</div></article>`;
  }
  function renderReservationPayment(reservation){
    const detail=$('[data-reservation-payment-detail]'),paymentsList=$('[data-payments-list]');if(!paymentsList)return;
    const payment=reservation?.payment;
    if(!reservation||!payment){if(detail){detail.hidden=true;detail.innerHTML=''}paymentsList.innerHTML='<article class="portal-empty-state"><span aria-hidden="true">✓</span><div><strong>Aktuálně nemáš žádnou platbu k řešení.</strong><p>Platební údaje se zobrazí pouze u skutečné rezervace.</p></div></article>';return}
    const fullCard=paymentCard(reservation);paymentsList.innerHTML=fullCard;if(detail){detail.hidden=false;detail.innerHTML=`<div class="reservation-payment-detail-head"><span class="member-kicker">PLATBA K REZERVACI</span><h3>Cena, úhrada a QR</h3></div>${fullCard}`}
  }

  return {renderReservationPayment};
}
