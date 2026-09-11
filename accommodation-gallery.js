function resolvePhotoUrl(value, apiBaseUrl = '') {
  const source = String(value || '');
  if (!source || /^(?:https?:|data:|blob:)/i.test(source)) return source;
  return `${String(apiBaseUrl).replace(/\/$/, '')}${source.startsWith('/') ? source : `/${source}`}`;
}

export function accommodationPhotos(option = {}) {
  const source = Array.isArray(option.photos) ? option.photos : [];
  const photos = source.filter(photo => photo && photo.imageUrl).map((photo, index) => ({
    id: String(photo.id || index),
    role: photo.role === 'cover' ? 'cover' : 'additional',
    imageUrl: String(photo.imageUrl),
  }));
  if (!photos.length && option.visual?.hasCustomPhoto && option.visual.imageUrl) {
    photos.push({ id: 'cover', role: 'cover', imageUrl: String(option.visual.imageUrl) });
  }
  return photos.slice(0, 5);
}

let dialog;
let dialogImage;
let dialogCounter;
let dialogDots;
let previousButton;
let nextButton;
let activePhotos = [];
let activeIndex = 0;
let activeName = '';
let returnFocus = null;
let activeApiBaseUrl = '';
let pointerStart = null;

function closeGallery() {
  if (!dialog?.open) return;
  dialog.close();
}

function renderPhoto() {
  const photo = activePhotos[activeIndex];
  if (!photo) return;
  dialogImage.src = resolvePhotoUrl(photo.imageUrl, activeApiBaseUrl);
  dialogImage.alt = `${activeName || 'Ubytování'} – fotografie ${activeIndex + 1} z ${activePhotos.length}`;
  dialogCounter.textContent = `${activeIndex + 1} / ${activePhotos.length}`;
  const multiple = activePhotos.length > 1;
  previousButton.hidden = !multiple;
  nextButton.hidden = !multiple;
  dialogDots.innerHTML = multiple ? activePhotos.map((_, index) => `<button type="button" aria-label="Zobrazit fotografii ${index + 1}" aria-current="${index === activeIndex ? 'true' : 'false'}" data-accommodation-gallery-dot="${index}"></button>`).join('') : '';
}

function moveGallery(direction) {
  if (activePhotos.length < 2) return;
  activeIndex = (activeIndex + direction + activePhotos.length) % activePhotos.length;
  renderPhoto();
}

function ensureDialog() {
  if (dialog) return;
  dialog = document.createElement('dialog');
  dialog.className = 'accommodation-gallery-dialog';
  dialog.setAttribute('aria-label', 'Fotografie ubytování');
  dialog.innerHTML = `<div class="accommodation-gallery-shell"><button class="accommodation-gallery-close" type="button" aria-label="Zavřít galerii">×</button><button class="accommodation-gallery-arrow accommodation-gallery-arrow--previous" type="button" aria-label="Předchozí fotografie">‹</button><figure><img alt=""/><figcaption><span></span><div class="accommodation-gallery-dots"></div></figcaption></figure><button class="accommodation-gallery-arrow accommodation-gallery-arrow--next" type="button" aria-label="Další fotografie">›</button></div>`;
  document.body.append(dialog);
  dialogImage = dialog.querySelector('img');
  dialogCounter = dialog.querySelector('figcaption span');
  dialogDots = dialog.querySelector('.accommodation-gallery-dots');
  previousButton = dialog.querySelector('.accommodation-gallery-arrow--previous');
  nextButton = dialog.querySelector('.accommodation-gallery-arrow--next');
  dialog.querySelector('.accommodation-gallery-close').addEventListener('click', closeGallery);
  previousButton.addEventListener('click', () => moveGallery(-1));
  nextButton.addEventListener('click', () => moveGallery(1));
  dialogDots.addEventListener('click', event => {
    const dot = event.target.closest('[data-accommodation-gallery-dot]');
    if (!dot) return;
    activeIndex = Number(dot.dataset.accommodationGalleryDot || 0);
    renderPhoto();
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) closeGallery(); });
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeGallery(); });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('accommodation-gallery-open');
    const focus = returnFocus;
    returnFocus = null;
    focus?.focus({ preventScroll: true });
  });
  dialog.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch') pointerStart = { x: event.clientX, y: event.clientY };
  });
  dialog.addEventListener('pointerup', event => {
    if (!pointerStart || event.pointerType !== 'touch') return;
    const dx = event.clientX - pointerStart.x, dy = event.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) moveGallery(dx < 0 ? 1 : -1);
  });
}

export function openAccommodationGallery(option = {}, trigger, { apiBaseUrl = '' } = {}) {
  const photos = accommodationPhotos(option);
  if (!photos.length) return false;
  ensureDialog();
  activePhotos = photos;
  activeIndex = 0;
  activeName = String(option.name || 'Ubytování');
  activeApiBaseUrl = apiBaseUrl;
  returnFocus = trigger || document.activeElement;
  renderPhoto();
  document.body.classList.add('accommodation-gallery-open');
  dialog.showModal();
  dialog.querySelector('.accommodation-gallery-close').focus({ preventScroll: true });
  return true;
}

export function bindAccommodationGalleryTrigger(trigger, option = {}, settings = {}) {
  if (!trigger) return;
  const photos = accommodationPhotos(option);
  trigger._accommodationGalleryOption = option;
  trigger._accommodationGallerySettings = settings;
  trigger.classList.toggle('has-accommodation-gallery', photos.length > 0);
  trigger.setAttribute('aria-disabled', String(!photos.length));
  trigger.tabIndex = photos.length ? 0 : -1;
  if (trigger.dataset.accommodationGalleryBound === 'true') return;
  trigger.dataset.accommodationGalleryBound = 'true';
  const open = event => {
    if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
    if (event.type === 'keydown') event.preventDefault();
    openAccommodationGallery(trigger._accommodationGalleryOption, trigger, trigger._accommodationGallerySettings);
  };
  trigger.addEventListener('click', open);
  trigger.addEventListener('keydown', open);
}

export function accommodationGalleryCue(photoCount) {
  return Number(photoCount || 0) > 0 ? `<span class="accommodation-gallery-cue"><span aria-hidden="true">▧</span> Zobrazit fotografie</span>` : '';
}
