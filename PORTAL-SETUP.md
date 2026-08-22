# E36 United — Member Portal backend setup (v20)

## DŮLEŽITÉ: proč teď nechodí mail ani upload

Pokud v portálu vidíš **`LOCAL PREVIEW · BACKEND OFF`**, web je stále jen statický frontend. GitHub/Vercel samy neposkytují uživatelskou databázi, úložiště fotek ani SMTP. V tomto režimu se účet a rezervace ukládají pouze do daného prohlížeče a branded e-mail se fyzicky nemá odkud odeslat.

Aby fungovaly **skutečné účty mezi zařízeními, serverové fotky a potvrzovací e-maily**, je potřeba jednorázově dokončit kroky níže. Po jejich dokončení se badge automaticky změní na `FIREBASE LIVE`; další aktualizace webu už budou zase jen upload souborů na GitHub.

Po uploadu souborů na GitHub funguje celý web a **Můj United** okamžitě v LOCAL PREVIEW režimu. Preview si nově pamatuje přihlášení i po refreshi.

Pro ostré účty, serverové fotky a automatické e-maily je potřeba jednorázově zapnout následující Firebase služby. Samotný Vercel hosting není nutné měnit a v repozitáři nezůstávají žádné tajné API klíče.

## 1. Firebase Authentication + Firestore

1. Vytvoř Firebase projekt a webovou aplikaci.
2. V Authentication zapni **Email/Password**.
3. Pro upload fotek z veřejné galerie zapni také **Anonymous** sign-in.
4. Vytvoř Firestore databázi.
5. Do `firebase-config.js` vlož hodnoty `apiKey`, `authDomain`, `projectId`, `storageBucket`, `appId`.
6. Do Firestore Rules vlož obsah `firestore.rules`.

Přihlášení používá `browserLocalPersistence`, takže uživatel po běžném refreshi zůstává přihlášený. Odhlásí se až tlačítkem Odhlásit nebo smazáním dat prohlížeče.

## 2. Firebase Storage — skutečné fotky na serveru

1. Zapni Cloud Storage for Firebase.
2. Publikuj obsah `storage.rules`.
3. Zkontroluj `storageBucket` v `firebase-config.js`.

Car photos se ukládají do `members/{uid}/cars/...` a gallery submissions do neveřejné fronty `gallery-pending/{uid}/...`.

**Poznámka 2026:** Firebase Storage vyžaduje projekt na Blaze (pay-as-you-go) plánu a připojený billing účet. Malá spotřeba může zůstat v bezplatných kvótách, ale bez Blaze Storage vrací 402/403. Vercel hosting se tím nemění.

## 3. Automatické e-maily — Firebase Trigger Email

Samotná HTML šablona **není mail server**. Extension musí mít SMTP účet, ze kterého bude skutečně odesílat. Doporučené produkční nastavení:

- odesílatel: **E36 United <noreply@e36united.cz>**
- Reply-To: **united@e36united.cz**
- SMTP provider: např. Resend / Brevo / jiný SMTP účet, který ověří doménu `e36united.cz`
- SMTP heslo/API credential patří pouze do nastavení Firebase Extension, nikdy do GitHubu

Po ověření domény nastav u poskytovatele požadované DNS záznamy (SPF/DKIM). Tím budou potvrzení chodit jako skutečné branded e-maily od E36 United, ne z klientského JavaScriptu.


Nainstaluj oficiální Firebase Extension **Trigger Email (`firestore-send-email`)** a nastav ji na kolekci:

`mail`

Při instalaci zadej SMTP účet. Může to být například Resend / SendGrid / Mailgun nebo jiný SMTP poskytovatel. Doporučený FROM:

`E36 United <united@e36united.cz>`

Aplikace sama vytváří pouze bezpečně omezené e-mailové joby do kolekce `mail`; `firestore.rules` dovolují členovi odeslat e-mail výhradně na jeho vlastní přihlášenou adresu a pouze pro předdefinované United typy zpráv.

### Co se odesílá automaticky

- po registraci: branded **Welcome / United ID** e-mail,
- Firebase zároveň odešle systémové ověření e-mailové adresy,
- po uložení rezervace: branded **Potvrď svůj United** e-mail.

Rezervace má nejdřív stav `pending_email`. E-mail obsahuje unikátní potvrzovací URL s platností 48 hodin. Po kliknutí se `member.html` otevře pod přihlášeným účtem, ověří token a teprve potom změní rezervaci na `confirmed`.

Grafické HTML šablony jsou v:

- `email-member-welcome.html`
- `email-reservation-confirmation.html`
- `email-points-reward.html`

## 4. Weekend Planner → členský profil

Pokud je uživatel přihlášený, hlavní CTA na homepage se automaticky změní z **Připravit poptávku** na **Přidat rezervaci do profilu**. Výběr se přenese do Můj United, kde člen vybere konkrétní auto z garáže a odešle potvrzovací e-mail.

- `Jen na otočku` automaticky schová ubytování a nastaví `Bez ubytování`.
- Show & Shine má `Ano / Možná / Ne` v profilu a `Chci soutěžit / Možná / Jedu se podívat` v planneru.

## 5. Co je bezpečné dát na GitHub

Firebase Web config (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `appId`) je klientská konfigurace a není serverový secret. Přístup chrání Firestore/Storage Rules.

**Na GitHub nikdy nedávej:** SMTP hesla, service-account JSON, privátní klíče nebo jiné serverové secrets. SMTP přihlašovací údaje patří pouze do konfigurace Firebase Trigger Email extension.
