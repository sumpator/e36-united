// A visual hint only: native scrolling, keyboard controls and selection remain unchanged.
export function initScrollAffordance(scroller) {
  if (!scroller || scroller.dataset.scrollHintReady) return;
  scroller.dataset.scrollHintReady = 'true';
  const host = scroller.parentElement;
  host.classList.add('scroll-hint-host');
  const hint = document.createElement('span');
  hint.className = 'scroll-hint';
  hint.setAttribute('aria-hidden', 'true');
  host.append(hint);
  const update = () => {
    const overflow = scroller.scrollWidth > scroller.clientWidth + 3;
    const before = overflow && scroller.scrollLeft > 3;
    const after = overflow && scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 3;
    host.classList.toggle('scroll-more-after', after);
    host.classList.toggle('scroll-more-before', before);
    hint.hidden = !overflow;
    hint.textContent = after ? 'Posuň →' : before ? '← Posuň' : '';
  };
  scroller.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  const observer = new ResizeObserver(update);
  observer.observe(scroller);
  // Child dimensions can change after fonts/images load without resizing the rail.
  scroller.addEventListener('load', update, true);
  document.fonts?.ready.then(update);
  requestAnimationFrame(update);
}
