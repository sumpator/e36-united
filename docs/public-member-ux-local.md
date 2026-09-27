# Veřejný web a Můj United — lokální UX dávka

Stav: připraveno lokálně, bez commitu, pushnutí a nasazení. Výchozí HEAD: `5bf52ebbf40fc9cc7a44ad5f334413ea227c2002`.

## Změny

- Vnější mezery homepage jsou přibližně o 36 % menší (součet běžných sousedních paddingů desktop 248 → 160 px, mobil 156 → 100 px). Vnitřní mezery a dotykové plochy zůstaly zachované. Kotvy mají odstup od pevné navigace.
- Program, Show & Shine a Planner mají jemné dekorativní nápisy E36 / UNITED / KOMUNITA; na mobilu jsou skryté.
- O nás: upravený desktopový výřez skutečné fotografie a jemnější přechod. Mobil zobrazuje pouze titul a tři časové boxy. Galerie má dominantnější hlavní fotografii; mobilní fotografický pás je skrytý.
- Merch i Club používají společný modul `member/points-guide.js`. Pravidla jsou rozčleněná, soutěže mají vlastní blok. Merch nabízí obě vysvětlení i anonymně a samostatný odkaz do Clubu. Výhoda neuvádí vymyšlenou sazbu ani počet nevyčerpaných odměn.
- Moje fotky: celoplošný responzivní grid a rozbalovací upload s náhledy, odebráním jednotlivého souboru a zachováním výběru/popisku při sbalení. Odesílání, omezení, průběh a chybové zprávy zůstávají v existujícím toku.
- Registrace je bez horního štítku a prázdného řádku. Merch je zarovnaný s menu, LIVE zůstává poslední. Uvítací hero nemá duplicitní rok/počet účastí; profilové údaje zůstávají. Mobilní stav úplnosti je vedle jména.
- Změněné vstupy a moduly používají cache token `20260927-ux2`; nezměněné závislosti zachovávají dosavadní tokeny. Nové styly jsou omezené na dotčené prvky.

## Cílené ověření

- Chromium lokálně: desktop 1440 px, mobil 390 a 360 px, světlý i tmavý motiv. Screenshoty dotčených rozložení byly otevřené a prohlédnuté; bez horizontálního přetékání.
- Ověřeno: kotvy homepage pod navigací, obě vysvětlení v Merchi, odkaz do Clubu, zavření dialogu po odscrollování a návrat fokusu, akční přechod z Clubu do fotek.
- Ověřeno: výchozí skrytý upload, dva náhledy, odebrání jednoho souboru, zachování výběru a popisku při sbalení/rozbalení, dlouhé jméno se stavem úplnosti, registrace bez horního prázdného řádku.
- Syntax změněných JS a `git diff --check`. Celé testovací sady ani CI nebyly spuštěné.

## Omezení a bezpečnost

Kontrola členských stavů používala izolované lokální fixtures a zachycené API požadavky, nikoli skutečnou přihlášenou produkční relaci. Žádný soubor nebyl odeslán; produkční upload a serverové schvalování nebyly znovu ověřované. Některé nezměněné externí obrázky (například navigační logo) fixtures nahrazují zástupným obrázkem; dotčené veřejné fotografie jsou skutečné lokální assety. Kontrolní skripty a screenshoty zůstávají mimo Git repozitář ve složce `../ux-refinement-review/`.

Bez změn Workeru, migrací, produkčních dat, bodových výpočtů, plateb, konfigurace ročníků, aktivace LIVE či objednávání. Žádné e-maily ani produkční uploady. Merch zůstává pozastavený.
