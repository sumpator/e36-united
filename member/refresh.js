export async function loadMemberSessionSnapshot({
  loadCars,
  loadReservation,
  loadPlannerDraft,
  loadClub,
  loadGallery,
  onCarsError,
  onGalleryError,
}) {
  const [cars, reservation, plannerDraftResult, club] = await Promise.all([
    loadCars().catch(error => { onCarsError?.(error); return []; }),
    loadReservation(),
    loadPlannerDraft(),
    loadClub(),
    loadGallery().catch(error => { onGalleryError?.(error); return []; }),
  ]);
  return { cars, reservation, plannerDraftResult, club };
}
