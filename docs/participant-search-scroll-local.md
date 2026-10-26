# Hledání účastníků — fyzický rozsah scrollu (2026-10-26)

Výchozí commit: `e8b2c76d3247f313d4d851c4314bcc231544ce26`.
CI #124, pokus 2: https://github.com/sumpator/e36-united/actions/runs/40304836079/attempts/2

## Prokázaná příčina: nesprávný předpoklad testu

`tests/e2e/participant-search.spec.mjs:88` vyžadoval absolutně stejný `scrollY` i po zkrácení dokumentu pod původní pozici. Při viewportu 1440 × 900 má stránka s jedním výsledkem výšku **1051 px**, tedy maximální posun **151 px**. Očekávaných **184 px** již není dosažitelných. Kód hledání přitom záměrně zachovává samotné pole i dosavadní karty při načítání; není důvod doplňovat do aplikace prázdné místo nebo zásah do scrollování.

Existující log i trace byly znovu přečteny. Použit artefakt `browser-chromium-40304836079-2`, ID `12653143538`, ověřený SHA-256 `620a8704098227c0c92fd23edd5e0bb6ef51c9be1142c0dab0f5e94bd17d52a8`. Trace potvrzuje původní měření 184 a 151; sama neobsahuje scrollHeight. Rozsah proto byl přímo změřen řízeným lokálním průchodem, nikoli odhadnut ze screenshotu.

| Stav při dotazu na jediný výsledek | scrollY | scrollHeight | clientHeight | Maximum | Input top–bottom | Pozice inputu v dokumentu |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| Před hledáním | 184 | 7059 | 900 | 6159 | 130–174 | 314 |
| Před spuštěním požadavku po 299 ms debounce | 184 | 7059 | 900 | 6159 | 130–174 | 314 |
| Zadržená skutečná odpověď, loading a původních 52 karet | 184 | 7111 | 900 | 6211 | 130–174 | 314 |
| Jedna karta a načtená fotografie | 151 | 1051 | 900 | 151 | 163–207 | 314 |

Fokus zůstával na stejném inputu, výběr textu `6–6`, fonty načtené. Předchozí stav byl ustálený; nejde o odečet před dokončením pozdního fokusu. Souřadnice pole v dokumentu zůstává 314, rozdíl ve viewportu přesně odpovídá omezení scrollu o 33 px. Čtení příslušného search handleru neukázalo volání focus/scroll v této aktualizaci. Během loadingu se scroll nezměnil; omezil se až při zkrácení skutečného obsahu.

Kontrolní dotaz `search0` vrátí 10 skutečných výsledků. Po aktualizaci: **scrollHeight 1772, clientHeight 900, maximum 872, scrollY stále 184**, input stále 130–174 a stejná pozice 314 v dokumentu. Neprodlužuje se uměle stránka a nepřidává se prázdné místo.

## Oprava pouze testu

- Původní assertion nahrazena přesnou kontrolou `min(původní posun, nový maximální posun)` jen v dotčeném průchodu hledání. Pokud je původní pozice stále možná, musí zůstat přesně stejná. Žádná tolerance ±px.
- Navíc se ověřuje neměnná pozice inputu v dokumentu a jeho úplná dostupnost ve viewportu. Kontroly identity inputu, fokusu, kurzoru, e-mailu, debounce, Enter/Hledat, ručního opakování a vymazání se zachovaly.
- Dvě řízené regrese používají původní izolované handlery a skutečné sady 1/10 výsledků. Na skutečném dlouhém seznamu záměrně nastaví nenulový posun 184 (nenulují stránku, aby skryly chybu). Zadrží jen odpověď hledání, zkontrolují původní karty a stabilní scroll a pak ji výslovně uvolní. Ověří všechny výsledné fotografie, zachování pole a vymazání dotazu.
- Aplikační kód, schéma, pravidla ani cache URL se nezměnily. Nevytváří se obecná správa scrollování. Oprava autofokusu garáže zůstává zachovaná.

## Přesné lokální výsledky

Windows, Node 24.19.0, Playwright 1.62.1. WebKit byl spuštěn přes ignorovanou lokální konfiguraci pouze pro tento soubor; trvalá konfigurace/workflow a výběr CI se neměnily. Linux zde není dostupný.

| Běh | Chromium | WebKit | Význam |
| --- | --- | --- | --- |
| Úzká instrumentace bez nastavení nenulového posunu | 1 PASS | neproveden | Původní assertion prošla při 0; není to důkaz opravy |
| Řízená reprodukce s původní assertion | 1 FAIL | neproveden | Přesně očekáváno 184, získáno 151; měření v tabulce výše |
| První cílený výběr 3 existujících kontextů + 2 nové regrese | 4 PASS / 1 FAIL | 4 PASS / 1 FAIL | Všechny 3 původní scénáře i clamp regrese prošly; chybný nový předpoklad, že menší viewport zvětší výsledný rozsah nad 184. Minimum výšky layoutu drželo maximum 151 i při 640 px. Nahrazeno skutečnou sadou 10 výsledků |
| Následný výběr 2 změněných regresí | 1 PASS / 1 FAIL | 1 PASS / 1 FAIL | Nová větev 10 výsledků správně měla 10 obrázků; původní singulární locator byl nejednoznačný. Nahrazen kontrolou přesného počtu a načtení všech obrázků, bez `.first()` |
| Konečný výběr 2 změněných regresí | **2/2 PASS** | **2/2 PASS** | Obě větve, včetně zachování nenulového dosažitelného posunu, prošly |

Tři původní funkční scénáře (Show & Shine 390, LIVE Příjezdy 820, Admin Příjezdy 1440) mají pro každý engine PASS z prvního cíleného výběru a následně se neměnily. Nejde o nový úplný pěti-testový běh konečné verze ani o celou browser sadu. Po každé prokázané chybě nové regrese opakovány pouze dotčené regrese. Žádné retries, pevné sleepy, force kliknutí, zvýšení timeoutů ani potlačení neočekávaných chyb.

Syntax změněného MJS a `git diff --check`: PASS. Node testy a celé browser projekty lokálně neopakovány. Diagnostiky zůstávají ignorované pod `test-results/participant-scroll-*`; JSON konečných běhů obsahuje přílohy `search-scroll-range`.

## Publikace a hranice

Publikační rozsah: pouze `tests/e2e/participant-search.spec.mjs` a tento report. Mimo commit zůstává původní report A3/A4, `docs/ci-124-webkit-investigation-local.md`, audit a diagnostiky. Výsledky automatického CI/Pages pro nový commit se předají po publikaci samostatně. Protože produkční assety zůstaly stejné, cache URL ani jejich HTTP kontroly se neopakují.

Bez Worker deploymentu, migrace, produkčních zápisů, e-mailů, uploadů a změn provozních nastavení. Třetí pokus původního CI #124 nebyl spuštěn. Původní WebKit incident zůstává samostatně **neobjasněný**; tato oprava testu scrollu není jeho opravou.
