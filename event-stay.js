// attendance_type is the persisted identifier for a complete arrival/departure pair.
export const stays = Object.freeze([
  {attendanceType:'full_weekend',arrival:'Pátek',departure:'Neděle',nights:2},
  {attendanceType:'friday_only',arrival:'Pátek',departure:'Sobota',nights:1},
  {attendanceType:'saturday_only',arrival:'Sobota',departure:'Neděle',nights:1},
  {attendanceType:'day_visit',arrival:'Jen na otočku',departure:'Stejný den',nights:0},
]);

export function resolveStay({arrival,departure,attendanceType} = {}) {
  return stays.find(stay => stay.arrival === arrival &&
    (!departure || stay.departure === departure) &&
    (!attendanceType || stay.attendanceType === attendanceType) &&
    (arrival !== 'Pátek' || departure || attendanceType)) || null;
}

export function storedStay(type) {
  return stays.find(stay => stay.attendanceType === type) || null;
}

export function stayFitsEvent(stay,event) {
  if (!stay || !event?.starts_on || !event.ends_on) return false;
  const start = Date.parse(event.starts_on+'T12:00:00Z');
  const end = Date.parse(event.ends_on+'T12:00:00Z');
  const weekday = stay.arrival === 'Pátek' ? 5 : 6;
  const daysToArrival = (weekday-new Date(start).getUTCDay()+7)%7;
  return start+(daysToArrival+stay.nights)*86400000 <= end;
}
