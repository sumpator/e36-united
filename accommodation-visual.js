const visualMoney = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 });

function escapeMarkup(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function escapeXml(value = '') {
  return escapeMarkup(value).replace(/\r?\n/g, ' ');
}

function peopleLabel(count) {
  return count === 1 ? 'OSOBA' : count >= 2 && count <= 4 ? 'OSOBY' : 'OSOB';
}

function safeName(value) {
  const name = String(value || 'UBYTOVÁNÍ').trim();
  return name.length > 28 ? `${name.slice(0, 27)}…` : name;
}

function visualChips(option = {}, nights = null) {
  const capacity = Math.max(1, Number(option.capacityPerUnit || 1));
  const chips = [`${capacity} ${peopleLabel(capacity)}`];
  if (Number.isInteger(Number(nights)) && Number(nights) > 0) chips.push(`${Number(nights)} ${Number(nights) === 1 ? 'NOC' : 'NOCI'}`);
  if (Number(option.unitPriceCzk || 0) > 0) chips.push(`${visualMoney.format(Number(option.unitPriceCzk))} KČ / JEDN. / NOC`);
  else if (Number(option.personPriceCzk || 0) > 0) chips.push(`${visualMoney.format(Number(option.personPriceCzk))} KČ / OSOBA`);
  if (option.inventoryMode === 'unlimited') chips.push('BEZ OMEZENÍ');
  else if (option.freeUnits !== null && option.freeUnits !== undefined) chips.push(`${Math.max(0, Number(option.freeUnits || 0))} VOLNÉ`);
  return chips.slice(0, 4);
}

function silhouette(kind) {
  if (kind === 'tent') {
    return '<path d="M612 321 734 151l122 170H612Z"/><path d="m734 151 42 170M734 151l-42 170M665 246h139"/><path d="M734 321v-72l42 72"/>';
  }
  return '<path d="M602 216 734 129l132 87v119H602V216Z"/><path d="m574 225 160-106 160 106M631 335v-91h77v91M749 244h76v60h-76z"/><path d="M610 191v-54h43v26"/>';
}

export function accommodationFallbackSvg(option = {}, { nights = null } = {}) {
  const kind = option.kind === 'tent' ? 'tent' : 'cabin';
  const name = escapeXml(safeName(option.name));
  const type = kind === 'tent' ? 'STAN' : 'CHATKA';
  const chips = visualChips(option, nights);
  const chipMarkup = chips.map((chip, index) => {
    const x = 58 + (index % 2) * 230;
    const y = 356 + Math.floor(index / 2) * 54;
    return `<g transform="translate(${x} ${y})"><rect width="210" height="38" rx="19" fill="#0a1119" stroke="#7cc5ff" stroke-opacity=".42"/><text x="105" y="25" fill="#b9ddfa" font-family="Arial,Helvetica,sans-serif" font-size="14" font-weight="700" letter-spacing="1.5" text-anchor="middle">${escapeXml(chip)}</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" role="img" aria-label="Generovaný přehled ${name}"><defs><linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#101923"/><stop offset="1" stop-color="#05080c"/></linearGradient><pattern id="grid" width="36" height="36" patternUnits="userSpaceOnUse"><path d="M36 0H0V36" fill="none" stroke="#69b8ff" stroke-opacity=".09"/></pattern><radialGradient id="glow"><stop stop-color="#4da3ff" stop-opacity=".28"/><stop offset="1" stop-color="#4da3ff" stop-opacity="0"/></radialGradient></defs><rect width="960" height="540" fill="url(#bg)"/><rect width="960" height="540" fill="url(#grid)"/><circle cx="760" cy="225" r="250" fill="url(#glow)"/><g fill="none" stroke="#7cc5ff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity=".82">${silhouette(kind)}</g>${chipMarkup}<text x="58" y="76" fill="#6dbaff" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="800" letter-spacing="5">E36 UNITED · ${type}</text><text x="58" y="145" fill="#f4f8fb" font-family="Arial,Helvetica,sans-serif" font-size="48" font-weight="900" letter-spacing="-2">${name}</text><text x="58" y="188" fill="#8ea7ba" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="700" letter-spacing="2">GENEROVANÝ TECHNICKÝ PŘEHLED</text><path d="M58 217h392" stroke="#69b8ff" stroke-opacity=".35"/><text x="58" y="498" fill="#698093" font-family="Arial,Helvetica,sans-serif" font-size="13" letter-spacing="2">ILUSTRAČNÍ VIZUÁL · PARAMETRY Z AKTUÁLNÍ NABÍDKY</text></svg>`;
}

export function accommodationFallbackDataUrl(option = {}, settings = {}) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(accommodationFallbackSvg(option, settings))}`;
}

export function accommodationImageFallbackSvg(option = {}) {
  const kind = option.kind === 'tent' ? 'tent' : 'cabin';
  const detail = kind === 'tent'
    ? '<path d="M480 136 652 374H308L480 136Z"/><path d="m480 136 58 238M480 136l-58 238M376 280h208M480 374V274l58 100"/>'
    : '<path d="M286 267 480 139l194 128v151H286V267Z"/><path d="m246 281 234-155 234 155M330 418V293h112v125M502 293h112v84H502z"/><path d="M298 230v-77h63v38"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" role="img" aria-label="Ilustrační vizuál ubytování"><defs><linearGradient id="image-bg" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#101923"/><stop offset="1" stop-color="#05080c"/></linearGradient><pattern id="image-grid" width="36" height="36" patternUnits="userSpaceOnUse"><path d="M36 0H0V36" fill="none" stroke="#69b8ff" stroke-opacity=".09"/></pattern><radialGradient id="image-glow"><stop stop-color="#4da3ff" stop-opacity=".3"/><stop offset="1" stop-color="#4da3ff" stop-opacity="0"/></radialGradient></defs><rect width="960" height="540" fill="url(#image-bg)"/><rect width="960" height="540" fill="url(#image-grid)"/><circle cx="690" cy="205" r="310" fill="url(#image-glow)"/><g fill="none" stroke="#7cc5ff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity=".85">${detail}</g><g fill="none" stroke="#7cc5ff" stroke-opacity=".22"><path d="M120 420h720M145 451h670"/><path d="M154 112h92v18h-74v74M806 112h-92v18h74v74"/></g><circle cx="480" cy="280" r="190" fill="none" stroke="#7cc5ff" stroke-opacity=".08" stroke-width="2"/></svg>`;
}

export function accommodationImageFallbackDataUrl(option = {}) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(accommodationImageFallbackSvg(option))}`;
}

function resolvedPhotoUrl(imageUrl, apiBaseUrl) {
  const source = String(imageUrl || '');
  if (!source || /^(?:https?:|data:)/i.test(source)) return source;
  return `${String(apiBaseUrl || '').replace(/\/$/, '')}${source.startsWith('/') ? source : `/${source}`}`;
}

export function accommodationVisualModel(option = {}, { apiBaseUrl = '', nights = null, mode = 'informational' } = {}) {
  const imageOnly = mode === 'image-only';
  const fallbackSrc = imageOnly ? accommodationImageFallbackDataUrl(option) : accommodationFallbackDataUrl(option, { nights });
  const custom = option.visual?.hasCustomPhoto === true && !!option.visual?.imageUrl;
  const fallbackAlt = imageOnly ? `${String(option.name || 'Ubytování')} – ilustrační vizuál` : `${String(option.name || 'Ubytování')} – generovaný přehled`;
  return {
    src: custom ? resolvedPhotoUrl(option.visual.imageUrl, apiBaseUrl) : fallbackSrc,
    fallbackSrc,
    custom,
    alt: custom ? `${String(option.name || 'Ubytování')} – fotografie` : fallbackAlt,
    fallbackAlt,
  };
}

export function accommodationVisualMarkup(option = {}, { apiBaseUrl = '', nights = null, mode = 'informational', className = '' } = {}) {
  const model = accommodationVisualModel(option, { apiBaseUrl, nights, mode });
  return `<div class="accommodation-visual ${model.custom ? 'is-custom' : 'is-fallback'} ${escapeMarkup(className)}"><img alt="${escapeMarkup(model.alt)}" data-accommodation-fallback="${escapeMarkup(model.fallbackSrc)}" data-accommodation-fallback-alt="${escapeMarkup(model.fallbackAlt)}" data-accommodation-kind="${model.custom ? 'custom' : 'fallback'}" decoding="async" loading="lazy" src="${escapeMarkup(model.src)}"/></div>`;
}

export function bindAccommodationVisualFallbacks(root = document) {
  root.querySelectorAll('img[data-accommodation-fallback]').forEach(image => {
    if (image.dataset.accommodationFallbackBound === 'true') return;
    image.dataset.accommodationFallbackBound = 'true';
    image.addEventListener('error', () => {
      const fallback = image.dataset.accommodationFallback;
      if (!fallback || image.src === fallback) return;
      image.src = fallback;
      image.alt = image.dataset.accommodationFallbackAlt || image.alt;
      image.dataset.accommodationKind = 'fallback';
      const wrapper = image.closest('.accommodation-visual');
      wrapper?.classList.remove('is-custom');
      wrapper?.classList.add('is-fallback');
    }, { once: true });
  });
}
