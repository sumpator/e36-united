# Registrace Planner a členské LIVE

Lokální dávka z 25. 10. 2026 navazuje na `70a5947556b114b98da927534bca05bcf629eee9`. HEAD se nemění. Bez commitu, pushe, CI, nasazení, migrace nebo produkčních zápisů. Předaný produkční e-mailový transport `enabled=0`, `activated_at=NULL`, `revision=0` se touto prací nemění; produkční konfigurace se znovu nečetla ani neupravovala.

## Mapa stavů a společné příčiny

| Průchod | Příčina v původním kódu | Lokální řešení |
| --- | --- | --- |
| Veřejný Planner → účet → členský Planner | Existuje URL/local handoff a UID-scoped serverový koncept, ale členské editace jej průběžně neaktualizují. Serverový a legacy lokální handoff navíc nemají úplnou kontrolu ročníku při převzetí. | Rozšířen stejný validovaný koncept a stejné `member_planner_drafts`, nikoli druhé úložiště rezervací. Společná kontrola ročníku chrání lokální i serverové převzetí. |
| Přidání auta → návrat | Garáž si potvrzené ID ponechá pro retry, ale callback do Planneru jej nepředává; handoff znovu volí hlavní/první auto. | Potvrzené ID prochází callbackem až do konkrétního rozpracovaného plánu. Existující rezervace se tím nepřepisuje. |
| Hlavní auto | Server rozhoduje podle počtu aut načteného před zápisem. | Registrační cesta posílá `preservePrimary`; rozhodnutí při vytvoření je atomické uvnitř INSERT/batch, opakovaná úprava nemění hlavní auto. Samostatná výslovná volba hlavního auta v garáži zůstává. |
| Registrace a přihlášení | Obecný vstup preferuje login a panel konkuruje předávacímu banneru i obřímu roku. | Obecný vstup je Můj United/registrace účtu; `mode=login` je nadále výslovný login. Jediný panel účasti má skutečný stav, souhrn a pojmenovanou hlavní akci. |
| Mobilní Menu a uvítání | Generované Menu nekopíruje odhlášení. `club-profile.css` mění intro na spodní panel a v mobilu skrývá celý blok výhod. | Menu používá původní obsluhu odhlášení. Intro využívá visual viewport, safe areas a scroll; blok se neschovává. |
| Vybraná soutěžní fotografie → Spustit hodnocení | `confirmNewCar()` považuje foto frontu za zahazovaný koncept a `startRating()` ji neukládá. | Hlavní akce čeká na validaci/přípravu a potvrzený idempotentní upload; při chybě ponechá náhled a nic nespustí. |
| Fotografie druhého klienta | Paměťový klíč obsahuje revizi, ale mediální požadavek měl stabilní URL. | URL obsahuje existující `liveRevision`; DB trigger a dosavadní LIVE poll se nemění. |
| Členské kategorie a fotky | Prosté řádky a velké duplicitní náhledy potvrzených uploadů. | Dotykové rozbalovací karty kategorií, vlastní skóre/miniatury, fotografické karty stavů; potvrzená fronta je kompaktní potvrzení, ne nová mazací funkce. |

## Ukládání a ochrany

Formulář nejprve uloží omezený JSON v prohlížeči pod účtem a ročníkem; serverový zápis je odložený o 500 ms a serializovaný. Další změny čekají za rozpracovaným zápisem. Pozdní odpověď nesmí změnit formulář/navigaci jiného účtu nebo ročníku. Koncept obsahuje ID auta, volby, poznámku a posádku, nikdy hesla, tokeny ani fotografické soubory.

Koncept je navázaný na výchozí uložený stav: ID/revizi předběžné registrace nebo údaje/čas/stav rezervace a její žádosti. Nesouhlasící nebo expirovaný koncept se automaticky neobnoví. Veřejný handoff má lokální vlastnickou vazbu po převzetí; staré neomezené legacy preference bez účtu/ročníku se nepřiřazují jinému členovi. Aktuální nabídka, kapacity a cena se načítají a validují dosavadními handlery. Návrh změny schválené rezervace zůstává jen návrhem.

