# Jednotný členský portál — 30. 10. 2026

Výchozí a po fetchi ověřený main: `eda338f30e047378457ddb0254d44b664900965c`. Navazuje na `account-entry-journeys-20261028.md`; jeho závěrečné lokální doplnění, dva další rozpracované reporty, audit a diagnostiky nejsou součástí tohoto commitu.

## Rozsah a zachované agendy

Jeden levý rámec (236 px, mezera 24 px), společná hlavička a pravý obsahový panel. Velká fotografická hlavička se změnila na kompaktní soukromý náhled skutečného auta, přezdívku a United Member nad navigací. Název aktuální agendy a její dostupné hlavní akce jsou ve společné hlavičce panelu. Nejde o nový účetní, navigační ani formulářový systém.

| Agenda | Zachované ovládání a stavy | Nové uspořádání |
| --- | --- | --- |
| Přehled | Skutečný stav rezervace, platby/nedoplatek, uložený Planner, uzavřený proces a jeho další krok; onboarding a volitelné doplnění | První je účast, níže Garáž/pobyt a sekundární profil/Club; žádná dominantní členská statistika |
| Rezervace (`section=reservation`) | Koncept, předběžný plán, schválení, změna/storno, skutečný platební rozpis, auto, pobyt, posádka, volitelné ubytování a jeho fotografie | Stejný panel, vnitřní řádky a klidnější oddělení; URL a identifikátory nejsou přejmenované |
| Platby | Sraz/Merch, skutečné částky, QR a soukromé objednávky | Společné nízké textové záložky |
| Garáž | Přidat/editovat/hlavní auto, soukromá fotografie, jeden původní dialog a potvrzení | Přidat auto v hlavičce agendy, karty jako funkční volby |
| United Club | Všechna serverová členská data, kód, od kdy, ověřené účasti, body, featured ocenění a jejich nápovědy; Body a výhody / Moje účasti / Moje ocenění | Úplná členská karta přesunuta z Přehledu do Clubu. Členové klubu jsou sekundární akce vedle názvu, nikoli další záložka |
| Moje fotky | Rozbalení formuláře, více snímků, validace, retry, průběh, stav schválení, lightbox a soukromý reset | Nahrát fotky v hlavičce, galerie uvnitř jednoho panelu |
| Účet | Osobní údaje, QR, doručovací adresa, vzhled, uložení, odhlášení | Společný panel, formulářové skupiny a důležité vlastní podpanely zůstávají |
| Program LIVE | Stávající kontrola dostupnosti, výslovný vstup a samostatný aktivní režim, soutěže/QR/fotky a oprávnění | V menu ve skupině Moje účast, s pravdivým stavem a tlumenou neaktivní značkou; funkční samostatný režim není násilně vnořený |
| United Merch | Veřejný katalog v horním i mobilním menu, interní objednávky/historie/detail/stránkování | Interní agenda a její cíl zachovány, stejné záložky a panel |

Menu má obrysové lokální SVG a viditelné názvy, skupiny Moje účast / Moje United / Nastavení. Mobil nadále používá existující spodní navigaci a nativní menu, včetně historie, focusu a odhlášení. Nevznikl nový přepínač vzhledu ani závislost. Změny veřejných HTML a `main.js` jsou pouze nezbytné cache návaznosti sdíleného mobilního modulu.

## Ceník je informace, nikoli nové účtování

Jediný společný zdroj `member/admission-info.js`: 500 Kč do 31. 12. 2026, 600 Kč od 1. 1. 2027, 800 Kč na místě bez registrace; cena za celé auto bez ohledu na počet lidí, ubytování je samostatné a volitelné. Zobrazení je vázané **současně na ID `united-2027` a rok 2027**. Aktuální uzavřený United 2026 tento budoucí ceník nedostává. Test ověřuje obě větve.

Zdroj není importovaný do cenového výpočtu ani Workeru. Ceny, snapshoty, QR a pravidla fixace se nemění. Dokud provozovatel samostatně nezmění připravovaný/aktuální event, produkční účet 2026 záměrně ukazuje jeho skutečné údaje, nikoli ceny z ukázkového obrázku. Ceník 2027 je označený jako informační a odkazuje na skutečný rozpis konkrétní rezervace.

## Doložená příčina posunu

