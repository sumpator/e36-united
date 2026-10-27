# Soukromá anketa Šipky — lokální předání 27. 10. 2026

**Aktuální navazující publikace:** následující původní lokální předání je historie první verze. Schválené závěrečné úpravy a publikační kontroly jsou v závěrečné části tohoto dokumentu; ta nahrazuje původní autíčko, viditelné potvrzení a stav „zatím bez nasazení“.

Výchozí HEAD `3689592bc3793de3d15f87614a37562af2a94b16`. Bez commitu, pushnutí, produkční migrace, deploymentu a nových skutečných zpráv. Pět původních zpráv se nemění ani znovu neodesílá. Práce proběhla pouze v repozitáři E36 United. Projektové AGENTS.md nebyly v repozitáři ani kontrolovaných nadřazených složkách nalezeny.

## Hotová funkce

- `invitations/darts.html`, `poll.css`, `poll.js`, `assets/`: samostatná světlá stránka podle již odeslaného e-mailu. Stejné skutečné logo, výřez fotografie a modré E36 z připravené grafiky, živé nadpisy, přesné výrazy „mámu“ a „asfaltů“, datum 27. 10. 2026 / 19:00 / V KLUBU. Bez hlavního menu a přihlášení. Původní obrazové podklady nebyly přepsány. Auto je výřez původní grafiky v samostatném SVG obalu s vloženým obrazovým zdrojem; silnice je HTML/CSS, ne obrázek předstírající ovladač.
- Nativní rozsah 0–10 zachovává dotyk, tažení, kliknutí i klávesnici. Číslo a auto se mění během pohybu; zápis nastává po uvolnění nebo dokončení klávesové změny. První vizuální pozice 0 není uložená odpověď; čtečka i text oznamují, že hodnotu je třeba vybrat. Výslovně lze zvolit i 0. Ilustračních 7 z e-mailu se nikdy automaticky neukládá.
- Volby ANO/NE/MOŽNÁ ukládá server. NE/MOŽNÁ mažou hodnotu stupnice a skrývají ji. Odkaz na hlavní web se ukáže až po úspěchu, u ANO teprve se skutečně uloženým číslem. Žádný automatický přechod na web.
- Neúspěšný zápis ponechá výběr a nabídne opakování stejné operace. Idempotentní ID brání druhému zápisu při ztracené odpovědi po úspěšném uložení. Klient posílá změny sériově, novější rozpracovaný výběr stará odpověď nepřekreslí. Serverová verze odmítne opožděný nebo souběžný přepis.

## Odkaz, ukládání a oprávnění

URL má tvar `/invitations/darts.html#poll=darts-20261027&token=…&answer=yes`. Token je náhodných 32 bytů, nikoli e-mail nebo členské ID. V D1 se ukládá pouze SHA-256. Fragment se neposílá při GET stránky; stránka používá no-referrer a žádné externí měřicí skripty. Veřejné API vrací pouze stav příslušného tokenu, bez adresy nebo seznamu příjemců. Odkaz je soukromý přístupový údaj; jeho přeposlání předává možnost odpovědět.

`GET/HEAD /api/private-polls/:id/response` pouze čte. Následný POST s Bearer tokenem, JSON, povoleným Origin, expectedVersion a operationId provede atomický UPDATE jedné pozvánky. Při prvním otevření automatický POST čeká na viditelnou aktivní stránku. Hlavičky prefetch/prerender jsou odmítnuty. Běžné přednačítání bez aktivního JavaScriptu tak nehlasuje; aktivní scanner vykonávající JavaScript může člověka napodobit. Stoprocentní rozpoznání člověka se netvrdí.

Volba z odkazu je pouze nápověda první odpovědi při verzi 0. Při opakovaném otevření vítězí uložený stav. Konflikt mezi prvním GET a zápisem zobrazí již uloženou odpověď. Změna osobního fragmentu v témže panelu obnoví izolovaný kontext stránky; odpověď předchozího příjemce se nezobrazí jako nová.

