# Browser test stabilization — lokální dávka B1/B2

Stav: 10. 10. 2026. Druhá dávka není commitnutá, pushnutá ani nasazená.

## Oddělení A1/A2 a hranice

Lokální commit **23954e2e9c00a1fb73bf49dbc065f613a43cb575**
(`fix: restore member detail and own official score corrections`) obsahuje pouze:
`admin/member-detail.js`, `member/modules/live.js`, `tests/e2e/audit-a1-a2.spec.mjs`.
Před jeho vytvořením nebyly opakovány hotové cílené kontroly. V následném úplném Chromium běhu prošlo všech osm regresí A1/A2.

Audit `docs/project-audit-2026-10-09.md` a `scripts/audit-20261009/` zůstaly nedotčené mimo commit.
Po oddělení A1/A2 se mění pouze browser testy, jejich fixture a tento report.
Žádné změny aplikace, společných Node helperů, migrací, Actions, závislostí nebo obchodních nastavení.
CI nebylo spuštěno ani sledováno. Testovací HTTP je zachycované, databáze izolované a média v paměti; bez produkčních zápisů.

## Společné příčiny a opravy

1. **B1: neúplné API fixtures.** Nový `tests/e2e/ancillary-fixture.mjs` obsluhuje jen přesně rozpoznané GET pro LIVE/state, Admin LIVE, Příjezdy vybraného ročníku a vlastní Merch objednávky/adresu. Používá existující `memberRuntime`, aktuální schéma a skutečné handlery `getMemberLive/getAdminLive/getLiveState/routeArrivals/routeMerch`. Základní fixture drží LIVE vypnuté; scénáře soutěže si zakládají konkrétní stavy samy. Command fixture sdílí svůj skutečný runtime. Neznámé cesty/metody dál padají do původního HTTP 501, nikoli univerzálního success.
2. **Aktuální přítomnost.** Tři LIVE soubory používají `seedConfirmedArrival` místo INSERT do pohledu `event_member_presence`. Žádná stará tabulka ani ručně okopírované schéma nevzniká. Chybějící stav aktivní kategorie je doplněn ve dvou konkrétních scénářích hlasování/fotografií.
3. **Věrná identita a ročník.** Syntetické pomocné identity mají unikátní e-mail, aby nevznikla kolize s již existujícím adminem runtime. Test přepnutí na 2027 zakládá odpovídající event i v pomocném runtime; Merch workspace přejmenovává pouze svůj izolovaný event na název deklarovaný v testovacím API. Test změny rezervace explicitně definuje nulové vstupné v syntetickém snapshotu; kontroly částek 1000 → 0 a úhrad zůstávají.
4. **Odebrání role.** Fixture HTTP 403 nyní vrací skutečný `error: admin_forbidden`. Samotné 403 není ekvivalent ztráty role: aplikace záměrně rozlišuje zakázanou jednotlivou operaci. Kontroly odstranění soukromých dat, zavření detailu a zastavení refreshů zůstávají a prošly.
5. **Verzované moduly.** Testy používají `ADMIN_MODULE_RELEASES`, nikoli jeden token pro všechny moduly. Dřívější import state.js s chybným tokenem vytvářel druhý prázdný singleton. Negativní cache-poison kontrola i požadavek jediné URL pro každý modul zůstaly. Appearance má svůj skutečný token `20260928-flow1`.
6. **B2: konkrétní selektory.** Konfigurace ubytování cílí na vlastní disclosure, navigace na desktopový panel nebo mobilní dialog/bottom bar, potvrzené porotcovské body na aktuální rating card. Upload používá validní WebP místo textu vydávaného za JPEG a ověřuje chybu konkrétního souboru.
7. **Žádné maskování chyb.** Nebyly přidány skip/fixme, retries, force klikání, vyšší timeouty ani univerzální HTTP 200. Původní desetisekundové čekání na periodické LIVE aktualizace se nezvyšovalo. Negativní finanční, soukromé, konzolové a verzovací kontroly zůstaly. Ve třech LIVE fixtures je původní široký fallback obrázku omezen na konkrétní media URL; jiný požadavek dostává 501.

## Změněná očekávání a opora ve schváleném chování

