# Dokončení veřejných a členských průchodů — 28. 10. 2026

Navazuje na `5e61132ab6749d96a1fcaa9fa8f0debb7fc1e9a4` a původní report. Nesouvisející audit, diagnostiky a report A3/A4 zůstávají mimo publikaci. Tento dokument se doplňuje podle skutečných výsledků; neuzavřené položky nejsou vydávány za ověřené.

## Domény — reprodukovaná hranice session

Ve stejném Chromium kontextu proběhlo skutečné přihlášení na www, změna veřejného Planneru a otevření apexu v druhém panelu. Na apexu byl uživatel anonymní a Planner výchozí; po návratu a reloadu www zůstal přihlášený a jeho sobotní výběr zůstal zachovaný. Nejde o důkaz původního nekonečného načítání, ale o samostatně reprodukovaný problém přechodu mezi originy.

Obě varianty `/member.html?mode=login&section=garage` vracejí 308 na `/member?mode=login&section=garage`; tím se sjednocuje přípona, nikoli hostname. Prohlížeč dále načetl každou variantu na vlastním originu. Sken sledovaných frontend HTML/JS našel dvě explicitní apex URL: výchozí CTA nového bloku kampaně a návrat ze soukromé ankety. Obě nově ukazují na www; stávající uložené kampaně se nepřepisují. Ostatní interní navigace používá relativní cesty a zachovává query/hash.

**Připravený krok mimo tuto publikaci:** v Cloudflare Redirect Rules přidat pravidlo `(http.host eq "e36united.cz")`, cílový výraz `concat("https://www.e36united.cz", http.request.uri.path)`, stav 308, zapnout Preserve query string. Fragment zůstává v prohlížeči a nesmí se nahrazovat pevným fragmentem. Před aktivací je nutné nabídnout převzetí dosud existujících apex konceptů přes současný URL handoff; přesměrování samo nepřenese localStorage ani Firebase session. Člen na www případně provede nové přihlášení. Ověřit `/`, `/member?mode=login&section=garage`, `/o-nas#history-2025` a členský handoff. Toto pravidlo nebylo v účtu Cloudflare změněno a backend/Firebase konfigurace nebyla upravena.

## Planner — další doložené výsledky

- Při odmítnutí `localStorage.setItem` se dříve zobrazil pouze debug log. Nyní se přímo u pokračování vysvětluje, že prohlížeč neuchová plán po zavření stránky, ale aktuální volbu lze přenést do účtu. Nezobrazuje se nepravdivé potvrzení uložení. Přenos používá stávající URL handoff a nepotřebuje nové úložiště.
- Řízená regrese zakazuje zápis úložiště, mění pobyt a posádku a pokračuje do přihlášení; předaná data mají Sobotu a tři osoby. Druhý test otevírá dva panely: nový panel převezme poslední uložený koncept, pozdější změna v něm nepřepíše rozepsaný první panel; reload načte poslední uloženou verzi. Není to sloučení souběžně upravovaných konceptů a UI je za ně nevydává.
- Nové dva scénáře: Chromium/WebKit 4 PASS. První Firefox spuštění skončilo před vytvořením stránky chybou rendereru; v již schváleném procesu oba scénáře prošly (2 PASS). Výsledek původního neúspěšného startu je zachován.
- Celý dotčený soubor Planner stability + historie: **33/33 PASS** (11 na engine). Zahrnuje geometrii vůči viewportu 390/768/1920, závislé počty, ubytování, reload, neplatný/cizí koncept, oba panely a historii s kliknutím, reloadem i Zpět/Dopředu. Není to kompletní browser sada.

## Inventář veřejného ovládání

Členský inventář a konkrétní dokončovací akce jsou uvedeny v navazující evidenci členských formulářů. Tabulka rozlišuje ověřenou funkci a externí hranici; otevření odkazu není důkazem dokončení akce v cizí službě.

