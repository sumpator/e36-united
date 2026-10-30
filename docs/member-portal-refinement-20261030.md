# Dotažení portálu — 30. 10. 2026

Výchozí HEAD `6a1fe04acb892f1c0aa3ece577c575e2efa8667f`. Navazuje na schválený společný rámec. Původní čtyři lokálně doplněné reporty, audit a diagnostiky zůstávají mimo tuto dávku. Google přihlášení, Worker, databáze, účtování a provozní nastavení nejsou měněné.

## Výsledná prezentace

- Desktopová identita: skutečná soukromá fotografie hlavního auta přes šířku menu, poměr 2:1, zhruba 103 px; přezdívka, United Member a auto pod ní. Dlouhé texty mají kompaktní omezení řádků; úplné údaje zůstávají v Účtu/Garáži. Bez fotografie není prázdná velká karta a cesta doplnění fotografie zůstává. Na mobilní stránce zůstává malá identita; široký snímek je jen v rozbaleném menu. Mobilní kopie nepřebírá původní datové selektory; při změně identity se obnoví a po odhlášení se vymaže, nepřebírá vlastnictví blob URL.
- LIVE a Odhlásit se jsou v odděleném spodním bloku, i v mobilním menu. Menu je ve standardním toku, nikoli překrývající pevný footer. Původní kontrola LIVE, neaktivní dialog i potvrzení vstupu a návraty zůstávají; nové testy výslovně odmítnou neaktivní LIVE a vrátí se původním tlačítkem.
- Poslední opravené popisky z chatu: Přehled **bez popisku**, Rezervace „Účast a ubytování“, Platby „Úhrady a doplatky“, Garáž „Tvoje auto“, Club „Tvoje výhody & historie“, Moje fotky „Tvoje fotky“, Účet „Údaje a nastavení“, Merch „Oblečení a doplňky“. Spodní mobilní lišta zůstává bez popisků.
- Význam stavů sjednocuje malý čistý prezentační modul `member/reservation-status.js`. Čte existující status rezervace a serverový payment status, nic nepočítá ani nezapisuje. Potvrzení má ✓, čekání na tým ◷, odmítnutí ×, technická chyba vlastní text, zrušení neutrální —. Schválená neuhrazená účast zůstává potvrzená a má samostatné „K úhradě/K doplacení“. Rozpracovanost není potvrzená účast. Při chybě čtení se menu netváří jako zamítnutá rezervace.
- Hover/focus mají pozadí/obrys bez transformací. Hover je omezený na zařízení s jemným ukazatelem a hoverem. Aktivní volba má vlastní trvalý detail. Tmavé názvy menu dědí barvu položky, nikoli původní světlý fallback; je na to geometrická i barevná kontrola.
- Club: **Moje účasti / Body a výhody / Moje ocenění**, zvýrazněná nízká skupina bezprostředně pod hlavičkou. Výchozí jsou účasti, výslovný `clubTab`, starší `section=rewards/history` a cílený hash se respektují. Změna záložky se zapíše do stávající historie; reload a Zpět/Dopředu zachovávají cíl. Běžný nový vstup je opět historie, překreslení stejné agendy volbu neresetuje. Při opuštění Clubu se odstraní jen jeho vlastní query/hash. Čekající klubové čtení respektuje zvolenou záložku a nic předčasně neodhaluje.
- Odstraněné duplicity v Platbách, Garáži a Moje fotky. Soukromí auta/hlavní auto je vysvětlené v původním dialogu; účel veřejných fotografií a schválení před nahráním. Základní popis agendy a všechny varovné/chybové instrukce zůstávají. Přepínání plateb už neaktualizuje odstraněný duplicitní odstavec.
- Rezervace: klidný stav bez zeleného gradientu, běžná typografie a samostatná informace o platbě; vlastní zpráva týmu. Název eventu před rokem, rok je doplňující. Následuje zarovnaný souhrn, původní změnové akce a platební detail. Výběr auta zůstává skutečné tlačítko napojené na existující volič a uložení, změna/storno zůstávají schvalované. Informační ceník 2027 má původní podmínky; aktuální uzavřený 2026 nezískává budoucí ceny.
- Rezervace a Platby používají **tentýž výstup původní `paymentCard`**: menší event/status, hlavní relevantní částka, cena/zaplaceno/zbývá, zarovnané údaje, QR vpravo nebo pod nimi. QR generátor, SPAYD, symboly, částky a podmínky dostupnosti jsou původní. Testovací upozornění zůstává výrazné. Zamítnutá rezervace už v prezentační větvi nepoužívá nepravdivý nadpis „Čeká na schválení“; platební pokyny zůstávají nepřístupné, údaje se nemění.

## Ověření a oprávněně změněná očekávání

Pouze izolovaná data: existující browser fixtures a původní skutečné handlery/SQLite pro zápisové průchody Planneru a navazujících kontrol. Žádné produkční objednávky, rezervace, auta, platby, uploady ani e-maily. Neznámé API a neočekávané konzolové chyby dále selhávají; žádné retries, skip, force click, pevné sleepy ani navýšené timeouty.

