export const ADMIN_VIEW_IDS = Object.freeze(['dashboard', 'reservations', 'payments', 'gallery', 'accommodation', 'event']);
export const RESERVATION_VIEW_MODES = Object.freeze(['quick', 'detail']);
export const RESERVATION_PRIMARY_FILTERS = Object.freeze(['all', 'action', 'active', 'complete']);
export const RESERVATION_DETAIL_FILTERS = Object.freeze(['pending', 'approved', 'payment', 'underpaid', 'paid', 'overpaid', 'rejected', 'cancelled']);

function actionCount(value) {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

export function adminActionCountState(value) {
  const count = actionCount(value);
  return { count, label: count > 99 ? '99+' : String(count), hidden: count === 0 };
}

export function adminModerationCounts({ communityPending = 0, historyPending = 0 } = {}) {
  const community = actionCount(communityPending);
  const history = actionCount(historyPending);
  return { community, history, total: community + history };
}

function normalized(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('cs-CZ').trim();
}

export function adminItemPayment(item = {}) {
  if (item.payment) return item.payment;
  const amountDueCzk = Number(item.amountDueCzk || 0);
  const amountPaidCzk = Number(item.amountPaidCzk || 0);
  const balanceCzk = amountDueCzk - amountPaidCzk;
  return {
    amountDueCzk,
    amountPaidCzk,
    balanceCzk,
    remainingCzk: Math.max(0, balanceCzk),
    overpaymentCzk: Math.max(0, -balanceCzk),
    status: item.paymentStatus || (balanceCzk < 0 ? 'overpaid' : balanceCzk === 0 ? (amountDueCzk === 0 ? 'not_required' : 'paid') : amountPaidCzk > 0 ? 'underpaid' : 'unpaid'),
    overdue: false,
  };
}

export function paymentNeedsAttention(item) {
  const payment = adminItemPayment(item);
  return payment.overdue === true || payment.status === 'overpaid';
}

export function reservationNeedsAction(item) {
  return item?.status === 'pending' || item?.changePending === true || item?.capacityConflict === true || paymentNeedsAttention(item);
}

export function matchesAdminSearch(item, query) {
  const needle = normalized(query);
  if (!needle) return true;
  const member = item?.member || {};
  const car = item?.carSnapshot || {};
  const payment = adminItemPayment(item);
  return normalized([
    member.name, member.nickname, member.email, member.memberCode,
    payment.variableSymbol, item?.paymentVs,
    car.nickname, car.model, car.body,
  ].filter(Boolean).join(' ')).includes(needle);
}

export function reservationMatchesFilter(item, filter) {
  const payment = adminItemPayment(item);
  if (filter === 'all') return true;
  if (filter === 'action') return reservationNeedsAction(item);
  if (filter === 'active') return item?.status === 'approved' && ['unpaid', 'underpaid'].includes(payment.status);
  if (filter === 'complete') return item?.status === 'approved' && ['paid', 'not_required'].includes(payment.status);
  if (filter === 'payment') return item?.status === 'approved' && payment.status === 'unpaid';
  if (filter === 'paid') return payment.status === 'paid';
  if (filter === 'underpaid' || filter === 'overpaid') return payment.status === filter;
  return item?.status === filter;
}

export function reservationMatchesDetailFilters(item, filters = []) {
  const selected = [...filters];
  return !selected.length || selected.some(filter => reservationMatchesFilter(item, filter));
}

export function paymentMatchesFilter(item, filter) {
  const payment = adminItemPayment(item);
  if (filter === 'all') return true;
  if (filter === 'attention') return paymentNeedsAttention(item);
  return payment.status === filter;
}

export function filterAdminReservations(items, { filter = 'all', filters = [], query = '' } = {}) {
  return (items || []).filter(item => reservationMatchesFilter(item, filter) && reservationMatchesDetailFilters(item, filters) && matchesAdminSearch(item, query));
}

export function filterAdminPayments(items, { filter = 'attention', query = '' } = {}) {
  return (items || []).filter(item => paymentMatchesFilter(item, filter) && matchesAdminSearch(item, query));
}
