// Public Firebase web configuration. Firebase is used only for Authentication.
// Server-side profile data is handled by the Cloudflare Worker + D1.
export const firebaseConfig = {
  apiKey: "AIzaSyBLzMyHIKmUiV6o510AQIJiyD6WKnovh7Q",
  authDomain: "e36-united.firebaseapp.com",
  projectId: "e36-united",
  storageBucket: "e36-united.firebasestorage.app",
  messagingSenderId: "89800245472",
  appId: "1:89800245472:web:d3dbdb36523d77e3069085"
};

export const portalConfig = {
  mode: "production",
  apiBaseUrl: "https://api.e36united.cz",
  points: { attendance: 2, showShineWin: 3, communityBonus: 1, rewardThreshold: 12 },
  unitedYears: [2021, 2022, 2023, 2024, 2025, 2026],
  memberLocalPrefix: "e36UnitedMemberLocalV20",
  plannerDraftKey: "e36UnitedPlannerDraftV19"
};
