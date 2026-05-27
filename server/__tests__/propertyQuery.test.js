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
        bedrooms: 2,
        bathrooms: 1,
        livingArea: 1000,
        rentZestimate: 3000,
        homeType: 'CONDO',
        schools: [{ rating: 6 }, { rating: 8 }],
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
        bedrooms: 3,
        bathrooms: 2,
        livingArea: 1200,
        rentZestimate: 4200,
        homeType: 'SINGLE_FAMILY',
        schools: [{ rating: 7 }],
        homeStatus: 'FOR_SALE',
        listingDataSource: 'Fixture MLS',
        attributionInfo: { lastUpdated: '2026-05-21' },
      },
      {
        zpid: 103,
        streetAddress: '30 Query Ct',
        city: 'Oakland',
        state: 'CA',
        zipcode: '94607',
        price: 1200000,
        bedrooms: 4,
        bathrooms: 2,
        livingArea: 1500,
        rentZestimate: 5000,
        homeType: 'CONDO',
        schools: [{ rating: 4 }, { rating: 5 }],
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

test('neighborhood API builds static zip entities with aggregate metrics and provenance', async () => {
  configureFixtureSnapshot();

  const indexed = await request('/api/neighborhoods?city=Oakland&min_properties=2');
  assert.equal(indexed.status, 200);
  assert.equal(indexed.data.schema_version, 'fairvalue.neighborhoodIndex.v1');
  assert.equal(indexed.data.count, 1);
  assert.equal(indexed.data.total_matches, 1);
  assert.equal(indexed.data.filters.city, 'Oakland');
  assert.equal(indexed.data.filters.min_properties, 2);
  const entity = indexed.data.entities[0];
  assert.equal(entity.entity_id, 'zip:CA:94607');
  assert.equal(entity.entity_type, 'zip_code');
  assert.equal(entity.city, 'Oakland');
  assert.equal(entity.property_count, 2);
  assert.equal(entity.metrics.median_price, 950000);
  assert.equal(entity.metrics.median_price_per_sqft, 750);
  assert.equal(entity.metrics.median_rent_estimate, 4000);
  assert.equal(entity.metrics.average_school_rating, 5.75);
  assert.equal(entity.home_type_mix[0].value, 'CONDO');
  assert.equal(entity.home_type_mix[0].count, 2);
  assert.equal(entity.sample_confidence, 'directional_only');
  assert.equal(entity.sample_properties[0].property_id, '103');
  assert.equal(indexed.data.provenance.source_sha256, 'fixture-source-hash');
  assert.equal(JSON.stringify(indexed.data).includes('streetView'), false);
  assert.match(indexed.data.limitations.join(' '), /static ZIP-code aggregates/);

  const single = await request('/api/neighborhoods/94607');
  assert.equal(single.status, 200);
  assert.equal(single.data.entities[0].entity_id, 'zip:CA:94607');

  const drafts = await request('/api/neighborhoods/94607/market-drafts');
  assert.equal(drafts.status, 200);
  assert.equal(drafts.data.schema_version, 'fairvalue.neighborhoodMarketDrafts.v1');
  assert.equal(drafts.data.neighborhood_entity_id, 'zip:CA:94607');
  assert.equal(drafts.data.zip_code, '94607');
  assert.equal(drafts.data.count, 3);
  assert.deepEqual(drafts.data.template_formats, [
    'neighborhood_price_momentum_over_under',
    'neighborhood_rent_yield_over_under',
    'neighborhood_outperformance_over_under',
  ]);
  const priceMomentum = drafts.data.drafts.find(
    (draft) => draft.market_format === 'neighborhood_price_momentum_over_under'
  );
  assert.equal(priceMomentum.template_status, 'draft_only');
  assert.equal(priceMomentum.pricing_engine, 'pending_neighborhood_market_engine');
  assert.equal(priceMomentum.baseline.value, 950000);
  assert.equal(priceMomentum.default_config.price_momentum_threshold, 978500);
  assert.match(priceMomentum.trust_notice, /Draft-only scenario contract/);
  const rentYield = drafts.data.drafts.find(
    (draft) => draft.market_format === 'neighborhood_rent_yield_over_under'
  );
  assert.equal(rentYield.baseline.value, 0.05);
  assert.equal(rentYield.default_config.yield_threshold, 0.055);
  assert.equal(drafts.data.provenance.source_sha256, 'fixture-source-hash');
  assert.match(drafts.data.limitations.join(' '), /not playable rooms/);

  const missing = await request('/api/neighborhoods/99999');
  assert.equal(missing.status, 404);
  assert.match(missing.data.error, /Neighborhood entity not found/);

  const missingDrafts = await request('/api/neighborhoods/99999/market-drafts');
  assert.equal(missingDrafts.status, 404);
  assert.match(missingDrafts.data.error, /Neighborhood entity not found/);
});
