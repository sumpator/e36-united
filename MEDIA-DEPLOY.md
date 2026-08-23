# E36 United – media upload deployment

Frontend v tomto ZIPu už používá Cloudflare Worker + D1 + privátní R2 bucket.
Firebase zůstává pouze pro Authentication.

## Co je zapojené

- Můj United → Moje auta: auto se ukládá do D1 a až 3 fotky do R2.
- Můj United → Moje fotky: až 8 fotek do moderované fronty `gallery_submissions` se stavem `pending`.
- Galerie → upload: stejná moderovaná R2 fronta, pouze pro přihlášené členy.
- Galerie → OFFICIAL PHOTOS: stávající oficiální fotografie.
- Galerie → USER ADDED PHOTOS: pouze fotografie se stavem `approved`.
- Galerie → videa: sekce je nahoře; hlavní official aftermovie se přehrává přes YouTube embed a je doplněná odkazem na celý kanál `@e36unitedofficial`.

## Jediný krok mimo GitHub

GitHub/Cloudflare Pages umí nasadit frontend, ale upload do privátního R2 vyžaduje změnu existujícího Workeru `e36-united-api`.

V Cloudflare otevři:

Workers & Pages → e36-united-api → Edit code

Nahraď kód obsahem souboru:

`cloudflare-worker-media.js`

a klikni Deploy.

Bindings musí zůstat:

- `DB` → D1 `e36-united-db`
- `MEDIA` → R2 `e36-united-media`

R2 Public Access nech vypnutý.

## D1

Současné tabulky `cars`, `car_photos` a `gallery_submissions` už potřebná pole obsahují. Není potřeba měnit schema.

Volitelně lze jednou spustit `D1-media-indexes.sql`; přidává jen indexy pro rychlejší galerii a fotky.

## Moderace

Každá community fotografie vzniká jako:

`pending`

Veřejný endpoint vrací pouze:

`approved`

`rejected` se veřejně nikdy nezobrazuje.

Admin rozhraní pro změnu statusu bude další fáze. Do té doby lze status při testu změnit přímo v D1.

## Limity

Frontend fotografie před uploadem zmenšuje na max. 1800 px a převádí na JPEG.
Worker navíc odmítne:

- neobrázkové MIME typy,
- soubory nad 8 MB po uploadu,
- více než 3 fotky k jednomu autu,
- více než 24 community uploadů jednoho člena za 24 hodin.
