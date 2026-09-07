const labels = { garage: 'Garáž', reservation: 'Rezervace a platby', planner: 'Uložený plán', club: 'United Club', photos: 'Moje fotky' };

// Hide unavailable domain content, not its navigation. Never describe a failed read as empty.
export function renderMemberAvailability(errors, retry, { hasHandoff = false } = {}) {
  document.querySelectorAll('[data-domain-retry-state]').forEach(node => node.remove());
  document.querySelectorAll('.domain-unavailable').forEach(node => node.classList.remove('domain-unavailable'));
  const add = (root, key, block = false) => {
    if (!root) return;
    if (block) root.classList.add('domain-unavailable');
    const state = document.createElement('aside'); state.dataset.domainRetryState = key;
    state.className = 'member-domain-error'; state.setAttribute('role', 'status');
    const copy = document.createElement('p'); copy.textContent = `${labels[key]} teď nelze načíst. Tvoje přihlášení zůstává aktivní.`;
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Zkusit znovu';
    button.addEventListener('click', async () => { button.disabled = true; try { await retry(key); } finally { button.disabled = false; } });
    state.append(copy, button); root.prepend(state);
  };
  for (const key of Object.keys(errors)) {
    const panel = key === 'planner' ? 'reservation' : key;
    // Planner failure blocks editing until the saved plan can be checked (do not overwrite it).
    add(document.querySelector(`[data-member-panel="${panel}"]`), key, key !== 'planner' || !hasHandoff);
    add(document.querySelector('[data-member-panel="overview"]'), key);
  }
  if (errors.reservation) add(document.querySelector('[data-member-panel="payments"]'), 'reservation', true);
  if (errors.garage) add(document.querySelector('[data-member-panel="reservation"]'), 'garage', true);
  document.body.classList.toggle('member-garage-unavailable', Boolean(errors.garage));
  document.body.classList.toggle('member-club-unavailable', Boolean(errors.club));
  document.body.classList.toggle('member-process-unavailable', Boolean(errors.reservation || (errors.planner && !hasHandoff)));
}
