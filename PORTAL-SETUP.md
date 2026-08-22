# E36 United Member Portal v18 – produkční napojení

## Co funguje ihned po uploadu na GitHub
- `member.html` kompletní členský portal UI.
- Lokální preview registrace/login bez ukládání hesla.
- Více aut + až 3 komprimované fotky na auto.
- Historie United a automatický `member since`.
- Rezervační snapshot napárovaný na konkrétní auto.
- 12bodový systém, badges a perks.
- United Merch member benefit.
- 3 hotové HTML e-mailové šablony.

## Co je potřeba jednou napojit pro ostrý provoz
1. Firebase Authentication: Email/Password.
2. Firestore database.
3. Zkopírovat Firebase Web Config do `firebase-config.js`.
4. V Firebase vložit pravidla z `firestore.rules`.

Po vyplnění configu se `member.js` automaticky přepne z LOCAL PREVIEW do FIREBASE LIVE.

## E-maily
HTML šablony jsou připravené jako:
- `email-member-welcome.html`
- `email-reservation-confirmation.html`
- `email-points-reward.html`

Pro automatické odesílání booking/reward mailů je potřeba jednou připojit mail transport (např. Resend přes Vercel Function). To nevyžaduje změnu statického hostingu stránky, ale vyžaduje API klíč/doménu. Šablony jsou už připravené pro backend renderer.

## Bezpečnost
- Hesla se nikdy neukládají do GitHubu ani localStorage.
- Preview login je jen UX demonstrace a žádné heslo neukládá.
- Produkční přihlášení deleguje hesla na Firebase Auth.
- Firestore rules dovolí uživateli číst/zapisovat jen `members/{vlastní uid}`.
- Historická účast může ihned změnit `Member since`, ale body se přičítají až při `verified=true`, aby nešlo body získávat samopotvrzením.
