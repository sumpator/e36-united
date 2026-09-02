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

export function createMemberApiClient({ baseUrl, getCurrentUser, fetchRequest = fetch }) {
  async function request(path, { method = 'GET', body, token, retry = true } = {}) {
    const currentUser = getCurrentUser();
    if (!currentUser) throw new Error('api_auth_required');
    const idToken = token || await currentUser.getIdToken();
    let response;
    try {
      response = await fetchRequest(`${baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${idToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
    } catch (error) {
      throw networkError(error);
    }
    if (response.status === 401 && retry) {
      const freshToken = await getCurrentUser().getIdToken(true);
      return request(path, { method, body, token: freshToken, retry: false });
    }
    const payload = await responsePayload(response);
    if (!response.ok) throw responseError(response, payload);
    return payload;
  }

  async function requestForm(path, formData, { method = 'POST', token, retry = true } = {}) {
    const currentUser = getCurrentUser();
    if (!currentUser) throw new Error('api_auth_required');
    const idToken = token || await currentUser.getIdToken();
    let response;
    try {
      response = await fetchRequest(`${baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${idToken}` },
        body: formData,
        cache: 'no-store',
      });
    } catch (error) {
      throw networkError(error);
    }
    if (response.status === 401 && retry) {
      const freshToken = await getCurrentUser().getIdToken(true);
      return requestForm(path, formData, { method, token: freshToken, retry: false });
    }
    const payload = await responsePayload(response);
    if (!response.ok) throw responseError(response, payload);
    return payload;
  }

  async function requestBlob(path, { token, retry = true } = {}) {
    const currentUser = getCurrentUser();
    if (!currentUser) throw new Error('api_auth_required');
    const idToken = token || await currentUser.getIdToken();
    let response;
    try {
      response = await fetchRequest(`${baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${idToken}` },
        cache: 'no-store',
      });
    } catch (error) {
      throw networkError(error);
    }
    if (response.status === 401 && retry) {
      const freshToken = await getCurrentUser().getIdToken(true);
      return requestBlob(path, { token: freshToken, retry: false });
    }
    if (!response.ok) {
      const error = new Error(`API ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return await response.blob();
  }

  return { request, requestForm, requestBlob };
}
