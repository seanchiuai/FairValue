const GEOSPATIAL_INDEX_SCHEMA_VERSION = 'fairvalue.geospatialIndex.v1';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function sanitizeText(value, maxLength = 160) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function sanitizeLimit(value, fallback = 50) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.max(1, Math.min(Math.floor(number), 250));
}

function sanitizeLatitude(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < -90 || number > 90) return null;
  return Math.round(number * 1_000_000) / 1_000_000;
}

function sanitizeLongitude(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < -180 || number > 180) return null;
  return Math.round(number * 1_000_000) / 1_000_000;
}

function sanitizeRadiusKm(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 5;
  return Math.max(0.05, Math.min(Math.round(number * 100) / 100, 250));
}

function round(value, decimals = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** decimals;
  return Math.round(number * factor) / factor;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceKm(left, right) {
  const earthRadiusKm = 6371.0088;
  const dLat = toRadians(right.latitude - left.latitude);
  const dLng = toRadians(right.longitude - left.longitude);
  const lat1 = toRadians(left.latitude);
  const lat2 = toRadians(right.latitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeSearch(value, maxLength = 120) {
  return sanitizeText(value, maxLength).toLowerCase();
}

function parseBBox(filters = {}) {
  const explicit = {
    west: sanitizeLongitude(filters.west),
    south: sanitizeLatitude(filters.south),
    east: sanitizeLongitude(filters.east),
    north: sanitizeLatitude(filters.north),
  };
  if (Object.values(explicit).every((value) => value != null)) {
    if (explicit.west < explicit.east && explicit.south < explicit.north) return explicit;
  }

  const raw = Array.isArray(filters.bbox) ? filters.bbox[0] : filters.bbox;
  if (!raw) return null;
  const [west, south, east, north] = String(raw)
    .split(',')
    .map((part) => part.trim());
  const parsed = {
    west: sanitizeLongitude(west),
    south: sanitizeLatitude(south),
    east: sanitizeLongitude(east),
    north: sanitizeLatitude(north),
  };
  if (!Object.values(parsed).every((value) => value != null)) return null;
  if (parsed.west >= parsed.east || parsed.south >= parsed.north) return null;
  return parsed;
}

function normalizeFilters(filters = {}) {
  const latitude = sanitizeLatitude(filters.lat ?? filters.latitude);
  const longitude = sanitizeLongitude(filters.lng ?? filters.lon ?? filters.longitude);
  const center = latitude != null && longitude != null ? { latitude, longitude } : null;
  return {
    center,
    radius_km: sanitizeRadiusKm(filters.radiusKm ?? filters.radius_km),
    bbox: parseBBox(filters),
    city: sanitizeText(filters.city, 80) || null,
    state: sanitizeText(filters.state, 24) || null,
    zip_code: sanitizeText(filters.zip || filters.zip_code, 24) || null,
    limit: sanitizeLimit(filters.limit, filters.defaultLimit || 50),
  };
}

function hasUsableLocation(property) {
  return property
    && property.latitude != null
    && property.longitude != null
    && property.has_bad_geocode !== true;
}

function gridCellId(property) {
  const latCell = Math.floor((property.latitude + 90) * 100);
  const lngCell = Math.floor((property.longitude + 180) * 100);
  return `grid_0p01deg:${latCell}:${lngCell}`;
}

function projectProperty(property, center = null) {
  const projected = {
    property_id: property.property_id,
    address: property.address,
    city: property.city,
    state: property.state,
    zip_code: property.zip_code,
    price: property.price,
    home_status: property.home_status,
    home_type: property.home_type,
    living_area: property.living_area,
    latitude: property.latitude,
    longitude: property.longitude,
    geocode_quality: property.has_bad_geocode ? 'provider_flagged_bad' : 'provider_centroid',
    spatial_unit: 'property_centroid',
    grid_cell_id: gridCellId(property),
  };
  if (center) {
    projected.distance_km = round(distanceKm(center, property), 3);
  }
  return projected;
}

function buildTiles(properties) {
  const cells = new Map();
  for (const property of properties) {
    const cellId = gridCellId(property);
    const current = cells.get(cellId) || {
      cell_id: cellId,
      spatial_unit: '0.01_degree_grid_cell',
      count: 0,
      sample_property_ids: [],
    };
    current.count += 1;
    if (current.sample_property_ids.length < 4) current.sample_property_ids.push(property.property_id);
    cells.set(cellId, current);
  }
  return Array.from(cells.values()).sort((left, right) => right.count - left.count || left.cell_id.localeCompare(right.cell_id));
}

function buildOrigin(originProperty, center) {
  if (originProperty) {
    return {
      kind: 'property',
      property_id: originProperty.property_id,
      address: originProperty.address,
      latitude: originProperty.latitude,
      longitude: originProperty.longitude,
      geocode_quality: originProperty.has_bad_geocode ? 'provider_flagged_bad' : 'provider_centroid',
    };
  }
  if (center) {
    return {
      kind: 'coordinate',
      latitude: center.latitude,
      longitude: center.longitude,
    };
  }
  return null;
}

function buildGeospatialIndex({ properties = [], provenance = null, filters = {}, originProperty = null } = {}) {
  const normalized = normalizeFilters(filters);
  const normalizedCity = normalizeSearch(normalized.city, 80);
  const normalizedState = normalizeSearch(normalized.state, 24);
  const normalizedZip = normalizeSearch(normalized.zip_code, 24);
  const totalProperties = properties.length;
  const missingCoordinates = properties.filter((property) => property.latitude == null || property.longitude == null).length;
  const badGeocodes = properties.filter((property) => property.has_bad_geocode === true).length;
  const indexed = properties.filter(hasUsableLocation);

  const rows = indexed.filter((property) => {
    if (originProperty && property.property_id === originProperty.property_id) return false;
    if (normalizedCity && String(property.city || '').toLowerCase() !== normalizedCity) return false;
    if (normalizedState && String(property.state || '').toLowerCase() !== normalizedState) return false;
    if (normalizedZip && String(property.zip_code || '').toLowerCase() !== normalizedZip) return false;
    if (normalized.bbox) {
      if (property.longitude < normalized.bbox.west || property.longitude > normalized.bbox.east) return false;
      if (property.latitude < normalized.bbox.south || property.latitude > normalized.bbox.north) return false;
    }
    if (normalized.center && distanceKm(normalized.center, property) > normalized.radius_km) return false;
    return true;
  });

  const sorted = rows.slice().sort((left, right) => {
    if (normalized.center) return distanceKm(normalized.center, left) - distanceKm(normalized.center, right);
    return String(left.property_id).localeCompare(String(right.property_id));
  });
  const limited = sorted.slice(0, normalized.limit);

  return {
    schema_version: GEOSPATIAL_INDEX_SCHEMA_VERSION,
    generated_at: Math.floor(Date.now() / 1000),
    filters: {
      lat: normalized.center?.latitude ?? null,
      lng: normalized.center?.longitude ?? null,
      radius_km: normalized.center ? normalized.radius_km : null,
      bbox: normalized.bbox,
      city: normalized.city,
      state: normalized.state,
      zip_code: normalized.zip_code,
      limit: normalized.limit,
    },
    origin: buildOrigin(originProperty, normalized.center),
    count: limited.length,
    total_matches: rows.length,
    properties: limited.map((property) => projectProperty(property, normalized.center)),
    tiles: buildTiles(limited),
    index_summary: {
      spatial_unit: 'property_centroid',
      distance_unit: 'kilometers',
      total_properties: totalProperties,
      indexed_properties: indexed.length,
      coordinate_coverage_percent: totalProperties ? round((indexed.length / totalProperties) * 100, 1) : 0,
      excluded_missing_coordinates: missingCoordinates,
      excluded_bad_geocode: badGeocodes,
    },
    provenance: cloneJson(provenance || {}),
    limitations: [
      'Geospatial rows are public-safe property centroids from the current static provider snapshot.',
      'This is not a parcel-boundary, assessor, title, census, zoning, school-boundary, flood, climate, or live GIS feed.',
      'Distances are approximate haversine measurements and should be validated with provider-backed evidence before settlement.',
    ],
  };
}

module.exports = {
  GEOSPATIAL_INDEX_SCHEMA_VERSION,
  buildGeospatialIndex,
  distanceKm,
  sanitizeLatitude,
  sanitizeLongitude,
};
