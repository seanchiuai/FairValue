const assert = require('node:assert/strict');
const test = require('node:test');
const { buildManifest, SCHEMA_VERSION } = require('../../scripts/property-data-manifest');

const sourceFixture = JSON.stringify([
  {
    zpid: 101,
    streetAddress: '1 Test Ave',
    city: 'San Francisco',
    state: 'CA',
    zipcode: '94110',
    price: 900000,
    zestimate: 925000,
    rentZestimate: 4200,
    bedrooms: 2,
    bathrooms: 1,
    livingArea: 1000,
    yearBuilt: 1912,
    homeType: 'CONDO',
    propertyTaxRate: 1.18,
    latitude: 37.75,
    longitude: -122.41,
    responsivePhotos: [{ mixedSources: { jpeg: [{ url: 'https://example.test/photo.jpg' }] } }],
    schools: [{ name: 'Test School' }],
    priceHistory: [{ date: '2026-02-07', event: 'Listed', price: 900000, source: 'MLSListings Inc' }],
    attributionInfo: {
      mlsName: 'MLSListings',
      lastChecked: '2026-02-07 14:00:29 PST',
      mlsDisclaimer: 'Provider disclaimer text. Data should be independently verified.',
    },
  },
  {
    zpid: 102,
    address: { streetAddress: '2 Sparse St', city: 'San Francisco', state: 'CA', zipcode: '94110' },
    price: 0,
  },
]);

test('property data manifest summarizes provider snapshot provenance and coverage', () => {
  const rawProperties = JSON.parse(sourceFixture);
  const manifest = buildManifest(rawProperties, sourceFixture, '/repo/public/data/properties.json');

  assert.equal(manifest.schema_version, SCHEMA_VERSION);
  assert.equal(manifest.property_count, 2);
  assert.deepEqual(manifest.provider_summary[0], { provider: 'MLSListings', count: 1 });
  assert.equal(manifest.freshness.latest_observed_at, '2026-02-07');
  assert.equal(manifest.source_files[0].sha256.length, 64);

  const priceCoverage = manifest.field_coverage.find((field) => field.field === 'price');
  assert.equal(priceCoverage.present, 1);
  assert.equal(priceCoverage.missing, 1);
  assert.equal(priceCoverage.critical, true);

  const sparseRecord = manifest.records.find((record) => record.property_id === '102');
  assert.deepEqual(sparseRecord.missing_critical_fields, ['price']);
  assert.equal(sparseRecord.provider_source, 'Zillow static property snapshot');
});

test('property data manifest stores legal disclaimer digests without raw long text dependence', () => {
  const rawProperties = JSON.parse(sourceFixture);
  const manifest = buildManifest(rawProperties, sourceFixture, '/repo/public/data/properties.json');
  const record = manifest.records[0];

  assert.equal(record.legal_disclaimer.sha256.length, 64);
  assert.match(record.legal_disclaimer.excerpt, /Provider disclaimer text/);
  assert.ok(manifest.legal_limitations.some((note) => note.includes('static provider snapshot')));
});
