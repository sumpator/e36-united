# Obsahová aktualizace Merche a historie O nás

Původní lokální příprava z 21. října 2026 nad `a03aa9c27ce912f6213e3d1dfa757ab6d5bb71fe` byla ověřená v paměťové D1/R2 náhradě přes skutečné administrační handlery. Následně majitel výslovně schválil publikaci souborů, dva produkční uploady a dva produkty. Stav dokončeného produkčního katalogu je zaznamenaný níže; původní výsledky lokálních testů zůstávají oddělené a nebyly opakované.

## Produkty a fotografie

Majitel v navazující odpovědi výslovně potvrdil **oba produkty unisex**. Nezbývá chybějící produktový parametr.

| Produkt a stabilní ID | Varianta | Originál | Cena a velikosti |
| --- | --- | --- | --- |
| Not Fast, Not Furious — `not-fast-not-furious` | `not-fast-not-furious-dark-grey` | `IMG_0617.jpeg` | 690 Kč; S, M, L, XL |
| Sweetest Things — `sweetest-things` | `sweetest-things-dark-grey` | `IMG_0618.jpeg` | 690 Kč; S, M, L, XL |

Kategorie je existující `Trička`, barva Tmavě šedá, podtitulek Unisex tričko. Každý produkt má jednu barevnou variantu se čtyřmi velikostmi, nikoli čtyři duplicitní varianty. Stejná fotografie je dostupná pro každou velikost. Stručné popisy a schválené hodnoty obsahuje `content/merch-20261021.json`. Jde o podklad pro Admin, **ne druhý runtime katalog**; žádný frontend ani Worker jej neimportuje.

Dostupnost `available` odpovídá dosavadnímu režimu katalogu, bez smyšlených skladových počtů. Stav produktu je `published`, ale globální pozastavení zůstává nezávislé a objednávku blokuje. Unisex podle existujícího filtru patří do Pánské i Dámské. Materiál, gramáž ani dodací lhůta nebyly doplněny.

Originály jsou zachované bitově shodně v `assets/images/merch/originals/`. Stávající `scripts/prepare-merch-images.mjs` umí vybrat pouze dvě nové fotografie pomocí `--only=not-fast-not-furious-dark-grey,sweetest-things-dark-grey`; žádný starší export se nepřegeneroval. Vznikly čtvercové WebP 480 px / 1000 px / 1254 px, bez zvětšování, ořezu či přebarvení. Použitá kvalita je dosavadních 84 / 84 / 90. Pro pozdější Admin upload jsou připravené celé `*-zoom.webp`: 200 212 B a 175 534 B. Existující R2 cesta používá tento jeden soubor pro kartu, detail i zvětšení; nepřidával se nový obrazový mechanismus.

## Historie

`content/history-20261021.json` zachovává přesné původní i nové přiřazení:

- 2025: nový `onas_2025.jpg`, lokální WebP 480/960/1600 px se srcset. Originál je v `assets/images/about/originals/`. Výřez má pozici 30 % vodorovně; hlavní kabriolet zůstává celý a dobře viditelný na 1440 i 390 px.
- 2026: přesně původní zdroj roku 2025, `595239_230b2b99d02e4866971d9d929f3d3948~mv2.jpg/.../u36_1.jpg`, místo předchozího `595239_ef82600a.../u36_2.jpg`. Původní veřejný snímek byl stažen a prohlédnut ještě před změnou přiřazení. Jeho kopie v `tests/fixtures/content-20261021/previous-2025.jpg` zajišťuje deterministický browser test bez externí sítě.

Porovnání celé stránky po vynechání právě těchto dvou značek `img` je shodné s výchozím stavem. Texty, ročníky, pořadí, hlavička i ostatní fotografie jsou beze změny. Konverzi nového historického snímku opakuje `scripts/prepare-about-2025-image.mjs` s existujícím Sharp přes `SHARP_MODULE`. Nové názvy assetů tvoří nové cache URL; žádný běhový JS/CSS modul se neměnil a jeho token se nezvyšoval.

## Cílené ověření

Windows, Node 24.19.0, Playwright 1.62.1, Chromium. Bez retries, skipped a potlačování neočekávaných chyb. Browser-act ani uv nejsou dostupné; použil se existující projektový Playwright, bez instalace dalších závislostí.

