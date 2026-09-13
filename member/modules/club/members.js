import { $, esc } from '../../ui.js?v=20260902-phase3';

const fallbackLogo = 'united-logo-blue-silver-transparent.png';

export function createClubMembers({ apiBaseUrl, apiRequest, apiRequestBlob, getData, openSection }) {
  const ownedUrls = new Map();
  const photoSources = new WeakMap();
  let observer = null;
  let activeRef = '';
  let restoreFocus = null;
  let pushedProfile = false;
  let directProfileHandled = false;

  function releaseMedia(root = document) {
    const images = [...root.querySelectorAll('[data-club-member-photo]')];
    for (const image of images) {
      observer?.unobserve(image);
      image.removeAttribute('src');
      const url = ownedUrls.get(image);
      if (url) URL.revokeObjectURL(url);
      ownedUrls.delete(image);
    }
    if (root === document) {
      observer?.disconnect();
      observer = null;
    }
  }

  async function loadPrivatePhoto(image) {
    const path = photoSources.get(image);
    if (!path || image.dataset.loaded === 'true') return;
    image.dataset.loaded = 'true';
    try {
      const blob = await apiRequestBlob(path);
      if (!image.isConnected || photoSources.get(image) !== path) return;
      const url = URL.createObjectURL(blob);
      ownedUrls.set(image, url);
      image.src = url;
    } catch (error) {
      image.removeAttribute('src');
      image.closest('.club-member-photo')?.classList.add('is-fallback');
      console.warn('Club member photo unavailable', error);
    }
  }

  function observePhoto(image, path) {
    if (!image || !path) return;
    photoSources.set(image, path);
    if (!('IntersectionObserver' in window)) { void loadPrivatePhoto(image); return; }
    if (!observer) observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        observer.unobserve(entry.target);
        void loadPrivatePhoto(entry.target);
      }
    }, { rootMargin: '160px' });
    observer.observe(image);
  }

  function renderList() {
    const root = $('[data-club-members-list]');
    if (!root) return;
    releaseMedia(root);
    const members = getData().club?.clubMembers?.members || [];
    root.innerHTML = '';
    if (!members.length) {
      root.innerHTML = '<article class="club-members-empty"><img alt="" src="united-logo-blue-silver-transparent.png"><div><b>Klubové profily se právě skládají.</b><p>Jakmile členové doplní své United profily, objeví se tady.</p></div></article>';
      return;
    }
    for (const member of members) {
      const button = document.createElement('button');
      button.className = 'club-member-card';
      button.type = 'button';
      button.setAttribute('aria-label', `Otevřít klubový profil ${member.nickname || member.name}`);
      button.innerHTML = `<span class="club-member-photo${member.photoUrl ? '' : ' is-fallback'}"><img alt="" data-club-member-photo><i aria-hidden="true"><img alt="" src="${fallbackLogo}"></i></span><span class="club-member-copy"><small>UNITED OD ${esc(member.memberSince || '—')}</small><strong>${esc(member.nickname || member.name || 'United member')}</strong><span>${esc(member.attendanceCount || 0)}× UNITED</span></span><b aria-hidden="true">→</b>`;
      button.addEventListener('click', () => void openProfile(member.profileRef, { push: true, trigger: button }));
      root.append(button);
      if (member.photoUrl) observePhoto($('[data-club-member-photo]', button), member.photoUrl);
    }
    const profile = new URL(window.location.href).searchParams.get('profile');
    if (profile && !directProfileHandled) {
      directProfileHandled = true;
      queueMicrotask(() => void openProfile(profile, { push: false }));
    }
  }

  function historyMarkup(history = []) {
    return history.length ? history.map(item => `<li><strong>${esc(item.eventYear)}</strong><span>Potvrzená účast${item.showShine?.placement ? ` · S&amp;S ${esc(item.showShine.placement)}. místo` : ''}</span></li>`).join('') : '<li class="is-empty">Zatím bez potvrzené účasti.</li>';
  }

  function renderProfile(profile) {
    const content = $('[data-club-profile-content]');
    if (!content) return;
    const cars = Array.isArray(profile.cars) ? profile.cars : [];
    const gallery = Array.isArray(profile.gallery) ? profile.gallery : [];
    const achievements = Array.isArray(profile.achievements) ? profile.achievements.slice(0, 8) : [];
    content.innerHTML = `<header class="club-profile-identity"><span class="club-profile-logo"><img alt="" src="${fallbackLogo}"></span><div><small>UNITED CLUB PROFIL</small><h2 id="club-profile-title">${esc(profile.nickname || profile.name || 'United member')}</h2>${profile.name && profile.name !== profile.nickname ? `<p>${esc(profile.name)}</p>` : ''}<span>United od ${esc(profile.memberSince || '—')} · ${esc(profile.attendanceCount || 0)}× United</span></div></header><section class="club-profile-facts"><article><small>UNITED POINTS</small><strong>${esc(profile.points?.available || 0)}</strong></article><article><small>MEMBER RATING</small><strong>${esc(profile.rating?.name || '316i')}</strong></article><article><small>ACHIEVEMENTS</small><strong>${esc(achievements.length)}</strong></article></section><section><div class="club-profile-section-head"><small>VEŘEJNÁ GARÁŽ</small><h3>Auta člena.</h3></div><div class="club-profile-garage">${cars.length ? cars.map(car => `<article class="club-profile-car"><div class="club-profile-car-photo${car.photos?.[0] ? '' : ' is-fallback'}"><img alt="${esc(car.nickname || car.model || 'BMW E36')}" data-club-member-photo><i><img alt="" src="${fallbackLogo}"></i></div><div><small>${car.primary ? 'HLAVNÍ AUTO' : esc(car.body || 'BMW E36')}</small><strong>${esc(car.nickname || car.model || 'BMW E36')}</strong><span>${esc([car.model, car.body, car.year, car.color].filter(Boolean).join(' · '))}</span></div></article>`).join('') : '<p class="club-profile-empty">Garáž zatím čeká na první auto.</p>'}</div></section><section><div class="club-profile-section-head"><small>UNITED HISTORIE</small><h3>Potvrzené ročníky.</h3></div><ol class="club-profile-history">${historyMarkup(profile.history)}</ol></section><section><div class="club-profile-section-head"><small>KLUBOVÉ VÝHODY</small><h3>Dosažené stopy.</h3></div><div class="club-profile-achievements">${achievements.length ? achievements.map(item => `<span>${esc(item.name)}</span>`).join('') : '<p class="club-profile-empty">První klubová výhoda čeká na odemčení.</p>'}</div></section><section><div class="club-profile-section-head"><small>SPOLEČNÁ GALERIE</small><h3>Schválené fotografie.</h3></div><div class="club-profile-gallery">${gallery.length ? gallery.map(photo => `<a href="${esc(`${apiBaseUrl}${photo.imageUrl}`)}" target="_blank" rel="noopener"><img alt="${esc(photo.caption || `United foto ${profile.nickname || ''}`)}" loading="lazy" src="${esc(`${apiBaseUrl}${photo.imageUrl}`)}"><span>${esc(photo.caption || 'United moment')}</span></a>`).join('') : '<p class="club-profile-empty">Zatím bez schválených fotek ve společné galerii.</p>'}</div></section>`;
    const carImages = [...content.querySelectorAll('.club-profile-car [data-club-member-photo]')];
    cars.forEach((car, index) => { if (car.photos?.[0]?.imageUrl) observePhoto(carImages[index], car.photos[0].imageUrl); });
  }

  function showModal() {
    const modal = $('[data-club-profile-modal]');
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add('member-modal-open');
    $('[data-club-profile-close]', modal)?.focus();
  }

  function hideModal({ restore = true } = {}) {
    const modal = $('[data-club-profile-modal]');
    if (!modal || modal.hidden) return;
    releaseMedia(modal);
    modal.hidden = true;
    activeRef = '';
    document.body.classList.remove('member-modal-open');
    if (restore && restoreFocus?.isConnected) restoreFocus.focus();
    restoreFocus = null;
  }

  async function openProfile(ref, { push = true, trigger = null } = {}) {
    if (!ref || activeRef === ref) return;
    openSection('club');
    activeRef = ref;
    restoreFocus = trigger || document.activeElement;
    const content = $('[data-club-profile-content]');
    if (content) content.innerHTML = '<div class="club-profile-loading"><span></span><b>Načítám klubový profil…</b></div>';
    showModal();
    if (push) {
      const url = new URL(window.location.href);
      url.searchParams.set('section', 'club');
      url.searchParams.set('profile', ref);
      history.pushState({ clubProfile: true }, '', url);
      pushedProfile = true;
    }
    try {
      const payload = await apiRequest(`/api/united-club/members/${encodeURIComponent(ref)}`);
      if (activeRef !== ref) return;
      renderProfile(payload.profile || {});
    } catch (error) {
      if (activeRef !== ref) return;
      if (content) content.innerHTML = '<article class="club-profile-unavailable"><img alt="" src="united-logo-blue-silver-transparent.png"><h2 id="club-profile-title">Profil není dostupný.</h2><p>Člen může mít klubový profil skrytý nebo už není aktivní.</p></article>';
    }
  }

  function closeProfile() {
    if (!activeRef) return;
    if (pushedProfile && new URL(window.location.href).searchParams.has('profile')) {
      pushedProfile = false;
      history.back();
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('profile');
    history.replaceState(null, '', url);
    hideModal();
  }

  function bind() {
    $('[data-club-profile-modal]')?.addEventListener('click', event => {
      if (event.target.closest('[data-club-profile-close]')) closeProfile();
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && activeRef) closeProfile(); });
    window.addEventListener('popstate', () => {
      const ref = new URL(window.location.href).searchParams.get('profile');
      if (ref) void openProfile(ref, { push: false });
      else hideModal();
    });
  }

  function reset() {
    directProfileHandled = false;
    pushedProfile = false;
    hideModal({ restore: false });
  }

  return { bind, render: renderList, reset };
}