Stav rozlišuje uložení pouze v prohlížeči, potvrzení serverem a chybu; zavření ukládání nezaměňuje s dokončenou registrací. Autosave nevytváří rezervaci, předběžnou registraci, platbu, obsazenou kapacitu ani registrační e-mail. Výslovné uložení/odeslání zůstává samostatné. Při nedostupném lokálním uložení chrání zavření potvrzení.

LIVE zachovává výběr, účet, ročník a kategorii po dobu operace. Úspěšný upload se při neúspěšném spuštění neopakuje; ztracené potvrzení uploadu používá při opakování stejné upload ID. Veřejná soutěžní fotografie nemění garáž/rezervaci ani interní porotcovské přílohy. Konkrétní historický případ Vosa/Cabrio nebyl zpětně prokázán produkčními daty; doložená je řízená reprodukce této kódové cesty.

## Změněné soubory

- Planner/garáž: `planner-state.js`, `worker/domains.js`, `worker/domains/garage.js`, `member/modules/planner/{index,experience}.js`, `member/modules/garage.js`.
- Vstupy, navigace a uvítání: `main.js`, `index.html`, `member.html`, `member.js`, `member/shell.js`, `mobile-navigation.js`, `member-portal-state.js`, `member/modules/overview.js`.
- Členské LIVE/fotografie: `admin/modules/live.js`, `member/modules/live.js`, `member/modules/photos.js`, nový úzce omezený `member/registration-continuity.css`.
- Návazné cache URL `20261025-flow1`: `admin.html`, `admin.js`, `galerie.html`, `merch.html`, `o-nas.html`, `public-member-state.js` a výše dotčené vstupy/importy. Registry `scripts/{admin-module-releases,check-admin-module-graph}.mjs`. Nezměněné závislosti mají původní tokeny.
- Regrese: nové `tests/registration-continuity.test.mjs`, `tests/e2e/registration-live-continuity.spec.mjs`; související očekávání `tests/member-view-state.test.mjs`, `tests/e2e/{fixtures.mjs,member-new-member.spec.mjs,portal-next-ux.spec.mjs,preliminary-reservations.spec.mjs,public.spec.mjs,feedback-member.spec.mjs,transactional-emails.spec.mjs,admin-command.spec.mjs}`.

## Výsledky kontrol

