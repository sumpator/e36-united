// Draft generated from confirmed operational settings; requires explicit owner approval.
export function merchandiseDocuments(config){
 const s=config.seller||{},v=value=>value||'[DOPLNIT]',identity=`${v(s.name)}, IČO ${v(s.ico)}, ${v(s.street)}, ${v(s.postalCode)} ${v(s.city)}. ${v(s.taxStatus)}. Kontakt: ${v(s.email)}, ${v(s.phone)}.`;
 return {
 terms:`OBCHODNÍ PODMÍNKY UNITED MERCH
Prodávající: ${identity}
Obchod je určen aktivním členům United. Členství samo nevylučuje spotřebitelská práva. Před potvrzením jsou uvedeny konkrétní varianty, velikosti, množství, konečné ceny v Kč, sleva, doprava a celková cena. Nákup nepřidává ani neodečítá United Points. Pravidlo případné slevy je uvedeno v rekapitulaci.
Objednávka se závazkem platby vzniká potvrzením posledního kroku a uložením serverem. Uloženou objednávku, kopii podmínek a platební údaje najdeš v účtu; potvrzení posíláme také e-mailem. Neúspěšné doručení e-mailu již uloženou objednávku neruší. Před odesláním můžeš údaje opravit návratem do předchozího kroku.
Platba je bankovním převodem. Lhůta k zaplacení je ${config.activeHours||72} hodin. Kontrola úhrad je ruční. Stav „Vypršela“ při neevidované platbě není důkazem, že platba neodešla. Pokud jsi zaplatil včas nebo pozdě, kontaktuj tým. Možnost dodání znovu ověříme; není-li možné dodat, dohodneme vrácení přijatých peněz. Částečně uhrazené objednávky řeší tým jednotlivě.
Dodání: ${v(config.deliveryInformation)}
Nezaplacenou nepředanou objednávku můžeš v účtu zrušit. U uhrazené požádej o zrušení. Tím nejsou dotčena zákonná práva na odstoupení a reklamaci. Podmínky a ceny již uložené objednávky neměníme pozdější změnou katalogu.
Spotřebitelský spor můžeš řešit mimosoudně u České obchodní inspekce, Ústřední inspektorát – oddělení ADR, Štěpánská 15, 120 00 Praha 2, https://adr.coi.gov.cz. Nejdříve nás kontaktuj, abychom mohli spor vyřešit přímo.`,
 shipping:`DOPRAVA A PLATBA
Dodáváme pouze do České republiky. Osobní převzetí je zdarma: ${v(config.pickupInstructions)}
Zaslání na českou adresu stojí ${Number(config.shippingMinor||0)/100} Kč za celou objednávku. Dopravce sjednává tým ručně; výdejní místa ani dobírku nenabízíme.
Dodání: ${v(config.deliveryInformation)}
Zaplať částku, účet a variabilní symbol uvedené v uložené objednávce, případně použij bankovní QR. Při nedoplatku QR obsahuje jen zbývající částku. U uhrazené objednávky již další platbu nevyžadujeme. Přeplatky a refundace tým řeší ručně; obchod sám neodesílá peníze. Platbu kartou připravujeme, nyní není dostupná. Po odeslání zobrazíme údaje zásilky v účtu.`,
 returns:`ODSTOUPENÍ A REKLAMACE
Spotřebitel může od internetové koupě běžného oblečení odstoupit bez udání důvodu do 14 dnů od převzetí. Platí to také při osobním převzetí internetové objednávky. Oblečení není automaticky vyloučeno z tohoto práva.
Použij „Odstoupit od smlouvy“ v detailu objednávky a potvrď odeslání, nebo napiš na ${v(s.email)}. Přijetí evidujeme v detailu s časem a potvrdíme e-mailem. Odstoupit můžeš i vlastním jednoznačným sdělením; formulář není povinný.
Formulář: Oznamuji odstoupení od kupní smlouvy. Číslo objednávky: … Datum objednání / převzetí: … Jméno a adresa: … E-mail: … Datum: … Podpis pouze u papírového podání.
Zboží vrať do 14 dnů od odstoupení na ${v(s.street)}, ${v(s.postalCode)} ${v(s.city)}, ${v(s.name)}. Přímé náklady vrácení nese zákazník. Vrátíme přijaté peníze včetně nákladů nejlevnější nabízené dopravy (osobní převzetí se za dopravu nepovažuje) do 14 dnů od odstoupení; můžeme počkat na zboží nebo doklad o jeho odeslání. Zboží můžeš vyzkoušet jako v obchodě; odpovídáš jen za snížení hodnoty způsobené zacházením nad nezbytný rozsah.
Vadu můžeš vytknout, projeví-li se do dvou let od převzetí. V účtu použij „Reklamovat“, uveď objednávku, popis vady a požadovaný způsob nápravy, nebo nás kontaktuj na ${v(s.email)}. Přijetí písemně potvrdíme. Podle zákonných podmínek lze požadovat opravu či výměnu, a není-li náprava možná či řádná, přiměřenou slevu nebo odstoupení. Reklamaci včetně odstranění vady a vyrozumění vyřídíme nejpozději do 30 dnů, pokud se výslovně nedohodneme na delší lhůtě. Zákonná práva nejsou těmito podmínkami omezena.`,
 privacy:`OSOBNÍ ÚDAJE V UNITED MERCH
Správce: ${identity}
Pro objednávku zpracováváme členské ID, jméno, kontakty, položky, doručení, platební evidenci a komunikaci. Zpracování slouží plnění smlouvy, plnění zákonných evidenčních povinností a ochraně právních nároků. Marketingový souhlas není podmínkou nákupu. Výchozí dodací adresu ukládáme pouze na výslovný pokyn; její pozdější změna nepřepíše již uzavřenou objednávku.
Přístup má pověřený tým a nezbytní zpracovatelé stávající infrastruktury Cloudflare / Firebase a transakčních e-mailů SMTP2GO. Dopravci předáváme pouze údaje nezbytné pro doručení. Provozovatel před aktivací ověří smluvní záruky předávání mimo EU a retenční lhůty odpovídající svému daňovému a účetnímu režimu.
Retenční pravidla pro tento obchod: [DOPLNIT]
Můžeš požádat o přístup, opravu, omezení, výmaz či přenositelnost v zákonném rozsahu a vznést námitku tam, kde je přípustná. Zákonné uchování dokladů může bránit okamžitému výmazu. Kontakt ${v(s.email)}; stížnost lze podat Úřadu pro ochranu osobních údajů, https://uoou.gov.cz.`,
 };
}
