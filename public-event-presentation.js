function datePart(value) {
  const text = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? { text, date } : null;
}

export function nextEventPresentation(event, today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' })) {
  const start = datePart(event?.startsOn), end = datePart(event?.endsOn);
  if (!start && !end) return null;
  if ((end || start).text < today || (start && end && end.text < start.text)) return null;
  const format = date => new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
  let dateLabel = format((start || end).date);
  if (start && end && start.text !== end.text) {
    if (start.text.slice(0, 7) === end.text.slice(0, 7)) dateLabel = `${start.date.getUTCDate()}.–${format(end.date)}`;
    else dateLabel = `${format(start.date)} – ${format(end.date)}`;
  }
  return { dateLabel, venue: String(event?.venueName || '').trim() };
}

export function renderNextEvent(event, root = document) {
  const cell = root.querySelector('[data-next-event]');
  if (!cell) return;
  const presentation = nextEventPresentation(event);
  cell.hidden = !presentation;
  if (!presentation) return;
  cell.querySelector('[data-next-event-date]').textContent = presentation.dateLabel;
  const venue = cell.querySelector('[data-next-event-venue]');
  venue.textContent = presentation.venue;
  venue.hidden = !presentation.venue;
}
