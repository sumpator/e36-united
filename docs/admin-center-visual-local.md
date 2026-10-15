# Vizuální sjednocení Adminu E36 UNITED

Lokální kontroly dokončené 15. 10. 2026. Dávka navazuje na HEAD `d0c243cc517c777b19013a2deda46db6592ffbe8`. Zahrnuje vizuální sjednocení Adminu, dokončení členských karet a opravu životnosti jejich privátních miniatur. Uživatel následně schválil commit, push a automatické ověření CI a Pages. Backendová změna není potřeba.

## Vizuální změny

Běžný Admin má neutrální světlé pozadí s modrým nádechem, bílé panely, jemné rámečky a sjednocené ovládací prvky. Tmavý motiv používá odpovídající tmavé plochy. Nové CSS je omezené na `.admin-page:not(.admin-live-mode-active)`; veřejný web a Member Portal tento stylesheet nenačítají.

Menu obsahuje neinteraktivní skupiny SRAZ, KOMUNITA a SPRÁVA. Existující cíle, přímé odkazy, počitadla, aktivní stav a mobilní dialog zůstávají. Komunitní položky jsou dostupné bez rozbalování. Na mobilu se jejich aktivní položka ukáže v původním vodorovném pásu posunem pouze tohoto pásu, nikoli celé stránky. UNITED LIVE zůstává oddělené linkou.

Členské karty mají fotografii auta 100 × 76 px vlevo, iniciály člověka v kruhu 30 px u jejího spodního pravého okraje a přezdívku se jménem vedle ní. E-mail je pod identitou; teprve pod kontaktem následuje jemná linka, počet účastí, stav registrace a případná sekundární akce „Ke kontrole: N“. Přezdívka má 18 px / 600 a nejvýše dva viditelné řádky. Celý text zůstává v DOM, přístupném názvu tlačítka a detailu. Jméno i e-mail mají 14 px a přirozené zalamování. Iniciály pocházejí ze jména, při jeho absenci z přezdívky; NFC normalizace a bezpečné vykreslení zachovávají diakritiku. Chybějící nebo dosud nenačtenou fotografii zastupuje neutrální SVG ve stávající ikonové rodině. Karty i Řádky používají stejné údaje a původní soukromá média. Na mobilu mají karty výšku podle obsahu.

Mřížka volí sloupce podle minimální čitelné šířky 320 px: v ověřeném rozložení tři při 1440 px, dva při 820 px a jeden při 390/360 px. Při 1600 px zůstávají čtyři. Patička drží kompaktní odstup od spodku karty; karty nejsou roztahované pevnou výškou. Standardní desktopové karty bez čekající akce měří přibližně 202 px, řádek s akcemi přibližně 236 px; nejdelší ukázkový člen vyžaduje 244 px. Mobilní dlouhé údaje a dotykové akce mohou potřebovat více místa.

Příjezdy a historie používají tentýž prezentační základ miniatur a iniciál. Cesty médií se nezměnily: garážová fotografie, fotografie skutečného příjezdu a soutěžní fotografie nejsou nahrazovány jiným zdrojem. V samostatném LIVE zůstává původní markup miniatur Příjezdů.

Nastavení má oddělené existující logické celky a maximální šířku 1040 px. Číselná pole jsou na desktopu omezena zpravidla na 140 px, částky na 180 px a data na 200 px. Místo má maximálně 480 px. Na mobilu se formulář skládá do jednoho sloupce. Dashboard a jeho editor mají sjednocené rámečky, typografii a tlačítka; identifikátory karet, přesuny, kompozice a ukládání preferencí zůstávají.

## Zachované funkce a hranice

