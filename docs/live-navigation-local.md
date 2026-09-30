# Admin LIVE – průchod Show & Shine (lokální předání)

Datum: 30. 9. 2026. Výchozí HEAD: `4ba6401cdc317c2046935f0a9334992333899a4a`.
Pracovní strom byl při zahájení čistý. Tato dávka zůstává necommitnutá a nenasazená.

## Prokázaná příčina odmítnutí startu

Produkční diagnostika byla pouze čtení. Ročník `united-2026` měl LIVE zapnuté, ale stav disciplíny Show & Shine byl `published`, verze 28, bez právě hodnoceného auta (aktualizace 29. 9. 2026 07:16:25). Nejlepší výfuk byl `idle`, verze 2. Coupé a Touring byly uzavřené (verze 6); Sedan a Cabrio nezahájené (verze 4). Jejich existující nepředstavená auta nebyla uzavřená. Celkem bylo evidováno 9 účastí, z toho 4 představené a uzavřené.

Start používá `POST /api/admin/events/united-2026/live/start` s disciplínou, konkrétním autem, kategorií a očekávanou verzí. V `startArrivedShowShine` po ověření oprávnění, auta, kategorie a uzavření účasti následuje ochrana `state.status === 'published'`, která vrací `judging_closed` (HTTP 409). Klient tento kód překládal jako „Porotcovské hodnocení je uzavřené“, ale připravenost tlačítka nezohledňovala zveřejněnou disciplínu.

Jde o oprávněný zákaz nového startu, nikoli prokázané zaseknutí „Spouštím…“. Klient nyní zobrazuje konkrétní důvod ještě před pokusem a start nepovolí. Serverová ochrana zůstala beze změny; nic se automaticky neotevírá. Stejná odmítající podmínka a odpověď byly reprodukovány na izolovaných datech. Původní uživatelův produkční požadavek nebyl zachycen a žádný produkční POST nebyl kvůli diagnostice proveden.

## Změny

- Přepínače disciplín pouze na úvodu soutěží. Show & Shine má oddělený přehled kategorií, volbu QR/seznam, výběr auta, potvrzení a pracovní hodnocení. Nejlepší výfuk zůstává samostatný.
- Výsledky v nabídce Více; návrat obnovuje pracovní kontext a koncept. Bez záložky Práce.
- Serverové hledání doplněno o e-mail a ID soutěžní účasti, před stránkováním. Odpověď seznamu neobsahuje e-mail a veřejné odpovědi se nemění.
- Nesprávná karoserie má neaktivní červenou akci „Jiná kategorie“. Potvrzení originálního M a serverové kontroly zůstávají.
- Sdílené `live-history.js` propojuje existující stav obou LIVE rozhraní s historií prohlížeče; neobsahuje druhý hodnoticí systém. Ukládá pouze navigační identifikátory a kontext účtu/ročníku, nikoli body, jména, dotazy nebo soubory. Polling a uploady nepřidávají historii.
- Zpět/Dopředu obnovují kontext bez opakování zápisu. Návrat ze skeneru zastaví kameru, opožděné odpovědi nemění novější výběr. Kořenový návrat nabízí Zůstat/Opustit; výslovný odchod zůstává ve Více.
- Stávající koncepty, potvrzené odpovědi, auditované opravy a fotografická fronta zůstávají. Uložení bodů neukončuje hlasování; pokračování na další auto čeká na potvrzení uzavření a načtení stavu.
- Přístupné skryté nativní souborové vstupy nepřekrývají ovládání. Responzivní pracovní mřížka zohledňuje šířku i výšku; členský dialog má vlastní rolování a menší fotografii na nízkém displeji.
- Cache token dotčených vstupů, LIVE modulů a nového sdíleného modulu: `20260930-flow2`. Nezměněné závislosti ponechány.

## Backend a bezpečnost

Pro publikaci e-mailového hledání je potřeba nasadit změnu Workeru v `worker/domains/live-arrivals.js`. Není potřeba migrace. Změna je pouze rozšíření podmínky chráněného vyhledávání; pravidla startu, oprávnění, vlastní hlasy, bodování a finanční zápisy nebyly změněny.

Příjezdy nebyly přepracovány. Produkční data, stavy kategorií, program, ceny, aktivace služeb a pozastavení Merche nebyly měněny. Bez resetu, produkčních uploadů, e-mailů, commitu, pushnutí a deploymentu. Postup Cloudflare oddělil read-only diagnostiku od izolovaného ověření.

## Cílené ověření

Úspěšně dokončeno 1 nové Node ověření a 8 nových Chromium scénářů (spouštěných cíleně, nikoli celý projekt):

