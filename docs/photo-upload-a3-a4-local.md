# Fotografie A3/A4 — lokální oprava a předání

Datum: 2026-10-11. Výchozí a stále aktuální HEAD: `32bd39722420aeedf25a7b7060059d263bd4f4b9`. Dávka je necommitnutá. Původní nesledovaný audit a `scripts/audit-20261009/` zůstaly zachované; neopakoval se celkový audit ani CI.

## 1. Doložené příčiny a zachovaná pravidla

**A3:** `uploadGallerySubmission` kontroloval COUNT před R2 PUT a pak provedl nechráněný INSERT. Dvě žádosti mohly obě rozhodnout podle počtu 23 a skončit na 25. Samotný `ON CONFLICT(id)` chránil opakování identity, nikoli kvótu různých fotografií.

Dosavadní pravidlo je **24 řádků pro member_id za klouzavých 24 hodin** podle D1 `created_at >= datetime('now','-1 day')`, včetně přesné dolní hranice. Nejde o kalendářní den; půlnoc kvótu neresetuje. Započítávají se pending, approved i rejected, bez filtru ročníku; původní dotaz neměl ani horní časovou hranici. To zůstalo zachované. Upload přes členskou galerii ukládá event_id NULL. LIVE ukládá event_id a nemá tento limit; jeho řádky se ale již dříve započítávaly do následné kontroly členské galerie. Tato asymetrie se nemění. Historické řádky ani jejich timestampy se v aplikaci/migraci nepřepočítávají.

**A4:** společný `validateImageFile` kontroloval jen deklarovaný MIME a velikost. Text `not-an-image` mohl projít jako JPEG. Merch navíc porovnával pouze několik magic bytes. Všechny dotčené uploady nyní před R2 PUT čekají na stejnou strukturální kontrolu skutečných bajtů a ukládají ověřené bajty i jejich zjištěný MIME.

## 2. A3 — atomická kvóta, identity a bezpečné dokončení

Nový úzký ledger `member_gallery_upload_attempts` je nutný pro rozlišení rezervované kapacity, potvrzení, přerušeného pokusu a úklidu po nejasné odpovědi R2/D1. Není to obecný systém úloh ani zámek v paměti Workeru.