- Worker, API, schéma, migrace, oprávnění, sazby a obchodní pravidla se nemění.
- Vybraný ročník, registrace, LIVE a pozastavení Merche nebyly měněny v produkci.
- Bez produkčních zápisů, e-mailů, uploadů nebo volání CI.
- Hledání, obnova dat, otevření a návrat z detailu člena, Karty/Řádky a existující stavové akce zůstávají.
- Ukládání rozložení Přehledu, potvrzení zahození, ochrana konfliktů a obnova nejasného výsledku jsou ověřené původními testy.
- Nová prezentace nepřidává akce na Přehled ani formuláře. Malá úprava HTML pouze seskupuje existující kontext Nastavení.

## Cache a souborový rozsah

Token `20261014-admin1` platí pro nový stylesheet, změněné moduly a jejich nezbytné rodičovské importy. Nezměněné závislosti si ponechávají dosavadní tokeny. Admin graph kontroluje každou vstupní hranu; stejný modul se načítá jednou verzí URL.

V `admin/modules/live.js` se mění pouze import URL Příjezdů. V `admin.js`, `admin/command-cards.js`, `admin/dashboard.js`, `admin/member-detail.js`, `admin/member-presentation.js`, `admin/modules/accommodation.js`, `admin/modules/dashboard-events.js`, `admin/modules/moderation.js`, `admin/modules/reservations-payments.js` a obou dotčených mailing modulech se mění pouze návazné cache URL.

Přesný seznam 32 souborů této dávky:

- `admin.html`
- `admin.js`
- `admin/center-visual.css`
- `admin/command-cards.js`
- `admin/command-icons.js`
- `admin/command-shell.js`
- `admin/dashboard.js`
- `admin/member-cards.js`
- `admin/member-detail.js`
- `admin/member-presentation.js`
- `admin/modules/accommodation.js`
- `admin/modules/arrivals.js`
- `admin/modules/dashboard-events.js`
- `admin/modules/live.js`
- `admin/modules/mailing/contacts.js`
- `admin/modules/mailing/index.js`
- `admin/modules/moderation.js`
- `admin/modules/reservations-payments.js`
- `admin/shell.js`
- `docs/admin-center-visual-local.md`
- `scripts/admin-module-releases.mjs`
- `scripts/check-admin-module-graph.mjs`
- `tests/admin-card-media.test.mjs`
- `tests/admin-compact-cards.test.mjs`
- `tests/admin-information-architecture.test.mjs`
- `tests/e2e/admin-center-visual.spec.mjs`
- `tests/e2e/admin-command.spec.mjs`
- `tests/e2e/admin-compact.spec.mjs`
- `tests/e2e/admin-dashboard.spec.mjs`
- `tests/e2e/admin-member-cards-visual.spec.mjs`
- `tests/e2e/admin.spec.mjs`
- `tests/united-club-ux.test.mjs`

Mimo dávku zůstávají původní změna `docs/photo-upload-a3-a4-local.md`, nesledovaný `docs/project-audit-2026-10-09.md` a `scripts/audit-20261009/`. Ignorované diagnostiky v `test-results/` a `playwright-report/` jsou zachované. Index nebyl měněn.

## Cílené kontroly

Windows, Node 24.19.0, Playwright 1.62.1, existující Chromium a WebKit. Bez retries a přeskočených scénářů. Všechny API zápisy probíhaly jen nad izolovanou paměťovou SQLite přes skutečné handlery. Neznámá API, neočekávané konzolové chyby a page errors dál selhávají.

