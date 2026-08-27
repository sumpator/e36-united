export const ADMIN_VIEW_IDS = Object.freeze(['dashboard', 'reservations', 'payments', 'gallery', 'accommodation', 'event']);
export const RESERVATION_VIEW_MODES = Object.freeze(['quick', 'detail']);

function normalized(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('cs-CZ').trim();
}

export function adminItemPayment(item = {}) {
  if (item.payment) return item.payment;
  const amountDueCzk = Number(item.amountDueCzk || 0);
  const amountPaidCzk = Number(item.amountPaidCzk || 0);
  return {
    amountDueCzk,
    amountPaidCzk,
    remainingCzk: Math.max(0, amountDueCzk - amountPaidCzk),
    status: item.paymentStatus || (amountDueCzk <= 0 ? 'not_required' : amountPaidCzk >= amountDueCzk ? 'paid' : amountPaidCzk > 0 ? 'underpaid' : 'unpaid'),
    overdue: false,
  };
}

export function paymentNeedsAttention(item) {
  const payment = adminItemPayment(item);
  return payment.overdue === true || payment.status === 'underpaid' || payment.status === 'overpaid' || (payment.status === 'unpaid' && Number(payment.amountDueCzk || 0) > 0);
}

export function reservationNeedsAction(item) {
  return item?.status === 'pending' || (item?.status === 'approved' && paymentNeedsAttention(item));
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
  if (filter === 'payment') return item?.status === 'approved' && Number(payment.remainingCzk || 0) > 0;
  if (filter === 'paid') return payment.status === 'paid';
  return item?.status === filter;
}

export function paymentMatchesFilter(item, filter) {
  const payment = adminItemPayment(item);
  if (filter === 'all') return true;
  if (filter === 'attention') return paymentNeedsAttention(item);
  return payment.status === filter;
}

export function filterAdminReservations(items, { filter = 'all', query = '' } = {}) {
  return (items || []).filter(item => reservationMatchesFilter(item, filter) && matchesAdminSearch(item, query));
}

export function filterAdminPayments(items, { filter = 'attention', query = '' } = {}) {
  return (items || []).filter(item => paymentMatchesFilter(item, filter) && matchesAdminSearch(item, query));
}
