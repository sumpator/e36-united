# Dokončení členských úloh a navigační návaznosti — 28. 10. 2026

Tato poddávka navazuje na `member-actions-20261028.md` a `public-member-followup-20261028.md`. Nemění aplikaci ani backend. Doplňuje tři chybějící dokončovací browser průchody v `tests/e2e/member-task-flows.spec.mjs` a jednu položku stávajícího kritického výběru WebKit/Firefox. Starší zelené průchody auta a Planneru se neopakovaly.

## Skutečné vstupní záměry

Inventář je čtení skutečných producentů a konzumentů URL, nikoli tvrzení, že všechny níže uvedené odkazy byly touto poddávkou nově proklikány. Změnu pravidel vstupu do účtu řeší hlavní dávka.

| Zdroj / URL | Záměr, který je nutné zachovat | Konkrétní kód |
|---|---|---|
| Obecný veřejný vstup do účtu | Přihlášení/registrace; obecná návratová adresa původní stránky není obchodní úloha | `public-member-state.js`, veřejné `account-entry` / `public` testy |
| `mode=login` / `mode=register` | Volba autentizačního formuláře, bez automatického opakování akce | `member/shell.js`, `member.js` |
| `section=reservation&draft=…&returnTo=/index.html#planer` | Převzít konkrétní Planner a otevřít registraci; neodeslat rezervaci | `main.js` `continueToMember`, `member/modules/planner/index.js`; stávající `auth-memory-session` a `registration-live-continuity` |
| Starší Planner `returnTo=/index.html#planner` s `draft` | Zachovat koncept a přepnutí login/register; nejde o obecný účetní vstup | `registration-live-continuity.spec.mjs` `account modes preserve Planner return` |
| `section=photos` z veřejné Galerie | Oprávněný členský upload; samotný vstup nic nenahrává | `gallery.js` `renderAuthBox`, `member/modules/photos.js` |
| `section=club` a starší `section=history/rewards` | Klub; starší dvě hodnoty jsou aliasy Clubu | `merch.html`, `member/points-guide.js`, `member/deep-links.js` |
| Starší `panel=…` | Alias parametru sekce i při návratu historií prohlížeče | `member/deep-links.js`, `member/shell.js` |
| `section=merch&order=…` | Otevřít existující vlastní objednávku, nikoli vytvořit novou | `member/modules/merch.js` `summary` / obsluha `member:sectionchange` |
| `section=payments&payment=merch` | Stávající oddělená platební záložka Merche | `member/modules/merch.js` `syncPaymentTab` |
| `?profile=EU-…` na Galerii nebo v Clubu | Klubový profil a jeho historie Zpět/Dopředu | `member/club-profile.js` `openProfile` / `restoreFromUrl`; `member-club-profiles.spec.mjs` |
| `#arrival-invite=…` | Soukromé jednorázové propojení účasti, až po autentizaci a výslovném potvrzení | `member/arrival-invite.js`; producent `worker/domains/mailing/transactional.js` |
| Transakční odkazy s `section=reservation/payments/merch` | Konkrétní stávající členská úloha | `worker/domains/mailing/transactional-template.js` `portalLink` |

Starší testy veřejné navigace očekávají obecné `returnTo=/` či `/#experience`; to je dosavadní chování běžného vstupu, nikoli důkaz, že má přebít nové schválené otevření Přehledu. Naopak strukturovaný Planner s `draft`, soukromý fragment příjezdu, konkrétní sekce/objednávka/profil jsou skutečné úlohy. Osobní tokeny nejsou v tomto reportu.

## Nově dokončené průchody

| Úloha | UI a skutečný výsledek | Ověření zápisu |
|---|---|---|
| Profil | Předvyplnění → změna jména/přezdívky/telefonu → řízené 503 → zachované hodnoty a pravdivá chyba → ruční opakování → potvrzení → aktualizovaný souhrn → reload | Skutečný `getMember` a `bootstrapMember`, kontrola řádku `members`; dva pokusy POST, pouze druhý předán zápisovému handleru |
| Historická účast | Důkaz → Zrušit bez zápisu → znovu otevřít bez starého výběru → důkaz + ANO + kategorie → Odeslat → čeká na kontrolu → zavřít a znovu otevřít | Skutečný `submitHistoryClaim`, `getUnitedClub`, privátní médium; jedna žádost `pending`, jeden důkaz/R2 objekt; před zrušením žádný zápis/objekt; stejný počet bodů před/po |
| Komunitní fotografie | Nepovolený typ → žádný POST → skutečná fotografie → řízené 503 → zůstane chybná položka → opakování stejného upload ID → potvrzená fotografie čekající na schválení → vymazání lokálního výběru | Skutečný `uploadGallerySubmission`, seznam a privátní médium; právě jeden uložený `pending` záznam a objekt, po vymazání výběru beze změny |

Využitý `memberRuntime` načítá celé aktuální `db/schema.sql` do izolované SQLite a používá existující D1 adaptér. R2 je izolovaná paměťová mapa skutečných bajtů; žádný produkční upload. Firebase/session a nesouvisející čtecí domény zůstávají zavedenou browser fixture. Tyto scénáře proto ověřují skutečnou aplikaci v browseru a konkrétní zápisové handlery/DB, **nikoli** reálné Firebase přihlášení, produkční routerovou autorizaci či dostupnost Cloudflare.

