# UNITED LIVE — návazný průchod Show & Shine (lokální)

Základ: `a29b2c20fcd9bec2e3304b31e4982b183dad9dda`. Při zahájení byl pracovní strom čistý.

## Rozsah

- Organizační rozhraní Admin LIVE: A výběr člena/QR → B potvrzení auta → C vlastní hodnocení → D potvrzené body.
- Vyhledávání je vložené přímo v Show & Shine. Samostatní Členové zůstávají dostupní; spuštění odtud přejde do stejného hodnocení.
- Fáze C/D mají pevnou identitu auta, fotografii, kategorii a stav hlasování. Přípravné formuláře zde nejsou.
- Zrušení výběru nemění uložená auta. Rozepsané nové auto vyžaduje potvrzení před opuštěním.
- Návrat na přehled zachovává koncept a hlasování; přehled nabízí pokračování a blokuje konkurenční kategorii při běžícím autě.
- Vlastní body a poznámka se uchovávají také v sessionStorage, odděleně podle účtu a ročníku. Historie se otevírá pro čtení; úprava je samostatná akce podle serverového stavu.
- Uzavření auta a uzavření s pokračováním jsou oddělené. Pokračování vyžaduje potvrzení uzavření i nový přehled ze serveru. Neuložené vlastní body/přílohy vyvolají výslovné upozornění.
- Při ztracené odpovědi spuštění se nejprve čte server; při nedostupném čtení zůstává opakované spuštění blokované. Opožděné QR, načtení členů a vytvoření auta nemění novější výběr.
- Potvrzené body zůstávají potvrzené i při chybě fotografií. Opakuje se jen neúspěšná příloha, nikoli úspěšné uploady ani body.
- Cache token dotčeného Admin vstupu, LIVE modulu a CSS: `20260928-judge1`.

Backend, databáze, soutěžní pravidla, veřejné výsledky a oprávnění se nemění. Neproběhl commit, push, deployment ani zápis do produkce. Globální LIVE nebylo zapnuto ani resetováno. Členská veřejná obrazovka LIVE a proces Nejlepšího výfuku nebyly přepracovány.

## Cílené ověření

`node node_modules/@playwright/test/cli.js test tests/e2e/live-judge-workflow.spec.mjs --project=chromium --reporter=line --max-failures=1`

**11/11 prošlo.** Pouze nový cílený soubor, skutečné aplikační handlery nad izolovanou SQLite v paměti, zachycené API požadavky a lokální náhrada úložiště.

Po finálním zachování samostatného seznamu Členů a doplnění upozornění nového auta znovu prošly pouze dva dotčené scénáře (2/2). Lokální testovací server byl zastaven.

- Člen i QR → potvrzení → okamžité hodnocení a fokus na kartu.
- Zmizení předchozích fází, návrat s konceptem, výslovné zahození jen vlastního konceptu.
- Přesné uložené známky, refresh, zachování konceptu po reloadu, historie bez startu.
- Uzavření a další auto ve stejné kategorii; uzavření samotné kategorie se neprovádí.
- Dvojklik, odmítnutí startu/close, ztracené odpovědi a nedostupné následné čtení.
- Uzavření druhým organizátorem a read-only koncept, vlastní auto organizátora.
- Částečné selhání fotografií a opakování jen chybějící přílohy.
- Simulované QR z kamery a opožděné povolení kamery po opuštění výběru.
- Desktop 1440 px a mobil 390 px, světlý/tmavý motiv; screenshoty fází B/C/D prohlédnuty, bez vodorovného přetékání. Dočasné screenshoty následný cílený běh standardně vyčistil.
- Syntax změněných JS/MJS a `git diff --check` prošly.

Celé testovací sady ani CI se nespouštěly.

## Omezení ověření

- Fyzická kamera telefonu, skutečná mobilní síť a souběh reálných produkčních zařízení nebyly použity. Souběh a síťové chyby byly simulované lokálně.
- Neodeslané fotografie jsou nadále jen v paměti stránky. Při návratu mezi pohledy zůstávají; po skutečném reloadu je nutné je znovu vybrat. Před opuštěním stránky prohlížeč varuje na neuloženou práci. Body a poznámky v téže kartě obnovu přežijí.
- Produkční vizuální kontrola neproběhla; tato dávka není nasazená.
