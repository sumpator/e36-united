export function selectPrimaryCar(cars = []) {
  return cars.find(car => car?.primary) || cars[0] || null;
}

export function deriveMemberHeroState({ cars = [], memberSince = null } = {}) {
  const car = selectPrimaryCar(cars);
  if (!car) {
    return { state: 'no-car', car: null, photoId: '', carText: 'Tvoje E36 sem patří.', cta: '', since: memberSince || null };
  }
  const carText = ['BMW E36', car.body, car.model, car.nickname, car.color].filter(Boolean).join(' · ');
  const photoId = car.photos?.[0]?.id ? String(car.photos[0].id) : '';
  return {
    state: photoId ? 'photo-loading' : 'no-photo',
    car,
    photoId,
    carText,
    cta: photoId ? '' : 'Přidat fotku auta →',
    since: memberSince || null,
  };
}

export function deriveOverviewState({ reservation = null, registrationOpen = false, plan = null, planEnabled = false, plannerWaiting = false, plannerDraft = false, plannerUnavailable = false, eventYear = null, eventName = '', formatAmount = value => String(value) } = {}) {
  if (!reservation) {
    const activePlan=plan?.status==='active';
    const draft=plannerWaiting||plannerDraft;
    const closedCopy=eventName?`Registrace na ${eventName} nyní nejsou otevřené.`:'Registrace nyní nejsou otevřené.';
    return {
      active: true,
      label: activePlan&&registrationOpen?'POTVRĎ SVOU REGISTRACI!':activePlan?'MÁŠ PŘEDBĚŽNOU REGISTRACI.':plannerUnavailable?'PŘEDBĚŽNOU REGISTRACI TEĎ NELZE OVĚŘIT':draft?(registrationOpen?'DOKONČI REGISTRACI':'DOKONČI PŘEDBĚŽNOU REGISTRACI'):(registrationOpen||planEnabled)?'REGISTRUJ SE NA UNITED':'REGISTRACE NYNÍ NEJSOU OTEVŘENÉ',
      copy: activePlan&&registrationOpen?'Registrace jsou otevřené.':activePlan?'Až otevřeme registrace, dáme Ti vědět a registraci dokončíš.':plannerUnavailable?'Spojení se serverem se nezdařilo. Stav uložené předběžné registrace teď nelze ověřit.':draft?'':registrationOpen?'':planEnabled?'Zatím přijímáme předběžné registrace.':closedCopy,
      action: activePlan?'Zobrazit registraci':plannerUnavailable?'':draft?'Pokračovat':registrationOpen||planEnabled?'Začít':'',
      openEditor: !activePlan&&!plannerUnavailable&&(draft||registrationOpen||planEnabled),
      emptyCopy: '',
    };
  }
  const labels = { approved: 'TVOJE ÚČAST JE POTVRZENÁ.', pending: reservation.changePending ? 'ZMĚNA REGISTRACE ČEKÁ NA SCHVÁLENÍ' : 'REGISTRACE ČEKÁ NA SCHVÁLENÍ.', rejected: 'REGISTRACE NEBYLA SCHVÁLENA.', cancelled: 'REGISTRACE BYLA ZRUŠENA.' };
  const copies = { approved: '', pending: reservation.changePending ? 'Změna registrace čeká na schválení. Do té doby nic nedoplácej.' : 'Registraci kontroluje United tým.', rejected: '', cancelled: '' };
  const payment = reservation.payment || null;
  const remaining = Number(payment?.remainingCzk || 0);
  const overpayment = Number(payment?.overpaymentCzk || 0);
  const approvedPayment = reservation.status === 'approved' && payment;
  const paymentLabel = approvedPayment?.status === 'underpaid' ? `DOPLATEK ${formatAmount(remaining)}`
    : approvedPayment?.status === 'unpaid' ? `K PLATBĚ ${formatAmount(remaining)}`
      : approvedPayment?.status === 'overpaid' ? `PŘEPLATEK ${formatAmount(overpayment)}`
        : approvedPayment?.status === 'paid' ? 'ZAPLACENO' : '';
  return {
    active: true,
    label: paymentLabel || labels[reservation.status] || 'AKTUÁLNÍ REGISTRACE',
    copy: approvedPayment?.status === 'overpaid' ? `U registrace evidujeme přeplatek ${formatAmount(overpayment)}. Není potřeba nic platit.` : approvedPayment && remaining > 0 ? 'Registrace je schválená. Platební údaje obsahují pouze aktuální částku k úhradě.' : copies[reservation.status] || '',
    action: approvedPayment ? 'Otevřít platbu' : 'Otevřít registraci',
    target: approvedPayment ? 'payments' : 'reservation',
    openEditor: false,
    emptyCopy: '',
  };
}

const MEMBER_RATINGS = [
  [12, 'M POWER'],
  [10, '328i'],
  [8, '325i'],
  [6, '323i'],
  [4, '320i'],
  [2, '318is'],
  [0, '316i'],
];

export function deriveMemberRating(lifetimeProgress = 0) {
  const progress = Math.max(0, Number(lifetimeProgress) || 0);
  return MEMBER_RATINGS.find(([minimum]) => progress >= minimum)?.[1] || '316i';
}
