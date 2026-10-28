# Členské dokončovací akce a inventář — 28. 10. 2026

Navazuje na `public-member-journeys-20261028.md`. Inventář veřejného webu a autentizace je v navazujícím hlavním reportu; zde je dohledatelná členská část. „Čtení“ znamená kontrolu skutečných značek/handleru, nikoli provedený browser scénář. Předchozí zelené výsledky nejsou vydávány za nový průchod.

## Doložené opravy

1. **Dokončení auta mimo viditelnou oblast.** Při otevření nového auta na 360 × 420 bylo tlačítko v původní verzi na y=725,25 až 777,25 px; viditelná výška byla 420 px. Formulář byl rolovatelný, tlačítko tedy neexistovalo jen zdánlivě. Dokončovací řádek nyní drží „Přidat auto“ / „Uložit změny“ a „Zrušit“ u spodní hrany dialogu. Krátká věta vysvětluje, že zápis nastává až potvrzením a fotografie je volitelná. Dialog respektuje aktuální `visualViewport`, včetně jeho posunu a zmenšení při klávesnici. Žádné změny ukládání, výběru hlavního auta nebo fotografických pravidel.
2. **Prázdná karoserie po běžném přidání.** Přímé předání `openCarModal` jako click handleru zaměnilo `MouseEvent` za existující auto. Větev předvyplnění nastavila karoserii na prázdný neexistující option. Handler nyní výslovně otevře nový formulář bez argumentu. Nový formulář má výchozí Sedan; editace stále přebírá skutečnou karoserii auta.
3. **Nevhodný příklad názvu.** `Modrá mrcha` byl pouze placeholder v `member.html`, nikoli předvyplněná hodnota. Je nahrazen „Moje E36“. Nový formulář má nadále prázdnou skutečnou hodnotu a povinnou validaci. Skutečná členská data se nepřejmenovávají. Prohledání dotčených veřejných a členských zdrojů nenašlo další obdobný aplikací dodaný text.
4. **Neaktivní potvrzení historie bez důvodu.** Existující „Odeslat ke kontrole“ mělo správnou podmínku, ale nevysvětlovalo, která část chybí. Přidán přístupně navázaný stav: chybějící důkaz, chybějící kategorie, nebo připravenost k odeslání. Podmínky schvalování a důkazů beze změny.
5. **Volitelnost Clubu.** Uvítací karta nyní výslovně označuje United Club jako volitelný a říká, že historii a fotografie lze doplnit později. Povinné registrační kroky se tím nemění.

## Inventář členského ovládání

| Místo / účel | Akce, odezva a úspěch | Chyba a návrat | Důkaz / stav v této dávce |
|---|---|---|---|
| Přehled: aktuální stav srazu | Stavová karta otevře příslušnou registraci / plán; body jsou níže | Zavřené registrace nevytvářejí rezervaci | Stávající `deriveOverviewState`; oddělené regrese hlavní dávky |
| Přehled: profil, Garáž, Club, fotky | Karty míří na skutečnou sekci; Club je označen jako volitelný | Zavření úvodu vrací fokus, volitelné kroky nezakládají rezervaci | Čtení `overview.js`; předchozí a projektové `member-club-profiles.spec.mjs` |
| Garáž: přidat | „Přidat auto“; povinný vlastní název/model; zpracování „Ukládám auto…“ | Neplatný formulář nezapisuje; zrušení neukládá | Nová regrese 360/390/1440; prázdný nickname a výchozí karoserie |
| Garáž: editace | „Uložit změny“ se skutečnými stávajícími hodnotami | Zrušit ponechá uložené auto; příklad není uložená hodnota | Nová regrese + stávající „Garage Add and Edit“ |
| Garáž: dokončení při klávesnici | Viditelný dokončovací řádek; posun a výška podle visualViewport | Obsah dialogu lze rolovat, akce zůstávají dostupné | Řízený visualViewport 420 px s offsetem 50 px; skutečná fyzická klávesnice iPhonu není emulována |
| Garáž: fotografie | Výběr soukromé fotografie, náhled, zrušení nové fotografie | Typ/velikost odmítnuta s vysvětlením; původní soubor zůstává do potvrzení | Čtení `garage.js`, existující regresní cesty; žádný produkční upload |
| Garáž: hlavní auto a odebrání | Okamžitá serverová změna hlavního auta; odebrání má potvrzení | API chyba se zobrazí; fotografie a auto se nemažou pouhým zrušením dialogu | Čtení handlerů; hlavní auto navíc ověřeno ve skutečných izolovaných handlerech Planneru |
| Planner: přidat chybějící auto | Uložení auta vrátí kontext Planneru a vybere nově potvrzené ID | Neúspěšný refresh ponechá identitu; retry nevytvoří druhé auto | Oba integrační scénáře „Planner keeps confirmed new car…“ |
| Registrace: výběr auta | Existující select v Planneru aplikuje výběr; změna schváleného auta má vlastní „Uložit“ | Zavřené registrace/změnový proces mají serverový stav | Čtení `planner/reservation.js`; nevytvořeno další potvrzení okamžitě aplikovaného selectu |
| Registrace: odeslání a změny | Výslovné odeslání ke schválení; stav žádosti se zobrazuje odděleně | Neplatné údaje zůstávají; nová změna nepřepisuje identitu schválené rezervace | Existující testy; přímo ověřeny dvě regrese změnového Planneru |
| Registrace: stav, platba, QR | Detail čte serverovou částku, úhradu a variabilní symbol | Zobrazení QR není potvrzení platby | Stávající „approved reservation renders server payment…“ v cíleném výběru |
| Účet: profil | „Uložit profil“; „Ukládám…“ → „Profil byl uložen.“ až po odpovědi | Formulář zůstává při chybě; opakování stejnou akcí | Cíleně „Account keeps profile prefill…“; skutečné production zápisy neprováděny |
| Účet: členský QR | Zvětšení existujícího QR; zavření a popstate | Nedostupná identita má vlastní informaci, nevytváří se nová | Čtení `account.js`; bez dalšího zápisu |
| Club: body a pravidla | Body, informační popover a záložky jsou volitelné | Dosažená hranice není tvrzení o čerpání odměny | Cíleně „United Club renders…“; výpočty nezměněny |
| Club: historie / ročník | Editor konkrétního skončeného roku, vlastní odeslání ke kontrole | Nová informace přesně vysvětluje neaktivní odeslání | Nová regrese důkaz → kategorie → připraveno, bez produkčního uploadu |
| Club: historie zkontrolována | „Mám historii zkontrolovanou“ je samostatná existující akce | Po potvrzení „Historie je zkontrolovaná ✓“ | Čtení handleru; nový skutečný produkční zápis neprováděn |
| Moje fotky: soubory a fronta | Výběr, náhled, odstranění výběru, vlastní „Nahrát fotky ke schválení“ | Odeslání ke kontrole není veřejné schválení; limit a retry zůstávají | Cíleně „Member Photos keeps its empty state…“; schvalování jen čtení |
| Moje fotky: galerie / lightbox | Otevření konkrétní soukromé fotografie, předchozí/další a zavření | Chyba fotografie se nezaměňuje za úspěšné načtení | Čtení `photos.js`; širší foto suite se neopakovala |
| Merch v účtu | Aktivní/historické objednávky, otevření detailu a katalogu | Pozastavení obchodu se neobchází | Čtení; žádná objednávka ani změna konfigurace |
| Navigace / menu / odhlášení | Přímé sekce a uzavření menu; logout odstraní soukromý stav | Řeší hlavní auth dávka včetně starých odpovědí | Výsledky hlavního reportu, nikoli znovu přičtený běh |

