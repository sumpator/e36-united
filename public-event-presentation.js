function datePart(value) {
  const text = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? { text, date } : null;
}

export function nextEventPresentation(event, today = event?.offerDate || new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' })) {
  const start = datePart(event?.startsOn), end = datePart(event?.endsOn);
  if ((!start && event?.startsOn) || (!end && event?.endsOn) || (!start && !end)) return null;
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

export function eventCalendar(event) {
  const start=datePart(event?.startsOn), end=datePart(event?.endsOn);
  if (!start || !end || !nextEventPresentation(event)) return null;
  end.date.setUTCDate(end.date.getUTCDate()+1);
  const first=start.text.replaceAll('-',''), last=end.date.toISOString().slice(0,10).replaceAll('-','');
  const title=event.title||'E36 United', venue=event.venueName||'';
  const params=new URLSearchParams({action:'TEMPLATE',text:title,dates:first+'/'+last,location:venue});
  const escape=value=>String(value).replaceAll('\\','\\\\').replace(/\r\n|\r|\n/g,'\\n').replaceAll(',','\\,').replaceAll(';','\\;');
  const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//E36 United//Srazy//CS','BEGIN:VEVENT',
    'UID:'+escape(event.id)+'@e36united.cz','DTSTAMP:'+stamp,'DTSTART;VALUE=DATE:'+first,'DTEND;VALUE=DATE:'+last,
    'SUMMARY:'+escape(title),'LOCATION:'+escape(venue),'END:VEVENT','END:VCALENDAR',''].join('\r\n');
  return {google:'https://calendar.google.com/calendar/render?'+params,ics};
}
