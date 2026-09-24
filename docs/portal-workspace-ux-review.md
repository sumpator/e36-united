# Admin a Můj United — lokální UX kontrola

Základ: `aec16d403bb1a9bf18a404743d49bb88ca5611f8`, větev `main`.
Práce zůstává v pracovním stromu. Bez commitu, pushnutí, CI a deploymentu.

## Změny

- Merchandising: fotografické produktové karty, lidské stavy, členěný editor s živým náhledem, vícenásobný výběr velikostí, rozbalovací varianty a vizuální výběr fotografií. Místní fotografie se nahrává až při explicitním uložení. Existující ID jsou pouze pro čtení; odchod chrání potvrzení neuložených změn.
- Nastavení obchodu: tematické karty, odkazy z chybějících údajů na pole, samostatně otevírané dokumenty s přepínáním úpravy/náhledu. Zachován původní payload, revize a podmínky aktivace.
- Platby: jednotné Sraz/Merch pod nadpisem, samostatný platební přehled Adminu bez katalogu a nastavení. Sdílené QR, platební operace a explicitní přechod do celé objednávky a zpět. URL zachovává platební záložku při reloadu a návratu.
- Mailing: výchozí seznam kampaní, oddělený editor, dostupné horní uložení, rozbalovací bloky s klávesnicovými akcemi, mobilní Editor/Náhled, jediný scroll náhledu. Doručování oddělené od obsahu. Vývojová věta odstraněna jen z nově vytvářeného konceptu; uložené kampaně se nemění.
- Ročník: vybraný a veřejný aktuální ročník odděleně, statistiky vybraného ročníku, kompaktní LIVE řádek. Přepínač vzhledu odstraněn pouze z hlavičky Adminu.
- Ubytování: oddělené rozbalování konfigurace/fotografií; otevření se zachovává při běžném obnovení podle ročníku a typu ubytování. Miniatury v mřížce.
- Účet: adresní karta až pod základním obsahem, explicitní editor, validace, zrušení, návrat fokusu a potvrzení uložení.
- Club: Výhody / Moje stopa / Úspěchy, kompaktní body a jedna skutečně existující členská odměna s fotografií; bez odhadovaného procenta slevy.

Příčina šedých tlačítek: nové prvky neměly komponentové třídy; existující `.shop-button` pravidla se na ně nevztahovala. Dlouhé formuláře používaly společné jednosloupcové omezení šířky. Nešlo o chybějící globální stylesheet. Sbalování ubytování navíc ztrácelo stav při nahrazení obsahu seznamu přes `innerHTML`.

Cache verze `20260924-workspace1` aktualizována i v importujících modulech. Veřejný Merch/checkout mají pouze nutné změny odkazů na cache verze, nikoliv redesign.

## Ověření

8 různých cílených Chromium scénářů prošlo (jeden worker, bez automatických retries):

1. Produkt, varianty, náhled, potvrzení neuloženého odchodu, uložení, platby, adresa a Club na 1440 px.
2. Stejný průchod na 390 px, včetně QR a návratu platební záložky.
3. Fotografie před uploadem, povinná fotografie, explicitní jediný upload a následné načtení; 360 px.
4. Rozbalování/refresh ubytování, ročník, založení a uložení izolovaného mailingového konceptu a náhled na 1440 px.
5. Stejný průchod na 390 px.
6. Rozdílný vybraný ročník 2026 a veřejný aktuální 2027, LIVE pro vybraný ročník, bez aktivačního zápisu.
7. Vytvoření produktu a nové kategorie, výchozí adresa a propojené platební přehledy (`merch-connected.spec.mjs`).
8. Finální kompaktní rozložení produktu, nastavení a Mailingu v obou motivech na 1440/390 px.

Syntax kontrola: 36 změněných/nových JS a MJS souborů PASS. `git diff --check` PASS.

Šest starších souvisejících testů prošlo funkčními kroky, ale selhalo na závěrečné kontrole chyb kvůli chybějícím deterministickým fixtures:

- `admin.spec.mjs`: galerie ubytování, mailingový přehled, editor a uložení/reload konceptu — `/api/admin/live?eventId=united-2026`, HTTP 501.
- `mailing-delivery.spec.mjs`: příprava a návrat zmrazené kampaně — stejná chybějící LIVE fixture.
- `member.spec.mjs`: body, achievements a historie — `/api/merch/orders?filter=active` a `/api/live/state`, HTTP 501.

Tyto chyby nebyly ignorovány ani assertions oslabeny. Nesouvisející fixtures nebyly upraveny a tyto testy se znovu nespouštěly. Nové scénáře mají izolovaný backend bridge a kontrolují i neočekávané API/console chyby.

## Vizuální kontrola

Soubory: `../portal-workspace-review/` (mimo repozitář).
Skutečně otevřené a prohlédnuté snímky zahrnují:

- `products-1440-light.png`
- `product-editor-1440-dark.png`, `product-editor-390-dark.png`, `product-editor-390-light.png`
- `photo-draft-360-dark.png`, `photo-draft-360-light.png`
- `settings-1440-light.png`, `settings-1440-dark.png`, `settings-390-light.png`, `settings-390-dark.png`
- `admin-payments-390-light.png`, `member-payments-1440-dark.png`
- `account-1440-dark.png`, `account-390-light.png`
- `club-1440-light.png`, `club-390-dark.png`
- `mailing-editor-1440-light.png`, `mailing-editor-1440-dark.png`, `mailing-preview-390-light.png`, `mailing-preview-390-dark.png`
- `accommodation-1440-light.png`, `accommodation-390-dark.png`
- `event-1440-dark.png`, `event-390-light.png`

Kontroly přetékání prošly. Prohlédnutí vedlo ke zkrácení karty stavu objednávání, sbalení fotografického výběru, zlepšení čitelnosti benefitů a zmenšení mobilní mailingové hlavičky. Fotografie Merche jsou skutečné lokální assety. Některé jiné fotografie a loga jsou v izolovaných fixtures nahrazené barevnou plochou; tyto snímky neslouží k posouzení jejich fotografického ořezu. Testovací ceny, adresy, objednávky a aktivní nastavení na snímcích pocházejí výhradně z izolovaných dat, nikoli z produkce.

## Omezení a bezpečnost

- Fakturační údaje současný adresní model samostatně nepodporuje; nepřidán nefunkční formulář.
- Nenastavené procento slevy se neodhaduje z bodového prahu.
- Historická vývojová věta na přiloženém mailingovém screenshotu může zůstávat v uloženém obsahu kampaně. Je třeba ji případně ručně upravit v konkrétním konceptu; hromadná změna uložených kampaní nebyla provedena.
- Skill `agent-browser` / `agent-browser-verify` vedl ke kontrole načtení, chyb a výsledných screenshotů. CLI nebylo dostupné; použito existující projektové Playwright prostředí bez instalace dalšího prohlížeče.
- Worker, D1, R2, produkční objednávky, platby, body, aktivace obchodu/ročníku/LIVE ani e-maily nebyly změněny. Všechny zápisy během testů směřovaly do izolovaných fixtures.
