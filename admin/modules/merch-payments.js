import {esc,statusLabel,orderMarkup,bindOrder} from '../../merch/order-view.js?v=20260924-workspace1';
import {money} from '../../merch/catalog.js?v=20260924-merch2';

export function initializeMerchPayments({panel,request,state}){
 const heading=panel.querySelector('.admin-section-head'),sraz=document.createElement('div');
 sraz.dataset.srazPayments='';
 for(const child of [...panel.children])if(child!==heading)sraz.append(child);
 panel.append(sraz);
 const tabs=document.createElement('div');tabs.className='portal-tabs';tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Druh platby');tabs.innerHTML='<button type="button" data-finance-tab="sraz">Sraz</button><button type="button" data-finance-tab="merch">Merch</button>';heading.after(tabs);
 const host=document.createElement('div');host.className='merch-connected';host.hidden=true;panel.append(host);
 const originalCopy=heading.querySelector('p').textContent;
 let generation=0,page=1;
 const valid=g=>g===generation&&state.currentUser&&!state.denied&&state.activeAdminView==='payments';
 async function load(){
  const g=++generation;host.innerHTML='<p role="status">Načítám platby za Merch…</p>';
  try{
   const result=await request('/api/admin/merch/orders?page='+page);if(!valid(g))return;
   host.innerHTML=`<div class="merch-orders">${result.orders.map(order=>`<button class="merch-order-card" type="button" data-payment-order="${esc(order.id)}"><span><b>${esc(order.number)} · ${esc(order.snapshot.address.name)}</b><small>VS ${esc(order.variableSymbol)} · ${statusLabel[order.payment.status]}</small><small>Celkem ${money(order.snapshot.totalMinor)} · Uhrazeno ${money(order.payment.paidMinor)} · ${order.payment.overpaidMinor?'Přeplatek '+money(order.payment.overpaidMinor):'Zbývá '+money(order.payment.remainingMinor)}</small></span></button>`).join('')||'<p>Žádné platby za Merch.</p>'}</div>${result.orders.length||page>1?`<div class="merch-actions"><button class="shop-button" data-payment-prev ${page===1?'disabled':''}>Předchozí</button><span>Strana ${page}</span><button class="shop-button" data-payment-next ${result.hasMore?'':'disabled'}>Další</button></div>`:''}<div data-payment-detail></div>`;
   host.querySelector('[data-payment-prev]')?.addEventListener('click',()=>{page--;void load();});host.querySelector('[data-payment-next]')?.addEventListener('click',()=>{page++;void load();});
   host.querySelectorAll('[data-payment-order]').forEach(button=>button.onclick=async()=>{try{const result=await request('/api/admin/merch/orders/'+encodeURIComponent(button.dataset.paymentOrder));if(valid(g))show(result.order);}catch(error){if(valid(g))host.querySelector('[data-payment-detail]').textContent=error.message;}});
  }catch(error){if(valid(g))host.textContent=error.message;}
 }
 function show(order){const detail=host.querySelector('[data-payment-detail]');detail.innerHTML=`<p><a class="shop-button" href="admin.html?section=merch&order=${encodeURIComponent(order.id)}&from=merch-payments">Otevřít celou objednávku v Merchandisingu →</a></p>${orderMarkup(order,{admin:true,paymentOnly:true})}`;bindOrder(detail,order,{admin:true,request,onChange:show});}
 function sync(){const merch=state.paymentKind==='merch';sraz.hidden=merch;host.hidden=!merch;heading.querySelector('p').textContent=merch?'Platby za členské objednávky UNITED MERCH.':originalCopy;heading.querySelector('[data-payment-count]').hidden=merch;tabs.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String((button.dataset.financeTab==='merch')===merch)));if(merch)void load();else generation++;}
 tabs.onclick=event=>{const button=event.target.closest('[data-finance-tab]');if(!button)return;state.paymentKind=button.dataset.financeTab;window.dispatchEvent(new Event('admin:paymentkind'));sync();};
 window.addEventListener('admin:viewchange',()=>{if(state.activeAdminView==='payments')sync();else generation++;});
 window.addEventListener('admin:accesslost',()=>{generation++;host.replaceChildren();});
 window.addEventListener('admin:paymentrestore',sync);
 return {sync};
}