| Běh | PASS | FAIL | Rozsah |
| --- | ---: | ---: | --- |
| Cílený Node | 43 | 0 | Iniciály, bezpečné HTML, projekce členů, oddělení médií, vlastnictví URL, menu a zachované fronty |
| Chromium initial | 1 | 2 | Vlastní nová testovací inicializace motivu zasáhla sandboxový iframe; opraveno omezením na hlavní okno, bez ignorování chyby |
| Chromium matrix | 9 | 0 | Osm velikost/motiv kombinací a skutečné uložení Nastavení |
| Chromium functional | 24 | 1 | Jediné selhání: starý požadavek stejné pevné výšky všech mobilních karet |
| Chromium mobile final | 6 | 0 | 360/390 v obou motivech, opravená mobilní mřížka a oba kompletní scénáře členů za původní kontrolou |
| Chromium scope | 8 | 0 | Hledání/detail člena, pozdní odpovědi, mobilní návraty, tři průchody Admin Příjezdů a izolace LIVE stylů |
| WebKit functional | 24 | 0 | Celý vybraný cílený seznam menu, členů, médií a editoru Přehledu |
| Chromium final | 11 | 0 | Finální screenshoty s načtenými miniaturami, uložení Nastavení a izolace LIVE |
| Chromium navigation final | 14 | 0 | Finální osm vizuálních kombinací, Nastavení, LIVE izolace a tři navigační scénáře po odhalování aktivní položky |
| WebKit navigation final | 5 | 0 | Cílené ověření finálního mobilního pásu, menu, přímých odkazů, návratů a uvolňování médií |

Nejde o kompletní Node, Chromium ani kompletní projektový WebKit běh. Dílčí výsledky se nesčítají do fiktivního úplného průchodu.

Ověřené průchody: přepínání agend a aktivní navigace; přímé a historické odkazy; hledání člena a detail ze seznamu/vyhledání; zavření, mobilní Zpět a reload; přepnutí a zapamatování Karty/Řádky; zachování rozepsané platby i při detailu člena; průběžné hledání Příjezdů včetně IME, ručního retry, chyby, prázdného výsledku a opožděné odpovědi. Preference Přehledu zahrnují přesun boxu, velikost, nezávislé kompozice, uložení/reload, storno, potvrzený reset, stale revision a ztracenou odpověď.

Nastavení uložené přes skutečný event handler bylo porovnáno s databází a po reloadu. Před uložením obnova nepřepsala rozepsanou hodnotu místa. Osm vizuálních průchodů bylo read-only s nulou databázových zápisů; ukládání místa a preferencí je ověřené odděleně.

Syntax dotčených JS/MJS, Admin module graph (bez cyklů a chyb) a `git diff --check` prošly.

## Změny testových očekávání

Menu podle tohoto zadání již nemá rozbalovací tlačítko Komunita: testy vyžadují tři neinteraktivní skupiny, všechny původní cíle a stejné počitadlo skupiny. Merchandising patří před SPRÁVA/Nastavení. Mobilní menu se otevírá existujícím MENU; uzavření, fokus, Escape a backdrop se dál kontrolují.

Rozměr fotografie v kartě je po navazující grafické opravě 100 × 76 místo meziverze 88 × 68 (původně plná šířka × 112), v Řádcích zůstává 68 × 54. Přiměřeně hustá desktopová mřížka používá při 1600 px čtyři sloupce místo tří. Mobilní karty mají obsahovou výšku místo pevných 380 px: test kontroluje umístění veškerého obsahu v kartě a neoslabuje kontroly stavů, privátních médií ani pokračování do moderace. Stejná výška karet v desktopovém řádku zůstává ověřená. Navazující oprava v existujícím `admin-compact.spec.mjs` mění pouze očekávanou výšku fotografie z 68 na schválených 76 px.

Prohlídka screenshotů odhalila mobilní implicitní druhý sloupec kvůli původnímu span 2 u pole místa. Nová mobilní pravidla odstraňují tuto příčinu. Regrese ověřuje skutečně jediný sloupec a vzájemné nepřekrývání polí, nikoli jen šířku stránky.

## Navazující grafická oprava Členů

Grafická iterace 14. 10. měnila pouze `admin/center-visual.css`, `tests/e2e/admin-compact.spec.mjs`, nový `tests/e2e/admin-member-cards-visual.spec.mjs` a tento report. Ostatních 29 souborů zaznamenaného výchozího stavu tehdy zůstalo obsahově beze změny. Následné dokončení 15. 10. doplňuje opravu správce médií a popisku v `admin/member-cards.js`, jeho Node regrese a cílené browser ověření popsané níže. Menu, Nastavení, Přehled a Příjezdy se znovu neupravovaly. Nová CSS pravidla jsou omezena na karty v `[data-member-list]:not([data-member-view=rows])`. URL a token `20261014-admin1` zůstávají jednotné; závěrečná kontrola Admin graphu prošla.

