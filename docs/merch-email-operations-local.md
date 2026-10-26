# United Merch a transakční e-maily — lokální provozní dokončení

Datum: 26. 10. 2026. Výchozí HEAD: `65753df944d435e49d666ab46a2ed7274a7bb60c`.
Změny jsou **lokální, necommitnuté a nenasazené**. Nebyl spuštěn CI, migrace, reset, produkční objednávka, platba ani upload. Merch je stále pozastavený a automatický transport vypnutý. Existující secrets, ročník, registrace, LIVE, DNS, preview URL ani Cloudflare konfigurace nebyly změněny. Samostatná následně schválená doručovací zkouška je evidovaná níže, odděleně od lokálních testů.

Provozovatel nejprve schválil čtyři syntetické zprávy, poté zkoušku odložil a požádal o plán nového SMTP2GO účtu. V této původní fázi odešlo **0 zpráv**. Následně doplnil lokální klíč a novým zadáním výslovně obnovil schválení přesně čtyř testů. Uvedl, že se používá **existující účet přihlášený přes postmaster@e36united.cz**; přechod na nový účet se tím **ruší**. Historický návrh přechodu níže se nemá provádět. Produkční secrets se nadále nesmějí měnit.

## Samostatná skutečná doručovací zkouška — 26. 10. 2026

**UZAVŘENO — doručení 4/4 potvrzeno příjemcem.** Provozovatel v chatu 26. 10. 2026 výslovně potvrdil příjem všech čtyř zpráv na jos.dolezel@gmail.com a přítomnost všech čtyř záznamů v SMTP2GO Activity. Zdrojem tohoto následného ověření je potvrzení provozovatele, nikoli nové automatizované čtení schránky či Activity API. Celkem zůstává **4 zprávy / 1 dávkový odesílací požadavek / 0 opakování**. Při uzavření se nic znovu neposílalo a žádné nastavení služby se neměnilo. Automatický transport zůstává vypnutý a Merch pozastavený.

Schválený rozsah: právě jeden vzorek každého typu reservation_payment, merch_confirmation, reservation_rejected a arrival_invitation; u každého pouze příjemce **jos.dolezel@gmail.com**, sender **E36 United <info@e36united.cz>**, Reply-To **info@e36united.cz**, žádné CC/BCC. Použity existující `transactionalTestExample`, `renderTransactionalEmail` a připravené volání `createSmtp2goAdapter(...).sendTest`, bez nového transportu, endpointu či business záznamu. Schválení nezahrnuje retry nejasného výsledku ani další zprávu.

**Odesláno:** všechny čtyři HTML/text zprávy byly vykreslené; explicitní kontroly ověřily [TEST], jediného příjemce, prázdné CC/BCC v payloadu, správné adresy, text „Nic neplať, nic nepotvrzuj“, nepřítomnost banky/VS/SPAYD, skriptů/formulářů a akčních odkazů. Jediným odkazem je kontaktní mailto. Vzorky a bezpečný manifest jsou v ignorovaných `test-results/transactional-delivery-20261026/` a `test-results/transactional-delivery-20261026-prepared.json`.

Čtecí preflight `/api_keys/view` skončil HTTP 400 / `E_ApiResponseCodes.ENDPOINT_PERMISSION_DENIED`; nelze tedy API cestou ověřit Allowed/Sandbox ani auditní BCC. Provozovatel následně výslovně potvrdil **„Allowed a žádné auditní BCC“** pro použitý klíč (20:34:14 UTC). Jde o potvrzení obsluhy v konzoli, nikoli úspěšné čtení tohoto API endpointu. Automatizaci se podařilo otevřít pouze odhlášenou konzoli. Klíč, jeho oprávnění a provider nastavení se neměnily. Jednorázové volání má lokální create-only ledger proti druhému slepému odeslání.

První lokální spuštění se zastavilo na čtecí kontrole produkčních přepínačů **před kontaktem se SMTP2GO**, bez send požadavku a bez vytvoření attempt ledgeru. Pouze čtecí `wrangler deployments list` obnovil existující lokální Cloudflare přihlášení. Druhé spuštění pak uskutečnilo **jediný HTTP POST `/email/batch` obsahující přesně čtyři zprávy**. Nešlo o opakované odeslání. SMTP2GO odpovědělo HTTP 200 a čtyřmi různými email IDs. Celkem **4 zprávy / 1 odesílací dávkový pokus / 0 opakování**. Bezpečný provider request ID: **`6852a042-6094-40f1-af2b-233aef89dd8d`**. Pokus začal 20:35:27.681 UTC, přijetí potvrzeno 20:35:28.117 UTC (21:35:27–28 CET, Europe/Prague).