Headless Playwright standardně skrývá scrollbary: v tomto režimu původní čtyři agendy vodorovný posun nereprodukovaly. Proto byl původní neměnný frontend z HEAD ověřen s odstraněním jediného výchozího argumentu `--hide-scrollbars`, bez změny aplikace a bez přidávání umělých kompenzací.

Při 1440 × 1000: Přehled/Club mají skutečný scrollbar, klientskou šířku 1425, logo **122,5 px**, panel **374,5 px**. Rezervace/Platby mají šířku 1440 bez scrollbarů, logo **130 px**, panel **382 px**. Rozdíl **7,5 px** tedy způsobuje změna místa pro scrollbar, nikoli odlišný účetní stav. Nejde o hypotézu Windows/Linux.

Řešení: společný `scrollbar-gutter:stable` omezený na členskou stránku a společné šířky kontejnerů. Stejný kontrolní běh nového rámce drží klientskou šířku 1425, logo **32 px** a panel **292 px** ve všech čtyřech agendách. Běžné testy dále porovnávají vodorovné souřadnice hlavičky, shellu, panelu a názvu; načítání/chyba/retry Clubu drží panel na stejném místě. Zamýšlené svislé přechody a historie zůstávají funkční.

## Ověření a vývojové výsledky

- Nový cílený vizuální/funkční soubor nejprve dokončil **18 PASS / 3 FAIL** (7 scénářů × C/W/F). Tři FAIL byly nový test chybového stavu: jedna 503 nestačí, protože stávající klient správně opakuje bezpečné čtení. Fixture nyní drží chybu až do výslovného retry. Kontrola konzole stále dovoluje jen očekávanou 503 přesné této URL; neznámé API a ostatní chyby zůstávají chybami.
- Otevřené snímky odhalily světlé CSS fallbacky uvnitř tmavého motivu nové vrstvy; opraveno na stávající tmavé fallbacky. Následný dotčený výběr **9/9 PASS**, C3/W3/F3 (29,7 s): desktop/mobil dark a tabletová chyba/retry. Nejde o nový kompletní 21testový průchod.
- Přidané dlouhé jméno/auto a čekající rezervace: první **0/3 PASS** kvůli nesprávnému novému testovému selektoru, který v aplikaci neexistuje. Opraveno na konkrétní přístupný region „Stav registrace“, potom **3/3 PASS**, C/W/F (7,5 s), včetně následného přechodu do Garáže. Žádné obchodní očekávání nebylo upraveno.
- Celý přímo dotčený navazující Chromium výběr: **65/65 PASS**, 1,7 min (`account-entry`, `member`, `member-new-member`, `member-optional-reads`, `portal-composition`). Pokrývá skutečné dokončení izolovaných rezervací/žádostí, platby, profil a adresu, nové/vracející se přihlášení, obecné i přímé cíle, opožděný Planner, změnu účtu, soukromé čtení/upload callbacky a lightbox.
- Navazující auto/Planner/dialog/krátký viewport: **27/27 PASS**, C9/W9/F9, 57,0 s. Zachovány obě cesty přidání auta z Planneru, potvrzený jediný zápis/retry, hlavní auto, správný návrat, focus, ochrana staré akce, rozpracované hodnoty a mobilní odhlášení.
- Lokální celá Node sada byla provedena jednou kvůli přemístění společného DOM: **648 PASS / 3 FAIL / 0 skipped** z 651. Všechny tři byly staré zdrojové kontrakty: velký pozdrav v původním místě, statistiky v Přehledu a LIVE až za Účtem. Podle výslovného nového návrhu změněno umístění/pořadí, zachovány kontroly identity, všech dat, celé navigace, veřejného hlasování a oprávnění. Pouze dotčené soubory poté **12/12 PASS**. Předtím užší šestice souborů včetně nového čistého testu ceníku **67/67 PASS**; nejde o další celou Node sadu.
- První přípravné browser běhy odhalily chybně ponechaný text skrytého druhého titulku a chybu při přidání společných akcí (`$` místo `$$`); obě opraveny před publikací, konzolové chyby nebyly ignorovány. Dva omezené procesy se zasekly při uzavírání diagnostiky po FAIL a byly přerušeny; stejné cílené kontroly v povoleném procesu doběhly. Nejsou vydávány za úspěšné celé běhy.

