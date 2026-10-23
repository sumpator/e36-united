# Transakční e-maily — lokální dávka 23. 10. 2026

Výchozí a výsledný HEAD: `8a0da9cf9fc8620069e278d54a684e0e95cc387d`. Lokální propojená implementace; bez produkčních operací, commitu a nasazení. Zachované nesouvisející změny: report A3/A4, původní audit a diagnostiky. Úvodní tabulka zachycuje výchozí stav; skutečný výsledek a omezení jsou níže. **Závěrečné ověření doplněno: výchozí transport vypnutý, první aktivační hranice, 607/607 Node PASS.** Přesné nové výsledky a autoritativní postup nasazení jsou v závěrečných oddílech.

## Pracovní mapa před implementací

| Událost | Příjemce | Dosavadní stav | Potřebná úprava |
| --- | --- | --- | --- |
| Vznik členského profilu účtu | Vlastník účtu | Bez uvítání; Firebase účet vzniká před bootstrapem D1 | Jednou po serverovém vytvoření profilu, ne při loginu |
| Ověření e-mailu | Neověřený uživatel | Firebase SDK, zejména pozvánka hosta | Bezpečnostní mechanismus zachovat; vlastní odeslání vyžaduje privilegované generování odkazů |
| Reset hesla | Adresa z existujícího Firebase toku | Firebase SDK | Stejná závislost; nenahrazovat Firebase vlastními tokeny |
| Výslovné uložení předběžného plánu | Člen | Bez zprávy | Jedno potvrzení prvního uložení, nikoli průběžných editací |
| Odeslání rezervace | Člen rezervace | Bez zprávy | Atomická událost přijetí, bez výzvy k platbě |
| Schválení / zamítnutí / zrušení rezervace | Člen rezervace | Bez zprávy | Rozlišit rozhodnutí a aktuální platební povinnost |
| Žádost o změnu / zrušení, rozhodnutí | Žadatel | Bez zprávy | Přijetí není schválení; používat veřejný komentář |
| Potvrzená změna ceny / evidované úhrady | Člen rezervace | Bez zprávy | Skutečný rozdíl a aktuální saldo; žádná domyšlená refundace |
| Vznik objednávky | Adresa snapshotu objednávky | Atomický `merch_outbox`, pouze text, `waitUntil` | Společné HTML/text, obnovitelná fronta, aktuálnost |
| Platba / připraveno / odesláno / zrušení Merche | Adresa snapshotu | Jen odeslání mělo zprávu | Doplnit chybějící potvrzené události, rozlišit žádost od zrušení |
| Odstoupení / reklamace Merche | Adresa snapshotu | Textové potvrzení přijetí | Jednotná šablona, ne automatické schválení |
| Pozvánka hosta z brány | Uložená adresa pozvánky | Obecný `email_outbox`, jednorázový token, text | Zachovat token/ověření; sjednotit zpracování a vzhled |
| Kampaně / newsletter | Existující segment | Oddělená příprava, poskytovatel, webhook a suppression | Neměnit kampaně; rozšířit existující webhook pouze o provozní korelaci |

## Zásady

Používá se existující obecný `email_outbox` a SMTP2GO adaptér. Historické zprávy se nepřevádějí ani zpětně negenerují. Nové provozní události jsou označené verzí; periodický Worker zpracovává pouze tuto verzi. Merch si zachovává dosavadní obchodní outbox, jeho nové záznamy se atomicky propojují s obecným doručováním. Nejde o druhý nezávislý transport.

Bezpečnostní e-maily Firebase nejsou vydávány za graficky sjednocené: dosavadní Worker pouze ověřuje Firebase ID tokeny, nemá privilegovaný Admin SDK/OAuth mechanismus generování akčních odkazů. Obyčejný veřejný API klíč ani členský ID token takové oprávnění nenahrazují. Zůstává původní Firebase odesílání a jeho ochrany; připravené vizuální varianty samy tuto provozní závislost neodstraňují.

## Oficiální podklady

