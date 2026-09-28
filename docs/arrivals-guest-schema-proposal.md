# Host v Show & Shine — dodatečný zásah do schématu

Stav 2026-09-29: dodatečná přestavba je výslovně schválena a implementována samostatnou migrací `db/migrations/2026-09-30-live-arrival-entries.sql`. Následující text zachycuje původní návrh a důvod rozšíření. Platný stav a postup publikace jsou v `docs/arrivals-release.md`.

## Konkrétní překážka

`live_entries.member_id` má NOT NULL a FK na `members`. CHECK dále vyžaduje právě jedno z `car_id` / `competition_car_id`; soutěžní auto rovněž patří povinnému členovi. `event_arrivals` sice umožňuje hosta bez člena, ale schválená migrace nevytváří přímou vazbu soutěžní účasti na příjezd.

Bez dalšího schématového zásahu nelze hosta zařadit bez fiktivního účtu nebo kopie identity auta. Klientská úprava tento problém neřeší. Současné čtení výsledků a zápisy hlasů navíc předpokládají `live_entries.member_id`; pouhé uvolnění NOT NULL by nebylo kompletním řešením.

## Připravený návrh mimo automatický seznam migrací

SQL: `docs/proposals/2026-09-30-live-arrival-entries.sql`.

- `live_entries`: nullable člen a nová přímá FK `arrival_id` na existující `event_arrivals`; právě jeden zdroj auta (původní garáž, původní soutěžní auto, nebo příjezd).
- Nové účasti mohou využít přímo příjezd a jeho `car_key`, bez kopírování auta. Stávající účasti se nepřevádějí; zachovají původní sloupce i ID a `arrival_id=NULL`.
- Projekce `live_entry_vehicles` odvozuje aktuálního člena a stejné auto z příjezdu. Po ověřeném propojení hosta se změní vlastník v projekci, nikoliv ID účasti nebo auta. Projekce neobsahuje e-mail, telefon ani SPZ.
- Unikátnost účasti na příjezd/disciplinu, kontrola potvrzeného příjezdu správného ročníku, zákaz duplicitního fyzického soutěžního auta napříč zdroji a ochrana proti změně identity již soutěžícího příjezdu.

SQLite nemůže tímto jednoduchým ALTER odstranit NOT NULL a původní CHECK. Návrh proto **přestavuje pět tabulek**: `live_entries`, `live_competition_state`, `live_public_votes`, `live_judge_scores`, `live_judge_photos`. Závislé tabulky je nutné dočasně přesně překopírovat a obnovit, aby DROP rodičovské tabulky nespustil ztrátové CASCADE/SET NULL. Všechny existující ID a hodnoty, unikátní index jediné oficiální sady, revizní a auditní triggery se obnovují beze změny. Auditní tabulka, přílohy v R2, finance a jiná data se nemažou.

Původní návrh v `docs/proposals/` je archivní; není určen k provedení. Schválená finální migrace je v `db/migrations/` a `db/schema.sql`, obsahuje navíc kontrolní porovnání dat před odstraněním pracovních kopií.

## Co bylo skutečně ověřeno

Pouze nová sada `node --test tests/arrivals-guest-schema.test.mjs`: **3/3 úspěšně** v in-memory SQLite se zapnutými FK.

1. Porovnání všech existujících business tabulek před/po; zachování finančních hodnot, soutěžních ID, hlasů, oficiálních bodů, poznámek, auditních oprav, fotografických vazeb, konfigurace, všech původních indexů a triggerů. Integrita `ok`, FK bez chyb.
2. Přímá vazba hosta bez účtu na soutěžní účast; body, hlas a fotografická vazba zůstávají po simulovaném propojení příjezdu s již existujícím účtem. Žádný nový člen ani auto v garáži/soutěžním katalogu.
3. Odmítnutí chybějícího/cizího příjezdu, duplicitního auta a přepsání jeho identity; zachování jediné oficiální sady; rollback celé přestavby při následné chybě.

Původních 11 serverových a 10 Chromium scénářů nebylo opakováno. Nebyl spuštěn prohlížeč ani lokální server. D1 produkční runtime, nový výběr účastníků, atomický start a jeho souběh s uzavřením kategorie tímto **ještě nejsou ověřeny**. Test propojení je test schématu, ne nový end-to-end průchod pozvánkou.

## Co následuje po schválení tohoto rozšíření

Dokončit čtení příjezdových účastníků, QR filtraci i ruční vyhledávání hostů, přejmenovat výběr a převést start Show & Shine na potvrzený příjezd. Všechny čtecí a zapisující cesty (výsledky, fotky, oficiální hodnocení i ochrana vlastního hlasu) musí používat efektivního vlastníka z příjezdu. Pravidla Best Exhaust mimo schválenou výjimku vlastního auta neměnit.

Start musí v jedné transakci ověřit oprávnění, skutečné auto, kategorii/originální M, otevřenost a verzi stavu; nesmí přepsat jiné právě hodnocené auto ani vytvářet účast při odmítnutém startu. Samostatně cíleně ověřit nové API návaznosti a tablet/mobil v obou motivech. Teprve potom commit a postup publikace.

Před produkcí se musí znovu ověřit skutečné D1 schéma a úplnost závislostí, vytvořit/ověřit záloha a použít technickou ochranu dotčených zápisů po celý přechod migrace → Worker. Lokální BEGIN/COMMIT test není důkazem atomického provedení konkrétním produkčním importním nástrojem; to musí být součástí přípravy nasazení. Starý Worker nesmí pracovat s nekompatibilním mezistavem. Business přepínače LIVE a registrací se k tomu nesmějí měnit.

Žádný reset, produkční seed, odhad historických příjezdů/plateb ani doplnění skutečných sazeb není součástí návrhu.