- `docs/live-navigation-local.md`, `docs/arrivals-picker-local.md`: disciplína → kategorie → konkrétní auto (`car:<id>`), po reloadu pokračování přes „Pokračovat“, Výsledky ve Více. QR identifikuje člena, nikoli automaticky jediné auto. Zařazení soutěžního auta nevytváří příjezd/rezervaci/platbu; původní databázové kontroly jsou zachovány.
- Schválené A2: porotce/admin smí hodnotit vlastní auto. Starý browser požadavek skrytého formuláře je nahrazen viditelným porotcovským formulářem, zákaz duplicitního startu zůstává. A1/A2 negativní regrese obyčejného člena zůstávají.
- `docs/live-next-local.md` a migrace official-scoring: jedna oficiální sada místo „2× porota“. Starý scénář byl převeden na opravu z náhradního zařízení, odmítnutí zastaralé verze a následnou explicitní opravu s důvodem. Ověřuje jednu sadu, verzi 3 a dva auditní záznamy, nikoli smazání kontroly souběhu.
- `docs/portal-next-ux-local.md`, `docs/portal-composition-ux-local.md`: mobilní bottom bar/nativní Menu místo skrytého sidebaru; kompaktní společná hlavička a sekundární „Členové klubu“ místo odstraněného obřího záhlaví.
- Stejné předání schvaluje skrytou prezentační hodnoticí kartu veřejného webu do 680 px. Test ji na mobilu výslovně očekává skrytou; desktop zachovává osm kritérií, rozbalení a geometrii.
- `docs/public-member-ux-local.md`: foto editor se nejprve explicitně otevře. Počet a názvy vybíraných fotografií se kontrolují v nynějším seznamu výběru.
- Veřejné přihlášení zachovává `returnTo`, nikoli starý přímý vstup do registrace. Ověřuje se skutečné přesměrování na login.
- Kompaktní čtyři odkazy Galerie se při 390 px vejdou: místo vynucení neexistujícího scroll hintu test ověřuje přesné pořadí, nepřetékání a dostupnost všech odkazů. Směrové scroll hinty nadále ověřuje přetékající carousel kategorií.
- Ztracená odpověď po hlasu: současný schválený receipt recovery ověří uložený hlas čtením. Test nyní vyžaduje jeden zápis a jeden řádek v DB místo zbytečného druhého zápisu, včetně dvojitého submitu a reloadu.

## Přesné výsledky běhů

Jednotlivé běhy nejsou sčítány do údajného kompletního PASS. Po úpravách byl proveden **jeden** úplný Chromium běh a **jeden** existující projektový WebKit výběr. Následovaly pouze dílčí kontroly dotčených scénářů.
První malé vzorky používají stop-on-failure; „neprovedeno“ znamená scénáře neprovedené po dosažení limitu selhání, ne testy označené skip.

| Běh | Rozsah | PASS | FAIL | Neprovedeno |
| --- | --- | ---: | ---: | ---: |
| Chromium sample1 | společné fixtures, max 4 selhání | 0 | 4 | 22 |
| Chromium sample2 | stejný výběr po odstranění kolize ročníku | 20 | 4 | 2 |
| Chromium sample3 | sedm dotčených scénářů, max 3 selhání | 3 | 3 | 1 |
| Chromium sample4 | sedm dotčených scénářů | 5 | 2 | 0 |
| Chromium sample5 | judge phases 1440 light | 1 | 0 | 0 |
| Chromium sample6 | dva zbývající scénáře | 0 | 2 | 0 |
| **Chromium full** | **všech 308 testů, 18 min 47 s** | **226** | **82** | **0** |
| Chromium target1 | navigace/cache, finance, foto, picker, veřejný mobil | 6 | 6 | 0 |
| Chromium target2 | opravené příčiny target1 + odebrání role | 9 | 2 | 0 |
| Chromium target3 | odebrání role, LIVE/QR/navigace, příjezdy | 9 | 3 | 0 |
| Chromium target4 | kamera, potvrzení, ztracená odpověď, foto, workspace, geometrie | 5 | 2 | 0 |
| Chromium target5 | appearance, feedback-mobile, starý LIVE repair | 31 | 6 | 0 |
| Chromium target6 | Admin LIVE appearance, mobilní galerie, geometrie, původní M | 4 | 2 | 0 |
| Chromium target7 | 37 dosud nedoložených opravených scénářů z úplného běhu | 35 | 2 | 0 |
| Chromium target8 | Club, focus hlasování, částečné selhání porotcovských foto | 1 | 2 | 0 |
| Chromium target9 | jedna oficiální sada, stale-write, audit a chybný refresh | 0 | 1 | 0 |
| **WebKit** | **stávající CI výběr 136 testů, 5 min 41 s** | **131** | **5** | **0** |
| WebKit target1 | Club + dva scénáře nového člena po opravě navigace | 2 | 1 | 0 |
| WebKit target2 | poslední mobilní Club selektor | 1 | 0 | 0 |

