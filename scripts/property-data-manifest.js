const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_VERSION = 'fairvalue.propertyDataManifest.v1';
const DEFAULT_SOURCE_PATH = path.join(__dirname, '..', 'public', 'data', 'properties.json');
const DEFAULT_OUTPUT_PATH = path.join(__dirname, '..', 'public', 'data', 'property-data-manifest.json');

const TRACKED_FIELDS = [
  { key: 'zpid', label: 'Provider property id', critical: true },
  { key: 'address', label: 'Street address', critical: true },
  { key: 'price', label: 'Asking price', critical: true },
  { key: 'zestimate', label: 'Zestimate', critical: false },
  { key: 'rentZestimate', label: 'Rent estimate', critical: false },
  { key: 'bedrooms', label: 'Bedrooms', critical: false },
  { key: 'bathrooms', label: 'Bathrooms', critical: false },
  { key: 'livingArea', label: 'Living area', critical: false },
  { key: 'yearBuilt', label: 'Year built', critical: false },
  { key: 'homeType', label: 'Home type', critical: false },
  { key: 'propertyTaxRate', label: 'Property tax rate', critical: false },
  { key: 'schools', label: 'Schools', critical: false },
  { key: 'priceHistory', label: 'Price history', critical: false },
  { key: 'attributionInfo', label: 'Attribution', critical: false },
  { key: 'coordinates', label: 'Coordinates', critical: false },
  { key: 'photos', label: 'Photos', critical: false },
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function roundPct(value) {
  return Math.round(value * 10) / 10;
}

function compactText(value, maxLength = 140) {
  if (typeof value !== 'string') return '';
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function addressOf(raw) {
  const address = raw.address && typeof raw.address === 'object' ? raw.address : {};
  return compactText(raw.streetAddress || address.streetAddress || '');
}

function cityStateZipOf(raw) {
  const address = raw.address && typeof raw.address === 'object' ? raw.address : {};
  return {
    city: compactText(raw.city || address.city || ''),
    state: compactText(raw.state || address.state || ''),
    zip: compactText(raw.zipcode || address.zipcode || ''),
  };
}

function providerSourceOf(raw) {
  const attribution = raw.attributionInfo && typeof raw.attributionInfo === 'object'
    ? raw.attributionInfo
    : {};
  const priceHistorySource = Array.isArray(raw.priceHistory)
    ? raw.priceHistory.find((entry) => entry && typeof entry.source === 'string' && entry.source.trim())?.source
    : '';
  return compactText(
    attribution.mlsName ||
    raw.listingDataSource ||
    raw.listingSource ||
    priceHistorySource ||
    'Zillow static property snapshot',
    100
  );
}

function extractDate(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/\d{4}-\d{2}-\d{2}/);
  if (!match) return null;
  return match[0];
}

function sourceDatesOf(raw) {
  const dates = [];
  const attribution = raw.attributionInfo && typeof raw.attributionInfo === 'object'
    ? raw.attributionInfo
    : {};
  for (const value of [attribution.lastChecked, attribution.lastUpdated, raw.datePostedString]) {
    const date = extractDate(value);
    if (date) dates.push(date);
  }
  if (Array.isArray(raw.priceHistory)) {
    for (const entry of raw.priceHistory) {
      const date = extractDate(entry?.date);
      if (date) dates.push(date);
    }
  }
  return dates.sort();
}

function hasField(raw, key) {
  if (key === 'address') return Boolean(addressOf(raw));
  if (key === 'coordinates') return Number.isFinite(raw.latitude) && Number.isFinite(raw.longitude);
  if (key === 'photos') {
    return Array.isArray(raw.responsivePhotos) && raw.responsivePhotos.some((photo) => {
      const jpegs = photo?.mixedSources?.jpeg;
      return Array.isArray(jpegs) && jpegs.some((source) => source?.url);
    });
  }
  const value = raw[key];
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== null && value !== undefined;
}

function fieldCoverageFor(raw) {
  const present = [];
  const missing = [];
  const missingCritical = [];
  for (const field of TRACKED_FIELDS) {
    if (hasField(raw, field.key)) {
      present.push(field.key);
    } else {
      missing.push(field.key);
      if (field.critical) missingCritical.push(field.key);
    }
  }
  return {
    present,
    missing,
    missingCritical,
    coveragePercent: roundPct((present.length / TRACKED_FIELDS.length) * 100),
  };
}

function disclaimerDigestOf(raw) {
  const disclaimer = raw.attributionInfo?.mlsDisclaimer;
  if (typeof disclaimer !== 'string' || !disclaimer.trim()) return null;
  return {
    sha256: sha256(disclaimer),
    excerpt: compactText(disclaimer, 180),
  };
}

function buildPropertyRecord(raw, index) {
  const coverage = fieldCoverageFor(raw);
  const dates = sourceDatesOf(raw);
  const location = cityStateZipOf(raw);
  return {
    property_id: String(raw.zpid || index + 1),
    address: addressOf(raw),
    city: location.city,
    state: location.state,
    zip: location.zip,
    provider_source: providerSourceOf(raw),
    last_observed_at: dates[dates.length - 1] || null,
    field_coverage_percent: coverage.coveragePercent,
    missing_fields: coverage.missing,
    missing_critical_fields: coverage.missingCritical,
    legal_disclaimer: disclaimerDigestOf(raw),
  };
}

function summarizeProviders(records) {
  const counts = new Map();
  for (const record of records) {
    counts.set(record.provider_source, (counts.get(record.provider_source) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([provider, count]) => ({ provider, count }))
    .sort((left, right) => right.count - left.count || left.provider.localeCompare(right.provider));
}

function summarizeFieldCoverage(rawProperties) {
  return TRACKED_FIELDS.map((field) => {
    const present = rawProperties.filter((raw) => hasField(raw, field.key)).length;
    return {
      field: field.key,
      label: field.label,
      critical: field.critical,
      present,
      missing: rawProperties.length - present,
      coverage_percent: rawProperties.length ? roundPct((present / rawProperties.length) * 100) : 0,
    };
  });
}

function summarizeFreshness(records) {
  const observedDates = records
    .map((record) => record.last_observed_at)
    .filter(Boolean)
    .sort();
  return {
    dated_records: observedDates.length,
    undated_records: records.length - observedDates.length,
    earliest_observed_at: observedDates[0] || null,
    latest_observed_at: observedDates[observedDates.length - 1] || null,
  };
}

function buildManifest(rawProperties, sourceContent, sourcePath = DEFAULT_SOURCE_PATH) {
  if (!Array.isArray(rawProperties)) {
    throw new Error('Property data must be a JSON array');
  }
  const records = rawProperties.map(buildPropertyRecord);
  const sourceFile = {
    path: path.relative(path.join(__dirname, '..'), sourcePath),
    bytes: Buffer.byteLength(sourceContent),
    sha256: sha256(sourceContent),
  };
  return {
    schema_version: SCHEMA_VERSION,
    dataset_id: 'fairvalue-static-zillow-san-francisco-snapshot',
    source_kind: 'static_provider_snapshot',
    source_files: [sourceFile],
    property_count: records.length,
    provider_summary: summarizeProviders(records),
    freshness: summarizeFreshness(records),
    field_coverage: summarizeFieldCoverage(rawProperties),
    legal_limitations: [
      'This is a static provider snapshot, not a live listing feed.',
      'MLS/Zillow attribution remains the source of record; FairValue does not verify measurements, calculations, school data, estimates, or listing status.',
      'Prediction markets must settle from independent public-safe evidence such as sale records, appraisals, or host-attested documents.',
    ],
    records,
  };
}

function stringifyManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function loadManifestSource(sourcePath = DEFAULT_SOURCE_PATH) {
  const sourceContent = fs.readFileSync(sourcePath, 'utf8');
  return {
    sourceContent,
    rawProperties: JSON.parse(sourceContent),
  };
}

function writeManifest({ sourcePath = DEFAULT_SOURCE_PATH, outputPath = DEFAULT_OUTPUT_PATH, check = false } = {}) {
  const { sourceContent, rawProperties } = loadManifestSource(sourcePath);
  const manifest = buildManifest(rawProperties, sourceContent, sourcePath);
  const nextContent = stringifyManifest(manifest);
  if (check) {
    const currentContent = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
    if (currentContent !== nextContent) {
      throw new Error(`Property data manifest is out of date. Run npm run data:manifest to update ${path.relative(process.cwd(), outputPath)}.`);
    }
    return { manifest, outputPath, changed: false };
  }
  const currentContent = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
  if (currentContent !== nextContent) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, nextContent);
    return { manifest, outputPath, changed: true };
  }
  return { manifest, outputPath, changed: false };
}

function main() {
  const args = new Set(process.argv.slice(2));
  const result = writeManifest({ check: args.has('--check') });
  const relativeOutput = path.relative(process.cwd(), result.outputPath);
  const action = args.has('--check') ? 'checked' : result.changed ? 'wrote' : 'unchanged';
  console.log(JSON.stringify({
    ok: true,
    action,
    output: relativeOutput,
    schema_version: result.manifest.schema_version,
    property_count: result.manifest.property_count,
    source_sha256: result.manifest.source_files[0]?.sha256,
  }, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

module.exports = {
  SCHEMA_VERSION,
  buildManifest,
  stringifyManifest,
  writeManifest,
};