- Jediný `INSERT ... SELECT` do ledgeru atomicky ověří uložené fotografie + aktivní rezervace slotů < 24, existující receipt, obsahový hash a nepřítomnost aktivního pokusu stejného uploadId. Rozhodnutí je SQL v sdílené databázi; nezávisí na procesu Workeru.
- Dosavadní actor-scoped `uploadIdentity` zůstává. Nový UUID identifikuje jen konkrétní pokus; jeho R2 key se při retry nikdy nepoužije znovu. SHA-256 váže identitu k bajtům fotografie, nikoli k později upravenému popisku.
- Slot má desetiminutovou lease podle databázového času. Finální INSERT fotografie znovu atomicky ověří kvótu a přesný, dosud platný pending pokus. Spolu s označením committed běží v D1 batch transakci. D1 dokumentuje rollback celého batch při selhání; [D1 Database API](https://developers.cloudflare.com/d1/worker-api/d1-database/).
- Databázový BEFORE INSERT trigger chrání tentýž limit také při zápisu starým Workerem během budoucího přechodu. Spouští se pouze pro event_id NULL; neomezuje LIVE uploady.
- Stejný potvrzený upload vrací 200, `replayed:true` a původní receipt, bez druhého PUT či spotřeby kvóty. Jiný obsah vrací 409 `upload_content_conflict`, i při souběhu a po selhání prvního pokusu. Popisek při replay nepřepisuje původní receipt. U starší fotografie bez ledgeru se při explicitním retry porovnají existující R2 bajty; nedělá se backfill ani zpětná obrazová validace. Chybějící starý objekt vrací 503, nikoli nové falešné potvrzení.
- Souběžný dosud nepotvrzený stejný upload dostane 409 `upload_in_progress`; pozdější retry vrátí potvrzení prvního. Nezakládá druhý objekt ani druhou rezervaci slotu. Potvrzená identita, jejíž fotografie byla později odstraněna, se znovu nevytváří.
- Při vyčerpání kvóty zůstává HTTP 429 a dosavadní error `Daily upload limit reached`, doplněný českou zprávou. Existující fronta ponechá úspěšné položky potvrzené a retry pošle pouze neúspěšné.

### Chyby a úklid

D1 a R2 nejsou společná transakce. Pokus nejdříve rezervuje slot, poté zapíše vlastní R2 key a nakonec potvrdí databázový receipt.

- Chyba R2 (včetně ztracené odpovědi po PUT), chyba D1 před/uvnitř commit batch a explicitní abort nejprve databázově označí **vlastní** nepotvrzený pokus failed; až pak odstraní jeho key. Failed pokus už nespotřebovává slot. Nemaže se key jiného pokusu.
- Ztracená odpověď po D1 commitu: úklid odmítne změnit committed pokus nebo key, na který odkazuje fotografie. Objekt i receipt zůstávají a retry je vrátí.
- Při tvrdém přerušení Workeru nebo nedostupnosti D1 může zůstat pending pokus a soukromý objekt bez galerie. Lease po 10 minutách přestane blokovat slot. Následující členský upload uklízí nejvýše osm failed/expired pokusů daného člena, s férovým řazením podle posledního úklidu.
- Expired pokus se před mazáním databázově oplotí stavem failed. Opožděný PUT pak nemůže potvrdit starý pokus ani přepsat key nového úspěšného pokusu. Failed keys zůstávají v ledgeru, takže případný velmi pozdní PUT lze uklidit při dalším průchodu. [R2 konzistence](https://developers.cloudflare.com/r2/reference/consistency/) a [Workers R2 API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) nenahrazují databázové oplocení ani transakci mezi oběma službami.

**Omezení úklidu:** není zaveden background job. Bez dalších uploadů může soukromý orphan z tvrdého přerušení nebo neúspěšného delete zůstat v R2; není použitelnou/public fotografií a nemá trvale rezervovanou kvótu. Metadata failed/committed pokusů se automaticky nemažou, aby bylo možné bezpečně rozpoznat retry a pozdní dokončení.

**Abort v produkčním runtime:** projektový Wrangler nepoužívá `enable_request_signal`. Cloudflare pro oznámení odpojení klienta tímto signálem vyžaduje [explicitní compatibility flag](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#enable-requestsignal-for-incoming-requests), nikoli pouze současné compatibility_date. Flag se v této dávce nepřidával. Testovaný explicitní AbortController a okamžitý úklid proto nejsou důkazem detekce každého produkčního disconnectu: bez signálu může Worker operaci dokončit (pozdější retry vrátí receipt), nebo přerušený pending pokus vyřeší lease/oplocení. Bezpečnost kvóty ani úklidu se o doručení abort události neopírá.

## 3. A4 — přesný rozsah validace

Nový `image-content.js` je omezený parser kontejnerů a markerů; **není to obrazový dekodér**. Běží na standardních Web APIs včetně TypedArray/DataView, bez Node importů, nové závislosti, placené obrazové služby nebo externího uploadového procesu.

| Formát | Co se kontroluje |
| --- | --- |
| JPEG | SOI/EOI a konec vstupu; hranice a délky segmentů; SOF a rozměry/komponenty; kvantizační a Huffman tabulky; SOS a reference na komponenty/tabulky; parametry scanů; neprázdná část entropy streamu a struktura markerů/restartů. |
| PNG | Celá signatura; všechny hranice chunků a jejich CRC; první/jediný IHDR, rozměry a základní parametry barev/bitové hloubky; paleta a pořadí IDAT; zlib header; úplný prázdný IEND a konec vstupu; odmítnutí neznámých kritických chunků. U APNG jsou navíc kontrolovány základní rozměry frame control, ne celý animační protokol. |
| WebP | Přesná RIFF délka, WEBP a hranice/padding chunků; VP8/VP8L hlavičky a rozměry, dostupnost deklarovaného prvního VP8 partition; VP8X canvas a základní animation/frame struktura včetně rozměrů a hranic ANMF. Musí existovat skutečný obrazový chunk, nestačí RIFF signatura. |

Podklady: [JPEG T.81](https://www.w3.org/Graphics/JPEG/itu-t81.pdf), [PNG specifikace](https://www.w3.org/TR/png-3/), [WebP RIFF container](https://developers.google.com/speed/webp/docs/riff_container).

**Co validace nezaručuje:** nedekóduje JPEG entropy/MCU, PNG DEFLATE scanlines/pixely/Adler ani VP8/VP8L bitstream do pixelů. Neověřuje úplnou sémantiku všech EXIF/ICC/animation metadat. Strukturálně správný soubor s poškozenými komprimovanými obrazovými daty může stále projít. Není to sanitizace/reencoding, antivir ani záruka dekódovatelnosti každým prohlížečem. Podporované MIME zůstaly JPEG, PNG a WebP; SVG, HEIC, GIF a další formáty se nepřidávají. Případy s trailing bytes, chybějícími povinnými částmi či nevyhovující strukturou se odmítají, nikoli automaticky opravují.

### Limity a typ

- Zachováno 1 B až 8 MiB na serverový soubor. Ještě před čtením se odmítne větší deklarovaná File velikost; vlastní stream reader nikdy neakumuluje více než 8 MiB a při překročení deklarovaného limitu ruší reader. Ověří se i shoda skutečné a deklarované délky.
- Rozměry musí být nenulové, nejvýše 16 384 px na stranu a 80 000 000 pixelů. Používají se existující konstanty `photo-limits.js`; server je nyní kontroluje také, místo spoléhání jen na browser. Žádná alokace podle deklarovaných pixelových rozměrů.
- Nejvýše 4096 markerů/chunků v jednom souboru, všechny smyčky posouvají pozici v omezeném vstupu. PNG CRC je tabulkový lineární průchod, bez rozbalování komprimovaných dat.
- Omezení se vztahuje na samotnou validaci jednotlivého souboru. Původní `request.formData()` a jeho parsování před validací se nepřestavovaly; nejde o nový globální limit multipart požadavku. Současný čtyřsouborový důkaz historie může držet až čtyři ověřené buffery současně. Původní Content-Length ochrany Merche/soutěžního uploadu se zachovaly.
- Deklarovaný podporovaný MIME musí odpovídat zjištěnému formátu, jinak 400. PUT, přípona a DB MIME používají ověřený typ. Neplatný obsah nevytvoří R2 PUT, použitelný DB řádek ani pokus/kvótu galerie.

## 4. Přímo dotčené cesty a zachované chování

| Cesta | Změna a ověření |
| --- | --- |
| Member → Moje fotky | A3 ledger/kvóta + A4; řízené souběhy, lost ack, chyby, abort, reálné formáty, owner-private delivery; browser queue na hranici limitu a retry jen chyby. |
| LIVE → veřejné fotografie | A4, bez nové kvóty; platný upload/replay a odmítnutí textu. LIVE může nadále vytvořit 25. řádek; následný členský upload je odmítnut. |
| LIVE → interní přílohy porotce | A4; zamítnutí běžného člena, soukromé doručení, fotografie mimo veřejnou galerii. Cílený browser ověřuje body 7/7/7/7, submitted=1, version=1, audit=0 po selhání přílohy i jejím retry. |
| Garáž upload/výměna | A4; platné JPEG/WebP, zachování staré fotografie při DB selhání, odmítnutí textu. Limity/finance se nemění. |
| Příjezdy/Admin LIVE → soutěžní auto a soutěžní fotografie | Sdílené createCompetitionCar/saveCompetitionPhoto: A4; existující oddělení od garáže, fotografie i retry a odmítnutí textu. Nezasahuje se do odbavení ani rezervací. |
| Admin → ubytování cover/doplňkové fotografie | A4; skutečné JPEG/PNG/WebP, náhrada, pořadí, stávající limit pěti fotografií, veřejné doručení a oprávnění. |
| United Club → důkazy historie | A4; skutečný JPEG ve stávajících scénářích historie a owner/Admin soukromí. Body a schvalování beze změny. |
| Admin → Merch media | A4 místo původních magic bytes; PNG upload/private před publikací a následné čtení pro katalog/archivované objednávky. Prodej ani konfigurace se neaktivují. |

Frontend, fronta, komprese, miniatury, vizuál, oprávnění a bodové/platební obchodní podmínky se neměnily. Všechny nové zápisy proběhly jen v izolované SQLite a paměťovém MEDIA. Žádné produkční uploady ani e-maily. Stávající potvrzení bodů zůstává oddělené od následného uploadu příloh.

## 5. Ověření — přesné výsledky včetně oprav testovacího prostředí

Skutečné handlery běží nad aktuálním schématem v `node:sqlite`. Nové regrese používají řízené barriers před SQL/PUT, rollback transakce, post-commit ztrátu odpovědi a ovladatelný databázový čas; dvě logické Worker žádosti sdílí databázi, ne aplikační zámek. R2 je izolovaný byte-preserving adapter s řízenými chybami, ne produkční R2.

| Běh | Výsledek |
| --- | --- |
| První nové serverové regrese | 1 PASS / 13 FAIL. Příčina: v nové izolované fixture chyběl povinný accommodation.inventory_mode. Opraveno vytvoření fixture, ne schema nebo assertions. |
| Opravené nové serverové regrese | 14/14 PASS; po rozšíření rizik 17/17 PASS. |
| První přímo dotčené existující serverové soubory | 102 PASS / 1 FAIL z 103. Merch fixture obsahovala PNG s chybným CRC; nahrazena skutečným repo PNG. Cílené zopakování pouze tohoto testu 1/1 PASS. |
| Finální cílené serverové regrese + dotčené existující soubory | **121/121 PASS**, 0 skipped. Obsahuje 18 nových A3/A4 testů včetně konfliktu jiných bytes po souběžném selhání prvního pokusu a rollbacku chyby uvnitř batch. |
| První cílený Chromium běh | 2 PASS / 1 FAIL. Komprese/EXIF a LIVE přílohy prošly. Nový gallery queue scénář dokončil všechny DB/retry assertions; poslední assertion nerozlišovala očekávanou resource chybu 429. |
| Cílené zopakování jen nového gallery queue testu | **1/1 PASS**. Vyžaduje právě jednu očekávanou konzolovou resource chybu 429 z přesného upload endpointu; ostatní konzolové chyby, page errors a neznámé API nadále musí být nulové. |
| Celá Node sada, spuštěná jednou po dokončení funkčních změn | **573/573 PASS**, 0 FAIL, 0 skipped/cancelled/todo. Log `test-results/photo-a3-a4-node.log`. |
| Syntax | **19/19 změněných/nových JS/MJS PASS**. |
| git diff --check | Finálně PASS. První kontrola zachytila CR na dvou změněných řádcích původního CRLF testu; opraveno jen ukončení těchto řádků, beze změny logiky. |

Cílený browser výběr: `photo-upload-a3-a4.spec.mjs` (nová queue) a dva existující scénáře `live-photo-flow-local.spec.mjs` — `photo queue decodes, resizes, preserves EXIF orientation and blocks concurrent send` a `LIVE camera/gallery selections append; judge attachment retry keeps confirmed criteria`. Výsledky nejsou nový kompletní Chromium/WebKit průchod. Žádný skip, zvýšení timeoutů ani automatické retries.

Nový queue scénář dokládá dvě skutečné fotografie, jednu 201 a jednu 429 na hranici 24, zachování potvrzeného ID/objektu, uvolnění slotu pouze posunem izolované historické fixture a retry se stejným ID pouze druhé položky. Po retry jsou dva committed pokusy a žádný duplicitní potvrzený řádek.

Byly skutečně otevřeny čtyři screenshoty z cíleného LIVE průchodu: `test-results/local-flow/live-photo-390-{light,dark}.png` a `ui-judge-photo-retry-{390-dark,1440-light}.png`. Viditelné potvrzené náhledy, chyba druhé přílohy a photo-only retry ovládání; bez nového přetékání v kontrolovaných viewports. Nenahrazuje to úplnou vizuální akceptaci všech cest.

Prostředí: Windows, Node 24.19.0, Playwright 1.62.1, Chromium 151.0.7922.34 (build 1234). Celé browser sady, WebKit ani CI se v této dávce nespouštěly. Fyzická kamera, mobilní uspání, Firebase produkční relace, reálné D1/R2 a skutečné síťové výpadky nejsou nově ověřené. Validní JPEG/PNG/WebP jsou skutečné repo assety, nikoli text vydávaný za obrázek; rozličné JPEG payloady mají legální COM marker, nikoli uměle neplatné obrazové bajty.

## 6. Migrace a budoucí publikace

Připravena pouze lokální aditivní `db/migrations/2026-10-11-photo-upload-attempts.sql`, promítnutá do `db/schema.sql`: jedna nová tabulka, její identity/pending indexy, index uploadového okna na galerii, quota trigger a jeden záznam schema_migrations. Žádná přestavba, odhadovaný převod, backfill, mazání či změna existujících řádků.

Ověření obnovilo naplněné **předchozí schéma** a aplikovalo přesný SQL soubor v transakci. Obsah všech původních business tabulek se před/po porovnal včetně ID, bodů, hlasů, fotografických a finančních vazeb. Zachované původní indexy/triggery; foreign_key_check prázdné a integrity_check = ok. Existujících 25 fotografií stejného člena zůstalo beze změny; nový další členský zápis trigger odmítl. Nová tabulka po migraci prázdná. Nešlo o zálohu ani kontrolu produkční D1.

Budoucí pořadí po samostatném souhlasu:

1. Čerstvá ověřená záloha D1 a kontrola skutečného schema/registru; zkouška této jediné migrace na izolované kopii produkční zálohy, nikoli obecný hromadný migration run.
2. Pokud je požadována souvislá A4 ochrana při přechodu, technicky blokovat dotčené uploadové zápisy a nechat doběhnout staré požadavky. Konkrétní produkční blokace/drain ještě nebyly ověřené ani provedené. Business přepínače LIVE/registrací/Merche se kvůli tomu nemění.
3. Migrace právě jednou → ověření registry/indexů/triggeru/FK/integrity a zachování dat → odpovídající Worker. Nový Worker vyžaduje ledger; nesmí se nasadit před migrací.
4. Read-only health/role/metadata kontrola a schválený cílený upload smoke na izolovaném prostředí; potom odstranit případnou technickou blokaci. Starý frontend zůstává kompatibilní s receipt/429 smlouvou. Frontendové soubory ani cache URL se neměnily; samostatná Pages změna pro funkčnost této dávky není potřeba.

Trigger chrání limit starého Workeru, ale ten na triggerové odmítnutí může vrátit 500 a ještě nemá A4 validaci. To není důvod aktivovat službu nebo deklarovat bezchybný smíšený provoz. Při problému neobnovovat celou starou databázi přes nové zápisy; případný návrat Workeru řešit s technicky zajištěnými uploady a zachováním dat.

## 7. Změněné soubory a stav

- Worker: `worker/domains/{media.js,image-content.js,member-gallery.js,member-gallery-uploads.js,live.js,garage.js,accommodation.js}`, `worker/domains/club/history.js`, `worker/domains/merch/index.js`.
- DB: `db/schema.sql`, `db/migrations/2026-10-11-photo-upload-attempts.sql`.
- Testy: `tests/photo-upload-a3-a4.test.mjs`, `tests/helpers/image-fixtures.mjs`, `tests/e2e/photo-upload-a3-a4.spec.mjs`; skutečné obrazové fixtures pouze v `tests/{live-photo-flow-local,live-next-rules,united-live-cars,garage-photo-ux,united-club-server,event-accommodation-phase1,merch-commerce}.test.mjs`. Lost-ack Member regrese přesunula řízenou ztrátu odpovědi až za batch COMMIT; jinak by test správně simuloval rollback místo potvrzeného zápisu. Kontroly receipt/objektu/identity zůstaly.
- Tento report `docs/photo-upload-a3-a4-local.md`.

Sledované soubory mají pouze tuto dávku (15 modified), sedm jejích nových souborů zůstává nesledovaných. Mimo dávku stále nesledované `docs/project-audit-2026-10-09.md` a `scripts/audit-20261009/`. Diagnostické výstupy testů jsou ignorované v `test-results/`. Nic nebylo staged, commitnuto, pushnuto ani nasazeno. Produkce se nečetla/nepsala, služby se nepřepínaly, sazby/platby/ročník/role beze změny a Merch se neaktivoval.
