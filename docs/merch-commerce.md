# UNITED MERCH — propojený obchod, lokální předání 24. 9. 2026

## Stav a rozsah

Implementace navazuje na publikovaný katalog. Původní hero s velkým U je beze změny.
Používá existující optimalizované produktové assety, původní stabilní ID, detail,
varianty, historii dialogu a košík. Fotografie mají společný rám a rezervovaný poměr
stran; zapečené pozadí některých zdrojových vizualizací nebylo vydáváno za odstraněné.
Originály ani barvy a střihy nebyly přemalovány.

Nové moduly propojují katalog, D1 objednávku, registrační QR generátor, ruční
platební evidenci, vyřízení a historii. Member Portal obsahuje Merch, přehled aktivních
objednávek, záložku plateb a výchozí adresu. Admin má produkty/objednávky/nastavení,
Merch v platbách a v detailu člena. UNITED LIVE zůstává poslední položkou.

### Peníze a ochrany

- Server počítá haléře z katalogu; klientské ceny a slevy odmítá. Změněná rekapitulace
  vyžaduje nové potvrzení. Body se neodečítají ani nepřičítají.
- D1 batch atomicky vytváří objednávku a outbox. Unikátní členský request key vrací
  původní objednávku; klient po přerušeném spojení ověřuje uložený požadavek.
- Snapshot obsahuje kontakt, položky, ceny, banku, dopravu a přijaté dokumenty/verzi.
  Čas uzavření je `created_at`. SQL trigger brání přepsání snapshotu.
- Úhrady, opravy a refundace jsou oddělené záznamy v revisionovaném stavu s historií.
  Compare-and-swap brání ztraceným souběžným zápisům. „Zaplaceno“ doplní pouze zbytek.
  Filtry i detail odečítají evidované refundace.
- VS začíná 8; tři triggery kontrolují kolize s registračními VS oběma směry.
- Vypršení se odvozuje při serverovém čtení i zápisu, ne z klientských hodin. Částečná
  platba vyžaduje ruční dořešení. Pozdní platba nezpůsobí automatické obnovení.
- Nový prodej je po migraci pozastaven. Neúplná konfigurace blokuje aktivaci i nákup.
- Produkty jsou veřejné; objednávky a adresy pouze vlastníka / serverově ověřeného
  administrátora. Žádný veřejný endpoint na objednávkové PDF neexistuje: tisk dostane
  jen již autorizovaná data. Adresní štítek používá tisk prohlížeče / Uložit jako PDF,
  nikoli API dopravce.
- Fotografie R2 jsou admin upload s omezením MIME, signatury a velikosti. Veřejné jsou
  až po publikaci; potom zůstávají dostupné také pro historické objednávky.
- E-mail využívá SMTP2GO z existující konfigurace. Selhání nevrací nákup jako neúspěšný.
  Nejasný výsledek poskytovatele se automaticky neopakuje. Admin může přečíst stav
  bez odeslání a výslovně odeslat pouze dosud čekající zprávy. `sending`, `failed`
  a `uncertain` vyžadují lidské ověření u poskytovatele; nejsou slepě opakovány.

## Před aktivací musí potvrdit majitel

1. IČO, PSČ sídla, daňový status, telefon a správnost kontaktního e-mailu / adresy
   pro vrácení. Jméno a ulice jsou převzaty pouze ze zadání. Read-only vyhledání
   názvu „United Classic Cars“ v ARES nevrátilo shodu; to není důkaz neexistence spolku.
   Je potřeba IČO nebo výpis, nikoli odhad.
2. Skutečnou sazbu členské slevy. Projekt dokládá odměnu při 12 bodech, ne její
   procentní hodnotu. Sazba proto zůstává `null`, nikoli vymyšlené procento.
3. Reálné informace o dodání, kontaktní/předávací instrukce a retenční pravidla.
4. Ověřený netestovací bankovní účet: Admin jej umí převzít z existující konfigurace
   registrací; ručně vložený klientský účet se nepřijímá. Produkční účet nebyl v tomto
   tasku měněn ani nahrazován testovacím.
5. Finální verzi dokumentů. Admin připraví návrh z uložených údajů, označí chybějící
   informace `[DOPLNIT]` a vyžaduje jejich doplnění a výslovné schválení před aktivací.

Schválené ceny seed: polo 890 Kč, trička 690 Kč; S/M/L/XL; ČR 129 Kč; převzetí 0 Kč;
72 hodin. Žádné smyšlené fyzické zásoby. Nastavení dostupnosti je samostatné.

## Dokumenty — ověřené zdroje

Kontrola 24. 9. 2026. Návrhy nejsou tvrzením, že byly ověřeny neznámé údaje provozovatele.

