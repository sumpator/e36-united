# Kompaktní Admin přehledy — lokální změna

Výchozí commit: `872e97e974501b47725ea437fab8ddb2e005fb45`.
Větev: `feat/admin-compact-overviews`. Bez rollout autorizace.

## Rozsah

- Členové a Historie mají společnou identitu karty, 2/3/4 desktop sloupce a jeden mobilní sloupec. Historie zachovává jednotlivé ročníky, dva nezávislé schvalovací komponenty a oddělené privátní důkazy. Rozbalení nenatahuje sousední kartu.
- Fotografie pochází pouze z `is_primary=1`, s existujícím pořadím `created_at,id` pro auto a `sort_order,id` pro fotografii. Bez fotografie zůstává United fallback. Jde o dekorativní identifikátor, nikoli historický důkaz.
- Pending souhrn sčítá rezervaci vybraného eventu, účast, S&S a komunitní fotky samostatně. Priorita odkazu: rezervace → historie → fotky. `queueMember` zachovává přesný filtr i při reloadu/Back; historie otevírá všechny ročníky. Upozornění dovoluje filtr člena zrušit. Neznámá data nejsou prezentována jako nula.
- Nové karty nemají samostatné JSON requesty. Jejich lazy privátní média jsou coalescovaná podle cesty/verze uvnitř listu. Nezměněný Member list se při zavření detailu neremountuje. Přímý Member deep link nespouští fotografie zakrytého listu.
- Cleanup invaliduje generaci, odpojí observer, abortuje request, odpojí consumery a uvolní vlastněné URL právě jednou. Jediný off-DOM decoder dokončí rozpracované dekódování před revoke; po opuštění kontextu se jeho výsledek nikam nepřiřadí. Není zde timer, retry ani filtrování console chyb.
- Duplicitní United Club menu odstraněno; jeho historické URL vedou na Členy. Club sekce Member 360 zůstává. Mobilní menu má funkční Komunitu, toggle, X, backdrop, Escape a explicitní návrat focusu také ve WebKitu.
- Foto akce se zalamují; náhled ubytování má nejvýše 160×112 px (mobil 96×96), s větším dialogem a zachovanou správou fotografie.
- Naplněný detail rezervace byl vizuálně a funkčně ověřen. Již používá dva sloupce, proto nebyl dále přestavován; rozepsaná platba zůstává zachovaná přes Member 360.

## Podmíněně odloženo

Member 360 pending badge nebyl přidán: listová projekce není vždy dostupná při přímém odkazu nebo hledání. Spolehlivé napojení by vyžadovalo další lifecycle/invalidation propojení nebo header API změnu. Existující sekce se kvůli tomu nenačítají.

Dashboardové preview položky nebyly přidány: současný summary má počty, nikoli potřebné identifikované položky s médii. Schvalovací blok zůstává prioritní a nebyl samostatně zmenšen.

## Úzký datový dopad

`presentation=cards` je aditivní opt-in do existujících Members/History list API. Původní odpovědi bez opt-in zůstávají nezměněné. Jeden další SQL statement zpracuje pouze unikátní ID právě vrácené stránky: Members nejvýše 30 (hledání 20), History podle existujícího stránkování. Prázdná stránka nedělá další dotaz. Nejsou změny schématu, indexů, autorizačních pravidel ani 60/300s koordinátoru.

Reprodukce: `node scripts/check-admin-card-projection.mjs`. Skript používá izolované SQLite fixtures, volá skutečné handlery a vypisuje provedený SQL, bindings a `EXPLAIN QUERY PLAN`.

| Fixture endpoint | Vrácené záznamy / unikátní členové | SQL před → po |
| --- | --- | --- |
| Members | 3 / 3 | 2 → 3 |
| History (all) | 1 / 1 | 5 → 6 |

Plán používá PK Members/Cars/Photos, `idx_cars_member`, `admin_car_photos_car`, unikátní `(member_id,event_id)` Reservations, `admin_history_member_sns` a `admin_gallery_member`. Žádný globální JOIN nenásobí počty. Dvě attendance agregace projdou historii příslušného člena; SNS a gallery mají odpovídající indexový rozsah. Výběr hlavního auta stále používá malý owner-bounded sort (`USE TEMP B-TREE FOR ORDER BY`); samotný LIMIT není vydáván za limit procházených řádků.

Počet SQL statementů není počet účtovaných řádků. `Cloudflare meta.rows_read` nebylo měřeno. HTTP fanout listu se nemění; fotografie viditelných karet přidají privátní media GET (existující Admin auth, jeden ownership SQL, R2 read), nikoli Garage/header/history JSON na kartu. Bez nových storage kopií, bez D1/R2 zápisů. OPTIONS nečte D1. Testovací fixture neposkytuje měření produkčního účtování.

## Ověření a cache

Admin module graph používá jediný token `20260910-admin-compact-r1`, bez cyklů či nezverzovaných lokálních hran. Mailing soubory mají pouze mechanickou změnu tohoto tokenu; jejich chování není součástí změny. Public video `cGfcolaqczM`, veřejný Planner a Member aplikace nebyly refaktorovány.

Regresní testy pokrývají počty a rozsahy, prioritu/persistence fronty, rozhodnutí a nový souhrn, lazy/coalesced média, decode/cleanup race, Back, nezávislou výšku historie, desktop/mobile akce a payment dirty state. Stávající menu assertions nyní vyžadují odstranění duplicitní položky; původní Club funkce zůstává testovaná. Hero-only testy vstupují existujícím vyhledáním člena, aby nemíchaly URL listových fotografií s vlastnictvím hero a zachovaly skutečný SPA návratový kontext. A→B nad listem explicitně dokončí listová média před aktivací bariéry pro hero request; nepřidává časové čekání.

Screenshoty jsou lokální syntetická data v `test-results/compact-*`, nikoli produkční kontrola. Prohlédnuty Members desktop/mobile, rozbalená History, foto akce, ubytování a naplněná rezervace. Původní vývojový runner byl po dokončení test bodies přerušen při shutdownu a není počítán jako úspěšný gate. Další běhy používají samostatně spuštěný existující lokální test server, bez změny runner konfigurace či timeoutů. Sandbox blokoval YouTube miniaturu; příslušný nezměněný veřejný test mimo sandbox prošel.

Finální výsledky (10. 9. 2026): Node **399/399**, Chromium **143/143** (3,2 min), focused WebKit **112/112** (7,9 min), syntax **121 JS souborů**, cache/module graph **bez cyklů a chyb**, `git diff --check` **PASS**. Oba browser runnery skončily s **exit 0**, žádný retry ani flaky průchod. Node gate zahrnuje stávající migrační/FK a budget regresní kontroly. Finální browser logy a screenshoty: `test-results/compact-chromium-accepted` a `test-results/compact-webkit-final` (sousední `.log` soubory). Nové foto/navigation scénáře jsou zařazené do obou browser projektů. Vzdálený Linux CI nebyl spuštěn; tyto výsledky jsou lokální Windows ověření, ne produkční smoke.
