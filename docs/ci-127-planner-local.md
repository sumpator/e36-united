# CI #127 — stabilní tlačítko Planneru (27. 10. 2026)

Výchozí HEAD e3ddfcbd73a852e12aef7dc442989c053a866437. Zachován upravený report A3/A4, nesledovaný audit a diagnostiky mimo tuto dávku. Webhook, jeho secret, SMTP2GO a provozní přepínače se nemění; rotace ani bezpečnostní audit do této dávky nepatří.

## Doložená příčina: aplikace / CSS hover

Použity již stažené podklady CI #127 v .local-evidence/smtp2go-webhook-20261026/ci-failure/. Nic se nestahovalo znovu. Selhal test PLAN handoff never overwrites silently and open registration keeps failed conversion active, druhé otevření Planneru po změně registrací na open, tlačítko Odeslat ke schválení. Předchozí předběžný plán byl uložený; cílem dalšího kliknutí byla validace chybějícího auta, nikoli vytvoření rezervace.

Trace: kurzor po kliknutí na otevření zůstal na x=654.09 / y=698.22 (1280×720). Následující call@17418 čekal 7005.837 ms na stabilitu tlačítka. Browser dál vykresloval snímky a obraz se aktualizoval. Samotná trace neprokazovala příčinu změn geometrie, proto nebylo selhání označené za rozdíl Windows/Linux nebo chybu testu.

Kontrolovaná regrese umístila kurzor 0.5 px nad spodní hranu tlačítka a poté provedla původní obyčejný locator.click. Před opravou vyvolala stejný WebKit timeout bez sleepu, force, retries nebo změny limitu.

Měření requestAnimationFrame na původním CSS: stejný DOM uzel (id=1), výška 52 px, dialog y=20 / h=680 a scrollTop=0; v posledních 100 vzorcích i window.scrollY=243 beze změny. Přesto tlačítko kmitalo y=645–647, transform=translateY(0 až -2 px), se 25 přechody hoveru. rAF pokračoval (mezery 54–179 ms). To vylučuje výměnu tlačítka a zamrznutí stránky jako vysvětlení tohoto reprodukovaného selhání. Počáteční scroll a načtení fotografie skončily, ale kmitání trvalo dál.

Příčina je sdílené .member-primary:hover {transform:translateY(-2px)}: tlačítko na hraně ujede zpod kurzoru, ztratí hover, vrátí se pod kurzor a cyklus se opakuje. Nejde o čekání testu na jednorázové dokončení legitimní animace. Lokální reprodukce shoduje souřadnici hrany a příznak nestability z CI; konečný Linux průchod doplní automatické CI finálního SHA.

## Minimální oprava

- member.css: výhradně hlavní tlačítko v .reservation-change-planner-host .reservation-edit-actions při hoveru nepoužívá transform. Stín a ostatní zvýraznění zůstávají. Půdorys, rozložení, barvy a obsah se nemění.
- member.html: jediný odkaz na member.css aktualizován na 20261027-planner1. JS/importy zůstávají beze změny; nevzniká druhá runtime verze stylesheetu.
- tests/e2e/preliminary-reservations.spec.mjs: existující selhavší scénář nově nastaví kurzor na reprodukující spodní hranu a dál používá normální kliknutí. Zachované všechny následné assertions: chybějící auto je vysvětlené, původní plán active, počet reservations=0, žádné neočekávané klientské/API chyby. Žádná očekávání neoslabena.

Po opravě změřeno transform=none a y=647/h=52 po všechny vzorky v obou prohlížečích. Kliknutí skutečně pokračuje do validace auta. Výpočty, kapacity, zápis konceptu, API a business logika nebyly změněny.

## Přesné lokální kontroly

Jednotlivé běhy, nikoli jeden souhrnný plný suite:

| Běh | Výsledek |
| --- | --- |
| První pokus o lokální konfiguraci | Server nenašel relativní cestu kvůli cwd ignorovaného configu; žádný aplikační scénář neběžel. Opraveno pouze cwd diagnostického configu. |
| Řízená hrana před opravou, WebKit | 1 FAIL: původní 7000ms nestabilita tlačítka. |
| Stejná reprodukce s měřením geometrie před opravou | 1 FAIL: stejné kmitání, důkaz uložený v geometry-summary-before.json. |
| Původně selhavší scénář po opravě | WebKit 1/1 PASS + Chromium 1/1 PASS. |
| Kontrolované měření po opravě | WebKit 1/1 PASS + Chromium 1/1 PASS, stabilní geometrie. |
| Přímo dotčené sousední průchody po cache aktualizaci | **WebKit 12/12 PASS + Chromium 12/12 PASS**, 0 skipped/retries. |
| Úzce zaměřené vizuální ověření | WebKit 1/1 PASS; screenshoty 1280 light, 1440 dark, 390 light/dark, 820 light skutečně otevřeny a prohlédnuty. Akce čitelné a dostupné, bez posouvání tlačítka při hoveru. |
| Statické kontroly | Syntax změněného MJS a git diff --check PASS; ověřen jediný verzovaný odkaz member.css v member.html. |

Sousední výběr zahrnuje předběžnou registraci 390/1440, pobyt/ubytování/posádku/auto, zachování a výslovné přepsání plánu, zavřené registrace, schválenou rezervaci a žádost o změnu, ponechání nedostupné schválené varianty a focus při zavření, přidání auta do prázdné i existující garáže včetně chyby refreshu bez duplikace, obnovení konceptu, serializované autosave a návrat přes přihlášení.

Lokálně Windows, Node 24.22.1, Playwright 1.62.1 / WebKit 26.5. CI trace je Linux se stejným Playwright 1.62.1 / WebKit 26.5. WSL/Linux není lokálně dostupný a nebyl instalován. Plné již zelené Node/browser sady se lokálně neopakovaly. Přesný výsledek jednoho automatického CI, Pages a HTTP ověření je v závěrečném předání a ignorovaném publication-result.json; tento report předem netvrdí úspěch CI.

Důkazy a diagnostické configy: ignorovaná .local-evidence/ci127-planner-20261027/, mimo čištěné test-results. Nejsou součástí commitu. Žádný Worker deployment, migrace, produkční business zápis, objednávka, platba, e-mail nebo přepnutí služby není pro tuto frontendovou opravu potřeba.

## Zbývající kroky pro ostré spuštění

Doplnit skutečnou identitu a kontaktní údaje prodávajícího, ostrý účet/IBAN/příjemce a závazně potvrdit dopravu, termín, osobní odběr a vratkovou adresu. Dokončit a schválit skutečné obchodní dokumenty a uložit již schválených 0 % v ostré konfiguraci; pracovní fiktivní údaje nepřebírat. Potom samostatně schválit jednorázovou aktivaci: kontrola fronty a nejasných pokusů bez slepého retry, zachování hranice první aktivace bez rozeslání starých skipped zpráv, následné zapnutí transportu a objednávání. Na první legitimní zprávě ověřit skutečné doručení a korelaci callbacku. Technické zapojení dvou klíčů a nastavení webhooku se znovu neotevírá. Do té doby transport OFF a Merch paused.
