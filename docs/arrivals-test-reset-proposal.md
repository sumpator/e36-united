# Návrh budoucího resetu testovacích dat — NEPROVEDENO

Tento dokument není spustitelná migrace ani souhlas s resetem. Vybraný ročník, manifest přesných ID a rozsah závislostí musí být schváleny při nasazení. Žádný reset ani produkční seed nyní neproběhl.

## Hranice

Resetovat pouze provozní testovací data vybraného `event_id`. Nové označené scénáře mít pod jednoznačným `suiteId`, stabilními ID a seznamem vytvořených vazeb. Nepoužívat fuzzy hledání podle jména či podobného e-mailu. Existující účty, garáž, členské QR identity, obsah webu, program, ročníky, ceny a aktivace LIVE/registrací/Merche zachovat.

## Příprava před schválenou realizací

1. Čerstvý export D1 mimo Git; obnova do izolované lokální DB, kontrola integrity, FK a počtů. Zaznamenat aktivní Worker/Pages verze.
2. Read-only manifest všech dotčených ID, počtů, FK, finančních agregátů a hashů konfiguračních záznamů. Rozlišit staré testovací operace ročníku od nové označené sady.
3. Zajistit technickou blokaci všech dotčených zápisů (příjezdy, rezervace, platby, soutěž a připojení pozvánek), včetně běžících požadavků. Samotný přepínač LIVE nestačí a nesmí se k tomu měnit. Připravená dávka neobsahuje univerzální produkční resetový zámek: bezpečný mechanismus je podmínkou budoucí realizace, nikoliv důvodem nyní upravovat business nastavení.
4. Odesílání pro fixture musí být tvrdě vypnuté; samotná adresa `.invalid` nestačí jako bezpečnostní mechanismus. Přehled odeslaných/nejistých outbox položek archivovat. Nevytvářet reálné pozvánky při seedování.

## Záznamy a vazby k odstranění v řízené transakci

- `arrival_invitations` vybraných příjezdů, jejich tokeny a spotřeby; pouze jejich `email_outbox` položky/payloady po odstranění odkazu. Nedotýkat se jiného mailingu.
- `event_payments` vybraných testovacích rezervací/příjezdů včetně storen. Deník má ochranu proti mazání; budoucí schválený reset musí v témže řízeném postupu dočasně odstranit a přesně obnovit ochranný trigger. Nelze provádět běžným editačním API. Storna odstranit před původními položkami.
- `event_arrivals` a staré `legacy_event_member_presence` pouze vybraného ročníku a schváleného manifestu.
- Testovací `reservations` a související `reservation_accommodation`, `reservation_requests`, `reservation_member_comments`. Žádné převody check-inů ani odhady rozdělení starých agregovaných plateb.
- Vazby na tyto rezervace v `public_planner_handoffs`, `email_outbox` a `mail_campaign_recipients`: předem vypsat; FK může odkaz nulovat. Historické mailingové příjemce nekaskádově nemazat; cílené odstranění testového handoffu/outboxu vyžaduje zahrnutí do manifestu.
- Odstranění událostního auta vyžaduje vyřešit `live_entries`, `live_competition_state.current_entry_id`, `live_public_votes`, `live_judge_scores`, `live_judge_photos`, audit hodnocení a databázové odkazy na `live_car_photos`. **Toto je další závislost vyžadující výslovné schválení**: buď se soutěžní záznamy zachovají a auto se nemaže, nebo se přesně vyjmenují testové soutěžní záznamy k resetu. R2 soubory automaticky nemazat.
- Potvrzení idempotentních operací a příslušné auditní řádky se musí vypsat a archivovat. Staré potvrzení nesmí později vrátit smazanou operaci jako platnou; nový seed používá novou generaci operačních klíčů. Audit se bez zvláštního schválení nemaže.
- Historické `_live_v2_backup_*` tabulky nejsou živé příjezdy; zachovat je a uvést případné kopie testových záznamů. Bodové ledger/claim záznamy zachovat; pokud manifest odhalí odvozené body závislé na rušené účasti, vyžádat jejich samostatné rozhodnutí, nikoliv je potichu mazat nebo přepočítávat.

## Opětovné založení

Použít pevný manifest sedmi scénářů z `arrivals-local.md`, existující schválené testovací účty a auta (žádné přepisování uživatelské garáže). Host zůstává bez účtu. Pokud potřebné testovací účty/QR neexistují, jejich vytvoření je další samostatně schvalovaná závislost; produkční účty se nevytvářejí skrytě.

Nové rezervace založit novým cenovým mechanismem a uložit snapshot podle schválených sazeb ročníku. Zaznamenat jednotlivé bankovní/peněžní testové položky do nového deníku a ověřit agregáty; nikdy neodhadovat staré rozdělení. Produkční konfiguraci nepřepsat sazbami 300/500 z lokální fixture. Scénář FREE vytvořit auditovanou operací se zřetelným testovým důvodem, bez odpuštění služeb.

Seed musí odmítnout cizí existující ID, být idempotentní v rámci stejné generace a nevytvářet další rezervace, peníze ani pozvánky při opakování. Nová generace po resetu má nové idempotentní klíče, ale stabilní suite manifest.

## Ověření a návrat do provozu

Read-only porovnat manifest, nulové staré testové operace, přesné počty nové sady, cizí klíče, finance a nezměněné účty/garáž/QR/obsah/config. Zvýšit existující příslušné revize a vynutit načtení aktuálního stavu klientů. Až pak odstranit technickou blokaci. Při chybě nepřepisovat celou produkční DB přes nové zápisy; zastavit a připravit cílenou obnovu podle manifestu.