| Běh | PASS | FAIL | Význam |
| --- | ---: | ---: | --- |
| `merch-content-20261021.test.mjs` | 4 | 0 | Skutečný upload/save/public media, opakování bez duplicit, odmítnutí přepsání odlišného produktu, všechny velikosti/ceny, body, mapování historie |
| Existující `merch-commerce.test.mjs`, vybrané tři testy | 3 | 0 | Soukromí/publikace médií, unikátní varianty, serverová sleva a doprava |
| Obsahové Chromium první pokus | 0 | 4 | Existující testovací bridge chybně směroval veřejné R2 fotografie do objednávkového handleru a dostával 404 |
| Obsahové Chromium po opravě bridge | 4 | 0 | Celé průchody 1440/390 px × světlý/tmavý motiv |
| Existující Chromium Admin katalog/adresy/platby | 1 | 0 | Zachování návazného průchodu sdílené fixture |
| Obsahové Chromium finální screenshoty | 4 | 0 | Stejné čtyři celé scénáře; obě nové karty spolu a detail od začátku scrollu |

Oprava `tests/e2e/merch-bridge.mjs` používá pro GET `/api/merch/media/…` skutečný `publicMerch`, stejně jako pro veřejný katalog. Nevrací náhradní úspěšný obrázek; chybějící nebo neveřejný soubor dál vrací 404. Aplikační router se neměnil.

Izolovaný základ měl šest produktů; po obou provedeních přípravy má osm produktů a právě dvě nová média. Původní produktové řádky zůstaly bitově shodné. Druhé provedení nezvýšilo revize ani počet médií a auditních zápisů. Odlišný existující produkt se nepřepisuje. Kontrola cizích klíčů prošla. Hlavní náhled zachovává přesný konfigurační řádek s `paused:true`, `ready:false`, nulou objednávek a nulou outbox zpráv; server odmítl cenový požadavek pro pozastavený prodej. Košík pro dvě trička ukazuje 1 380 Kč a nedovoluje pokračovat k objednávce.

Samostatná běžná cenová fixture byla pouze v paměti otevřená pro `quotation`: osm kombinací produktu/velikosti = 5 520 Kč, každá jednotka 690 Kč. Při čistě testovací sazbě 10 % a 12 bodech server vrátil slevu 552 Kč a nezměnil body. Tato sazba, bankovní údaje ani otevření testovací fixture nejsou součástí obsahové dávky a nepřenášejí se do produkce.

Syntax všech šesti dotčených MJS a `git diff --check`: PASS. Celá Node/browser sada, WebKit ani CI se nespouštěly. Fyzický telefon a přihlášený produkční průchod nebyly ověřované.

## Screenshoty

Katalog, oba detaily a košík v obou motivech na 1440 a 390 px byly otevřené a prohlédnuté. Stejně byly prohlédnuté oba změněné historické snímky na obou šířkách a v obou motivech. Bez deformací a vodorovného přetékání. Obrázky i produktové rámy zůstávají současné, včetně bílého pozadí dodaných triček.

Finální katalog/detaily/košík jsou pod `test-results/content-20261021-browser-review/`; historie byla prohlédnutá také v předchozím úspěšném `test-results/content-20261021-browser-final/`. Odpovídající adresáře mají koncovky `1440-light-chromium`, `1440-dark-chromium`, `390-light-chromium` a `390-dark-chromium`. Soubory jsou `catalog.png`, `detail-not-fast-not-furious.png`, `detail-sweetest-things.png`, `detail-options-*.png` (mobil), `cart-paused.png`, `history-2025.png` a `history-2026.png`.

- [Katalog desktop světlý](../test-results/content-20261021-browser-review/content-20261021-Content-b-aec5b-ails-and-history-1440-light-chromium/catalog.png)
- [Katalog mobil tmavý](../test-results/content-20261021-browser-review/content-20261021-Content-b-145e3-etails-and-history-390-dark-chromium/catalog.png)
- [Not Fast detail desktop](../test-results/content-20261021-browser-review/content-20261021-Content-b-aec5b-ails-and-history-1440-light-chromium/detail-not-fast-not-furious.png)
- [Sweetest detail mobil](../test-results/content-20261021-browser-review/content-20261021-Content-b-145e3-etails-and-history-390-dark-chromium/detail-sweetest-things.png)
- [Historie 2025 desktop](../test-results/content-20261021-browser-final/content-20261021-Content-b-aec5b-ails-and-history-1440-light-chromium/history-2025.png)
- [Historie 2026 mobil](../test-results/content-20261021-browser-final/content-20261021-Content-b-145e3-etails-and-history-390-dark-chromium/history-2026.png)

## Schválený postup publikace

