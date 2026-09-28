# Příjezdy a host v Show & Shine — publikace 2026-09-29

Základ `6b51a957ea9677cb7532d268f2b333b61eb56479`. Rozsah: připravené Příjezdy, explicitní vstupné a platební deník, pozvánka/ověřené připojení hosta a oprávnění porotce; doplněn atomický start Show & Shine z potvrzeného příjezdu. Bez resetu a bez odhadování starých příjezdů či plateb.

## Dokončený průchod

- Vybrat účastníka obsahuje potvrzená fyzická auta, včetně hosta bez účtu a člena bez rezervace. QR i hledání používají stejné příjezdy; host nedostává členské QR. Hledání podporuje i ID příjezdu/SPZ, veřejná projekce nemá kontakty ani SPZ.
- Potvrzení skutečného auta a start Show & Shine tvoří jednu databázovou transakci. Kontroluje admina, příjezd, kategorii, originální M, verzi stavu a jiné aktuální auto. Odmítnutí nezanechá prázdnou soutěžní účast; opakování nevytvoří druhou.
- Výsledky, fotografie, veřejné hlasy a jediná oficiální porotcovská sada používají projekci `live_entry_vehicles`. Ověřené připojení hosta změní pouze členskou vazbu příjezdu; žádné další auto, účet ani soutěžní účast.
- Cílená kontrola odstranila zbývající volání zrušené funkce `ownEntry` v odeslání porotcovských bodů. Oprávnění se nadále kontrolují na serveru i v zapisujícím SQL.

## Ověření

- Původních úspěšných 11 serverových a 10 Chromium scénářů nebylo opakováno.
- Nové schema testy: 3/3. Nový serverový průchod: 5/5 včetně souběhu, uzavření kategorie/odvolání oprávnění mezi čtením a zápisem a propojení hosta přes skutečný jednorázový token.
- Nový Chromium průchod: 4/4 (390/1024 px, light/dark), skutečné lokální endpointy a SQLite, bez externí sítě/providerů. Snímky potvrzení auta a uložených bodů prohlédnuty. Fyzická kamera, skutečný telefon, produkční přihlášení a doručení e-mailů nejsou ověřené.
- Cache token souvisejících vstupů/importů: `20260930-arrivals2`; nezměněné závislosti mohou mít původní token.
- Izolovaná zkouška celé technické blokace prošla: staré i nové zápisy odmítnuty, obě migrace úspěšné, původní marker obnoven přesně a 30 dočasných triggerů odstraněno. Výsledná data i schéma se shodují s neblokovanou simulací; produkční export nebyl použit v aplikaci ani testech s přístupem k síti.

## Dvě explicitní migrace a ochrana přechodu

1. `2026-09-30-arrivals.sql`: nullable cenové snapshoty, prázdné Příjezdy/platební deník/pozvánky, archiv původní presence a nový odvozený pohled. Žádné nové sazby ani převod starých plateb.
2. `2026-09-30-live-arrival-entries.sql`: schválená přestavba přesně pěti soutěžních tabulek. Přidává přímou identitu příjezdu. Zachovává všechny původní sloupce/ID, indexy, triggery a FK; kopie porovná obousměrně a provede FK assertion před odstraněním pracovních kopií. Chyba vrací celý file import.

Soukromá čerstvá záloha a provozní záznamy: `../private-backups/20260929-arrivals/`. `scripts/verify-arrivals-migrations.mjs` obnoví export pouze do paměti, bez importu Workeru/sítě/e-mailu; ověří integritu, FK, celý sled migrací, původní data a indexy/triggery. První ověřený export: 333657 B, SHA-256 `1bb9181a77a4b9ba72c81873c40f3f4ca6f2e3410258cf99486f0c7bfe7b4f47`, 58 původních tabulek. Před provedením po aktivaci technické ochrany následuje další čerstvý export.

Technický cutover `db/maintenance/2026-09-30-arrivals-lock.sql` není další migrace. Rozšiřuje existující write-marker ochranu na dotčené staré tabulky a odstraní pouze technický marker `2026-09-23-live-writes-enabled`. Původní marker se uloží a obnoví přesně včetně času. Nové tabulky mají stejnou ochranu od svého vytvoření. Žádný business přepínač se nemění. Starý Worker tak během přechodu nemůže uložit starý check-in ani rezervaci bez nového snapshotu; LIVE zápisy jsou blokované již existujícími triggery a routerem.

Každý SQL soubor provést jednotlivě jako jeden atomický D1 file import. Neprovádět hromadně jiné migrace. Po obou migracích porovnat export se simulovaným očekávaným výsledkem zálohy pod blokací. Poté Worker z přesného commitu (`--keep-vars`), aktivní verze/health/anonymous denial, teprve pak push main bez force. Automatické Pages ověřit přes API a HTTP obsah assetů, nikoli CI. Technickou ochranu uvolnit po úspěšném Workeru a Pages, doběhnutí starých požadavků a opětovné kontrole dat; odstranit pouze vlastní dočasné `arrivals_cutover_*` triggery.

Předchozí Worker `9fbd0ac4-1186-4c87-9076-eb97a11de785`, deployment `7d840ab4-34f0-4c91-a19e-e92a6d836eda`; Pages `cbe753f4-3ed5-4019-9b9d-893865fe9272` (SUCCESS, základní SHA výše). Skutečná nová ID a finální porovnání se zaznamenají mimo Git. Při chybě nepokračovat a neobnovovat celou databázi přes nové zápisy. Starý Worker po nových guest účastech není bezpečná automatická obnova; ponechat ochranu a řešit konkrétní chybu.

Nové sazby zůstávají NULL, Merch pozastavený a historické testové rezervace bez snapshotu se automaticky nepřevádějí. Online reset/seed není součástí této publikace; návrh je v `arrivals-test-reset-proposal.md`.
