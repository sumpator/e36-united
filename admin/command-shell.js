import { commandBadges, BADGE_SCOPE } from './command-model.js?v=20260912-reservation-detail-ux-r1';
import { adminState } from './state.js?v=20260912-reservation-detail-ux-r1';
import {commandIcon} from './command-icons.js?v=20260912-reservation-detail-ux-r1';
const navButton = (id, label) => `<button data-portal-target="${id}" type="button"><span class="command-nav-icon" aria-hidden="true">${commandIcon(id)}</span><span>${label}</span>${Object.hasOwn(BADGE_SCOPE, id) ? `<b data-command-badge="${id}" hidden></b>` : ''}</button>`;
export function initializeCommandShell() {
  for (const nav of document.querySelectorAll('.admin-section-nav,.portal-nav-sheet-list')) {
    nav.innerHTML = navButton('dashboard', 'Přehled') + navButton('reservations', 'Rezervace') + navButton('payments', 'Platby') + `<button type="button" data-community-toggle aria-expanded="false"><span class="command-nav-icon" aria-hidden="true">${commandIcon('community')}</span><span>Komunita</span><b data-command-badge="community" hidden></b><span aria-hidden="true">⌄</span></button><div data-community-links hidden>${[['members', 'Členové'], ['photos', 'Fotky'], ['club', 'Historie & S&S']].map(([id, label]) => `<button type="button" data-admin-jump="${id}"><span class="command-nav-icon" aria-hidden="true">${commandIcon(id === 'club' ? 'history' : id)}</span><span>${label}</span>${['photos', 'club'].includes(id) ? `<b data-command-badge="${id === 'club' ? 'history' : id}" hidden></b>` : ''}</button>`).join('')}</div>` + navButton('mailing', 'Mailing') + navButton('settings', 'Nastavení');
  }
  const header = document.querySelector('.admin-header .nav');
  const title = document.createElement('span');
  title.className = 'command-product';
  title.textContent = 'United Command Center';
  header.append(title);
  header.append(document.querySelector('[data-event-select]').closest('label'), document.querySelector('[data-member-search-form]'));
  const freshness = document.createElement('p');
  freshness.dataset.adminFreshness = '';
  freshness.role = 'status';
  header.append(freshness);
  header.append(document.querySelector('.admin-hero-actions'));
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !document.querySelector('dialog[open]')) {
      event.preventDefault();
      document.querySelector('[data-member-search]').focus();
    }
  });
}
export function renderCommandShell() {
  const values = commandBadges(adminState.summary),
    source = adminState.resourceStates.summary;
  const fresh = source?.state === 'fresh' && !document.hidden && navigator.onLine && Date.now() - source.lastSuccess <= 300000;
  for (const node of document.querySelectorAll('[data-command-badge]')) {
    const key = node.dataset.commandBadge,
      value = values[key];
    node.hidden = Number.isFinite(value) && value === 0;
    node.textContent = Number.isFinite(value) ? String(value) : '—';
    node.dataset.stale = String(!fresh);
    node.parentElement.title = BADGE_SCOPE[key] + (fresh ? '' : ' · Zastaralé / nedostupné; nejde o potvrzený aktuální stav');
    node.setAttribute('aria-label', node.parentElement.title + ': ' + node.textContent);
  }
  const event = adminState.events.find(e => e.id === adminState.selectedEventId),
    meta = document.querySelector('[data-command-event-meta]');
  if (meta) meta.textContent = [event?.isCurrent ? 'AKTUÁLNÍ' : 'VYBRANÝ ROČNÍK', event?.venueName, event?.eventEndAt ? 'Konec: ' + event.eventEndAt : null].filter(Boolean).join(' · ');
  const title = document.querySelector('[data-command-event-title]');
  if (title) title.textContent = event?.title || `United ${event?.year || '—'}`;
}
