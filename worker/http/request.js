import { json } from "./responses.js";

export async function readJsonObject(request, origin) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid JSON object");
    return { body };
  } catch {
    return { response: json({ ok: false, error: "invalid_json", message: "Požadavek nemá platný JSON." }, 400, origin) };
  }
}
