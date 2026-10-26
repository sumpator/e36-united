# Garáž — závod počátečního fokusu (2026-10-26)

Výchozí commit: `f7f7e3550720f69e59f9f01a1ada7c5452620921`, CI #123:
https://github.com/sumpator/e36-united/actions/runs/40239726564

## Příčina a úzká oprava

`openCarModal()` zobrazoval dialog a teprve přes `requestAnimationFrame` bezpodmínečně zaměřoval přezdívku. Mezitím mohl uživatel přejít do modelu. CI trace obsahuje přezdívku `Nová E36328i`, prázdný povinný model a žádný POST vytvoření auta.

Řízená regrese zadržuje pouze callback s konkrétním zaměřením přezdívky garáže; ostatní animace běží. Po vyplnění modelu a nastavení kurzoru callback výslovně uvolní. Na původním kódu zachytila/uvolnila právě jeden callback a kontrola fokusu modelu selhala. Důkaz: `test-results/garage-focus-before/`, trace a příloha `held-garage-focus` (`captured:1`, `released:1`).

Fokus se nyní nastavuje synchronně po zobrazení dialogu. Neexistuje opožděná akce, která by převzala uživatelem zvolené pole nebo zasáhla zavřený či znovu otevřený dialog. Bez změn ukládání, validace, fotografie, hlavního auta, databáze nebo vzhledu.

## Cílené výsledky

- Před opravou: Chromium, řízené převzetí fokusu — **0 PASS / 1 FAIL**, očekávaná neaktivita modelu po uvolnění callbacku. Běh po zaznamenání selhání zůstal při ukončování místního serveru; ukončen bez opakování regrese na původním kódu.
- První výběr po opravě: Chromium **3 PASS / 3 FAIL**. Tři nové testy narazily na nejednoznačný selektor zavření (pozadí i tlačítko). Zpřesněn pouze nový selektor na tlačítko „Zavřít formulář auta“; následné cílené ověření **3/3 PASS**.
- Finální výběr po aktualizaci cache URL: Chromium **6/6 PASS**, WebKit **6/6 PASS**, bez skipped a retries. Chromium po dokončení testů čekal na ukončení vlastního lokálního serveru; jeho cílené ukončení umožnilo korektní dokončení reportu s exit 0. WebKit exit 0.
- Pokryto: zachování zvoleného modelu, textu a pozice kurzoru; zavření; rychlé znovuotevření; běžný počáteční fokus při vytvoření/editaci; původní dva Planner scénáře (prázdná garáž / existující hlavní auto) až po skutečné izolované uložení, selhání refreshu, retry bez druhého POST, kontrolu hlavního auta a obnovení rozpracovaného Planneru.
- Testovací API používá dosavadní izolovaný runtime a skutečné handlery. Neznámé API a konzolové chyby zůstávají kontrolované. Původní očekávaný refresh 503 zachován.
- Otevřeny screenshoty mobilního formuláře a desktopové editace. Bez změny rozložení; zachované hodnoty a fokus.
- Syntax změněných JS/MJS, `git diff --check` a kontrola jednotných verzovaných návazností: PASS.
- Windows, Node 24.19.0, Playwright 1.62.1. Linux ověří jediný automatický CI běh publikovaného SHA. Fyzická mobilní klávesnice neověřena. Celé Node/browser sady lokálně neopakovány.

## Publikační rozsah

`member/modules/garage.js`, `member.js`, `member.html`, `tests/e2e/registration-live-continuity.spec.mjs` a tento report. Cache `20261026-focus1` pouze pro garáž a navazující vstup `member.js`; nezměněné závislosti ponechány. Původní report A3/A4, audit a diagnostiky jsou mimo commit.

Pouze frontend a regrese: žádný Worker deployment, migrace, produkční zápis, upload, e-mail ani změna nastavení služeb, transportu nebo preview URL. Výsledek automatického CI, Pages a HTTP kontroly se předává po publikaci samostatně; cílené lokální průchody nejsou vydávány za celé sady.