Snímky jsou v ignorované `.local-evidence/portal-visual-20261030/screenshots/`, s názvem agendy, šířkou, motivem a enginem. Přehled/Rezervace/Platby/Club jsou zachyceny při 1440 a 390 px v obou motivech a skutečně prohlédnuté. Dále 360 × 640 se zvětšením textu, 820 × 1000 s načítáním/chybou/retry, dlouhé texty a informační 2027. API/Firebase model je izolovaný; serverové zápisové průchody využívají dosavadní skutečné izolované handlery v původních regresích. Není to tvrzení o fyzické mobilní klávesnici nebo konkrétním iPhonu.

## Publikace

Cache změněných vstupů, společného mobilního modulu, shellu, overview a nové prezentační vrstvy: `20261030-portal1`. Ostatní moduly zachovávají své verze. Backend, migrace, workflow, závislosti a provozní přepínače nejsou měněny.

Finální syntax/import/diff kontroly, přesný commit, automatické CI a Pages/source SHA a read-only produkční ověření budou po dokončení připsány lokálně bez dodatečného publikačního cyklu.

Před commitem: syntax **19 změněných JS/MJS PASS**; **7 verzovaných cílů / 11 odkazů**, každý cíl pouze `20261030-portal1`; Admin module graph PASS, diff PASS. Finální klasický scrollbar navíc ověřil stejnou výšku kompaktní identity **137,4375 px** napříč čtyřmi agendami i ve větvi bez fotografie s dostupnou akcí doplnění. Původní navazující scénář `portal-next-ux` (Club, QR, mobilní menu, vzhled a návraty) **1/1 PASS**, 4,8 s. Pro jeho starou přesnou výšku velkého pozdravu byla použita schválená kompaktní horní mez a zároveň kontrola nového skutečného názvu Přehledu; ostatní assertions zachovány.

Před nasazením read-only metadata stále potvrzují Worker `a458c9f7-ad43-4564-a516-4a65b9fec70c` na 100 %, `transport_enabled=0`, `merch_paused=1`, preview URL vypnuté. Původní produkční Pages `61f3e942-2a50-47cd-ae49-9bdb8a8943aa` pro výchozí SHA. Nejsou připravené ani potřebné změny Workeru, schématu nebo konfigurace služeb.

## Publikovaná verze — lokální doplnění po commitu

Samostatný commit **`9b66141d2e7310bce1230e9ade8fede0b61d8907`**, `feat(member): unify portal workspace and navigation`, 26 souvisejících souborů. Po přímém schválení pushnutí v chatu, čerstvém fetchi a kontrole předka byl main běžně pushnut bez force. Vzdálené refs/heads/main i origin/main potvrdily totéž SHA.

Produkční Pages **`64c13573-4573-4376-b192-62180af4f6c4`**, **SUCCESS**, source **`9b66141d2e7310bce1230e9ade8fede0b61d8907`**. HTTP obsahově ověřilo **12/12** změněných produkčních vstupů/modulů/CSS; JavaScript/CSS hashově, HTML s jedinou známou normalizací Cloudflare obfuskace e-mailu. Importy používají jednotnou verzi. Katalog má stále osm produktů, `paused=true`.

Skutečný **již publikovaný frontend**, bez podstrčených souborů, Firebase SDK a produkční API; dosavadní schválený účet nebyl mazán ani znovu zakládán:

| Engine | První přihlášení z registračního formuláře | Logout → homepage/reload → login → konečný Přehled | Přímá Garáž/reload/logout |
| --- | ---: | ---: | --- |
| Chromium | PASS, 1357 ms | PASS, 839 ms | PASS |
| WebKit | PASS, 2029 ms | PASS, 1474 ms | PASS |
| Firefox | PASS, 1418 ms | PASS, 1402 ms | PASS |

Všechny enginy 0 pageerror / 0 console error a žádná chybová HTTP odpověď; kontrola cílové sekce pokračuje i po dokončení nepovinných požadavků. Před publikací stejný kandidátní SDK/API smoke prošel také C/W/F, ale tehdy s lokálním kandidátním frontendem na www; tyto důkazy nejsou zaměňované. Zápisové obchodní scénáře zůstaly izolované. Běžný produkční login používá stávající idempotentní onboarding/claim požadavky, nikoli novou rezervaci, auto, platbu, upload nebo úpravu profilu.

Finální srovnatelné snímky přesného commitu byly po posledním zploštění prázdných stavů znovu vykreslené cíleným výběrem **4/4 Chromium PASS**, 12,9 s: čtyři agendy při 1440 a 390 px v obou motivech, následné původní akce. Snímky byly otevřené a prohlédnuté; nejde o novou kompletní browser sadu všech enginů.