- [ČOI: odstoupení](https://coi.gov.cz/faq/7-odstoupeni-od-smlouvy-do-14-dnu-u-zbozi/):
  internetový nákup včetně osobního převzetí, 14 dnů, formulář a vrácení dopravy.
  Osobní odběr se do nejlevnější dopravy nezapočítává.
- [ČOI: reklamace](https://coi.gov.cz/faq/6_reklamace-zbozi-od-6-1-2023/): práva z vad
  a vyřízení reklamace; běžné varianty oblečení nejsou automatickou výjimkou z vrácení.
- [ČOI, 14. 9. 2026](https://coi.gov.cz/tlacitko-usnadni-odstoupeni-od-smlouvy/):
  zákon 159/2026 Sb. nabývá účinnosti 1. 1. 2027. Nezaměňovat se starším avizovaným
  termínem v návrzích. Online odstoupení s potvrzením a časovou evidencí je připraveno již nyní.
- [ÚOOÚ: základní příručka](https://uoou.gov.cz/verejnost/zakladni-prirucka-k-ochrane-udaju).
- [ARES](https://ares.gov.cz/ekonomicke-subjekty): výše uvedené identifikační údaje zůstaly neověřené.

## Izolované ověření

- `merch-commerce.test.mjs` + `merch-shop.test.mjs`: **25/25 PASS**.
  Včetně naplněné předchozí DB → migrace, FK/integrity/indexů a zachování registrace,
  VS oběma směry, cen/discount/shipping, dvojkliku, souběžných úhrad, historie,
  expirace/pozdní platby, UID, R2 publikace/archivace a e-mailového selhání.
- `merch-shop.spec.mjs`: všech **8 cílených Chromium scénářů prošlo**. První průchod
  odhalil chybné klikání testu za otevřený produktový dialog po reloadu; opraven běžný
  průchod přes košík v dialogu. Znovu běžely pouze tento a dosud nespouštěný scénář.
- `merch-connected.spec.mjs`: **3 scénáře PASS**. Dva souvislé průchody (1440 / 390),
  částečná úhrada/doplacení/zmizení QR; třetí Admin produkt → veřejný filtr,
  adresa v účtu → přehled/platby → Admin platební záložky.
- Světlé/tmavé obrázky katalogu, checkoutu, plateb a Admin detailu byly pořízeny
  a otevřeny. Kontroly přetékání na 1440/390/360 prošly. Použity skutečné repo assety,
  ale izolované identity, objednávky a bankovní údaje; ne produkční účty.
- Admin module graph: bez cyklů/chyb; související test 6/6 PASS.
- Syntax změněných JS/MJS a `git diff --check`: PASS.
- Doplňková starší sada `reservation-payment-phase1.test.mjs`: 14/15 PASS.
  Její test `admin overview derives compact financial totals from active reservations`
  selhává na `no such column: title`: vlastní minimalizované `events` schéma testu
  postrádá `title`, který nezměněný `worker/domains/events.js` čte. Test, event modul
  i `worker/domains.js` jsou proti HEAD beze změny. Nejde o zelený výsledek této sady;
  fixture nebyla v tomto tasku rozšiřována. Zachování reálného schématu a peněz je
  navíc ověřeno novým naplněným migračním testem.

Screenshoty mimo Git: `../merch-connected-review/` (catalog/filters, checkout,
payment, member, admin; viewport a theme jsou v názvu). Celý browser suite ani WebKit
nebyly spuštěny. CI nebylo sledováno ani opakováno.

## Připravené pořadí nasazení — zatím NEPROVEDENO

1. Samostatný souhlas s produkční migrací a novým platebním procesem; potvrdit výše
   uvedené provozní údaje. Zaznamenat SHA a aktivní Worker verzi, export D1 a ověřený
   bod obnovy. Žádný testovací člen ani fixture data se nepřenášejí.
2. Jednou aplikovat `db/migrations/2026-09-24-merch.sql`. Vytvoří 7 nových tabulek,
   jejich indexy/triggery, jediný pozastavený konfigurační řádek a záznam migrace.
   Triggery na reservations pouze hlídají budoucí kolize VS; existující řádky nemění.
   Ověřit registry, FK a existující registrační data read-only.
3. Nasadit Worker přesného ověřeného SHA. Starý frontend může dále používat stávající
   endpointy. V Adminu založit schválených 6 produktů / 10 variant idempotentním seedem,
   doplnit konfiguraci a dokumenty, **ponechat pozastaveno**.
4. Nasadit Pages stejného SHA, ověřit katalog a autentizované čtení bez business zápisů.
   Cache token `20260924-merch2` sjednocuje celý Admin import graph; změny v mailing/LIVE
   souborech jsou pouze verzovací importy, nikoli změna jejich chování.
5. Teprve po schválení majitelem vypnout pozastavení objednávek. Aktivace zapisuje
   jen konfiguraci/audit. Následné skutečné nákupy zapisují pouze merch tabulky/outbox;
   fotografie produktů přibývají do prefixu `merch/` stávajícího R2.

Při problému před aktivací ponechat pozastaveno; starý frontend/Worker lze vrátit
bez mazání aditivních tabulek. Po přijetí objednávek nemažte tabulky ani neobnovujte
starou celou DB přes nové business zápisy: nejdřív pozastavit nové objednávky,
zachovat ledger/outbox a rozhodnout o cílené opravě. Automatický rollback není součástí.

V tomto tasku: žádný push, deployment, produkční migrace, R2 upload, skutečná objednávka,
úhrada nebo e-mail. Lokální implementace čeká na samostatné schválení nasazení.
