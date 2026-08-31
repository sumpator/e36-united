import { createRequestContext } from "./context.js";
import { optionsResponse } from "./http/cors.js";
import { json } from "./http/responses.js";
import { routeRequest } from "./router.js";

export default {
  async fetch(request, env) {
    const context = createRequestContext(request, env);

    if (request.method === "OPTIONS") {
      return optionsResponse(context.origin);
    }

    try {
      return await routeRequest(context);
    } catch (error) {
      console.error("Worker error:", error);
      return json({ ok: false, error: "Internal server error" }, 500, context.origin);
    }
  },
};
