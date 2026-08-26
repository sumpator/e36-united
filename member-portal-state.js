export function selectPrimaryCar(cars = []) {
  return cars.find(car => car?.primary) || cars[0] || null;
}

export function deriveMemberHeroState({ cars = [], memberSince = null } = {}) {
  const car = selectPrimaryCar(cars);
  if (!car) {
    return { state: 'no-car', car: null, photoId: '', carText: 'Tvoje E36 sem patří.', cta: 'Přidat první auto →', since: memberSince || null };
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

export function deriveOverviewState({ reservation = null, registrationOpen = false, plannerWaiting = false, plannerUnavailable = false, eventYear = null, formatAmount = value => String(value) } = {}) {
  const active = Boolean(reservation || registrationOpen || plannerWaiting || plannerUnavailable);
  if (!reservation) {
    return {
      active,
      label: plannerWaiting ? 'TVŮJ PLÁN JE PŘIPRAVENÝ' : plannerUnavailable ? 'PLÁN TEĎ NELZE OVĚŘIT' : registrationOpen ? 'JEŠTĚ NEMÁŠ REZERVACI' : 'REGISTRACE JE UZAVŘENÁ',
      copy: plannerWaiting ? 'Výběr z Weekend Planneru jsme uložili. Dokončíš ho tady, jakmile spustíme rezervace.' : plannerUnavailable ? 'Spojení se serverem se nezdařilo. Nevyhodnocujeme to jako stav bez plánu; zkus načtení zopakovat.' : registrationOpen ? 'Registrace je otevřená. Vytvoř si rezervaci pro aktuální United.' : 'Aktuálně nemáš rezervaci a registrace je už uzavřená.',
      action: plannerWaiting ? 'Dokončit rezervaci' : plannerUnavailable ? '' : registrationOpen ? 'Vytvořit rezervaci' : '',
      emptyCopy: eventYear ? `United ${eventYear}: registrace je uzavřená a nemáš žádnou aktivní rezervaci.` : 'Aktuálně tu není nic, co potřebuje tvoji akci.',
    };
  }
  const labels = { approved: 'REZERVACE SCHVÁLENA', pending: 'ČEKÁ NA SCHVÁLENÍ', rejected: 'REZERVACE ZAMÍTNUTA', cancelled: 'REZERVACE ZRUŠENA' };
  const copies = { approved: 'Máš potvrzeno. Tvoje rezervace je schválená United týmem.', pending: 'Rezervaci máme. United tým ji ještě zkontroluje.', rejected: 'Tvoje rezervace nebyla schválena.', cancelled: 'Tvoje rezervace je zrušená.' };
  const remaining = Number(reservation.payment?.remainingCzk || 0);
  return {
    active: true,
    label: reservation.status === 'approved' && remaining > 0 ? `ZBÝVÁ UHRADIT ${formatAmount(remaining)}` : labels[reservation.status] || 'AKTUÁLNÍ REZERVACE',
    copy: reservation.status === 'approved' && remaining > 0 ? 'Rezervace je schválená. Platební údaje najdeš v detailu Sraz & Ubytování.' : copies[reservation.status] || 'Otevři detail aktuální rezervace.',
    action: reservation.status === 'approved' && remaining > 0 ? 'Přejít na platbu' : 'Otevřít rezervaci',
    target: reservation.status === 'approved' && remaining > 0 ? 'payments' : 'reservation',
    emptyCopy: '',
  };
}
