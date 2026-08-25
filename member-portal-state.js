export function selectPrimaryCar(cars = []) {
  return cars.find(car => car?.primary) || cars[0] || null;
}

export function deriveMemberHeroState({ cars = [], memberSince = null } = {}) {
  const car = selectPrimaryCar(cars);
  if (!car) {
    return { state: 'no-car', car: null, photoId: '', carText: 'Tvoje E36 sem patří.', cta: 'Přidej první auto do garáže →', since: memberSince || null };
  }
  const carText = ['BMW E36', car.body, car.model, car.nickname].filter(Boolean).join(' · ');
  const photoId = car.photos?.[0]?.id ? String(car.photos[0].id) : '';
  return {
    state: photoId ? 'photo-loading' : 'no-photo',
    car,
    photoId,
    carText,
    cta: photoId ? 'Otevřít garáž →' : 'Přidej fotku svého auta →',
    since: memberSince || null,
  };
}

export function deriveOverviewState({ reservation = null, registrationOpen = false, plannerWaiting = false, eventYear = null, formatAmount = value => String(value) } = {}) {
  const active = Boolean(reservation || registrationOpen || plannerWaiting);
  if (!reservation) {
    return {
      active,
      label: plannerWaiting ? 'TVŮJ PLÁN JE PŘIPRAVENÝ' : registrationOpen ? 'JEŠTĚ NEMÁŠ REZERVACI' : 'REGISTRACE JE UZAVŘENÁ',
      copy: plannerWaiting ? 'Výběr z Weekend Planneru jsme uložili. Dokončíš ho tady, jakmile spustíme rezervace.' : registrationOpen ? 'Registrace je otevřená. Vytvoř si rezervaci pro aktuální United.' : 'Aktuálně nemáš rezervaci a registrace je už uzavřená.',
      action: plannerWaiting ? 'Dokončit rezervaci' : registrationOpen ? 'Vytvořit rezervaci' : '',
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
    action: 'Otevřít rezervaci',
    emptyCopy: '',
  };
}