Význam čekající akce byl ověřen v `admin/member-cards.js::pendingSummary` a serverové projekci `worker/admin/member-cards.js`: číslo je součet čekajících registrací vybraného ročníku, historické účasti, historického S&S a komunitních fotografií. Jde o počet kontrolních položek, ne počet lidí; účast a S&S jedné historické žádosti mohou přispět po jedné. Přednost cíle zůstává Registrace → Historie (účast/S&S) → Fotky. Nejde o sloučení front. Původní nejasné „Čeká: N →“ je při dokončení nahrazené „Ke kontrole: N →“, včetně přístupného názvu. Popis jednotlivých složek, oprávnění, počty i handler zůstávají. Graficky jde o sekundární obrysovou akci bez žluté výplně, s textem 13 px a dotykovou výškou 44 px na mobilu.

Nová vizuální regrese používá osm členů v izolované paměťové SQLite, skutečné handlery seznamu, detailu a privátních médií a existující optimalizovanou repo fotografii. Nezakládá produkční účty. Kontroluje dlouhé údaje, různé registrační stavy, všechny tři cíle čekajících akcí, fallback, plný přístupný název a detail, Řádky/preference i obnovu. V osmi vizuálních průchodech nebyl žádný databázový zápis. Kontroly konzole, page errors a neznámých API nejsou potlačené.

| Běh navazující opravy | PASS | FAIL | Rozsah |
| --- | ---: | ---: | --- |
| Chromium první vizuální kontrola | 0 | 2 | Chyba nové metriky: vzdálenost patičky 19 px obsahuje 18 px padding a 1 px border. Assertion opravená podle skutečně měřeného borderu, bez zvýšení tolerance. |
| Cílený Node | 7 | 0 | `admin-compact-cards.test.mjs`, `admin-card-media.test.mjs`: bezpečné HTML, údaje, priority čekání, vlastnictví URL, opožděné odpovědi a decoder |
| Chromium vizuální matice | 8 | 0 | 1440/820/390/360 px × oba motivy, osm členů; screenshoty skutečně otevřené a prohlédnuté |
| Chromium existující regrese | 4 | 0 | Oba celé průchody Členové → detail → čekající Historie → schválení → čekající Registrace, uvolnění médií/návrat a hledání/detail člena |
| WebKit existující regrese | 2 | 1 | Desktopový členský průchod a uvolnění médií/návrat prošly. Mobilní průchod dokončil funkční assertions, ale závěrečná kontrola konzole zachytila blob resource error. |

Všechny tyto běhy mají 0 skipped a 0 retries. První prohlídka také odhalila zděděných 10,4 px textu čekající akce z `.admin-badge`; pouze v členské kartě je nyní explicitních 13 px, které nová regrese měří. Tato iterace neopakovala testy Nastavení, editoru Přehledu ani menu.

Původní trace WebKit zachytil při přímém návratu z Historie do Členů (`page.goto`, čas 5106,180 ms) úspěšný image request na privátní blob (HTTP 200, WebP 487240 B), následný druhý požadavek stejného blob URL typu `ping` se stavem -1 a v čase 5203,276 ms konzolové `Failed to load resource`. Samotný trace tehdy nestačil určit příčinu. Následná řízená regrese 15. 10. doložila chybnou životnost URL, viz dokončení níže; nejde o ignorovanou konzolovou výjimku.

Diagnostika: `test-results/member-cards-refine-webkit-20261014/admin-compact-COMPACT-memb-081c2-ority-and-history-cards-390-webkit/trace.zip` a `error-context.md`. Vizuální matice a geometrie jsou v `test-results/member-cards-refine-matrix-20261014/` a odpovídajícím JSON reportu. Syntax dvou MJS změněných touto iterací a `git diff --check` jsou ověřené samostatně; žádná celková sada ani CI se nespouštěly.