- [SMTP2GO batch a korelace email_id](https://developers.smtp2go.com/reference/send-email-batch)
- [SMTP2GO vlastní hlavičky](https://support.smtp2go.com/hc/en-gb/articles/37256328109081-Custom-Headers)
- [SMTP2GO webhooky, autentizace a opakování](https://support.smtp2go.com/hc/en-gb/articles/223087967-Webhooks)
- [Firebase generování akčních odkazů](https://firebase.google.com/docs/auth/admin/email-action-links)
- [Firebase vlastní bezpečný handler akčních kódů](https://firebase.google.com/docs/auth/custom-email-handler)
- [Gmail podporované CSS](https://developers.google.cn/gmail/design/css?hl=en)

Kritické rozložení je tabulkové s inline styly a systémovými fonty. Media queries jsou pouze vylepšení. Browserová emulace tmavého režimu není důkaz automatické inverze Gmailu ani vykreslení Outlooku.

## Výsledek a přesné spouštěče

Je připraveno 25 variant HTML + text; 23 je napojených na provozní události společné fronty. Dvě bezpečnostní varianty jsou pouze náhledy; jejich skutečné odesílání zůstává Firebase. Účet, rezervace a objednávka nejsou zaměňovány. Kampaně, newsletter, body, schvalování fotografií a běžné přihlašování nové zprávy nedostávají.

| Klíč šablony | Skutečný serverový spouštěč | Příjemce a význam |
| --- | --- | --- |
| `account_created` | `email_account_created`: INSERT aktivního člena s `last_login_at` z existujícího `bootstrapMember`; klíč `account-created:memberId` | Aktuální vlastník nově založeného profilu; účet není rezervace. UPDATE při dalších přihlášeních nic nevytváří. |
| `verify_email` | Vlastní grafika nenapojena. Nová registrace heslem volá existující Firebase `sendEmailVerification` přes `verifyNewPasswordAccount` | Jen nově vytvořený neověřený password účet; ověřený a federovaný účet se vynechá. Login ani změna profilu nic neposílají. |
| `reset_password` | Vlastní grafika nenapojena; zachovaný Firebase SDK reset | Adresa z dosavadního bezpečného toku; bez vlastní identity či tokenů. |
| `preliminary_saved` | `email_preliminary_created`: první INSERT active v `putPreliminaryReservation` | Člen plánu; nezávazné výslovné uložení, ne schválená rezervace. Pozdější UPDATE Planneru bez další zprávy. |
| `reservation_submitted` | `email_reservation_created` nebo skutečný přechod statusu do pending | Vlastník rezervace; přijetí žádosti, zatím nic neplatit. |
| `reservation_approved` | `email_reservation_status`: přechod do approved mimo pending žádost | Vlastník rezervace; aktuální rekapitulace a skutečný doplatek. |
| `reservation_rejected` | Stejný trigger: přechod do rejected | Vlastník; výsledek a pouze veřejné vyjádření, nikdy interní `review_note`. |
| `reservation_cancelled` | Přímý přechod do cancelled nebo schválená cancellation v `email_request_decided` | Vlastník; skutečné zrušení, nikoli automatická refundace. |
| `reservation_changed` | `email_reservation_price`: potvrzená změna ceny approved; `email_event_payment_details`: skutečná změna účtu/IBAN/příjemce/splatnosti u approved nezaplacených rezervací | Jen dotčený člen; aktuální povinnost, nikoli průběžný koncept. |
| `reservation_payment` | `email_reservation_payment`: skutečný rozdíl `amount_paid_czk` po autoritativním platebním handleru/ledgeru | Vlastník; rozdíl úhrady, celkem uhrazeno, zůstatek/přeplatek. Záporná oprava je výslovně pojmenovaná. |
| `request_change` | `email_request_created`: nová žádost change | Žadatel; přijetí není schválení změny. |
| `request_cancellation` | Stejný trigger: nová žádost cancellation | Žadatel; rezervace ještě není zrušená. |
| `request_approved` | `email_request_decided`: pending → approved u change | Žadatel; uložený výsledek a veřejný komentář, current cena/saldo. |
| `request_rejected` | Stejný trigger: pending → rejected | Žadatel; výsledek, nikoli zrušení původní rezervace. |
| `merch_confirmation` | `createOrder`: dosavadní atomický merch_outbox confirmation → `email_merch_intent` | E-mail adresy ze snapshotu objednávky; položky, ceny, sleva, doprava, platba. |
| `merch_payment` | `changeOrder`: payment / paid / void-payment, pouze pokud se skutečně změnila evidence plateb | Snapshot příjemce objednávky; samostatná evidence Merche, ne srazu. Oprava platby je pojmenovaná. |
| `merch_ready` | `changeOrder`: potvrzený status ready | Snapshot příjemce; uložené pokyny převzetí, nic se nevymýšlí. |
| `merch_sent` | `changeOrder`: potvrzený status sent | Snapshot příjemce; uložený dopravce/tracking. |
| `merch_cancel_request` | `changeOrder`: cancel placené objednávky, která zůstává nezrušená | Snapshot příjemce; pouze přijetí žádosti. |
| `merch_cancelled` | `changeOrder`: skutečný cancelled | Snapshot příjemce; zrušení, ne automaticky vrácené peníze. |
| `merch_withdraw` | `changeOrder`: uložené withdraw | Snapshot příjemce; potvrzení přijetí odstoupení, ne schválení. |
| `merch_complaint` | `changeOrder`: uložené complaint | Snapshot příjemce; potvrzení přijetí reklamace. |
| `merch_refund` | `changeOrder`: skutečný zápis refund | Snapshot příjemce; přesná evidovaná částka; neposílá novou výzvu k placení. |
| `merch_resolved` | `changeOrder`: výslovné resolve-request pro konkrétní requestId | Snapshot příjemce; uložený výsledek vyřízení. |
| `arrival_invitation` | Existující potvrzení příjezdu hosta s adresou vytvoří pozvánku a email_outbox; `email_arrival_intent` ji označí verzí | Uložená adresa pozvánky; stejná účast a jednorázový token, ověření adresy + výslovné propojení. |

Soutěžní stavy, ceny a platební výpočty se nemění. Existující idempotency/revision mechanismy handlerů zůstávají. SQL triggery ukládají intent ve stejné transakci jako obchodní změnu. Opakovaný bezezměnový zápis ani replay obchodní operace negenerují další automatickou zprávu. Neexistuje historický backfill.

## Fronta, aktuálnost, soukromí

- Reuse `email_outbox` + SMTP2GO batch adaptér; Merch má stále autoritativní obchodní intent v původním `merch_outbox`. Nový unikátní `source_outbox_id` propojuje oba, nejde o dva souběžné odesílatele.
- `worker.scheduled` obnovuje čekající práci bez otevřené stránky; lokálně je připraven minutový cron a limit 5 zpráv na jedno zpracování. `waitUntil` po úspěšném zápisu pouze urychluje zpracování, nenahrazuje frontu. [Oficiální Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).
- CAS queued → sending zabraňuje souběžnému odeslání stejného záznamu. Chybějící konfigurace ponechá zprávu ve frontě. Zpracování přerušené déle než 10 minut přejde na uncertain, nikoli automatický retry.
- Zpráva se před transportem přepočte z aktuálních autorizovaných serverových dat. Neaktuální žádost/approval, zrušená objednávka, vyřízený požadavek, zrušený plán nebo spotřebovaná/expirující pozvánka se neodešlou jako starý stav (`superseded`). Již uhrazená/cancelled rezervace nevyzývá znovu k placení. Dříve odeslané HTML/text se nepřepisuje.
- SMTP2GO přijetí = `sent` se štítkem „Přijato SMTP2GO“. Jen delivered webhook znamená „Doručeno“, nikdy přečteno. Zachované Bearer ověření webhooku, unikátní provider event ID, shoda příjemce a korelace. Bez vlastních hlaviček je možná pouze přesná shoda uloženého `email_id` a adresy; předčasný webhook před API odpovědí vyžaduje hlavičky.
- Pozdní API odpověď nezruší již zaznamenané doručení. Hard bounce/spam blokuje další provozní zprávy i bez kontaktu newsletteru. Odhlášení newsletteru samo o sobě provozní zprávu neblokuje; ruční suppression a nedoručitelnost ano.
- Jednoznačně odmítnutá zpráva může mít explicitní auditovaný retry (nový řádek s unikátním `retry_of`). Uncertain vyžaduje nejprve doložené ověření **nepřijetí** u SMTP2GO a samostatnou akci opakování. Zadání výsledku kontroly není automatické ověření poskytovatele; neexistuje slepý resend.
- Retry pozvánky dohledá původní jednorázovou identitu i přes více pokusů. Nevytváří další příjezd/token. Admin náhled token neodhaluje; odeslaný payload se z fronty odstraní. Vlastní pozvánka se nadále spotřebuje pouze existujícím ověřeným POST claimem, nikdy otevřením GET.
- Odkazy obsahují konkrétní reservation/order ID. `getCurrentReservation(..., requestedId)` nově ověřuje vlastníka i u staršího ročníku; cizí ID vrací 404. Existující členský login zachová cíl a reload; Merch používá dosavadní chráněný detail objednávky. GET nemění obchodní stav.
- Cena Merche se bere ze snapshotu v haléřích a formátuje do Kč; stav plateb z projekce. Rezervace používá současnou projekci a konfiguraci svého ročníku. QR se bezpečně otevře v existujícím portálu; e-mail nemá externí generátor QR ani neověřený obrázek QR.

## Admin Mailing

Nová část „Provozní e-maily“ má katalog spouštění/náhledů, filtr typu/stavu/souvisejícího ID, historii s paginací 25, bezpečný detail chyby, snapshot náhledu, provider časy a výslovný auditovaný retry. Chráněno `requireAdmin`, `no-store`; běžný člen má 403. Generace a aktuální účet brání aplikaci opožděné odpovědi do jiného účtu. Koordinátor obnovuje pouze aktivní část, kampaně zůstávají zachované.

Historie objednávky používá stávající Merch endpoint rozšířený o společnou frontu (staré nespojené zprávy zůstávají viditelné). U rezervací lze použít filtr ID v Mailingu; další tlačítko do detailu rezervace se nepřidávalo. Není nový editor šablon.

## Migrace a konfigurace — připravené, nikoli aplikované

`db/migrations/2026-10-23-transactional-emails.sql` a totožný přírůstek `db/schema.sql`:

- 13 aditivních sloupců do email_outbox: verze/intenty/vazby, attempt/retry metadata, provider request ID, přijetí/doručení a zmrazené HTML/text;
- 4 indexy (unikátní událost, zdroj, retry + fronta), tabulky `transactional_email_events` a `transactional_email_audit` s FK na outbox; singleton `transactional_email_control` s výchozím enabled=0;
- 19 triggerů (12 původních + 7 pro bezpečné řízení transportu a přechod); marker `2026-10-23-transactional-emails`;
- žádný rebuild/drop/backfill ani změna obchodních dat; izolovaná naplněná předchozí verze prošla migrací, integritou a FK kontrolou;
- starý Worker nesmí po migraci nově převzít zprávu při vypnutém transportu: DB claim interlock platí pro Merch i pozvánky. Před migrací převzaté požadavky mohou doběhnout; jejich skutečné výsledky se nesmějí přepsat na „neodesláno“. Přechodová synchronizace zachovává výsledek, nový cron ignoruje historické tx_version=0. Přesný postup v závěru nahrazuje původní pracovní návrh.

`wrangler.jsonc` připravuje `* * * * *`; žádná služba, účet, DNS, tarif ani preview URL se nemění. Zachovaný SMTP2GO adaptér a schválené sender/Reply-To defaults `E36 United <info@e36united.cz>`. Stávající env overrides se nepřepisují. Tajné hodnoty nebyly čteny ani uloženy.

Před skutečným zapnutím ověřit existující SMTP2GO klíč/odesílatele a současný autentizovaný webhook; má zasílat processed, delivered, bounce, spam, reject a vlastní hlavičky `X-E36-Mail-Type`, `X-E36-Transaction-Id`. Rozšíření patří do **stávajícího** webhooku, ne nové placené služby. Bez hlaviček není bezpečná korelace webhooku, který předběhne send API response; tuto provozní konfiguraci nebylo lokálně možné ověřit.

Firebase Worker dnes pouze ověřuje ID token. Nemá privilegovaný Admin SDK/OAuth mechanismus generování verification/password-reset action linků; veřejný web API key ani členský JWT jej nenahrazují. Pro custom delivery bude potřeba schválený serverový credential s příslušným oprávněním Firebase Auth, autorizované continue/handler URL a zachování pravidel Firebase pro tokeny. Nic takového nebylo založeno ani nasazeno. Dvě auth grafické šablony proto Admin správně označuje jako nenapojené. Default Firebase verification pro nový password signup a původní reset jsou zachované, ne graficky sjednocené. Selhání žádosti o ověřovací zprávu neruší již založený účet a UI to sdělí pravdivě.

## Náhledy a skutečně prohlédnuté screenshoty

Generátor `node scripts/preview-transactional-emails.mjs` vytvořil **25 HTML + 25 textových alternativ** a index v `test-results/transactional-previews/`. Jsou to zřetelně označená syntetická data, nikoli skutečné odeslání nebo pokyn k platbě. Vygenerované soubory a screenshoty jsou ignorovaná lokální diagnostika, ne produkční obsah.

Finální screenshoty v `test-results/transactional-browser-proof/` byly skutečně otevřeny a prohlédnuty:

| Soubor / podadresář | Co bylo prohlédnuto |
| --- | --- |
| `transactional-emails-trans-fe52c-d-blocked-images-1440-light-chromium/reservation_payment.png` | Platba, desktop 1440, světlý; částka/účet/VS, další krok a kontakt. |
| `transactional-emails-trans-ee876-nd-blocked-images-390-light-chromium/merch_confirmation.png` | Mobil 390, dlouhá šestipoložková objednávka, součet 4 140 Kč; zalamování bez přetékání. |
| `transactional-emails-trans-948eb-and-blocked-images-390-dark-chromium/reservation_payment.png` | Mobilní tmavá emulace, kontrast štítků, částek a odkazu. |
| `transactional-emails-trans-a72d4-nd-blocked-images-1440-dark-chromium/images-blocked.png` | Desktop tmavý, všechny obrázky zablokované; značka, položky i ceny zůstávají textově. |
| `transactional-emails-trans-ee876-nd-blocked-images-390-light-chromium/images-blocked.png` | Stejný stav bez obrázků na mobilu. |
| `transactional-emails-trans-ee876-nd-blocked-images-390-light-chromium/reservation_rejected.png` | Mobilní zamítnutí, červená pouze pro skutečný negativní výsledek. |
| `transactional-emails-trans-65e95-lure-and-audited-retry-1440-chromium/mailing-failure.png` | Admin historie + bezpečný detail odmítnutí a explicitní retry na desktopu. |
| `transactional-emails-trans-32ce7-ilure-and-audited-retry-390-chromium/mailing-failure.png` | Totéž na mobilu, čitelné pole důvodu a dotykové tlačítko. |

Následně byly skutečně otevřeny i `mailing-preview.png` pro oba rozměry ve stejných Admin podadresářích pod `test-results/transactional-browser-admin-preview/`: náhled reálné zachycené zprávy uvnitř sandbox iframe, nikoli pouze samostatná ukázka. Na snímcích detailu chyby byl náhled pod aktuálním posunem; vlastní snímek iframe dokládá jeho vykreslení a vnitřní posouvání delší zprávy.

Browser-act byl zkontrolován podle skillu, ale lokálně nebyl dostupný ani jeho runtime; bez instalace byl použit stávající projektový Playwright. Tyto browserové náhledy **nejsou** ověřením v Gmailu, Seznamu, Outlooku či Apple Mail ani nucené barevné inverze Gmailu. Outlook má tabulkový/inline fallback a MSO šířku, ale reálné klienty musí ověřit samostatně schválené odeslání.

## Kontroly a všechny zaznamenané neúspěchy

Prostředí Windows, Node 24.19.0, projektový Playwright 1.62.1; izolované SQLite/D1 adaptéry, skutečné aplikační handlery a zachycený SMTP transport. Žádné produkční bindingy, skutečný provider transport ani e-mail. Browserové fotografie/logo byly skutečné repo assety, nikoli prázdné náhrady. Bez retry, skip, potlačování konzole nebo prodlužování timeoutů.

| Běh | Výsledek a následná náprava |
| --- | --- |
| Počáteční cílené existující Node soubory | 63: 61 PASS / 2 FAIL. Staré očekávání „chybějící SMTP = failed“ změněno na obnovitelnou frontu; historická preliminary migrační fixture odstraňovala tabulku a nechávala nové závislé triggery. Opraveny pouze dotčené testovací předpoklady. |
| Merch + preliminary po opravě fixture/očekávání | 31/31 PASS. |
| První nové transakční testy | 11: 9 PASS / 2 FAIL (chybějící write_token v nové fixture, chybný počet triggerů). Následně 11/11 PASS. |
| Rozšířený kombinovaný Node běh | 27: 26 PASS / 1 FAIL; test hledal „nikoliv“, schválený text říká „nikoli“. Zachován význam rozlišení přijetí/rozhodnutí. |
| Kombinace SMTP2GO/tracking/Merch/rezervací/transakčních testů | 92/92 PASS. |
| **Jediný úplný `node --test tests/*.mjs`** | **599: 596 PASS / 3 FAIL / 0 skipped.** Log `test-results/transactional-previews/node-full.log`. Nejde o kompletní zelený průchod finální verze. |
| Náprava těchto tří selhání | (1) Bootstrap fixture ručně vynechávala email_outbox: přepnuta na kanonické schéma, přidána kontrola jediného uvítání. (2) Starý source contract zakazoval verification i při novém signup: zúžen na schválený nový signup, nikoli login. (3) Nový suppression test při stejném created_at vybíral nesprávnou UUID řádku: deterministic rowid pořadí v testu. Žádná authorization/negative assertion odstraněna. Cíleně 46/46 PASS. |
| Atomické welcome přes DB trigger místo neatomického hooku | Bootstrap/Merch/preliminary/transakční cíleně 62/62 PASS. |
| Transakční regrese po úpravách timestampů | 16/16 PASS. |
| Závěrečné webhook/pozvánka + přímo související tracking a arrivals flow | **49/49 PASS**, včetně 18 transakčních testů: webhook bez hlaviček, ochrana před shodou pouhé adresy, dva retry téže pozvánky, redakce tokenu a nezměněná identita. |
| První Chromium soubor (7 scénářů) | 4 PASS / 3 FAIL: testovací API bridge vracel produkční místo lokálního CORS originu. Bridge opraven, ne aplikace ani kontrola chyb. |
| Cílené tři scénáře po CORS | 1 PASS (deep link) / 2 FAIL (Admin iframe bez allow-scripts odmítal automatické fixture init skripty a zaznamenal konzolovou chybu). Náhled sjednocen s existujícím campaign sandboxem bez allow-same-origin; HTML dostalo CSP script-src none. Kontrola konzole zachována. |
| Cílený Admin po sandbox opravě | 2/2 PASS. |
| Cílené render náhledy | 4/4 PASS. |
| Render + přesný sign-in/reload deep link | 5/5 PASS. Původně připojený grep starého new-member souboru nevybral žádný jeho scénář; tento soubor nebyl vydáván za prověřený. |
| **Finální browser proof po CSS a doladění náhledů** | **6/6 PASS** (Admin 2 + render 4), screenshoty výše. Deep link prošel dříve samostatně, není vydáván za jeden nový kompletní 7/7 běh. |
| Dodatečné přímé ověření Admin iframe | 2/2 PASS po přidání kontroly nadpisu v iframe; následně 2/2 PASS po doplnění viditelnosti a vlastního screenshotu iframe (4,2 s a 4,4 s). Nejde o další celou sadu. První pokus o příkaz přes npx se vůbec nespustil (npx není v PATH); použito místní `node node_modules/@playwright/test/cli.js`, bez instalace nebo změny verze. |
| Závěrečná syntax / Admin graph / whitespace | **28 změněných a nových JS/MJS PASS**, Admin **64 modulů, 0 chyb, 0 cyklů**, `git diff --check` PASS. |

První Playwright runner po dokončení všech scénářů čekal na ukončení svého Windows serveru. Příkaz procesu byl explicitně ověřen (`node tests/e2e/server.mjs`, PID 40796); ukončen pouze tento vlastní testovací server, runner poté vypsal původní 4 PASS / 3 FAIL. Jeho 33,1 min zahrnuje čekání na teardown, ne dobu jednotlivých UI kontrol. Není to nová chyba aplikace ani přepsaný úspěšný výsledek.

Výše je historie první etapy: tehdy se celá Node sada neopakovala a cílené výsledky nebyly vydávány za úplný green run. Následující výslovné zadání povolilo jeden finální celý Node průchod až po dokončení ochrany vypnutého transportu; jeho skutečný výsledek je uveden níže. Celé browser sady, WebKit ani CI se neopakovaly. Známé CI #121 zůstává oddělené a nebylo analyzováno/opravováno. Skutečné e-mailové klienty zůstávají neověřené.

## Změněné soubory a oddělení práce

Backend: `worker/index.js`, `worker/router.js`, `worker/domains/reservations/index.js`, `worker/domains/arrival-invitations.js`, `worker/domains/merch/{index,service}.js`, `worker/domains/mailing/{index,tracking,transactional,transactional-routes,transactional-template}.js`.

Frontend: `admin.html`, `admin.js`, `admin/modules/mailing/index.js`, nový `admin/modules/mailing/transactional.js`, nové scoped `admin/transactional.css`, `member.html`, `member.js`, `member/modules/planner/index.js`, nový `member/registration-verification.js`.

Schéma/config: `db/schema.sql`, nová explicitní migrace výše, `wrangler.jsonc`. Cache pouze dotčené vstupy/moduly a CSS `20261023-mail1`; nezměněné závislosti zachovávají vlastní verze. Kontrolní manifest `scripts/admin-module-releases.mjs` a `scripts/check-admin-module-graph.mjs` jsou sjednocené, žádný modul nemá dvě runtime URL.

Testy: nové `tests/transactional-emails.test.mjs`, `tests/e2e/transactional-emails.spec.mjs`; nezbytné návaznosti v `tests/{active-member-guard,arrivals-live-flow,arrivals-local,arrivals-picker,merch-commerce,preliminary-reservations,production-feedback}.test.mjs`. Generátor `scripts/preview-transactional-emails.mjs`, tento report. `worker/domains/members.js` nakonec není změněný (uvítání řeší atomický trigger).

Ponecháno mimo dávku: upravený `docs/photo-upload-a3-a4-local.md`, nesledovaný `docs/project-audit-2026-10-09.md` a `scripts/audit-20261009/`. Diagnostika a náhledy pod ignorovaným `test-results/`. Nic nebylo stageováno, commitnuto, pushnuto nebo nasazeno; pracovní strom obsahuje výše uvedené související změny a tyto původní nesouvisející soubory.

## Závěrečné doplnění — bezpečně vypnutý transport

Společný přepínač v původní implementaci **neexistoval**; SMTP2GO klíč nebyl bezpečný provozní přepínač ani hranice aktivace. Doplněn jediný malý serverový singleton v D1, podobně jako ostatní serverové konfigurace projektu. Není nový konfigurační editor, souběžný env přepínač ani klientská preference.

`transactional_email_control`: `id=1`, `enabled=0`, `activated_at=NULL`, `revision=0` po migraci. `transactionalTransportState` povolí zpracování pouze s přesným integer enabled=1, platnou první aktivací a revizí. Chybějící tabulka/řádek, nedostupná DB i neplatné hodnoty znamenají vypnuto. Databázový CHECK navíc odmítá neplatnou hodnotu enabled; žádné truthy „yes“/„true“.

Působnost: `deliverTransactionalEmails` v cronu, v urychlení přes `waitUntil`, při ručně zařazeném retry, `deliverMerchEmail` včetně starého `/email` vstupu a `deliverArrivalInvitations`. Injektovaný transport v testu kontrolu také neobchází. Nový Worker nespustí starý fallback nad chybějící/nepřipravenou konfigurací. Kampaně a původní Firebase odesílání nejsou tímto přepínačem řízené a nebyly změněné.

Při vypnutí se nic nepředává SMTP2GO, nepořizuje se sending claim, nezvyšují se pokusy ani nevzniká sent timestamp. Obchodní zápisy běží dál; historie i náhledy jsou čitelné. Admin ukazuje zvlášť „vypnuté — dosud neaktivováno“, „pozastavené“ a nedostupnou/neplatnou konfiguraci.

### První aktivace versus pozdější pozastavení

- **Před první aktivací:** insert/promote nového tx1 intentu v téže transakci uloží `skipped`, `before_initial_activation`. Žádné mazání, označení za odeslané nebo automatické pozdější odeslání. Zůstává příjemce, vazba, skutečný čas i důvod vynechání. Původní tx0 historie se nemění.
- **První aktivace:** jediný UPDATE enabled z 0 na 1 atomicky nastaví `activated_at` a zvýší revizi. Rozhodnutí o zařazení události používá DB trigger, ne porovnání sekund created_at. Aktivace a obchodní zápisy se v DB serializují: událost před hranicí zůstane skipped i při shodném časovém razítku s novou způsobilou událostí.
- **Pozastavení po aktivaci:** activated_at se zachová, enabled=0 a revize se zvýší. Nové události zůstávají queued. Opětovné enabled=1 je obnovení, nikoli nová hranice; queued projde dosavadní kontrolou aktuálnosti, neaktuální approval se například změní na superseded, nikoli na odeslaný platební pokyn.
- **Dodatečné odeslání skipped:** není součást zapnutí. Teprve po první aktivaci může Admin samostatným POST retry s důvodem vytvořit auditovaný nový řádek; server znovu ověří aktuálnost a příjemce. Původní skipped řádek a jeho prázdné sent_at se nepřepisují. Během pozastavení se takový výslovný retry pouze zařadí, neodešle.
- **Souběh:** queued claim i poslední autorizace před předáním poskytovateli kontrolují enabled a zachycenou revizi. Pozastavení/obnovení během čekání na obsah zneplatní starého procesora; vrátí svůj nepředaný řádek do queued. Při souběhu s legacy Merchem může získat oprávnění jen jeden sender — legacy může převzít jen dosud queued kanonický řádek, nikoli ten, který nový Worker již převzal.
- **Hranice odvolání:** poslední úspěšná DB autorizace je začátek předávání poskytovateli. Vypnutí poté není zrušením již rozběhnutého přenosu a nemůže odvolat přijatý e-mail. Výsledek takového pokusu se musí doplnit pravdivě nebo zůstat uncertain. Před dalšími pokusy je nutné dovyšetřit nejasný výsledek, nikoli resetovat frontu.

Přepínač není prostředkem k odvolání odeslaných zpráv ani zákazem zpracování příchozích doručovacích webhooků. Ty dál zaznamenávají skutečné výsledky i během pozastavení.

### Výsledky závěrečného ověření

| Kontrola v tomto pokračování | Přesný výsledek |
| --- | --- |
| Existující transakční + přímo závislé Merch/Příjezdy po zavedení konfigurace | 46/46 PASS. Odesílací testy konfiguraci aktivují **před** vytvořením ověřované události; produkční default se nemění. |
| První nové hraniční regrese | 23: 22 PASS / 1 FAIL. Nový test waitUntil používal chybnou URL webhooku a dostal správné 401 z auth; opravena URL testu na existující `/api/mailing/smtp2go-webhook`, nikoli server či ochrana. Následně 23/23 PASS. |
| Hranice + Merch + Příjezdy včetně bezpečných testovacích kandidátů | 52/52 PASS. |
| Poslední cílený transakční soubor včetně neaktuálnosti při obnovení | 24/24 PASS; kontrolovaná bariéra bez sleepů/retries. |
| Dotčený Admin Chromium 1440 a 390 px | 2/2 PASS (5,0 s), výchozí vypnutí → zapnutí v izolaci → explicitní retry → pozastavení, historie/náhledy a konzole. Pouze tyto scénáře, ne celá sada ani render matice. |
| **Jediný finální celý Node běh po dokončení úprav tohoto zadání** | **607 skutečně spuštěných testů: 607 PASS / 0 FAIL / 0 skipped / 0 cancelled / 0 todo**; 7 763,8 ms. `node --test tests/*.mjs`, log `test-results/transactional-previews/node-final-transport-off.log`. Další celý běh neproveden. |
| Závěrečná syntax, Admin graph, diff | **29 JS/MJS PASS; 64 modulů, 0 chyb, 0 cyklů; git diff --check PASS.** |

Nové regrese navíc dokládají: nulový zachycený fetch při přítomném syntetickém SMTP klíči a vypnuté konfiguraci, úspěšné uložení skutečným platebním handlerem, vypnutí ručního/cron/waitUntil/legacy vstupu, nedostupnou i neplatnou konfiguraci, žádný resend předaktivační/tx0 fronty, zachování paused queued práce a explicitních retry, zákaz přepsání první hranice, staré sender claims po migraci a jejich vzájemnou exkluzi. Dosavadní testy nejasného výsledku, owner scope, suppression, aktuálnosti a delivered webhooků zůstávají a prošly celou sadou. Nic nebylo přeskočeno nebo umlčeno.

Nová viditelná informace v Adminu byla skutečně prohlédnuta na snímcích `test-results/transactional-transport-gate-browser/transactional-emails-trans-{65e95-lure-and-audited-retry-1440,32ce7-ilure-and-audited-retry-390}-chromium/transport-off.png` a mobilním `transport-paused.png`. Nezměněné šablony se znovu vizuálně nekontrolovaly. Skill browser-act byl načten; browser-act ani uv nejsou dostupné, nic se neinstalovalo. Použit stávající Playwright, vlastní lokální server po kontrole ukončen. Neověřuje to skutečného e-mailového klienta.

Oproti předchozí etapě byly pro toto závěrečné doplnění upraveny: `db/schema.sql`, **stále tatáž dosud nenasazená** migrace `db/migrations/2026-10-23-transactional-emails.sql`, `worker/domains/mailing/{transactional,transactional-routes}.js`, `worker/domains/merch/index.js`, `worker/domains/arrival-invitations.js`, `admin.html`, `admin/modules/mailing/transactional.js`, `tests/transactional-emails.test.mjs`, `tests/e2e/transactional-emails.spec.mjs`, `tests/arrivals-local.test.mjs`, `tests/merch-commerce.test.mjs`, generátor a tento report. Nevznikla druhá produkční migrace ani dokumentace. Již nepublikované cache URL `20261023-mail1` zůstávají jednotné; závislosti a workflow beze změny.

## Konkrétní další nasazení s vypnutým transportem

Následuje postup pro **samostatné schválení**, nikoli provedené operace. Výchozí plán už není „nasadit a začít odesílat“.

1. **Záloha:** ověřit přesný diff/HEAD a oddělení nesouvisející práce, zaznamenat Worker verzi, Pages a registr migrací. Vytvořit čerstvou D1 zálohu mimo Git a ověřit načtení do izolované DB, integritu/FK a pouze níže uvedenou migraci na naplněné kopii. SMTP transport na kopii musí zůstat vypnutý. Zaznamenat rozpracované `sending` v email_outbox/merch_outbox včetně ID a provider ID; ty se nemažou.
2. **Jediná migrace:** aplikovat pouze `2026-10-23-transactional-emails.sql`, právě jednou. Marker musí předem chybět; pokud existuje jiné než očekávané schéma, zastavit, neopakovat ALTER ani nepouštět ostatní čekající migrace. Ověřit data, FK, integritu, 19 email triggerů, 4 indexy, konfigurační řádek a registry. Po migraci musí následující SELECT vracet enabled=0, activated_at=NULL, revision=0:

   ```sql
   SELECT id,enabled,activated_at,revision FROM transactional_email_control WHERE id=1;
   SELECT tx_version,status,error_message,COUNT(*) FROM email_outbox
   GROUP BY tx_version,status,error_message;
   ```

3. **Přechod starých senderů:** DB interlock od commitu migrace blokuje nové legacy claims Merche a pozvánek při vypnutém transportu, ale nemůže vrátit síťový požadavek, který získal claim **před** migrací. Nechat tyto konkrétní požadavky doběhnout přes jejich existující transport timeout (adaptér používá 18 s; samotná časová prodleva není důkaz neodeslání). Znovu čtením porovnat sending/provider stavy a u nejasného výsledku ověřit SMTP2GO podle ID. Nic nepřeznačovat na queued/failed jen podle stáří a neprovádět resend. Před pozdější aktivací nesmí zůstat nevyhodnocený starý sender ani provoz směrovaný na starou verzi. Nejasnost je důvod ponechat transport vypnutý, nikoli zasahovat do business přepínačů.
4. **Worker:** nasadit ze schváleného commitu, po migraci, včetně připraveného cronu. V D1 ponechat enabled=0. Ověřit aktivní verzi/100% směrování na nový Worker, health, auth a transport stav z chráněného GET `/api/admin/mailing/transactional`: enabled=false, phase=not_activated. S přítomným provider klíčem nesmí narůstat sent/attempts ani docházet k SMTP voláním nových intentů. Nevytvářet kvůli ověření produkční rezervace/platby/objednávky. Cron zůstane nečinný pro transport, business API běží.
5. **Pages:** až po odpovídajícím schématu a Workeru publikovat frontend; ověřit source SHA, dotčené cache URL a novou informaci v Adminu. Žádná změna DNS, preview URL, tarifu, aktuálního ročníku, LIVE, registrací ani pozastavení Merche. Výchozí transport dál vypnutý. Při chybě obnovy nic nevracet plošným přepisem DB přes nová data.
6. **Webhook:** ověřit existující `/api/mailing/smtp2go-webhook`, jeho Bearer secret a předávání processed/delivered/bounce/spam/reject, přesné `email_id`, příjemce a vlastní hlavičky `X-E36-Mail-Type` + `X-E36-Transaction-Id`. Použít existující webhook, ne další službu; secret neukládat do reportu. Bez hlaviček funguje až shoda již uloženého provider ID, nikoli předčasný callback. Tato skutečná konfigurace a delivery nejsou lokálně ověřené.
7. **Kontrola před případnou aktivací:** aktivace vyžaduje nové schválení a dokončené omezené testovací odeslání. Zkontrolovat konfigurační stav, rozdělení tx0/tx1 stavů, skipped důvody, žádné neoprávněné sending a vyšetření uncertain; starší skipped se nikdy automaticky nepřeznačují. Ukázat počet queued (při první aktivaci očekávaně žádná způsobilá automatická starší fronta), zkontrolovat webhook a sender. Produkční události před hranicí jsou zachované jako skipped.

   První aktivace pouze po souhlasu:

   ```sql
   UPDATE transactional_email_control SET enabled=1
   WHERE id=1 AND enabled=0 AND activated_at IS NULL;
   ```

   Technické pozastavení a pozdější obnovení (nikoli reset první hranice):

   ```sql
   UPDATE transactional_email_control SET enabled=0 WHERE id=1;
   -- Pozdější obnovení až po kontrole fronty:
   UPDATE transactional_email_control SET enabled=1
   WHERE id=1 AND enabled=0 AND activated_at IS NOT NULL;
   ```

   Po každé operaci ověřit affected rows a SELECT stavu + GET v Adminu. `activated_at` ani `revision` ručně nenastavovat; trigger je spravuje atomicky. Config řádek nemažte. Při pozastavení počítat s předáním, které již bylo autorizované/rozběhnuté; vypnutí není odvolání u SMTP2GO.

## Omezené testovací odeslání — pouze připravený výběr

Generátor navíc vytváří pod `test-results/transactional-previews/restricted-test/` čtyři kandidáty HTML/text: `reservation_payment`, `merch_confirmation`, `reservation_rejected`, `arrival_invitation`. Používají `transactionalTestExample`: předmět i nadpis **[TEST]**, syntetické údaje, výslovné „Nic neplať, nic nepotvrzuj“, bez účtu/VS, CTA URL, použitelného tokenu pozvánky nebo odkazu claim. Manifest `approval-required.json` má approved=false, recipients=null, messageCount=null. Čtyři kandidáti **nejsou** schválením čtyř odeslaných zpráv ani výběrem příjemce. Kontrola bezpečnosti vzorků je součástí Node testů; nevznikl nový sender.

Po samostatném schválení přesných vlastních adres, výběru variant a počtu:

1. Ponechat automatický business transport vypnutý; nevytvářet produkční rezervaci, platbu, objednávku ani pozvánku. Neopakovat staré fronty a nezapínat Merch.
2. Použít existující SMTP2GO adaptér `createSmtp2goAdapter(env).sendTest(...)` se schválenými adresami a `renderTransactionalEmail(kind, transactionalTestExample(kind))`, zachovaným sender/Reply-To. Jde o **výslovný provider test**, jako stávající Mailing test path, ne o odblokování automatické obchodní fronty. Nepřidává se endpoint ani univerzální editor. Hlavička `X-E36-Mail-Type: test` nesmí zapsat zprávu jako skutečnou rezervaci či transakční delivery řádku; zaznamenat jen bezpečný provider request/email ID pro kontrolu. Předem operátor zkontroluje přesný počet zpráv v provider payloadu, souhlas a adresy; bez těchto vstupů se transport nevolá.
3. Přerušení nebo nejistý provider výsledek neřešit opakováním; nejdřív zjistit skutečný výsledek podle zaznamenaného ID. Testovací obsah sám nemá platný claim ani platební pokyn. Žádný seed, SQL obcházení obchodních handlerů či hromadný resend.
4. V Gmailu, Seznamu, Outlooku a Apple Mail na telefonu/desktopu zkontrolovat světlý/tmavý vzhled, obrázky blokované i načtené a čitelnost. Doručení testu ověřit v provider historii; test header je z business delivery záměrně vyloučen. Automatickou transakční webhook korelaci prokazují izolované regrese; skutečnou produkční korelaci následně sledovat pouze u první zvlášť schválené legitimní zprávy, ne pomocí falešné platby. Není to nyní ověřené.
5. Custom Firebase grafiku dál ponechat jako nenapojenou. Chybějící privilegované serverové generování action linků nezakládat v této fázi; původní ověření a reset Firebase zachovat.

Skutečné SMTP doručení, produkční cron/webhook, fyzický telefon a e-mailové klienty nejsou ověřené. Nebyl proveden produkční zápis, upload, e-mail, migrace, deployment, commit, push, DNS/Cloudflare/plan změna ani aktivace služeb.
