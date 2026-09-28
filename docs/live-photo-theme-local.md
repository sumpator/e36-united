# Lokální opravy vzhledu, fotografií, ubytování a LIVE

Stav k 28. 9. 2026. Základ `aba788f06c5775d862cffee6d1bb99b1c08fb56b`.
Původní lokální předání níže; schválená příprava publikace a doplňující ověření jsou v `live-photo-theme-release.md`.
Testy používají lokální SQLite, paměťové náhrady úložiště a zachycené HTTP požadavky.

## Zjištění a opravy

### Vzhled: důležitá hranice ověření

- Trvalou šedou/smíšenou variantu popsanou uživatelem se nepodařilo spolehlivě reprodukovat. Cache není prokázaná příčina a tuto část nelze označit za definitivně vyřešenou.
- Bootstrap dosud reagoval na změnu přepínače, storage a systémového motivu, ale po obnovení uspávané stránky nesrovnával znovu uloženou preferenci, výsledný motiv a nativní ovládání. Doplněno sladění při `pageshow` a návratu viditelnosti. Jde o ošetření doložené mezery životního cyklu, nikoli důkaz příčiny uživatelova incidentu.
- Smíšené záhlaví na rychle pořízeném lokálním screenshotu bylo přechodným stavem během existující 250ms CSS animace. Po jejím dokončení mělo světlé záhlaví `rgba(255,255,255,.96)` a tmavé `rgba(9,10,12,.92)`. Paleta ani přechody nebyly plošně přebarveny.
- Ověřeno přepínání, přechod homepage → Galerie, reload, změna systémového motivu a návrat z LIVE. Test `pageshow` simuluje obnovení dokumentu; není to test skutečného uspání Safari/iOS. Pro došetření trvalé chyby bude potřeba konkrétní prohlížeč/OS a reprodukovatelný postup.

### Fotografie

- Původní výběr v některých formulářích nahrazoval předchozí soubory. Částečná chyba nerozlišovala dostatečně už potvrzené položky a opakování mohlo vytvořit duplicitu. LIVE odesílalo velké originály bez společné komprese.
- Společná fronta `photo-batch.js`: přidávání dalších snímků, miniatury, odebrání, stavy po souborech, zámek souběžného odeslání, opakování pouze nepotvrzených položek. LIVE má samostatné fotografování a výběr více snímků z galerie.
- Dekodér zmenšuje bez ořezu na delší stranu 1800 px, JPEG kvalita .82; výstup musí být do 8 MiB. Před publikací byl společné frontě zvýšen vstup na 50 MiB, s kontrolou nejvýše 80 Mpx / 16 384 px na stranu ještě před náhledem. JPG/PNG/WebP; nečitelný soubor zůstává chybou, HEIC není nově podporován. Podrobnosti a omezení viz release report.
- Stabilní identifikátor jednoho výběru je serverem svázán s přihlášeným aktérem a cílem. Opakování vrací existující potvrzení. Souběžné pokusy mají vlastní klíče objektů, takže neúspěšný pokus nesmaže úspěšný. Při nejisté odpovědi databáze se nesmaže objekt odkazovaný uloženým záznamem; při nedostupném ověření se raději ponechá.
- Členská/LIVE fotografie zůstává `pending`; příloha poroty interní. Potvrzené vlastní snímky jsou vidět bez ručního reloadu, nikoli veřejně bez schválení.
- Fronta souborů je v paměti otevřené stránky. Úplný reload neobnovuje neodeslané File objekty; potvrzené položky se načtou ze serveru. Ruční nový výběr stejného souboru po reloadu je nový upload, nikoli obecná deduplikace obsahu.

### Admin ubytování a Apartmán

- Příčina zastaralého média: ochrana rozepsaného/fokusovaného formuláře blokovala i překreslení serverem potvrzených fotografií. Media část se nyní aktualizuje odděleně z potvrzení serveru, aniž se přepíše rozepsaná konfigurace.
- Přidání, odebrání a přesun fotografie používají stejnou aktualizaci metadat/náhledů. Veřejná cesta nadále používá existující galerii a její verzované URL.
- `apartment` / Apartmán doplněn do výběru a zobrazení v Adminu, veřejném a členském Planneru, validace rezervací a souhrnu kapacit. Čtyři možnosti ubytování mají čtyři sloupce na desktopu a dva na mobilu. Nevznikla žádná konkrétní nabídka, cena ani kapacita.

### LIVE: průchod a oddělení stavů

Organizátor vybírá ročník, vstupuje do LIVE, vybírá disciplínu a karosářskou kategorii, načte přítomného schváleného účastníka/auto a spustí hodnocení. Zahájení používá stávající verzování stavu. Člen vidí aktuální auto, vlastní veřejný hlas a aktualizace otevřeného LIVE. Oprávněná porota má navíc vlastní kritéria, poznámku a interní fotografie. Historie načítá přesná vlastní kritéria, nikoli individuální známky ostatních porotců.

