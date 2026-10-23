// Versioned transactional copy, independent of the site's appearance preference.
export const TRANSACTIONAL_TYPES=Object.freeze({
 account_created:['MŮJ UNITED','Účet Můj United je připravený','Účet není rezervace na sraz.','Dokončit profil'],
 verify_email:['MŮJ UNITED','Ověř svoji e-mailovou adresu','Dokonči ověření adresy svého účtu.','Ověřit e-mail'],
 reset_password:['MŮJ UNITED','Nastav si nové heslo','Odkaz použij jen tehdy, pokud jsi o změnu požádal.','Nastavit nové heslo'],
 preliminary_saved:['REZERVACE','Nezávazný plán je uložený','Nejde o schválenou rezervaci. Zatím nic neplať.','Zobrazit uložený plán'],
 reservation_submitted:['REZERVACE','Žádost o rezervaci jsme přijali','Čeká na schválení UNITED týmem. Zatím nic neplať.','Zobrazit rezervaci'],
 reservation_approved:['REZERVACE','Rezervace je schválená','UNITED tým schválil tvoji rezervaci.','Zobrazit rezervaci'],
 reservation_rejected:['REZERVACE','Rezervace nebyla schválena','Rozhodnutí se týká rezervace na sraz, nikoli tvého účtu.','Zobrazit rezervaci'],
 reservation_cancelled:['REZERVACE','Rezervace je zrušená','Zrušení bylo dokončeno. Případné evidované platby tím nejsou vrácené.','Zobrazit rezervaci'],
 reservation_changed:['REZERVACE','Údaje rezervace byly změněny','Potvrzená změna ovlivnila tvoji platbu.','Zobrazit platbu'],
 reservation_payment:['PLATBA','Platbu jsme zaevidovali','Zkontroluj přijatou částku a aktuální zůstatek rezervace.','Zobrazit platbu'],
 request_change:['REZERVACE','Žádost o změnu jsme přijali','Rezervace zatím platí v dosavadní podobě.','Zobrazit rezervaci'],
 request_cancellation:['REZERVACE','Žádost o zrušení jsme přijali','Rezervace zatím není zrušená. Počkej na rozhodnutí UNITED týmu.','Zobrazit rezervaci'],
 request_approved:['REZERVACE','Změna rezervace je schválená','Zobrazené údaje odpovídají vyřízené žádosti.','Zobrazit rezervaci'],
 request_rejected:['REZERVACE','Žádost nebyla schválena','Původní rezervace zůstává beze změny.','Zobrazit rezervaci'],
 merch_confirmation:['UNITED MERCH','Objednávku jsme přijali','Objednávka je uložená. Níže najdeš rekapitulaci a další krok.','Zobrazit objednávku'],
 merch_payment:['PLATBA · UNITED MERCH','Platbu objednávky jsme zaevidovali','Úhrada Merche je oddělená od plateb za sraz.','Zobrazit objednávku'],
 merch_ready:['UNITED MERCH','Objednávka je připravená k převzetí','Řiď se uloženými pokyny k převzetí níže.','Zobrazit objednávku'],
 merch_sent:['UNITED MERCH','Objednávka byla odeslána','Níže najdeš uložené údaje o zásilce.','Zobrazit objednávku'],
 merch_cancel_request:['UNITED MERCH','Žádost o zrušení jsme přijali','Objednávka ještě není zrušená. Požadavek vyřídí UNITED tým.','Zobrazit objednávku'],
 merch_cancelled:['UNITED MERCH','Objednávka je zrušená','Případné vrácení peněz evidujeme samostatně.','Zobrazit objednávku'],
 merch_withdraw:['UNITED MERCH','Odstoupení jsme přijali','Potvrzujeme přijetí požadavku, nikoli jeho automatické schválení.','Zobrazit objednávku'],
 merch_complaint:['UNITED MERCH','Reklamaci jsme přijali','Potvrzujeme přijetí požadavku, nikoli jeho automatické schválení.','Zobrazit objednávku'],
 merch_refund:['PLATBA · UNITED MERCH','Vrácení peněz je zaevidované','Tato zpráva potvrzuje evidovanou refundaci, nikoli žádost o ni.','Zobrazit objednávku'],
 merch_resolved:['UNITED MERCH','Požadavek k objednávce je vyřízený','Výsledek vyřízení najdeš níže.','Zobrazit objednávku'],
 arrival_invitation:['MŮJ UNITED','Připoj si účast z příjezdu','Pozvánka propojí existující účast s tvým ověřeným účtem.','Připojit účast'],
});
export const escapeMail=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const czk=value=>new Intl.NumberFormat('cs-CZ',{style:'currency',currency:'CZK',maximumFractionDigits:2}).format(Number(value)||0);
export function portalLink(section,params={}){
 const url=new URL('https://e36united.cz/member.html');url.searchParams.set('section',section);
 for(const [key,value] of Object.entries(params))if(value)url.searchParams.set(key,value);
 return url.href;
}
function safeUrl(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null}catch{return null}}
export function renderTransactionalEmail(kind,data={}){
 const type=TRANSACTIONAL_TYPES[kind];if(!type)throw Error('unknown_transactional_template');
 const [area,baseTitle,description,baseAction]=type,title=data.title||baseTitle;
 const subject=`${title}${data.reference?' · '+data.reference:''} · E36 UNITED`.replace(/[\r\n]/g,' ').slice(0,240);
 const intro=data.intro||description,next=data.next||'Teď nemusíš nic dělat.',preheader=data.preheader||next;
 const facts=(data.facts||[]).filter(([,value])=>value!==null&&value!==undefined&&value!=='');
 const action=safeUrl(data.url),button=data.action||baseAction;
 const reason=data.reason||`Tuto provozní zprávu dostáváš kvůli události „${title}“${data.reference?' ('+data.reference+')':''}. Nejde o newsletter.`;
 const tone=data.tone||(/rejected/.test(kind)?'danger':/approved|payment|ready|sent|refund/.test(kind)?'success':'info');
 const accent={info:'#0869c4',success:'#096b46',danger:'#b32940'}[tone]||'#0869c4';
 const text=[area,title,intro,...facts.map(([label,value])=>`${label}: ${value}`),...(data.items||[]).map(item=>`${item.name} / ${item.color} / ${item.size} · ${item.quantity} × ${czk(item.unitPriceMinor/100)}`),data.comment?`Vyjádření UNITED týmu: ${data.comment}`:'',next,action?`${button}: ${action}`:'',reason,'E36 United · info@e36united.cz'].filter(Boolean).join('\n\n');
 const row=(label,value)=>`<tr><td class="mail-muted" style="padding:9px 0;border-bottom:1px solid #e0e7ee;vertical-align:top;width:38%;color:#4b5e72;">${escapeMail(label)}</td><td style="padding:9px 0 9px 12px;border-bottom:1px solid #e0e7ee;vertical-align:top;font-weight:bold;word-break:break-word;overflow-wrap:anywhere;">${escapeMail(value)}</td></tr>`;
 const items=(data.items||[]).map(item=>{const src=safeUrl(item.imageUrl);return `<tr><td style="padding:12px 0;border-bottom:1px solid #e0e7ee;">${src?`<img src="${escapeMail(src)}" alt="" width="56" height="56" style="display:block;object-fit:contain;margin-bottom:8px;">`:''}<strong>${escapeMail(item.name)}</strong><br>${escapeMail(item.color)} / ${escapeMail(item.size)}<br>${escapeMail(item.quantity)} × ${escapeMail(czk(item.unitPriceMinor/100))}</td></tr>`}).join('');
 const html=`<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https:; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escapeMail(subject)}</title><style>@media(max-width:480px){.mail-panel{padding:22px!important}h1{font-size:26px!important}}@media(prefers-color-scheme:dark){.mail-bg{background:#14202f!important}.mail-panel{background:#1c2b3b!important;color:#f1f5fa!important}.mail-muted{color:#d1dce9!important}.mail-area{color:#8bc9ff!important}.mail-link{color:#8bc9ff!important}.mail-next{background:#243c52!important;color:#f1f5fa!important}}</style></head><body class="mail-bg" style="margin:0;background:#eaf0f5;color:#101c2b;font:16px/1.6 Arial,Helvetica,sans-serif;"><div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeMail(preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:24px 10px;"><!--[if mso]><table role="presentation" width="620" cellspacing="0" cellpadding="0"><tr><td><![endif]--><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;table-layout:fixed;"><tr><td class="mail-panel" style="padding:30px;background:#fff;color:#101c2b;border-radius:12px;word-break:break-word;overflow-wrap:anywhere;"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td><img src="https://e36united.cz/united-logo-blue-silver-transparent.png" width="36" height="36" alt="" style="display:block;background:#fff;border-radius:50%;"></td><td style="padding-left:12px;font-size:18px;font-weight:bold;">E36 UNITED</td></tr></table><p class="mail-area" style="font-size:12px;letter-spacing:1px;font-weight:bold;color:${accent};margin:26px 0 8px;">${escapeMail(area)}</p><h1 style="font-size:30px;line-height:1.2;margin:0 0 16px;">${escapeMail(title)}</h1><p style="margin:0 0 20px;">${escapeMail(intro)}</p>${facts.length?`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed;">${facts.map(([label,value])=>row(label,value)).join('')}</table>`:''}${items?`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed;">${items}</table>`:''}${data.comment?`<p><strong>Vyjádření UNITED týmu</strong><br>${escapeMail(data.comment)}</p>`:''}<p class="mail-next" style="padding:16px;background:#edf2f7;border-left:3px solid ${accent};margin:24px 0;">${escapeMail(next)}</p>${action?`<table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#0869c4" style="border-radius:7px;"><a href="${escapeMail(action)}" style="display:inline-block;padding:13px 20px;color:#fff;background:#0869c4;text-decoration:none;font-weight:bold;line-height:1.5;">${escapeMail(button)}</a></td></tr></table><p class="mail-muted" style="font-size:12px;color:#4b5e72;word-break:break-all;">Pokud tlačítko nefunguje: ${escapeMail(action)}</p>`:''}<p class="mail-muted" style="margin:28px 0 0;padding-top:18px;border-top:1px solid #ced9e4;font-size:13px;color:#4b5e72;">${escapeMail(reason)}<br>Potřebuješ pomoct? <a class="mail-link" style="color:#0869c4;" href="mailto:info@e36united.cz">info@e36united.cz</a></p></td></tr></table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;
 return {subject,preheader,html,text};
}