| Kontrola | Výsledek a význam |
| --- | --- |
| Původní cílená reprodukce soutěžní fotky | 0 PASS / 1 FAIL: po výběru fotografie nepřišel upload; původní potvrzení zahození konceptu blokuje hlavní akci. |
| Pracovní ověření implementace | Tři následné jednotlivé běhy 0/1 zablokovala rozpracovaná chyba `$` místo `$$` v přepínačích účtu; opravena. Poté 1/1 PASS včetně druhého klienta. Nejde o závadu původní publikované aplikace. |
| Cílené Node | Nejprve 14 PASS / 1 FAIL: nový test měl starý název tabulky `reservation_payments`; správně `event_payments`. Následně nový soubor 2/2 PASS. |
| Pracovní browser regrese | 1 PASS / 3 FAIL, pak cíleně 0 PASS / 3 FAIL: opraven nullable guard konceptu a chybějící předání carId v druhém callbacku; testovací selhání čtení musí trvat i přes existující jeden retry GET a auth/intro používají oddělenou přípravu stránky. Další běh 3 PASS / 1 FAIL doložil mobilní skrytí výhod v intro CSS; opraveno. |
| Návazné existující průchody | 5 PASS / 5 FAIL ze 10; zastaralé názvy CTA, zahazování místo uloženého konceptu, umístění handoffu a očekávání tmavé barvy při již schváleném světlém defaultu. Po příslušných úpravách 13 PASS / 2 FAIL z 15; zůstala barva sekundárního povrchu. Cílený Planner poté 1 PASS / 1 FAIL: nově správně vybrané auto neexistovalo ve stejné DB jako předběžný plán. Fixture nyní používá skutečné Garage handlery a společnou DB; následně 2/2 PASS. |
| Soutěžní upload a druhý klient | Chromium 3/3 PASS: úspěch, řízená 503 a ztracené potvrzení. Ověřeny počty v DB, stejné upload ID při retry, nulový start před potvrzením fotografie a automatické načtení její výměny druhým klientem. |
| Serializace konceptu | Chromium 1/1 PASS s bariérou odpovědi: novější text uložen, opuštěná sekce neobnovena; žádná registrace ani platba. |
| Pracovní vizuální fixtures | 1 PASS / 6 FAIL (unikátní R2 klíče), poté 0 PASS / 6 FAIL (chybějící `writeHttpMetadata` v testovacím R2 objektu). Opraveny pouze konkrétní kontrakty fixtures. Jedna chybně ukotvená grep volba nespustila žádný test. |
| Větší text | Dva jednotlivé pracovní FAIL doložily skutečné přetékání 404 px při viewportu 390 px: neviditelný souborový vstup měl šířku 367 px a pravý okraj 404 px. Opraven rozměr a umístění tohoto vstupu, bez globálního ořezání stránky. |
| Vizuální průchody | Následně 6/6 PASS; po finálním zkompaktnění panelu dalších cílených 6/6 PASS. 360/390 px, tablet 820 px, desktop 1440 px v obou motivech, mobil naležato 844×390 a větší text. |
| Cílený WebKit | 11 PASS / 3 FAIL ze 14: zachycené multipart tělo mělo 309 B a soubor 0 B, nikoli původní fotografii. Testovací most nyní serializuje tutéž prohlížečem připravenou FormData do bajtů, bez náhradního obrázku či úspěšné odpovědi. Browserový rozměr/MIME se assertuje; skutečné serverové validace zůstávají. Následně dotčené tři scénáře 3/3 PASS. |
| Celý Node běh | **609 PASS / 0 FAIL / 0 skipped / 0 cancelled / 0 todo**, 9 306 ms; jednou, `test-results/continuity-node-full.log`. |
| Celý Chromium běh | **379 PASS / 7 FAIL / 0 skipped**, 386 scénářů, 16,1 min; jednou, `test-results/continuity-chromium-full.log`. Jedno staré očekávání tokenu appearance (`20260928-flow1` místo již publikovaného `20261022-light1`), tři očekávání obecného loginu a čtyři scénáře kontroly dřívějšího samostatného handoff banneru; dvě skupiny se v jednom scénáři překrývají. Kontroly nyní vyžadují nový registrační vstup/výslovné přihlášení a předané údaje v jediném panelu, ne odstranění assertions. |
| Cílená oprava sedmi očekávání | **5 PASS / 2 FAIL** ze 7: nově upravený login helper chybně testoval viditelnost ještě před zobrazením auth view. Nyní čeká na konkrétní auth view a výslovně použije stávající login tab. Dva dotčené scénáře pak PASS v následujícím běhu 12/12; ostatních pět již PASS. |
| Hranice ročníku a uloženého stavu | Před opravou jednotlivě **0 PASS / 1 FAIL** serverový handoff z roku 2025 a **0 PASS / 1 FAIL** legacy lokální handoff bez ID ročníku: do roku 2026 vložily poznámku `[Weekend Planner] Odjezd: Neděle · 1 noc`. Minimální sdílená kontrola porovnává ID ročníku, u legacy bez ID rok. Nic nemaže a nepřevádí. |
| Závěrečné cílené Chromium | **12/12 PASS**: dva zbývající handoff průchody, čtyři ochrany obnovy a šest vizuálních stavů po odstranění ořezu drobného stavového popisku (původní zaoblení vnitřní karty při nulovém paddingu). Následně **13/13 PASS**: všech šest obnovovacích kombinací včetně lokálního legacy ročníku, oba účty, uložený plán a neúspěšný převod. Logy `continuity-final-targeted.log`, `continuity-scope-final.log`. Celý Chromium se po úzkých opravách testů, filtru handoffu a scoped CSS neopakoval. |
| Celý projektový WebKit výběr | **137 PASS / 0 FAIL / 0 skipped**, 10,8 min; jednou, `test-results/continuity-webkit-full.log`. Stejný existující projektový výběr jako v konfiguraci CI, bez úprav workflow či retries. Nový soubor této dávky do stávajícího výběru nepatří; jeho cílené WebKit výsledky jsou uvedeny samostatně. |
| Závěrečný cílený WebKit | **12 PASS / 0 FAIL / 0 skipped**, 54 s: šest kombinací obnovy a šest vizuálních stavů. `test-results/continuity-webkit-final-targeted.log`, izolovaná konfigurace `test-results/continuity-webkit.config.mjs`. Nový regresní soubor má nyní 20 scénářů; tento výsledek se nevydává za úplný běh všech dvaceti. Předchozí uploadové tři scénáře byly po opravě binárního mostu samostatně 3/3 PASS, ostatní původní scénáře prošly v prvním cíleném běhu. |
| Závěrečná syntax, graf a diff | **Syntax 30 JS/MJS PASS**, `git diff --check` PASS. Existující Admin graph **64 modulů / 0 chyb / 0 cyklů**. Doplňková parse-only kontrola statických i doslovných dynamických importů ve všech šesti HTML vstupech: změněné moduly vždy jediná URL `20261025-flow1`. Dva nezměněné Merch splity (`firebase-config.js`, `merch/catalog.js`) ověřeny stejnou kontrolou i v HEAD, nejsou novou regresí a nebyly upravovány. |

