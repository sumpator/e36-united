# E36 United – dynamická statická verze

Samostatný web bez Wixu, CMS, databáze, Node.js a build procesu. Celý web běží jen na HTML + CSS + vanilla JavaScriptu a lze ho nahrát na prakticky libovolný hosting.

## Co je v této verzi nové

- dynamický hero s jemným parallaxem a reakcí na kurzor,
- scroll progress a animované statistiky,
- interaktivní průchod pátkem / sobotou / nedělí,
- **Show & Shine Inspection Lab** – po najetí na kritérium se kamera přiblíží na část auta a následně přejde do detailu,
- interaktivní „Weekend Builder“ pro příjezd, ubytování, počet lidí a Show & Shine,
- automaticky připravený e-mail s poptávkou podle konfigurace návštěvníka,
- chytré FAQ / Info Hub,
- konverzní sticky CTA po scrollu,
- 3D tilt u vybraných fotek a magnetické CTA prvky,
- plná mobilní varianta; interakce na hover se na telefonu mění na tap,
- respektuje systémové `prefers-reduced-motion`.

## Nasazení

1. Nahraj **celý obsah této složky** do webrootu (`public_html`, `www`, `htdocs` apod.).
2. Doménu `e36united.cz` nasměruj na hosting.
3. Na Apache nech `.htaccess`; zachovává starší Wix URL a nastavuje cache.
4. Ověř HTTPS.

Nic se nekompiluje. `index.html` lze otevřít i přímo z disku.

## Rezervace / poptávky

Web nepotřebuje backend. Weekend Builder vytvoří podle výběru návštěvníka předvyplněný e-mail na:

`united@e36united.cz`

Výběr **není prezentován jako potvrzená rezervace**. Web výslovně říká, že dostupnost potvrzuje E36 United e-mailem.

Aktuální hlavní stránka pracuje s tím, že ročník 19.–21. 6. 2026 už proběhl, a sbírá zájem o další United bez vymyšleného data. Jakmile bude nový termín, stačí změnit texty v `index.html`.

## Úplné odpojení obrázků od Wixu

Dodaná verze používá existující Wix CDN, takže funguje okamžitě. Pro úplnou nezávislost spusť na počítači s internetem:

```bash
python -m pip install requests
python fetch-assets.py
```

Skript nyní prochází **HTML + CSS + JavaScript**, takže stáhne i obrázky používané dynamickým Show & Shine modulem. Originály uloží do:

`assets/images/migrated/`

a odkazy automaticky přepíše na lokální soubory.

> YouTube aftermovie zůstává embedovaný z YouTube záměrně.

## Nejdůležitější soubory

- `index.html` – hlavní dynamická landing page
- `o-nas.html` – historie E36 United
- `galerie.html` – galerie
- `assets/css/styles.css` – kompletní vzhled a responsive design
- `assets/js/main.js` – veškerá interaktivita
- `fetch-assets.py` – migrace obrázků z Wix CDN
- `.htaccess` – redirecty a cache
- `robots.txt`, `sitemap.xml` – SEO

## Kde upravovat další ročník

V `index.html` změň:

- datum a stav ročníku v hero,
- případně text CTA „Další United“,
- program, pokud se změní.

V `assets/js/main.js` je v části **Weekend Builder** předmět a text automaticky připravovaného e-mailu. E-mailovou adresu lze změnit vyhledáním `united@e36united.cz`.

## Poznámka k mapě areálu

Do webu jsem záměrně nedal falešnou mapu rozmístění chatek, stanů a programu. Až bude existovat reálný plán Zbraslavic pro další ročník, lze do stejného vizuálního stylu doplnit interaktivní mapu s reálnými zónami a obsazeností.

