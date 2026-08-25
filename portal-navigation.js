const focusableSelector = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function initPortalNavigation({ root, onSelect }) {
  if (!root) return null;

  const tablist = root.querySelector('[data-portal-tablist]');
  const openButton = root.querySelector('[data-portal-menu-open]');
  const sheet = root.querySelector('[data-portal-sheet]');
  const dialog = sheet?.querySelector('[data-portal-sheet-dialog]');
  let returnFocus = null;
  let currentTarget = null;
  const updateOverflowHint = () => root.classList.toggle('has-overflow', Boolean(tablist && tablist.scrollWidth > tablist.clientWidth + 2));

  const sync = (target, { scroll = true } = {}) => {
    const changed = currentTarget !== target;
    currentTarget = target;
    updateOverflowHint();
    root.querySelectorAll('[data-portal-target]').forEach((control) => {
      const active = control.dataset.portalTarget === target;
      control.classList.toggle('is-active', active);
      if (active) control.setAttribute('aria-current', 'page');
      else control.removeAttribute('aria-current');
    });

    if (!scroll || !changed || !window.matchMedia('(max-width: 1050px)').matches) return;
    const activeTab = [...(tablist?.querySelectorAll('[data-portal-target]') || [])].find((control) => control.dataset.portalTarget === target);
    activeTab?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

  const close = ({ restoreFocus = true } = {}) => {
    if (!sheet || sheet.hidden) return;
    sheet.hidden = true;
    openButton?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('portal-sheet-open');
    if (restoreFocus) returnFocus?.focus?.();
    returnFocus = null;
  };

  const open = () => {
    if (!sheet) return;
    returnFocus = document.activeElement;
    sheet.hidden = false;
    openButton?.setAttribute('aria-expanded', 'true');
    document.body.classList.add('portal-sheet-open');
    requestAnimationFrame(() => dialog?.querySelector(focusableSelector)?.focus());
  };

  openButton?.addEventListener('click', open);
  sheet?.addEventListener('click', (event) => {
    if (event.target.closest('[data-portal-sheet-close]')) {
      close();
      return;
    }
    const control = event.target.closest('[data-portal-target]');
    if (!control) return;
    event.preventDefault();
    onSelect?.(control.dataset.portalTarget);
    sync(control.dataset.portalTarget);
    close();
  });

  document.addEventListener('keydown', (event) => {
    if (!sheet || sheet.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab' || !dialog) return;
    const focusable = [...dialog.querySelectorAll(focusableSelector)].filter((element) => element.getClientRects().length);
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  window.addEventListener('resize', () => {
    updateOverflowHint();
    if (!window.matchMedia('(max-width: 1050px)').matches) close({ restoreFocus: false });
  });
  requestAnimationFrame(updateOverflowHint);

  return { sync, open, close };
}