Změny očekávání nejsou tolerancí chyby aplikace: obecný vstup má podle tohoto zadání otevřít registraci účtu, pojmenované akce nahrazují „Začít“, uložený koncept se po zavření nezahazuje a po návratu stejného účtu se obnovuje, nový automobil musí skutečně existovat v DB pro kontrolu vlastnictví. Kontroly oprávnění, částek, prázdných/neprázdných stavů a neznámých API zůstávají. Žádné skip/fixme, force click, zvýšené timeouty ani automatické retries. Síťové výjimky v nových testech dovolují jen konkrétně vyvolané selhání příslušné operace.

## Prohlédnuté screenshoty a omezení

Skutečně otevřené snímky jsou pod `test-results/continuity-visual-final2/`: registrační panel 360/light a 1440/light, kategorie 390/dark. Dále byly prohlédnuty fotografické karty 390/dark pod `continuity-visual-reviewed/`, pracovní snímky před opravou kompaktního panelu a většího textu pod `continuity-visual-check/`. Dále skutečně otevřeny finální fotografie 820/light, 844×390/dark, 1440/light a 390/dark s větším textem, registrační panel 1440/dark a krátký intro dialog s dosažitelnou poslední výhodou (`continuity-targeted/...cb425.../onboarding-short.png`). Poslední kontrola panelu po odstranění ořezu popisku: `continuity-final-targeted/...47ec6.../registration-entry.png`.

Prostředí: Windows, Node 24.19.0, Playwright 1.62.1 (verze projektu), jeho nainstalované Chromium a WebKit. Linux ani skutečný iPhone/kamera/mobilní klávesnice nebyly ověřeny. Browser-act ani uv nejsou dostupné; nic se neinstalovalo, použit projektový Playwright. Screenshoty nenahrazují fyzický telefon. Všechna data a API zápisy z ověření jsou izolované, média jsou skutečné repo fotografie v lokálním R2 testovacím objektu.

Otevřeny také finální WebKit snímky `continuity-webkit-final-targeted/...6950c.../registration-entry.png` a `...82b89.../photo-cards-large-text.png`. Parse-only diagnostika je uchována v ignorovaném `test-results/continuity-cache-graph.mjs`; běží z kořene repozitáře s `node --experimental-vm-modules`.

## Backend a budoucí publikace

**Odpovídající Worker je nezbytný**, migrace není potřeba. Nový Worker rozumí volitelnému editoru ve stávajícím JSON konceptu a atomickému `preservePrimary`. Starý Worker editorová pole odstraňuje; nový frontend proto nesmí předběhnout backend. Nový Worker přijímá i dosavadní handoff bez editoru a zachovává explicitní garážové nastavení hlavního auta.

Po samostatném souhlasu: vybrat pouze tuto dávku, ověřit diff/cache/graf a návaznost main bez force, zaznamenat stávající Worker/Pages a provozní metadata. Nasadit odpovídající Worker před pushem frontendu, bez migrace, při zachování vypnutého e-mailového transportu, preview URL a business nastavení. Ověřit health/auth, pak push a automatické Pages pro totožné SHA, read-only kontrola produkčních souborů. Při problému nevracet celou DB ani nevytvářet produkční testovací rezervace/uploady.

