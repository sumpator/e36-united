# Příjezdy — lokální dávka

Stav 2026-09-29: dokončená lokální implementace, schválená publikace se dvěma explicitními migracemi. Výsledek publikace je v soukromém provozním záznamu mimo Git.

**Dodatek 2026-09-29:** schválená přestavba pěti soutěžních tabulek je samostatně v `db/migrations/2026-09-30-live-arrival-entries.sql`. Host má přímou vazbu na potvrzený příjezd, nikoli fiktivní účet nebo kopii auta. Nový atomický start, fotografie, body, výsledky a ověřené připojení účtu jsou dokončené. Postup publikace: `docs/arrivals-release.md`.

## Model

- Jedno skutečné auto má v ročníku jeden příjezd; QR a hledání otevírají společnou kartu v Adminu i Admin LIVE. LIVE nemusí být zapnuté.
- Registrované / místní vstupné je samostatný nullable údaj ročníku. Nová rezervace ukládá cenový snapshot vstupného a služeb. Prázdná sazba není bezplatný vstup.
- Úhrady jsou jednotlivé nezměnitelné položky `event_payments`. Storno je opačná položka s vazbou na originál; agregát rezervace se dopočítává. FREE odpouští jen vstupné a má důvod a autora.
- Příjezd, skutečně přijatá hotovost, audit a potvrzení operace se zapisují společně. Opakovaný požadavek se stejným klíčem nevytvoří další platbu. Nedoplatek vyžaduje výslovné potvrzení.
- Oprava auta nemění garáž ani původní auto rezervace. Auto již vložené do soutěže nelze touto opravou přepsat.
- Hostova pozvánka má hash tokenu, expiraci a jednorázové připojení pouze k aktivnímu účtu se stejným ověřeným e-mailem. Nejednoznačný výsledek poskytovatele se automaticky neopakuje. Newsletter se nezapíná.
- Aktivní administrátor nebo porotce daného ročníku může hodnotit vlastní auto. Oprávnění se kontroluje znovu v zapisujícím SQL; běžný člen vlastní auto hodnotit nemůže. Veřejný hlas a oficiální sada jsou oddělené.

## Schéma a staré údaje

Připravená migrace: `db/migrations/2026-09-30-arrivals.sql`; stejné schéma je v `db/schema.sql` pro nové izolované databáze. Migrace se zde nespouští na produkci.

Staré check-iny zůstávají v `legacy_event_member_presence`, bez převodu na auta. Nový pohled přítomnosti vychází výhradně z příjezdů. Staré agregované úhrady se nerozdělují do platebního deníku; nekompatibilní stará rezervace se nesmí automaticky odbavit podle odhadnuté ceny. Pro online test se nejprve schválí cílený reset a nové založení, viz samostatný návrh.

## Opakovatelná testovací sada

`tests/helpers/arrivals-runtime.mjs` vytváří izolovanou SQLite databázi v paměti. Seed odmítá jiný runtime, má identifikátor `LOCAL-ARRIVALS-V1`, ročník `local-arrivals-v1`, pevná ID a `INSERT OR IGNORE`. Opakované založení neduplikuje záznamy; každý testový runtime začíná čistý. Kontakty používají `.invalid`, runtime nemá SMTP klíč. Chromium přesměrovává API do tohoto runtime a blokuje externí síť.

Testové sazby existují jen ve fixture: vstupné 300/500 Kč, služby 1 000 Kč. Rezervace používají společný výpočet ubytování, nový cenový snapshot a skutečný platební deník, nikoliv ručně přepsaný agregát.

| Scénář | Identita / výchozí stav |
| --- | --- |
| Zaplaceno | `fixture-paid`: 1 300 / 1 300 Kč |
| Nedoplatek, částečná úhrada | `fixture-partial`: 1 300 / 500 Kč, následná hotovost |
| Přeplatek | `fixture-overpaid`: 1 300 / 1 600 Kč |
| Člen bez rezervace | `fixture-unregistered`: místní sazba |
| Host bez účtu | anonymní příjezd založený scénářem, jednorázová pozvánka |
| FREE | `fixture-free`: odpuštěné vstupné, služby zůstávají |
| Jiné auto / opakovaný vjezd | `fixture-othercar`: druhé auto, opakování bez nové platby |

Spuštění pouze cílené sady z kořene repozitáře:

```sh
node --test tests/arrivals-local.test.mjs tests/arrivals-judge.test.mjs
node node_modules/@playwright/test/cli.js test tests/e2e/arrivals.spec.mjs --project=chromium
```

Serverové scénáře navíc pokrývají souběh, rollback, revize, odvolané oprávnění, storno, vazby a opakované připojení pozvánky. Browser pokrývá kartu v obou motivech při 360, 390, 1024 a 1440 px a společný průchod Admin LIVE / Admin s ručním QR.

Fyzická kamera, přihlášená produkce a skutečné doručení e-mailu nejsou tímto ověřené. Nejde o schválení produkčního resetu či nasazení.

## Výsledek lokální kontroly

- 11/11 cílených serverových scénářů včetně skutečného rezervačního endpointu a zachování uloženého vstupného při změně sazby.
- 10/10 cílených Chromium scénářů (9 průchodů rozhraní + samostatný scénář ztracené odpovědi a chyby fotografie). Přehled i hotovost při opakování zůstaly jednou.
- Prohlédnuté screenshoty pro všech osm kombinací šířky/motivu; bez horizontálního přetékání. Výstupy v ignorovaném `test-results/arrivals-arrivals-card-<šířka>-<motiv>-chromium/` (`card-…png`, `confirmed-…png`).
- Migrace samostatně aplikována na schéma původního HEAD v paměti: integrita `ok`, žádné porušené cizí klíče, původní presence přejmenována, nový pohled odvozený z aut. Nic nepřevádí historické příjezdy ani nerozděluje staré úhrady.
- Cache token souvisejících vstupů/importů: `20260930-arrivals2`. Změny dalších Admin modulů jsou návazné verze importů, nikoliv změny jejich funkcí.

Před online testem stále chybí schválené skutečné sazby a konkrétní manifest/resetový postup podle samostatného návrhu. Sazby nové migrace jsou úmyslně NULL. Show & Shine nově vyžaduje potvrzený příjezd skutečného auta, nikoli schválenou rezervaci či předchozí volbu Show & Shine. Samotný příjezd soutěž nezakládá; účast a start vznikají společně až po potvrzení adminem.
