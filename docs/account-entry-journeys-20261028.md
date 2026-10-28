# Vstup do účtu a dokončené členské průchody — 28. 10. 2026

Výchozí publikovaná verze: `608882ad24fdb95153d07bd80141a264a2211e48` (CI #141: Node 642, Chromium 465, WebKit 246, Firefox 109 PASS). Tato dávka navazuje na `public-member-followup-20261028.md`, `member-actions-20261028.md` a doplňující `member-task-flows-20261028.md`. Starší výsledky nejsou vydávány za nové ověření.

## Důkaz a opravy aplikace

1. **Odhlášení → homepage → registrace → přepnutí na login → nechtěná homepage.** Řízený browser průchod nad nezměněnou výchozí aplikací prokázal dva vykreslené účty (před logoutem a po loginu), ale konečnou URL `/index.html`. Žádný pageerror. Samostatně selhalo správné očekávání „Přihlásit se“: aplikace zobrazila „Registrovat se“. `public-member-state.js` vždy generoval anonymní `mode=register&returnTo=<veřejná stránka>` a `member.js` provedl návrat až po nepovinné pozvánce. Dvě očekávané FAIL jsou důkaz chyby, nikoli náhodně zelený původní scénář. Soukromá evidence `.local-evidence/account-intent-20261028/baseline/`; první zkušební test měl samostatnou chybu synchronizace přípravy formuláře, která není důkaz aplikace.
2. **Opožděné obnovení LIVE přebilo novou sekci.** Skutečné izolované `getLiveState` / `getMemberLive`, zapamatovaný režim LIVE a bariéra jeho odpovědi: Garáž → Moje fotky → uvolnit odpověď → chybně Program LIVE. Před opravou FAIL, po opravě PASS. Běžný vstup nyní pouze zjišťuje stav LIVE; režim se otevírá výslovným přechodem do LIVE. Přímý `section=live` a obnovení jeho již zvoleného režimu fungují dál. Opuštěný vstupní dialog zneplatní svůj požadavek, takže se neobnoví po Zpět nebo novější sekci.
3. **Rozpracovaná galerie z předchozího účtu blokovala další účet.** Zadržený první GET → UI logout → přihlášení druhé izolované identity: očekávány dva GETy, skutečně jen jeden. Před opravou FAIL. `photos.js` ponechával společný loading příznak a měnil/vykresloval obsah dříve než vnější session guard. Reset nyní zneplatní sekvenci a uvolní loading; přijetí odpovědi i finally kontrolují vlastní sekvenci a identitu. Po opravě C/W/F 3/3 PASS: při uvolnění staré odpovědi zůstane nová galerie načítaná, starý snímek se nezobrazí a až vlastní druhá odpověď zobrazí jediný správný snímek. Test ověřuje klientskou izolaci; nenahrazuje serverový test vlastnictví.
4. **Nepovinná pozvánka nesmí vlastnit navigaci.** Konečnou navigaci spotřebuje pouze účetní inicializace. Pozvánka běží následně bez blokování účtu, s AbortSignal a kontrolou aktuálnosti dialogu/účtu. Změna sekce, logout a nová obnova dialog odstraní; opožděný preview ani dokončení starého kliknutí nemohou otevřít profil jiného pokusu. Explicitní ověření e-mailu u soukromého převzetí účasti se nemění; běžná registrace se jím nově neblokuje.
5. **Planner po změně účtu.** Asynchronní převzetí handoffu dostává existující session guard a kontroluje jej po odpovědi i v chybové větvi před změnou formuláře. Neobnoví starý účet po logoutu. Pravidla rezervací, převodu plánu, cen a výběru auta jsou beze změny.

## Jediné rozhodovací pravidlo

Společný `member/deep-links.js` obsahuje pravidla, která používá veřejná navigace i účet. Nezávislý druhý účetní nebo navigační systém nevzniká.

| Stav návštěvníka | Tlačítko / formulář |
|---|---|
| Anonymní bez použitelného příznaku | Registrovat se / registrace |
| Anonymní s dříve úspěšně použitým účtem | Přihlásit se / login |
| Potvrzeně přihlášený | Můj United účet |
| Nerozhodnutá autentizace | Účet, stav načítání |

Příznak `e36UnitedAccountUsed:v1` má jen hodnotu `1`, vzniká po načtení platného použitelného profilu a kritického snapshotu, ne při návštěvě formuláře nebo selhaném profilu. Neobsahuje identitu ani oprávnění, není důkaz session a přetrvá běžný logout. Výslovné `mode=login/register` a ruční přepnutí mají přednost. Nedostupné či vymazané úložiště bezpečně znamená registraci. Změna příznaku v jiném panelu aktualizuje navigaci bez dalšího API požadavku a bez přepínání rozepsaného formuláře. Soukromý stav se při logoutu nadále resetuje.

| Záměr | Konečný cíl |
|---|---|
| Obecné menu `intent=account` | Přehled účtu, žádný automatický návrat na veřejnou stránku |
| `draft` z Planneru | Registrace s převzatým plánem; stávající rezervace se nepřepisuje |
| `section` / starší `panel` | Ověřená sekce; history/rewards jsou Club |
| Samostatný klubový `profile`, sekce Merch s `order`, platba s `payment` | Zachovaný konkrétní kontext, oprávnění zůstávají serverová |
| Soukromý `#arrival-invite` | Fragment zachován, nepovinné převzetí až po autentizaci a výslovné akci |
| Výslovné `intent=return` na Galerie/Merch | Bezpečný same-origin návrat k veřejné akci se query/hash |
| Starší návrat Galerie/Merch s rozpoznaným upload/order fragmentem | Zachován; starší interní členský návrat zachová povolený detail |
| Chybějící, neplatná nebo nebezpečná adresa, stará homepage provenance | Přehled |

`returnTo` není obecný open redirect: jiný origin/port, userinfo, protokolově relativní cesta, backslash, Admin/API a libovolné jiné stránky nejsou povolené návraty. Přímá sekce a `draft` mají přednost. Spotřebované `intent/mode` a obecné návraty se odstraní ze současného záznamu historie; potřebný `draft`, bezpečný dobrovolný Planner `returnTo=/index.html#planer` (také starší `#planner`), soukromý fragment a detail zůstanou. Tento Planner odkaz sám automaticky nepřesměrovává. Novější přijatá uživatelská navigace zneplatní původní záměr. Zpět/Dopředu znovu neodesílá účetní nebo obchodní zápisy. Společný 5s/10s rozpočet účtu je zachován.

## Dokončené průchody a přesné kontroly

- `account-entry.spec.mjs`: konečný cílený soubor **105/105 PASS**, Chromium 35, WebKit 35, Firefox 35, bez skips/retries, 3,0 min. Pokrývá všech 15 požadovaných cest: čistou registraci, použitý účet a logout/home/reload/login, obě ruční volby formuláře, podstránky, sekce a aliasy, Planner přes login i izolovanou registraci s hodnotami, retry profilu bez falešného markeru, staré Club/foto/pozvánkové odpovědi, LIVE, nedostupné storage, memory session a historii. Konečná URL i skutečně viditelná sekce jsou kontrolovány po uvolnění odpovědí.
- Tento běh funkčně ověřoval totožný aplikační kód; během počáteční části Chromium byla dokončena pouze propagace verzovaných URL. Proto není vydáván za ověření neměnných souborů publikačního kandidáta. Neměnný commit bude samostatně ověřen CI na pracovní větvi.
- Příprava nového souboru: první celý Chromium **29 PASS / 2 FAIL** (dva nesprávné testové selektory pobytu), následné dva opravené Planner průchody a řízený LIVE **3 PASS**. Samostatná příprava dalšího LIVE testu **2 PASS / 1 FAIL** (nesprávný selektor dialogu), poté opravený scénář **1 PASS**. Kontroly aplikace nebyly zeslabeny, nebyly přidány sleepy, force ani retries.
- Nepovinná galerie s výměnou účtu: před opravou **1 FAIL**, po opravě **3/3 PASS** C/W/F, viz výše. První příprava navíc chybně hledala logout uvnitř sidebaru; tento setup FAIL je oddělený od prokázané chyby.
- Nové dokončení profilu / historické žádosti / komunitní fotografie používá skutečné izolované handlery a DB/R2. Konečný profil C/W **2 PASS** + F **1 PASS**; historie/fotografie C/W/F **6 PASS**. Všechny vývojové běhy a dva neobjasněné jednorázové WebKit případy jsou přesně v `member-task-flows-20261028.md`, nejde o jeden fiktivní celý zelený běh. Screenshoty čekající historie na desktopu a zachované fotografie na mobilu byly otevřeny.
- Veřejné Chromium průchody **3/3 PASS** (hlavní menu a 390/1440px). Nové přímé Node regrese + přímo dotčené stávající soubory **41/41 PASS**, 0 skipped. Starší první vývojový pokus nového Node souboru měl syntax chybu testu (33 PASS / 1 FAIL); opravena závorka nového testu, nikoli aplikace.
- Admin module graph: PASS, bez chyb a cyklů. Syntax **19 změněných JS/MJS PASS**, **9 dotčených modulů / 15 verzovaných vazeb** jednotně `20261028-entry1`. Nezměněné moduly zachovaly své tokeny. `git diff --check` PASS. První spuštění grafu bez požadovaného `--experimental-vm-modules` správně oznámilo chybějící runtime přepínač; nebylo výsledkem grafu.

Doplněné konkrétní úlohy: profil 503 → zachované hodnoty → retry → DB i souhrn → reload; důkaz historie → Zrušit bez zápisu → důkaz/kategorie → jedna čekající žádost bez bodů → znovu otevřít; fotografie → odmítnutý typ bez POST → 503 → retry stejného upload ID → jedna čekající fotografie → vyčistit pouze lokální výběr. Předchozí použitelné důkazy byly využity pro auto a návrat do Planneru, zrušení editace, stávající rezervaci versus nový plán a uzavřené registrace. Konkrétní testy a hranice jsou v navazujícím inventáři, nikoli pouze v obecném tvrzení o pokrytí.

## Skutečný SDK/API versus izolované testy

Kandidátní lokální HTML/JS na podporovaném www originu, **skutečný Firebase SDK a produkční API**, existující schválený účet bez smazání či nové registrace:

| Průchod | Chromium | WebKit | Firefox |
|---|---|---|---|
| Čistý profil prohlížeče → registrace → ruční login → Přehled | PASS, 930 ms | PASS, 1517 ms | PASS, 1479 ms |
| Logout přes mobilní menu → homepage → Přihlásit se → reload → login → konečný Přehled | PASS, 867 ms | PASS, 1012 ms | PASS, 1433 ms |
| Přímá Garáž a její reload, konečný logout | PASS | PASS | PASS |

Tento kandidátní smoke ještě není produkčním ověřením publikovaných souborů. SDK/API nebyly mockované, frontend byl před publikací pod www nahrazen kandidátními soubory. **0 pageerror**, včetně WebKitu; konkrétní požadavky, ACAO, navigace, časy a neúspěšná spojení se evidují v ignorované diagnostice. Původní dvě WebKit access-control hlášky se neopakovaly, jejich historická příčina tím není objasněna. Nevznikly rezervace, auta, platby, uploady ani e-maily a nebyla měněna skutečná profilová data. Normální přihlášení používá stávající idempotentní evidenci navštívených kroků.

Řízené závody a chyby používají izolovaný Firebase/API model. Zápisové dokončovací testy používají skutečné vyjmenované handlery nad izolovanou databází a paměťovým R2; nevyvozují nové ověření produkčních oprávnění. Nový účet se zakládá jen izolovaně.

## Hranice domén a nezavedené provozní kroky

Podporovaný origin je www. Sken aktuálních sledovaných frontendových JS/HTML nenašel další apex odkaz v běžné navigaci; dříve opravená kampaňová CTA i návrat ankety zůstávají www. Existující uložené kampaně se nepřepisují. Druhý origin má nadále vlastní Firebase session a browser storage.

Před budoucím samostatně schváleným pravidlem 308:
1. Nečistit žádné browser úložiště. Na apexu otevřít a zkontrolovat stávající koncepty; poznamenat konkrétní ročník a čas/verzi výběru.
2. Koncept, který je již uložený na serveru pod správným účtem/ročníkem, převzít běžným přihlášením na www a ověřit hodnoty. Při existující rezervaci nebo novějším plánu zachovat výslovnou volbu; starší koncept nesmí automaticky přepsat novější uložený stav.
3. Lokální anonymní koncept není sdílený serverový záznam. Před přesměrováním jej musí jeho uživatel buď běžným pokračováním na apexu uložit ke svému účtu a následně ověřit na www, nebo zaznamenat volby a výslovně obnovit na www. Samotné překopírování parametru `draft` nestačí: jeho lokální payload z druhého originu dostupný není. Původní koncept do ověření výsledku nesmazat. Session, Firebase tokeny ani privátní klíče nepřenášet.
4. Teprve po vyřešení potřebných starých konceptů zavést samostatný provozní krok `(http.host eq "e36united.cz")`, cíl `concat("https://www.e36united.cz", http.request.uri.path)`, 308, Preserve query string. Zachovat fragment, žádný pevný přepis hash. Ověřit hlavní stránku, členství se sekcí, historii a předaný plán; www může vyžadovat nové přihlášení.

Tato dávka Cloudflare pravidlo ani Firebase konfiguraci neaktivuje. Fyzický postižený iPhone, jeho klávesnice a původní šednutí zůstávají neověřené. Potvrzovací/resetovací e-maily mají samostatně neověřenou skutečnou doručitelnost; podmínka ověření se nezapíná. Provozní transport je vypnutý, Merch pozastavený, united-2026 registrace zavřené.

## Publikace

Po dokončení cílených kontrol se ověří neměnný kandidát na pracovní větvi, teprve po úspěchu se stejný commit publikuje na main bez force. Worker, schéma, migrace, dependencies a workflow se v této dávce nemění. Výsledky CI, Pages/source SHA, HTTP a skutečného produkčního smoke budou po dokončení doplněny lokálně bez dalšího zbytečného dokumentačního push/CI.

## Závěrečné doplněné cílené kontroly před kandidátem

- Po dokončení 105 průchodů přibyly dva scénáře (finální soubor má 37): opožděné převzetí Planneru po logoutu a přihlášení jiného účtu **C/W/F 3/3 PASS**, aktualizace příznaku mezi panely bez změny rozepsané registrace **C/W/F 3/3 PASS**. První příprava prvního z nich **0 PASS / 3 FAIL**: legitimní úvod při prázdné Garáži překryl logout; opraven setup běžným zavřením úvodu. Nejde o celý nový 111testový běh.
- Přímo sousední Planner: první výběr **20 PASS / 10 FAIL** — všech deset Firefox případů skončilo před stránkou na `browserContext.newPage: Cannot read properties of undefined (reading '_page')`. Přímo tentýž Firefox výběr v povoleném procesu **10/10 PASS**, 23,8 s; Chromium/WebKit se neopakovaly. Výběr obsahuje šest variant obnovení ročníku/baseline, obě skutečné cesty uloženého auta do Planneru, přepínání formulářů a serializované autosave.
- Paměťová session a společné deadline účtu: **33/33 PASS**, Chromium 11, WebKit 11, Firefox 11, 46,0 s. Tím je ověřen také původní smysluplný Planner návrat po reloadu; nebylo přepsáno jeho očekávání na ztracený parametr.
- Dvě nalezená zastaralá očekávání byla opravena podle nového zadání: veřejné menu po loginu musí nejprve ukázat Přehled a do veřejného Planneru se vrací skutečnými odkazy až uživatel; úspěšně použitý účet po logoutu nabízí login, nikoli registraci. Všechny následné kontroly zůstaly zachované. Cíleně **Chromium 2 PASS**, **WebKit/Firefox 4 PASS**. Pro tyto dva sousedy byl použit ignorovaný config se stejnými nastaveními, který pouze zpřístupnil daný soubor v dalších enginech; trvalý rozsah projektu se tím nezměnil.
- Bez automatických retries, přeskočení, pevných sleepů nebo force klikání. Žádné celé lokální browser projekty ani celá Node sada se neopakovaly; širší finální kontrolou bude automatický CI neměnného commitu.
