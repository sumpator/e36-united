// Analytics is deliberately detached from navigation; the URL/local draft is the functional handoff.
export function trackPublicPlannerDraft(draft, { baseUrl, fetchRequest = fetch } = {}) {
  return fetchRequest(`${baseUrl}/api/planner-handoffs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draft }), keepalive: true,
  }).then(response => response.ok).catch(() => false);
}
