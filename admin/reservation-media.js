import { apiMedia } from './api.js?v=20260909-admin-member-modal-r4';
let observer = null,
  controller = null,
  objectUrl = null,
  currentPath = null,
  generation = 0;
export function clearReservationMedia() {
  generation++;
  observer?.disconnect();
  controller?.abort();
  controller = null;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  currentPath = null;
}
export function showReservationMedia(image, path) {
  observer?.disconnect();
  if (!image || !path) {
    clearReservationMedia();
    return;
  }
  if (currentPath === path && objectUrl) {
    image.src = objectUrl;
    return;
  }
  clearReservationMedia();
  currentPath = path;
  const ownGeneration = generation;
  observer = new IntersectionObserver(entries => {
    if (!entries.some(e => e.isIntersecting)) return;
    observer.disconnect();
    controller = new AbortController();
    void apiMedia(path, {
      signal: controller.signal
    }).then(blob => {
      if (generation !== ownGeneration || !image.isConnected) return;
      objectUrl = URL.createObjectURL(blob);
      image.src = objectUrl;
    }).catch(() => {
      if (image.isConnected) image.alt = 'Fotografie vybraného vozu není dostupná';
    });
  });
  observer.observe(image);
  image.onerror = () => {
    image.alt = 'Fotografie vybraného vozu není dostupná';
    image.removeAttribute('src');
  };
}
