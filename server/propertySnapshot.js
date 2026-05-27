const fs = require('fs');
const path = require('path');

const DEFAULT_PROPERTY_SNAPSHOT_PATH = path.join(__dirname, '..', 'public', 'data', 'properties.json');

function sanitizeText(value, maxLength = 160) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function sanitizePrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 100_000_000) return null;
  return Math.round(number * 100) / 100;
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

function createPropertySnapshot({ filePath = DEFAULT_PROPERTY_SNAPSHOT_PATH, properties = null } = {}) {
  let loaded = false;
  let byId = new Map();

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
    loaded = true;
    return { count: byId.size, filePath };
  }

  function ensureLoaded() {
    if (!loaded) load();
  }

  function getById(propertyId) {
    ensureLoaded();
    const property = byId.get(String(propertyId || '').trim());
    return property ? JSON.parse(JSON.stringify(property)) : null;
  }

  function query({ ids = [], limit = 50 } = {}) {
    ensureLoaded();
    const wanted = new Set(ids.map((id) => String(id || '').trim()).filter(Boolean));
    const rows = Array.from(byId.values())
      .filter((property) => wanted.size === 0 || wanted.has(property.property_id))
      .slice(0, Math.max(1, Math.min(Number(limit) || 50, 250)));
    return JSON.parse(JSON.stringify(rows));
  }

  return {
    kind: Array.isArray(properties) ? 'memory-property-snapshot' : 'json-property-snapshot',
    filePath,
    load,
    getById,
    query,
  };
}

module.exports = {
  DEFAULT_PROPERTY_SNAPSHOT_PATH,
  createPropertySnapshot,
  mapRawProperty,
};
