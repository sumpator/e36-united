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

Persistence fallback byl následně doplněn skutečně stavovou browser simulací: nová úzká volba existující fixture odmítne LOCAL persistence podporovanou Firebase chybou a uchovává přihlášení pouze v paměti. Základní SDK modul má vlastní výchozí hodnotu false, včetně použití v Adminu. Regrese nejdříve prokázala, že dočasné upozornění přepsal přihlašovací toast. Nyní má účet trvalé přístupné upozornění; reload opravdu vrátí anonymní stav a nové přihlášení obnoví platný Planner **Sobota / 1 noc / 3 osoby**. Všechny tři enginy **3 PASS**, navíc screenshoty WebKit 390/1440 **1 PASS**, skutečně otevřené. Výchozí Admin polling **1 PASS** a sousední členské vstupy **3 PASS**. Skutečně omezené úložiště postiženého zařízení se za tento řízený model nevydává.

## Dokončení po CI #132

Plný kontrolní běh pracovní větve #132 (`40716027121`) dokončil všechny enginy: Node **642 PASS / 0 FAIL / 0 skipped**, syntax PASS; Chromium **458 PASS / 1 FAIL / 0 skipped**, WebKit **237 PASS / 3 FAIL / 0 skipped**, Firefox **102 PASS / 1 FAIL / 0 skipped**. Žádný z těchto výsledků není přepsán pozdějším cíleným úspěchem. Tři artefakty byly přečteny včetně relevantních trace, kontextů a screenshotů.

- Club: test kontroloval druhý request už 46 ms po prvním přerušení, před 250ms retry. Nově zadržuje druhou odpověď a čeká na skutečných 7 bodů před kontrolou právě dvou requestů a nulových chyb; **3 PASS** napříč enginy. Současně bylo opraveno skutečné matoucí zobrazení nuly/prázdných fotografií během doplňkového načítání. Club i fotografie mají vlastní pending stav, Přehled používá neznámou hodnotu `—`; chyba ponechá neznámé údaje a retry, úspěch obnoví skutečná data. Čtyři dotčené scénáře **12 PASS**. Pending stav 390/1440 světlý/tmavý byl zachycen a čtyři obrázky otevřeny; přechod tématu byl při konečném screenshotu dokončen, nikoli zaměněn za trvalé šednutí.
- Firefox: nově zařazený scénář `lost` úmyslně přerušuje přesnou URL uploadu, ale jeho očekávaná síťová chyba má jiný text a prázdnou lokaci. Výjimka vyžaduje právě tuto větev, přesnou injektovanou URL a konkrétní CORS síťovou hlášku. Všechny databázové, foto a druhoklientské assertions zůstaly. Celý scénář **3/3 PASS**. Produkční fotografická logika se nemění.
- Dva WebKit history scénáře: kontrola aktivního roku spustila další kliknutí méně než 10 ms poté, co se změnil rok, zatímco předchozí smooth scroll ještě pokračoval. Nový test čeká na skutečné ustálení scrollu/reveal a přivádí do viditelné oblasti konkrétní rok, nikoli střed dlouhého článku. Očekávání roku, URL, aktivního článku a návratů zůstala; byl odstraněn helper kopírující DOMMatrix algoritmus aplikace. Aplikační historie se nemění. Možný příspěvek záseku Linuxového rendereru nebyl z původní trace bez průběžných snímků prokázán.

Další prokázaná související aplikační mezera: starý interní loader rezervace mohl po timeoutu stejného účtu změnit stav úspěšného retry. Řízená původní odpověď s uzavřeným 2025 zablokovala formulář už načteného otevřeného 2026 (**1 FAIL**). Blokující JSON GET nyní zachytí časovou hranici pokusu při vytvoření, včetně čtení uvnitř modulů; opožděné tělo se k mutaci stavu nedostane. Zápisy, uploady a běžné čtení po otevření účtu se nemění. Finální deadline + session výběr **42/42 PASS** (14 na engine), příslušný Node výběr **29 PASS**. Toto je novější výsledek konkrétního výběru, nikoli nový kompletní browser běh.