| Místo / akce | Účel a odezva | Úspěch / chyba / návrat | Důkaz a hranice |
|---|---|---|---|
| Menu účtu, desktop/mobil, veřejné podstránky | Registrace nebo členský účet podle skutečné session; při bootstrapu neutrální Účet | `mode`, `section` a `returnTo`; profilový retry zachová session | `account-entry`, `member-session-lifecycle`; skutečné přihlášení zvlášť |
| Program / den | Okamžitý výběr, zřetelné aktivní tlačítko, nový program | Další den lze ihned přepnout; bez zápisu rezervace | Stávající public/portal-composition scénáře; není nutné druhé Potvrdit |
| Show & Shine / kategorie | Zvolená kategorie mění detail | Posun karet, návrat a fotografie | Veřejný výběr nepřihlašuje do soutěže |
| Planner / pobyt, ubytování, posádka, část posádky, S&S | Okamžitá změna a souhrn, průběžný koncept | Neplatné závislosti se normalizují, chyba úložiště viditelná | `public-planner-stability` + členské handoff scénáře |
| Planner / fotografie | Existující galerie, zavření obnoví fokus | Žádný nový upload ani rezervace | `feedback-member` galerie |
| Planner / pokračovat | Výslovný výběr vytvoření účtu, přihlášení nebo přípravy poptávky | Zpracování se stavem, dvojklik nezdvojí navigaci; URL handoff | Existující regrese ruší pouze nepodstatnou analytiku |
| Poptávka e-mailem | Připraví mailto se souhrnem | Otevření klienta samo nedokládá odeslání | Formulář používá browser validaci; skutečný e-mail se v tomto auditu neposílá |
| Kalendář, Google Maps, trasa | Stažení/předání odkazu; výpočet trasy má vlastní stav | Externí služby a GPS mohou odmítnout požadavek | Kontrola URL/handleru; skutečná navigace autem není testována |
| Historie / roky | Aktivní článek i rok při scrollu, odkazy s hashem | Reload a historie prohlížeče | `history-reading` a přirozené scrollování v `portal-next-ux` |
| Galerie / video, official, user, nahrát | Filtry, lightbox, explicitní přechod do oprávněného uploadu | Zavření a návrat, žádné automatické zveřejnění | Stávající galerie; produkční upload se neprovádí |
| Motiv a dialogy | Stávající přepínač, srozumitelné zavření | Zachování volby, obnova scrollu/fokusu | Dostupné desktop enginy; konkrétní postižený iPhone není k dispozici |

## Zbývající vnější hranice

Dokončovací akce, přesná původní geometrie a inventář členských formulářů jsou v [member-actions-20261028.md](member-actions-20261028.md). Na 360 × 420 byl původní submit auta mimo viewport. Nová patička zpřístupňuje **Přidat auto / Uložit změny / Zrušit**, reaguje na visualViewport. Opravena také záměna MouseEvent za existující auto, výchozí karoserie je znovu Sedan. Placeholder **Moje E36** není skutečná hodnota. Historie vysvětluje neaktivní odeslání a Club je výslovně volitelný.

## Účet — koordinovaných 5 a 10 sekund

`united-auth.js` předává čas začátku; `createAccountAttempt` v `member/session.js` počítá jedinou lhůtu pro SDK, persistence, první auth callback, token a blokující načtení profilu. Po 5 s zobrazí vysvětlení prodlevy, do 10 s účet nebo obnovitelnou chybu. Explicitní login a registrace začínají vlastní pokus při akci. JSON klient sdílí zbytek lhůty i mezi obnovou tokenu, retry a tělem odpovědi; uploady nebyly plošně zkráceny.

Timeout zneplatní pokus, retry zahájí nový. Nejistý bootstrap vysvětluje, že zápis mohl proběhnout, a retry čte existující účet bez druhého vytvoření. Club a fotografie se načtou po otevření účtu. Pozdní Club aktualizuje jen své části a nepřepisuje profilový formulář. Paměťový fallback výslovně říká, že session nemusí přežít reload.

Finální `account-deadline` + `member-session-lifecycle`: **33/33 PASS**, 11 na engine. Obsahují SDK/profil/auta, SDK 6 s + profil 4 s, nejistý bootstrap, neblokující doplňkové čtení, rozepsaný profil s fokusem/kurzorem a logout ochrany. Agentův příslušný Node výběr **40 PASS**; konečný přímo navazující graph/phase-a výběr **24 PASS**. Kvůli překryvu se nesčítají. Strukturální očekávání nově vyžaduje ukončení blokujícího pokusu po otevření shellu; zachovává pořadí a ochranu Planner handoffu.

Navazující izolované scénáře `feedback-member`, `preliminary-reservations`, `registration-live-continuity`: **48/48 PASS**, 16 na engine. Pokrývají přenosy, chyby/retry, zavřený proces, nepřepsání existujícího plánu, nejistý refresh auta bez duplicitního vytvoření a serializované ukládání. Nejde o celou browser sadu.

## CI #130 — prokázaná testovací příčina

Přečten původní log, screenshot, error-context a trace artefaktu `12824296215`. Drawer byl viditelný z cache seznamu, zatímco jeho první GET ještě běžel. Virtuální posun o 60,1 s vyčerpal síťový timeout a retry. Trace: detail start 213747,643; route fulfill 213749,520; viditelnost 213776,526; clock.runFor start 213777,281. Oba detailové pokusy mají stav −1, screenshot stale banner a 1200.

Původní test jednou lokálně prošel; není to důkaz opravy. Řízené zadržení první odpovědi při původním pořadí reprodukovalo **Expected 2200 / Received 1200**. Test nyní dokládá cached/loading stav, výslovně uvolní odpověď a čeká na fresh detail, teprve potom posune čas. Zachovává 2200, nulové skryté požadavky, reconnect, nulové zápisy a neočekávané chyby. Cílený polling a dirty/stale/privacy kontroly Chromium/WebKit: **8/8 PASS**. Produkční platební logika Adminu se nemění.

## Trvalé pokrytí a publikační kontroly

