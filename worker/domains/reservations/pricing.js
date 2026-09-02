function calculateAccommodationPricing(event, option, peopleCount, attendanceType) {
  const capacityPerUnit = Math.max(1, Number(option.capacity_per_unit || 1));
  const unitCount = Math.ceil(peopleCount / capacityPerUnit);
  const nights = attendanceType === "full_weekend"
    ? Number(event.full_weekend_nights ?? 2)
    : attendanceType === "saturday_only" ? Number(event.saturday_only_nights ?? 1) : 0;
  const unitPriceCzk = Number(option.unit_price_czk || 0);
  const personPriceCzk = Number(option.person_price_czk || 0);
  const beddingFeePerPersonCzk = Number(option.bedding_fee_per_person_czk || 0);
  const cityTaxPerPersonPerNightCzk = Number(option.city_tax_per_person_per_night_czk || 0);
  const baseTotalCzk = unitCount * unitPriceCzk * nights;
  const personTotalCzk = peopleCount * personPriceCzk;
  const beddingTotalCzk = peopleCount * beddingFeePerPersonCzk;
  const cityTaxTotalCzk = peopleCount * nights * cityTaxPerPersonPerNightCzk;
  return {
    unitCount,
    nights,
    unitPriceCzk,
    personPriceCzk,
    beddingFeePerPersonCzk,
    cityTaxPerPersonPerNightCzk,
    baseTotalCzk,
    personTotalCzk,
    beddingTotalCzk,
    cityTaxTotalCzk,
    totalCzk: baseTotalCzk + personTotalCzk + beddingTotalCzk + cityTaxTotalCzk,
  };
}

function mapAccommodationSnapshot(row) {
  if (!row?.accommodation_option_id) return null;
  return {
    optionId: row.accommodation_option_id,
    optionName: row.accommodation_option_name || "",
    kind: row.accommodation_option_kind || "",
    capacityPerUnit: Number(row.accommodation_capacity_per_unit || Math.ceil(Number(row.accommodation_people_count || 0) / Math.max(1, Number(row.accommodation_unit_count || 1))) || 1),
    peopleCount: Number(row.accommodation_people_count || 0),
    unitCount: Number(row.accommodation_unit_count || 0),
    unitPriceCzk: Number(row.accommodation_unit_price_czk || 0),
    personPriceCzk: Number(row.accommodation_person_price_czk || 0),
    beddingFeePerPersonCzk: Number(row.accommodation_bedding_fee_czk || 0),
    cityTaxPerPersonPerNightCzk: Number(row.accommodation_city_tax_czk || 0),
    nights: Number(row.accommodation_nights || 0),
    baseTotalCzk: Number(row.accommodation_base_total_czk || 0),
    personTotalCzk: Number(row.accommodation_person_total_czk || 0),
    beddingTotalCzk: Number(row.accommodation_bedding_total_czk || 0),
    cityTaxTotalCzk: Number(row.accommodation_city_tax_total_czk || 0),
    totalCzk: Number(row.accommodation_total_czk || 0),
    visual: row.accommodation_visual || { hasCustomPhoto: false, imageUrl: null, version: null },
  };
}

export { calculateAccommodationPricing, mapAccommodationSnapshot };