1. Zkontrolovat současný Admin katalog a potvrdit zachované pozastavení. Vyhledat oba stabilní produktové a variantní identifikátory z manifestu. Existující shodné položky znovu nezakládat ani znovu nenahrávat jejich fotografie; při odlišných údajích zastavit a řešit konkrétní rozdíl. Nespouštět seed ani reset celého katalogu.
2. Přes současný autorizovaný Admin upload `/api/admin/merch/media` nahrát pouze dva připravené `*-zoom.webp`, pokud ještě nejsou přiřazené hotovým produktům. Uložit vrácené `r2:…` reference. Poté přes stávající editor / PUT `/api/admin/merch/products` založit dva produkty s přesnými ID a parametry z manifestu. Metadata `imageFile`/`originalFile` nejsou API pole: variantě náleží skutečné vrácené `image`. Pořadí přidat za aktuální katalog; každá barevná varianta sdílí fotografii pro všechny čtyři velikosti. Žádný zápis do nastavení obchodu, banky nebo dokumentů.
3. Read-only ověřit právě dva produkty, kategorii, unisex filtry, velikosti, cenu a dostupné veřejné fotografie. Potvrdit `paused:true` a `ready:false`; nevytvářet testovací objednávku.
4. Samostatně commit/push/Pages pro HTML a nové assety historie a související soubory. Worker ani migrace nejsou pro tuto obsahovou dávku potřebné. Samotné publikování repozitáře **nezaloží produkty v produkční D1 ani nenahraje R2**.

## Produkční katalog 21. října 2026

Před zápisy veřejný katalog i autorizovaný Admin zobrazovaly šest produktů; žádné připravené produktové ani variantní ID neexistovalo. Nastavení mělo `paused:true`, `ready:false`, revizi 2. Přes již přihlášený stávající Admin byly jednou uložené přesně dva produkty, každý s jediným uploadem odpovídajícího `*-zoom.webp`. Žádný seed, přímé SQL ani náhradní importér se nepoužil. Přihlašovací tokeny nebyly kopírované ani ukládané.

| Produkt | Varianta | Uložená fotografie | Pořadí / revize |
| --- | --- | --- | --- |
| `not-fast-not-furious` | `not-fast-not-furious-dark-grey` | `r2:1b98a1b2-e282-4f69-a8c1-1e3d7b1830fa` | 6 / 1 |
| `sweetest-things` | `sweetest-things-dark-grey` | `r2:1875d75d-060d-4c58-abe0-7088c9197d0c` | 7 / 1 |

Veřejné GET `/api/merch/catalog` potvrdilo oba publikované produkty s přesnými názvy a popisy, kategorií Trička, `gender:unisex`, barvou Tmavě šedá, velikostmi S/M/L/XL, cenou `69000` a připravenou dostupností. Katalog má osm produktů. Úplné veřejné záznamy původních šesti produktů včetně variant, pořadí a revizí jsou shodné se stavem před zápisy. Pozastavení a revize konfigurace zůstaly beze změny.

Oba veřejné mediální endpointy vrátily HTTP 200, `image/webp` a přesné původní bajty:

- Not Fast: 200 212 B, SHA-256 `595911a2afbcb83d1bb5b005a8be591867cc5912c8399adadacaf471cdd126ea`.
- Sweetest: 175 534 B, SHA-256 `22be013419c7cb7b6d2671dd577a26f3d148f5db065836db8c838fb6489386c3`.

Nové produkty jsou nezávislé na změně HTML historie a fungují s již nasazeným Workerem. Backendová závislost ani migrace nevznikla. Pro publikační commit byla znovu provedená pouze syntax šesti změněných MJS a whitespace kontrola; dokončené lokální testy se neopakovaly. Finální SHA a konečné výsledky automatického CI, Pages a HTTP kontroly nasazených historických souborů patří do závěrečného předání publikace.

## Soubory a zachované změny

Dávka: `o-nas.html`; dva manifesty v `content/`; `scripts/prepare-merch-images.mjs` a `scripts/prepare-about-2025-image.mjs`; tři nové originály a devět WebP exportů v `assets/images/`; `tests/helpers/merch-content-20261021.mjs`, `tests/merch-content-20261021.test.mjs`, `tests/e2e/content-20261021.spec.mjs`, opravený `tests/e2e/merch-bridge.mjs`, jediná historická fotografická fixture a tento report.

Mimo dávku zůstává původní změna `docs/photo-upload-a3-a4-local.md`, nesledovaný `docs/project-audit-2026-10-09.md` a `scripts/audit-20261009/`. Diagnostiky jsou ignorované. Worker, schéma, migrace, obchodní logika, závislosti, workflow, frontendový katalog/fallback, registrace, LIVE, ročník a nastavení Merche jsou beze změny. Produkční zápisy byly omezené na výše uvedené dvě fotografie a dva produkty. Žádná objednávka, platba, e-mail, změna banky, slevy, dokumentů, Cloudflare nastavení nebo preview URL nebyly provedené.
