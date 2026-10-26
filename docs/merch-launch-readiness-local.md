# Merch a provozní e-maily — dokončení 26. 10. 2026

Navazuje na `docs/merch-email-operations-local.md`. Tato část nahrazuje jeho starší provozní návrhy; historická doručovací zkouška zůstává uzavřená (4/4). Nové skutečné zprávy: **0**. Publikace technických změn je schválená; ostré spuštění nikoli.

## Dokončená technická dávka

- Dokončení objednávky vytváří jeden existující atomický outbox intent `merch_completed`. Stav ready je podle doručení „Připraveno k odeslání“ / „Připraveno k převzetí“; dokončení zachovává tracking. Admin obnoví kartu i detail přes existující generation guard.
- Projekce webhooku vychází z uložené chronologie událostí, zachovává koncová selhání a je idempotentní i při pozdních/duplicitních callbackách.
- Existující SMTP2GO adaptér vybírá klíč podle účelu. Kampaně: původní `SMTP2GO_API_KEY`. Provozní zprávy, starší Merch cesta i pozvánky: výhradně `SMTP2GO_TRANSACTIONAL_API_KEY`. Chybějící nový klíč ponechá frontu bez odeslání; neplatný klíč nikdy nezkouší klíč kampaní. Worker fast-drain používá stejnou podmínku. Beze změny účtu, senderu a Reply-To (info@e36united.cz).
- Textová varianta kampaně dříve při odstranění HTML ztratila odhlašovací URL. Nyní zachovává stávající `%%UNSUBSCRIBE%%` vedle českého popisku. HTML odkaz i filtrace souhlasu zůstávají. Nejde o nový odhlašovací systém.
- UI neslibuje aktivní nákupní slevu: při 0 % ji označí neaktivní, při NULL odkazuje na skutečné podmínky. Počítání bodů, milníky každých 12 bodů a žádná evidence spotřeby odměn se nemění.
- Jednotné potřebné cache URL `20261026-merch-mail1`, včetně Club/points-guide a nezbytných rodičů. Žádná migrace, změna závislostí, workflow ani katalogu.

## Nový klíč a produkční hranice

Nový klíč je lokálně dostupný, odlišný od kampaní a ignorovaný Gitem. Čtecí kontrola 21:11:23 UTC přes skutečný adaptér: `/domain/view` a `/stats/email_cycle` 200, odesílací i sledovací doména ověřená, použito 4 / zbývá 996. Samostatné čtení oprávnění potvrzuje přesně `/email/batch`, `/domain/view`, `/stats/email_cycle`. **Žádné volání send endpointu.** Allowed, vypnutý Unsubscribe Footer a žádné auditní BCC potvrdil provozovatel v konzoli; nejde o nezávislé čtení těchto tří nastavení.

Před publikací nového Workeru se přidá pouze nový secret stejného jména z ignorovaného `.dev.vars`, bez výpisu nebo předání v argumentech příkazu. Původní klíč kampaní, webhook secret i jejich provider nastavení se zachovají. Finální ID nasazení, CI a skutečný výsledek jsou v závěrečném předání a ignorovaném publikačním důkazu; tento report sám netvrdí budoucí úspěch.

Výchozí Worker `0f1d9f3a-294e-409b-8833-de2876266613`; Pages `44105b59-b38a-475b-8de0-f1b062afed05`, SHA `65753df944d435e49d666ab46a2ed7274a7bb60c`. Nový Worker je kompatibilní se současným schématem i frontendem a nasazuje se před pushem závislého frontendu. Již aplikované migrace se neopakují.

## Pracovní konfigurace není ostrá konfigurace

Provozovatel schválil 0% nákupní slevu a neveřejný návrh podmínek. Fiktivní identita, pracovní adresa/telefon a návrh 99 Kč / 10 pracovních dnů jsou pouze v ignorovaných `private-working-config.json` a `private-{terms,shipping,returns,privacy}.txt`. Návrhy používají současný generátor dokumentů a **skutečně existující testovací účet aktuálního ročníku**, beze změny jeho účtu/IBAN. Validace není oslabena. Dokumenty nesou výstrahu neveřejného návrhu, legalApproved=false a obchod paused=true.

Nic z toho nebylo zapsáno do produkční business konfigurace: tam zůstává discountBasisPoints=NULL, shippingMinor=12900, 72 h, testovací platby všech ročníků a chybějící skutečné identifikační/bankovní/dodací údaje. Schválené rozhodnutí 0 % je připravené pro pozdější uložení společně se skutečnými údaji, není nahrazené fiktivní provozní konfigurací.

## Webhook a patička kampaní — stav před navazujícím dokončením

Produkční `POST https://api.e36united.cz/api/mailing/smtp2go-webhook` bez autorizace i s nesprávným Bearer vrací 401 `webhook_unauthorized`. Ochrana nebyla změněna. Nový klíč nemá správu webhooku; dostupná automatizovaná konzole je odhlášená. Proto **nebyla ověřena ani změněna skutečná provider konfigurace a celý produkční callback průchod**. Nevytvářely se falešné callbacky/business události.

Ruční postup v existujícím účtu postmaster@e36united.cz, Settings → Webhooks → existující webhook (nevytvářet druhý):