Upřesnění: schválená registrace a přítomnost jsou skutečné dosavadní podmínky **prezentovaného soutěžícího**, nikoli hlasujícího člena. Aktivní člen veřejně hlasuje i bez rezervace/check-inu, nikdy pro vlastní auto. Admin vybírá registrované auto, jiné vlastní auto z garáže nebo samostatné soutěžní auto mimo garáž; výběr není omezen na `reservations.car_id`. Tyto tři cesty byly před publikací samostatně ověřeny.

Doložené mezery původního kódu:

- Kontrola stavu před zápisem hlasu nebyla zopakována v zápisu. Uzavření mezi kontrolou a zápisem tak mohlo propustit pozdní hlas.
- Nebyl samostatný trvalý stav výslovně uzavřeného auta; stav disciplíny/kategorie není totéž.
- Zahájení další kategorie nebránilo dostatečně jiné již otevřené kategorii.
- Po uložení nebyl vlastní potvrzený souhrn dostatečně oddělen od bodovacího formuláře; opakované odeslání příloh mohlo opakovat již úspěšné přílohy.

Lokální opravy:

- Zápis veřejného hlasu i porotcovských bodů opakuje stavové podmínky atomicky. Otevření/resume rovněž ověřuje uzavření auta při zápisu. Současně nelze otevřít další karosářskou kategorii.
- Samostatné potvrzované „Ukončit hlasování tohoto auta pro všechny“ je dostupné oprávněné porotě/organizátorovi; nastaví uzavření auta a verzi aktuálního stavu. Uložení vlastních bodů, návrat do menu ani zrušení konceptu tuto akci nevolají.
- Po potvrzení serverem zmizí bodování a zobrazí se vlastní body. Při chybě/ztracené odpovědi nevzniká falešné potvrzení. Úprava respektuje uzavření auta, kategorie a disciplíny. Dosavadní možnost poroty upravovat jiné již prezentované neuzavřené auto zůstává zachovaná.
- Kompaktní hlavička jmenuje aktuální sekci. Členské LIVE dostalo krátké upozornění na nové auto a textový odznak „Nové“, deduplikované i přes obnovení dat. Neprovádí automatické přesměrování z rozepsaného obsahu.
- Propagace ostatním otevřeným klientům používá stávající polling, není to WebSocket ani push; při offline stavu se aktualizace projeví až po opětovném spojení.

## Databázová závislost — nic nespouštět v produkci bez samostatné přípravy

1. `2026-09-28-live-entry-close.sql`: nový příznak `live_entries.voting_closed`, výchozí 0. Historické hlasy/známky se nemění a existující uzavřené kategorie/disciplíny zůstávají blokující. Žádná zpětná rekonstrukce individuálního uzavření ze starých dat se neprovádí.
2. `2026-09-28-accommodation-apartment.sql`: současné CHECK constraints ve dvou tabulkách nepovolují `apartment`. Připraven lokální návrh přestavby tabulek nabídky a alokací, se zachováním fotografie závislé cizím klíčem, indexů a triggerů. Nevytváří nabídky ani nepřeklasifikuje existující pobyty. Lokální transakční test porovnal nabídky, fotografie, alokace i revize před/po a ověřil cizí klíče.

V původním lokálním předání SQL běželo jen v paměťové SQLite. Před publikací bylo skutečné schéma a data obnoveno do izolované vzdálené D1 a obě migrace úspěšně ověřeny; viz release report. Frontend/Worker této dávky nelze bezpečně publikovat samostatně bez zohlednění migrací. Nové identity uploadů využívají existující tabulky a migraci nevyžadují.

## Cílené ověření

- `tests/live-photo-flow-local.test.mjs`: 7 cílených Node testů prošlo. Zachování dat při lokálním návrhu migrace, oprávnění a vlastní hlas, souběh uzavření/zápisu, jediná otevřená kategorie včetně souběhu, opakování uploadu, ztracené potvrzení databáze bez ztráty objektu, legacy pause/resume.
- `tests/e2e/live-photo-flow-local.spec.mjs`: 12 cílených Chromium scénářů prošlo v cílených bězích. Fronta/komprese/EXIF 6 (4000×2000 → 900×1800), nečitelný a nepodporovaný soubor, přidávání a odebrání, částečná chyba a retry, témata, potvrzení člena i Admin porotce, pomalý dvojklik a přerušená odpověď hlasu + refresh, přílohy poroty, Admin media při rozepsaném formuláři.
- Prohlédnuty screenshoty mobilu 390 px i desktopu 1440 px v obou motivech pro LIVE, členské fotografie a Admin; bez horizontálního přetečení v kontrolovaných scénářích. Dodatečné snímky jsou v `test-results/local-flow/` (ignorované lokální artefakty).
- Žádná celá sada, CI, produkční rezervace, skutečné R2 uploady ani notifikace. Nativní fotoaparát, Safari/iOS uspávání a skutečné mobilní přerušení sítě nebyly ověřeny; soubory/síťové chyby byly simulované. Admin odebrání/přesun a veřejné načtení nového typu nebyly samostatně kompletně proklikány end-to-end.
- Cache odkazy změněných souborů a jejich importujících vstupů sjednoceny na `20260928-flow1`. Změny v dalších Admin modulech jsou pouze návazné tokeny společného API, nikoli změny Mailingu/Merche.

