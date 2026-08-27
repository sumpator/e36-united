export const IMAGE_UPLOAD_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
export const IMAGE_UPLOAD_MAX_BYTES = 12 * 1024 * 1024;

export function selectImageFiles(fileList, { maxFiles = 1, maxBytes = IMAGE_UPLOAD_MAX_BYTES, types = IMAGE_UPLOAD_TYPES } = {}) {
  const allowed = new Set(types);
  const source = Array.from(fileList || []);
  const valid = source.filter(file => allowed.has(file?.type) && Number(file?.size || 0) > 0 && Number(file.size) <= maxBytes);
  return {
    files: valid.slice(0, Math.max(0, maxFiles)),
    invalidType: source.some(file => !allowed.has(file?.type)),
    tooLarge: source.some(file => allowed.has(file?.type) && Number(file?.size || 0) > maxBytes),
    truncated: valid.length > maxFiles,
  };
}

export function createImagePreviewController(container, { showNames = true } = {}) {
  let objectUrls = [];

  function clear() {
    for (const url of objectUrls) URL.revokeObjectURL(url);
    objectUrls = [];
    container?.replaceChildren();
  }

  function render(files) {
    clear();
    if (!container) return;
    for (const file of files || []) {
      if (!IMAGE_UPLOAD_TYPES.includes(file?.type)) continue;
      const url = URL.createObjectURL(file);
      objectUrls.push(url);
      const figure = document.createElement('figure');
      figure.className = 'image-selection-preview-item';
      const image = document.createElement('img');
      image.src = url;
      image.alt = '';
      image.decoding = 'async';
      figure.append(image);
      if (showNames) {
        const caption = document.createElement('figcaption');
        caption.textContent = file.name;
        figure.append(caption);
      }
      container.append(figure);
    }
  }

  window.addEventListener('pagehide', clear, { once: true });
  return { clear, render };
}
