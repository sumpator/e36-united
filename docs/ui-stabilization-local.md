# UI stabilizace E36 UNITED — lokální předání

Stav: 11. 10. 2026. Aplikační dávka zůstává necommitnutá; bez pushnutí a nasazení.

Oddělený commit testovacích oprav B1/B2: **74de30f6cc96d238ddcfdc1ab00ad136d46c33f4** (`test: stabilize browser fixtures and current UI expectations`), pouze 24 testovacích souborů a `docs/browser-test-stabilization-local.md`.
Před jeho vytvořením nebyly opakovány hotové testy. Navazuje na A1/A2 **23954e2e9c00a1fb73bf49dbc065f613a43cb575**. Původní audit a diagnostiky zůstaly mimo oba commity.

## Pět bodů

1. **Potvrzené body a neúspěšné přílohy.** `member/modules/live.js / submitJudge, judgeForm, renderShowShine`: po receipt zůstával původní editovatelný formulář a jeho draft mohl nahradit nově vykreslený potvrzený stav. Potvrzení nyní odstraní pouze odeslaný draft, uzamkne body a ponechá frontu příloh v samostatném photo-only formuláři. Retry posílá jen nepotvrzené soubory se stejnými uploadId. Čekání druhého uploadu v regresi prokazuje uzamčení už před jeho selháním; dva submity nezaloží druhou operaci. Ověřeno: jeden score PUT, čtyři přesné body 7, verze 1, audit 0, dvě různé serverové přílohy a tři upload požadavky s identitami první / druhá / druhá. Admin ekvivalent zachovává hodnoty 6/7/8/9, jeden PUT, verzi 1, audit 0 a dvě přílohy.

2. **Uložení uspělo, načtení selhalo.** `admin/modules/live.js / submitJudge, renderContent` vkládal dočasný status do DOM, který odstranilo finally. Oba LIVE moduly nyní drží chybu načtení u konkrétního hodnocení a vykreslují trvalé „Hodnocení je uložené. Přehled se nepodařilo obnovit.“ s akcí „Zkusit načíst znovu“. Opakovaný neúspěšný GET ji ponechá, úspěšný GET potvrzené/novější verze ji odstraní. Cache potvrzení se neodhazuje podle staršího serverového snapshotu. Síťově nejasný PUT dál vyžaduje ověření uložené sady; teprve skutečná shoda verze/bodů/autora dovolí potvrzení. Admin regrese prokázala souběžnou opravu na náhradním zařízení, odmítnutí stale verze, následnou vědomou opravu s důvodem, jednu sadu ve verzi 3 a dva auditní záznamy; retry GET nezvýší počet tří score požadavků. Členský průchod prokázal opakované selhání GET, úspěšné obnovení i reload serverových příloh bez dalšího PUT.

3. **Focus hlasovacího dialogu.** `closeVote` obnovoval odstraněný prvek před renderem. Diagnostika navíc zachytila opětovný startup již otevřeného LIVE po popstate: následný enterMode přesunul focus na Program. Zavření nyní obnovuje aktuální viditelnou akci po renderu, zachovává ji i při aktualizaci a zaniklá akce má viditelný fallback na nadpis sekce. Vstup do aktivního LIVE je opakovatelný bez nové inicializace. Cancel, Escape, Tab a interní Back prošly, včetně uzavření hlasování během dialogu; zrušení má nula PUT a nula hlasů, obnova focusu nepřidává historii. Průchody po původním místě selhání ověřily editaci historie, odmítnutí změny uzavřené kategorie a ztracenou odpověď.

4. **Registrační dialog 360 × 520.** Sticky akce v malém viewportu překrývaly obsah; vstupné navíc nebylo přes celou šířku mřížky. Mobilní akce jsou v běžném toku, dosažitelné posunem, vstupné zabírá celý řádek a mřížka má explicitní minimální šířky. WebKit měřil scrollWidth 601 při clientWidth 338 kvůli dlouhým textům nativního selectu ubytování, ačkoli všechny viditelné rámečky byly uvnitř dialogu. Lokální `contain:inline-size layout` na selectu odstranil tuto příčinu; výsledné šířky jsou 338/338. Nepřibylo globální overflow:hidden ani zmenšení písma. Test nejprve zpřístupní poznámku a pak akce svislým posunem; kontrola nepřekrytí a dostupnosti akcí není oslabena. Chromium i WebKit dokončily celý scénář včetně odmítnutí neplatného návrhu, následného uložení a potvrzení. Prohlédnuty oba motivy při 360 × 520 a tablet 1024.