`GET /api/admin/private-polls/:id/results` používá skutečné ověření Firebase a aktuální active/admin roli v D1. `invitations/results.html?poll=darts-20261027` používá existující přihlášenou relaci, nikoli veřejný výsledkový endpoint. Zobrazuje příjemce, odpověď, číslo a čas změny; při ztrátě role výsledky vymaže. Bez relace odkáže na stávající United Admin.

Malý opakovatelně použitelný backend má pouze dvě nové tabulky, bez univerzálního editoru:

- `private_polls`: samostatná anketa a její stav;
- `private_poll_invitations`: příjemce, hash osobního tokenu a jedna verzovaná odpověď. UNIQUE(poll_id,recipient_email), unikátní hash, FK a CHECK 0–10 / pouze pro ANO.

Admin API pro přípravu: `POST /api/admin/private-polls` s `{id,title}`, potom `POST /api/admin/private-polls/:id/invitations` s `{id,email,name,token}`. Připravená stabilní ID a tokeny se opakovaným odesláním stejných payloadů nezmění. Obsahový konflikt vrací 409; jiného příjemce ani token tiše nepřepíše. Žádná vazba na členský účet, marketingové souhlasy, rezervace, platby, body nebo LIVE.

`worker/index.js` pouze vylučuje nové anketové cesty z fast-drain e-mailů. Anketa nevytváří outbox intent ani nespouští odesílání. Cron, secrets a ostatní stávající cesty se nemění.

## Nový e-mail a soukromé podklady

`invitations/darts-email.html` a `.txt` obsahují nové zástupné osobní URL místo odpovědních mailto tlačítek. Text přirozeně říká, že po ANO se vybere 0–10 na stránce. Grafika v e-mailu je nadále pouze ilustrace. Odesílací kód přidán nebyl.

Offline `scripts/prepare-private-poll.mjs` vytváří nový balíček pouze uvnitř ignorované `.local-evidence/` a existující balíček odmítne přepsat. Použije kryptograficky náhodné tokeny. Aktuální balíček `.local-evidence/darts-poll-20261027/private-bundle/` obsahuje jednu definici ankety, pět stabilních pozvánek pro původních pět adres a 5 HTML + 5 textových verzí. Adresy ani použitelné osobní tokeny nejsou v tomto reportu nebo sledovaných souborech. Balíček nebyl odeslán ani zapsán do produkce. HTML používá stejné tři CID obrázky jako původní pozvánka, dostupné v `invitations/assets/`.

## Konkrétní funkční náhled

Spuštěný lokální náhled: **http://127.0.0.1:4188/**. Přesměruje pouze lokálně na syntetický osobní odkaz; stránka ankety sama nepřesměrovává na hlavní web. Používá skutečné Worker handlery a izolovanou SQLite v paměti, dvě adresy example.invalid, bez SMTP secrets a produkčních služeb. Stav trvá po dobu procesu. Po jeho restartu jde opět o čistou lokální ukázku, nikoli reset skutečných příjemců.

Opětovné spuštění: `node scripts/preview-private-poll.mjs` (Node 24). Lokální server přepisuje pouze svoji odpověď veřejného API configu a testovací Origin; produkční seznam povolených originů se neuvolňuje. Nasazený frontend takovou náhradu neobsahuje. Výsledky Admina tento lokální server veřejně neodemyká.

Snímky a důkazy: `.local-evidence/darts-poll-20261027/`, zejména `chromium-{360,390,820,1440}.png`, odpovídající WebKit snímky, `touch-drag.json`, `local-preview-proof.json`, `email-template-checks.json`. Čtyři požadované šířky byly skutečně otevřeny a prohlédnuty, včetně kontrolního WebKitu 390 px. Fotografie zachovává 877:431; bez vodorovného přetékání, čitelné datum i akce. Prohlížečový náhled se nevydává za Gmail/Outlook nebo fyzický telefon.

## Přesné výsledky a průběh kontrol

