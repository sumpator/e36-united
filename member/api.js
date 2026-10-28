function networkError(error) {
  const wrapped = new Error('api_network_error');
  wrapped.cause = error;
  return wrapped;
}

async function responsePayload(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function responseError(response, payload) {
  const error = new Error(payload?.message || payload?.error || `API ${response.status}`);
  error.status = response.status;
  error.payload = payload;
  return error;
}

export function createMemberApiClient({ baseUrl, getCurrentUser, fetchRequest = fetch, timeoutMs = 20_000, retryDelayMs = 250 }) {
  function requireSameUser(user) {
    if (getCurrentUser() !== user) throw new Error('api_auth_required');
  }
  async function getToken(user, force, deadlineAt=Date.now()+timeoutMs) {
    let timer;
    try {
      const token = await Promise.race([user.getIdToken(force),new Promise((_,reject)=>{timer=setTimeout(()=>reject(networkError(new Error('token_timeout'))),Math.max(0,deadlineAt-Date.now()))})]);
      requireSameUser(user);
      return token;
    } finally { clearTimeout(timer); }
  }
  // Include body consumption in the deadline: a response can stall after headers.
  async function transfer(path, options, consume, transientRetry = true, deadlineAt=Date.now()+timeoutMs) {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetchRequest(`${baseUrl}${path}`, { ...options, signal: controller.signal });
          if (['GET', undefined].includes(options.method) && [502, 503, 504].includes(response.status) && transientRetry) {
            await response.body?.cancel();
            const error = new Error('transient_read'); error.transient = true; throw error;
          }
          return await consume(response);
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(networkError(new Error('request_timeout'))); }, Math.max(0,deadlineAt-Date.now())); }),
      ]);
    } catch (error) {
      const network = !error.status && (error instanceof TypeError || error.name === 'AbortError' || error.message === 'api_network_error' || error.transient);
      if (['GET', undefined].includes(options.method) && transientRetry && network && Date.now()+retryDelayMs<deadlineAt) {
        clearTimeout(timer);
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        return transfer(path, options, consume, false, deadlineAt);
      }
      throw network ? networkError(error) : error;
    } finally { clearTimeout(timer); }
  }
  async function request(path, { method = 'GET', body, token, retry = true, deadlineAt=Date.now()+timeoutMs } = {}) {
    const currentUser = getCurrentUser();
    if (!currentUser) throw new Error('api_auth_required');
    const idToken = token || await getToken(currentUser, undefined, deadlineAt);
    let response;
    try {
      response = await transfer(path, {
        method,
        headers: { Authorization: `Bearer ${idToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      }, async result => ({ status: result.status, ok: result.ok, payload: await responsePayload(result) }), true, deadlineAt);
    } catch (error) {
      throw networkError(error);
    }
    if (response.status === 401 && retry) {
      if (getCurrentUser()?.uid !== currentUser.uid || !getCurrentUser()) throw new Error('api_auth_required');
      const freshToken = await getToken(currentUser, true, deadlineAt);
      return request(path, { method, body, token: freshToken, retry: false, deadlineAt });
    }
    const payload = response.payload;
    requireSameUser(currentUser);
    if (!response.ok) throw responseError(response, payload);
    return payload;
  }

  async function requestForm(path, formData, { method = 'POST', token, retry = true } = {}) {
    const currentUser = getCurrentUser();
    if (!currentUser) throw new Error('api_auth_required');
    const idToken = token || await getToken(currentUser);
    let response;
    try {
      response = await transfer(path, {
        method,
        headers: { Authorization: `Bearer ${idToken}` },
        body: formData,
        cache: 'no-store',
      }, async result => ({ status: result.status, ok: result.ok, payload: await responsePayload(result) }));
    } catch (error) {
      throw networkError(error);
    }
    if (response.status === 401 && retry) {
      if (getCurrentUser()?.uid !== currentUser.uid || !getCurrentUser()) throw new Error('api_auth_required');
      const freshToken = await getToken(currentUser, true);
      return requestForm(path, formData, { method, token: freshToken, retry: false });
    }
    const payload = response.payload;
    requireSameUser(currentUser);
    if (!response.ok) throw responseError(response, payload);
    return payload;
  }

  async function requestBlob(path, { token, retry = true } = {}) {
    const currentUser = getCurrentUser();
    if (!currentUser) throw new Error('api_auth_required');
    const idToken = token || await getToken(currentUser);
    let response;
    try {
      response = await transfer(path, {
        headers: { Authorization: `Bearer ${idToken}` },
        cache: 'no-store',
      }, async result => ({ status: result.status, ok: result.ok, blob: result.ok ? await result.blob() : null }));
    } catch (error) {
      throw networkError(error);
    }
    if (response.status === 401 && retry) {
      if (getCurrentUser()?.uid !== currentUser.uid || !getCurrentUser()) throw new Error('api_auth_required');
      const freshToken = await getToken(currentUser, true);
      return requestBlob(path, { token: freshToken, retry: false });
    }
    requireSameUser(currentUser);
    if (!response.ok) {
      const error = new Error(`API ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.blob;
  }

  return { request, requestForm, requestBlob };
}