5. **Posun po předběžném Planneru — oprava původní interpretace/testu.** Naměřeno před zavřením: scrollY 368, výška stránky 1268, návratové tlačítko top 660,578125; po zavření: scrollY 390, výška 1290, tlačítko top **stejných 660,578125**. Přemístění formuláře do/z dialogu mění výšku stránky a omezuje maximální scrollY. Rozdíl 22 tedy nebyl vizuální skok návratového prvku. Test nyní vyžaduje jeho stejnou viditelnou pozici s původní tolerancí 1 px, viditelnost a správný focus; pouhá tolerance scrollY nebyla zvýšena. Měření je přiložené jako `planner-return-position`. Obě šířky v obou enginech dokončily následnou editaci a storno, v DB zůstal jeden plán. JS Planneru se neměnil.

## Rozsah mechanismu a zachované ochrany

Širší úprava je omezena na dva LIVE renderery: potvrzený stav/verze, chyba následného čtení a identita právě probíhající operace. Mapování podle účtu, ročníku a účasti chrání nový kontext před opožděnou odpovědí/finally; stará operace neodstraní zámek nové. Fronty File objektů zůstávají jen v paměti. Úplný reload obnoví skutečná serverová data, nikoli neodeslané soubory.

Zůstávají důvod opravy, červené upozornění, potvrzení, serverová oprávnění, expectedVersion a audit. Osm regresí A1/A2 zahrnuje vlastní i cizí auto porotce, stale-write 409, obyčejného člena bez interních údajů a zákaz jeho vlastního veřejného hlasu.

U regression photo testu doplněn pouze konkrétní handler vlastní galerie nad jeho izolovanými uploady a paměťovým úložištěm; dříve tato dodatečně kontrolovaná média padala do 501. Neznámé API dál selhává. Double-submit používá skutečný SubmitEvent s tlačítkem odeslání, aby nezaměňoval uložení konceptu a potvrzenou sadu.

## Výsledky kontrol

**Jeden úplný Chromium běh: 308 PASS / 1 FAIL / 0 skipped**, 309 scénářů, 730,389 s. Jediné selhání bylo řízení testového spojení v `united-live-repair.spec.mjs`: po `failRefresh=false` automatický GET uspěl dříve než kliknutí na mizící retry. Trace obsahuje PUT 200 / 409 / 200, následné GET 503 a GET 200, žádný další PUT. Fixture nyní drží návrat odpovědi na bariéře do výslovného ručního retry. Po opravě prošla cílená skupina 5/5; celý Chromium se znovu nespouštěl. Neprezentovat tento výsledek jako nový úplný 309/309 PASS.

**Jeden celý stávající WebKit výběr: 136/136 PASS, 0 skipped**, 327,912 s. Proběhl s konečnými cache URL. Následné zpřesnění opakovaného vstupu LIVE na stejný účet/ročník a viditelný režim bylo ověřeno cíleně, nikoli dalším celým během.

Přesné dokončené běhy (prefix `test-results/ui-stabilization-`, JSON a trace jsou ignorované; žádné automatické retries):

| Výstup/běh | PASS | FAIL | Co řešil |
| --- | ---: | ---: | --- |
| focus | 1 | 1 | návrat po Escape vs změně motivu |
| focus-diagnostic | 0 | 1 | diagnostika focusu |
| focus-stack | 0 | 1 | stack dokládající opakovaný enterMode |
| scroll-before | 0 | 1 | původní metrika scrollY, doložená stejná pozice tlačítka |
| target3 | 5 | 0 | původních pět blokovaných scénářů po prvních opravách |
| target4 | 11 | 1 | rozšířené regrese; generic Event neměl submitter a ukládal koncept |
| webkit-target | 2 | 1 | před konečnou opravou selectu |
| webkit-layout, layout2, layout3, layout4, layout5 | **0 každý** | **1 každý** | pět diagnostických běhů stále přetékajícího nativního selectu |
| webkit-layout6 | 0 | 1 | přetečení odstraněno; test ještě předpokládal sticky akce |
| photo | 0 | 1 | doplněná konzolová kontrola odhalila konkrétní chybějící fixture vlastního média |
| photo2 | 1 | 0 | retry + read recovery + reload, včetně nulových neočekávaných API/chyb |
| webkit-target2 | 3 | 0 | celý registrační scénář a předběžný plán 1440/390 |
| confirmation | 3 | 0 | potvrzení bodů, přílohy a obnova |
| regressions | 18 | 1 | A1/A2, focus, konflikt; stejný závod automatického GET s ručním klikem |
| admin-final | 1 | 0 | dokončený ruční průchod, ještě bez řízené bariéry |
| chromium-full | 308 | 1 | jediný úplný Chromium |
| final-target | 5 | 0 | bariéra retry, negativní cache-poison kontrola, A1 |
| context-final | 5 | 0 | context vstupu, focus/Back, publikovaná kategorie a chyba start/close |
| visibility-final | 3 | 0 | poslední dotčené návraty/viditelný režim |
| webkit-full | 136 | 0 | jediný celý projektový WebKit výběr |

