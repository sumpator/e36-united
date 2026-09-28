# Fotografie, Apartmán, LIVE a vzhled — příprava publikace 28. 9. 2026

Základ: `aba788f06c5775d862cffee6d1bb99b1c08fb56b`. Rozsah navazuje na `live-photo-theme-local.md`; bez hostovského hlasování, push notifikací, změn bodů či aktivace služeb. Šednutí vzhledu není prokázaně definitivně vyřešeno.

## Doplněné kontroly a pravidla

- Veřejný hlas vyžaduje aktivního člena, ne rezervaci ani přítomnost. Vlastní auto zůstává zakázané. Podmínky schválené rezervace/přítomnosti platí dosud pro prezentovaného soutěžícího. Všechny tři výběry Adminu fungují: registrované auto, jiné auto z garáže, samostatné soutěžní auto (bez založení do garáže). Nevyžadovaly změnu backendových pravidel.
- Společná foto fronta: vstup **50 MiB (52 428 800 B)**; nejvýše **80 000 000 pixelů a 16 384 px na každé straně**. Kontrola hlavičky JPG/PNG/WebP před vytvořením náhledu i dekódováním, nejvýše 512 KiB metadat. Soubor bez bezpečně čitelných rozměrů se odmítne se zprávou pro opětovné uložení do JPG. Doplňková kontrola skutečně dekódovaných rozměrů před canvasem. Poměr stran a celý snímek zachovány, orientaci nadále řeší původní prohlížečový dekodér. Výsledek JPEG, delší strana do 1800 px, kvalita .82, nejvýše **8 MiB (8 388 608 B)**. HEIC výslovně vyžaduje převod do JPG. Starší pickery mimo společnou frontu nejsou touto změnou rozšířeny a mohou dále mít 12 MiB. Timeout komprese zůstává 15 s; velmi slabé zařízení může selhat i v rámci bezpečnostních limitů.
- `tests/photo-live-release.test.mjs`: pět nových cílených kontrol (byte/rozměrové limity, hlavičky formátů, průchod >12 MiB + výstupní limit, hlasující bez rezervace, tři zdroje auta). Kontrola Adminu nejprve očekávala nesprávně HTTP 200 místo úspěšného 201; opraven pouze očekávaný status a zopakována jen tato kontrola. Původních 7 Node a 12 Chromium scénářů neopakováno. Žádný browser, server, vizuální kontrola ani CI.
- Cache token změněných frontendových modulů a návazných importů: `20260928-flow1`, včetně `member/media.js`, `photo-batch.js` a `photo-limits.js`. Původní galerie/generátor orientace nebyl nahrazen.

## D1 zkouška na skutečném schématu

Produkční export pouze čtením, soukromě mimo Git. Obnoven do izolované vzdálené D1 `e36-ux28-migration-rehearsal-20260928` (`dfe50f4a-39a3-4a98-83ab-67e73406a591`) v témže účtu; není připojena k Workeru ani Pages. Žádné R2 objekty se nekopírovaly.

Obě migrace provedeny stejnou cestou `wrangler d1 execute <name> --remote --file <migration> --yes`. Následné soukromé snapshoty porovnány pomocí `scripts/verify-photo-live-migration.mjs`: všech 56 tabulek zachováno, všechna původní data shodná; 3 nabídky, 2 alokace a 8 řádků fotografií beze změny. Všechny indexy, triggery, views a FK zachovány. `foreign_key_check` prázdný, `quick_check=ok`. Jediné změny: rozšířené dva CHECK constraints, výchozí `voting_closed=0` u 7 existujících vstupů, dvě nové migrační evidence.

Navíc záměrně chybný import v izolované D1 (CREATE + úspěšný INSERT + porušení CHECK) potvrdil návrat celé operace — ani vytvořená tabulka nezůstala. Apartmán migrace obsahuje obousměrné porovnání kopie/tabulky a FK assertion před odstraněním pracovních kopií. Jakákoli odchylka ukončí celý import.

## Bezpečné pořadí a ochrana souběžných zápisů

