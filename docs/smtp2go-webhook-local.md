# SMTP2GO webhook — cílené dokončení 26. 10. 2026

Výchozí commit: 240864eabe1fd28ec19f6f8de46e55d1b374838f. Navazuje na docs/merch-launch-readiness-local.md. Nejde o nový audit ani další doručovací zkoušku.

## Skutečná konfigurace poskytovatele

V autorizované konzoli existujícího účtu postmaster@e36united.cz nalezen právě jeden aktivní webhook pro https://api.e36united.cz/api/mailing/smtp2go-webhook. JSON, Bearer, All users selected; explicitně ověřeny oba nynější klíče „E36 United Mailing Worker“ a „E36 United — Transactional“. Automatické odhlašovací patičky ani oprávnění klíčů se neměnily.

Jediná provedená změna: do **Email headers** přidáno **X-E36-Transaction-Id**. Zůstaly X-E36-Campaign-Id, X-E36-Recipient-Id, X-E36-Mail-Type. UI potvrdilo Successfully updated webhook; nastavení bylo opět otevřeno a ověřeno, včetně shodné autorizace před/po (jen porovnání v paměti). Žádný duplicitní webhook, žádné Test this webhook, Retry All ani Remove All. V seznamu nebyly neúspěšné notifikace; to není důkaz úspěšného obchodního callbacku.

Zachováno všech osm UI skupin: Email processed → processed; Bounced → bounce (hard/soft); Rejected → reject; Marked as spam → spam; Delivered to recipient → delivered; Unsubscribed/Resubscribed → unsubscribe/resubscribe; Opened by recipient → open; Link clicked by recipient → click. Výběr All users zahrnuje oba klíče; žádný klíč nebyl vytvářen či rozšiřován.

## Ověřená smlouva

SMTP2GO posílá POST application/json na stávající endpoint. Event používá event, id (deduplikace notifikace), email_id (provider message ID), rcpt (konkrétní příjemce), time (UTC), bounce=hard/soft; click obsahuje URL. Batch API vrací email_id ve stejném pořadí jako odeslané zprávy. Sender a Reply-To zůstávají info@e36united.cz.

HTTP Authorization: Bearer slouží k ověření callbacku. **Email headers** jsou hlavičky původní zprávy vrácené v události, nikoli náhrada HTTP autorizace. Adaptér provozních zpráv posílá X-E36-Mail-Type=transactional a X-E36-Transaction-Id; kampaně campaign/campaign-ID/recipient-ID. Handler podporuje přímo vrácené hlavičky i headers objekt, u provozních zpráv porovnává email_id + normalizovaného příjemce nebo bezpečný outbox-ID před uložením send odpovědi. Bez hlaviček je nutná přesná uložená provider vazba, ne samotná adresa. X-E36-Mail-Type=test nevytváří obchodní historii.

Odpovědi handleru: 200 po evidenci či bezpečném ignored/duplicitě, 401 bez správného Bearer, 503 bez konfigurace nebo při selhání úložiště, 400 při neplatném formátu. Obsah ani secret se nevracejí v odpovědi. Poskytovatel uvádí timeout 10 s a opakování selhávajících notifikací nejvýše 35krát v horizontu 48 hodin; kontrola/retry patří do Failed Notifications. Neopakovat ručně nejasné obchodní odeslání jako řešení webhooku.

