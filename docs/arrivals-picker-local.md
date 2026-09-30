# Příjezdy a výběr účastníka — lokální předání

Datum: 30. 9. 2026. Výchozí i konečný HEAD: `3ba3dae4c10f9d7461417c69a8ebd5f57dd6caa0`.
Na začátku byl pracovní strom čistý. Tato dávka je pouze lokální, bez commitu, pushnutí a nasazení.

## Prokázaná příčina

Read-only kontrola ověřila dvě uživatelem hlášené ručně založené registrace (`5801b23b…` a `61ebbb65…`): schválené registrace, aktivní členové a platné vazby na konkrétní auta (325 Touring a 323 Sedan). Samotný způsob jejich založení kontrola nedokazuje.

- Původní soutěžní seznam nabízel pouze potvrzené příjezdy; také start vyžadoval příjezd. V ověřeném ročníku nebyl žádný potvrzený příjezd, proto zde auta chyběla.
- Původní databázový dotaz brány oba členy našel prázdným dotazem i skutečným jménem. Nulové příjezdy tedy nebyly příčinou jejich vyloučení z hledání na bráně. Konkrétní selhání hledání jménem se tímto dotazem nereprodukovalo.
- Ovládání brány původně otevřelo prázdný formulář, ale rovnou nenačetlo seznam. Hledání navíc nepokrývalo členský kód a údaje auta tak jako nová varianta.
- Obě starší registrace mají nevyplněné strukturované vstupné (`admission_czk IS NULL`). Nejde o důvod ke skrytí člena; odbavení musí přesně vysvětlit nekompatibilní cenový záznam. Žádný převod starých plateb ani doplnění sazeb nebyl proveden.

## Implementace

- Výběr porotce načítá omezené dávky skutečných aut bez podmínky rezervace nebo příjezdu. Dorazivší auta vybrané kategorie mají přednost. Stejné auto se neopakuje; různá auta člena zůstávají samostatná. Hledá se i skutečné jméno za přezdívkou, kód a údaje auta.
- Rozhraní rozlišuje načítání, chybu API, prázdný seznam a nenalezený výsledek. Miniatura je vázaná na nabízené auto, nikoli libovolné auto člena.
- Sekundární založení soutěžního auta funguje i pro hosta bez účtu. Start nevytváří příjezd, rezervaci, platbu ani záznam garáže. Pozdější brána a ověřené propojení hosta s účtem používají stejnou identitu auta a účasti; neslučují osoby podle podobného jména.
- Server zachovává oprávnění administrátora/přiřazeného porotce, kategorii, originální M, uzavřené kategorie, ochranu souběhu a jedinečnost účasti. Porotci jsou povoleny jen konkrétní přípravné endpointy jeho ročníku, nikoli finanční nebo obecné administrační endpointy.
- Seznam účastníků nahrazuje předchozí panel volby, bez duplicitních nadpisů. Výsledky jsou sekundární akce s návratem k hodnocení; koncepty zůstávají zachované. Spodní ovládání má odstup od pevné navigace.
- Brána má primární skenování a dvě stejně široké sekundární akce. Hledání rovnou načítá seznam. Ruční QR zůstává uvnitř skenování; duplicitní filtry zmizely z přehledu. Statistiky jsou kompaktní a finanční informace zůstávají v detailu.
- Karta má počet osob − / ruční hodnota / +, sbalenou volbu FREE, stručný popisek hotovosti a společný blok potvrzení/návratu. Neznámé ceny nejsou nuly; vysvětlení odkazuje na příslušné nastavení či detail. Finanční mechanismus, idempotence a ověřování nejasného výsledku zápisu zůstávají.
- Nabídka Více obsahuje soukromý tisk / uložení PDF a CSV. Výstup má ročník a čas, escapuje obsah a CSV vzorce; nevzniká veřejný odkaz na osobní údaje.
- Dotčené vstupy a importy používají `20260930-picker1`, včetně nového `admin/arrivals-export.js`. Nezměněné závislosti ponechávají původní tokeny.

## Backend a migrace

Backendová změna i migrace jsou nutné před případnou budoucí publikací této dávky. Původní schéma neumožňovalo požadované soutěžní auto hosta bez člena i bez příjezdu.

Samostatná lokální migrace: `db/migrations/2026-09-30-live-explicit-participants.sql`.
Přestavuje šest existujících tabulek: `live_competition_cars`, `live_entries`, `live_competition_state`, `live_public_votes`, `live_judge_scores`, `live_judge_photos`. Jde o rodičovskou tabulku aut a pět navázaných soutěžních tabulek, nikoli novou paralelní evidenci. U soutěžního auta dovoluje nepřítomného člena a uchovává jméno hosta. Upravuje příslušné pohledy a kontroly identity.

Lokální kontrola prokázala zachování existujících ID, hlasů, bodů, auditu, fotografických a finančních vazeb, indexů a triggerů v připravené sadě; kontrola integrity a cizích klíčů prošla. Oficiální porotcovská sada a její auditní ochrany zůstávají.

Původní lokální předání neprovádělo produkční migraci. Následné schválení publikace a její předprodukční ověření jsou zaznamenány níže.

## Cílené ověření

Osm backendových scénářů v `tests/arrivals-picker.test.mjs` prošlo:

