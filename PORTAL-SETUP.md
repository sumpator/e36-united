# E36 United — Member Portal auth setup

## Produkční architektura

Member login používá:

- **Firebase Authentication** — registrace, login, logout, reset hesla, persistence a verification e-mail;
- **Cloudflare Worker API** — ověřuje Firebase ID token a obsluhuje členský profil;
- **Cloudflare D1** — zdroj pravdy pro serverový profil člena;
- **Cloudflare R2** — připravené budoucí úložiště médií, v této fázi ho Member Portal nepoužívá.

Firestore ani Firebase Storage nejsou součástí Member login flow.

## Frontend konfigurace

`firebase-config.js` obsahuje veřejnou Firebase Web konfiguraci a:

```text
apiBaseUrl = https://api.e36united.cz
```

Firebase Web API key není serverový secret. Do GitHubu ale nikdy nepatří service-account JSON, privátní klíče ani Cloudflare secrets.

## Login flow

1. Firebase `signInWithEmailAndPassword` ověří účet.
2. Frontend získá Firebase ID token přes `getIdToken()`.
3. Frontend zavolá `GET /api/me` s:

```http
Authorization: Bearer <Firebase ID token>
```

4. Worker token kryptograficky ověří a podle Firebase UID načte profil z D1.
5. Pokud Firebase účet existuje, ale D1 profil ještě ne, frontend provede idempotentní `POST /api/bootstrap` a profil vytvoří.
6. Teprve po úspěšném načtení profilu se zobrazí Member dashboard.

Při `401` frontend jednou vynutí refresh Firebase ID tokenu a request zopakuje.

## Registrace

Registrace záměrně **nenechává uživatele automaticky přihlášeného**:

1. `createUserWithEmailAndPassword`;
2. `updateProfile`;
3. `POST /api/bootstrap`;
4. `sendEmailVerification`;
5. Firebase `signOut`;
6. návrat na Login obrazovku.

Pokud bootstrap během registrace selže, první úspěšný login ho bezpečně zopakuje.

## Persistence a logout

Firebase používá `browserLocalPersistence`, takže při refreshi zůstane Firebase session zachovaná. Po obnovení stránky se ale dashboard ukáže až po novém úspěšném `/api/me`.

Logout provede Firebase `signOut`, vyčistí pouze UI/session hint a resetuje in-memory profil.

Firebase ID token se nikdy ručně neukládá do `localStorage`.

## Lokální Phase 1 data

Garáž, historie, body a rezervace ještě nejsou napojené na vlastní Worker endpointy. Do jejich serverové migrace se ukládají pouze lokálně a **odděleně podle Firebase UID**:

```text
e36UnitedMemberLocalV20:<firebaseUid>
```

Tím účet B nemůže zdědit lokální data účtu A po logout/login přepnutí.

Starý globální preview localStorage se automaticky nemigruje k žádnému reálnému účtu.

## Worker API contract

### `GET /api/me`

Vyžaduje Bearer token. Vrací existující členský profil nebo `profileExists: false`.

### `POST /api/bootstrap`

Vyžaduje Bearer token a JSON s `name` / `nickname`. Operace musí být idempotentní pro stejné Firebase UID.

## CORS

Worker musí povolit produkční webové originy, minimálně:

```text
https://e36united.cz
https://www.e36united.cz
https://e36-united.pages.dev
```

a pro aktivní preview testování také konkrétní preview origin.

Povolené headers musí zahrnout `Authorization` a `Content-Type`; `OPTIONS` preflight má vracet úspěšnou odpověď.

## Před nasazením

Otestuj:

- registrace -> Firebase účet + D1 profil -> logout na login screen;
- login -> `/api/me` -> dashboard;
- refresh -> automatické obnovení Firebase session + `/api/me`;
- logout -> žádná data předchozího člena v UI;
- login jiného účtu -> žádná lokální data předchozího UID;
- reset hesla;
- desktop + mobil.

Legacy `firestore.rules` a `storage.rules` mohou v repozitáři zůstat jako historické soubory, ale Member Portal je nepoužívá.
