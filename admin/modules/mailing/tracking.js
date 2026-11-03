import { escapeHtml as esc } from '../../ui.js?v=20260924-merch2';
const labels={recipients:'Příjemci',sent:'Přijato poskytovatelem',delivered:'Doručeno',opened:'Otevření zaznamenáno',clicked:'Kliknutí zaznamenáno',bounced:'Nedoručeno / blokováno',unsubscribed:'Odhlášeno'};
const states={prepared:'Připraveno',sent:'Přijato poskytovatelem',delivered:'Doručeno',soft_bounce:'Dočasně nedoručeno',hard_bounce:'Trvale nedoručeno',rejected:'Poskytovatel odmítl',blocked:'Blokováno / spam',unsubscribed:'Odhlášeno'};
const time=value=>value?esc(Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('cs-CZ'):value):'Nezaznamenáno';
function measurement(tracking,key){const state=tracking.measurement?.[key];return state===false||state==='disabled'?'Měření vypnuto':state==='unsupported'?'Měření nepodporováno':Number(tracking.counts?.[key])>0||state===true||state==='enabled'?Number(tracking.counts?.[key]||0):'Nezaznamenáno';}
export function renderMailingTracking(target,tracking){
 if(!target||!tracking)return;
 target.innerHTML='<div class="admin-mailing-kpis">'+Object.entries(labels).map(([key,label])=>'<article><span>'+label+'</span><strong data-delivery-metric="'+key+'">'+(['opened','clicked'].includes(key)?measurement(tracking,key):Number(tracking.counts?.[key]||0))+'</strong></article>').join('')+'</div>'+
 '<p class="mailing-tracking-note">Unikátní příjemci. Přijetí není doručení. Otevření je orientační kvůli ochraně soukromí a automatickému načítání obrázků. Chybějící událost neznamená nepřečtení ani naměřenou nulu.</p>'+
 '<details><summary>Detail doručení příjemců</summary><p>Zobrazeno nejvýše '+Number(tracking.detailLimit||500)+' příjemců.</p>'+
 (!(tracking.recipients||[]).length?'<p>Zatím bez příjemců.</p>':'')+(tracking.recipients||[]).map(row=>'<article class="admin-mailing-campaign"><div><p><strong>'+esc(row.email)+'</strong> · '+esc(row.name||'')+'</p><p><strong>'+esc(states[row.status]||row.status)+'</strong></p></div><dl class="mailing-recipient-events">'+[['Přijato poskytovatelem',row.sentAt],['Doručeno',row.deliveredAt],['Otevření zaznamenáno',row.openedAt],['Kliknutí zaznamenáno',row.clickedAt]].map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+time(value)+'</dd></div>').join('')+'</dl></article>').join('')+'</details>';
}