SMTP doručování, konfigurace událostí/hlaviček poskytovatele a vlastní grafika Firebase zůstávají samostatnými provozními kroky. Původní ověření e-mailu/reset hesla se nemění. Merch, LIVE, registrace, aktuální ročník a ceny nebyly měněny.

Navazující backlog mimo dávku: veřejné představení Nejlepšího zvuku výfuku, evidence čerpání bodových odměn a návrh veřejného menu „O srazu“.

Zachovaná nesouvisející práce: upravený `docs/photo-upload-a3-a4-local.md`, nesledovaný `docs/project-audit-2026-10-09.md`, `scripts/audit-20261009/` a diagnostiky. Všechny změny zůstávají lokální, nic nebylo přidáno do indexu. HEAD je nadále výchozí publikovaný commit. Lokální Chromium `debug.log` je zachován jako ignorovaný `test-results/continuity-debug.log`. Vlastní testovací server byl po ověření zastaven. Stav souborů je uložen v ignorovaném `test-results/continuity-final-status.txt`.

## Schválené závěrečné ověření a publikace — 25. 10. 2026

Předchozí části jsou historickým lokálním předáním. Následné zadání schválilo jeden nový úplný Chromium běh, commit, odpovídající Worker před pushem a automatické Pages/CI. Aplikační funkce se při přípravě publikace dále neměnily. Do `wrangler.jsonc` bylo pouze výslovně doplněno `preview_urls: false`, aby nasazení zachovalo již schválený vypnutý stav. Závislosti, workflow a migrace se nemění.

Závěrečný úplný Chromium: **392 PASS / 0 FAIL / 0 skipped**, 24,5 min, jediný běh podle stávajícího projektu, jeden worker a retries=0. Konečný souhrn je v `test-results/registration-publish-chromium.log`, stav `passed` a prázdné `failedTests` v `test-results/registration-publish-chromium/.last-run.json`. Tento úplný výsledek nahrazuje původní 379/7 jako publikační podmínku; původní výsledky zůstávají výše zachované. Celý Node ani WebKit se neopakovaly: nadále platí 609/609 Node, projektový WebKit 137/137 a cílené výsledky výše. Syntax 30 dotčených JS/MJS, existující Admin graf 64 modulů / 0 chyb / 0 cyklů, návaznost `20261025-flow1` a `git diff --check` byly znovu úspěšně ověřeny.

Read-only produkční výchozí stav: Worker verze `fb3986bb-83d1-4d7d-886a-d82dab2c4289` (100 %), Worker deployment `89cef683-3c15-488c-857e-967b0e76b94c`; Pages `5ea59424-2483-444e-89d8-3ad2bf8da09f`, production SUCCESS, source `70a5947556b114b98da927534bca05bcf629eee9`. Transakční transport přesně `enabled=0`, `activated_at=NULL`, `revision=0`. Worker preview URL vypnuté, workers.dev zapnuté, stávající API route zachována. Aktuální ročník 2026; LIVE vypnuté a ostré registrace uzavřené ve všech ročnících. Předběžné registrace 2026 zapnuté (revize 3), Merch pozastavený (revize 2). Konfigurace lokálních provozních proměnných a cronu se shoduje s produkcí; soukromé hodnoty nejsou v reportu.

Kompatibilita: nový Worker dál přijímá původní koncept bez `editor` a původní payloady garáže bez `preservePrimary`; dosavadní explicitní volba hlavního auta zůstává. Nové údaje jsou volitelné a ukládají se do stávajícího JSON. Schéma a migrace nejsou dotčené. Publikace proto nevyžaduje změnu business přepínačů ani technickou blokaci zápisů. Nový frontend naopak vyžaduje nový Worker, aby server editorová pole neodstraňoval.

Publikační rozsah je výslovný seznam 39 souborů včetně tohoto reportu, regresí a konfigurace vypnutých preview. Původní A3/A4 report, audit, `scripts/audit-20261009/` a ignorované provozní diagnostiky zůstávají mimo commit. Skutečný výsledek nasazení, SHA a provozní ID budou uvedeny v závěrečném předání; diagnostický provozní záznam zůstane v ignorovaném `test-results/registration-publish-*`.