1. Čerstvý fetch a kontrola `main`; commit pouze této dávky. Před produkčním zásahem nová ověřená záloha D1 mimo Git a kontrola, že obě evidence ještě chybí a schéma odpovídá zkoušce.
2. Každý migrační soubor jako **jeden vzdálený D1 import**, nikdy po jednotlivých SQL požadavcích. D1 během importu databázi dočasně nepustí k běžným dotazům a při chybě ji vrátí. Kopie, drop, vytvoření, obnova a assertion jsou uvnitř jedné izolované operace; nemůže mezi nimi projít souběžný zápis. Nepoužívá se předem exportovaná záloha jako zdroj pro přestavbu, nýbrž čerstvé kopie uvnitř importu. Technické omezení trvá jen import, obchodní nastavení se nemění.
3. Nejprve `2026-09-28-live-entry-close.sql`, potom `2026-09-28-accommodation-apartment.sql`. Evidenci ověřit před každým spuštěním, už aplikovanou neopakovat. Kontrola po importu: registry, data, schéma, integrita, FK a nezměněné events/Merch config.
4. Worker ze stejného commitu přes `wrangler deploy --keep-vars`, vazbu verze na SHA zaznamenat do soukromého provozního reportu (zdejší Wrangler 4.34 nepodporuje `deploy --message`). Ověřit aktivní verzi a `/api/health`; nepřihlášené chráněné endpointy jen read-only GET.
5. Teprve poté push `main` bez force. Automatické Pages ověřit přes deployment API, nikoli Actions CI. Source SHA musí odpovídat commitu; ověřit HTTP HTML a všechny změněné verzované frontendové assety.

Přechodné verze jsou kompatibilní: starý Worker toleruje nový sloupec a rozšířené constraints, migrace nevytváří žádný Apartmán ani nově uzavřené auto. Nový Worker zachovává staré endpointy a akceptuje upload bez nového retry ID, takže starý frontend zůstává funkční při čekání na Pages.

## Výchozí nasazení a konkrétní návrat

- Worker verze `8cf78c6d-ff94-438c-8340-d528e69beb11`, deployment `c962cc8a-b31a-4e1b-af0a-25c21cf8258a`, 100 %.
- Pages `bd7ae3d0-518b-469b-935e-aaa931cbc166`, SUCCESS, SHA `aba788f06c5775d862cffee6d1bb99b1c08fb56b`.
- Při chybě SQL zastavit. Neúspěšný file import se vrátí atomicky; úspěšný předchozí sloupec se neodstraňuje. Nedělat zpětnou destruktivní migraci ani full restore přes nové zápisy.
- Při chybě Workeru nepushovat frontend. Ověřit skutečně aktivní Worker. Starou verzi lze cíleně vrátit přes `wrangler rollback 8cf78c6d-ff94-438c-8340-d528e69beb11 --message <incident>`, pouze dokud nevznikl Apartmán nebo výslovně uzavřený vstup, jejichž nové chování starý Worker nezná. Předem zkontrolovat tyto dvě podmínky read-only.
- Při problému Pages zastavit další kroky. Je-li nutná cílená obnova frontendu, Cloudflare Pages rollback endpoint pro projekt `e36-united` a deployment `bd7ae3d0-518b-469b-935e-aaa931cbc166`; nový Worker a migrace mohou bezpečně zůstat. Worker nevracet pod závislým novým frontendem. Pokud již běžely nové funkce, zachovat jejich data a stav, nepouštět automatický rollback Workeru.
- Soukromý provozní záznam mimo Git uchová skutečné nasazené ID/SHA, hash čerstvé zálohy a výsledky kontrol. Izolovanou D1 po dokončení odstranit; zálohu uchovat.

Zbývá uživatelská kontrola na telefonu: fotoaparát/galerie, více snímků a náhledy, ubytovací fotografie, potvrzení vlastního hodnocení a uzavření pro ostatní, přepínání vzhledu a návrat z uspání. Žádné produkční testovací fotografie, hlasy, nabídky, identity, rezervace ani e-maily nejsou součástí nasazovací kontroly.
