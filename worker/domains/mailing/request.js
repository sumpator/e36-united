// Bound untrusted delivery/webhook bodies even without Content-Length.
export async function readMailingBody(request, limit = 4096) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('invalid_payload');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid_payload');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error('payload_too_large'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== 'object') throw new Error('invalid_payload');
    return body;
  } finally { reader.releaseLock(); }
}