## Návrh hostovského QR — zatím bez implementace

| Varianta | Výhoda | Omezení |
| --- | --- | --- |
| Společný vstupní QR pro akci | Snadné zveřejnění a vstup | Smazání cookie / jiné zařízení může založit dalšího hosta. Nelze slíbit jeden člověk = jeden hlas. |
| Individuální jednorázově přidělený hlasovací QR | Lepší kontrola počtu vydaných oprávnění | Je třeba vydávání u vstupu, jednorázové přivázání k prohlížeči a řízená obnova. Předání QR druhému člověku samo o sobě zabránit neumí. |

Pro soutěžní integritu doporučuji individuální QR. Pro nenáročnou návštěvnickou anketu lze schválit společný QR s výslovným přijetím slabší kontroly.

Konkrétní návaznost:

1. QR otevře návštěvnický vstup konkrétní akce. Platná členská relace použije stávající členský hlas; nezaloží hosta.
2. Jinak server přidělí náhodný autentizační token; v databázi jen jeho hash, vazba na hosta a akci, platnost. Token se uloží v dlouhodobé Secure/HttpOnly cookie. Další načtení stejného QR při zachované cookie vrátí tutéž identitu a její vlastní hlasy.
3. Hostovské endpointy mají samostatnou autorizaci a poskytují jen veřejné informace o aktuálním autu a vlastní hlasy. Žádné členské kontakty, interní fotografie nebo porotcovské funkce. Kontroly uzavření/souběhu se použijí i zde.
4. Individuální QR obsahuje neuhodnutelný jednorázový claim token, nikoli členské číslo; první použití ho atomicky sváže s hostem. Opakované skenování v témže prohlížeči nepřidává identitu. Na jiném zařízení bez vazby je potřeba kontrolovaná obnova, nikoli automatické vydání druhého hlasu.
5. Pro hlas hosta je potřeba navrhnout samostatnou tabulku identity a hlasů / explicitní typ hlasujícího, ne podsouvat hosta do `members`. Způsob zahrnutí hostů do veřejného výsledku musí být předem schválen.

Zavření běžného prohlížeče cookie obvykle zachová; anonymní režim, smazání dat nebo zásah OS nikoli. Společný QR nemůže zaručit návaznost po smazání cookie ani zabránit více zařízením. Ani individuální QR není důkaz totožnosti člověka. Kontrolu hlasování pro vlastní auto lze u člena zachovat; u anonymního hosta ji bez ověřené vazby na vlastníka auta nelze spolehlivě zajistit. QR ani hostovské identity zatím nevznikly.

## Návrh skutečných push notifikací — zatím bez implementace

Upozornění v otevřeném LIVE je hotové, ale při zavřené aplikaci se samo nezobrazí. Skutečný Web Push vyžaduje HTTPS, service worker, předplatné zařízení, serverové odesílání, souhlas uživatele vyvolaný jeho akcí a možnost odhlášení. Základní LIVE musí zůstat funkční bez tohoto souhlasu.

- Podporu zjišťovat přes dostupnost Service Worker / PushManager / Notification. Na iOS/iPadOS od 16.4 jde o web přidaný na plochu; běžný otevřený panel nestačí. Povolení žádat až po vysvětlení a kliknutí uživatele. [WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- Rozsah serveru: VAPID klíče, vazba odběru na oprávněného aktéra/zařízení/akci, odstranění neplatných odběrů, odhlášení. Při potvrzeném otevření auta uložit událost do outboxu, deduplikovat podle akce/auta/verze, krátká platnost, netlačit staré uzavřené hlasování. [Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- Kliknutí „Hodnotit“ otevře bezpečný odkaz na aktuální auto, znovu ověří relaci a stav; nepřepisuje rozepsanou práci ani nehlasuje automaticky. Žádné tajné údaje v oznámení. Doručení ovlivňuje systémové omezení, režim soustředění a síť, nelze slíbit okamžité doručení. [Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)

Před implementací potvrdit variantu QR, režim vydávání/obnovy individuálních oprávnění a rozsah push odběrů. Nebyl vytvořen service worker pro push, odběr, VAPID klíč ani skutečné oznámení.
