# UNITED LIVE — cílený audit workflow

23. 9. 2026. Audit, nikoli implementace opravy. Žádné CI, produkční zápisy, commit ani deployment.

## Výsledek a ověřený základ

Nejde pouze o problém cache nebo neuložených známek. Jsou doložené **dvě chyby vstupu do Admin LIVE**, **nedokončené převzetí starého soutěžního auta do kategorií** a **mezery v obnově projekcí po zápisu**. Uložené porotcovské hodnocení v produkční databázi existuje.

- Čistý výchozí `main`, lokální `origin/main` a aktuální vzdálený `refs/heads/main`: `7f8b8f5e9cbea0a5bdc1d0ed6f47091b3d4ee93a` (ověřeno `git ls-remote`, nikoli jen podle starého reportu).
- Nejnovější produkční Pages: `06b3173e-3178-49d0-bc46-23d23de65480`, source `7f8b8f5`, [deployment](https://06b3173e.e36-united.pages.dev).
- Aktivní Worker verze `0f2a2eee-915f-4336-b5d8-5ffe453ab77a`, 100 %; deployment z 22. 9. 18:30:06 UTC označen přesným výše uvedeným SHA. Novější deployment seznam neobsahoval.
- Veřejný `admin/modules/live.js?v=20260922-live5`: HTTP 200, obsah přesně shodný s lokálním souborem, včetně vadného `current.entry.category`. Neprokazuje to obsah cache konkrétního uživatelova počítače, ale závada existuje i v aktuálním servírovaném souboru.
- Read-only D1: `united-2026` je současně current a LIVE aktivní; běžné registrace `closed`. Show & Shine `live`, verze 3, aktuální Orange; výfuk `idle`, bez aktuálního auta. Tabulka kategorií obsahuje pro tento ročník **0 řádků**.
- Dva omezené produkční SELECTy: `rows_written=0`, `changed_db=false`. Nebyly čteny QR tokeny, hesla ani interní poznámky.

Značky důkazů: **R** reprodukováno na skutečné aplikační funkci s izolovanými závislostmi; **T** cílený lokální test; **K** statická návaznost kódu; **P** read-only produkční údaj; **N** neověřeno v reálném prohlížeči/zařízení. VM test není vydáván za browser smoke.

## A. Správný proces a současné datové hranice

| Krok | Rozhodující zdroj, frontend a backend | Zápis / zastavení / pokračování |
|---|---|---|
| Přihlášení a role | Firebase token → `worker/router.js` → aktivní `members` podle UID. Admin navíc `role=admin`; porotce aktivní admin **nebo** `event_live_judges` pro ročník. Role se neurčuje QR ani názvem účtu. | Bez tokenu 401; neaktivní člen/admin 403. Obnovit přihlášení, ne měnit roli ve storage. |
| Výběr ročníku | Admin `selectedEventId` z route/selectoru, jinak current event. Členské `/api/live` a `/api/live/state` vybírají `live_enabled=1`, nikoli `is_current`. `adminLivePayload` vrací selected i active event. | Čtení. Tyto tři ročníky se mohou lišit. Adminovo hodnocení a načtená vlastní historie musí patřit stejnému ročníku. |
| Dostupnost a vstup | Member probe + potvrzení; Admin startup/load + potvrzení. Vstup přepíná `hidden/inert`, ne globální příznak. Volba `*.LiveMode.v2.<UID>.<event>` je lokální pro zařízení. | Čtení + browser storage. Chyba načtení má nabídnout retry; dnes ji mohou vyvolat chyby C1/C2 níže. |
| Obnova / odchod | Přímý odkaz a uložená volba spouštějí startup; nový počítač má potvrzení znovu. Reset maže koncepty a privátní média. Odchod zastaví polling a vrátí portál. | Žádný PUT na event při odchodu. Potvrzení vstupu nemá znamenat zapnutí LIVE. |
| QR / přítomnost | Member zobrazí existující `E36U1:` identitu. Admin kategorie → QR / výběr člena → auto. `BarcodeDetector` nebo ruční parser → chráněný resolver správného eventu. | Resolver pouze čte. Až samostatný PUT `.../members/:id/presence` zapíše přítomnost a potvrzujícího admina. Bez kamery použít výběr člena / celý QR obsah. |
| Veřejný hlas | Aktivní člen + **approved registrace v LIVE eventu**, cizí představené auto, živá disciplína, neuzavřená kategorie. Zaplacení ani check-in nejsou podmínka. Frontend `me.eligible`; server znovu ověřuje. | PUT `/api/live/votes/:entryId`, celé číslo 1–10. Upsert jednoho hlasu. Chyby own/registration/paused/closed zachovají možnost návratu. |
| Připravit/startovat auto | Admin vybere kategorii, člena a jedno jeho auto. Server: approved registrace, přítomnost, vlastnictví auta; S&S navíc `show_shine='Ano'`, karoserie odpovídá kategorii; globální LIVE zapnuté. | POST `.../live/start`: entry + kategorie + current state + presented time; očekávaná verze. Vlastní auto startovat lze, hodnotit ne. Platba se nekontroluje. |
| Porotcovské hodnocení | Čtyři známky 1–10, ID konkrétní entry; backend z entry odvodí event/auto a z tokenu hodnotitele. Aktivní admin nepotřebuje eventové přiřazení, vlastní registraci, platbu ani check-in. | PUT `/api/live/judge/scores/:entryId`, `submitted=true` vyžaduje všechny známky; koncept smí být neúplný. Poznámka soukromá, fotografie samostatný upload. |
| Potvrzení / opětovné čtení | UI čeká na PUT, potom případné fotografie, potom GET. Historie se získá JOINem vlastního `judge_id`; výsledky jen submitted záznamy. | Upsert zachová jeden záznam; chyba ponechává draft. Selhané foto je označeno jako částečný úspěch. Obnova projekce má mezery C5/C6. |
| Oprava / zrušení konceptu | Member porotcovská historie umí otevřít vlastní starší hodnocení; server dovolí změnu do uzavření. Admin historie dnes pouze vypisuje počty, starší formulář neotevírá. | Zrušení konceptu maže jen lokální Map/files, ne DB. Uložení jednoho porotce není dokončení auta ani kategorie. |
| Uzavřít / zveřejnit | `close_category` s verzí uzavře danou kategorii; je-li aktuální, uvolní current entry. Publish S&S vyžaduje aspoň jednu closed a žádnou live kategorii. | Globální event zůstává zapnutý. Publikují se agregace, ne interní poznámky či identity hlasujících. |

Implementační zdroje: [router](../worker/router.js), [role](../worker/auth/admin.js), [LIVE backend](../worker/domains/live.js), [Admin LIVE](../admin/modules/live.js), [Member LIVE](../member/modules/live.js), [Admin startup](../admin.js), [QR parser](../worker/admin/member-qr.js).

Registrace není přihlášení. Předběžný plán není approved rezervace. Zaplacení není check-in. Přítomnost není soutěžní entry. Entry není hlas. Admin není automaticky majitel právě hodnoceného auta.

## B. Scénáře a důkazy

| Scénář / role a podmínky | Očekávání | Skutečnost / důkaz | Závěr |
|---|---|---|---|
| Anonymní | Žádné privátní LIVE ani zápisy | Router ověřuje Firebase před LIVE routami (K) | Správná hranice; online login neprováděn |
| Aktivní člen bez registrace | Podle dosud platného backend kontraktu nesmí veřejně hlasovat | `eligible=false`, PUT `approved_registration_required` (T) | Produktová otázka F1, ne check-in chyba |
| Předběžná / pending registrace | Nemá approved oprávnění | Context čte pouze reservations, vyžaduje `approved` (K) | Nezaměňovat se zaplacením |
| Approved bez check-inu, cizí auto | Veřejný hlas povolen | Cílený test odstraní presence a uloží i upraví hlas (T) | Funguje bez check-inu |
| Approved s check-inem | Totéž; může být způsobilý i ke startu auta | Start a veřejný upsert testovány (T) | Přítomnost rozšiřuje start, ne hlasování |
| Admin bez přiřazení porotce | Porotcovské hodnocení povoleno | Izolovaný admin bez registrace/check-inu/assignment uloží a znovu načte (R); Lameb0y již má uložený score (P) | Backend funguje |
| Admin → cizí auto | Čtyři známky se uchovají | Dvě PUT + nový GET: poslední overall=9, jeden řádek (R) | Není doložena obecná ztráta zápisu |
| Admin → vlastní auto | Start ano, vlastní score/vote ne | Start vlastního auta a `own_car_score` (T); business403 nerevokuje admina (R) | Správná kontrola |
| Více aut / jiná kategorie | Explicitní auto, žádný odhad kategorie | Výběr vrací obě auta; nesoulad vrací `category_mismatch` (T/K) | Výběr libovolného vlastního auta možný; otázka F2 |
| LIVE vypnuté | Člen nevstoupí; admin smí zapnout mimo LIVE | Start `live_disabled` (T), běžné Nastavení nemá ovládání (K) | Chybí nezávislá cesta |
| Kategorie idle/live/closed | Start, hlasování, uzavření odpovídají stavu | Nové entry fungují; closed odmítá score, jiná kategorie/event zůstává (T) | Legacy stav je výjimka C3 |
| Opakovaný start / ztracená odpověď | Jedna entry | Cílený test včetně serializovaných konkurenčních batchů (T) | D1 reálnou paralelní síť tím nesimulujeme |
| Opakované uložení | Jedna vlastní hodnota | UNIQUE + upsert, dva zápisy/jeden řádek (R/T) | Neřeší pořadí dvou různých souběžných editací |
| Rozepsané hodnocení → jiné auto | Draft nesmí tiše zmizet | Map keyed entry, potvrzení u category/discipline/exit; Member polling může přepnout aktuální form, ale draft zůstává (K) | Ověřit celou navigaci v opravné dávce; neprokázaná ztráta DB |
| Opožděný GET přes PUT | Po zápisu nesmí starý GET obnovit stará data | Admin klient vrátí stejnou promise GET před i po PUT (R) | C6: sequence sám nestačí |
| Hodnotí druhý porotce | Otevřené výsledky se obnoví | Známka mění výsledky, nikoli `states` signature (R) | C5: nutnost ruční obnovy má konkrétní příčinu |
| Nové zařízení / normální kliknutí | Dialog a vstup | `window` emit vs `document` listener (R/K) | C1, ne automaticky cache |
| Refresh / deep link / uložená volba | Stejná funkční cesta | Startup volá requestEntry přímo; s aktuálním autem spadne renderer (R/K) | C2 blokuje i tuto cestu |
| QR decode → lookup → presence | Tři oddělené kroky | Lokální SVG dekóduje; resolver beze writes; explicitní presence a nový lookup (T/R) | Telefonní kamera N |

### Dva skutečné účty (read-only snapshot)

| Účet | Role / registrace / přítomnost | Auto a entry | Způsobilost dnes |
|---|---|---|---|
| jos.dolezel@gmail.com | active admin, approved, přeplatek, přítomen; QR existuje; i explicitně přiřazen | Orange Coupé registrované, RED Compact další; Orange S&S presented, kategorie NULL; výfuk nepředstaven | Porotce automaticky; Orange hodnotit nesmí. Cizí představené auto ano. Start vlastního způsobilého auta ano, ale legacy replay C3 blokuje kategorizaci. Vlastních judge rows 0 je u Orange správně. |
| Lameb0y@seznam.cz | active admin, approved, unpaid, nepřítomen; QR existuje; není explicitně přiřazen | Yellow Sedan registrované, S&S Ano; žádná entry | Orange smí veřejně i porotcovsky hodnotit bez platby/check-inu. Yellow zatím nelze startovat před explicitním potvrzením přítomnosti. |

**Lameb0y má pro cizí Orange jeden submitted score uložený 22. 9. 2026 v 18:46:59 UTC.** Je to důkaz skutečného produkčního zápisu před auditem, ne pouze úspěchu testu. Interní poznámka nebyla čtena. Není doloženo, který konkrétní uživatelský pokus tento řádek vytvořil. Aktuální approved stav obou účtů nepodporuje tvrzení, že je dnes server musí odmítat pro chybějící registraci; historický chybný request/UID/event nebyl zachycen.

## C. Potvrzené chyby a příčiny

### C1 — vstupní událost nedorazí (blokující)

[admin/shell.js:63–70](../admin/shell.js) vyšle cancelable `admin:liveentryrequest` na **window**. [admin/modules/live.js:94](../admin/modules/live.js) poslouchá **document**. Událost vyslaná na window nejde dolů do document. Totéž nesouladné místo je u `admin:viewchange`. Shell proto nezjistí `defaultPrevented`, pokračuje do běžného prázdného panelu `data-admin-panel="live"`; samostatný LIVE root zůstává hidden/inert. Izolovaná reprodukce skutečného bind/dispatch potvrzuje `defaultPrevented=false`.

Refresh může vypadat jako oprava, protože `activeAdminView='live'`/route přečte startup a zavolá requestEntry přímo. Uložení v session/localStorage se mezi počítači liší. To je konkrétní mechanismus rozdílných cest, nikoli důkaz přesného obsahu storage hlášených počítačů.

### C2 — renderer spadne při existující current entry (blokující)

[admin/modules/live.js:60](../admin/modules/live.js), `workflowView`: `current=state.entry`, ale podmínka čte `current.entry.category`. `stateRows` vrací pouze `state.entry.category`. Výsledek: **TypeError: Cannot read properties of undefined (reading 'category')**. Nastane i při nevybrané kategorii, protože výraz se vyhodnotí před porovnáním.

`load()` nastaví payload, zavolá render, catch pak renderuje tentýž payload znovu a vyhodí stejnou chybu; nejde o chybu API oprávnění. `enterMode` mění hidden/inert ještě před renderem, takže může zanechat nedokončený přechod. Reprodukce skutečného `initializeAdminLive().load()` nad skutečným `getAdminLive` payloadem: s entry reject, bez entry úspěch. Stejný chybný soubor servíruje produkce.

### C3 — existující aktivní auto zůstane mimo kategorie

[worker/domains/live.js:316–334](../worker/domains/live.js): early replay pro již aktuální live entry vrátí 200 **před** doplněním její NULL kategorie a vytvořením category state. Izolovaná reprodukce: validní start Sedan vrátí `replayed=true`, entry stále NULL, category rows 0, close_category → `category_not_started`.

Produkce má právě takový Orange a 0 category rows. Není bezpečné kategorii zpětně hádat ani měnit v auditu. Nestačí opravit TypeError: bez explicitního převzetí starého auta nefunguje kategorizace/uzavření a formulář by po opravě podmínky zůstal skryt při nesouladu vybrané kategorie.

### C4 — globální ovládání závisí na nefunkčním LIVE

[settingsView v admin/modules/live.js:64](../admin/modules/live.js) je jediný UI toggle. [běžné renderEventSettings](../admin/modules/dashboard-events.js) ho nemá; [admin.html](../admin.html) má Nastavení LIVE jen uvnitř samostatného režimu. Člověk zablokovaný C1/C2 nemá požadovanou nezávislou cestu. Backend PUT existuje, problém je přístupnost jeho UI, nikoli chybějící endpoint.

### C5 — polling nevidí změny hodnocení a některých dalších projekcí

[Admin poll:79–81](../admin/modules/live.js) porovnává jen JSON `states`; [backend stateRows:43](../worker/domains/live.js) neobsahuje revizi/count hlasů. Test: počet porotců 0→1, `states` bitově stejný. Další otevřený Admin neobnoví výsledky. Podobně samotná presence/members nejsou součástí této signature. Pokud LIVE načtené jako vypnuté, `open()` nedovolí polling; `requestEntry` může použít již loaded payload bez nového čtení.

### C6 — post-write projekce může být stará; zápis a zobrazení nejsou jedno potvrzení

[admin/request-client.js:48+](../admin/request-client.js) slučuje rozpracované GETy podle relace/eventu/path, ale PUT je nezneplatňuje. Reprodukce: GET začal před PUT, PUT uspěl, následný GET vrátí tutéž promise/starý obsah. `readSequence` chrání pořadí callbacků, nikoli stáří takto sdíleného požadavku. Není doloženo, že právě tento závod nastal uživateli; **mechanismus je reprodukovaný**.

Oba `submitJudge` čekají na zápis, ale následné `load` může chybu pohltit/vrátit null. Úspěšný zápis a selhané obnovení se musí prezentovat odděleně. V Adminu C2 navíc umí způsobit hlášku o neúspěchu až po již úspěšném PUT. Admin historie nemá akci k editaci staršího vlastního hodnocení; Member historii ji má. Počet `scored` znamená alespoň jedno submitted hodnocení auta, nikoli souhlas celé poroty či dokončenou kategorii.

### Co se nepotvrdilo jako závada

- `own_car_score`/`judge_forbidden` samy nevyvolají obecné odebrání Admin přístupu: klient revokuje jen 401 a autorizační kódy `admin_forbidden`/`active_member_required`; cíleně ověřeno.
- Role admin nepotřebuje assignment. Zápis/upsert, opětovné čtení a soukromí historie fungují na izolované DB i existujícím produkčním záznamu.
- Registrace a check-in byly od začátku oddělené podmínky: `b77d52c` vyžadoval approved+presence; `68ae0db` odstranil pouze presence z veřejného hlasování. Approved zůstalo záměrně v implementaci. Produktové schválení jeho dalšího trvání je F1.
- Odchod z režimu nemá globální PUT. Close category nevypíná event. Nenalezeno použití service workeru v procházené aplikační JS cestě. Cache nelze označit za příčinu bez evidence konkrétního zařízení.

## D. Neověřené hypotézy a hranice

- Chybějící registrace v konkrétním minulém pokusu: mohl jít o jiný UID, LIVE event či starý payload. Současná data to nevysvětlují; neoznačuji žádnou možnost za prokázanou.
- Browserová funkce kamery, kvalita skenu loga na telefonu, focus-trap a chování dvou skutečných počítačů nebyly online ověřeny. Parser, SVG decode a lookup/presence byly ověřeny odděleně. Existující test loga modeluje překrytí modulu, nikoli skutečný fotoaparát.
- Admin při změně selectoru nevolá LIVE load/reset (handler volá jen `loadEventData`); requestEntry podle eventu znovu načte, ale `memberResults` nejsou event-keyed. Riziko starého seznamu mezi ročníky je z kódu, ne reprodukovaný incident.
- Kontrola stavu před uložením hlasu a samotný upsert jsou oddělené SQL operace. Přesný závod uzavření versus hlas/start jiné disciplíny nebyl simulován; nepovažovat stávající test serializovaného startu za důkaz všech D1 souběhů.
- Na změnu aktuálního auta Member polling může znovu renderovat rozpracovaný formulář. Draft Map jej zachovává, ale ne všechny cesty návratu/UID při rozběhnutém uploadu byly dynamicky ověřeny. Samostatné opakování uploadu po ztracené odpovědi nemá doloženou idempotenci fotografií; hlas a score ji přes UNIQUE mají.
- Skutečný chybový síťový záznam uživatelova neúspěšného uložení nebyl dostupný. Nezaměňovat nalezené frontendové závady za důkaz, že každý minulý PUT uspěl.

## E. Jedna doporučená dávka oprav (zatím neimplementována)

| Pořadí | Konkrétní změna a odstraněný problém | Ověření |
|---|---|---|
| 1 | Sjednotit emit/listen na window pro vstup i viewchange. Přechod hidden/inert dokončit až po úspěšném renderu; bezpečný error návrat. Opravit `current.category`. | Skutečný DOM test normální klik/deep link/refresh/fresh storage, s current entry i bez; chyba GET a renderu nesmí uvěznit admina. |
| 2 | Globální toggle zpřístupnit v běžném Nastavení eventu s existujícím autorizovaným PUT; není závislý na LIVE rendereru. Jasně odlišit selected/current/active event; resetovat eventové výsledky při změně. | Vypnuté LIVE i rozbitý LIVE panel; zapnutí jen testovacího eventu v izolaci, registrace beze změny; změna UID/eventu. |
| 3 | Explicitní start legacy NULL-category entry po potvrzení skutečné kategorie dokončí category state i při replay; zachová ID a existující hlasy. Žádná hromadná automatická klasifikace. | Přesný produkční tvar Orange v izolované DB + existující score; dvojí start, close a publish; nic se nesmaže/nezdvojí. |
| 4 | Oddělit potvrzený zápis od obnovy projekce. Post-write read nesmí sdílet předzápisový GET; použít úzkou invalidaci/confirmed response v existujícím klientu, ne nový framework. Uložené známky neoznačovat jako ztracené při chybě reloadu. | Zadržený GET před PUT, úspěšný PUT + selhaný GET, dva kliky, ztracená odpověď, opětovné čtení a editace jednoho řádku. |
| 5 | Existující polling rozšířit o vhodnou levnou revizi dotčených LIVE projekcí; zachovat drafty. Nespoléhat jen na current-entry signature a neřešit novým timerem. Admin historii napojit na vlastní uložené hodnocení. | Druhý hodnotitel mění skóre bez změny current auta; první Admin vidí nový počet/výsledek. Pending draft i přílohy přežijí a chyba je čitelná. |
| 6 | QR/přítomnost nabídnout jako jasnou organizační cestu nezávislou na soutěžním startu; resolve jen čte, presence explicitní. Vysvětlit eligibility konkrétní příčinou a jasně pojmenovat počet „alespoň jeden porotce“. | QR/manual/search stejného člena/eventu, rejected code bez writes; member bez check-inu hlasuje; vlastní auto odmítnuto bez odebrání role; reálná kamera až následný autorizovaný online krok. |

Do této dávky patří úzké testy skutečných UI interakcí, nikoli další regex assertion, že se v souboru vyskytuje jméno handleru. Současné source-inspection testy prošly i s C1/C2. Produkční migrační zásah ani reset LIVE z auditu nevyplývá.

## F. Nezbytné produktové otázky

1. **Má veřejně hlasovat jen schváleně registrovaný člen, nebo každý aktivní člen?** Doporučení: prozatím zachovat approved gate, ale přesně ji vysvětlit v UI. Odstranění check-inu nebylo odstraněním registrace; nevydávat admin roli automaticky za veřejnou registraci.
2. **Může člen soutěžit s kterýmkoli svým autem, nebo jen s autem v registraci?** Dnes UI i start umožňují jakékoli vlastní auto, `show_shine='Ano'` pochází z registrace člena. Doporučení: explicitní výběr a check-in ponechat; nezužovat potichu na registeredCarId. Zároveň potvrdit pravidlo kategorie `///M Power`: kód vyžaduje přesnou rovnost s `cars.body`, ačkoli jde typicky o modelovou, nikoli karosářskou kategorii.

## G. Krátký následný online průchod se dvěma účty

Po opravě nejdřív read-only na obou zařízeních: Admin menu → potvrzení LIVE, refresh, návrat; Nastavení dostupné i mimo LIVE. Lameb0y otevře vlastní existující uložené hodnocení Orange; Jos u Orange vidí zákaz vlastního hlasu, ne odebrání admina. Ověřit QR zobrazení a read-only nalezení téhož člena.

Teprve se samostatným souhlasem pro konkrétní business akce: potvrdit přítomnost Yellow, explicitně zařadit/spustit cizí auto ve správné kategorii; druhý účet uloží známky, první vidí aktualizaci, reload je zachová, oprava změní jeden řádek. Neuzavírat/re-publikovat skutečnou kategorii jen kvůli testu bez schválení. Při rozdílu zařízení zaznamenat URL/event/HTTP error a roli, nikdy token.

## Provedené kontroly a stav výstupu

- `node --test tests/united-live-audit.test.mjs tests/united-live.test.mjs`: **16/16**, exit 0 (prvních šest diagnostik + deset existujících LIVE testů).
- Pouze dvě nově doplněné diagnostiky signature/coalescing přes `--test-name-pattern`: **2/2**, exit 0. Úspěšné kontroly z prvního běhu neopakovány.
- Dva související QR testy z `admin-member-detail.test.mjs` přes name pattern: **2/2**, exit 0.
- Celkem **20 cílených kontrol**, žádná celá Node/browser sada ani CI/artifact. Zápisy testů pouze SQLite `:memory:` a mock klient.
- Diagnostické testy v [tests/united-live-audit.test.mjs](../tests/united-live-audit.test.mjs) záměrně **potvrzují existenci vad**, nikoli správnost vadného chování; při opravě převést na pozitivní regresní kontrakty.
- Nové pouze tento dokument a diagnostický test. Produkční zdrojové soubory, konfigurace, Worker, D1/R2 a business data beze změn. Bez commitu, pushnutí či deploymentu.
