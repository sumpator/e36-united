# E36 United — Member Portal setup (Cloudflare Auth Phase 1)

Member Portal používá tuto architekturu:

- **Cloudflare Pages** hostuje statický web;
- **Firebase Authentication** zajišťuje registraci, přihlášení, odhlášení, reset hesla a ověření e-mailu;
- **Cloudflare Worker API** na `https://api.e36united.cz` ověřuje Firebase ID token a obsluhuje členský profil;
- **Cloudflare D1** ukládá serverová profilová data;
- **Cloudflare R2** je cílové úložiště médií pro další fázi.

Firestore ani Firebase Storage nejsou součástí Member Portalu. Firebase web config je veřejná klientská konfigurace; serverové tajné údaje a service-account credentials do repozitáře nepatří.

## 1. Rozsah Phase 1

Serverově fungují:

- registrace e-mailem a heslem;
- nastavení zobrazovaného jména ve Firebase Auth;
- odeslání ověřovacího e-mailu;
- přihlášení a odhlášení;
- reset hesla;
- obnovení přihlášení po refreshi přes `browserLocalPersistence`;
- bootstrap a načtení členského profilu přes Worker API.

Zatím zůstávají lokálně v prohlížeči:

- garáž včetně komprimovaných fotografií;
- historie účastí;
- rezervace;
- body, badges a perks.

Tyto lokální moduly se v Phase 1 neposílají do Worker API, D1 ani R2. Profil se neukládá společně s nimi: při každé obnovené Firebase relaci se znovu načte z `/api/me`. Firebase ID token se nikdy ručně neukládá do `localStorage`; frontend si jej vyžádá přímo od aktuálního Firebase uživatele pouze pro konkrétní API request.

## 2. Firebase Authentication

Projekt je `e36-united` a webová konfigurace je v `firebase-config.js`. V Firebase Console:

1. V **Authentication → Sign-in method** zapni **Email/Password**.
2. V **Authentication → Settings → Authorized domains** povol produkční doménu Cloudflare Pages a všechny používané preview/domény.
3. Nastav šablony pro ověření e-mailu a reset hesla do češtiny a na správnou cílovou doménu.

Frontend načítá pouze Firebase moduly `firebase-app.js` a `firebase-auth.js`. Firestore a Firebase Storage se pro Member Portal neinicializují.

## 3. Worker API

API base URL je:

`https://api.e36united.cz`

Požadované endpointy:

### `POST /api/bootstrap`

Vytvoří nebo idempotentně doplní členský profil po Firebase registraci.

Headers:

```http
Authorization: Bearer <Firebase ID token>
Content-Type: application/json
```

Body:

```json
{
  "name": "Jan Novák",
  "nickname": "Honza"
}
```

### `GET /api/me`

Vrátí profil přihlášeného člena podle Firebase `uid` z ověřeného tokenu.

Headers:

```http
Authorization: Bearer <Firebase ID token>
```

Doporučený response tvar pro oba endpointy:

```json
{
  "profile": {
    "uid": "firebase-uid",
    "email": "clen@example.cz",
    "name": "Jan Novák",
    "nickname": "Honza",
    "createdAt": "2026-08-22T12:00:00.000Z"
  }
}
```

Frontend pro bezpečný přechod akceptuje také přímý profilový objekt nebo obálku `data`.

## 4. Ověření Firebase tokenu ve Workeru

Worker musí před přístupem k D1:

1. vyžadovat `Authorization: Bearer ...`;
2. kryptograficky ověřit podpis Firebase ID tokenu proti Google public keys;
3. ověřit `alg`, `kid`, `aud`, `iss`, `sub`, `exp`, `iat` a Firebase project ID `e36-united`;
4. používat ověřené `sub`/`uid` jako jediný identifikátor vlastníka profilu;
5. nikdy nedůvěřovat `uid` nebo `email` poslaným v request body.

Worker musí mít CORS nastavený jen pro schválené domény webu a povolit minimálně headers `Authorization` a `Content-Type` a metody `GET`, `POST`, `OPTIONS`.

## 5. D1

D1 je zdroj pravdy pro členský profil. Minimální tabulka má obsahovat Firebase `uid` jako unikátní klíč a profilová pole jako `email`, `name`, `nickname`, `created_at` a `updated_at`.

`POST /api/bootstrap` musí být idempotentní: opakované zavolání pro stejné Firebase `uid` nesmí vytvořit duplicitní profil. Databázové migrace patří do Worker projektu a musí se aplikovat nejdřív na testovací prostředí.

## 6. R2 a další fáze

R2 je připravené pro budoucí serverové fotografie aut a další média. Phase 1 žádné R2 upload endpointy nepoužívá a zachovává lokální ukládání fotografií. Před zapojením R2 je potřeba doplnit autorizované upload endpointy, limity typu/velikosti souboru a pravidla vlastnictví objektů.

Stejně tak se v další fázi samostatně navrhnou endpointy a D1 schéma pro garáž, historii, rezervace a body. Do té doby se tato data nesmí omylem míchat do profilového endpointu.

## 7. Nasazení na Cloudflare Pages

1. Připoj GitHub repozitář k Cloudflare Pages.
2. Nastav produkční doménu webu a HTTPS.
3. Nasaď Worker na `api.e36united.cz` a připoj D1 binding; R2 binding může zůstat připravený pro další fázi.
4. Ověř DNS, Worker route a CORS pro produkční i potřebné preview domény.
5. V Firebase Authorized domains povol finální webovou doménu.
6. Otestuj registraci, ověřovací e-mail, logout/login, reset hesla a refresh přihlášené relace.

## 8. Co nikdy necommitovat

- service-account JSON;
- privátní klíče pro ověřování nebo podepisování tokenů;
- Cloudflare API tokeny;
- D1/R2 credentials mimo Cloudflare bindings;
- jiné serverové secrets.

Firebase web config v `firebase-config.js` není serverový secret. Oprávnění chrání Firebase Authentication a ověření ID tokenu ve Workeru.
