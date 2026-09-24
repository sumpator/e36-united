# Další dávka portálu — lokální předání 2026-09-25

Základ: main `6a314320034186967fc8d5dd2b8cbb4fe1ec43a2`. Bez pushnutí, deploymentu nebo produkčních zápisů.

## Změny

- Club: tři navigační karty, kratší záhlaví, přehled bodů a dvanáctibodových milníků, skutečné přínosy jednotlivých aktivit.
- Menší osobní banner na Přehledu, krátký profilový pruh jinde. Sekce při změně začíná pod pevným záhlavím; opakované otevření stejné sekce neposouvá obsah.
- Mobilní spodní navigace a svislé nativní dialogové menu, focus/Back/safe-area, skrytí spodní lišty při dialogu a zmenšení visual viewportu klávesnicí. Původní horizontální navigace je na mobilu skrytá; desktop zůstává.
- Členský Merch: záložky, karty, prázdný stav, podmíněné stránkování a návrat z detailu se zachováním filtru a pozice. Žádná změna objednávkových operací.
- Účet: osobní údaje, QR a zabezpečení, existující adresní editor a kompaktní vzhled dole.
- Veřejný web: přihlášení s návratovou cestou, bez „Chci jet“, stejné velké U jako na Merchi, světlejší obsahové plochy a zřetelné vybrané možnosti Planneru. Prezentační hodnoticí karta je skrytá pouze na mobilu, LIVE se nemění.
- O nás: původní IntersectionObserver vybíral jen ze změněných průniků a porovnával jejich poměry. Před opravou se reprodukovalo 11 neshod roku při průchodu nahoru/dolů. Nyní rok vychází z geometrie všech položek pod pevným záhlavím, aktualizuje se i po načtení obrázků a změně rozměrů.
- Cache reference změněných modulů a jejich vstupních HTML používají `20260925-portal2`.

## Backend a skutečné meze

Současné body pocházejí z existujícího klubového ledgeru. Merch aplikuje jednu konfigurovanou sazbu od nastaveného bodového prahu. Nemá evidenci vydání/čerpání odměn pro každý další dvanáctibodový milník. UI proto rozlišuje dosažené milníky od nevyčerpaných odměn, nepočítá dostupné/využité odměny, neodečítá body a nenásobí slevu. Samostatná evidence opakovaného čerpání zůstává backendovou mezerou, ne hotovou funkcí.

Jediná lokální backendová úprava: autentizované `/api/me` vrací vlastní již existující token z `member_qr_identities`. Nevytváří identitu, nemění kód ani schéma; při chybějícím tokenu ukáže účet nedostupnost QR. Pro budoucí funkční publikaci QR bude nutné nasadit tuto kompatibilní Worker změnu spolu s frontendem. V tomto tasku nebyl Worker nasazen.

## Ověření

- `node --test tests/portal-next-ux.test.mjs`: 2/2 PASS. Hranice 0, 11, 12, 22, 24, 36 a čtení pouze vlastního existujícího QR bez zápisu/provisioningu.
- `tests/e2e/portal-next-ux.spec.mjs`, Chromium, jeden worker, bez retry: všechny 3 scénáře prošly po cíleném dopracování. Historie oběma směry a přímý přesun; mobilní navigace a Back/focus; oba motivy; nízký notebook; QR otevření, všechny způsoby zavření a dekódování; autentizační návrat; Planner a výběr ubytování.
- Syntax změněných JS/MJS a `git diff --check`: PASS.
- Skutečně otevřené reprezentativní snímky jsou v sousedním adresáři `portal-next-review`: `club-desktop`, `overview-notebook`, `menu-mobile`, `account-mobile`, `qr-mobile`, `merch-mobile`, `club-360`, `home-desktop`, `home-mobile`, `planner-desktop`, `planner-mobile`, `history-notebook` (PNG).
- Rozměry: 1440 px, 1366×768, 390 px a nejhustší Club na 360 px. Kontrola vodorovného přetékání je součástí snímání. Vizuální podklady používají existující skutečné fotografie aut, programu a chatky; nikoli produkční osobní data.

Omezení: přihlášení/API jsou deterministické lokální fixtures, nikoli produkční relace. Softwarová klávesnice byla ověřena simulací visual viewportu, ne na fyzickém telefonu. Celý browser suite, WebKit, CI a starší nesouvisející selhání nebyly spouštěny ani řešeny. Šest nových referenčních screenshotů nebylo v poslední zprávě dostupných; vizuální kontrola vychází z aktuální implementace a vlastních výsledných snímků.
