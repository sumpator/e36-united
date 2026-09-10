// Frontend-only catalog. The deployed schema-v1 validator and saved unknown IDs stay intact.
import { WIDGETS as LEGACY } from './dashboard-model.js?v=20260910-admin-compact-r1';
export const COMMAND_WIDGETS = Object.freeze({
  ...LEGACY,
  approvals: {
    label: 'Schvalování',
    kind: 'command',
    sizes: ['wide', 'compact']
  },
  'reservation-summary': {
    label: 'Rezervace & ubytování',
    kind: 'command',
    sizes: ['compact', 'wide']
  },
  'payment-summary': {
    label: 'Platby',
    kind: 'command',
    sizes: ['wide', 'compact']
  },
  recent: {
    label: 'Poslední rezervace',
    kind: 'command',
    sizes: ['wide', 'compact']
  },
  mailing: {
    label: 'Mailing přehled',
    kind: 'command',
    sizes: ['compact', 'wide']
  }
});
export function commandDefaults() {
  const widgets = () => [{
    id: 'approvals',
    size: 'wide'
  }, {
    id: 'reservation-summary',
    size: 'compact'
  }, {
    id: 'payment-summary',
    size: 'wide'
  }, {
    id: 'trend',
    size: 'compact'
  }, {
    id: 'recent',
    size: 'wide'
  }];
  return {
    schemaVersion: 1,
    compositions: {
      preparation: {
        widgets: widgets(),
        quickLinks: []
      },
      onsite: {
        widgets: widgets(),
        quickLinks: ['members', 'reservations', 'paymentAttention', 'photos']
      }
    }
  };
}
// Same logical 12-column layout drives the real board and its prospective miniature.
// CSS changes only the number of viewport columns; it never rewrites preferences.
export function commandLayout(widgets) {
  return widgets.filter(w => Object.hasOwn(COMMAND_WIDGETS, w.id)).map(w => ({
    ...w,
    span: w.id === 'recent' && w.size === 'wide' ? 12 : w.size === 'wide' ? 8 : 4
  }));
}
export function commandBadges(summary) {
  const o = summary?.overview,
    a = summary?.attention;
  const sum = (...values) => values.every(Number.isFinite) ? values.reduce((n, v) => n + v, 0) : null;
  return {
    dashboard: sum(a?.reservations, o?.gallery?.pending, o?.history?.pending),
    reservations: o?.statuses?.pending,
    payments: a?.payments,
    photos: o?.gallery?.pending,
    history: o?.history?.pending,
    community: sum(o?.gallery?.pending, o?.history?.pending)
  };
}
export const BADGE_SCOPE = Object.freeze({
  dashboard: 'Vybraný ročník: unikátní rezervace pending / po splatnosti / přeplacené + globální fotky a unikátní historické žádosti',
  reservations: 'Vybraný ročník: čekající rezervace',
  payments: 'Vybraný ročník: unikátní případy po splatnosti nebo přeplatku',
  photos: 'Globálně: čekající komunitní fotografie, bez Garage',
  history: 'Globálně: unikátní žádosti s čekající účastí nebo S&S',
  community: 'Globálně: čekající komunitní fotky + unikátní historické žádosti'
});
