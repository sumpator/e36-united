import { accommodationMediaMetadata, hydrateAccommodationMedia, listAccommodationGalleryRows } from "../accommodation.js";
import { json } from "../../http/responses.js";
import { mapAccommodationSnapshot } from "./pricing.js";

async function listAccommodationOptions(env, eventId, activeOnly = false) {
  const rows = await env.DB.prepare(`
    SELECT
      o.id, o.event_id, o.name, o.kind, o.inventory_mode,
      ${env.ADMIN_READ ? "COALESCE((SELECT revision FROM admin_resource_versions WHERE resource_type='accommodation' AND resource_id=o.id),0)" : '0'} AS admin_revision,
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
  return hydrateAccommodationMedia(env, eventId, options);
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
    revision: Number(row.admin_revision || 0),
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
  const galleryKey = `gallery:${reservation.event_id}`;
  if (!cache.has(galleryKey)) cache.set(galleryKey, listAccommodationGalleryRows(env, reservation.event_id));
  const key = `media:${reservation.event_id}:${reservation.accommodation_option_id}`;
  if (!cache.has(key)) cache.set(key, Promise.resolve(cache.get(galleryKey)).then(rows => accommodationMediaMetadata(env, reservation.event_id, reservation.accommodation_option_id, rows)));
  const media = await cache.get(key);
  reservation.accommodation_visual = media.visual;
  reservation.accommodation_photos = media.photos;
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

function accommodationCapacityConflict(name, origin, message = "", extra = {}) {
  return json({
    ok: false,
    error: "accommodation_capacity_exceeded",
    message: message || `${name} už bohužel nemá dost volné kapacity pro tvoji posádku. Vyber jinou možnost.`,
    ...extra,
  }, 409, origin);
}

async function getReservationChangeCapacity(env, reservationId, eventId, optionId, proposedUnits) {
  const row = await env.DB.prepare(`
    WITH current_allocation AS (
      SELECT option_id, option_name, kind, unit_count
      FROM reservation_accommodation
      WHERE reservation_id = ?
    )
    SELECT
      current_allocation.option_id AS current_option_id,
      current_allocation.option_name AS current_option_name,
      current_allocation.kind AS current_option_kind,
      COALESCE(current_allocation.unit_count, 0) AS current_unit_count,
      target.id AS target_option_id,
      target.name AS target_option_name,
      target.kind AS target_option_kind,
      target.inventory_mode AS target_inventory_mode,
      target.units_total AS target_units_total,
      COALESCE((
        SELECT SUM(allocation.unit_count)
        FROM reservation_accommodation allocation
        JOIN reservations approved_reservation ON approved_reservation.id = allocation.reservation_id
        WHERE allocation.option_id = target.id
          AND approved_reservation.status = 'approved'
          AND approved_reservation.id <> ?
      ), 0) AS approved_other_units
    FROM (SELECT 1) seed
    LEFT JOIN current_allocation ON 1 = 1
    LEFT JOIN event_accommodation_options target ON target.id = ? AND target.event_id = ? AND target.active = 1
    LIMIT 1
  `).bind(reservationId, reservationId, optionId || null, eventId).first();
  const currentUnits = Number(row?.current_unit_count || 0);
  const sameOption = !!optionId && row?.current_option_id === optionId;
  const retainedUnits = sameOption ? currentUnits : 0;
  const requestedUnits = Math.max(0, Number(proposedUnits || 0));
  const source = row?.current_option_id ? {
    optionId: row.current_option_id,
    optionName: row.current_option_name || "Ubytování",
    kind: row.current_option_kind || "",
    units: currentUnits,
    releasedUnits: sameOption ? Math.max(0, currentUnits - requestedUnits) : currentUnits,
  } : null;
  if (!optionId) return {
    optionId: null, optionName: "Bez ubytování", kind: "none", inventoryMode: "unlimited",
    unitsTotal: null, occupiedUnits: 0, freeUnits: null, currentReservationUnits: 0,
    proposedUnits: 0, netChangeUnits: -currentUnits, occupiedAfterApproval: 0,
    freeAfterApproval: null, deficitUnits: 0, available: true, source,
  };
  if (!row?.target_option_id) return null;
  const limited = row.target_inventory_mode === "limited";
  const total = limited ? Number(row.target_units_total || 0) : null;
  const otherUnits = Number(row.approved_other_units || 0);
  const occupied = otherUnits + retainedUnits;
  const after = otherUnits + requestedUnits;
  const deficit = limited ? Math.max(0, after - total) : 0;
  return {
    optionId: row.target_option_id, optionName: row.target_option_name, kind: row.target_option_kind,
    inventoryMode: row.target_inventory_mode, unitsTotal: total, occupiedUnits: occupied,
    freeUnits: limited ? Math.max(0, total - occupied) : null,
    currentReservationUnits: retainedUnits, proposedUnits: requestedUnits,
    netChangeUnits: requestedUnits - retainedUnits, occupiedAfterApproval: after,
    freeAfterApproval: limited ? Math.max(0, total - after) : null,
    deficitUnits: deficit, available: deficit === 0, source,
  };
}

export {
  accommodationCapacityConflict,
  getAccommodationUsage,
  getReservationChangeCapacity,
  hydrateReservationAccommodationVisual,
  listAccommodationOptions,
  listMemberAccommodationOptions,
  mapAccommodationOption,
};