Zdroje: [nastavení webhooku](https://developers.smtp2go.com/reference/add-webhook), [payload a retry](https://developers.smtp2go.com/docs/webhooks-overview), [konzole a předávání hlaviček](https://support.smtp2go.com/hc/en-gb/articles/223087967-Webhooks), [batch korelace](https://developers.smtp2go.com/reference/send-email-batch). Přijetí providerem není doručení a doručení není přečtení.

## Prokázaná úzká aplikační chyba a oprava

Handler a payload smlouvu splňují. Ve vstupním worker/index.js však obecný fast-drain po úspěšném POST zahrnoval také webhook. Řízená regrese přes skutečný Worker a izolovanou D1 ukázala: transport OFF naplánoval drain (nic neodeslal); při ON callback o doručení jedné zprávy odeslal jinou čekající zprávu. Žádný skutečný provider nebyl kontaktován; odesílací fetch byl zachycený lokálně.

Oprava přidává do stávající podmínky jedinou výjimku pro přesnou webhook cestu. Callback pouze eviduje stav, nespouští drain. Cron ani dosavadní business drain, klíče, oprávnění, šablony, databáze, migrace a frontend se nemění. Žádné cache URL nejsou potřeba.

Dvě nové regrese v tests/transactional-emails.test.mjs ověřují doručení při transportu ON/OFF, nulové síťové volání, nulový waitUntil drain a zachování jiné queued zprávy s attempts=0. Původní default-off test nyní požaduje právě jeden explicitní cron drain namísto starého očekávání drainu také z callbacku; kontrola sítě zůstala nulová.

## Přesné výsledky a hranice důkazů

- Před opravou: nové dvě regrese 0 PASS / 2 FAIL, včetně jednoho skutečně zachyceného lokálního send požadavku při ON.
- Po opravě: čtyři relevantní soubory (transactional-emails, mailing-tracking, merch-email-operations, mailing-purpose) 63 PASS / 2 FAIL. Obě chyby byly pouze porovnáním prototypu SQLite řádku v nové regresi (hodnoty byly správné). Opravena reprezentace pro assert, nikoli chování či očekávané hodnoty.
- Po této korekci: nové dvě regrese + default-off 3/3 PASS. Závěrečný celý dotčený transactional-emails.test.mjs **26/26 PASS, 0 skipped**. Předchozích 39 nezměněných souvisejících kontrol zůstává platných; nejde o nový celý běh 65/65.
- Existující kontroly doložily autentizaci, korelaci příjemce, callback před API odpovědí, duplicity, chronologii, terminální selhání, oddělení kampaní/provozních/test zpráv a pokračující cron. Celé Node/browser sady se lokálně neopakovaly.
- Read-only produkce: Worker ce8c79a4-e991-4fc1-9f66-0a424cb3d5de, health 200, webhook bez autorizace i s nesprávnou 401. Transport enabled=0, activated_at=NULL, revision=0, Merch paused=1, 8 produktů / 0 objednávek. Tři očekávané secrets existují; preview URL jsou vypnuté. Vypršené Cloudflare přihlášení bylo obnoveno read-only Wrangler deployments list, bez změny služby.
- Syntax dotčených JS/MJS a git diff --check jsou podmínkou publikace. Automatický CI a nové Worker/Pages metadata budou v konečném předání a ignorovaném publication-result.json. Plný callback skutečné obchodní zprávy se ověří až při první legitimní události po zvlášť schváleném ostrém spuštění.

Důkazy jsou v ignorované .local-evidence/smtp2go-webhook-20261026/, mimo automaticky čištěné test-results. Žádné produkční business callbacky, objednávky, platby, e-maily, uploady ani migrace. Kampaňová patička, bankovní údaje, ceny, LIVE a registrace jsou mimo tuto dávku. Nesouvisející A3/A4, audit a diagnostiky zůstávají zachované mimo commit.

## Bezpečnostní incident při čtení konzole

Při první diagnostice formuláře byl nedopatřením vypsán webhookový secret v nástrojovém výstupu této konverzace. Hodnota není v tomto reportu ani Gitu, nebyla znovu vypisována a další výstupy pole redigují. Provozovatel byl informován. Secret byl podle zadání zachován beze změny; doporučená náprava před ostrou aktivací je samostatně koordinovaná rotace v existujícím webhooku a Worker secretu, nikoli vypnutí ochrany. Tato rotace nebyla provedena ani vydávána za hotovou.

## Zbývající podmínky spuštění

Konfigurace webhooku je nyní dokončená; skutečná obchodní callback korelace dosud neověřená. Před ostrou aktivací zbývají skutečné obchodní a platební údaje a závazné dodací podmínky/dokumenty, samostatná kampaňová patička z předchozího reportu a výše popsaná koordinovaná rotace webhookového secretu. Pracovní údaje nenahrazují skutečnou konfiguraci. Transport i Merch zůstávají vypnuté a dřívější čtyři testovací zprávy se neopakovaly.
