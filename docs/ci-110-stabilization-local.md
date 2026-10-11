# CI 110 lokální stabilizace koordinátoru a přípravy screenshotů

11. 10. 2026, výchozí HEAD `489e41ad1e200cd32bd8ecd37d6273ac6ef54c37`. Opravy jsou pouze v testech a testovacím helperu. Admin má doložený závod způsobený předčasným posunem virtuálních hodin; screenshotové čekání nyní nezůstává závislé na původně zachyceném seznamu obrázků. Konkrétní interní promise z původního Planner selhání nelze zpětně určit z uložené diagnostiky, proto není vydávána za prokázanou identifikaci zdroje. Bez commitu, pushnutí nebo nasazení.

## Admin a koordinátor mailingu

[CI 110](https://github.com/sumpator/e36-united/actions/runs/38150571149) selhalo v `admin-command.spec.mjs`, scénář „POLISH optional Mailing uses the shared coordinator only while enabled and visible“, na nezměněné kontrole nulových konzolových chyb. Přečteny log, error-context a trace, otevřen failure screenshot z artefaktu `browser-chromium-38150571149-1`, ID `11706926158`. Artefakt zůstává v ignorovaném `test-results/ci110-artifact/`.

`open()` čekal jen na povolené tlačítko úprav dashboardu. `loadAdminData()` ale po načtení dashboardu ještě čeká na `adminLive.startup()` → `load()` → `loadJudgeData()`. Trace zaznamenává následující pořadí (monotónní čas v ms):

| Událost | Čas |
| --- | ---: |
| test čeká na povolené dashboard-edit | 22414,427 |
| `/api/admin/live?eventId=e` vrací 200 | požadavek začal 22479,473 |
| test spouští `clock.runFor(301000)` | 22566,689 |
| první `/api/live` je zrušený | 22567,805, `net::ERR_ABORTED` |
| timeout ze stacku ClockController | 22575,490 |
| konzolová chyba Admin LIVE unavailable | 22575,758 |
| druhý pokus `/api/live` je zrušený | 22579,912, `net::ERR_ABORTED` |

**Příčina je v testu:** skok virtuálních hodin spustil existující 20s timeout a retry ještě během skutečné inicializace. Tento scénář nemění `document.hidden`, online/offline ani účet/ročník; nejde tedy o potlačený stale-context zápis. Aplikace skutečně nedostala očekávaný výsledek a chybu oprávněně zobrazila. Fixture tento GET obsluhuje skutečným `getMemberLive` nad izolovaným aktuálním schématem, nikoli prázdnou úspěšnou odpovědí.

Řízený negativní důkaz zadržel doručení skutečné odpovědi 200 a posunul hodiny o 41 s. Prokázal stejný konzolový error a stav LIVE `offline`, bez neznámých API. Původní diagnostická assertion očekávala nepoužívané označení `stale` a selhala; následná kontrola přesného současného `offline` prošla. Toto není změna očekávání původního CI testu.

**Oprava:** cílový test zadržuje skutečnou judge odpověď, ověří status 200 a stále probíhající `[data-loading]`, uvolní ji a čeká na dokončení bootstrapu a LIVE `online`. Teprve pak posouvá čas. Zachované kontroly: vypnutý widget bez požadavků, přesně jeden požadavek po zapnutí, další po intervalu, žádné po vypnutí, dvě preference writes, nulové klientské chyby, neznámá API a konzolové chyby. LIVE inicializace ani aplikační chybová větev se nevypínají.

## Mobilní Planner a čekání před screenshotem

Původní `capture()` měla jedno nerozlišené čekání na `document.fonts.ready` a následnou `Promise.all(image.decode().catch(...))`. Trace pro 390 × 844 zaznamenává začátek tohoto evaluate v 737909,401 ms a časovou nulu testu 734700,071 ms. Z celkových 30 s tedy zbývalo přibližně **26,79 s**, nikoli jen poslední zlomek limitu. Timeout vznikl uvnitř tohoto čekání před screenshotem `planner-mobile`; přihlášení, návrat na `#planer` a přepnutí pobytu už prošly.

Síť v trace nemá žádné fontové požadavky ani chybu fotografií. Wix fotografie byly obslouženy fixture skutečnými repo bitmapami, ostatní viditelné zdroje lokálním serverem. Nedělní `assets/images/program/sunday.jpg` začala až v 762373,411 ms a vrátila 200 za 8,434 ms, což odpovídá pozdějšímu autoplay Programu; samo o sobě to **nedokazuje**, že právě ona držela původní promise. Uložený DOM před evaluate má `currentSrc` nedělní lazy fotky prázdné a panel neaktivní; na nejbližších screencast snímcích je už Planner. Statické přehrání této pozice zahrnulo do původního viditelného výběru jen načtené logo. Nelze tedy poctivě tvrdit, že původní CI čekalo právě na nedělní obrázek nebo že příčinou byl rozdíl Windows/Linux.

První instrumentovaný lokální průchod původního scénáře prošel. Fonty měly `status:loaded`, `faces:[]` a čekání trvalo 0,2 ms. Záznam `test-results/ci110-decode-diagnostic.json` uchovává u každého skutečného decode `src`, `currentSrc`, `complete`, `naturalWidth`, `loading`, rámeček a start/dokončení. Ukázal například logo 847 px, repo páteční fotografii 1600 px a fotografii ubytování 279 px, všechny dokončené. Tento jediný PASS není vydáván za reprodukci původní konkrétní interní promise.

**Prokázaná chyba mechanismu testu:** jednou zachycený seznam nativních decode promises neumí vyřadit obrázek, který během čekání zmizí z aktuálního zobrazení. Řízená regrese zadržela skutečnou repo fotografii s `complete:false`, `naturalWidth:0`, `loading:lazy`, síťovým stavem pending. Původní nativní decode zůstal pending i poté, co byla fotka skryta a aktuální foto po dalších změnách `src` již načtené. Nový helper mezitím dokončil jen aktuální viditelnou nedělní fotografii s `complete:true`, `naturalWidth>0`, dekódováním ready a HTTP 200/finished. Tento negativní důkaz není závislý na náhodné reprodukci ani úspěšném univerzálním mocku.

**Oprava v testovací infrastruktuře:** `screenshot-readiness.mjs` průběžně kontroluje aktuální fontový stav a skutečně viditelné obrazy včetně opacity, horizontální polohy a clippingu rodičů. Dekódování začíná až pro dokončené platné bitmapy. Stav je vázaný na současné `src/srcset/sizes/currentSrc`; změna zdroje jej zneplatní. Při neúspěchu screenshot nevznikne a chyba i JSON příloha uvedou fázi, konkrétní zdroj, `complete`, `naturalWidth`, `loading` a zaznamenaný síťový stav/status. Chybějící viditelná fotografie byla ověřena skutečným lokálním HTTP 404; helper ji neproměnil v prázdný úspěšný obrázek.

Nevznikl pevný sleep, tichý timeout ani zvýšení testového limitu. `expect.poll` používá nezměněné projektové čekání 7 s. Nejsou potřeba nové externí zdroje ani nové bitmapy. Aplikace, ceny a skutečné Planner výpočty se nemění. **Zbývající diagnostické omezení:** původní CI neurčuje fázi ani konkrétní čekající native promise; nová připravenost tento slepý bod odstraňuje pro případné další selhání, ale zpětnou jistotu nevytváří.

## Výsledky cílených kontrol

Každý průchod je samostatný; žádné automatické retries, skipped ani flaky výsledky. JSON reporty a diagnostiky jsou v ignorovaném test-results. Celé Node/browser sady ani CI se nespouštěly.

| Běh | PASS | FAIL | Rozsah |
| --- | ---: | ---: | --- |
| `ci110-diagnostic-before` | 1 | 1 | instrumentovaný původní Planner PASS; negativní Admin diagnostika měla chybnou assertion `stale` místo skutečného `offline` |
| `ci110-admin-negative-proof` | 1 | 0 | řízené zadržení odpovědi a přesná oprávněná chyba |
| `ci110-target-initial` | 2 | 0 | oba upravené scénáře před doplněním finálních regresí |
| `ci110-readiness-chromium` | 3 | 0 | změna viditelného obsahu/src, lazy/clipping, konkrétní 404 |
| `ci110-chromium-run1` | 2 | 0 | finální oba scénáře, 8,122 s |
| `ci110-chromium-run2` | 2 | 0 | druhý po sobě jdoucí průchod, 8,026 s |
| `ci110-chromium-run3` | 2 | 0 | třetí po sobě jdoucí průchod, 7,956 s |
| `ci110-webkit-target` | 5 | 0 | oba scénáře a tři řízené regrese, 20,049 s |
| `ci110-capture-neighbors` | 2 | 0 | přímo dotčené sousední historie a Member capture, 16,5 s |

Úvodní diagnostická konfigurace nedokázala spustit relativní cestu serveru z test-results: 0 scénářů. Opravena pouze ignorovaná konfigurace doplněním správného cwd, nikoli workflow či projektová konfigurace.

Syntax čtyř změněných/nových MJS a `git diff --check`: PASS. Finální obrázky Planneru mobile/desktop a homepage mobile byly skutečně otevřeny; fotografie nejsou prázdné náhrady. Všechny kroky obou cílových scénářů doběhly včetně následného ubytování, kapacity, desktop/mobile screenshotů a kontrol chyb či počtů požadavků.

## Prostředí a stav dávky

Playwright 1.62.1 jako CI, Chromium revision 1234 / 151.0.7922.34 a WebKit revision 2336 / 26.5, Node 24.19.0. Lokálně Windows; použitelné Linux/WSL ani Docker prostředí není dostupné. Původní trace jsou z Linuxu, nové běhy nejsou vydávané za Linux CI. WebKit rozšířený výběr používá jen ignorovanou `test-results/ci110-target.config.mjs`.

Změny: `tests/e2e/admin-command.spec.mjs`, `tests/e2e/portal-next-ux.spec.mjs`, nový testový helper a jeho regrese `tests/e2e/screenshot-readiness{,.spec}.mjs`, tento report. Produkční assety se nemění, proto zůstávají stávající cache URL beze změny. Role, handlery, timeouty aplikace, logování a obchodní nastavení se nemění.

Audit `docs/project-audit-2026-10-09.md`, `scripts/audit-20261009/` i starší ignorované diagnostiky jsou zachované. Žádný backend, migrace, produkční data, e-maily, uploady, změny závislostí/workflow ani aktivace služeb; žádný commit, push nebo deployment. Dávka je lokální a původní přesná Planner promise zůstává neověřitelná z dochovaného trace.
