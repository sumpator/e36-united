# CI #109 — cílená stabilizace historie a mailingu

11. 10. 2026; výchozí HEAD `5dafa2d5a5613968600ee4340b3eb76236454e6b`. Pouze lokální změny, bez commitu, pushnutí, CI rerunu nebo nasazení.

## Důkazy

Přečten log [CI #109](https://github.com/sumpator/e36-united/actions/runs/38147751130): Node 555/555 PASS, syntax PASS, Chromium 306 PASS / 3 FAIL, WebKit přeskočen. Stažen artefakt `browser-chromium-38147751130-1`, ID `11705746415`, do ignorovaného `test-results/ci109-artifact.zip` a rozbalen do `test-results/ci109-artifact/`. Otevřeny všechny tři failure screenshoty; přečteny jejich error-contexty, záznamy akcí, výsledky evaluate a DOM snapshoty trace.

SHA256 staženého ZIPu `ff65f6478652a9929aff616b89de4d1332b8dc2920e86268154a6246e0f903fa` odpovídá digestu v CI logu.

- Historie: 1366 × 768, tmavý motiv. Trace zaznamenává `expected:2025 / actual:2024`, další vzorek již `2025 / 2025`. Konečný failure screenshot je až po návratu na první sekci, nikoli screenshot samotného nesouladu.
- Oba mailing průchody: 390 × 960, tmavý motiv, `data-mobile-pane=editor`, před přepnutím na náhled. První při novém konceptu, druhý po uložení „Izolovaný UX koncept“. Selhává stejná původní kontrola šířky dokumentu. Desktopové captures v prvním CI scénáři prošly.

## Historie — kombinace aplikační a testovací příčiny

`main.js / updateHistoryProgress` vybírá poslední sekci s horní hranou nejvýše na `header.bottom + 70`. Pravidlo zůstává beze změny. `.timeline-entry.reveal` však animuje svislý transform 18 px → 0 po dobu 0,7 s. Sekce tak může překročit čtecí hranici **po** scroll události. Původní listener přepočítával rok při scrollu, resize, načtení obrázku a změně velikosti historie; změna pouze transformu ResizeObserver nespouští. Rok proto může zůstat chybný i po ustálení, dokud nenastane další událost.

Izolované porovnání stejných dat s původním listenerem a s opravou je v `test-results/ci109-history-proof.json` (skript používá původní obsah main.js jen jako lokální route odpověď, nepřepisuje soubor). Příklad: hranice 153 px, sekce 2011 před animací top 161,09 px / translateY 18; po dokončení top 143,09 px / translateY 0. Původně zůstává 2007, s opravou správně 2011. Původní varianta měla šest nesouladů v osmi diagnostických zastaveních, opravená žádný.

**Oprava:** třířádkový listener `transitionend` pro transform `.timeline-entry` volá existující přepočet. Nevzniká polling ani nové pravidlo aktivního roku. Test dříve četl po dvou requestAnimationFrame, což negarantuje dokončení animace; navíc jednou předem nasnímané pozice mohly zestárnout. Nyní používá aktuální pozici každé sekce, dokončení fontů/obrázků a všech navazujících animací, následně čeká na shodu se stejným geometrickým pravidlem. Bez pevného sleep nebo navýšení timeoutu. Kontroluje všechny sekce oběma směry, přímý přesun na konkrétní rok a nulové neočekávané klientské/API chyby.

## Mailing — společná aplikační příčina obou selhání

`portal-workspace.css` nastavuje čtyřem akcím v hlavičce každého bloku minimálně 44 px, ale původní flex hlavička nezalamuje. Hlavička „Zvýraznění“ má nejdelší název. Její min-content šířka se přes implicitní auto sloupce `.admin-mailing-block-list` a `.admin-mailing-editor` promítá do šířky všech karet. Příčinou není iframe ani select; diagnostické skrytí přidávání bloků přesah neodstranilo, skrytí skupiny akcí ano. Produkční oprava žádnou akci neskrývá.

Oba archivované DOM snapshoty byly izolovaně rekonstruované se zaznamenanými CSS prostředky. **Následující rozměry jsou lokální přehrání na Windows, nikoli vymyšlené původní Linuxové hodnoty:**

| Prvek | Před opravou | Po cílené layout opravě |
| --- | --- | --- |
| viewport | 390 px | 390 px |
| workspace / editor-layout | 358 px, left 16 / right 374 | 358 px |
| form | rámeček 358 px, implicitní track 368,03 px, scrollWidth 368 | track / scrollWidth 358 px |
| obsahová karta | 368,03 px | 358 px |
| block-list | 328,03 px | 318 px |
| hlavička „Zvýraznění“ | 326,03 px | přizpůsobuje se dostupné šířce |
| název + číslo / skupina akcí | 102,03 / 188 px; dalších 12 px gap + 24 px padding | akce mají stejné rozměry, mohou na další řádek |

Tento přehrávaný Windows dokument ještě měl scrollWidth 390: vnitřní přesah se vešel do vnější mezery. To vysvětluje, proč původní dva mailing testy lokálně prošly, a není to důkaz opravy. Původní Linux trace ukládá pouze výsledek `false`, nikoli přesný číselný scrollWidth či původní computed rozměry. Přesné Linuxové rozměry tedy nejsou ověřené.

**Oprava:** pouze v mailing workspace explicitní sloupce `minmax(0,1fr)` a nulové automatické minimální šířky formu, seznamu bloků, karet a bloků; do existujícího breakpointu 850 px přidáno zalamování hlavičky. Názvy, velikost písma a všechna čtyři 44px tlačítka zůstávají. Žádné nové overflow:hidden, ořezávání nebo změna tolerance. Stávající vlastní kontejner iframe a jeho přepínání Desktop/Mobil zůstávají; nově ověřeny oba režimy a rozměry iframe vůči rodiči.

Capture stále vyžaduje `document.scrollWidth <= innerWidth + 1`. Navíc kontroluje vnitřní scrollWidth viditelných kontejnerů a rámečky hlavičkových akcí/iframe vůči rodičům; přikládá přesné layout JSON. Nejde pouze o zelený výsledek dokumentu s přetékajícím vnitřním obsahem.

## Přesné dokončené browser běhy

Vždy pouze trojice: historie, Final compact workspace layouts, accommodation/year/campaign **390**. První workspace scénář sám ověřuje také 1440 px; ostatní testy souborů neběžely.

| Ignorovaný output | Engine | PASS | FAIL | Význam |
| --- | --- | ---: | ---: | --- |
| `ci109-before` | Chromium | 2 | 1 | nezměněná trojice; historie lokálně 2015 vs 2011, mailing lokálně bez celostránkového přesahu |
| `ci109-after1` | Chromium | 3 | 0 | první aplikační/testovací opravy |
| `ci109-final-chromium` | Chromium | 3 | 0 | přísnější vnitřní šířky a přepnutí náhledu; 19,4 s |
| `ci109-final-webkit` | WebKit | 3 | 0 | stejné cílené scénáře; 26,2 s |
| `ci109-final2-chromium` | Chromium | 3 | 0 | finální cache, čekání na všechny navazující animace a screenshot postižené hlavičky; 22,8 s |
| `ci109-final2-webkit` | WebKit | 3 | 0 | finální stejná trojice; 29,3 s |

Všechny dokončené běhy měly 0 skipped a 0 retries. Výsledky nejsou vydávané za kompletní browser suite. Úvodní pokus přes `node_modules/playwright/cli.js` skončil při discovery chybou dvou instancí runneru („did not expect test() to be called here“), **0 spuštěných scénářů**. Existující vstup `node_modules/@playwright/test/cli.js` problém odstranil bez změny závislostí.

WebKit projekt v CI tyto dva soubory standardně neobsahuje; pro požadovanou cílenou kontrolu vznikla pouze ignorovaná `test-results/ci109.config.mjs`, která používá původní nastavení a dočasně vybere tyto soubory. CI workflow ani projektová konfigurace se nemění.

Syntax `main.js` a dvou změněných MJS: PASS. `git diff --check`: PASS. Celá Node ani browser sada se neopakovala.

Skutečně otevřeny nové screenshoty editoru, náhledu a konkrétní hlavičky „Zvýraznění“ v obou motivech na 390 a 1440 px. Mobilní dlouhá hlavička má název nahoře a kompletní akce níže; desktop zůstává v řádku. Ověřeny i původně nedosažené kroky: světle vykreslený koncept, přepnutí mobilního pracovního pohledu, Desktop/Mobil preview, uložení izolovaného konceptu, oba směry historie a přímý přechod na rok. Souhrny nezaměňují testovací SVG náhradní fotografie za produkční vizuální ověření.

## Prostředí, cache a hranice

- Stejná verze Playwright 1.62.1 jako v CI; lokálně dostupné Chromium revision 1234 (151.0.7922.34), WebKit revision 2336 (26.5), Node 24.19.0. Windows, nikoli Ubuntu CI. WSL není použitelné, Docker není dostupný; nic se neinstalovalo. Linuxové finální ověření zůstává neprovedené.
- Cache `20261011-ci109`: main.js ve čtyřech existujících veřejných vstupech; portal-workspace.css v Adminu a Memberu. Kontrola všech šesti URL PASS. Importy a nezměněné závislosti si ponechávají původní jednotné verze.
- Změněno: `main.js`, `portal-workspace.css`, dva dotčené E2E soubory, cache URL v `admin.html`, `member.html`, `index.html`, `o-nas.html`, `galerie.html`, `merch.html` a tento report.
- Původní nesledované `docs/project-audit-2026-10-09.md` a `scripts/audit-20261009/` zůstávají beze změny mimo dávku. Nové diagnostiky a artefakt jsou v ignorovaném test-results.
- Žádné změny Workeru, databáze, oprávnění, obchodních pravidel, cen, závislostí nebo CI; žádné produkční zápisy, e-maily, uploady nebo přepnutí služeb. Lokální mailing preview/save používají izolované testovací prostředí, nikoli skutečné odeslání.

Dávka je lokálně připravena; není commitnutá ani publikovaná. Neověřené jsou finální Linux CI, skutečné zařízení a produkční autentizovaný průchod. Nový obecný audit ani opravy serverových limitů fotografií nebyly prováděny.
