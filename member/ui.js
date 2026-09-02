export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function toast(message) {
  const element = $('[data-toast]');
  if (!element) return;
  element.textContent = message;
  element.classList.add('is-visible');
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => element.classList.remove('is-visible'), 3200);
}

export function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

export function uid() {
  return crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 10);
}

export function setButtonBusy(button, busy, label) {
  if (!button) return;
  if (busy) {
    button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    if (label) button.textContent = label;
  } else {
    button.disabled = false;
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
  }
}
