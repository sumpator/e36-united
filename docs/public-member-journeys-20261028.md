# Veřejný web a členské průchody — 28. 10. 2026

Pokračování a aktuální limit 5/10 sekund: [public-member-followup-20261028.md](public-member-followup-20261028.md). Níže zůstává historická evidence první publikace.

## Výchozí stav a hranice

- Výchozí `main`: `7cb5c3f6b4d35cc6673852ec70aa0490556f9137`, shodný s čerstvě načteným `origin/main`.
- Cloudflare Pages, stávající Worker/D1/R2, Firebase Authentication. Dávka mění pouze frontend a jeho testy; bez změny Workeru, migrací, závislostí nebo workflow.
- Produkční baseline: Worker `a458c9f7-ad43-4564-a516-4a65b9fec70c`, Pages `e2321ffe-ce45-45cf-bef9-41dbc8e57ef9`. Aktuální `united-2026` má registrace zavřené, Merch je pozastavený, provozní e-mailový transport vypnutý, preview URL vypnuté.
- `www.e36united.cz` je canonical. Apex také odpovídá 200, nepřesměrovává na www. Jsou to dva různé storage originy; session a lokální koncepty nelze pokládat za automaticky sdílené mezi nimi. Směrování se touto dávkou nemění.
- Nesouvisející report A3/A4, původní audit, starší rozpracovaný report CI #124, debug.log a diagnostiky zůstávají mimo commit.

## Inventář hlavních průchodů

| Stav / vstup | Akce a cílový stav | Zachování dat a návrat |
|---|---|---|
| Anonymní veřejný web, O nás, Galerie, Merch, účet | „Registrovat se“ → skutečný registrační formulář; dostupné přepnutí na přihlášení | `returnTo`, případně cílová sekce; nevyřešený auth stav má neutrální „Účet“ |
| Přihlášený člen na veřejném webu | „Můj United účet“ → členský účet | Stávající společný Firebase mechanismus, žádný druhý bootstrap |
| Nový účet / přímý vstup do Garáže | Registrace → automatické přihlášení → bootstrap profilu → Garáž | Chyba profilu ponechá session a nabídne retry; nevytváří druhý účet |
| Obnova session | SDK → persistence → první auth stav → token → API → profil | Časově omezené načtení; pozdní odpověď staré session nesmí obnovit odhlášený účet |
| Planner bez účtu | Změny pobytu, ubytování, osob, S&S → pokračování přes účet | Validovaný lokální koncept, vazba na ročník, existující handoff a serverový koncept |
| Planner se zavřenými registracemi | Přenos plánu → odpovídající omezený stav / předběžný průchod podle konfigurace | Žádná automatická rezervace, platba ani přepis existující rezervace |
| Planner bez auta | Přidat auto → potvrzené vytvoření → návrat do rozepsaného Planneru | Existující regrese kontrolují chybný refresh, retry bez druhého auta a hlavní auto |
| Přehled | Nejprve stav registrace a další akce, potom body a achievements | Výpočet bodů beze změny, detail pravidel zůstává dostupný |
| O nás | Scroll oběma směry / kliknutí na rok / přímý hash | Společná čtecí hranice pro rok, článek i „právě čteš“; resize, fonty, obrázky, pageshow |
| Dialogy, Galerie a vzhled | Otevření/zavření, změna tématu, reload | Cíleně ověřená obnova scrollu a překryvů; globální šednutí nebylo reprodukováno |

## Doložené chyby a opravy