## Přesné výsledky

- Přehrání původního HEAD HTML, CSS a modulu Garáže nad funkčním testovacím auth: **2 očekávané FAIL** — nedostupná akce a prázdná karoserie. Geometrie výše, původní screenshoty a trace v ignorované `.local-evidence/member-completion-original/`.
- První pokus před tímto důkazem skončil při načítání auth, protože paralelní auth změna byla právě rozpracovaná; není vydáván za důkaz chyby Garáže.
- První nová sada v Chromium: **3 PASS**; po doplnění historie **4 PASS**.
- První WebKit/Firefox běh: **3 PASS / 5 FAIL** — WebKit odmítl soubor kvůli chybějícímu deterministickému MIME z hostitelského prostředí; všechny čtyři Firefox scénáře selhaly před otevřením stránky v omezeném procesu.
- Běh po rozšíření simulace klávesnice: **5 PASS / 7 FAIL** — test nahradil celý visualViewport místo změny vlastností existujícího objektu se zaregistrovaným listenerem; zbylé důvody jako výše. Opraven testovací model, nikoli tolerance či aplikační logika. Reálné WebP bajty jsou nyní předány s explicitním `image/webp`.
- Finální dotčené 390px a historie Chromium/WebKit: **4 PASS**. Nezměněné 360/1440 scénáře předtím prošly v obou enginech; tyto výsledky nejsou vydávány za jeden nový celý běh.
- Finální Firefox ve schváleném procesu: **4 PASS**. Bez retries nebo změny browser flagů.
- Cílený existující Member výběr Chromium: **7 PASS** (Club, profil, Garáž, fotografie, dva změnové Planner modaly, serverové údaje platby).
- Skutečné izolované handlery, přidání auta z prázdné Garáže i při existujícím hlavním autě → úmyslně neúspěšný refresh → opakování bez druhého vytvoření → návrat do Planneru a obnovení konceptu: **6 PASS** (dva scénáře v každém Chromium, WebKit a Firefox).
- Screenshoty 360 × 420, 390 × 844, 1440 × 900 a finální WebKit simulace klávesnice byly skutečně otevřeny a prohlédnuty.
- Syntax `garage.js`, `club/history.js`, nového testu a cílený `git diff --check`: PASS. Finální cache graf a publikaci přebírá hlavní dávka.

Zde uvedené testy nejsou důkazem skutečné doručitelnosti potvrzovacího nebo resetovacího e-mailu, fyzické klávesnice iPhonu ani všech produkčních uploadových stavů. Žádná produkční členská data, rezervace, platby nebo obsah nebyly touto poddávkou změněny.
