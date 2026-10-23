import { createRequestContext } from "./context.js";
import { optionsResponse } from "./http/cors.js";
import { json } from "./http/responses.js";
import { routeRequest } from "./router.js";
import {deliverTransactionalEmails} from './domains/mailing/transactional.js';

export default {
  async scheduled(event,env,ctx){ctx.waitUntil(deliverTransactionalEmails(env).catch(()=>console.error('Transactional queue unavailable')))},
  async fetch(request, env, ctx) {
    const context = createRequestContext(request, env);

    if (request.method === "OPTIONS") {
      return optionsResponse(context.origin);
    }

    try {
      const response=await routeRequest({...context,ctx});
      if(ctx&&env.SMTP2GO_API_KEY&&request.method!=='GET'&&response.ok)ctx.waitUntil(deliverTransactionalEmails(env).catch(()=>console.error('Transactional queue unavailable')));
      return response;
    } catch (error) {
      console.error("Worker error:", error);
      return json({ ok: false, error: "Internal server error" }, 500, context.origin);
    }
  },
};