1. Ručně vložená registrace a člen bez rezervace jsou dostupní bez příjezdu; auta bez duplicit.
2. Host bez příjezdu → vytvoření identity → start → body → pozdější brána; hotovost a auto právě jednou.
3. Oprávnění porotce a odmítnutí neoprávněného, nesprávné/uzavřené kategorie a neoriginálního M.
4. Souběžný opakovaný start a ochrana právě hodnoceného auta.
5. Zachování existujících dat a databázových ochran při lokální migraci.
6. Dorazivší host i pozdější ověřené propojení hosta s účtem bez dalšího auta/účasti.
7. Změna role/kategorie mezi kontrolou a zápisem, hledání jména za přezdívkou a stránkování.
8. Skutečný router s lokálně podepsanou relací: přesný rozsah porotce, zákaz financí a obecného Adminu.

Devět unikátních Chromium scénářů v `tests/e2e/arrivals-picker.spec.mjs` prošlo: osm kombinací 360/390/820/1440 px × světlý/tmavý motiv a doplňující průchod hosta, bodů, standardní brány při vypnutém LIVE, chyby API, hotovosti, tisku/CSV a blokovaného starého cenového záznamu. Tablet byl po úpravě spodního odstupu cíleně znovu ověřen. Výsledné screenshoty byly skutečně otevřeny a prohlédnuty.

Testy používají izolovaná ukázková data a zachycené síťové požadavky. Fotografie jsou v browser sadě nahrazené testovacími obrázky; ověřena je vazba na konkrétní ID auta, nikoli skutečné produkční soubory R2. Nebyly spuštěny celé sady ani CI. Syntax změněných/nových JS/MJS a `git diff --check` prošly.

## Screenshoty mimo Git

Umístění: `../local-reports/20260930-arrivals-picker/` vůči kořeni repozitáře.

- `participants-360-light.png` — mobilní seznam.
- `participants-390-dark.png` — seznam v tmavém motivu.
- `gate-390-light.png` — kompaktní přehled brány.
- `gate-card-820-dark.png` — finální tabletová karta a nezakryté spodní akce.
- `participants-1440-dark.png` — desktopový seznam.
- `private-print.png` — soukromý tiskový výstup.

## Omezení a stav

Fyzická kamera, skutečný telefon, přihlášený produkční průchod a dva skutečné účty nejsou ověřené. Nebyly ověřovány produkční fotografie/R2 ani skutečné ruční uložení PDF tiskovým dialogem operačního systému. Staré nestrukturované ceny nebyly převedeny a jejich odbavení zůstává výslovně blokované.

Produkce byla použita pouze ke čtení při diagnostice. Bez resetu, migrace, zápisů testovacích dat, e-mailů, uploadů či změn sazeb, ročníku, LIVE, registrací a Merche. Žádný commit, push nebo deployment. Všechny pracovní změny patří této lokální dávce.

## Schválená publikace — příprava 30. 9. 2026

Uživatel následně schválil publikaci včetně backendu a výše uvedených šesti tabulek, nikoli reset nebo seed. Historické údaje předchozích oddílů popisují lokální předání, ne konečný stav nasazení.

- Výchozí produkční SHA `3ba3dae4c10f9d7461417c69a8ebd5f57dd6caa0`; Worker `2c9c2ea9-45d6-4ff6-a7eb-89bb1aef1026`, Pages `727ad1ed-2b0a-4bc2-a999-bf11eeb5eb64` (SUCCESS, shodné SHA).
- Čerstvá soukromá záloha `../private-backups/20260930-picker/production-before.sql`, 347036 B, SHA-256 `cf952bb2786a4b91bfbc502bb153303d48d9b5d6aec5d930eb54a3d560df08a1`. Obnovena do izolované SQLite bez aplikace, sítě či e-mailů. Úplná integrita a FK prošly; produkční D1 podporované `quick_check` a FK také prošly.
- Na naplněné kopii prošla přesná migrace: všech 61 původních tabulek zachováno po původních sloupcích, včetně 9 účastí, 3 hlasů, 2 porotcovských sad, 2 rezervací a veškerých ostatních vazeb/config. Příjezdy, platební deník, fotografie porotce a audit oprav jsou v této záloze prázdné; jejich původní schéma/indexy/triggery jsou ověřené, nikoli vytvořené náhradní produkční záznamy.
- Šest tabulek se kopíruje uvnitř jedné atomické operace, obnoví se stejné hodnoty a ID, následně pohledy, původní indexy a triggery. Obousměrné SQL assertions a FK kontrola odmítnou rozdíl před odstraněním pracovních kopií. Nový sloupec jména hosta má pro původní auta prázdnou hodnotu, žádné odhadované doplnění.
- Technická blokace používá stávající marker `2026-09-23-live-writes-enabled` a databázové triggery. Dočasné `picker_cutover_*` chrání i rodičovské/finanční a fotografické návaznosti; původní marker se obnoví přesně včetně času. Na izolované kopii ověřeno odmítnutí INSERT/UPDATE/DELETE před i po migraci, obnovení markeru a zachování dat. Již běžící požadavek je kontrolován při databázovém zápisu, nikoli pouze na vstupu routeru. Atomický import odděluje běžící transakce od přestavby.
- Pořadí: commit/fetch bez pushnutí → technická blokace → další čerstvý export a porovnání → právě tato jedna migrace → porovnání → Worker z commitu → push main → Pages SUCCESS a přesné HTTP porovnání → read-only kontrola → uvolnění blokace. Business přepínače se nemění. Starý frontend používá nadále přijímané parametry; jeho původní požadavek na příjezd je pouze přísnější UI, nevynucuje nekompatibilní zápis. Blokace zůstane do dokončení obou nasazení.
- Při rozdílu se nepokračuje ani neobnovuje celá produkční databáze starší zálohou. Provozní ID, exporty a závěrečná porovnání se ukládají mimo Git ve stejném soukromém adresáři. Osm backendových ani devět browser scénářů nebylo opakováno.
