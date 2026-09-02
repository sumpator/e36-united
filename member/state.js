export function createMemberData() {
  return {
    profile: { id: '', memberCode: '', name: 'United Member', nickname: 'Driver', email: '', phone: '', role: 'member', status: 'active', emailVerified: false, createdAt: '' },
    cars: [],
    reservation: null,
    club: { points: { available: 0, lifetime: 0 }, rewardThreshold: 12, rating: { key: '316i', name: '316i', minPoints: 0 }, memberSince: null, historyCompletedAt: null, history: [], approvedPhotoCount: 0, profileCompletion: {}, achievements: [], featuredAchievements: [] },
  };
}

export function normalizeMember(payload, user = null) {
  const source = payload?.member || payload?.profile || payload?.data?.member || payload?.data?.profile || payload?.data || payload || {};
  return {
    id: source.id || source.uid || user?.uid || '',
    memberCode: source.memberCode || source.member_code || '',
    name: source.name || user?.displayName || user?.email?.split('@')[0] || 'United Member',
    nickname: source.nickname || source.name?.split(' ')[0] || user?.displayName?.split(' ')[0] || 'Driver',
    email: source.email || user?.email || '',
    phone: source.phone || '',
    role: source.role || 'member',
    status: source.status || 'active',
    emailVerified: typeof source.emailVerified === 'boolean' ? source.emailVerified : Boolean(source.email_verified ?? user?.emailVerified),
    createdAt: source.createdAt || source.created_at || '',
    updatedAt: source.updatedAt || source.updated_at || '',
  };
}
