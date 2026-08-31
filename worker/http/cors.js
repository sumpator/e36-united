export const ALLOWED_ORIGINS = new Set([
  "https://e36united.cz",
  "https://www.e36united.cz",
  "https://e36-united.pages.dev",
  "https://cloudflare-auth-phase1.e36-united.pages.dev",
]);

export function isAllowedOrigin(origin) {
  return !origin || ALLOWED_ORIGINS.has(origin);
}

export function cors(response, origin) {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.append("Vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function optionsResponse(origin) {
  if (!isAllowedOrigin(origin)) return new Response(null, { status: 403 });
  return cors(new Response(null, { status: 204 }), origin);
}
