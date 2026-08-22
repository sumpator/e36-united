// E36 United Member Portal – Firebase production config.
// The portal works in LOCAL PREVIEW mode until these values are replaced.
// Firebase web config values are public identifiers; access is protected by Firestore Rules.
export const firebaseConfig = {
  apiKey: "PASTE_FIREBASE_API_KEY",
  authDomain: "PASTE_PROJECT.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  appId: "PASTE_FIREBASE_APP_ID"
};
export const portalConfig = {
  mode: "auto",
  points: { attendance: 2, showShineWin: 3, communityBonus: 1, rewardThreshold: 12 },
  unitedYears: [2021, 2022, 2023, 2024, 2025, 2026]
};
