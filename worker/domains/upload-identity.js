// Scope client retry keys to the authenticated actor and destination. No new identity or table.
export async function uploadIdentity(form, scope) {
  const key = String(form.get('uploadId') || '');
  if (!key) return crypto.randomUUID();
  if (!/^[0-9a-f-]{36}$/i.test(key)) throw new Error('invalid_upload_id');
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${scope}:${key}`)));
  return Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

// A D1 response may fail after commit. Never remove an object still referenced by
// its row (or when the verification read is also unavailable).
export async function cleanupFailedUpload(env,key,table,id){
  if(!['gallery_submissions','live_judge_photos','event_accommodation_photos'].includes(table))throw new Error('invalid_upload_table');
  try{const row=await env.DB.prepare(`SELECT r2_key FROM ${table} WHERE id=?`).bind(id).first();if(row?.r2_key!==key)await env.MEDIA.delete(key)}catch{}
}