## Dokončení médií a patiček 15. října

`createCardMedia()` čekal pouze na `Image.decode()`. Měření v reálném WebKit ukázalo, že decoder mohl vyřešit promise ještě před obsloužením zdrojového `load`. Správce poté odstranil `src` decoderu a při opuštění Historie mohl blob URL zrušit, aniž tento spotřebitel doběhl. Regrese ve skutečném rozhraní drží doručení nativního `load`, během něj odejde z Historie do Členů a kontroluje životnost URL. Původní tělo správce, dodané pouze izolovanou testovací route, prokazatelně selhalo: URL již byla revoked před uvolněním bariéry. Stejně selhala nezávislá Node regrese se skutečným zdrojem správce. Není potřeba měnit Worker ani datové zdroje.

Oprava čeká na skutečný výsledek `load`/`error` i `decode()`. Opuštěný seznam nedostane pozdní obrázek a jeho URL se uvolní právě jednou po dokončení zdrojového spotřebitele. Selhání zdroje se nepromění v úspěšnou fotografii. Zůstává abort požadavku, vlastnictví podle seznamu, ochrana účtu/relace, odpojení DOM spotřebitelů před revoke i nulové neočekávané chyby. Bez timeru, retry nebo ignorování konzole. Podobné riziko předčasného revoke popisuje i [upstream Playwright](https://github.com/microsoft/playwright/issues/33794); rozhodujícím důkazem pro tuto dávku je místní řízená regrese.

Finální kontrola osmi členů ověřila spodní zarovnání patiček: poslední skutečný prvek je 19 px od vnějšího spodku (18 px padding + 1 px border). V desktopovém řádku mají poslední prvky shodnou spodní hranu i při kombinaci karet s akcí a bez ní. U delšího kontaktu se karta přirozeně prodlouží; neukrývá údaje. Rozdělení stavů a akce do řádků je podle obsahu. Zpřesnění „Ke kontrole“ mění pouze prezentaci, nikoli součty/fronty.

| Cílená kontrola 15. 10. | PASS | FAIL | Výsledek |
| --- | ---: | ---: | --- |
| Node řízená regrese před opravou | 0 | 1 | Prokazatelná mezera mezi decode a load: URL byla zpřístupněná před dokončením zdroje |
| WebKit řízená regrese s původním správcem | 0 | 1 | Předčasné revoke během Historie → Členové, očekáváno false / skutečnost true |
| WebKit původní členské průchody a první regrese | 3 | 1 | Původní mobil/desktop i uvolnění/návrat prošly. Nová regrese nejprve nespustila lazy obrázek mimo viewport; opravený vstup ho výslovně odhalí, bez čekání na dokončení load. |
| Chromium a WebKit řízená regrese po opravě vstupu | 2 | 0 | Držený load, přechod, uvolnění právě jednou, Back a nová fotografie |
| Node karty/média první společný běh | 8 | 1 | Nová assertion opomenula HTML entitu `S&amp;S`; opravené očekávání zachovává bezpečné escapování |
| Node karty/média finální | 9 | 0 | Oba přímo dotčené soubory, včetně source error a ochrany opožděných odpovědí |
| Chromium existující členské průchody | 3 | 0 | Mobil/desktop, schválení Historie, nové počty, Registrace/reload, soukromá média a Back |
| Chromium finální patičky/popisek | 1 | 0 | Osm členů, 1440 světlý a 390 tmavý, 0 zápisů, geometrie a otevřené screenshoty |
| Chromium a WebKit finální řízená regrese | 2 | 0 | Bariéra nezávislá na opravě; původní správce předčasné revoke stále odhalí |

Všechny cílené běhy mají 0 skipped a 0 retries. Pomocné izolované diagnostiky a protokol jsou v ignorovaném `test-results/member-media-diagnostic-20261015/` a souvisejících adresářích. Dva diagnostické procesy bez zvýšených oprávnění byly po dokončení těla testu ukončeny při teardownu; nejsou započítané jako úspěšné běhy. Tři minimální pokusy s inspekcí samotného blobu chybu nevyvolaly a nejsou důkazem opravy. Vizuální matice ani celé lokální sady nebyly opakovány. Syntax změněných JS/MJS, Admin graph 63 modulů bez chyby/cyklu a whitespace kontrola prošly.

Aktuální screenshoty po změně popisku:

- [Desktopové patičky a Ke kontrole](../test-results/member-footer-final-20261015/admin-member-cards-visual--4a237-t-and-explicit-review-label-chromium/final-members-1440-light.png)
- [Mobilní karty a Ke kontrole](../test-results/member-footer-final-20261015/admin-member-cards-visual--4a237-t-and-explicit-review-label-chromium/final-members-390-dark.png)

## Screenshoty a omezení

Aktuální členské screenshoty jsou v `test-results/member-cards-refine-matrix-20261014/`; ostatní agendy zůstávají ve `test-results/admin-center-navigation-final-20261014/`. Byly otevřeny a prohlédnuty desktopové, tabletové i mobilní výstupy v obou motivech, včetně dlouhého jména/e-mailu, chybějící fotografie a různých stavů. Řádky, historie a otevřený editor mají zachované předchozí kontroly. Mobilní členské karty nepřetékají a neukrývají e-mail, stav ani čekající akci.

- [Členové desktop světlý](../test-results/member-cards-refine-matrix-20261014/admin-member-cards-visual--a2aaa-card-composition-1440-light-chromium/members-grid.png)
- [Členové desktop tmavý](../test-results/member-cards-refine-matrix-20261014/admin-member-cards-visual-Members-card-composition-1440-dark-chromium/members-grid.png)
- [Členská karta mobil světlý](../test-results/member-cards-refine-matrix-20261014/admin-member-cards-visual-Members-card-composition-390-light-chromium/member-long.png)
- [Členská karta mobil tmavý](../test-results/member-cards-refine-matrix-20261014/admin-member-cards-visual-Members-card-composition-390-dark-chromium/member-long.png)
- [Nastavení desktop světlý](../test-results/admin-center-navigation-final-20261014/admin-center-visual-ordinary-Admin-visual-1440-light-chromium/settings.png)
- [Příjezdy desktop tmavý](../test-results/admin-center-navigation-final-20261014/admin-center-visual-ordinary-Admin-visual-1440-dark-chromium/arrivals.png)
- [Editor Přehledu desktop tmavý](../test-results/admin-center-navigation-final-20261014/admin-center-visual-ordinary-Admin-visual-1440-dark-chromium/dashboard-editor.png)
- [Členové tablet tmavý](../test-results/member-cards-refine-matrix-20261014/admin-member-cards-visual-Members-card-composition-820-dark-chromium/members-grid.png)
- [Nastavení tablet světlý](../test-results/admin-center-navigation-final-20261014/admin-center-visual-ordinary-Admin-visual-820-light-chromium/settings.png)
- [Nastavení mobil světlý](../test-results/admin-center-navigation-final-20261014/admin-center-visual-ordinary-Admin-visual-390-light-chromium/settings.png)
- [Členové 360 px tmavý](../test-results/member-cards-refine-matrix-20261014/admin-member-cards-visual-Members-card-composition-360-dark-chromium/members-grid.png)
- [Editor Přehledu mobil světlý](../test-results/admin-center-navigation-final-20261014/admin-center-visual-ordinary-Admin-visual-360-light-chromium/dashboard-editor.png)

Browser-act CLI ani uv nejsou dostupné; vizuální kontrola použila existující projektový Playwright. Fyzické zařízení, mobilní klávesnice a přihlášený produkční průchod nebyly ověřovány. Žádná celková sada ani CI nebyly spouštěny. Backendová závislost nevznikla.