- První Node výběr nové domény: 5/5 PASS. Doplněno ověření skutečné Firebase/JWT ochrany: konečných **6/6 PASS**, bez skipped. Integrita a cizí klíče OK; konkrétní aditivní migrace na starším izolovaném schématu zachovala původní tabulky, jejich definice/indexy/triggery a existující záznam člena. Produkční D1 se nečetla ani nemigrovala.
- Při vývoji nového browser harnessu: první start blokoval chybný pracovní adresář pomocného configu (sloučené dva web servery); napraveno pouze v novém configu. První browser průchod byl přerušen po chybě testovacího Origin a zdvojených hlaviček. Další výběr měl 1 PASS / 1 FAIL / 9 neprovedených, protože test táhl mimo viewport; doplněno skutečné posunutí ovladače do zobrazení. Následně 4 PASS / 1 FAIL / 6 neprovedených: řízený 409 nebyl ještě výslovně zachycen jako očekávaná HTTP chyba. Výjimka je nyní omezena na daný požadavek a jediný očekávaný kód, ostatní chyby zůstávají kontrolované.
- Poté cílené odhalení chyby nové implementace: změna tokenu pouze ve fragmentu nepřenačítala kontext. Opravena událostí hashchange s ukončením starého kontextu a reloadem. Následující Chromium výběr **7/7 PASS**. Nic z těchto vývojových selhání není vydáváno za úspěšný celý běh.
- Veřejné průchody a vizuální šířky po dokončení: **Chromium 11/11 PASS + WebKit 11/11 PASS v jednom výběru (22/22, 0 FAIL, 0 skipped)**. Zahrnují všechny volby, první volbu bez výchozího čísla, 0/10, změny a reload, jiného příjemce, neplatný token, síťovou chybu, zpožděný POST i závod prvního GET, neaktivní stránku, myší tažený rozsah, dotykové klepnutí a klávesnici. Odpovědi se kontrolují i ve skutečné izolované DB.
- Doplněné Admin UI se skutečným chráněným handlerem a změnou role: následně **1/1 Chromium + 1/1 WebKit PASS**. Syntetický je pouze externí Firebase SDK/session; server ověřuje podepsané izolované JWT a skutečnou roli, nejsou to plošné úspěšné odpovědi API.
- Rozšířená síťová regrese o ztrátu odpovědi až po zápisu do DB: následně **1/1 Chromium + 1/1 WebKit PASS**. Retry stejné operace nezvýší verzi podruhé. Tyto pozdější výsledky nejsou nový celý průchod všech 12 finálních scénářů.
- Navíc skutečné emulované dotykové tažení Chromium přes touchStart/move/end: **PASS**, během tahu 0 požadavků, po uvolnění 1 zápis. Fyzický telefon se netestoval.
- Reálný lokální HTTP náhled (bez page.route mocku API): NE → ANO → 10 → reload zachová uložený stav, **PASS**, 0 externích požadavků. Číslo v náhledu je synteticky zvolená hodnota, nikoli automatická odpověď skutečného příjemce.
- Přímo dotčený sousední Node scénář `default-off transport` v transactional-emails: **1/1 PASS**, cron/webhook a vypnutý transport zachovány. Celé Node/browser sady ani CI nebyly spouštěny.
- Nové šablony: **5 HTML + 5 textových variant, 15 správných neprůhledných odkazů, 3 CID vazby PASS**. Bez odeslání. Finální syntax všech **11 změněných/nových JS/MJS PASS**, `git diff --check` PASS, samostatná kontrola whitespace nových souborů PASS, existující importy/jediné URL verzí/CID vazby a shoda hashů původních tří obrazových podkladů PASS. Po doplnění standardního CORS i na čtecí HEAD proběhla ještě přímo dotčená regrese GET/HEAD **1/1 PASS**. Přesunutí pomocného configu pod e2e (aby nevstupoval do Node globu) ověřeno výpisem přesně 24 testů, nikoli opakováním sad.