Trvalý výběr nově obsahuje také `auth-memory-session`. Finální discovery: **Chromium 462 / WebKit 243 / Firefox 106**. Je to seznam nalezených testů, do výsledku vzdáleného běhu nelze automaticky dosadit PASS. Veřejný kalendář (včetně skutečného stažení ICS), odkaz na mapu a zachování neplatné e-mailové poptávky byly cíleně ověřeny v Chromium 390 a 1440 (**2 PASS**); samotné odeslání poptávky se neprovedlo.

Finální historie: upravené dva scénáře WebKit **2 PASS**, stejné finální scénáře Chromium/Firefox **4 PASS**; původní přirozené scrollování Chromium **1 PASS**, WebKit/Firefox **2 PASS** přes úzce vybranou lokální konfiguraci. Jde o oddělené běhy stejného finálního kódu, nikoli o jeden kompletní browser průchod. Konečná syntax všech souvisejících změněných JS/MJS **31 souborů PASS**, Admin graph a diff check PASS. Následuje nový plný kontrolní běh pracovní větve před přesunem na produkční main.

## Další úplný kontrolní běh #133

SHA `96002ae15aad3d680d10053638bf00a4c90764f3`, run `40724294572`: Node **642/642 PASS**, syntax PASS, Chromium **462/462 PASS**, WebKit **241 PASS / 2 FAIL**, Firefox **105 PASS / 1 FAIL**; všechny sady **0 skipped**. Nové rozšířené pokrytí tedy skutečně běželo. Produkční main zůstal na předchozí publikaci. Není to zelený kompletní výsledek.

WebKit odhalil chybu předchozí úpravy samotného helperu historie: `getAnimations()` může obsahovat dokončenou animaci s fill forwards, čekání na již vyřešené Promise v opakované smyčce pak blokuje vykreslování. Izolovaný původní helper zůstal v běhu do Node watchdogu 1010 ms; nová permanentní regrese dokončenou animaci zachová a ověří návrat helperu. Nové čekání probíhá na vykreslovacích snímcích a ignoruje dokončené animace. Navíc samotné scrollY nestačí: zaznamenaný rok se při konstantním scrollY pohnul ve WebKitu o **5,55 px na mobilu / 14,73 px na desktopu**. Helper proto měří i skutečný obdélník odkazu. Finální cílená historie **9/9 PASS**, tři scénáře v každém enginu. Žádná spekulativní změna produkční historie nebo CSS.

Firefox appearance test nedokončil výběr Cabrio. Trace zaznamenala vstupní bod 720/842 a posun scrollTop **2120 → 2258** během interakce; posouvání pokračovalo už mezi předchozími kontrolami. Přesný zdroj tohoto posunu se lokálně neprokázal. Lokální původní Firefox scénáře **3 PASS**, cílená dvě měření nepotvrdila samotný fokus jako příčinu; aplikační handler kategorie je synchronní a neposouvá stránku. Nebyla přidána spekulativní změna fokusu.

Appearance kontrola nyní začne z viditelné ustálené skutečné karty a běžně klikne; zachovává všech sedm kategorií, fotografie, barvy a chyby. Případné selhání přiloží pointerdown/up/click, jejich skutečné cíle, souřadnice a scroll. Nové `showshine-pointer.spec.mjs` navíc používá dva skutečné částečně viditelné stavy u okraje viewportu, normální myš a kontroluje přesné cíle všech tří událostí, geometrii a výběr. Kombinovaný vývojový běh **13 PASS / 2 FAIL**: devět původních appearance scénářů prošlo; nové dva WebKit testy chybně očekávaly automatický fokus myší. Tato neplatná očekávání byla nahrazena přísnější kontrolou skutečných pointer cílů. Konečné pointer regrese **6/6 PASS**, dva na engine. Tyto testy jsou součástí trvalého kritického výběru. Původní příčina posunu není vydávána za prokázanou chybu aplikace ani opravený browser engine.

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