Neobsloužené API a neočekávané konzolové chyby dále selhávají. Výjimky jsou omezené na jediný úmyslný profilový POST 503 a jeho konkrétní log ze zdroje `account.js`, nebo jediný úmyslný fotografický POST 503. Firefox serializuje tento konkrétní `Error` argument pouze jako `Error`; je vyžadován přesný text, správný modul a právě jeden takový záznam. Nejde o obecné vypnutí chyb.

## Problémy odhalené při přípravě testů

1. Profilový klient záměrně převádí 503 na bezpečný stav `Členský profil je dočasně nedostupný.` (`member/session.js`). První nové očekávání nesprávně hledalo syrový text ze syntetické odpovědi. Opraveno očekávání UI; console nadále obsahuje konkrétní původní chybu.
2. WebKit při zachycení multipart požadavku přes Playwright nepředal bajty souboru: historický POST měl jen **485 bajtů** a skutečný server odmítl důkaz jako `Image is too large`. Převzat přesný úzce omezený browserový serializační most již používaný v `registration-live-continuity.spec.mjs`: `new Request(...).arrayBuffer()` pro dvě uploadové cesty. Skutečná validace obrázku, bajty a výsledná DB nejsou nahrazené úspěšným mockem.
3. Zpřesňování očekávaného profilového console logu nejprve nesprávně hledalo mapovaný UI text a následně plný Error text i ve Firefoxu. Trace doložila rozdílnou serializaci. Konečná úzká výjimka je popsána výše; úspěšný profilový zápis, souhrny a reload prošly už před těmito závěrečnými testovými chybami.
4. V prvním WebKit běhu se profil před API vůbec neinicializoval; snapshot zůstal `Ověřuji přihlášení`, zachycené statické moduly měly HTTP 200, žádný SDK/API požadavek ani console chyba nebyly v trace. Později se stav neopakoval; příčina není prokázaná.
5. Jeden následný WebKit průchod oznámil dokončený click na otevření fotografického formuláře, ale formulář zůstal skrytý. Trace: click začal **7237 ms**, stabilita **7686 ms**, pointer **1157,263** kolem **7710 ms**; neprokazuje konkrétní příčinu. Přidána pasivní evidence skutečného pointer/click cíle a geometrie a okamžitá kontrola viditelnosti formuláře. Žádný opravný druhý click, force, sleep ani změna timeoutu. Následující cílený i konečný průchod prošly; původní případ se nevydává za opravenou aplikační chybu.

## Přesné cílené výsledky

Vše Windows, Node 24, Playwright 1.62.1; bez retries. Žádné CI ani celé browser/Node sady nebyly touto poddávkou spuštěny.

| Běh | Výsledek a důvod případného FAIL |
|---|---|
| První tři Chromium | **2 PASS / 1 FAIL**, 16,1 s; nesprávný text profilové chyby |
| Opravený profil Chromium | **1 PASS**, 2,9 s |
| Prvních šest WebKit/Firefox | **3 PASS / 3 FAIL**, 39,1 s; Firefox všechny tři PASS, WebKit inicializace + dva chybějící multipart soubory |
| WebKit po serializačním mostu | **2 PASS / 1 FAIL**, 14,5 s; profil a historie PASS, skrytý fotografický formulář po click |
| Fotografický průchod WebKit s pasivní evidencí | **1 PASS**, 3,6 s |
| Chromium/Firefox po zpřísnění logu | **4 PASS / 2 FAIL**, 19,4 s; historie/fotografie PASS, jen nesprávně očekávaný text console profilu |
| Profil Chromium/WebKit/Firefox po přesném raw textu | **2 PASS / 1 FAIL**, 9,9 s; zbývala pouze Firefox serializace Error |
| Konečný profil Firefox | **1 PASS**, 4,3 s |
| Konečná historie a fotografie Chromium/WebKit/Firefox, včetně zrušení důkazu a kontroly stejného upload ID | **6 PASS**, 21,4 s |

Konečné tři úlohy jsou tedy ověřené ve všech třech enginech v uvedených oddělených bězích. Nejde o jeden nový úplný průchod 9 testů ani důkaz, že dřívější ojedinělá selhání neexistovala. Screenshot desktopového čekajícího historického podání a mobilního zachovaného snímku při 390 px byly skutečně otevřeny. Neopakovala se dokončená vizuální matice.

Syntax nového testu a konfigurace: PASS. Konfigurace má jedinou změnu řádku se zařazením nové sady; původní smíšené konce řádků byly zachovány, `git diff --check` pro konfiguraci PASS. Finální společnou diff/import/cache kontrolu a publikaci řeší hlavní dávka.

## Opětovně využité důkazy a hranice

- Skutečné přidání auta z Planneru, prázdná garáž / existující hlavní auto, neúspěšný refresh, opakování bez druhého auta a obnova konceptu: existující `registration-live-continuity` se skutečnými handlery, dříve C/W/F **6 PASS**. Není přičten nový běh.
- Zrušení editace uloženého auta: existující skutečný DB snapshot v `garage initial focus is available for creating and editing a car`; nedochází k POST/PUT. Nové ruční opakování nepřidáno.
- Uzavřené registrace a průběžný koncept: stávající cílené `public-planner-stability`, `preliminary-reservations` a členská kontinuita; pravidla se v této poddávce nemění.
- Historická žádost čekající na kontrolu není schválení účasti či přidělení bodů. Fotografie čekající na schválení není veřejné zveřejnění. Nové kontroly tyto rozdíly výslovně zachovávají.
- Bez produkčních požadavků, e-mailů, obchodních rezervací/objednávek/plateb, Workeru, migrace, změny nastavení nebo CI. Audit, diagnostiky a nesouvisející A3/A4 report zůstávají zachované.