Read-only D1 kontrola bezprostředně před i po odeslání: `transport_enabled=0`, `activated_at=NULL`, `transport_revision=0`, `merch_paused=1`. Žádný produkční zápis, business intent, kampaň, rezervace, objednávka, úhrada nebo pozvánka nebyly vytvořeny. Bezpečný ledger: `test-results/transactional-delivery-20261026-attempt.json`; neobsahuje API klíč. Nebyl commit, push, deployment ani migrace a neproběhla další testovací sada.

Čtecí kontrola v 20:30:46 UTC potvrdila přesný seznam povolených endpointů: `/domain/view`, `/email/batch`, `/email/send`, `/stats/email_cycle`. `/webhook/view` stále vrací HTTP 400 / `E_ApiResponseCodes.ENDPOINT_PERMISSION_DENIED`. Tato nedostupnost sama **neblokovala** schválené odeslání a neznamená, že webhook neexistuje. Oprávnění ani klíč nebyly změněny. Activity API není v povoleném seznamu. Připojený Gmail účet odpovídá schválenému příjemci; po odeslání proběhla pouze cílená hledání těchto vzorků.

| Typ | Přesný předmět | Příjemce | Čas odeslání (CET) | Provider ID | Přijetí / doručení |
| --- | --- | --- | --- | --- | --- |
| reservation_payment | [TEST] Platbu jsme zaevidovali · TEST – syntetický vzorek · E36 UNITED | jos.dolezel@gmail.com | 26. 10. 2026 21:35:27 | 1xLRPk-7tiG0Lhs7a5-fCSS | přijato; doručení potvrzeno příjemcem, Activity provozovatelem |
| merch_confirmation | [TEST] Objednávku jsme přijali · TEST – syntetický vzorek · E36 UNITED | jos.dolezel@gmail.com | 26. 10. 2026 21:35:27 | 1xLRPk-7tiG0Lhs7a5-fCSa | přijato; doručení potvrzeno příjemcem, Activity provozovatelem |
| reservation_rejected | [TEST] Rezervace nebyla schválena · TEST – syntetický vzorek · E36 UNITED | jos.dolezel@gmail.com | 26. 10. 2026 21:35:27 | 1xLRPk-7tiG0Lhs7a5-fCSf | přijato; doručení potvrzeno příjemcem, Activity provozovatelem |
| arrival_invitation | [TEST] Připoj si účast z příjezdu · TEST – syntetický vzorek · E36 UNITED | jos.dolezel@gmail.com | 26. 10. 2026 21:35:27 | 1xLRPk-7tiG0Lhs7a5-fCSj | přijato; doručení potvrzeno příjemcem, Activity provozovatelem |

Přijetí poskytovatelem samo o sobě nebylo potvrzením doručení. Původní tři úzce zacílená hledání v připojeném Gmailu (včetně Spam/Trash, poslední 20:40:06 UTC / 21:40:06 CET) nevrátila shody; příčina tohoto rozdílu není zjištěná. Širší hledání [TEST] navíc vrátilo jinou dřívější zprávu, která nebyla považována za důkaz této zkoušky. Následné přímé potvrzení příjemce nyní dokládá skutečné doručení všech čtyř vzorků a provozovatel potvrdil i jejich záznamy v Activity. Čtení Activity API není dostupné povoleným klíčem a nebylo obcházené rozšířením oprávnění. Konkrétní umístění Doručená pošta/Spam, přijímací SPF/DKIM/DMARC, přijaté From/Reply-To a mobilní vzhled nebyly tímto stručným potvrzením samostatně doložené; uzavření doručovací zkoušky se za takové ověření nevydává.