JSON reporty úplných a target běhů jsou v ignorovaném `test-results/stabilization-*.json`; trace, error-context a screenshoty v odpovídajících adresářích. První vzorky 1–5 jsou doloženy terminálovými výsledky a adresáři `stabilization-sample1` až `sample5`, nikoli dodatečně vymyšleným JSON.
Bez automatických retries; všechny dokončené JSON běhy mají 0 skipped a 0 flaky.

Po odstranění testovacích příčin jsou dále červené níže popsané scénáře. Zbylá selhání úplného Chromium běhu mají následný cílený PASS (včetně přejmenovaných ekvivalentů navigace, galerie, pickeru a ztracené odpovědi). To **není** nový úplný výsledek 299/308.
WebKit po opravě selektorů nového člena a Clubu ponechává dva problémy rozložení/posunu; nejde o opakovaný kompletní běh 134/136.

## Zbývající aplikační problémy a omezení

### 1. LIVE veřejný dialog nevrací focus — A, střední dopad na ovládání klávesnicí

- `live-next-local.spec.mjs`: čtyři šířky 360/390/1024/1440 a rozšířený keyboard scénář v úplném běhu; potvrzeno target8 při 390 px.
- Otevřít hodnocení, vybrat známku, zrušit/Escape. Očekává se focus na tlačítku, které dialog otevřelo; skutečně je neaktivní.
- `member/modules/live.js`: `closeVote` a obnova historie vrátí focus před následným překreslením prvku. To je konkrétní kandidát opravy, ne provedená změna.
- Kontrola focusu zůstala. Následující kroky těchto pěti scénářů (editace historie, uzavření během zápisu, další recovery) nebyly po selhání provedeny. Samostatný double-submit/lost-receipt scénář však prošel.
- Nejmenší oprava: obnovit focus na nově vykreslený odpovídající prvek; ověřit Cancel/Escape/Back a nulové zápisy při zrušení.

### 2. Částečné selhání porotcovských příloh ponechá editovatelná kritéria — A, střední

- `live-photo-flow-local.spec.mjs`, target8: skutečný handler uložil čtyři hodnoty 7, submitted=1, version=1; DB obsahuje jednu potvrzenou přílohu, druhý upload je záměrně odmítnut 503.
- UI má správně jeden chybný soubor, ale stále čtyři viditelná bodová fieldset namísto uzamčeného režimu retry pouze fotografie.
- `member/modules/live.js` / `sendJudge`: větev `failures` vrací řízení bez překreslení potvrzeného režimu. Kontrola nebyla přepsána na čtyři pole.
- Závěrečný retry tohoto konkrétního členského scénáře zůstává neproveden; nelze tvrdit, že mohl změnit potvrzené body. Serverová ochrana tím nebyla vyvrácena.
- Nejmenší oprava: zachovat frontu a okamžitě promítnout potvrzenou verzi do photo-only UI; cíleně ověřit retry bez nového score zápisu.

### 3. Admin po uložení a selhání obnovy ztratí trvalé vysvětlení/retry — A, střední UX

- `united-live-repair.spec.mjs`, target9: jedna oficiální sada, souběžná oprava na 6, odmítnutá zastaralá oprava a následná platná oprava na 9. Před chybovou UI kontrolou prokázána verze 3 a přesně dva auditní záznamy.
- Při záměrném selhání následného GET chybí v těle LIVE očekávané „Hodnocení je uložené. Přehled se nepodařilo obnovit.“ a lokální retry.
- `admin/modules/live.js` / `submitJudge` vloží status, ale `finally` znovu renderuje tělo. Toast není tvrzen jako neexistující; závada je ztracená trvalá informace a retry v obsahu.
- Kontrola zůstává červená. Kroky retry/reload/mobilní návrat v tomto konkrétním testu nebyly provedeny.
- Nejmenší oprava: uchovat stav potvrzeného zápisu + chyby načtení v renderovaném stavu; nepřepisovat DB a neopakovat PUT.

