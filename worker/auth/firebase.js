const FIREBASE_PROJECT_ID = "e36-united";
const FIREBASE_JWKS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

let jwksCache = { keys: [], expiresAt: 0 };

export async function verifyFirebaseRequest(request) {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  try { return await verifyFirebaseIdToken(token); }
  catch (error) { console.warn("Firebase token rejected:", error?.message || error); return null; }
}

async function verifyFirebaseIdToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed JWT");
  const [headerPart, payloadPart, signaturePart] = parts;
  const header = JSON.parse(decodeBase64UrlText(headerPart));
  const payload = JSON.parse(decodeBase64UrlText(payloadPart));
  if (header.alg !== "RS256") throw new Error("Invalid JWT algorithm");
  if (!header.kid || typeof header.kid !== "string") throw new Error("Missing JWT kid");

  const now = Math.floor(Date.now() / 1000), clockSkew = 300;
  if (typeof payload.exp !== "number" || payload.exp <= now - clockSkew) throw new Error("Expired token");
  if (typeof payload.iat !== "number" || payload.iat > now + clockSkew) throw new Error("Invalid issued-at time");
  if (typeof payload.auth_time !== "number" || payload.auth_time > now + clockSkew) throw new Error("Invalid auth time");
  if (payload.aud !== FIREBASE_PROJECT_ID) throw new Error("Invalid audience");
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) throw new Error("Invalid issuer");
  if (typeof payload.sub !== "string" || payload.sub.length < 1 || payload.sub.length > 128) throw new Error("Invalid subject");

  const jwk = await getFirebaseJwk(header.kid);
  const cryptoKey = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, decodeBase64UrlBytes(signaturePart), new TextEncoder().encode(`${headerPart}.${payloadPart}`));
  if (!valid) throw new Error("Invalid JWT signature");

  return { uid: payload.sub, email: typeof payload.email === "string" ? payload.email : "", emailVerified: payload.email_verified === true, name: typeof payload.name === "string" ? payload.name : "" };
}

async function getFirebaseJwk(kid) {
  let keys = await getFirebaseJwks();
  let key = keys.find(item => item.kid === kid);
  if (!key) { jwksCache.expiresAt = 0; keys = await getFirebaseJwks(); key = keys.find(item => item.kid === kid); }
  if (!key) throw new Error("Firebase signing key not found");
  return key;
}

async function getFirebaseJwks() {
  if (jwksCache.keys.length && Date.now() < jwksCache.expiresAt) return jwksCache.keys;
  const response = await fetch(FIREBASE_JWKS);
  if (!response.ok) throw new Error("Unable to fetch Firebase public keys");
  const data = await response.json();
  if (!Array.isArray(data.keys)) throw new Error("Invalid Firebase JWKS response");
  const cacheControl = response.headers.get("Cache-Control") || "";
  const match = cacheControl.match(/max-age=(\d+)/);
  const maxAge = match ? Number(match[1]) : 3600;
  jwksCache = { keys: data.keys, expiresAt: Date.now() + maxAge * 1000 };
  return jwksCache.keys;
}

function decodeBase64UrlText(value) {
  return new TextDecoder().decode(decodeBase64UrlBytes(value));
}

function decodeBase64UrlBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
