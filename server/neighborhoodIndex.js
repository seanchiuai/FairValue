const NEIGHBORHOOD_INDEX_SCHEMA_VERSION = 'fairvalue.neighborhoodIndex.v1';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function sanitizeText(value, maxLength = 160) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function sanitizeLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 50;
  return Math.max(1, Math.min(Math.floor(number), 250));
}

function sanitizeMinProperties(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 1) return 1;
  return Math.max(1, Math.min(Math.floor(number), 100));
}

function normalizeSearch(value) {
  return sanitizeText(value, 120).toLowerCase();
}

function round(value, decimals = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** decimals;
  return Math.round(number * factor) / factor;
}

function median(values) {
  const numbers = values
    .map(Number)
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (!numbers.length) return null;
  const midpoint = Math.floor(numbers.length / 2);
  if (numbers.length % 2) return round(numbers[midpoint], 2);
  return round((numbers[midpoint - 1] + numbers[midpoint]) / 2, 2);
}

function countDefined(rows, field) {
  return rows.filter((row) => row[field] != null && row[field] !== '').length;
}

function coverage(rows, field) {
  if (!rows.length) return 0;
  return round((countDefined(rows, field) / rows.length) * 100, 1);
}

function countedMix(rows, field, fallback = 'unknown') {
  const counts = new Map();
  for (const row of rows) {
    const value = sanitizeText(row[field], 80) || fallback;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

function latestObservedAt(rows) {
  const values = rows
    .map((row) => sanitizeText(row.observed_at, 80))
    .filter(Boolean)
    .sort();
  return values.length ? values[values.length - 1] : null;
}

function confidenceFor(rows) {
  if (rows.length >= 12 && coverage(rows, 'price') >= 90 && coverage(rows, 'living_area') >= 70) return 'sampled';
  if (rows.length >= 4) return 'thin_sample';
  return 'directional_only';
}

function buildEntity(groupKey, rows) {
  const [state, zipCode] = groupKey.split('|');
  const cityMix = countedMix(rows, 'city');
  const city = cityMix[0]?.value || '';
  const prices = rows.map((row) => row.price).filter((value) => value != null);
  const pricePerSqft = rows
    .filter((row) => row.price != null && row.living_area)
    .map((row) => row.price / row.living_area);
  const rentYields = rows
    .filter((row) => row.price != null && row.rent_zestimate)
    .map((row) => (row.rent_zestimate * 12) / row.price);
  const schoolRatings = rows
    .map((row) => row.school_rating_average)
    .filter((value) => value != null);
  return {
    entity_id: `zip:${state || 'unknown'}:${zipCode || 'unknown'}`,
    entity_type: 'zip_code',
    label: [city, state, zipCode].filter(Boolean).join(' '),
    city,
    state,
    zip_code: zipCode,
    property_count: rows.length,
    latest_observed_at: latestObservedAt(rows),
    status_mix: countedMix(rows, 'home_status'),
    home_type_mix: countedMix(rows, 'home_type'),
    metrics: {
      median_price: median(prices),
      average_price: prices.length ? round(prices.reduce((sum, value) => sum + value, 0) / prices.length, 2) : null,
      min_price: prices.length ? Math.min(...prices) : null,
      max_price: prices.length ? Math.max(...prices) : null,
      median_price_per_sqft: median(pricePerSqft),
      median_rent_estimate: median(rows.map((row) => row.rent_zestimate).filter((value) => value != null)),
      median_gross_rent_yield: median(rentYields),
      median_bedrooms: median(rows.map((row) => row.bedrooms).filter((value) => value != null)),
      median_bathrooms: median(rows.map((row) => row.bathrooms).filter((value) => value != null)),
      median_living_area: median(rows.map((row) => row.living_area).filter((value) => value != null)),
      average_school_rating: schoolRatings.length
        ? round(schoolRatings.reduce((sum, value) => sum + value, 0) / schoolRatings.length, 2)
        : null,
    },
    data_quality: [
      { field: 'price', coverage_percent: coverage(rows, 'price') },
      { field: 'living_area', coverage_percent: coverage(rows, 'living_area') },
      { field: 'rent_zestimate', coverage_percent: coverage(rows, 'rent_zestimate') },
      { field: 'school_rating_average', coverage_percent: coverage(rows, 'school_rating_average') },
      { field: 'home_type', coverage_percent: coverage(rows, 'home_type') },
    ],
    sample_confidence: confidenceFor(rows),
    sample_properties: rows
      .slice()
      .sort((left, right) => (right.price || 0) - (left.price || 0))
      .slice(0, 8)
      .map((row) => ({
        property_id: row.property_id,
        address: row.address,
        price: row.price,
        home_status: row.home_status,
      })),
    limitations: [
      'This neighborhood entity is derived from the current FairValue static property snapshot grouped by ZIP code.',
      'It is not a census tract, parcel boundary, MLS comp set, appraisal area, school boundary, or live neighborhood feed.',
      'Metrics are directional aggregates over visible snapshot rows and should be validated with provider-backed evidence before settlement.',
    ],
  };
}

function buildNeighborhoodIndex({ properties = [], provenance = null, filters = {} } = {}) {
  const normalizedCity = normalizeSearch(filters.city);
  const normalizedState = normalizeSearch(filters.state);
  const normalizedZip = normalizeSearch(filters.zip || filters.zip_code);
  const minProperties = sanitizeMinProperties(filters.minProperties || filters.min_properties);
  const limit = sanitizeLimit(filters.limit);
  const grouped = new Map();

  for (const property of properties) {
    const city = sanitizeText(property.city, 80);
    const state = sanitizeText(property.state, 24);
    const zipCode = sanitizeText(property.zip_code, 24);
    if (!zipCode) continue;
    if (normalizedCity && city.toLowerCase() !== normalizedCity) continue;
    if (normalizedState && state.toLowerCase() !== normalizedState) continue;
    if (normalizedZip && zipCode.toLowerCase() !== normalizedZip) continue;
    const key = `${state}|${zipCode}`;
    const rows = grouped.get(key) || [];
    rows.push(property);
    grouped.set(key, rows);
  }

  const entities = Array.from(grouped.entries())
    .filter(([, rows]) => rows.length >= minProperties)
    .map(([key, rows]) => buildEntity(key, rows))
    .sort((left, right) =>
      right.property_count - left.property_count ||
      (right.metrics.median_price || 0) - (left.metrics.median_price || 0) ||
      left.entity_id.localeCompare(right.entity_id)
    );

  return {
    schema_version: NEIGHBORHOOD_INDEX_SCHEMA_VERSION,
    filters: {
      city: sanitizeText(filters.city, 80) || null,
      state: sanitizeText(filters.state, 24) || null,
      zip_code: sanitizeText(filters.zip || filters.zip_code, 24) || null,
      min_properties: minProperties,
      limit,
    },
    count: Math.min(entities.length, limit),
    total_matches: entities.length,
    entities: cloneJson(entities.slice(0, limit)),
    provenance: cloneJson(provenance || {}),
    limitations: [
      'Neighborhood entities are static ZIP-code aggregates over the current FairValue property snapshot.',
      'No live MLS, census, permit, insurance, climate, crime, school-boundary, or parcel-boundary provider was queried.',
      'These aggregates are developer and product scaffolding for future neighborhood markets, not appraisal or compliance evidence.',
    ],
  };
}

module.exports = {
  NEIGHBORHOOD_INDEX_SCHEMA_VERSION,
  buildNeighborhoodIndex,
};