1. Endpoint výše, enabled, output JSON, existující Authorization Bearer shodný s `SMTP2GO_WEBHOOK_SECRET` ponechat. Hodnotu nikam nekopírovat ani nezveřejňovat.
2. Users: původní klíč kampaní **i nový transakční klíč**. Události processed, delivered, bounce, spam, reject; kampaně zachovají open, click, unsubscribe.
3. Email headers: X-E36-Mail-Type, X-E36-Transaction-Id, X-E36-Campaign-Id, X-E36-Recipient-Id. Zachovat provider email_id, ID/čas události. Nezaměnit s custom HTTP hlavičkami webhooku; neklikat Test jako náhradu doručené obchodní zprávy.
4. Skutečnou korelaci ověřit až na první samostatně povolené legitimní události. Accepted není delivered.

Původní klíč kampaní i jeho nastavení se podle posledního pokynu **nemění**. Jeho automatická anglická/dvojí patička proto není vydávána za vyřešenou. Pozdější úzké řešení v konzoli po schválení: ponechat Unsubscribe Footer zapnutý kvůli náhradě tokenu, odstranit pouze automaticky připojované HTML/text pole (vlastní český odkaz již existuje), ověřit českou odhlašovací stránku. U transakčního klíče je footer vypnutý dle potvrzení obsluhy. [SMTP2GO footer](https://support.smtp2go.com/hc/en-gb/articles/223087607-Unsubscribe-Footer), [webhook](https://developers.smtp2go.com/reference/add-webhook).

## Přesné lokální výsledky

- Původní připravená dávka: Node 616/616, cílený Merch Chromium 7/7 a WebKit 7/7. Starší jednotlivé chyby a opravy jsou v navazujícím reportu; nejde o celý browser projekt.
- Nové oddělení klíčů: první cílený běh 100 PASS / 1 FAIL (zapomenutá stará podmínka Worker fast-drain); opravena stejná závislost, následně přímo dotčených 30/30 PASS.
- První širší Node po oddělení: 622/622 PASS. Poté nová regrese prokázala ztracený plaintext odhlašovací token: 5 PASS / 1 FAIL před opravou; související mailing výběr po opravě 70/70 PASS.
- Nové browser scénáře neaktivní slevy 1440/390, sazba 0 i NULL, oba motivy: **Chromium 4/4, WebKit 4/4 PASS**, bez retries. Snímky skutečně otevřeny: benefity i Club jsou čitelné bez přetékání. Jde o izolovaná data a skutečné Merch handlery.
- Protože se po prvním širším běhu změnil společný převod kampaní do textu, závěrečný odpovídající Node běh: **622/622 PASS, 0 FAIL, 0 skipped**. Browser projekty nebyly plošně opakovány. Windows Node24.19.0 / Playwright1.62.1; konečný Linux výsledek doplní jediný automatický CI.
- Statické syntax/import/cache/diff kontroly jsou publikační podmínkou; jejich výsledek se eviduje v ignorovaném `static-checks.json`.

Důkazy jsou v ignorované `.local-evidence/merch-launch-20261026/`, mimo automaticky čištěné test-results. Žádný secret, obsah `.dev.vars` ani privátní pracovní konfigurace do commitu nepatří.

## Jednorázová budoucí aktivace

1. Doplnit **skutečného** provozovatele (IČO, PSČ, telefon, daňový status), skutečný účet/IBAN/příjemce, závazné doručení/dopravné/převzetí/vratkovou adresu, čtyři úplné dokumenty a jejich schválenou verzi. Uložit schválených 0 % přes existující Admin, nepřebírat pracovní identitu ani testovací banku. Ověřit osm zachovaných produktů a jejich ceny.
2. Potvrdit nový produkční secret a domény, webhook users/události/korelaci, zbývající kampaňovou patičku; úspěšné CI. Neaktivovat kvůli pouhému existujícímu `.dev.vars`.
3. V Admin mailingu přečíst stav front a control revision/activated_at. Skipped před první aktivací nepřesouvat plošně do queued; žádné historické resend. Sending/uncertain nejprve ověřit podle uložených provider IDs/Activity, ne slepým opakováním. Zastaralé události neposílat.
4. Po samostatném schválení zapnout existující transakční control; první aktivace zaznamená activated_at a staré vynechané zprávy zůstanou vynechané. Poté odpozastavit Merch přes existující nastavení. Registrace/LIVE/ročníky neměnit. Žádné fiktivní veřejné objednávky.
5. První skutečnou objednávku a legitimní úhradu porovnat se snapshotem, outbox ID, přijetím providerem a doručenou callback událostí. Při nejasnosti ponechat objednávku/platbu uloženou a vyšetřit konkrétní pokus.
6. Při problému pozastavit nové objednávky a existující transakční control; nemaže se objednávka, úhrada, audit ani fronta. Neobnovovat celou DB přes novější zápisy.

**Verdikt: technické změny lze publikovat s vypnutými službami; ostré spuštění není připravené.** Zůstávají reálné obchodní údaje/podmínky, provider webhook a kampaňová patička. Fyzický telefon, nová transakční identita ve skutečně doručené zprávě a celý skutečný produkční nákup nejsou nyní ověřené a žádné další odeslání není schválené.

## Navazující dokončení webhooku

Aktuální ověřená konfigurace, úzká oprava Worker fast-drain, cílené výsledky a zbývající omezení jsou v [docs/smtp2go-webhook-local.md](smtp2go-webhook-local.md). Konzole již byla autorizovaná; do existujícího webhooku bylo přidáno X-E36-Transaction-Id a ostatní nastavení ověřeno. Starší výše uvedená nedostupnost konzole není aktuální. Skutečný callback provozní zprávy ještě ověřený není. Transport a Merch zůstávají vypnuté.
