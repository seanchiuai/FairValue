const fs = require('fs');
const path = require('path');
const {
  NEIGHBORHOOD_INDEX_SCHEMA_VERSION,
  buildNeighborhoodIndex,
} = require('./neighborhoodIndex');
const {
  GEOSPATIAL_INDEX_SCHEMA_VERSION,
  buildGeospatialIndex,
  sanitizeLatitude,
  sanitizeLongitude,
} = require('./geospatialIndex');

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

function sanitizePositiveNumber(value, { max = 100_000_000, decimals = 2, allowZero = false } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number > max) return null;
  if (allowZero ? number < 0 : number <= 0) return null;
  const factor = 10 ** decimals;
  return Math.round(number * factor) / factor;
}

function sanitizeYear(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1700 || number > 2200) return null;
  return number;
}

function averageSchoolRating(schools) {
  const ratings = Array.isArray(schools)
    ? schools
      .map((school) => Number(school?.rating))
      .filter((rating) => Number.isFinite(rating) && rating >= 0 && rating <= 10)
    : [];
  if (!ratings.length) return { average: null, count: 0 };
  return {
    average: Math.round((ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 100) / 100,
    count: ratings.length,
  };
}

function sanitizedSchoolSummary(source, fallback) {
  if (fallback.average != null || fallback.count > 0) return fallback;
  const average = sanitizePositiveNumber(source.school_rating_average, {
    max: 10,
    decimals: 2,
    allowZero: true,
  });
  const count = Number(source.school_count);
  return {
    average,
    count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 0,
  };
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
  const propertyId = String(source.zpid || source.property_id || index + 1);
  const schoolRating = sanitizedSchoolSummary(source, averageSchoolRating(source.schools));
  return {
    property_id: propertyId,
    price: sanitizePrice(source.price),
    address: sanitizeText(source.streetAddress || source.address || address.streetAddress),
    city: sanitizeText(source.city || address.city || 'San Francisco', 80),
    state: sanitizeText(source.state || address.state || 'CA', 24),
    zip_code: sanitizeText(source.zipcode || source.zip_code || address.zipcode, 24),
    home_status: sanitizeText(source.homeStatus || source.home_status, 80),
    home_type: sanitizeText(source.homeType || source.home_type, 80),
    bedrooms: sanitizePositiveNumber(source.bedrooms, { max: 100, decimals: 1, allowZero: true }),
    bathrooms: sanitizePositiveNumber(source.bathrooms, { max: 100, decimals: 1, allowZero: true }),
    living_area: sanitizePositiveNumber(source.livingArea || source.livingAreaValue || source.living_area, { max: 1_000_000, decimals: 0 }),
    rent_zestimate: sanitizePrice(source.rentZestimate || source.rent_zestimate),
    zestimate: sanitizePrice(source.zestimate),
    tax_assessed_value: sanitizePrice(source.taxAssessedValue || source.tax_assessed_value),
    year_built: sanitizeYear(source.yearBuilt || source.year_built),
    school_rating_average: schoolRating.average,
    school_count: schoolRating.count,
    latitude: sanitizeLatitude(source.latitude),
    longitude: sanitizeLongitude(source.longitude),
    has_bad_geocode: source.hasBadGeocode === true || source.has_bad_geocode === true,
    provider_source: sanitizeText(source.listingDataSource || source.listingSource || source.provider_source || 'Zillow static property snapshot', 120),
    observed_at: sanitizeText(attribution.lastUpdated || attribution.lastChecked || source.dateSoldString || source.observed_at, 80) || null,
  };
}

function manifestSummary(rawManifest) {
  const manifest = rawManifest && typeof rawManifest === 'object' ? rawManifest : {};
  return {
    schema_version: manifest.schema_version || null,
    dataset_id: manifest.dataset_id || null,
    source_kind: manifest.source_kind || null,
    property_count: Number.isFinite(Number(manifest.property_count)) ? Number(manifest.property_count) : null,
    source_sha256: manifest.source_sha256 || manifest.source_files?.[0]?.sha256 || null,
    latest_observed_at: manifest.latest_observed_at || manifest.freshness?.latest_observed_at || null,
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
  kind = null,
  sourceAdapter = null,
} = {}) {
  let loaded = false;
  let byId = new Map();
  let provenance = null;
  const snapshotKind = kind || (Array.isArray(properties) ? 'memory-property-snapshot' : 'json-property-snapshot');
  const snapshotSourceAdapter = sourceAdapter || snapshotKind;

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

  function allProperties() {
    ensureLoaded();
    return JSON.parse(JSON.stringify(Array.from(byId.values())));
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
      source_adapter: snapshotSourceAdapter,
      ...result,
      limitations: [
        'Properties come from the current FairValue static provider snapshot, not a live listing feed.',
        'Prices, status, school, tax, and provider fields are not independently verified by FairValue.',
        'Use public-safe settlement evidence for real market outcomes.',
      ],
    };
  }

  function neighborhoodResponse(filters = {}) {
    ensureLoaded();
    return buildNeighborhoodIndex({
      properties: Array.from(byId.values()),
      provenance,
      filters,
    });
  }

  function geospatialResponse(filters = {}) {
    ensureLoaded();
    return buildGeospatialIndex({
      properties: Array.from(byId.values()),
      provenance,
      filters,
    });
  }

  function nearbyResponse(propertyId, filters = {}) {
    ensureLoaded();
    const property = byId.get(String(propertyId || '').trim());
    if (!property) {
      return { error: 'Property not found', statusCode: 404 };
    }
    if (property.latitude == null || property.longitude == null || property.has_bad_geocode) {
      return { error: 'Property does not have a usable geocode in the current snapshot', statusCode: 422 };
    }
    return buildGeospatialIndex({
      properties: Array.from(byId.values()),
      provenance,
      originProperty: property,
      filters: {
        ...filters,
        lat: property.latitude,
        lng: property.longitude,
        radiusKm: filters.radiusKm || filters.radius_km || 2,
        defaultLimit: 12,
      },
    });
  }

  return {
    kind: snapshotKind,
    sourceAdapter: snapshotSourceAdapter,
    filePath,
    manifestPath,
    load,
    getById,
    allProperties,
    query,
    queryResponse,
    neighborhoodResponse,
    geospatialResponse,
    nearbyResponse,
  };
}

module.exports = {
  DEFAULT_PROPERTY_SNAPSHOT_PATH,
  PROPERTY_QUERY_SCHEMA_VERSION,
  NEIGHBORHOOD_INDEX_SCHEMA_VERSION,
  GEOSPATIAL_INDEX_SCHEMA_VERSION,
  createPropertySnapshot,
  mapRawProperty,
};
