export const MEMBER_SECTIONS = Object.freeze(['overview', 'live', 'reservation', 'garage', 'payments', 'club', 'photos', 'account', 'merch']);
export function memberSection(value) {
  if (['history', 'rewards'].includes(value)) return 'club';
  return MEMBER_SECTIONS.includes(value) ? value : 'overview';
}
export function requestedMemberSection(search) {
  const params = new URLSearchParams(search);
  if (!params.has('section') && !params.has('panel') && params.has('profile')) return 'club';
  return memberSection(params.get('section') ?? params.get('panel'));
}

// This non-identifying hint never authenticates anyone. It only chooses a form.
export const ACCOUNT_USED_KEY = 'e36UnitedAccountUsed:v1';
export function hasUsedAccount(storage) {
  try { return (storage ?? globalThis.localStorage)?.getItem(ACCOUNT_USED_KEY) === '1'; }
  catch { return false; }
}
export function rememberAccountUse(storage) {
  try { (storage ?? globalThis.localStorage).setItem(ACCOUNT_USED_KEY, '1'); return true; }
  catch { return false; }
}
export function accountAuthMode(search, storage) {
  const mode = new URLSearchParams(search).get('mode');
  return ['login', 'register'].includes(mode) ? mode : hasUsedAccount(storage) ? 'login' : 'register';
}
export function accountEntryHref({authenticated = false, anonymous = false, knownAccount = false} = {}) {
  const params = new URLSearchParams({intent:'account'});
  if (anonymous && !authenticated) params.set('mode', knownAccount ? 'login' : 'register');
  return `member.html?${params}`;
}

function safeReturnUrl(raw, origin) {
  if (!raw || /^[\\/]{2}|\\/.test(raw)) return null;
  try {
    const target = new URL(raw, origin);
    return target.origin === origin && !target.username && !target.password ? target : null;
  } catch { return null; }
}

export function resolveAccountIntent(input) {
  const url = new URL(input), params = url.searchParams;
  const target = safeReturnUrl(params.get('returnTo'), url.origin);
  if (params.has('draft')) {
    const plannerReturn = target && /^\/(?:index\.html)?$/.test(target.pathname) && /^#(?:planer|planner)$/.test(target.hash);
    return {kind:'member', section:'reservation', ...(plannerReturn ? {returnTo:target.pathname+target.search+target.hash} : {})};
  }
  if (params.has('section') || params.has('panel') || params.has('profile')) return {kind:'member', section:requestedMemberSection(url.search)};
  if (params.get('intent') === 'account') return {kind:'member', section:'overview'};
  if (target) {
    if (/^\/member(?:\.html)?\/?$/.test(target.pathname)) return {kind:'member', section:requestedMemberSection(target.search), context:Object.fromEntries([...target.searchParams].filter(([key])=>['profile','members','order','payment'].includes(key)))};
    // Public action destinations are deliberately limited; homepage provenance
    // in older menu links is not an action to resume after authentication.
    const publicAction = /^\/(?:galerie|merch)(?:\.html)?\/?$/.test(target.pathname);
    const legacyAction = /^#(?:upload|member-upload|order)(?:$|[=&])/.test(target.hash);
    if (publicAction && (params.get('intent') === 'return' || legacyAction)) return {kind:'public', section:'overview', destination:target.href};
  }
  return {kind:'member', section:'overview'};
}
