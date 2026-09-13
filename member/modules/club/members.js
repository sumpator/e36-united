import { createClubProfileViewer } from '../../club-profile.js?v=20260913-club-profile-ux-r1';
import { $, esc } from '../../ui.js?v=20260902-phase3';

const fallbackLogo = 'united-logo-blue-silver-transparent.png';

export function createClubMembers({ apiBaseUrl, apiRequest, apiRequestBlob, getData, openSection }) {
  const ownedUrls = new Map();
  const photoSources = new WeakMap();
  let observer = null;
  let listRestoreFocus = null;
  let directProfileHandled = false;
  let bound = false;

  const profileViewer = createClubProfileViewer({ apiBaseUrl, apiRequest, apiRequestBlob, beforeOpen: () => openSection('club') });

  function releaseListMedia() {
    const root = $('[data-club-members-list]');
    root?.querySelectorAll('[data-club-member-photo]').forEach(image => image.remove());
    observer?.disconnect(); observer = null;
    for (const url of ownedUrls.values()) URL.revokeObjectURL(url);
    ownedUrls.clear();
  }

  async function loadPrivatePhoto(image) {
    const path = photoSources.get(image);
    if (!path || image.dataset.loaded === 'true') return;
    image.dataset.loaded = 'true';
    try {
      const blob = await apiRequestBlob(path);
      if (!image.isConnected || photoSources.get(image) !== path) return;
      const url = URL.createObjectURL(blob); ownedUrls.set(image, url); image.src = url;
    } catch (error) {
      image.removeAttribute('src'); image.closest('.club-member-photo')?.classList.add('is-fallback');
      console.warn('Club member photo unavailable', error);
    }
  }

  function observePhoto(image, path) {
    if (!image || !path) return;
    photoSources.set(image, path);
    if (!('IntersectionObserver' in window)) { void loadPrivatePhoto(image); return; }
    if (!observer) observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { observer.unobserve(entry.target); void loadPrivatePhoto(entry.target); }
    }, { rootMargin: '160px' });
    observer.observe(image);
  }

  function renderList() {
    const root = $('[data-club-members-list]'); if (!root) return;
    releaseListMedia();
    const members = getData().club?.clubMembers?.members || []; root.innerHTML = '';
    if (!members.length) root.innerHTML = '<article class="club-members-empty"><img alt="" src="united-logo-blue-silver-transparent.png"><div><b>Klubové profily se právě skládají.</b><p>Jakmile členové doplní své United profily, objeví se tady.</p></div></article>';
    for (const member of members) {
      const button = document.createElement('button'); button.className = 'club-member-card'; button.type = 'button';
      button.setAttribute('aria-label', `Otevřít klubový profil ${member.nickname || member.name}`);
      button.innerHTML = `<span class="club-member-photo${member.photoUrl ? '' : ' is-fallback'}"><img alt="" data-club-member-photo><i aria-hidden="true"><img alt="" src="${fallbackLogo}"></i></span><span class="club-member-copy"><small>UNITED OD ${esc(member.memberSince || '—')}</small><strong>${esc(member.nickname || member.name || 'United member')}</strong><span>${esc(member.attendanceCount || 0)}× UNITED</span></span><b aria-hidden="true">→</b>`;
      button.addEventListener('click', () => void profileViewer.openProfile(member.profileRef, { push: true, trigger: button })); root.append(button);
      if (member.photoUrl) observePhoto($('[data-club-member-photo]', button), member.photoUrl);
    }
    const profile = new URL(window.location.href).searchParams.get('profile');
    if (profile && !directProfileHandled) { directProfileHandled = true; queueMicrotask(() => void profileViewer.openProfile(profile, { push: false })); }
  }

  function showMembers({ push = true, trigger = null } = {}) {
    const modal = $('[data-club-members-modal]'); if (!modal || !modal.hidden) return;
    listRestoreFocus = trigger || document.activeElement; modal.hidden = false; document.body.classList.add('club-members-open');
    modal.querySelector('[data-club-members-close]')?.focus();
    if (push) { const url = new URL(window.location.href); url.searchParams.set('section', 'club'); url.searchParams.set('members', '1'); history.pushState({ ...(history.state || {}), clubMembers: true }, '', url); }
  }

  function hideMembers({ restore = true } = {}) {
    const modal = $('[data-club-members-modal]'); if (!modal || modal.hidden) return;
    modal.hidden = true; document.body.classList.remove('club-members-open');
    if (restore && listRestoreFocus?.isConnected) listRestoreFocus.focus(); listRestoreFocus = null;
  }

  function closeMembers() {
    const url = new URL(window.location.href);
    if (url.searchParams.has('members') && history.state?.clubMembers) { history.back(); return; }
    url.searchParams.delete('members'); history.replaceState(history.state, '', url); hideMembers();
  }

  function syncMembersHistory() { if (new URL(window.location.href).searchParams.has('members')) showMembers({ push: false }); else hideMembers(); }

  function bind() {
    if (bound) return; bound = true; profileViewer.bind();
    $('[data-open-club-members]')?.addEventListener('click', event => showMembers({ trigger: event.currentTarget }));
    $('[data-club-members-modal]')?.addEventListener('click', event => { if (event.target.closest('[data-club-members-close]')) closeMembers(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('[data-club-members-modal]')?.hidden && $('[data-club-profile-modal]')?.hidden) closeMembers(); });
    window.addEventListener('popstate', syncMembersHistory); syncMembersHistory();
  }

  function reset() { directProfileHandled = false; releaseListMedia(); profileViewer.reset(); hideMembers({ restore: false }); }
  return { bind, render: renderList, reset };
}
