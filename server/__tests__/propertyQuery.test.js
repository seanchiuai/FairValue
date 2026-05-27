const { after, afterEach, before, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  server,
  configurePropertySnapshot,
} = require('../index');

let baseUrl;

function listen() {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
}

function close() {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function request(pathname) {
  const res = await fetch(`${baseUrl}${pathname}`);
  const data = await res.json();
  return { status: res.status, data };
}

function configureFixtureSnapshot() {
  configurePropertySnapshot({
    properties: [
      {
        zpid: 101,
        streetAddress: '10 Query St',
        city: 'Oakland',
        state: 'CA',
        zipcode: '94607',
        price: 700000,
        homeStatus: 'FOR_SALE',
        listingDataSource: 'Fixture MLS',
        attributionInfo: { lastUpdated: '2026-05-20' },
      },
      {
        zpid: 102,
        streetAddress: '20 Ridge Rd',
        city: 'Berkeley',
        state: 'CA',
        zipcode: '94704',
        price: 900000,
        homeStatus: 'FOR_SALE',
        listingDataSource: 'Fixture MLS',
        attributionInfo: { lastUpdated: '2026-05-21' },
      },
      {
        zpid: 103,
        streetAddress: '30 Query Ct',
        city: 'Oakland',
        state: 'CA',
        zipcode: '94612',
        price: 1200000,
        homeStatus: 'RECENTLY_SOLD',
        listingDataSource: 'County export',
        attributionInfo: { lastChecked: '2026-05-22' },
      },
    ],
    manifest: {
      schema_version: 'fairvalue.propertyDataManifest.v1',
      dataset_id: 'fixture-property-snapshot',
      source_kind: 'static_provider_snapshot',
      source_files: [{ sha256: 'fixture-source-hash' }],
      property_count: 3,
      provider_summary: [{ provider: 'Fixture MLS', count: 2 }],
      freshness: { latest_observed_at: '2026-05-22' },
      field_coverage: [{ field: 'price', coverage_percent: 100 }],
      legal_limitations: ['Fixture snapshot only.'],
    },
  });
}

before(() => listen());

afterEach(() => {
  configurePropertySnapshot(null);
});

after(() => close());

test('property query API filters the manifest-backed snapshot with provenance', async () => {
  configureFixtureSnapshot();

  const filtered = await request('/api/properties?q=query&city=Oakland&max_price=800000&limit=5');
  assert.equal(filtered.status, 200);
  assert.equal(filtered.data.schema_version, 'fairvalue.propertyQuery.v1');
  assert.equal(filtered.data.count, 1);
  assert.equal(filtered.data.total_matches, 1);
  assert.equal(filtered.data.filters.q, 'query');
  assert.equal(filtered.data.filters.city, 'Oakland');
  assert.equal(filtered.data.properties[0].property_id, '101');
  assert.equal(filtered.data.properties[0].address, '10 Query St');
  assert.equal(filtered.data.provenance.schema_version, 'fairvalue.propertyDataManifest.v1');
  assert.equal(filtered.data.provenance.source_sha256, 'fixture-source-hash');
  assert.equal(filtered.data.provenance.latest_observed_at, '2026-05-22');
  assert.equal(JSON.stringify(filtered.data).includes('streetView'), false);
});

test('property query API supports ID lists, limit caps, and single-property lookup', async () => {
  configureFixtureSnapshot();

  const limited = await request('/api/properties?ids=102,101&limit=1');
  assert.equal(limited.status, 200);
  assert.equal(limited.data.count, 1);
  assert.equal(limited.data.total_matches, 2);
  assert.equal(limited.data.filters.ids.length, 2);
  assert.equal(limited.data.properties[0].property_id, '101');

  const one = await request('/api/properties/102');
  assert.equal(one.status, 200);
  assert.equal(one.data.count, 1);
  assert.equal(one.data.properties[0].address, '20 Ridge Rd');

  const missing = await request('/api/properties/not-found');
  assert.equal(missing.status, 404);
  assert.match(missing.data.error, /Property not found/);
});
