function deriveMemberRating(lifetimePoints) {
  const points = Math.max(0, Number(lifetimePoints || 0));
  if (points >= 12) return { key: "m-power", name: "M POWER", minPoints: 12 };
  if (points >= 10) return { key: "328i", name: "328i", minPoints: 10 };
  if (points >= 8) return { key: "325i", name: "325i", minPoints: 8 };
  if (points >= 6) return { key: "323i", name: "323i", minPoints: 6 };
  if (points >= 4) return { key: "320i", name: "320i", minPoints: 4 };
  if (points >= 2) return { key: "318is", name: "318is", minPoints: 2 };
  return { key: "316i", name: "316i", minPoints: 0 };
}

function deriveUnitedAchievements(history, approvedPhotoCount) {
  const approved = history.filter(item => item.attendance.status === "approved");
  const count = approved.length;
  const statusLevels = [
    { min: 6, name: "UNITED LEGEND", tier: "Platinum" },
    { min: 4, name: "UNITED VETERAN", tier: "Gold" },
    { min: 2, name: "UNITED REGULAR", tier: "Silver" },
    { min: 0, name: "UNITED MEMBER", tier: "Member" },
  ];
  const status = statusLevels.find(item => count >= item.min);
  const statusPriority = status.min >= 6 ? 94 : status.min >= 4 ? 93 : status.min >= 2 ? 92 : 70;
  const achievements = [{ id: `attendance-${status.min}`, type: "attendance", name: status.name, tier: status.tier, condition: `${count} schválených účastí`, priority: statusPriority }];
  const photoLevels = [
    { min: 50, name: "BMW PROSPEKT", tier: "Gold", points: 3 },
    { min: 25, name: "BMW PROSPEKT", tier: "Silver", points: 1 },
    { min: 5, name: "BMW PROSPEKT", tier: "Bronze", points: 1 },
  ];
  const photo = photoLevels.find(item => approvedPhotoCount >= item.min);
  if (photo) achievements.push({ id: `photos-${photo.min}`, type: "community", name: photo.name, tier: photo.tier, condition: `${approvedPhotoCount} schválených komunitních fotek`, points: photo.points, priority: photo.min >= 50 ? 84 : photo.min >= 25 ? 83 : 82 });
  if (approved.some(item => item.eventYear <= 2023)) achievements.push({ id: "oldschool", type: "history", name: "OLD SCHOOL", tier: "Legacy", condition: "Schválená účast na United 2023 nebo dříve", priority: 85 });
  if (approved.some(item => item.eventYear === 2021)) achievements.push({ id: "united-first", type: "history", name: "UNITED FIRST", tier: "Founding", condition: "Schválená účast na prvním United 2021", priority: 90 });
  for (const item of approved.filter(entry => entry.showShine.status === "approved")) {
    const placement = Number(item.showShine.placement || 0);
    if ([1, 2, 3].includes(placement)) achievements.push({ id: `sns-top3-${item.eventId}`, type: "show-shine", name: `S&S TOP 3 · ${item.eventYear}`, tier: placement === 1 ? "Gold" : placement === 2 ? "Silver" : "Bronze", condition: `${placement}. místo v kategorii ${item.showShine.category}`, eventId: item.eventId, eventYear: item.eventYear, points: placement === 1 ? 3 : placement === 2 ? 2 : 1, priority: 95 + (4 - placement) });
    if (item.showShine.bestOfBest) achievements.push({ id: `sns-bob-${item.eventId}`, type: "show-shine", name: `BEST OF THE BEST · ${item.eventYear}`, tier: "Gold", condition: `Schválené ocenění Best of the Best na United ${item.eventYear}`, eventId: item.eventId, eventYear: item.eventYear, points: 1, priority: 100 });
    if (item.showShine.bestExhaust) achievements.push({ id: `sns-exhaust-${item.eventId}`, type: "show-shine", name: `NEJ ZVUK VÝFUKU · ${item.eventYear}`, tier: "Gold", condition: `Schválené ocenění Nej zvuk výfuku na United ${item.eventYear}`, eventId: item.eventId, eventYear: item.eventYear, points: 1, priority: 95 });
  }
  const featured = [...achievements].sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name, "cs")).slice(0, 4);
  return { achievements: achievements.map(({ priority, ...item }) => item), featured: featured.map(({ priority, ...item }) => item) };
}

export { deriveMemberRating, deriveUnitedAchievements };
