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
  plannerDraftKey: "e36UnitedPlannerDraftV19"
};
