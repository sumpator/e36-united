export function isAuthorizationFailure(error) {
  return [401, 403].includes(error?.status) || ['member_inactive', 'api_auth_required'].includes(error?.message);
}

export async function loadMemberSessionSnapshot({
  loadCars,
  loadReservation,
  loadPlannerDraft,
  loadClub,
  loadGallery,
  onCarsError,
  onGalleryError,
}) {
  const errors = {};
  async function secondary(key, loader, fallback, onError) {
    try { return await loader(); }
    catch (error) {
      if (isAuthorizationFailure(error)) throw error;
      errors[key] = error;
      onError?.(error);
      return fallback;
    }
  }
  const [cars, reservation, plannerDraftResult, club] = await Promise.all([
    secondary('garage', loadCars, [], onCarsError),
    secondary('reservation', loadReservation, null),
    secondary('planner', loadPlannerDraft, { available: false, draft: null }),
    secondary('club', loadClub, null),
    secondary('photos', loadGallery, [], onGalleryError),
  ]);
  if (plannerDraftResult?.available === false) errors.planner ||= plannerDraftResult.error || new Error('planner_unavailable');
  return { cars, reservation, plannerDraftResult, club, errors };
}