Oba projekty WebKit/Firefox obsahují `account-entry`, `member-session-lifecycle`, `account-deadline`, `member-completion`, `history-reading`, `public-planner-stability`, `registration-live-continuity`, `appearance`. Původní WebKit výběr zůstal. Finální discovery: **Chromium 458, WebKit 239, Firefox 102**; nalezené scénáře nejsou vydávány za kompletní lokální průchod. Workflow instaluje všechny tři enginy a po úspěšné instalaci je spustí nezávisle na selhání předchozího browser kroku. Bez continue-on-error; povinné selhání stále znamená červený job.

Syntax **25 JS/MJS PASS**. Dotčené importy mají jediný token `20261028-flow2`, Admin graph manifest odpovídá změněným rodičům. Graph a diff check PASS; nezměněné závislosti mají původní tokeny.

První kontrola pracovní větve, CI #131 (`40714719447`), zadržela kandidáta před produkčním main: Node **641 PASS / 1 FAIL / 0 skipped**. Starý test workflow očekával dvě diagnostické přílohy, zatímco nově jsou povinné tři (`3 !== 2`). `tests/admin-confirmed-state.test.mjs` nyní ověřuje každý engine, jeho nezávislé spuštění, izolaci artefaktů/pokusu, pětidenní uchování, původní diagnostiku a zákaz oslabení chyby. Konfigurace je při této Node kontrole vyhodnocena bez závislosti na ještě nenainstalovaném Playwrightu. Cílený soubor **9/9 PASS**, samostatná izolovaná kopie bez node_modules také **9/9 PASS**. První neúspěšný běh nebyl rerunován; následuje nový commit konkrétního testovacího kontraktu.

Dodatečně prokázaná související chyba: při explicitním loginu byl účet již viditelný, ale příznak authFlowActive čekal na volitelnou pozvánku a blokoval logout. Zadržení jejího preview reprodukovalo **1 FAIL**. Nyní se po otevření shellu uvolní akce; logout ihned zneplatní starý pokus a pozdní finalizer nemění novější akci. Nová regrese + čtyři sousední registrace/logout scénáře: **15 PASS**, pět na engine. Node phase-a **18 PASS**. Finální deadline soubor má osm scénářů; discovery se tím mění na **Chromium 459 / WebKit 240 / Firefox 103**. Předchozí 33/33 a další dílčí výsledky výše nejsou vydávány za nový kompletní běh této poslední úpravy.

Persistence fallback do paměti je řízeně pokrytý Node testem a vysvětlený v UI. Browser simulace tohoto konkrétního Firebase fallbacku ani skutečné omezené úložiště na postiženém zařízení nebyly provedeny; nelze za těchto podmínek garantovat trvalou session po reloadu. Odmítnuté ukládání veřejného Planneru je samostatně ověřeno ve všech třech enginech.

## Skutečné přihlášení — odděleně od simulací

Existující schválený účet se nemazal ani znovu nezakládal. Kandidát byl před publikací načten ze statické pracovní kopie pod www originem; Firebase ani členské API nebyly nahrazeny. Localhost produkční API správně odmítlo přes CORS. Serverová ochrana se kvůli tomu neměnila.

| Skutečný průchod kandidáta | Chromium | WebKit | Firefox |
|---|---|---|---|
| Anonymní Firebase bootstrap | PASS | PASS | PASS |
| Login a API profil | PASS, 1402 ms | PASS, 2050 ms | PASS, 1955 ms |
| Reload/session | PASS | PASS | PASS |
| Druhý panel | PASS | PASS | PASS |
| Logout a nové přihlášení | PASS | PASS | PASS |
| Veřejný Planner → členský plán | PASS | PASS | PASS |

První diagnostický skript hledal desktopový logout na mobilu; následující měl poškozené kódování vloženého českého očekávání. Neúspěšné pokusy jsou zachované; opraven byl skript, nikoli aplikace. Tabulka uvádí konečný průchod, nikoli součet pokusů. Windows WebKit není fyzický iPhone. Heslo, session a osobní odpovědi zůstávají jen v ignorované evidenci. Vzdálené CI a produkční smoke se vyhodnotí samostatně po publikaci.

- Fyzický postižený iPhone: otevřít přes www, zaznamenat motiv OS i stránky; přihlášení → reload → změna Planneru → otevření/zavření fotografie. Při šednutí zaznamenat přesnou poslední akci a screenshot bez osobních údajů. Bez reprodukce se nepřidávají globální filtry ani se problém neoznačuje za opravený.
- Doručení ověřovacích/resetovacích zpráv Firebase není totéž co provozní transport aplikace. Účet zůstává použitelný bez ověřené adresy podle současných pravidel. Ověřovací podmínka se nezapíná a další skutečné zprávy se neposílají.
- Skutečné rezervace kapacity, platby, veřejné uploady a produkční obchodní zápisy jsou mimo testování. Izolované průchody musí dokazovat výsledný stav pomocí existujících handlerů.
