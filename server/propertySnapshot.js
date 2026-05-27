const fs = require('fs');
const path = require('path');

const DEFAULT_PROPERTY_SNAPSHOT_PATH = path.join(__dirname, '..', 'public', 'data', 'properties.json');
const PROPERTY_QUERY_SCHEMA_VERSION = 'fairvalue.propertyQuery.v1';

function sanitizeText(value, maxLength = 160) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function sanitizePrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 100_000_000) return null;
  return Math.round(number * 100) / 100;
}

function sanitizeLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 50;
  return Math.max(1, Math.min(Math.floor(number), 250));
}

function parseIds(value) {
  if (Array.isArray(value)) return value.map((id) => String(id || '').trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function normalizeSearch(value) {
  return sanitizeText(value, 120).toLowerCase();
}

function mapRawProperty(raw, index) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const address = source.address && typeof source.address === 'object' ? source.address : {};
  const attribution = source.attributionInfo && typeof source.attributionInfo === 'object' ? source.attributionInfo : {};
  const propertyId = String(source.zpid || index + 1);
  return {
    property_id: propertyId,
    price: sanitizePrice(source.price),
    address: sanitizeText(source.streetAddress || address.streetAddress),
    city: sanitizeText(source.city || address.city || 'San Francisco', 80),
    state: sanitizeText(source.state || address.state || 'CA', 24),
    zip_code: sanitizeText(source.zipcode || address.zipcode, 24),
    home_status: sanitizeText(source.homeStatus, 80),
    provider_source: sanitizeText(source.listingDataSource || source.listingSource || 'Zillow static property snapshot', 120),
    observed_at: sanitizeText(attribution.lastUpdated || attribution.lastChecked || source.dateSoldString, 80) || null,
  };
}

function manifestSummary(rawManifest) {
  const manifest = rawManifest && typeof rawManifest === 'object' ? rawManifest : {};
  return {
    schema_version: manifest.schema_version || null,
    dataset_id: manifest.dataset_id || null,
    source_kind: manifest.source_kind || null,
    property_count: Number.isFinite(Number(manifest.property_count)) ? Number(manifest.property_count) : null,
    source_sha256: manifest.source_files?.[0]?.sha256 || null,
    latest_observed_at: manifest.freshness?.latest_observed_at || null,
    provider_summary: Array.isArray(manifest.provider_summary) ? manifest.provider_summary.slice(0, 12) : [],
    field_coverage: Array.isArray(manifest.field_coverage) ? manifest.field_coverage.slice(0, 20) : [],
    legal_limitations: Array.isArray(manifest.legal_limitations) ? manifest.legal_limitations.slice(0, 8) : [],
  };
}

function createPropertySnapshot({
  filePath = DEFAULT_PROPERTY_SNAPSHOT_PATH,
  manifestPath = path.join(path.dirname(filePath), 'property-data-manifest.json'),
  properties = null,
  manifest = null,
} = {}) {
  let loaded = false;
  let byId = new Map();
  let provenance = null;

  function load() {
    const rawProperties = Array.isArray(properties)
      ? properties
      : JSON.parse(fs.readFileSync(filePath, 'utf8'));
    byId = new Map(
      rawProperties
        .map((property, index) => mapRawProperty(property, index))
        .filter((property) => property.property_id && property.price)
        .map((property) => [property.property_id, property])
    );
    if (manifest) {
      provenance = manifestSummary(manifest);
    } else if (manifestPath && fs.existsSync(manifestPath)) {
      provenance = manifestSummary(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
    } else {
      provenance = manifestSummary(null);
    }
    loaded = true;
    return { count: byId.size, filePath, manifestPath };
  }

  function ensureLoaded() {
    if (!loaded) load();
  }

  function getById(propertyId) {
    ensureLoaded();
    const property = byId.get(String(propertyId || '').trim());
    return property ? JSON.parse(JSON.stringify(property)) : null;
  }

  function query({
    ids = [],
    q = '',
    city = '',
    state = '',
    minPrice = null,
    maxPrice = null,
    limit = 50,
  } = {}) {
    ensureLoaded();
    const wanted = new Set(parseIds(ids));
    const search = normalizeSearch(q);
    const normalizedCity = normalizeSearch(city);
    const normalizedState = normalizeSearch(state);
    const min = sanitizePrice(minPrice);
    const max = sanitizePrice(maxPrice);
    const rows = Array.from(byId.values()).filter((property) => {
      if (wanted.size > 0 && !wanted.has(property.property_id)) return false;
      if (normalizedCity && property.city.toLowerCase() !== normalizedCity) return false;
      if (normalizedState && property.state.toLowerCase() !== normalizedState) return false;
      if (min != null && property.price < min) return false;
      if (max != null && property.price > max) return false;
      if (!search) return true;
      const haystack = [
        property.property_id,
        property.address,
        property.city,
        property.state,
        property.zip_code,
        property.provider_source,
      ].join(' ').toLowerCase();
      return haystack.includes(search);
    });
    const cappedLimit = sanitizeLimit(limit);
    return {
      count: Math.min(rows.length, cappedLimit),
      total_matches: rows.length,
      limit: cappedLimit,
      properties: JSON.parse(JSON.stringify(rows.slice(0, cappedLimit))),
      provenance: JSON.parse(JSON.stringify(provenance)),
    };
  }

  function queryResponse(filters = {}) {
    const result = query(filters);
    return {
      schema_version: PROPERTY_QUERY_SCHEMA_VERSION,
      filters: {
        ids: parseIds(filters.ids),
        q: sanitizeText(filters.q, 120) || null,
        city: sanitizeText(filters.city, 80) || null,
        state: sanitizeText(filters.state, 24) || null,
        min_price: sanitizePrice(filters.minPrice),
        max_price: sanitizePrice(filters.maxPrice),
        limit: result.limit,
      },
      ...result,
      limitations: [
        'Properties come from the current FairValue static provider snapshot, not a live listing feed.',
        'Prices, status, school, tax, and provider fields are not independently verified by FairValue.',
        'Use public-safe settlement evidence for real market outcomes.',
      ],
    };
  }

  return {
    kind: Array.isArray(properties) ? 'memory-property-snapshot' : 'json-property-snapshot',
    filePath,
    manifestPath,
    load,
    getById,
    query,
    queryResponse,
  };
}

module.exports = {
  DEFAULT_PROPERTY_SNAPSHOT_PATH,
  PROPERTY_QUERY_SCHEMA_VERSION,
  createPropertySnapshot,
  mapRawProperty,
};