| Běh | Přesný výsledek | Význam |
| --- | --- | --- |
| První nové 3 Chromium scénáře | 0 PASS / 3 FAIL | Odstraněný duplicitní odstavec měl ještě zapisujícího konzumenta `syncPaymentTab`; opraveno odstraněním tohoto zápisu. Poté 3/3 PASS, 6,8 s. |
| Přímo dotčené Node kontrakty | nejprve 76 PASS / 8 FAIL, následně 84/84 PASS | Původní pořadí LIVE/Clubu, umístění logoutu a odstraněný duplicitní platební nadpis. Očekávání změněna podle výslovného zadání, všechny kontroly dat a oprávnění zachované. |
| Vývojový C/W výběr | 30 PASS / 6 FAIL, 2,3 min | Nový test zaměnil potvrzenou účast se změnou čekající na schválení; opravena přesná nová testová větev. Původní barevná regrese prázdného auta zachována, obnoveno původní neutrální pozadí tlačítka místo změny jejího očekávání. |
| C/W/F výběr rozhraní, stavů a Planneru | 54 PASS / 3 FAIL, 2,9 min | Všechny platební a návratové scénáře prošly. Nový test menu zapomněl zavřít zachovaný ochranný LIVE dialog; po doplnění nesprávný přístupný selektor narazil na dva legitimní cancel ovladače. |
| Nová navazující navigace C/W/F | 3 PASS / 3 FAIL, 24,1 s | Club, reload, Zpět/Dopředu a explicitní cíle prošly; pouze uvedený nejednoznačný selektor LIVE testu. Opraven na konkrétní sekundární cancel tlačítko. |
| Dokončení menu/ochrany LIVE/logout C/W/F | 3/3 PASS, 12,0 s | Včetně všech následných kroků a nulové soukromé identity v menu po odhlášení. |
| Navazující Chromium výběr | 52/52 PASS, 1,7 min | Přihlášení a návratové cíle, timeout/pozdní čtení, soukromé fotky, všechny původní úpravy/žádosti, autosave a obě cesty auta z Planneru s jediným zápisem a retry. |
| Finální relevantní Node výběr | 106/106 PASS, 0 skipped | Jedenáct přímo dotčených zdrojových/modelových souborů, včetně 5 nových prezentačních regresí. Celá nezměněná Node sada se lokálně neopakovala. |
| Finální snímky a následné akce Chromium | 6/6 PASS, 18,5 s | Čtyři hlavní agendy desktop/mobil v obou motivech; menu; samostatná rezervace/platba také 360 a 820, QR a přesné stejné HTML obou míst. |
| Poslední kontrola tmavého menu | 2/2 PASS, 7,4 s | 1440 a 390 px; test výslovně kontroluje shodnou barvu názvu a položky. |
| Bezplatná a zamítnutá platba C/W/F | 6/6 PASS, 11,8 s | Původní zákaz platebního QR, pravdivé označení odmítnutí a stejné HTML obou platebních míst. |
| Neutrální název eventu / platební kontrakty Node | 23/23 PASS | Šest prezentačních regresí včetně chybějícího názvu historického eventu; fallback již bez nepodloženého „Příští“. Ostatní normalizovaná data a částky se nemění. |
| Historický název / dlouhá identita bez fotografie C/W/F | 3/3 PASS, 8,8 s | Správný neutrální název, čekající rezervace, původní auto a kompaktní menu s cestou doplnění fotky. |
| Registr verzí / Admin graf | 6/6 PASS; graf bez chyb/cyklů | Audit se neoslabuje; upravené jsou pouze konkrétní vydané URL v registru. |

Vývojové i cílené výsledky jsou vedené zvlášť; nejsou vydávány za nový celý browser projekt finální verze. Plný výsledek poskytne jediný automatický CI po pushnutí. Úprava starého layoutového testu schválené rezervace vyžaduje nový svislý sled a shodnou plnou šířku, zachovává obsah hodnot, ovladače, ceny, původní negativní odpověď i celý další průchod. Testy zaměřené na body mají výslovný vstup na body; běžný Club test nově kontroluje historii. Původní limit návratu Planneru ≤ 1 px ani bezpečné okraje dialogu se nemění.

Snímky jsou odděleně v `.local-evidence/portal-refinement-20261030/screenshots/`, otevřené a skutečně prohlédnuté. Oba motivy, 360/390, 820 a 1440; nejde jen o absenci přetečení, kontrolovány jsou proporce fotografie, stav/úhrada, viditelné záložky a akce, QR i prázdné místo. Fyzický telefon, jeho klávesnice a přihlášený produkční zápisový průchod nejsou touto dávkou ověřené.

## Cache a publikace

Cache token **`20261030-refine1`**, nezměněné závislosti mají své dosavadní tokeny. `payments.js` exportuje také původní QR generátor používaný sdíleným Merch `order-view.js`; proto je nezbytná návazná změna URL i v konzumentech Merche/Adminu. Tyto širší soubory mají výhradně změněné cache odkazy, žádné funkční změny. Kontrola porovnává jejich obsah po odstranění pouze tokenu s HEAD a hlídá jednu runtime URL na modul. Registr `scripts/admin-module-releases.mjs` eviduje nová vydání; logika auditoru se nemění.

Finální syntax **43 změněných/přidaných JS/MJS PASS**, cache **31 cílů / 50 odkazů**, vždy jediná správná verze; **24 souborů** ověřených jako výhradně cache změny. Admin graf bez chyb a cyklů, testy auditoru 6/6 PASS, diff PASS. Samostatný commit, push bez force a jedno automatické CI/Pages budou doplněny podle skutečných výsledků. Worker a schéma se nemění; transport zůstává vypnutý a Merch pozastavený. Po commitu bude závěrečné doplnění reportu ponecháno lokálně, aby samo nespustilo další nasazení.
