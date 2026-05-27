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
        latitude: 37.8044,
        longitude: -122.2712,
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
        latitude: 37.8715,
        longitude: -122.2730,
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
        latitude: 37.8060,
        longitude: -122.2698,
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

function createPostgresProjectionSql() {
  const queries = [];
  const sql = async (strings) => {
    const query = strings.join('?').replace(/\s+/g, ' ').trim();
    queries.push(query);
    if (query.startsWith('SELECT dataset_id')) {
      return [
        {
          dataset_id: 'fixture-property-snapshot',
          schema_version: 'fairvalue.propertyDataManifest.v1',
          source_kind: 'static_provider_snapshot',
          source_sha256: 'fixture-postgres-source-hash',
          property_count: 3,
          latest_observed_at: '2026-05-22',
          provider_summary: [{ provider: 'Fixture MLS', count: 2 }],
          field_coverage: [{ field: 'price', coverage_percent: 100 }],
          legal_limitations: ['Fixture PostGIS projection only.'],
        },
      ];
    }
    if (query.startsWith('SELECT property_id')) {
      return [
        {
          property_id: '101',
          price: 700000,
          address: '10 Query St',
          city: 'Oakland',
          state: 'CA',
          zip_code: '94607',
          home_status: 'FOR_SALE',
          home_type: 'CONDO',
          bedrooms: 2,
          bathrooms: 1,
          living_area: 1000,
          rent_zestimate: 3000,
          school_rating_average: 7,
          school_count: 2,
          latitude: 37.8044,
          longitude: -122.2712,
          has_bad_geocode: false,
          provider_source: 'Fixture MLS',
          observed_at: '2026-05-20',
        },
        {
          property_id: '102',
          price: 900000,
          address: '20 Ridge Rd',
          city: 'Berkeley',
          state: 'CA',
          zip_code: '94704',
          home_status: 'FOR_SALE',
          home_type: 'SINGLE_FAMILY',
          bedrooms: 3,
          bathrooms: 2,
          living_area: 1200,
          rent_zestimate: 4200,
          school_rating_average: 7,
          school_count: 1,
          latitude: 37.8715,
          longitude: -122.2730,
          has_bad_geocode: false,
          provider_source: 'Fixture MLS',
          observed_at: '2026-05-21',
        },
        {
          property_id: '103',
          price: 1200000,
          address: '30 Query Ct',
          city: 'Oakland',
          state: 'CA',
          zip_code: '94607',
          home_status: 'RECENTLY_SOLD',
          home_type: 'CONDO',
          bedrooms: 4,
          bathrooms: 2,
          living_area: 1500,
          rent_zestimate: 5000,
          school_rating_average: 4.5,
          school_count: 2,
          latitude: 37.8060,
          longitude: -122.2698,
          has_bad_geocode: false,
          provider_source: 'County export',
          observed_at: '2026-05-22',
        },
      ];
    }
    return [];
  };
  sql.isConfigured = true;
  sql.queries = queries;
  return sql;
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

test('property query APIs can read from an explicit Postgres projection source with static-route parity', async () => {
  const fakeSql = createPostgresProjectionSql();
  const loaded = await configurePropertySnapshot({ mode: 'postgres', sql: fakeSql });
  assert.equal(loaded.source, 'postgres');
  assert.equal(loaded.kind, 'postgres-property-snapshot');
  assert.equal(loaded.source_adapter, 'postgres-postgis-property-snapshot');
  assert.equal(loaded.table_name, 'fairvalue_properties');
  assert.equal(loaded.count, 3);

  const filtered = await request('/api/properties?q=query&city=Oakland&max_price=800000&limit=5');
  assert.equal(filtered.status, 200);
  assert.equal(filtered.data.schema_version, 'fairvalue.propertyQuery.v1');
  assert.equal(filtered.data.source_adapter, 'postgres-postgis-property-snapshot');
  assert.equal(filtered.data.count, 1);
  assert.equal(filtered.data.properties[0].property_id, '101');
  assert.equal(filtered.data.properties[0].address, '10 Query St');
  assert.equal(filtered.data.provenance.source_sha256, 'fixture-postgres-source-hash');

  const one = await request('/api/properties/102');
  assert.equal(one.status, 200);
  assert.equal(one.data.properties[0].address, '20 Ridge Rd');
  assert.equal(one.data.properties[0].school_rating_average, 7);

  const radius = await request('/api/geospatial/properties?lat=37.8044&lng=-122.2712&radius_km=1&limit=5');
  assert.equal(radius.status, 200);
  assert.equal(radius.data.properties[0].property_id, '101');
  assert.equal(radius.data.properties[0].distance_km, 0);
  assert.equal(radius.data.provenance.source_sha256, 'fixture-postgres-source-hash');

  const drafts = await request('/api/neighborhoods/94607/market-drafts');
  assert.equal(drafts.status, 200);
  assert.equal(drafts.data.neighborhood_entity_id, 'zip:CA:94607');
  assert.equal(drafts.data.drafts[0].default_config.baseline_median_price, 950000);
  assert.equal(JSON.stringify(drafts.data).includes('streetView'), false);
  assert.equal(fakeSql.queries.some((query) => query.includes('FROM fairvalue_properties')), true);
});

test('explicit Postgres projection source fails closed when no database is configured', async () => {
  configureFixtureSnapshot();

  await assert.rejects(
    () => configurePropertySnapshot({
      mode: 'postgres',
      sql: Object.assign(async () => [], { isConfigured: false }),
    }),
    /Postgres property snapshot requested.*DATABASE_URL/
  );

  const stillStatic = await request('/api/properties/101');
  assert.equal(stillStatic.status, 200);
  assert.equal(stillStatic.data.properties[0].property_id, '101');
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
  assert.equal(priceMomentum.template_status, 'playable');
  assert.equal(priceMomentum.pricing_engine, 'lmsr_binary_v1');
  assert.equal(priceMomentum.baseline.value, 950000);
  assert.equal(priceMomentum.default_config.baseline_median_price, 950000);
  assert.equal(priceMomentum.default_config.price_momentum_threshold, 978500);
  assert.match(priceMomentum.trust_notice, /Playable simulation-credit/);
  const rentYield = drafts.data.drafts.find(
    (draft) => draft.market_format === 'neighborhood_rent_yield_over_under'
  );
  assert.equal(rentYield.template_status, 'draft_only');
  assert.equal(rentYield.baseline.value, 0.05);
  assert.equal(rentYield.default_config.yield_threshold, 0.055);
  assert.equal(drafts.data.provenance.source_sha256, 'fixture-source-hash');
  assert.match(drafts.data.limitations.join(' '), /other neighborhood scenario contracts remain draft-only/);

  const missing = await request('/api/neighborhoods/99999');
  assert.equal(missing.status, 404);
  assert.match(missing.data.error, /Neighborhood entity not found/);

  const missingDrafts = await request('/api/neighborhoods/99999/market-drafts');
  assert.equal(missingDrafts.status, 404);
  assert.match(missingDrafts.data.error, /Neighborhood entity not found/);
});

test('geospatial property API exposes centroid radius, bbox, and nearby queries with provenance', async () => {
  configureFixtureSnapshot();

  const radius = await request('/api/geospatial/properties?lat=37.8044&lng=-122.2712&radius_km=1&limit=5');
  assert.equal(radius.status, 200);
  assert.equal(radius.data.schema_version, 'fairvalue.geospatialIndex.v1');
  assert.equal(radius.data.filters.lat, 37.8044);
  assert.equal(radius.data.filters.lng, -122.2712);
  assert.equal(radius.data.filters.radius_km, 1);
  assert.equal(radius.data.count, 2);
  assert.equal(radius.data.total_matches, 2);
  assert.equal(radius.data.properties[0].property_id, '101');
  assert.equal(radius.data.properties[0].spatial_unit, 'property_centroid');
  assert.equal(radius.data.properties[0].geocode_quality, 'provider_centroid');
  assert.equal(radius.data.properties[0].distance_km, 0);
  assert.equal(radius.data.index_summary.indexed_properties, 3);
  assert.equal(radius.data.index_summary.coordinate_coverage_percent, 100);
  assert.equal(radius.data.tiles[0].spatial_unit, '0.01_degree_grid_cell');
  assert.equal(radius.data.provenance.source_sha256, 'fixture-source-hash');
  assert.equal(JSON.stringify(radius.data).includes('streetView'), false);
  assert.match(radius.data.limitations.join(' '), /not a parcel-boundary/);

  const bbox = await request('/api/geospatial/properties?west=-122.272&south=37.804&east=-122.268&north=37.807&limit=10');
  assert.equal(bbox.status, 200);
  assert.deepEqual(bbox.data.properties.map((property) => property.property_id), ['101', '103']);
  assert.equal(bbox.data.filters.bbox.west, -122.272);
  assert.equal(bbox.data.filters.bbox.north, 37.807);

  const nearby = await request('/api/properties/101/nearby?radius_km=15&limit=5');
  assert.equal(nearby.status, 200);
  assert.equal(nearby.data.origin.kind, 'property');
  assert.equal(nearby.data.origin.property_id, '101');
  assert.equal(nearby.data.properties.some((property) => property.property_id === '101'), false);
  assert.equal(nearby.data.properties[0].property_id, '103');
  assert.equal(nearby.data.properties[1].property_id, '102');

  const missing = await request('/api/properties/not-found/nearby');
  assert.equal(missing.status, 404);
  assert.match(missing.data.error, /Property not found/);
});