### 4. Registrační dialog při 360 × 520 px — A, střední mobilní použitelnost

- `feedback-member.spec.mjs`: Chromium full, target4 i target6; problém trvá i po dokončení konečných animací a fontů. Spodní okraj bloku poznámky 308,984 px, horní okraj akcí 298,625 px, povolená tolerance 1 px.
- WebKit navíc hlásí horizontální overflow. Otevřené screenshoty Chromium a WebKit ukazují odlišné chování: v Chromiu je textové pole čitelné, ve WebKitu ho překrývá spodní oblast. Netvrdíme tedy shodné překrytí textu v obou enginech.
- Nejmenší oprava: cíleně uspořádat mobilní scroll/akce dialogu, ne navýšit toleranci testu. Následující odeslání a acknowledgement v tomto scénáři zůstalo neprovedeno.

### 5. Návrat z předběžného Planneru posune stránku o 22 px — reprodukovaný UI nesoulad, nízký

- `preliminary-reservations.spec.mjs`, target7 Chromium a úplný WebKit: po přidání auta a zavření rozepsané editace se správně vrátí focus na otevření plánu, ale stabilní scroll se liší o 22 px namísto tolerance 1 px.
- Předchozí vytvoření, reload a existence jediné předběžné registrace v tomto průchodu prošly. Následující úprava a storno v mobilní větvi nejsou tímto během doložené.
- Příčina posunu nebyla opravována ani vydávána za závadu ukládání. Prověřit pořadí obnovení scrollu/focusu a změnu výšky souhrnu po přidání auta; původní kontrola zůstává.

Žádné nové zjištění nedokládá ztrátu uložených bodů ani narušení auditování či oprávnění.
Známá aplikační selhání nejsou přepsána na nové očekávání. Pro jejich nápravu je potřeba samostatná aplikační dávka.

## Změněné soubory a závěrečné kontroly

Druhá dávka (23 upravených souborů + nový pomocný modul a tento report):
- `tests/e2e/ancillary-fixture.mjs` — nový přesný handlerový adaptér.
- `tests/e2e/fixtures.mjs`, `command-fixture.mjs`.
- `tests/e2e/admin-command.spec.mjs`, `admin-confirmed-render.spec.mjs`, `admin-dashboard.spec.mjs`, `admin-safety.spec.mjs`, `admin.spec.mjs`.
- `tests/e2e/appearance.spec.mjs`, `feedback-member.spec.mjs`, `feedback-mobile.spec.mjs`, `public.spec.mjs`.
- `tests/e2e/arrivals-live-flow.spec.mjs`, `arrivals-picker.spec.mjs`, `arrivals.spec.mjs`.
- `tests/e2e/live-judge-workflow.spec.mjs`, `live-next-local.spec.mjs`, `live-photo-flow-local.spec.mjs`, `united-live-repair.spec.mjs`.
- `tests/e2e/member.spec.mjs`, `member-club-profiles.spec.mjs`, `member-new-member.spec.mjs`, `portal-workspace.spec.mjs`, `preliminary-reservations.spec.mjs`.
- `docs/browser-test-stabilization-local.md`.

Kontroly:
- `node --check`: PASS pro všech 24 změněných/nových JS/MJS druhé dávky.
- `git diff --check`: PASS.
- Žádný diff aplikace/Workeru/migrací/Actions vůči A1/A2 HEAD.
- Node 555 testů nebylo opakováno: společné Node helpery se neměnily.
- Žádné změny test retries, žádné skip/fixme ani zvýšené timeouty. Screenshoty konkrétního mobilního selhání byly skutečně otevřené, nejen vytvořené.
- Část kontroly vzhledu proběhla existujícími testy; nejde o nový celkový vizuální audit ani ověření fyzického telefonu, kamery nebo produkce.

Git: HEAD `23954e2e9c00a1fb73bf49dbc065f613a43cb575`.
Pracovní strom je záměrně nečistý: výše uvedených 23 modifikovaných testovacích souborů, nový helper a report nejsou commitnuté.
Původní untracked auditní report a adresář diagnostik zůstaly beze změny. Index druhé dávky nebyl naplněn.
Bez pushnutí a nasazení.

Doporučený další krok: samostatně schválit cílenou opravu pěti zbylých UI problémů, poté doběhnout blokované části scénářů. Teprve nový úplný běh může prokázat celou aktuální sadu jako úspěšnou.