Porovnání před/po potvrzuje nezměněný Worker na 100 %, bindings, cron, registry migrací a vypnuté preview URL. Provozní transport zůstává vypnutý, Merch pozastavený, **0 nových skutečných e-mailů**, žádný produkční upload ani nové obchodní záznamy. Nebyl proveden Worker deployment, migrace, změna domén nebo nastavení služeb.

Automatický [CI #147](https://github.com/sumpator/e36-united/actions/runs/41050838007), run 41050838007, job 124046184784, pokus 1, přesné publikované SHA. Node a syntax prošly; konečné browser výsledky se doplní po dokončení, žádný ruční rerun.

## Navazující oprava doložená CI #147

První automatický běh skončil FAILURE: Node **651/651 PASS**, syntax SUCCESS; Chromium **503 PASS / 4 FAIL**, WebKit **284 PASS / 4 FAIL**, Firefox **151 PASS / 0 FAIL**. Všechny sady mají 0 přeskočených scénářů. Původní výsledek se neopakuje ručním rerunem a není nahrazen dílčím lokálním úspěchem.

- Tři očekávání zůstala ve staré prezentaci: název Registrace místo schválené Rezervace, minimálně 160px fotografická hlavička a zaoblené vnitřní karty místo kompaktního titulku/jediného obrysu, a značka kompletního členského profilu v Přehledu místo Clubu. Testy nyní kontrolují skutečný nový název, celý titulek uvnitř kompaktní hlavičky a vnější obrys, a přejdou do Clubu před kontrolou stejné značky. Finanční, chybové, schvalovací a per-account kontroly zůstaly.
- Mobilní předběžný Planner odhalil skutečnou prezentační chybu. V Chromium s rezervovaným scrollbar gutterem měla pravá mezera dialogu **25 px místo 10–12 px**; původní test to lokálně reprodukoval. Existující overlay nyní používá šířku viewportu, nikoli užšího layoutu. Tolerance testu se nemění.
- Po průchodu tímto bodem zůstával při zavření dialogu pohyb návratového tlačítka **5,36 px**; CI WebKit doložil **5,390625 px**. Záznam geometrie ukázal, že starý selektor `:has(.reservation-form.is-editing)` mění po vrácení formuláře do pozadí velikost/margin titulku a grid gap. Hover navíc přidával transformaci tlačítka. Pravidla této předběžné agendy jsou nyní stejná při přesunu formuláře do dialogu i zpět a akce nemění polohu na hover. Scrollování, focus a ukládání se neupravují. Původní limit návratové polohy **≤ 1 px** zůstal zachovaný; diagnostika přikládá geometrii před/po.
- Následný širší dotčený výběr C/W/F: **14 PASS / 1 FAIL** z 15, 1,2 min. Poslední Firefox případ dokončil celý obchodní průchod, ale jeho konzole vypisuje očekávaný objekt Error bez message v textu. Pouze tento test nyní čte skutečné argumenty konzole a vyžaduje právě jednu chybu s přesným `message` a `status=400`, z přesného Planner modulu. Nejde o ignorování obecných chyb. Poté stejný kompletní scénář **3/3 PASS**, C/W/F, 23,2 s.

Po opravě mobilní předběžný průchod C/W **2/2 PASS**, 13,2 s, včetně jediného vytvořeného auta, databázově ověřeného uložení plánu, nové relace, opětovné editace a storna. Kompletní nový vizuální soubor na finálním CSS: **24/24 PASS**, C8/W8/F8, 1,0 min. Následné cílené výsledky nejsou vydávány za nový celý browser suite. Nové výsledné snímky dialogu při 360 × 520 px v obou motivech byly otevřené a prohlédnuté: akce jsou dostupné a obě mezery odpovídají. Dokončená vizuální matice ostatních agend se zbytečně neopakuje.

Navazující produkční změna jsou pouze čtyři CSS pravidla v `member/workspace.css` a jeho URL v `member.html`: **`20261030-portal2`**. JavaScript se nemění a jednotné importy zachovávají **`20261030-portal1`**. Ostatní změny jsou tři přímo dotčené browser testy a tento report. Žádná změna Workeru, schématu, migrací, závislostí, workflow, cen, oprávnění nebo provozních přepínačů. Následný nový automatický CI a Pages budou ověřeny pro přesné navazující SHA.