Ruční čtecí kontrola webhooku, bez jeho ukládání či úprav: v SMTP2GO **Settings → Webhooks → Manage Webhooks** otevřít existující endpoint `https://api.e36united.cz/api/mailing/smtp2go-webhook`; ověřit enabled, JSON, Bearer autentizaci (tajnou hodnotu nezobrazovat ani neposílat), vazbu Users na skutečně používaný API key a události processed/delivered/bounce/spam/reject. Pro stávající kampaně také open/click/unsubscribe. V Email headers mají být X-E36-Mail-Type, X-E36-Transaction-Id, X-E36-Campaign-Id a X-E36-Recipient-Id. Nic nového nevytvářet, nemačkat test webhooku jako náhradu skutečného doručení. Pole odpovídají [oficiálnímu webhook nastavení](https://developers.smtp2go.com/reference/add-webhook).

Vzorky zachovávají `X-E36-Mail-Type: test`; proto nemají vzniknout v obchodní historii doručování. Uzavřená zkouška doložila odesílací adaptér a příjem čtyř zkušebních zpráv, nikoli celý produkční průchod objednávky/rezervace nebo produkční webhook korelaci. Konfigurace webhooku tedy zůstává neověřená, přestože příjemce a provozovatel potvrdili doručení a Activity záznamy. Provozovatel uvádí vytvořenou schránku info@e36united.cz ve FORPSI a validní FORPSI DKIM; příslušné DNS ani provider nastavení se při zkoušce neměnily.

Doručovací zkouška nevyžaduje další odeslání ani opakování. Pro případ pozdější read-only provozní kontroly zůstávají uvedené přesné předměty, příjemce, čas a provider IDs; filtrování podle email ID popisuje [SMTP2GO Activity](https://developers.smtp2go.com/reference/search-activity). Aktivace automatických obchodních e-mailů a objednávání tímto schválená není.

## Doložený stav produkce

Čerstvé omezené SELECT kontroly: 26. 10. v 18:14:59 UTC; metadata Workeru a veřejné DNS v 18:15:33 UTC. Nešlo o export produkční databáze. Bezpečné podklady jsou v ignorovaných `test-results/merch-operations-production-readonly.json` a `test-results/merch-operations-mail-config-readonly.json`; neobsahují hodnoty secrets ani členské osobní údaje.

| Oblast | Skutečně zjištěný stav | Připravenost |
| --- | --- | --- |
| Katalog | 8 produktů, 0 objednávek, objednávání pozastavené | Veřejná nabídka funguje, nákup nelze aktivovat bez níže uvedených údajů |
| Dva schválené produkty | `not-fast-not-furious`, `sweetest-things`, oba published, unisex, tmavě šedá, S/M/L/XL, `69000` haléřů, available, revize 1 | Zachované, beze změny |
| Fotografie produktů | `r2:1b98a1b2-e282-4f69-a8c1-1e3d7b1830fa`, resp. `r2:1875d75d-060d-4c58-abe0-7088c9197d0c` | Vazby zachované, žádný upload |
| Transakční transport | `enabled=0`, `activated_at=NULL`, revision 0; 5 zpráv skipped / before_initial_activation | První aktivace dosud neproběhla, historické zprávy se nesmějí automaticky rozeslat |
| SMTP2GO | Existující Admin přes skutečný provider-status GET hlásil „SMTP2GO · Připraveno“, zbývalo 1000 zpráv, aplikační limit 200/den | Doména/API odpověděly, nejde o důkaz doručení ani o kontrolu nového účtu |
| Sender / Reply-To | E36 United `<info@e36united.cz>`, Reply-To `info@e36united.cz`, EU API base | Ověřené čtením Worker konfigurace, beze změny |
| Secrets | Bindingy `SMTP2GO_API_KEY` a `SMTP2GO_WEBHOOK_SECRET` existují | Hodnoty se nečetly, neměnily ani nevypisovaly |
| Webhook poskytovatele | Původní SMTP2GO účet není dostupný | Skutečný výběr událostí, users a předávaných hlaviček **neověřen** |
| Migrace | `2026-09-24-merch` i `2026-10-23-transactional-emails` jsou evidované | Neopakovat; tato oprava nepotřebuje další migraci |
| Ročníky a služby | Current united-2026, všechny registrace closed, LIVE disabled, všechny ročníky v payment_test_mode | Beze změny; žádný testovací bankovní údaj nebyl převzat do Merche |

## Co již fungovalo a bylo znovu ověřeno

Používá se současný objednávkový model, finanční evidence, `merch_outbox` propojený s `email_outbox`, stávající cron a SMTP2GO adaptér. Cena, doprava, sleva, přijaté peníze a platební instrukce pocházejí ze serveru a uloženého snapshotu. Nevznikla další fronta, transport, platební brána ani konfigurace.

Izolované skutečné handlery ověřují vytvoření/replay objednávky, dvojí souběžné vytvoření, obnovu podle requestKey po ztracené odpovědi, částečnou úhradu, doplatek, přeplatek, storno, refundaci a opakování operace bez druhého finančního zápisu. Selhání potvrzovacího e-mailu ponechá objednávku i platbu uložené. Retry zprávy je samostatný auditovaný úkon; uncertain vyžaduje doložené neodeslání. Žádné automatické opakování nejasného výsledku.

Stejné cílené kontroly pokrývají skutečné handlery založení a schválení rezervace, částečnou/plnou úhradu, změnu a zrušení, veřejné vyjádření při zamítnutí, správnou částku/VS/odkaz a oddělení soukromých dat. Neaktuální zprávy se před předáním poskytovateli znovu vyhodnotí. První aktivace nepřesune staré skipped intent-y do nové fronty. Zůstal zachovaný původní Firebase mechanismus ověření adresy a resetu hesla; vlastní grafika těchto dvou typů je pořád jen náhled, nikoli zapojený sender.

## Prokázané nedostatky a opravy

| Příčina a důkaz před opravou | Nejmenší provedená oprava | Regrese |
| --- | --- | --- |
| `changeOrder`: completed je platný existující přechod, ale nevytvářel mail intent. Při dokončení zůstal počet zpráv 3 místo 4, pro osobní i adresní doručení. | Tentýž atomický batch vytvoří `merch_completed`; přidána HTML/text šablona a popis skutečného triggeru do Admin katalogu šablon. Text říká, že dokončení označil UNITED tým, nepředstírá potvrzení dopravcem. | Jedna zpráva na přechod, replay operace ani opakované vyprázdnění fronty nevytvoří další; vlastník vidí completed, žádná nová výzva k placení. |
| `transactionalContent` a UI označovaly ready zásilku „k převzetí“ a přidávaly pokyny pro pickup. | Podle neměnného shipping snapshotu se rozliší připraveno k odeslání / převzetí, v detailu, seznamech, tiskovém souhrnu a relevantní volbě Adminu. | Oba způsoby, přesný text i nulový zůstatek, žádné pokyny k osobnímu převzetí pro zásilku. |
| `changeOrder`: sent → completed bez nových tracking polí přepsal dopravce, číslo i URL na prázdné řetězce. | Dokončení zachová předchozí sledovací údaje. | ID, snapshot a tracking zůstanou zachované; i odložená zpráva o odeslání stále obsahuje TEST123. |
| `recordTransactionalWebhook`: poslední callback přepisoval error_message bez ohledu na historii; delivered zůstalo se soft_bounce, opožděné/duplicitní callbacky měnily chybu. Duplicitní ID s jiným payloadem dokonce měnilo deliverability kontaktu. | Stav chyby se odvodí z uložených deduplikovaných událostí a jejich času. Terminální odmítnutí zůstává chybou, starší soft bounce nepřebije doručení. Kontakt se změní pouze při skutečně nové události. | Autentizovaný veřejný webhook, duplicitní ID, obrácené pořadí, hard/soft bounce a pozdní processed; ostatní existující testy navíc ověřují webhook před odpovědí sendBatch a korelaci ID + příjemce. |
| Admin po uložení obnovil jen detail. Snímek i řízená UI regrese: karta stále „Připravuje se“, detail „Připraveno k odeslání“. | Po operaci obnoví existující `load` seznam a vybraný detail ze serveru; respektuje generation a aktivní záložku. | Karta a detail souhlasí v ready i completed, oba způsoby dodání, mobil/desktop v obou browser enginech. |

Beze změny obchodních přechodů, oprávnění, pravidel bodů/slev, limitů úhrad a datových vazeb. Nová šablona pro completed využívá existující obecný trigger; schéma neobsahuje seznam omezený na staré typy.

## Přesné výsledky ověření

Windows, Node **v24.19.0**, Playwright **1.62.1**, Chromium **151.0.7922.34 / revision 1234**, WebKit **26.5 / revision 2336**. Jde o lokální Windows běhy, nikoli Linux CI, fyzický telefon nebo skutečný e-mailový klient. Žádné automatické retries, skip/fixme, zvýšení timeoutů či ignorování konzolových chyb.

| Běh | Výsledek a význam |
| --- | --- |
| První nové Node regrese před opravami | 1 PASS / 5 FAIL: doložily čtyři aplikační příčiny (completed pro oba způsoby) |
| Cílených 6 Node souborů po základní opravě | 92/92 PASS, 0 skipped: nové regrese + transactional-emails, merch-commerce, merch-shop, mailing-tracking, mailing-smtp2go |
| Rozšířený nový Node soubor | Nejprve 6 PASS / 1 FAIL doložil duplicitní webhook měnící kontakt. Po opravě 6/1 kvůli chybně očekávanému výchozímu stavu kontaktu; fixture následně výslovně nastavuje deliverable. Poté **7/7 PASS**, bez oslabení kontroly. |
| První nové Chromium scénáře | 0 PASS / 4 FAIL: chybný předpoklad nového testu, že completed patří mezi aktivní. Opraveno použitím existující záložky Historie. |
| Rozběhnutý výběr 14 Chromium scénářů | 3 dokončené PASS; zastaven při opravě názvu filtru nového testu, 1 přerušený a 10 neprovedených. Není to úspěšný úplný průchod. |
| Výběr 11 Chromium scénářů | 7 PASS / 4 FAIL: nové testy měly nejednoznačný selektor viditelné zprávy a skrytého mail preheaderu. Opraveno přesnou `.mail-next`, následně nové **4/4 PASS**. |
| První WebKit výběr 14 scénářů | **13 PASS / 1 FAIL**, 0 skipped: existující `merch-connected` screenshot decode skončil `EncodingError: Aborted by source change`, nikoli chyba objednávky. |
| Cílená oprava screenshot přípravy | Jen `merch-connected` používá existující `waitForScreenshotContent` pro aktuální viditelné obrázky/fonty s diagnostikou. Znovu pouze původní WebKit scénář **1/1 PASS**; Chromium soubor **3/3 PASS**. |
| Regrese staré Admin karty před její opravou | Chromium **0 PASS / 1 FAIL**, doloženo skutečným uložením i starým textem karty. |
| Poslední ověření po opravě Admin obnovy | **Chromium 7/7 PASS**, **WebKit 7/7 PASS**, 0 skipped: celý merch-connected a nové 4 scénáře dokončení. Logy `merch-operations-final-chromium.log`, `merch-operations-final-webkit.log`. |
| Zbývající relevantní e-mailové UI | Existující 7 transactional-emails scénářů prošlo v obou enginech v dřívějších výše uvedených výběrech; pozdější Admin Merch změna je nezasáhla. Nejde o nový souvislý 14/14 běh. |
| Celostránkové náhledy pro kontrolu patičky | Cíleně adresní doručení 1440/390: Chromium **2/2 PASS**; změna pouze rozsahu screenshotu e-mailu. |
| Finální celá Node sada, spuštěná právě jednou | **616/616 PASS**, 0 FAIL / cancelled / skipped / todo. `node --test tests/*.mjs`; `test-results/merch-operations-node-final.log`. |
| Publikační statické kontroly | Syntax dotčených JS/MJS, Admin module graph a `git diff --check` PASS. Jednotné cache URL `20261026-merch-mail1` pro změněné moduly a nezbytné rodiče. |

Snímky 390/1440 px v obou motivech byly **skutečně otevřeny a prohlédnuty**: připravená zásilka v členském detailu, Admin detail + aktualizovaná karta, ready i completed e-mail včetně celé patičky/CTA. Bez přetékání a bez ztráty čitelnosti. Existující e-mailové scénáře ověřují i blokované obrázky a zachování přesného chráněného odkazu po přihlášení. Nejde o důkaz z Gmailu/Outlooku/Apple Mail.

Diagnostiky: ignorované `test-results/merch-operations-*`, `test-results/merch-operations-review*`. **Pochybení při prvním běhu:** použití výchozího outputDir vyčistilo starší dočasný obsah `test-results`, včetně původně uloženého read-only podkladu. Čerstvé provozní podklady byly znovu načteny a uloženy; další běhy mají samostatné podadresáře. Staré ignorované výstupy nelze z Gitu obnovit. Původní audit a `scripts/audit-20261009/` vyčištěny nebyly a zůstaly zachované.

## Skutečně chybějící provozní údaje a rozhodnutí

- Provozovatel: PSČ, IČO, telefon a daňový status. Existující jméno, adresa a kontakt nebyly nahrazeny ukázkovými údaji.
- Ověřený skutečný bankovní účet / IBAN / příjemce Merche. Nastavení Merche je neúplné; všechny ročníky jsou testovací, nelze z nich automaticky převzít ostrý účet.
- Konkrétní dodací informace; cena dopravy je nyní 129 Kč a lhůta 72 hodin, což je zjištěné nastavení, nikoli nové schválení těchto podmínek. Pokyny k pickup již existují.
- Dokončené čtyři obchodní dokumenty (podmínky, doprava/platba, odstoupení/reklamace, soukromí), bez `[DOPLNIT]`; schválená verze podmínek a legalApproved. Obsah právních údajů se nevymýšlel.
- Členská výhoda: rewardThreshold 12, ale discountBasisPoints je NULL. Současný model pouze počítá slevu podle bodového prahu, nespotřebovává body ani neeviduje opakované čerpání odměn každých 12 bodů. **Nejmenší volba k rozhodnutí:** výslovně schválit nulovou Merch slevu (0) do samostatného dokončení odměn, nebo potvrdit skutečnou opakovanou nákupní slevu a její sazbu pro existující model. NULL nebylo změněno, sazba ani kurz nebyly zavedeny; jednorázové čerpání vyžaduje jiné samostatné zadání.
- SMTP2GO: původní požadavek nového účtu byl zrušen, používá se existující účet dle aktuálního zadání. Poskytovatel přijal čtyři syntetické zprávy a příjemce potvrdil doručení 4/4 i čtyři záznamy v Activity; doručovací zkouška je uzavřená. Nastavení webhooku a celý produkční obchodní průchod zůstávají samostatně neověřené. Nový účet ani rotace secrets nejsou aktuálním požadavkem.

## Následné doplnění lokálního klíče — pouze čtecí ověření

Na výslovný požadavek provozovatele byl nejprve do `.gitignore` přidán kořenový `/.dev.vars`, ověřeno, že soubor není sledovaný ani nabízený Gitem, a teprve potom vytvořen prázdný klíč k ručnímu doplnění v Poznámkovém bloku. Provozovatel následně klíč vložil. Soubor ani jeho tajná hodnota nebyly vypsány; nepatří do commitu či publikace. Toto je navazující požadovaná změna `.gitignore` mimo původní seznam aplikačních oprav níže.

Čtecí kontrola 26. 10. 2026 v 20:16:56 UTC použila **stávající SMTP2GO adaptér** a lokálně doplněný klíč, nikoli produkční binding:

- `/domain/view`: HTTP 200, `e36united.cz` existuje, DKIM i return-path verified; `link.e36united.cz` má ověřený CNAME a enabled tracking.
- `/stats/email_cycle`: HTTP 200, použito 0, zbývá 1000, limit cyklu 1000. Aplikační `checkReadiness` vrací ready. Identita účtu vůči původnímu nedostupnému účtu nebyla nezávisle ověřena.
- `/webhook/view`: HTTP 400. Jediný navazující čtecí dotaz pro konkrétní důvod v 20:17:52 UTC potvrdil **`E_ApiResponseCodes.ENDPOINT_PERMISSION_DENIED`** — klíči chybí oprávnění tohoto endpointu. Nejde o neplatný klíč ani důkaz, že webhook neexistuje. Jeho události, users, hlavičky a Bearer nastavení zůstávají neověřené; lze je později přečíst v oprávněné konzoli nebo klíčem s cíleným oprávněním `/webhook/view`. Oprávnění nebyla rozšířena.
- Nebyl volán `/email/batch`, nic se neodeslalo ani nezměnilo. Čtecí připravenost sama neprokazuje oprávnění send endpointu ani skutečné doručení. Zpráva „API doplněno a připraveno“ není pokynem zrušit odložení odesílání či přepnout produkci.

Bezpečné výsledky: ignorované `test-results/smtp2go-new-account-readonly.json` a `test-results/smtp2go-new-account-webhook-readonly.json`. Produkční `SMTP2GO_API_KEY`, `SMTP2GO_WEBHOOK_SECRET`, DNS, automatický transport a Merch zůstaly beze změny. Doménové ověření už pro dodaný klíč prochází; případné DNS změny z následujícího plánu se proto nesmějí provést naslepo.

## Zrušený návrh přechodu na nový SMTP2GO účet — pouze historický podklad

**Celý následující návrh byl novým zadáním doručovací zkoušky zrušen. Není to pokyn k pokračování, rotaci klíčů, změně DNS či zakládání nového účtu. Používá se existující účet dle aktuálního zadání.**

**Aktuální veřejné DNS:** `link.e36united.cz CNAME track.smtp2go.net.`; `_dmarc.e36united.cz` je CNAME na `_dmarc.wixemails.com.`, který odpovídá politikou `p=none`. Čtení správy DNS přes nynější Cloudflare oprávnění skončilo 403; nebyla žádána širší oprávnění. Celý aktuální inventář DKIM/return-path ani nastavení proxy/flattening proto není ověřené. Dvě uvedené veřejné odpovědi byly získány standardním DNS-over-HTTPS, bez přístupu ke správě zóny.

### Nový účet a DNS

Provozovatel založí/obnoví účet a jeho přihlášení pod vlastní dostupnou adresou. Zkontroluje možnost odesílání, ověření účtu a skutečný limit nového účtu. Nepřebírat zbývající kvótu starého účtu jako vlastnost nového. V novém účtu přidat sender domain **e36united.cz**. SMTP2GO poskytne tři přesné CNAME dvojice; bez nového účtu jejich selektory nelze pravdivě určit. Nejde o důvod vymyslet či kopírovat staré selektory. [SMTP2GO Verified Senders](https://support.smtp2go.com/hc/en-gb/articles/115004408567-Verified-Senders).

| Konfigurace | Budoucí konkrétní postup |
| --- | --- |
| DKIM CNAME | Název `<nový-selector>._domainkey.e36united.cz` a cílovou hodnotu převzít přesně z nového Verified Senders; porovnat s inventářem DNS před změnou. |
| Return-path CNAME | Název subdomény a cíl převzít z nového účtu. Neodvozovat ze starého klíče či domény pro web. |
| Tracking CNAME | V novém účtu nastavit **link.e36united.cz**, protože tuto doménu kontroluje stávající adaptér. Porovnat nově požadovaný cíl s nynějším `track.smtp2go.net`; shodný záznam není nutné přepisovat. Ověřit HTTPS certifikát trackingu v novém účtu. |
| Cloudflare režim těchto záznamů | DNS only; případný CNAME flattening pro ně vypnutý. Nezměnit proxy/flattening celé webové zóny. Ověření provést po propagaci skutečných záznamů. |
| MX, kořenový SPF a DMARC | Při standardním sender-domain CNAME postupu není třeba přidávat další MX ani SMTP2GO include do kořenového SPF. Dosavadní příchozí poštu a DMARC ponechat, změnu politiky neschvalovat automaticky. |

Konkrétní režim CNAME vychází z [SMTP2GO návodu pro Cloudflare](https://support.smtp2go.com/hc/en-gb/articles/360022578154-DNS-Setup-for-Cloudflare). Potřebu doménového ověření a zachování MX/SPF popisuje [Verified Senders](https://support.smtp2go.com/hc/en-gb/articles/115004408567-Verified-Senders). Pokud bude nová doména blokovaná vazbou na nedostupný účet, řešit doložení vlastnictví se SMTP2GO podporou; tato překážka dosud nenastala a není ověřená.

### Worker a klíč

| Položka | Nyní | Později po samostatném schválení přechodu |
| --- | --- | --- |
| `SMTP2GO_API_KEY` | Existující secret **beze změny** | Vytvořit v novém účtu samostatný provozní API key, uložit bezpečně a teprve při cutover nahradit binding Workeru. Hodnotu neposílat do chatu, reportu ani Gitu. |
| Runtime oprávnění klíče | Staré nastavení není v účtu dostupné | Minimálně používané `/domain/view`, `/stats/email_cycle`, `/email/batch`; management webhooků lze udělat v konzoli, nevyžaduje plošné admin oprávnění provozního klíče. Případné čtení historie pro kontrolu zpráv řešit cíleným oprávněním obsluhy. |
| `SMTP2GO_API_BASE` | `https://eu-api.smtp2go.com/v3` | Zachovat, pokud nový účet splní EU provozní volbu; region ověřit, neměnit jej jako pokus o opravu autentizace. |
| `MAILING_SENDER_NAME` | E36 United | Zachovat |
| `MAILING_SENDER_EMAIL` / `MAILING_REPLY_TO` | Oba info@e36united.cz | Zachovat, ověřit právo odesílat za doménu a skutečnou dosažitelnost schránky pro odpovědi |
| Provider přídavné funkce | Staré nastavení neověřené | Zkontrolovat sandbox/blocked stav, rate limit, přidaný unsubscribe footer, tracking, případné BCC auditování a bounce notifikace. Nic automaticky nekopírovat na cizí adresu; nepřidávat newsletter patičku do transakčního obsahu. |

Jde o mapování existujících volání adaptéru na potřebný nový klíč; jeho permissions a stav se spravují v [API Keys](https://support.smtp2go.com/hc/en-gb/articles/20733554340249-API-Keys). EU base je oficiální [SMTP2GO endpoint](https://developers.smtp2go.com/docs/endpoints). Nebyl vytvořen klíč ani účet a starý secret se neměnil.

### Nový chráněný webhook

- Endpoint zůstane **`https://api.e36united.cz/api/mailing/smtp2go-webhook`**, POST, output **JSON**. Neměnit produkční doménu ani směrování.
- Pro doručovací stav vybrat `processed`, `delivered`, `bounce`, `spam`, `reject`; pro zachování již existujících kampaní také `open`, `click`, `unsubscribe`. Žádný SMS tok. Users omezit na **nový skutečný odesílací API key**; vazba na starý klíč nepřenese nový provoz.
- Forwardovat přesně existující hlavičky: **X-E36-Mail-Type**, **X-E36-Transaction-Id**, **X-E36-Campaign-Id**, **X-E36-Recipient-Id**. Odlišit toto nastavení od custom HTTP hlaviček webhooku. Zachovat také provider `email_id`, ID události, příjemce a čas pro současnou korelaci a deduplikaci.
- Autentizace musí být **Authorization: Bearer** s hodnotou shodnou s Worker bindingem **SMTP2GO_WEBHOOK_SECRET**. Nyní zůstává původní secret nedotčený. Protože původní účet není pod kontrolou, plánovat pro vlastní přechod nový náhodný webhook secret a **výslovně schválenou koordinovanou rotaci** v novém účtu i Workeru. Jeho starou hodnotu nelze získat čtením bindingu. Ochranu nevypínat ani nepřidávat veřejnou výjimku.
- Před rotací ověřit případné rozpracované zprávy a nejasné výsledky starého účtu; jejich ID a historii zachovat. Bez staré konzole případné nejasnosti řešit s podporou. Neoznačit neurčitý výsledek za neodeslaný a nepřesypat staré zprávy do retry. Pět nynějších skipped transakčních zpráv není fronta k automatickému doručení.

Pole webhooku, výběr users, událostí a posílaných e-mailových hlaviček odpovídají [SMTP2GO webhook API](https://developers.smtp2go.com/reference/add-webhook); postup a rozlišení autentizace je v [Setup a Webhook](https://developers.smtp2go.com/docs/setup-a-webhook). Tento seznam je návrh, nikoli provedená konfigurace nebo ověření nového účtu.

### Pořadí přechodu a aktivace

1. Samostatně schválit publikaci lokální opravy: commit, bezpečný fetch/push a Worker + Pages. Potřebuje změnu Workeru i verzovaných frontendových vstupů; **žádnou migraci**. Nový Worker je kompatibilní s nynějším schématem a frontendem; backend lze připravit před automatickým Pages. Transport i Merch ponechat vypnuté.
2. Připravit nový účet, doménu, přesné DNS, API key a autentizovaný webhook. Před DNS/secrets změnami zaznamenat současné hodnoty bezpečně mimo Git a schválit konkrétní cutover. Pokud nový účet/ověření selže, neaktivovat transport ani ručně neopakovat zprávy.
3. V rámci zvlášť schváleného přechodu nastavit nový runtime key a koordinovaný webhook secret. Read-only zkontrolovat doménu, quota, sender/Reply-To, webhook users/události/hlavičky a odmítnutí neautentizovaného webhooku. Nezpřístupňovat starý účet novým credentials a nyní nic nemažte.
4. Až poté obnovit **samostatně potvrzený** testovací plán. Původní návrh zůstává připravený: přesně čtyři syntetické `[TEST]` zprávy — reservation_payment, merch_confirmation, reservation_rejected, arrival_invitation — na dříve schválenou vlastní adresu. Aktuálně je toto odeslání odložené. Použít `transactionalTestExample` + stávající `sendTest`, žádné business záznamy ani aktivaci transportu. Náhledy jsou v `test-results/merch-operations-previews/restricted-test/`, bez banky, VS, akčního claim tokenu a odkazu k potvrzení.
5. U testu uchovat request/email IDs a ověřit skutečné doručení, SPF/DKIM/DMARC a čitelnost ve schránce. Provider accepted není delivered; fyzický telefon a jednotlivé mail klienty je třeba opravdu zkontrolovat. Hlavička `X-E36-Mail-Type: test` je z business delivery záměrně vyloučená. Produkční transakční korelaci ověřit až na první zvlášť povolené legitimní události.
6. Doplnit a schválit chybějící obchodní údaje a členskou slevu. Teprve samostatným rozhodnutím aktivovat automatické e-maily a objednávání. Při první aktivaci transportu zachovat aktuální pravidla hranice; žádný plošný resend. Starý účet a jeho klíče rušit jen později autorizovaným postupem obsluhy/podpory, nikoli jako součást této lokální práce.

## Přesný seznam souborů této dávky

Funkční opravy:

- `admin/modules/merch.js`
- `member/modules/merch.js`
- `merch/order-view.js`
- `worker/domains/merch/service.js`
- `worker/domains/mailing/transactional.js`
- `worker/domains/mailing/transactional-template.js`
- `worker/domains/mailing/transactional-routes.js`

Regrese a tento report:

- `tests/merch-email-operations.test.mjs` (nový)
- `tests/e2e/merch-email-operations.spec.mjs` (nový)
- `tests/e2e/merch-connected.spec.mjs` (jen aktuální screenshot readiness)
- `docs/merch-email-operations-local.md` (nový)

Pouze nezbytné cache/import návaznosti `20261026-merch-mail1` (sdílený order-view importují i pomocné moduly; každá změněná cesta má jednu runtime URL):

- `admin.html`, `admin.js`, `admin/command-cards.js`, `admin/dashboard.js`, `admin/member-detail.js`
- `admin/modules/mailing/contacts.js`, `admin/modules/mailing/index.js`
- `admin/modules/merch-payments.js`, `admin/modules/merch-product-editor.js`, `admin/modules/merch-settings-layout.js`
- `admin/modules/moderation.js`, `admin/modules/reservations-payments.js`
- `member.html`, `member.js`, `member/modules/merch-address.js`
- `merch.html`, `merch.js`, `merch/checkout.js`, `merch/shop.js`
- `scripts/admin-module-releases.mjs`, `scripts/check-admin-module-graph.mjs`

Nesouvisející původní `docs/photo-upload-a3-a4-local.md`, nesledované `docs/project-audit-2026-10-09.md`, `docs/ci-124-webkit-investigation-local.md` a `scripts/audit-20261009/` jsou ponechané mimo tuto dávku. Žádná změna závislostí, lockfile, workflow, produkčního katalogu ani migrací. Staging index zůstává prázdný. Provozní připravenost **neznamená schválené spuštění**: chybějící obchodní údaje, nastavení webhooku a celý produkční obchodní průchod jsou nadále samostatné závislosti. Doručení testů 4/4 je potvrzené a zkouška uzavřená; transport i Merch zůstávají vypnuté. Přechod na nový SMTP2GO účet je zrušený.

## Navazující dokončení — aktuální zadání 26. 10. 2026

Aktuální výsledek a jednorázový plán aktivace jsou v `docs/merch-launch-readiness-local.md`. Tento novější report má přednost před historickými zákazy změn secrets a zrušenými návrhy výše: schváleno je přidání **nového samostatného** SMTP2GO_TRANSACTIONAL_API_KEY, původní kampaně a webhook secret se nemění. Provozovatel schválil nulovou slevu a pouze neveřejné pracovní obchodní údaje; ty nenahrazují chybějící skutečné údaje pro ostré spuštění. Transport a Merch se neaktivují. Čtyři doručovací testy zůstávají uzavřené, bez dalšího odeslání.