1. Backend: hledání e-mailem za první stránkou, bez e-mailu ve výsledku; zveřejněná disciplína vrací `judging_closed` a nevytvoří účast ani příjezd.
2. Souvislý průchod: QR s více auty, seznam a e-mail, auto bez příjezdu, start, koncept, Výsledky a návrat, otočení, přesné potvrzené body, obě varianty uzavření, stejná otevřená kategorie a reload bez dalšího startu.
3. Viditelné blokování zveřejněné disciplíny a nesprávné kategorie bez požadavku na start.
4. Členský dialog: skutečné Back/Forward, zrušení bez zápisu, potvrzená známka a návrat z členského QR.
5. Admin: opožděné QR, Back z hodnocení na přehled a úvod, Zůstat/Opustit.
6. Simulovaná kamera: uvolnění opožděně získané stopy; ztracená odpověď startu ověřena bez druhého startu; odmítnuté uzavření nepřejde dál.
7. Dvě přílohy zachované přes Výsledky; potvrzené body zůstávají při chybě fotografie, opakuje se pouze neúspěšná příloha (1 zápis bodů, 3 pokusy pro 2 fotografie). Akce dostupné nad pevnou navigací na nízkém displeji.
8. Finální vizuální mřížka Adminu: 360/390, telefon na šířku, tablet na výšku/šířku, desktop, oba motivy, bez přetékání a bez provozních zápisů.
9. Finální členský dialog na výšku/šířku, oba motivy, viditelná fotografie a dostupné akce po posunutí, bez zápisu hlasu.

Číslování zahrnuje Node ověření i osm browser scénářů. Data jsou izolovaná v lokální SQLite, API zachycené testovacími routami, média v paměti; žádné produkční služby nepřijímaly testovací zápisy. Po počáteční opravě zastaralého fixture insertu byly scénáře úspěšné. Finální kontrola fotografie členského dialogu odhalila a opravila kolaps její výšky; dotčený vizuální scénář potom prošel.

Syntax všech 8 změněných/nových JS/MJS souborů a `git diff --check`: OK. Celé testovací sady ani CI nebyly spuštěny či sledovány.

## Prohlédnuté screenshoty

Finální snímky byly skutečně otevřeny a vizuálně posouzeny, nejen kontrolovány na přetékání. Jsou lokálními ignorovanými artefakty v `test-results/live-navigation/`:

| Rozměr | Světlý | Tmavý |
| --- | --- | --- |
| 360 × 800 | [snímek](../test-results/live-navigation/final-360-light.png) | [snímek](../test-results/live-navigation/final-360-dark.png) |
| 390 × 844 | [snímek](../test-results/live-navigation/final-390-light.png) | [snímek](../test-results/live-navigation/final-390-dark.png) |
| 844 × 390 | [snímek](../test-results/live-navigation/final-landscape-light.png) | [snímek](../test-results/live-navigation/final-landscape-dark.png) |
| 820 × 1180 | [snímek](../test-results/live-navigation/final-tablet-light.png) | [snímek](../test-results/live-navigation/final-tablet-dark.png) |
| 1180 × 820 | [snímek](../test-results/live-navigation/final-tablet-wide-light.png) | [snímek](../test-results/live-navigation/final-tablet-wide-dark.png) |
| 1440 × 1000 | [snímek](../test-results/live-navigation/final-desktop-light.png) | [snímek](../test-results/live-navigation/final-desktop-dark.png) |
| Členský dialog na výšku | [snímek](../test-results/live-navigation/final-member-portrait-light.png) | [snímek](../test-results/live-navigation/final-member-portrait-dark.png) |
| Členský dialog na šířku | [snímek](../test-results/live-navigation/final-member-landscape-light.png) | [snímek](../test-results/live-navigation/final-member-landscape-dark.png) |

Další detaily: [fotografické ovládání](../test-results/live-navigation/final-photo-controls.png), [spodní akce na šířku](../test-results/live-navigation/landscape-actions.png).

## Zbývající omezení

- Fyzický telefon, skutečná kamera, systémové oprávnění a optické čtení QR nebyly ověřeny. Prošly ruční QR a simulované mediální stopy v Chromium.
- Back/Forward byly skutečné operace historie Chromium. Nativní gesta Safari/iOS/Android, dlouhý skok v historii a zavření celé aplikace nebyly ověřeny; zachycení zavření aplikace se neslibuje.
- Neodeslané soubory se zachovávají při vnitřní navigaci, nikoli po úplném reloadu. Textové porotcovské koncepty používají existující ukládání.
- Přihlášený produkční průchod nebyl proveden. Produkční kontrola byla pouze čtení databázového stavu; původní odmítnutý síťový požadavek uživatele není k dispozici.
- Nesouvisející starší testy včetně úplného průchodu Příjezdů nebyly opakovány.
