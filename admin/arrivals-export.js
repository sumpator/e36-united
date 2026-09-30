import { escapeHtml as esc } from './ui.js?v=20260924-merch2';

// Private authenticated data only; no URL containing the export is published.
export function arrivalExportRows(data){
  return [...(data.arrivals||[]).map(a=>[a.label,a.model,a.body,a.plate,a.email,a.phone,a.crew,a.arrived_at,a.due,a.paid,a.balance]),
    ...(data.expected||[]).map(a=>[a.nickname||a.name,a.model,a.body,'',a.email,a.phone,a.crew,'Očekáváme',a.due,a.paid,a.due-a.paid])];
}
const labels=['Účastník','Auto','Karoserie','SPZ','E-mail','Telefon','Osob','Příjezd','Celkem Kč','Uhrazeno Kč','Doplatek Kč'];
export function printArrivals(target,data){
  const title='Příjezdy · '+(data.event?.title||data.event?.id||'');
  target.document.write('<!doctype html><html lang="cs"><meta charset="utf-8"><title>'+esc(title)+'</title><style>body{font:12px Arial;color:#111;padding:20px}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:6px;border:1px solid #aaa;overflow-wrap:anywhere}h1{font-size:22px}button{padding:12px}@media print{button{display:none}thead{display:table-header-group}tr{break-inside:avoid}}@page{size:A4 landscape;margin:10mm}</style><h1>'+esc(title)+'</h1><p>Vytvořeno '+esc(data.exportedAt||new Date().toISOString())+' · Soukromé údaje pro nouzovou obsluhu. Bezpečně uchovávat.</p><button id="print">Tisk / uložit PDF</button><table><thead><tr>'+labels.map(v=>'<th>'+esc(v)+'</th>').join('')+'</tr></thead><tbody>'+arrivalExportRows(data).map(row=>'<tr>'+row.map(v=>'<td>'+esc(String(v??'—'))+'</td>').join('')+'</tr>').join('')+'</tbody></table></html>');
  target.document.close();target.document.getElementById('print').onclick=()=>target.print();
}
export function downloadArrivalsCsv(data,eventId){
  const cell=v=>'"'+String(typeof v==='string'&&/^[=+\-@\t\r]/.test(v)?"'"+v:v??'').replaceAll('"','""')+'"';
  const lines=[['Ročník',data.event?.title||eventId,'Vytvořeno',data.exportedAt||new Date().toISOString()],labels,...arrivalExportRows(data)];
  const url=URL.createObjectURL(new Blob(['\uFEFF'+lines.map(row=>row.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='prijezdy-'+eventId+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