1. **Nedokončený auth bootstrap a pozdní session odpovědi.** SDK/persistence/první auth callback neměly společnou hranici dokončení. Nyní mají 20 s a pravdivý chybový stav s retry. Pouze konkrétní chyby nepodporované persistence přejdou na Firebase in-memory persistence; jiné chyby se neskrývají. API klient a obnovování členské session odmítnou dokončení z jiného uživatelského objektu či předchozího pokusu. Navigační API má deadline a zneplatnění starého požadavku. Původní kopie kódu selhala v sedmi řízených regresích. To dokládá konkrétní vady; samo o sobě to neprokazuje jedinou příčinu původního problému na uživatelově iPhonu.
2. **Nejasné vstupy do účtu.** Společné vykreslení názvu a URL nyní rozlišuje „Účet“, „Registrovat se“ a „Můj United účet“. Anonymní vstup výslovně nastavuje `mode=register`. Existující očekávání dvou browser testů se změnila právě podle tohoto schváleného chování.
3. **Planner ztrácel fokus a posouval ovládání.** Kliknutí znovu vytvářelo karty ubytování. Nyní zůstává DOM karty a mění se pouze aktivní stav. Mobilní zatržítko v toku měnilo výšku o 27,6 px; je mimo tok a šířka rámečku je shodná. Změna částečného ubytování vyvolávala scroll anchoring (naměřeno 22 px). Pohyb hoverované karty a úvodní reveal transform pohybovaly už dostupným ovládáním. Oprava je omezena na Planner, bez globálního scroll locku, pevné výšky či vracení scrollY.
4. **Veřejný plán se neobnovoval po reloadu.** Průběžné změny se ukládají do jednoho lokálního konceptu v existujícím formátu. Obnova vyžaduje validní obsah, platnost a shodný ročník a nesmí přepsat již rozepsanou změnu. Závislé počty osob/ubytování se normalizují stávající logikou. Ceny a kapacity zůstávají serverové.
5. **Historie určovala rok z animované polohy.** Reveal transform o 18 px měnil aktivní rok na hranici. Detekce nyní používá skutečnou polohu článku bez vizuálního transformu, se stejnou čtecí hranicí pod pevnou hlavičkou. Roky mají přístupné odkazy a jednotné `aria-current`.
6. **WebKit ignoroval externí SVG filtr bílého loga.** Použitý barevný filtr byl nahrazen lokálním CSS `brightness(0) invert(1)`, se zachováním průhlednosti. Toto je doložená dílčí barevná chyba; není vydávána za opravu neprokázaného šednutí celé stránky.
7. **Přehled odsunoval hlavní úkol pod body.** Stav registrace je před členskou kartou. Prázdný akční štítek při zavřených registracích se nevykresluje. Body, odměny a pravidla zůstávají beze změny.

## Ověření — přesná evidence, nikoli jeden celkový průchod

Prostředí: Windows, Node 24.22.1, Playwright 1.62.1, Chromium 1234, WebKit 2336, Firefox 1538. Žádné automatické retries, force klikání ani pevné sleepy. Celé nezměněné lokální sady nebyly opakovány.

| Výběr | Výsledek |
|---|---|
| Auth/API původní kopie kódu | 7 očekávaných FAIL, řízené pozdní odpovědi a nedokončený bootstrap |
| Auth/API opravené cílené Node | 20 PASS; sousední Node výběr 6 PASS |
| Stávající kontrakty členské navigace | Nejprve 16 PASS / 2 FAIL na přesném zápisu kódu před přidáním session guardu; očekávání nově výslovně vyžadují tento guard. Finálně 18 PASS. Neutrální statický název je „Účet“, původní element pro podtržení zůstal zachován. |
| Registrace/session browser | 4 PASS v každém z Chromium, WebKit a Firefox; kontrolované 500 a pozdní 200/500 po logout |
| Reálný anonymní Firebase bootstrap bez API mocků | Chromium, WebKit, Firefox PASS |
| Navigace a pořadí Přehledu | Chromium/WebKit 22 PASS; samostatný Firefox 11 PASS |
| Finální zachování vnitřního označení aktivního odkazu účtu | Chromium/WebKit 4 PASS (anonymní i přihlášený stav) |
| První navigační běh | 10 PASS / 1 FAIL kvůli testu čekajícímu na intro až po kliknutí; opravena synchronizace na skutečný viditelný dialog |
| Skrytí prázdného štítku při zavřených registracích | Nejprve 2 FAIL kvůli nesprávně očekávanému intro dialogu v tomto stavu; po opravě konkrétního setupu Chromium/WebKit 2 PASS |
| Integrační výběr veřejný web + členské průchody + skutečné izolované handlery Planneru | Chromium 30 PASS / 2 FAIL na starých názvech navigace; tyto dva scénáře po oprávněné změně očekávání 6 PASS napříč třemi enginy |
| Planner původní kód | 3 FAIL: ztráta fokusu na dvou šířkách a ztráta konceptu při reloadu |
| Planner širší cílený Chromium/WebKit | 16 PASS / 2 FAIL; následovala řízená měření geometrie, nikoli opakování pro zelenou |
| Planner finální dotčená geometrie 390/768/1920 | Chromium/WebKit 6 PASS; Firefox 3 PASS |
| Planner Firefox širší cílený výběr | 9 PASS před posledním odstraněním hover transformu; následné 3 geometrické scénáře ověřily finální CSS |
| Planner finální screenshoty 390/1920, světlý/tmavý | 4 PASS, všechny čtyři obrázky skutečně otevřeny a prohlédnuty |
| Historie původní kód | 2 očekávané FAIL |
| Historie opravené regrese | 6 PASS (2 na engine); existující oba směry scrollu další 2 PASS Chromium/WebKit |
| Vzhled, persistence tématu, modal/overlay | 15 PASS (5 na engine); screenshoty veřejného webu, historie a portálu prohlédnuty |
| Syntax změněných JS/MJS | 21 souborů PASS |
| Admin module graph, verze importů, diff check | PASS; dotčené URL jednotně `20261028-flow1` |

