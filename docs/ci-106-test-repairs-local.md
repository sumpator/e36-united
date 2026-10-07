# CI #106 — lokální oprava testů

Základ: `26b7c730c80aa0cc1e30d9456ba7b9c5477df885`, větev `main`.
Při zahájení byl pracovní strom čistý. Změny zůstávají bez commitu, pushnutí a nasazení.

CI #106 skončilo v `node --test tests/*.mjs`: 442 úspěšných a 113 neúspěšných z 555 testů. Checkout i setup-node v7 prošly; jejich verze ani workflow nebyly změněny.

## Společné příčiny a zdůvodnění očekávání

| Skupina | Oprava a zachovaný význam kontroly | Podklad současného chování |
| --- | --- | --- |
| Neúplné databázové fixtures | Doplněny `events.title`, LIVE a nullable cenové sloupce. Pro scénáře zaměřené na ubytování/konverzi je vstupné výslovně nastavené na testovací nulu. Nová rezervace používá cenový snapshot a skutečný izolovaný platební deník. Starý platební PATCH je dál testovaný na staré rezervaci s `admission_czk IS NULL`. | [Příjezdy](arrivals-local.md): neznámé vstupné není nula; nové platby nejsou přepis agregátu. |
| Historické schéma použité s novým Workerem | Testy konkrétní migrace stále ověřují její přesný předchozí/následující stav. Test současného Workeru pak dostane všechny navazující části schématu. Mailing C se porovnává s jeho tehdejším následným schématem, nikoli s pozdějšími LIVE sloupci. | Samostatné explicitní migrace v `db/migrations`; jejich datové a FK kontroly zůstávají. |
| Zápisy do `event_member_presence` | V nynějším schématu jde o pohled. Fixtures zakládají skutečný potvrzený příjezd auta v izolované databázi. QR test prokazuje čtení bez zápisu, odmítnutí starého check-in příkazu a následné potvrzení přes skutečný handler Příjezdů. Identitu soutěžního auta čte z `live_entry_vehicles`. | [Příjezdy](arrivals-local.md), [výběr účastníků](arrivals-picker-local.md): žádný odhad převodu starých check-inů; jedna identita auta. |
| Chybějící VM závislosti | `united-live-audit` používá skutečný `createPhotoBatch`, programové pomocné funkce a skutečný kód `live-history` v izolovaném VM. Doplněno potřebné DOM/history rozhraní. Neočekávané uploady a čtení médií v tomto harnessu vyhodí chybu. | [Navigace LIVE](live-navigation-local.md), [fotografie](live-photo-theme-local.md). |
| Staré pravidlo změny bodů | Nová sada posílá `expectedVersion: 0`. Změna potvrzené sady posílá aktuální verzi, výslovnou opravu a důvod. Migrační test nadále vyžaduje přesně jeden posun revize a navíc kontroluje autora, důvod a verze auditu. | [Jedna oficiální sada](live-next-local.md): CAS a audit oprav. |
| Staré pravidlo hlasů/vlastního auta | Existující veřejný hlas lze upravit po uzavření auta, pouze dokud běží kategorie; po jejím uzavření se další změna odmítne. Serverově oprávněný admin/porotce může hodnotit vlastní auto oficiálně i samostatným veřejným hlasem. Běžný člen má nadále zákaz vlastního veřejného hlasu a nemůže zapisovat oficiální body. | [Pravidla LIVE](live-next-local.md), [oprávnění Příjezdů](arrivals-local.md) a výslovné původní zadání Příjezdů. |
| Změněné navigace a hlavičky | Admin má i Příjezdy a Merch. Členský Merch má vlastní objednávkový panel; veřejný katalog zůstává samostatný odkaz. Přehled ponechává oslovení, ostatní sekce společný titul. Duplicitní docházka z hero byla odstraněna, ale zůstává v členské kartě. Účet má oddělený adresní editor a existující QR; chybějící QR se normalizuje na `null`. Prázdný a bezhodnotový HTML atribut `data-logout` jsou ekvivalentní; počet akcí i společný handler zůstávají kontrolované. | [Portál](portal-next-ux-local.md), [kompaktní kompozice](portal-composition-ux-local.md), [veřejný/členský UX](public-member-ux-local.md), [Merch](merch-commerce.md). |
| Club a bodový panel | Tři hlavní pohledy jsou Body a výhody / Moje účasti / Moje ocenění; seznam členů je samostatná sekundární akce. Pomocný test spouští skutečný přepínač a ověřuje viditelnost i `aria-pressed`, kliknutí a návrat z neplatné volby. Panel má celkové body, dvanáct segmentů, „Do další odměny“ a konfigurovanou výhodu. Čtyři aktivity mají schválené stručné zisky a přesné podmínky; nevrací se odstraněné velké nadpisy ani pevně napsaná výhoda. Barvy využívají současné tematické proměnné. | [Portál](portal-next-ux-local.md), [dokončení kompozice](portal-composition-ux-local.md). |
| Fotografické ovládání a LIVE rozhraní | Lokální náhled ubytování je nyní v existující sdílené frontě, stále se ověřuje skutečné vytvoření blob URL. Fotoaparát a vícenásobný výběr z galerie mají samostatné vstupy. Admin LIVE používá Příjezdy a média podle ročníku/auta, včetně hosta bez účtu. Rušení konceptu se kontroluje podle funkce/ovládání a současné potvrzovací hlášky. `sessionStorage` slouží členským upozorněním, režim LIVE zůstává v `localStorage` podle účtu a ročníku. | [Fotografie](live-photo-theme-local.md), [Příjezdy](arrivals-picker-local.md), [navigace LIVE](live-navigation-local.md). |
| Zastaralé cache tokeny a testovací singleton | Kontrola grafu má pevný seznam schválených verzí jednotlivých modulů. Dál odmítá neznámý/neversionovaný modul, starý token, další identitu URL, rozdělený sdílený stav, cyklus a nepovolený externí import. HTML používá novější `appearance.js`, nezměněný theme CSS starší token. Test členského detailu importuje stejnou URL `admin/state.js` jako skutečný modul. | Předávací reporty výslovně zachovávají tokeny nezměněných závislostí; [navigace LIVE](live-navigation-local.md). |
| Zastaralé SQL snapshoty | Historické rozpočtové JSON zůstaly beze změny. Testovací adaptér explicitně přidává pouze schválené projekce titulů, LIVE a vstupného. Header zahrnuje přesně definovaný dotaz Příjezdů omezený členem/ročníkem. Nadále se porovnávají dotazy, parametry a tam, kde byly kontrolované, plány; zachovány testy stránkování, úplných payloadů a nulových zápisů. Původní nevyhovující rozpočtový cíl se nepřeklasifikoval na splněný. | [Příjezdy](arrivals-local.md), existující `docs/admin-*-budget*.json` a jejich původní kontrolní scénáře. |

