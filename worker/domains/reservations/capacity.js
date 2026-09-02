import { accommodationVisualMetadata } from "../accommodation.js";
import { json } from "../../http/responses.js";
import { mapAccommodationSnapshot } from "./pricing.js";

async function listAccommodationOptions(env, eventId, activeOnly = false) {
  const rows = await env.DB.prepare(`
    SELECT
      o.id, o.event_id, o.name, o.kind, o.inventory_mode,
      o.units_total, o.capacity_per_unit,
      o.unit_price_czk, o.person_price_czk,
      o.bedding_fee_per_person_czk,
      o.city_tax_per_person_per_night_czk,
      o.active, o.sort_order, o.created_at, o.updated_at,
      COALESCE(SUM(CASE WHEN r.status = 'approved' THEN ra.unit_count ELSE 0 END), 0) AS approved_units,
      COALESCE(SUM(CASE WHEN r.status = 'pending' THEN ra.unit_count ELSE 0 END), 0) AS pending_units
    FROM event_accommodation_options o
    LEFT JOIN reservation_accommodation ra ON ra.option_id = o.id
    LEFT JOIN reservations r ON r.id = ra.reservation_id
    WHERE o.event_id = ? AND (? = 0 OR o.active = 1)
    GROUP BY
      o.id, o.event_id, o.name, o.kind, o.inventory_mode,
      o.units_total, o.capacity_per_unit,
      o.unit_price_czk, o.person_price_czk,
      o.bedding_fee_per_person_czk,
      o.city_tax_per_person_per_night_czk,
      o.active, o.sort_order, o.created_at, o.updated_at
    ORDER BY o.sort_order ASC, o.name COLLATE NOCASE ASC
  `).bind(eventId, activeOnly ? 1 : 0).all();
  const options = (rows.results || []).map(mapAccommodationOption);
  await Promise.all(options.map(async option => {
    option.visual = await accommodationVisualMetadata(env, option.eventId, option.id);
  }));
  return options;
}

async function listMemberAccommodationOptions(env, eventId, reservation = null) {
  const options = await listAccommodationOptions(env, eventId, true);
  const ownSnapshot = reservation ? mapAccommodationSnapshot(reservation) : null;
  if (ownSnapshot && reservation.status === "approved") {
    const ownOption = options.find(option => option.id === ownSnapshot.optionId && option.inventoryMode === "limited");
    if (ownOption) {
      ownOption.freeUnits = Math.min(ownOption.unitsTotal, ownOption.freeUnits + ownSnapshot.unitCount);
      ownOption.soldOut = ownOption.freeUnits === 0;
    }
  }
  return options;
}

function mapAccommodationOption(row) {
  const limited = row.inventory_mode === "limited";
  const total = Number(row.units_total || 0);
  const approved = Number(row.approved_units || 0);
  const pending = Number(row.pending_units || 0);
  const free = limited ? Math.max(0, total - approved) : null;
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    kind: row.kind,
    inventoryMode: row.inventory_mode,
    unitsTotal: total,
    blockedUnits: approved,
    approvedUnits: approved,
    pendingUnits: pending,
    pendingConflictUnits: limited ? Math.max(0, pending - free) : 0,
    freeUnits: free,
    capacityPerUnit: Number(row.capacity_per_unit || 1),
    unitPriceCzk: Number(row.unit_price_czk || 0),
    personPriceCzk: Number(row.person_price_czk || 0),
    beddingFeePerPersonCzk: Number(row.bedding_fee_per_person_czk || 0),
    cityTaxPerPersonPerNightCzk: Number(row.city_tax_per_person_per_night_czk || 0),
    active: !!row.active,
    sortOrder: Number(row.sort_order || 0),
    soldOut: limited && free === 0,
  };
}

async function hydrateReservationAccommodationVisual(env, reservation, cache = new Map()) {
  if (!reservation?.accommodation_option_id) return reservation;
  const key = `${reservation.event_id}:${reservation.accommodation_option_id}`;
  let visual = cache.get(key);
  if (!visual) {
    visual = await accommodationVisualMetadata(env, reservation.event_id, reservation.accommodation_option_id);
    cache.set(key, visual);
  }
  reservation.accommodation_visual = visual;
  return reservation;
}

async function getAccommodationUsage(env, optionId) {
  const row = await env.DB.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN r.status = 'approved' THEN ra.unit_count ELSE 0 END), 0) AS approved_units,
      COALESCE(SUM(CASE WHEN r.status = 'pending' THEN ra.unit_count ELSE 0 END), 0) AS pending_units
    FROM reservation_accommodation ra
    JOIN reservations r ON r.id = ra.reservation_id
    WHERE ra.option_id = ?
  `).bind(optionId).first();
  return { approved: Number(row?.approved_units || 0), pending: Number(row?.pending_units || 0) };
}

function accommodationCapacityConflict(name, origin, message = "") {
  return json({
    ok: false,
    error: "accommodation_capacity_exceeded",
    message: message || `${name} už bohužel nemá dost volné kapacity pro tvoji posádku. Vyber jinou možnost.`,
  }, 409, origin);
}

export {
  accommodationCapacityConflict,
  getAccommodationUsage,
  hydrateReservationAccommodationVisual,
  listAccommodationOptions,
  listMemberAccommodationOptions,
  mapAccommodationOption,
};
