# UNITED LIVE — lokální předání 28. 9. 2026

Základ: `0387dbef650cddb0a8baf83d298719f1dc7a931a`. Dávka je necommitnutá. Žádný push, deployment, produkční migrace, reset, e-mail ani produkční upload nebyl proveden. Aktivace LIVE, Merch, registrace, ročník a platby se nemění.

## Frontend

- Zachovaný průchod člen/QR → potvrzení auta → hodnocení → potvrzené body, včetně vstupu ze sekce Členové a pokračování ve stejné kategorii.
- Samostatný formulář jiného soutěžního auta, opravený checkbox a sekundární akce. Fotoaparát/galerie používají existující kompresní frontu, náhled, odebrání, stav a retry. Fotografie jde přidat také vybranému autu; garáž ani registrace se nepřepisují.
- Kategorie se nepřepíná podle vybraného auta. Nesoulad blokuje zahájení; pravidlo originálního M zůstává.
- Společný členský hlasovací dialog: uložená známka, fotografie, zrušení, klávesnice a návrat fokusu, ochrana před dvojklikem, ověření nejasného zápisu. Potvrzený hlas přežije chybu následného načtení.
- Moje hlasy seskupené do otevřených/uzavřených kategorií; ruční rozbalení se zachovává. Historie je sloučená do Výsledků. Členské hlasování výfuku se nabízí jen při otevřeném hlasování.
- Oprava potvrzené porotcovské sady je výslovná, s přesnými původními body, červeným varováním, povinným důvodem a potvrzením. Koncept si ponechá původní verzi a nemůže přepsat novější zápis.
- Kompaktnější mobilní LIVE hlavička a Program; QR zůstává přímo dostupné. Program používá skutečné datum ročníku, volby Pá/So/Ne a nepovinné časy. Obnova zachovává koncept.
- Cache token dotčených vstupů/modulů/CSS: `20260928-live2`; nový sdílený modul `live-program.js`. Nezměněné závislosti si ponechávají původní tokeny.

## Server a migrace — před budoucí publikací nutné

Tato dávka není pouze frontendová. Vyžaduje připravenou migraci `db/migrations/2026-09-29-live-official-scoring.sql` a odpovídající Worker. Nyní není nic nasazeno.

- Veřejné hlasy: podmínka otevření kategorie/auta i oprávnění jsou součástí jediného INSERT SELECT/UPSERT. Existující vlastní hlas lze měnit po uzavření auta jen v běžící kategorii. Uzavřená/nezačatá kategorie zápis odmítá. Výfuk nemá kategoriální výjimku. Bez hlasů pro vlastní auto a bez požadavku rezervace/check-inu.
- Jedna oficiální porotcovská sada na účast: unikátní index, verze a podmíněný zápis. Původní autor se zachovává; opravu provádějící účet se zaznamená samostatně. Nevzniká průměr mezi účty porotců. Stávající výpočet z kritérií zůstává.
- Audit opravy je v témže databázovém zápisu přes trigger: před/po, autor, opravující účet, čas, důvod a verze. Existující obecný admin audit podporuje jiné pevně vymezené zdroje, proto je zde úzká samostatná tabulka, nikoli změna jeho smlouvy.
- Samostatné soutěžní fotografie mají vlastní tabulku a existující uploadové identity/retry. Interní porotcovské přílohy zůstávají oddělené a neveřejné. Změny používají existující revize LIVE.
- Program bez času ukládá prázdný `starts_at` (stávající sloupec NOT NULL); nezobrazuje vymyšlený čas. Časované body jsou první, shody mají stabilní pořadí. Konec dříve než začátek znamená následující den. Ostatní metadata programu se při jednoduché editaci zachovají.

### Existující data

Pouze čtením byla zkontrolována produkční agregace: pro `united-2026` dvě sady, obě potvrzené, dvě účasti; dotaz na více sad jedné účasti vrátil prázdný výsledek. Nyní není potřeba volit mezi existujícími sadami. Žádná data nebyla sloučena ani smazána. Před případnou budoucí migrací kontrolu zopakovat; unikátní index bezpečně odmítne nově vzniklé duplicity a vyžádá rozhodnutí o nich.

## Cílené ověření

- `node --test tests/live-next-rules.test.mjs`: **8/8**. Pravidla hlasů včetně souběhu s uzavřením, aktivní člen bez registrace/check-inu, soukromí příloh, idempotence soutěžní fotografie, oprava uzavřené kategorie/CAS/audit, program včetně metadat a přes půlnoc.
- Migrace ověřena izolovaně nad předchozím schématem: zachování existující sady a cizích klíčů; duplicitní sady způsobí odmítnutí bez automatického výběru či mazání.
- `tests/e2e/live-next-local.spec.mjs`, pouze Chromium: **14 cílených scénářů úspěšných** (8 základních, 4 rizikové, 2 programové). Pouze lokální ukázková data a zachycené API, žádné produkční zápisy.
- Šířky **360, 390, 1024 a 1440 px**, oba motivy. Ověřeno nové auto/náhled, nesoulad kategorie, skórování, oprava uzavřené kategorie, hlasovací dialog a historie, program a ochrana konceptu. Navíc ztracené potvrzení, retry jen neúspěšné přílohy a konflikt druhého simulovaného klienta.
- Nalezené problémy se sbalením detailu po otevření opravy a cyklem klávesnice dialogu byly opraveny a cíleně znovu ověřeny.
- Syntax všech změněných/nových JS/MJS a `git diff --check`: OK. Celé starší sady ani CI se nespouštěly.

## Screenshoty a omezení

52 lokálních PNG v `test-results/live-next/` (ignorované testovací výstupy, nikoli produkční assety). Prohlédnuty výsledné screenshoty mobilu, tabletu a desktopu v obou motivech; bez deformace fotografií a vodorovného přetékání stránky. Mobilní dny programu se ve 360 px posouvají ve vlastním pruhu.

- [360 px, formulář a náhled, tmavý](../test-results/live-next/360-dark-new-car.png)
- [390 px, oprava hodnocení, světlý](../test-results/live-next/390-light-correction.png)
- [360 px, hlasovací dialog, světlý](../test-results/live-next/360-light-vote-dialog.png)
- [360 px, program s obsahem, světlý](../test-results/live-next/360-light-member-program-content.png)
- [390 px, program s obsahem, tmavý](../test-results/live-next/390-dark-member-program-content.png)
- [1440 px, admin Program, tmavý](../test-results/live-next/1440-dark-program.png)

Výběr kamery je **simulace vložením lokálního souboru**. Fyzická kamera, skutečný telefon, reálný souběh dvou přihlášených zařízení a produkční D1/R2 průchod nejsou ověřené. Souběh a ztracené odpovědi jsou ověřené lokálními řízenými scénáři. Izolovaná SQLite migrace nenahrazuje budoucí schválené nasazení do D1.
