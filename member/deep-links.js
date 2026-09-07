export const MEMBER_SECTIONS = Object.freeze(['overview', 'reservation', 'garage', 'payments', 'club', 'photos', 'account']);
export function memberSection(value) {
  if (['history', 'rewards'].includes(value)) return 'club';
  return MEMBER_SECTIONS.includes(value) ? value : 'overview';
}
export function requestedMemberSection(search) {
  const params = new URLSearchParams(search);
  return memberSection(params.get('section') ?? params.get('panel'));
}
