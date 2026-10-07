// Seed the current source of event_member_presence, never write into its view.
// A confirmed arrival is an explicit isolated fixture, not a production command.
export function seedConfirmedArrival(runtime, memberId, carId, eventId = 'e') {
  const car = runtime.db.prepare('SELECT model,body FROM cars WHERE id=?').get(carId);
  if (!car) throw new Error('Arrival fixture requires an existing garage car');
  runtime.db.prepare(`INSERT INTO event_arrivals
    (id,event_id,member_id,car_key,garage_car_id,model,body,crew,registered,admission_czk,arrived_at,confirmed_by)
    VALUES(?,?,?,?,?,?,?,1,0,0,CURRENT_TIMESTAMP,'a')`).run(
    `fixture-arrival-${eventId}-${carId}`, eventId, memberId, carId, carId, car.model, car.body || 'Sedan');
}

export function clearConfirmedArrival(runtime, memberId, eventId = 'e') {
  runtime.db.prepare('DELETE FROM event_arrivals WHERE event_id=? AND member_id=?').run(eventId, memberId);
}