Pro opakování pouze této nové dávky: `node --test tests/private-polls.test.mjs`; `node node_modules/@playwright/test/cli.js test -c tests/e2e/private-poll.config.mjs`. Bez retries, force clicků nebo pevných čekání. Konfigurace používá stávající server/Playwright, nemění závislosti ani běžný CI workflow. Prostředí Windows, Node 24.22.1, Playwright 1.62.1; Linux a fyzický iOS/Android nejsou ověřené.

## Potřebné budoucí nasazení — zatím neprovedeno

1. Po samostatném schválení čerstvá ověřená záloha D1, read-only kontrola předpokladů a jediné aplikování `db/migrations/2026-10-27-private-polls.sql` včetně jejího registru. Pouze dvě nové tabulky/index, bez seedování nebo změny stávajících dat; nespouštět jiné migrace.
2. Nasadit odpovídající Worker až po schématu. Starý Worker nové aditivní tabulky nepoužívá. Ověřit zdraví a chráněné výsledky bez testovacích obchodních zápisů. Zachovat vypnuté preview URL, cron, secrets i transport.
3. Nasadit Pages s `invitations/` až po Workeru; nové CSS/JS URL mají jednotný token `20261027-poll1`. Nezměněné společné importy používají své současné verze. Ostatní vstupy webu se nemění.
4. Přihlášený oprávněný Admin provede POST jedné připravené definice a pěti pozvánek ze soukromého `admin-payloads.json`. Nepřegenerovávat ID nebo tokeny; po nejednoznačné odpovědi stejný payload bezpečně ověřit/opakovat. Nezakládat fiktivní členy nebo marketingové kontakty. Potom ověřit výsledky a nulové výchozí odpovědi.
5. Teprve zvlášť schválená nová rozesílka by použila připravené osobní HTML/texty a existující adaptér; tato dávka ji **nepovoluje ani nespouští**. Původní mailto pozvánky nelze změnit. Datum je úmyslně přesně podle zadání; při pozdějším zveřejnění nejprve potvrdit jeho aktuálnost.

## Zachované hranice

Automatický transport a pozastavení Merche se neměnily. Žádné nové skutečné e-maily, produkční callbacky, R2 uploady, účty, objednávky, platby ani změny ročníku/LIVE/registrací. Provozní API/SMTP secrets ani `.dev.vars` nebyly čteny nebo měněny. Zůstávají původní nesouvisející `docs/photo-upload-a3-a4-local.md`, audit, `scripts/audit-20261009/`, `debug.log` a report CI124. Původní evidence prvních pěti odeslaných zpráv je zachovaná a nebyla použita k dalšímu odeslání.

HEAD zůstal beze změny. Sledované změny této dávky jsou pouze `db/schema.sql`, `worker/router.js`, `worker/index.js`; ostatní její soubory jsou zatím nové/nesledované. Nesouvisející změna reportu A3/A4 se k nim nepřipojovala a nic se nestagovalo.

## Schválená finální úprava a publikace 27. 10. 2026

