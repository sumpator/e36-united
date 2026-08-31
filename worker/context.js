export function createRequestContext(request, env) {
  return {
    request,
    env,
    url: new URL(request.url),
    origin: request.headers.get("Origin"),
  };
}
