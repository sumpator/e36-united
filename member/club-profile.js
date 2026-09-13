const fallbackLogo = 'united-logo-blue-silver-transparent.png';

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

function focusableElements(root) {
  return [...root.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
    .filter(element => !element.hidden && element.getClientRects().length);
}

export function createClubProfileViewer({ apiBaseUrl, apiRequest, apiRequestBlob, modalSelector = '[data-club-profile-modal]', beforeOpen = () => {} }) {
  const mediaUrls = new Map();
  const mediaRequests = new Map();
  const mediaPaths = new WeakMap();
  let observer = null;
  let generation = 0;
  let activeRef = '';
  let restoreFocus = null;
  let restoreScroll = null;
  let bound = false;

  const modal = () => document.querySelector(modalSelector);
  const content = () => modal()?.querySelector('[data-club-profile-content]');

  function releaseMedia() {
    generation += 1;
    observer?.disconnect();
    observer = null;
    const root = modal();
    root?.querySelectorAll('[data-club-profile-private-photo]').forEach(image => image.remove());
    for (const url of mediaUrls.values()) URL.revokeObjectURL(url);
    mediaUrls.clear();
    mediaRequests.clear();
  }

  async function privatePhotoUrl(path) {
    if (mediaUrls.has(path)) return mediaUrls.get(path);
    if (mediaRequests.has(path)) return mediaRequests.get(path);
    const requestGeneration = generation;
    const request = apiRequestBlob(path).then(blob => {
      if (requestGeneration !== generation) throw new Error('stale_club_profile_media');
      if (mediaUrls.has(path)) return mediaUrls.get(path);
      const url = URL.createObjectURL(blob);
      mediaUrls.set(path, url);
      return url;
    }).finally(() => mediaRequests.delete(path));
    mediaRequests.set(path, request);
    return request;
  }

  async function loadPrivatePhoto(image) {
    const path = mediaPaths.get(image);
    if (!path || image.dataset.loaded === 'true') return;
    image.dataset.loaded = 'true';
    try {
      const url = await privatePhotoUrl(path);
      if (!image.isConnected || mediaPaths.get(image) !== path) return;
      image.src = url;
      image.closest('[data-photo-shell]')?.classList.remove('is-fallback');
    } catch (error) {
      if (error.message !== 'stale_club_profile_media') console.warn('Club profile photo unavailable', error);
    }
  }

  function attachPrivatePhoto(image, path, { eager = false } = {}) {
    if (!image || !path) return;
    mediaPaths.set(image, path);
    if (eager || !('IntersectionObserver' in window)) { void loadPrivatePhoto(image); return; }
    if (!observer) observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        observer.unobserve(entry.target);
        void loadPrivatePhoto(entry.target);
      }
    }, { rootMargin: '180px' });
    observer.observe(image);
  }

  function historyMarkup(history = []) {
    return history.length
      ? history.map(item => `<li><strong>${escapeHtml(item.eventYear)}</strong><span>Potvrzená účast${item.showShine?.placement ? ` · S&amp;S ${escapeHtml(item.showShine.placement)}. místo` : ''}</span></li>`).join('')
      : '<li class="is-empty">Zatím bez potvrzené účasti.</li>';
  }

  function renderProfile(profile = {}) {
    const root = content();
    if (!root) return;
    releaseMedia();
    const cars = Array.isArray(profile.cars) ? profile.cars : [];
    const gallery = Array.isArray(profile.gallery) ? profile.gallery : [];
    const achievements = Array.isArray(profile.achievements) ? profile.achievements.slice(0, 8) : [];
    const heroCar = cars.find(car => car.primary) || cars[0] || null;
    const heroPhoto = heroCar?.photos?.[0]?.imageUrl || '';
    const displayName = profile.nickname || profile.name || 'United member';
    root.innerHTML = `<header class="club-profile-identity">
      <span class="club-profile-hero${heroPhoto ? '' : ' is-fallback'}" data-photo-shell><img alt="${escapeHtml(heroCar?.nickname || heroCar?.model || displayName)}" data-club-profile-private-photo><i aria-hidden="true"><img alt="" src="${fallbackLogo}"></i></span>
      <div><small>UNITED CLUB PROFIL</small><h2 id="club-profile-title">${escapeHtml(displayName)}</h2>${profile.name && profile.name !== profile.nickname ? `<p>${escapeHtml(profile.name)}</p>` : ''}
      <div class="club-profile-identity-facts"><span><b>United od</b>${escapeHtml(profile.memberSince || '—')}</span><span><b>Účasti</b>${escapeHtml(profile.attendanceCount || 0)}×</span><span><b>United Points</b>${escapeHtml(profile.points?.available || 0)}</span><span><b>Stav výhod</b>${escapeHtml(profile.rating?.name || '316i')}</span></div></div>
    </header>
    <section class="club-profile-primary-section" data-club-profile-gallery><div class="club-profile-section-head"><small>FOTKY ČLENA</small><h3>United v obrazech.</h3></div><div class="club-profile-gallery">${gallery.length ? gallery.map(photo => {
      const url = `${apiBaseUrl}${photo.imageUrl}`;
      const caption = photo.caption || `United foto ${displayName}`;
      return `<button aria-label="Otevřít ${escapeHtml(caption)}" data-caption="${escapeHtml(caption)}" data-full="${escapeHtml(url)}" data-lightbox type="button"><img alt="${escapeHtml(caption)}" loading="lazy" src="${escapeHtml(url)}"><span>${escapeHtml(photo.caption || 'United moment')}</span></button>`;
    }).join('') : '<p class="club-profile-empty">Zatím bez schválených fotek ve společné galerii.</p>'}</div></section>
    <section class="club-profile-primary-section" data-club-profile-garage><div class="club-profile-section-head"><small>GARÁŽ</small><h3>Auta člena.</h3></div><div class="club-profile-garage">${cars.length ? cars.map(car => `<article class="club-profile-car"><div class="club-profile-car-photo${car.photos?.[0] ? '' : ' is-fallback'}" data-photo-shell><img alt="${escapeHtml(car.nickname || car.model || 'BMW E36')}" data-club-profile-private-photo loading="lazy"><i aria-hidden="true"><img alt="" src="${fallbackLogo}"></i></div><div><small>${car.primary ? 'HLAVNÍ AUTO' : escapeHtml(car.body || 'BMW E36')}</small><strong>${escapeHtml(car.nickname || car.model || 'BMW E36')}</strong><span>${escapeHtml([car.model, car.body, car.year, car.color].filter(Boolean).join(' · '))}</span></div></article>`).join('') : '<p class="club-profile-empty">Garáž zatím čeká na první auto.</p>'}</div></section>
    <details class="club-profile-secondary"><summary>Historie, body a výhody <span aria-hidden="true">＋</span></summary><div><section><div class="club-profile-section-head"><small>UNITED HISTORIE</small><h3>Potvrzené ročníky.</h3></div><ol class="club-profile-history">${historyMarkup(profile.history)}</ol></section><section><div class="club-profile-section-head"><small>KLUBOVÉ VÝHODY</small><h3>Dosažené stopy.</h3></div><div class="club-profile-achievements">${achievements.length ? achievements.map(item => `<span>${escapeHtml(item.name)}</span>`).join('') : '<p class="club-profile-empty">První klubová výhoda čeká na odemčení.</p>'}</div></section></div></details>`;

    const privateImages = [...root.querySelectorAll('[data-club-profile-private-photo]')];
    if (heroPhoto) attachPrivatePhoto(privateImages[0], heroPhoto, { eager: true });
    let cardIndex = 1;
    for (const car of cars) {
      if (car.photos?.[0]?.imageUrl) attachPrivatePhoto(privateImages[cardIndex], car.photos[0].imageUrl);
      cardIndex += 1;
    }
  }

  function showModal() {
    const root = modal();
    if (!root) return;
    root.hidden = false;
    document.body.classList.add('club-profile-open');
    root.querySelector('[data-club-profile-close]')?.focus();
  }

  function hideModal({ restore = true } = {}) {
    const root = modal();
    if (!root || root.hidden) return;
    releaseMedia();
    root.hidden = true;
    activeRef = '';
    document.body.classList.remove('club-profile-open');
    if (restore && restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
    if (restore && restoreScroll) window.scrollTo({ left: restoreScroll.x, top: restoreScroll.y, behavior: 'instant' });
    restoreFocus = null;
    restoreScroll = null;
  }

  async function openProfile(ref, { push = true, trigger = null } = {}) {
    if (!ref || activeRef === ref) return;
    beforeOpen();
    activeRef = ref;
    restoreFocus = trigger || document.activeElement;
    restoreScroll = { x: window.scrollX, y: window.scrollY };
    const root = content();
    if (root) root.innerHTML = '<div class="club-profile-loading"><span></span><b>Načítám klubový profil…</b></div>';
    showModal();
    if (push) {
      const url = new URL(window.location.href);
      url.searchParams.set('profile', ref);
      history.pushState({ ...(history.state || {}), clubProfileRef: ref }, '', url);
    }
    try {
      const payload = await apiRequest(`/api/united-club/members/${encodeURIComponent(ref)}`);
      if (activeRef === ref) renderProfile(payload.profile || {});
    } catch {
      if (activeRef !== ref || !root) return;
      root.innerHTML = '<article class="club-profile-unavailable"><img alt="" src="united-logo-blue-silver-transparent.png"><h2 id="club-profile-title">Profil není dostupný.</h2><p>Člen může mít klubový profil skrytý nebo už není aktivní.</p></article>';
    }
  }

  function closeProfile() {
    if (!activeRef) return;
    const url = new URL(window.location.href);
    if (url.searchParams.has('profile') && history.state?.clubProfileRef === activeRef) { history.back(); return; }
    url.searchParams.delete('profile');
    history.replaceState(history.state, '', url);
    hideModal();
  }

  function syncFromHistory() {
    const ref = new URL(window.location.href).searchParams.get('profile');
    if (ref) void openProfile(ref, { push: false });
    else hideModal();
  }

  function bind() {
    if (bound) return;
    bound = true;
    modal()?.addEventListener('click', event => {
      if (event.target.closest('[data-club-profile-close]')) closeProfile();
    });
    document.addEventListener('keydown', event => {
      if (!activeRef) return;
      if (event.key === 'Escape') {
        if (document.querySelector('.lightbox.open,[data-member-gallery-lightbox]:not([hidden])')) return;
        event.preventDefault();
        closeProfile();
      }
      if (event.key === 'Tab') {
        const root = modal();
        const focusable = root ? focusableElements(root) : [];
        if (!focusable.length) return;
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }, true);
    window.addEventListener('popstate', syncFromHistory);
  }

  function reset() { hideModal({ restore: false }); }

  return { bind, closeProfile, openProfile, renderProfile, reset, syncFromHistory };
}
