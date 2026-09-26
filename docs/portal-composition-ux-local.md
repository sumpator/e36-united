# Kompaktní portál a veřejné sekce — lokální předání

Datum: 2026-09-26. Základ `d569b7201a93d0d85f8a9b35a7264323f5be89af`.
Původně lokální dávka; následným zadáním byla schválena publikace celého frontendu. Bez backendových a produkčních datových změn.

## Dokončení před publikací

- Odstraněn počet dosažených milníků a nadbytečné potvrzení dosažené hranice z panelu i veřejného Merche. Zachováno celkové skóre, původní dvanáctibodový výpočet a postup s označením „Do další odměny“.
- Členové klubu: sekundární akce s ikonou lidí pod hlavními třemi záložkami, bez modré výplně; stejný obslužný kód seznamu členů.
- Kompaktní členské hlavičky bez popisku UNITED MEMBER, krátká modrá linka vedle názvu. Přehled a LIVE vyloučené z tohoto pravidla.
- Poslední úpravy se ověřují pouze syntaxí a kontrolou diffu. Testy ani prohlížeč se neopakují; starší screenshoty předcházejí těmto třem změnám. Dotčená testovací očekávání jsou upravena bez spuštění sad.

## Změny

- Homepage: větší průsvitné U, samostatné mobilní umístění, přesný krátký podtitulek a podbarvená veřejná navigace od prvního vykreslení. Hero Merche zachováno.
- Členské sekce používají název v horním pruhu místo opakovaného oslovení a velkého nadpisu. Přehled si ponechává oslovení; LIVE svůj samostatný režim.
- Kompaktní akce Garáže a přepínače plateb / objednávek. Veřejné odkazy Web, Galerie a Merch v rozbaleném mobilním menu.
- United Club: skóre, dvanáctibodové milníky a skutečná členská výhoda v jednom panelu. Celkové body nejsou omezené; milníky nejsou vydávané za nevyčerpané odměny. Dialog s pravidly, odkazy a návratem fokusu.
- Účet: nezávislé sloupce osobních údajů, identity s existujícím QR, doručovací adresy a zabezpečení. Vzhled dole, lokální stav uložení. Kontaktní a doručovací údaje se neslučují.
- Merch sdílí výpočet milníků; skupiny Pro koho a Kategorie jsou oddělené. Anonymní / načítaný stav není nulový zůstatek.
- Kompaktní O nás a Galerie s fotografickým pozadím, mobilní program v obou motivech, požadované zkrácení Show & Shine a odstranění pouze statického upozornění Planneru.
- Cache token dotčených vstupů a modulů: `20260926-portal3`. Jediná změna Adminu je odkaz na novou verzi sdíleného `merch/connected.css`.

## Cílené ověření

- Node: `tests/portal-composition.test.mjs` — 1/1 PASS. Body 0, 11, 12, 22, 24, 36 a 121, společný výpočet a české skloňování.
- Chromium: šest cílených scénářů v `tests/e2e/portal-composition.spec.mjs` prošlo v dílčích bězích. Přímé otevření Účtu, přepínání sedmi sekcí, názvy a fokus; uložení osobních údajů a oddělené adresy; QR; mobilní odkazy a platební záložky; Club a dialog; kombinace dynamických filtrů; anonymní Merch; veřejné kompozice a kontrast mobilního programu.
- První běh odhalil dvě chyby nového testu (nejednoznačný mobilní selektor a čekání na obrázky mimo viewport); opraveny a zopakovány jen dotčené scénáře. Dodatečná kontrola kontrastu opravila selektor popisu na skutečný element `small`. Automatické retries jsou vypnuté.
- Testovací server na tomto Windows prostředí zůstával viset při ukončení běhu. Po ukončení konkrétního vlastního serverového procesu runner vypsal konečné výsledky. Aplikační procesy nebyly ukončovány.
- Syntax všech 13 změněných / nových JS a MJS souborů: PASS. `git diff --check`: PASS.
- Záměrně změněná dvě očekávání staršího `portal-next-ux.spec.mjs` srovnána s odstraněným disclaimerem a správným skloňováním. Tato starší sada nebyla opakována.
- Žádná celá Node/browser sada, WebKit ani CI.

## Vizuální kontrola

Screenshoty byly skutečně otevřené a prohlédnuté: 1440 × 1000, 1366 × 768, 390 × 844 a 360 × 800, světlý i tmavý motiv. Kontrola vodorovného přetékání je součástí každého snímku. Prohlédnuté také spodní nastavení Účtu nad mobilní navigací, otevřené menu a dialog pravidel. Poslední kontrola odstranila nízký kontrast drobných popisů programu ve světlém motivu.

Snímky leží mimo Git v `../portal-composition-review/`:

- `account-desktop.png`, `account-notebook.png`, `account-mobile.png`, `account-360.png`, `account-mobile-bottom.png`
- `club-desktop.png`, `club-notebook.png`, `club-mobile.png`, `club-360.png`
- `points-guide-desktop.png`, `points-guide-360.png`, `menu-360.png`
- `merch-filters-desktop.png`, `merch-filters-360.png`
- `home-desktop.png`, `home-mobile.png`, `program-mobile.png`, `program-mobile-dark.png`
- `about-notebook.png`, `gallery-notebook.png`, `gallery-360.png`

Použita izolovaná členská a katalogová data a skutečné fotografie dostupné v repozitáři. Nejde o ověření přihlášené produkční relace. Systémová volba vzhledu a její resolver zůstaly beze změny; pro vizuální kontrolu byly přepínány oba výsledné motivy.

Backend, bodová a obchodní pravidla, ceny, aktivace LIVE / registrací / aktuálního ročníku, pozastavení Merche ani produkční data nebyly změněny. Žádná nová evidence odměn ani QR identita nevznikla.