## Opravené soubory

Databázové a serverové testy:

- `tests/admin-safe-operations.test.mjs`
- `tests/event-accommodation-phase1.test.mjs`
- `tests/planner-sync.test.mjs`
- `tests/preliminary-reservations.test.mjs`
- `tests/production-feedback.test.mjs`
- `tests/reservation-payment-phase1.test.mjs`
- `tests/reservation-requests.test.mjs`
- `tests/mailing-delivery.test.mjs`
- `tests/live-photo-flow-local.test.mjs`
- `tests/photo-live-release.test.mjs`
- `tests/united-live-audit.test.mjs`
- `tests/united-live-cars.test.mjs`
- `tests/united-live-migration.test.mjs`
- `tests/united-live.test.mjs`

Rozhraní, stav a rozpočtové kontrakty:

- `tests/accommodation-visual-system.test.mjs`
- `tests/admin-budget-closure.test.mjs`
- `tests/admin-command.test.mjs`
- `tests/admin-dashboard.test.mjs`
- `tests/admin-information-architecture.test.mjs`
- `tests/admin-member-hero.test.mjs`
- `tests/admin-member-presentation.test.mjs`
- `tests/admin-module-graph.test.mjs`
- `tests/appearance.test.mjs`
- `tests/member-frontend-foundation.test.mjs`
- `tests/member-overview-club-ux.test.mjs`
- `tests/member-portal-phase-a.test.mjs`
- `tests/member-portal-phase-a1.test.mjs`
- `tests/united-club-ux.test.mjs`
- `tests/united-live-frontend.test.mjs`

Testovací infrastruktura:

- `scripts/check-admin-command-budget.mjs`
- `scripts/check-admin-module-graph.mjs`
- `scripts/admin-module-releases.mjs` — nový pevný seznam verzí
- `tests/helpers/admin-budget-current.mjs` — explicitní dodatky historických SQL projekcí
- `tests/helpers/club-navigation.mjs` — skutečný přepínač Clubu v izolovaném VM
- `tests/helpers/live-fixtures.mjs` — potvrzené příjezdy pouze v izolované fixture
- `tests/helpers/reservation-payments.mjs` — skutečné tabulky a triggery plateb z existující migrace

## Výsledek kontrol a omezení

Během oprav byly spouštěny pouze dotčené testovací soubory. Poté celá Node sada proběhla právě jednou:

- `node --test tests/*.mjs`: **555/555 PASS**, 0 fail, 0 skipped, 0 cancelled.
- Syntax všech 36 změněných/nových JS/MJS: **PASS**.
- `git diff --check`: **PASS**.

Žádný test nebyl smazán ani přeskočen. Z opravených selhání se nepotvrdila skutečná aplikační chyba. Aplikační soubory, Worker, schéma/migrace, workflow, závislosti a lockfile nebyly změněny. Lokální databáze a VM používají izolovaná data; produkční služby se nevolaly. Browser sada ani produkční průchod nejsou touto dávkou ověřené.

HEAD zůstává na výchozím commitu. Opravy a tento report jsou necommitnuté. CI nebylo znovu spuštěno, nic nebylo publikováno ani nasazeno.