- Původní nepřesný výřez auta nahrazuje `invitations/assets/bmw-e36-coupe-blue.webp`: pravý boční profil modrého E36 Coupé s běžnými koly, průhledným okolím a zachovaným poměrem 2167:725. Použit built-in imagegen s fotografickou předlohou skutečného modrého E36. V repo podkladech nebyla vhodná čistá boční fotografie. Nejde o tvrzení, že nová grafika je fotografie konkrétního členského auta. Zdroj, licence a úplný prompt jsou v `invitations/assets/CREDITS.md`. Prohlédnutý je výsledek ve skutečné velikosti 80/90 CSS px i celá stránka 360/390/1440 px. Ovládací plocha nativního range zůstává velká a jeho výpočet/ukládání se nemění.
- Odstraněn celý podtitulek začínající „Od jdu hlavně na šipky“, včetně jeho odstavce, ze stránky i obou nových e-mailových šablon. E-mailový statický pás je přegenerovaný s novým autem, není oříznuté 0 ani 10. Pět personalizovaných variant používá původní stabilní tokeny a ID; nic se znovu neposílá.
- Úspěch neukazuje viditelný text ani toast. Vybraná odpověď je modrá až po potvrzení serverem; rozpracovaná/neúspěšná volba má odlišný přerušovaný vzhled, popis přístupnosti a případnou stručnou chybu s opakováním. Číslo na stupnici zůstává, i jeho potvrzená a rozpracovaná podoba se odlišují. Dosavadní potvrzení je pouze vizuálně skryté oznámení pro čtečku. Podmínka sekundárního odkazu na web se zachovává.
- Veřejný náhled `/invitations/darts.html` bez tokenu nečte ani nezapisuje odpověď: ovladače jsou vypnuté a stránka požádá o osobní odkaz. Neplatný předaný token se stále odmítá. Nevzniká veřejný seznam příjemců.
- Pro schválené založení pěti pozvánek obsahuje oddělený Admin přehled malý import připraveného JSON souboru. Používá současnou Firebase relaci a chráněné Admin API; žádné přímé SQL ani přenos tokenu do veřejného reportu. Jde o provozní načtení již připravených ID, nikoli editor anket nebo rozesílka. Při obnovení stejného souboru se existující ID/token nezmění. Ztráta oprávnění schová i tuto akci.
- Cache URL nových vstupů jsou jednotně `20261027-poll2`. Nezměněné společné moduly mají předchozí verze. Workflow, závislosti ani obchodní nastavení se nemění.

### Cílené závěrečné kontroly

Jeden cílený výběr pouze dotčených průchodů: **Chromium 9/9 + WebKit 9/9 = 18/18 PASS, 0 FAIL, 0 skipped**. Zahrnuje všechny tři volby, změny, novou grafiku na 360/390/1440, tažení, dotykové klepnutí, klávesnici, chybu sítě a bezpečný retry, grafické potvrzení až po zadržené serverové odpovědi, podmínku odkazu a veřejný nezapisující náhled. Následně malý autorizovaný Admin import a ztráta role **Chromium 1/1 + WebKit 1/1 PASS**. Celé nesouvisející místní sady nebyly opakovány. Nové fotografie/hlasování do produkce kvůli testům nevznikají. Syntax změněných JS/MJS a diff kontrola PASS. Úplný automatický CI se vyhodnotí jednou až pro publikované SHA, bez rerunu.

### Záloha a přechod

Čerstvý soukromý export mimo Git: `../private-backups/20261027-private-polls/production-before.sql`, 396110 B, SHA-256 `8866d28230f46710f2a2c1f08662471ceb7d242302d72444a3efc99382aa7ab3`. Obnoven do izolované SQLite bez aplikace, sítě nebo e-mailů. `integrity_check=ok`, žádné chyby FK. Na naplněné kopii proběhla právě připravená migrace; všech **65 původních tabulek**, jejich řádky a definice/indexy/triggery se zachovaly. Nový registr ani tabulky před migrací neexistovaly.

Předchozí Worker `0ad6472d-12fd-4a2d-a0bb-f5bc41b5dc08`, Pages `13383076-bfc9-49d3-b3cc-33da477ac5ec`, SHA `3689592bc3793de3d15f87614a37562af2a94b16`. Čtecí předletová kontrola: transport_enabled=0, merch_paused=1, activated_at=NULL, preview URLs=false. Migrace je aditivní, dosavadní Worker nové tabulky nečte; technická blokace zápisů není potřebná. Pořadí: samostatný commit → jediná migrace → Worker z tohoto SHA → push/automatické Pages → autorizované založení pěti pozvánek → pouze čtecí ověření. Žádné ukázkové odpovědi se nepřenášejí.

Skutečné výsledné SHA, verze, CI a deploymenty se zaznamenají do ignorované `.local-evidence/darts-poll-publication-20261027/` a závěrečného předání, nikoli jako budoucí úspěch v tomto předmigračním záznamu. Osobní odkazy zůstávají výhradně v soukromém připraveném balíčku. **Nové e-maily: 0.** Fyzický telefon se nevydává za ověřený.