První spuštění Firefoxu v omezeném procesu selhalo ještě před testem při spuštění rendereru. Stejná instalace bez změny flagů se v povoleném procesu spustila za přibližně 2,7 s a výše uvedené průchody dokončila. Nejde o důkaz chyby aplikace ani o ignorované selhání scénáře.

## Skutečná registrace v produkci — výslovně schválený testovací účet

- První veřejná registrace vrátila Firebase `EMAIL_EXISTS`, bez vytvoření účtu. Read-only kontrola původního účtu doložila pouze koncept, handoff a QR; žádná auta, rezervace, platby ani soutěžní data.
- Po samostatném potvrzení uživatele byl přes Firebase konzoli odstraněn právě tento přihlašovací účet. Po cílené záloze byl odstraněn jediný odpovídající členský profil, jeho jeden koncept a QR; handoff byl odpojen. Databázová kontrola cizích klíčů: 0 chyb. Transport 0, Merch paused 1.
- První navazující průchod skončil ještě na veřejném Planneru před registrací; nevznikl účet. Další evidovaný průchod dokončil skutečný veřejný Planner → registrace → Firebase 200 → `/api/bootstrap` 200 → `/api/me` 200 → automatické přihlášení → reload. Plán měl sobotní příjezd a tři osoby; zápis konceptu i převzetí handoffu odpověděly 200. Rezervace a platby nevytvářeny.
- E-mailové ověření nebylo podmínkou načtení profilu ani Planneru. Doručení potvrzovacího e-mailu nebylo ověřeno; do samostatné následné práce patří doručování a srozumitelné ověření adresy. Odesílání provozních kampaní/transport nebylo zapnuto.
- Záloha, heslo, session a identifikátory jsou pouze v ignorované `.local-evidence/journeys-20261028/`, nikoli v tomto reportu nebo Gitu.

## Hranice důkazů a další ověření

- Skutečný iPhone/Safari ani konkrétní postižený Firefox uživatele nejsou tímto emulovány. WebKit a Firefox zde běží na Windows. Globální šednutí se nepodařilo reprodukovat; nepřisuzujeme je cache ani neprohlašujeme za opravené.
- Ověřeny byly uvedené rizikové průchody a navazující stávající regrese, nikoli každý ovládací prvek každé obrazovky v každé kombinaci. Resetovací e-mail, skutečná rezervace kapacity, upload a platba se nepoužily jako testovací operace.
- Pro kontrolu postiženého zařízení: otevřít canonical www adresu; zaznamenat motiv/OS a přesný krok šednutí; vyzkoušet login, reload, přepnutí pole Planneru a zavření dialogu. Při problému dodat pouze obrazovku/chybovou hlášku bez hesla či tokenu.
- Výsledek automatického CI, finální Pages SHA a produkční smoke jsou předávány samostatně po publikaci; lokální dílčí výsledky výše nejsou vydávány za nový kompletní běh.
