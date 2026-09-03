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

export function createReservationPayments({openSection}){
  function renderReservationPayment(reservation){
    const container=$('[data-member-payment]'),paymentsList=$('[data-payments-list]');if(!container||!paymentsList)return;
    const payment=reservation?.payment;
    if(!reservation||!payment){container.hidden=true;container.innerHTML='';paymentsList.innerHTML='<article class="portal-empty-state"><span aria-hidden="true">✓</span><div><strong>Aktuálně nemáš žádnou platbu k řešení.</strong><p>Platební údaje se zobrazí pouze u skutečné rezervace.</p></div></article>';return}
    if(reservation.status!=='approved'){
      const pendingTitle=reservation.changePending?'ZMĚNA ČEKÁ NA SCHVÁLENÍ':'ČEKÁ NA SCHVÁLENÍ';
      const pendingPriceLabel=reservation.changePending?'Cena po změně':'Cena rezervace';
      container.hidden=false;container.innerHTML=`<div><span class="member-kicker">${pendingTitle}</span><strong>${pendingPriceLabel}: ${esc(formatCzk(payment.amountDueCzk))}</strong><small>Již zaplaceno: ${esc(formatCzk(payment.amountPaidCzk))} · platební výzva se zpřístupní až po schválení.</small></div>`;
      paymentsList.innerHTML=`<article class="member-payment-card payment-status-pending"><div class="member-payment-layout"><div class="member-payment-copy"><span class="member-kicker">${pendingTitle}</span><h4>Do schválení nic nedoplácej.</h4><dl><div><dt>${pendingPriceLabel}</dt><dd>${esc(formatCzk(payment.amountDueCzk))}</dd></div><div><dt>Již zaplaceno</dt><dd>${esc(formatCzk(payment.amountPaidCzk))}</dd></div></dl><p>United tým rezervaci zkontroluje. QR ani nové platební instrukce teď nejsou dostupné.</p></div></div></article>`;return;
    }
    container.hidden=false;
    const statusCopy=`${paymentLabel(payment.status)}${payment.overdue?' · po splatnosti':''}`;
    const balanceCopy=payment.status==='overpaid'?`Přeplatek ${formatCzk(payment.overpaymentCzk)}`:payment.status==='underpaid'?`Doplatek ${formatCzk(payment.remainingCzk)}`:payment.status==='unpaid'?`K platbě ${formatCzk(payment.remainingCzk)}`:payment.status==='paid'?'Platba je vyrovnaná.':'Bez platby';
    container.innerHTML=`<div><span class="member-kicker">PLATBA REZERVACE</span><strong>${esc(statusCopy)}</strong><small>${esc(balanceCopy)}</small></div><button class="member-secondary" data-payment-open type="button">Přejít na platbu →</button>`;
    $('[data-payment-open]',container)?.addEventListener('click',()=>openSection('payments'));
    if(payment.remainingCzk>0&&!payment.configurationReady){paymentsList.innerHTML='<article class="member-payment-card"><div class="member-payment-copy"><span class="member-kicker">PLATBA REZERVACE</span><h3>Platební údaje připravujeme.</h3><p>Jakmile budou kompletní, uvidíš je bezpečně tady u své schválené rezervace.</p></div></article>';return}
    const settled=payment.remainingCzk<=0,qr=!settled&&payment.status!=='overpaid'?paymentQrSvg(payment.spayd):'';
    const deadline=payment.deadline?new Intl.DateTimeFormat('cs-CZ',{dateStyle:'long'}).format(new Date(`${payment.deadline}T12:00:00`)):'—';
    const eventLabel=reservation.year&&reservation.year!=='NEXT'?`E36 United ${reservation.year}`:reservation.title||'E36 United';
    const paymentTitle=payment.status==='overpaid'?`Přeplatek ${formatCzk(payment.overpaymentCzk)}`:payment.status==='underpaid'?`Doplatek ${formatCzk(payment.remainingCzk)}`:payment.status==='unpaid'?`K platbě ${formatCzk(payment.remainingCzk)}`:'Zaplaceno';
    const balanceLabel=payment.status==='overpaid'?'Přeplatek':payment.status==='underpaid'?'Doplatek':payment.status==='unpaid'?'K platbě':'Stav';
    const balanceValue=payment.status==='overpaid'?formatCzk(payment.overpaymentCzk):payment.status==='paid'?'Zaplaceno':formatCzk(payment.remainingCzk);
    const instructionRows=payment.configurationReady?`<div><dt>Příjemce</dt><dd>${esc(payment.recipientName)}</dd></div><div><dt>Účet</dt><dd>${esc(payment.accountDisplay)}</dd></div><div><dt>Variabilní symbol</dt><dd>${esc(payment.variableSymbol)}</dd></div><div><dt>Zpráva</dt><dd>${esc(payment.message)}</dd></div><div><dt>Splatnost</dt><dd>${esc(deadline)}</dd></div>`:'';
    paymentsList.innerHTML=`<article class="member-payment-card payment-status-${esc(payment.status)}">${payment.testMode?'<div class="payment-test-warning">TESTOVACÍ PLATBA – NEPLAŤTE</div>':''}<div class="payment-item-head"><div><span class="member-kicker">REZERVACE / EVENT</span><h3>${esc(eventLabel)}</h3></div><span class="payment-status-pill">${esc(statusCopy)}</span></div><div class="member-payment-layout"><div class="member-payment-copy"><h4>${esc(paymentTitle)}</h4><dl><div><dt>Cena rezervace</dt><dd>${esc(formatCzk(payment.amountDueCzk))}</dd></div><div><dt>Již zaplaceno</dt><dd>${esc(formatCzk(payment.amountPaidCzk))}</dd></div><div class="member-payment-remaining"><dt>${esc(balanceLabel)}</dt><dd>${esc(balanceValue)}</dd></div>${instructionRows}</dl></div>${qr?`<div class="member-payment-qr"><div>${qr}</div><strong>Naskenuj v bankovní aplikaci</strong><small>QR obsahuje pouze aktuální částku k úhradě, stejný VS, zprávu a splatnost.</small></div>`:''}</div></article>`;
  }

  return {renderReservationPayment};
}