Dva časné reprezentativní běhy `target1/target2` a `admin-diagnostic` nemají dokončený JSON: runner byl ukončen při nedokončeném ukončování lokálních procesů. Nejsou vydávány za PASS ani sčítány do úplných běhů. Jejich dílčí logy sloužily diagnostice; navazující běhy byly dokončené. Neprovedené části původně blokovaných scénářů nyní doběhly v uvedených dokončených kontrolách.

Přímo dotčené Node kontroly: `admin-module-graph.test.mjs`, `live-navigation-local.test.mjs`, `united-live-frontend.test.mjs` — dva samostatné běhy **11/11 PASS** při změně verzí. Při zpřesnění context guardu následovalo **4 PASS / 1 FAIL** z pěti kontrol (doslovná kontrola pořadí renderu); pořadí existujícího bezpečného vstupu bylo zachováno a následný běh je **5/5 PASS**, bez změny Node testů. Celá sada 555 testů nebyla opakována.

Syntax 18 změněných JS/MJS a `git diff --check`: PASS.

## Cache, vizuální kontrola a hranice

Token **20261011-ui1**: změněné LIVE moduly, jejich vstupy a member.css. Zahrnuta také návaznost dosud nepublikovaného A1 detailu člena: member-detail → command-cards/dashboard, reservations-payments, moderation, mailing contacts/index → admin.js. Tyto návazné soubory mění pouze importní URL. Schválená mapa a parser potvrdily jednu runtime URL pro každý zdroj; nezměněné společné moduly si ponechávají vlastní tokeny.

Screenshoty byly skutečně otevřené: malé dialogy 360 × 520 dark/light, tablet 1024, hlasovací dialogy 360/390/1024/1440 z existujících regresí, potvrzené body/chyba čtení Adminu 390 dark a 1440 light, členské photo retry 390 dark a 1440 light. Posuzovány kontrast, dosažitelnost akcí, překrytí a šířka. Nejde o celkový nový audit všech obrazovek ani všech kombinací.

V této dávce nezůstává nový doložený neopravený aplikační nález v uvedených pěti bodech. Poslední úplný Chromium výsledek ovšem zůstává červený kvůli následně cíleně opravenému testovému závodu. Jiné nálezy původního auditu (např. serverové validace/kvóty fotografií) se neřešily.

Neověřeno: skutečný telefon, mobilní klávesnice, fyzická kamera, produkční Firebase relace, skutečné R2/SMTP ani všechny kombinace výpadků/účtů/ročníků. Izolované handlery a paměťové úložiště nejsou důkazem produkčního průchodu. Obchodní nastavení ani produkční data nebyla čtena/měněna touto dávkou, žádné migrace, e-maily, produkční uploady, CI, push nebo deployment.

## Soubory a Git

HEAD: **74de30f6cc96d238ddcfdc1ab00ad136d46c33f4**, main je dvě lokální předání před origin/main. Nová aplikační dávka není staged ani commitnutá.

- Logika/layout: `member/modules/live.js`, `admin/modules/live.js`, `member.css`.
- Vstupy/cache: `member.js`, `member.html`, `admin.js`, `admin.html`, `admin/command-cards.js`, `admin/dashboard.js`, `admin/modules/{reservations-payments,moderation}.js`, `admin/modules/mailing/{contacts,index}.js`, `scripts/{admin-module-releases,check-admin-module-graph}.mjs`.
- Regrese: `tests/e2e/{feedback-member,live-judge-workflow,live-next-local,live-photo-flow-local,preliminary-reservations,united-live-repair}.spec.mjs`.
- Nový report: `docs/ui-stabilization-local.md`.
- Zachováno mimo dávku: untracked `docs/project-audit-2026-10-09.md` a `scripts/audit-20261009/`.

Pracovní strom je záměrně nečistý: 21 modifikovaných souborů této dávky + nový report a dříve zachovaný audit/diagnostiky. Worker, schéma, migrace, sazby, závislosti, Actions a aktivace služeb nemají změny.

## Publikační kontrola

Při schválené přípravě publikace byly dodatečně sjednoceny pouze zděděné importní URL `member/ui.js` a `member/modules/planner/payments.js` na jejich stávající společnou verzi `20260924-merch2`. Jejich obsah se nemění. Navazující změněné členské moduly používají `20261011-ui1`, aby stará cache nevrátila rozdvojené importy. Statická kontrola nyní potvrzuje jednu URL všech 47 zdrojů Member graphu; existující Admin module graph také prošel bez chyb a cyklů. Žádné nové aplikační opravy, backendové změny ani změny pravidel.

Výše uvedené úplné testovací výsledky zůstávají výsledky lokálního předání: Chromium 308 PASS / 1 FAIL s následným cíleným ověřením opraveného testového závodu, WebKit 136/136 PASS s následným cíleným ověřením vstupu do LIVE. Při publikaci se tyto sady neopakovaly; kontrolována byla syntax změněných JS/MJS, graf importů a diff. Publikační změna cache URL není vydávána za nový úplný browser průchod finální verze.
