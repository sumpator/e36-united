import { cors } from "./cors.js";

export function json(data, status = 200, origin = null) {
  return cors(new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  }), origin);
}
