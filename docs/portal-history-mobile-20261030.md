# Historie, mobilní portál a členská výhoda — 30. 10. 2026

Výchozí publikovaný stav: `6d60a67206f290f44932fb64071f16715bd900fe` (CI #151). Jde o frontendovou dávku; Worker, schéma, migrace, oprávnění a workflow se nemění. Původní rozpracované reporty, audit a diagnostiky zůstávají mimo commit.

## Dokončené úpravy

- Editor ročníku má primární „Odeslat účast ke kontrole“, u ověřené docházky „Odeslat výsledek ke kontrole“. Dokončení celé kontroly historie je samostatný vedlejší úkon v souhrnu, mimo editor. Význam `historyCompletedAt`, schvalování ani bodová pravidla se nemění.
- Důkaz má společný fotografický piktogram, výzvu Přidat fotografie, povinný minimální počet, soukromí a náhledy. Chybějící důkaz se ověřuje před kategorií a před API: viditelná chyba u pole, přístupné oznámení, fokus a potřebný scroll bez otevření galerie. Limity 1–4 JPG/PNG/WebP, 8 MB zůstávají. Kategorie se nadále ověřuje před zápisem. Při 503 zůstává výběr a lze znovu odeslat. Ověřená účast při soutěžním doplnění novou fotografii nepotřebuje.
- Neodeslané změny chrání stávající typ potvrzení při zavření/přepnutí ročníku a odchod ze stránky. Úspěšný zápis tento stav ukončí; opakované odeslání během požadavku je blokované.
- První nové auto vychází z aktuálního seznamu aut a má předvolený hlavní stav. Editace zachovává skutečný příznak, další auto nepřebírá hlavní stav.
- Onboarding používá přesné Registruj se na sraz!, při uzavřených rezervacích připravuje plán. Odstraněn obrys nadpisu a nadbytečné horní odsazení, zachováno posouvání i dostupné zavření.
- Jediná existující identita se na mobilním breakpointu přesouvá do hlavičky agendy, na desktopu zůstává na původním místě. Nevzniká druhý soukromý obrázek ani nový požadavek pro každou agendu.
- Mobilní menu má úsporné skupiny, žádnou velkou fotografii, dostupné LIVE a odhlášení, bezpečné vlastní posouvání. Veřejná, členská i spodní navigace používají stejné stávající SVG piktogramy. Aktualizace popisku účtu zachovává jeho ikonu.
- Přehled má kompaktní rozpoznatelné bloky s hodnotou a samostatnou sémantickou akcí, správné „3 osoby“. Rezervace je těsnější; potvrzení má jemný zelený pruh a ikonu, nedoplatek je samostatně. Club má společný flexibilní akční řádek; fotografie, roky a ocenění se nepřekrývají. Neukončený ročník nemá šipku ani aktivní tlačítko.
- Použit původní transparentní znak United. Světlý motiv mu nepřidává tmavé pozadí; tmavý používá světlou siluetu z alfa masky stejného originálu. Originál je zachován, bez barevně destruktivního filtru.

## CI #150 — hranice důkazů

Použity již stažené trace, screenshot a log běhu `41082377035`. Trace ukazuje změnu polohy kolem kliknutí na plus a konečné předání dvou osob; sám neprokazuje ztracený klik oproti následnému přepsání stavu. Zelené CI #151 nepovažujeme za vysvětlení.

Regrese nyní samostatně kontroluje výchozí 2, výsledek jediného kliknutí 3, hodnotu 3 těsně před přechodem, zakódované `crew:3` a skutečně převzaté 3 v členském formuláři po izolovaném přihlášení. Zachovává odmítnuté Storage zápisy a neprovádí rezervaci. Zaznamenává pointerdown/up/click, souřadnice ovladače, scroll a hodnotu. Cíleně Chromium a WebKit 2/2 PASS; předtím diagnostický WebKit 1/1 PASS. Příčina původního selhání zůstává neobjasněná, nebyla provedena spekulativní oprava výpočtu či klikání.

## Sleva — autoritativní nastavení

Stávající serverový `quoteLines` podporuje sazbu `discountBasisPoints` od `rewardThreshold:12`, zaokrouhluje haléře a odděluje dopravné. Izolovaně ověřeno: 690 Kč zboží, 36 % = 248,40 Kč sleva; při dopravném 99 Kč celkem 540,60 Kč. Při 11 bodech sleva není; při 12/24/36 bodech sazba zůstává stejná, bez násobení či spotřeby bodů. Nepřidává se evidence čerpání.

Společná prezentace čte skutečné nastavení katalogu; Club, nápověda i Merch při sazbě 3600 ukazují od 12 bodů 36 % a odkazují na serverovou rekapitulaci. Neaktivní/nenastavené nastavení neslibuje číslo. Pozastavení objednávek zůstává v platnosti. Při prvním read-only ověření produkce byla sazba `null`, práh 12 a prodej pozastavený; samostatný cílený zápis sazby byl nabídnut provozovateli, neproveden mlčky.

## Samostatná operace odstranění účtu

Přesný účet byl ověřen shodným Firebase UID a aplikačním profilem, bez opravy překlepu nebo fuzzy hledání. Provozovatel navíc potvrdil konkrétní nevratný úkon v konzoli. Firebase odstranění bylo ověřeno opětovným hledáním UID bez výsledku.

Aplikační profil je do konce platnosti starých Firebase ID tokenů cíleně blokovaný. Stávající Worker ověřuje podpis a expiraci lokálně; proto se profil nemaže před uplynutím hodiny a jeho pětiminutové tolerance. Konečný výsledek databázového odstranění a R2 úklidu bude doplněn po ověření, nikoliv předem označen za hotový.

Neveřejné podklady jsou pouze v ignorované `.local-evidence/portal-history-20261030/`: cílená záloha řádků/skutečných FK, samostatný onboarding bez FK, dva ověřené binární objekty z EU bucketu včetně SHA-256, identifikace a časové záznamy. Tyto podklady ani osobní údaje nejsou součástí Gitu. Zmapováno: profil 1, auto 1, fotografie auta 1, galerijní příspěvek 1, Planner koncept 1, QR 1, veřejné hlasy 2, onboarding 1; bez rezervací a plateb.

## Ověření

Pouze cílené lokální běhy, bez retries a bez celých nezměněných sad:

- Nový výběr historie/hlaviček: 18/18 PASS v Chromium/WebKit/Firefox; posílený soutěžní amendment navíc 2/2 PASS v Chromium/WebKit.
- Finální regrese chybějící fotografie, kategorií a veřejných ikon společně s existujícími průchody historie: 15/15 PASS ve třech prohlížečích. Předchozí selhání nových testů jsou zachovaná v lokálních logách; šlo o chybné směrování fixture, chybějící soukromé médium a příliš přesné porovnání formátování konzolové výjimky. Výjimka se povoluje jen pro jedinou záměrnou 503 a její přesnou aplikační chybu, ostatní chyby zůstávají kontrolované.
- WebKit při zachycení multipart požadavku předal soubor se skutečným názvem, ale nulovými bajty. Jen tuto měřenou mezeru fixture doplňuje z aktuálního browser File; formulářová pole i skutečný handler a jeho validace zůstávají zachované.
- Garage/Planner/fokus/krátký onboarding: 12/12 PASS Chromium/WebKit, kontrola skutečné databáze, zachovaného hlavního auta, návratu a retry bez duplikace.
- Club/Rezervace/menu, mobil i desktop a oba motivy: 8/8 PASS Chromium/WebKit.
- Nenastavená i 36% výhoda v izolovaném Merchi: 10/10 PASS Chromium/WebKit, žádná objednávka. Jeden předchozí souběžný běh ztratil sdílený lokální server; je zaznamenán jako problém prostředí, jeho výsledky se nevydávají za úspěch.
- Přehledové bloky a jejich čtyři cíle: 6/6 PASS Chromium/WebKit; finální hodnoty/fotografie a úvod na čtecí ploše iPhonu 10/10 PASS, po odstranění horní mezery jen onboarding 6/6 PASS.
- Zachování navigace, reload otevřeného menu, rušení opožděných akcí a zvětšený text: 15/15 PASS Chromium/WebKit/Firefox. Veřejné menu a hlavička po vizuálně odhaleném doplnění společných rozměrů SVG: 6/6 PASS, včetně velikosti ikon a výšky hlavičky. Finální screenshoty byly znovu otevřené.
- Cílený Node: Club/server + výhoda 14 PASS; prezentace/Club/rezervace 46 PASS; související phase-A/A1 26 PASS; Admin graph regrese 6 PASS. Jde o různé cílené běhy, nikoli nový úplný Node průchod.

Screenshoty byly skutečně otevřené: 360, 390, 820 a 1440 px, oba motivy, detail historie, čitelná ocenění, menu, rezervace, přehled i počáteční/posunutý onboarding. Další výsledky kontrol, automatického CI a publikace budou doplněny zvlášť. Emulace Windows Chromium/WebKit/Firefox není ověřením na fyzickém iPhonu; Linux prověří jediný automatický běh publikovaného SHA.

Cache uzávěr `20261030-history1`: 15 cílových modulů/stylů, 30 verzovaných odkazů. Nezměněné závislosti ponechávají své tokeny. Syntax, kontrola návaznosti Admin modulů a `git diff --check` prošly. Worker, migrace, dopravní/platební pravidla, ročník, uzávěry, transport, LIVE, preview URL a pozastavení Merche se nemění.

## Publikace — následné provozní doplnění

Commit `55030f41da49fba67d83079b79ba96a7d27557b7` byl běžně pushnut na `main`; vzdálené SHA bylo čerstvě ověřeno. Pages `56efd2b7-6df5-4812-8b82-3c6ba0505e63` má SUCCESS a stejné source SHA. HTTP porovnání 21 dotčených HTML/JS/CSS odpovídá přesnému commitu (u HTML se normalizovala pouze automatická Cloudflare ochrana e-mailových adres). Katalog stále obsahuje 8 produktů a má pozastavené objednávání.

Automatický [CI #152](https://github.com/sumpator/e36-united/actions/runs/41133922493), pokus 1, ověřuje stejné SHA; Node a syntax již úspěšně skončily, browser kroky při tomto zápisu ještě běží. Ruční workflow ani rerun se nespouští. Worker stále `a458c9f7-ad43-4564-a516-4a65b9fec70c`, transport 0, Merch paused 1, preview URL vypnuté. Jde o lokální doplnění po publikaci, nikoli další opravný commit.

## Související regrese odhalená v CI #152

Chromium odhalil dvě selhání veřejného průchodu v `mobile-content-polish.spec.mjs` (360 světlý a 390 tmavý). Oba skončily při následném přepnutí na 820 × 390: kliknutí na kategorii Cabrio zachytávala ikona účtu z pevné hlavičky. Stažený artefakt `13017061861`, oba trace a otevřený screenshot dokazují nepřiměřeně velké SVG. `mobile-navigation.js` na veřejných stránkách kopíruje odkaz účtu do `.mobile-auth-link` mimo `.nav-links`; nové společné CSS mělo rozměry pouze pro původní navigaci. Jde o aplikační regresi této dávky, nikoli o rozdíl Windows/Linux.

Oprava pouze rozšiřuje stejný rozměrový selektor na existující kopii `.mobile-auth-link`. Regrese hlavičky nově zahrnuje nízký tablet 820 × 390 v obou motivech a kontroluje také skutečné rozměry SVG v kopii odkazu. Otevřené screenshoty WebKit/Firefox potvrzují běžnou velikost a kontrast. Cache `styles.css` a návazného `main.js` je `20261030-history2`; ostatní moduly zůstávají jednotně `20261030-history1`.

První rozšířený cílený průchod: 20 PASS / 1 FAIL z 21 v Chromium/WebKit/Firefox. Všech 12 kontrol hlavičky prošlo. Zbývající Firefox 360 po opravení ikony narazil na jiný doložený testový stav: test nejprve posunul fotografický panel, čímž řádek kategorií zůstal pod běžnou pevnou navigací. Screenshot již ukazuje normální 17px ikonu; trace uvádí překrytí samotnou navigací. Příprava testu nyní před klikáním a po změně orientace přivede řádek kategorií doprostřed viditelné plochy. Zachovává běžné kliknutí, všech sedm kategorií a všechny následné kontroly; nepoužívá force, retry ani čekání. Výsledek tohoto samostatného cíleného průchodu je doplněn níže, předchozí neúspěch zůstává evidovaný.

Následné ověření pouze změněných veřejných průchodů: 9/9 PASS Chromium/WebKit/Firefox (360 světlý, 390 tmavý, 1440 světlý, v mobilních scénářích také 820 × 390 a všech sedm kategorií). Nejde o nový celý browser průchod. Syntax tří dotčených JS/MJS, konzistence 30 odkazů na 15 modulů/stylů a `git diff --check` prošly. Aplikační změna navíc je jediný CSS selektor; Worker, databáze, závislosti a workflow se nemění.
