const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  PROPERTY_POSTGRES_PROJECTION_SCHEMA_VERSION,
  PROPERTY_TABLE_NAME,
  buildPropertyPostgresRows,
  createPropertyPostgresProjection,
} = require('../propertyPostgresProjection');

function fixtureProperties() {
  return [
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
      streetViewMetadataUrl: 'https://private.example.invalid/street-view',
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
  ];
}

function fixtureManifest() {
  return {
    schema_version: 'fairvalue.propertyDataManifest.v1',
    dataset_id: 'fixture-property-snapshot',
    source_kind: 'static_provider_snapshot',
    source_files: [{ sha256: 'fixture-source-hash' }],
    property_count: 2,
    provider_summary: [{ provider: 'Fixture MLS', count: 2 }],
    freshness: { latest_observed_at: '2026-05-22' },
    field_coverage: [{ field: 'price', coverage_percent: 100 }],
    legal_limitations: ['Fixture snapshot only.'],
  };
}

function createFakeSql() {
  const calls = [];
  let manifestRow = null;
  const propertyRows = [];

  async function sql(strings, ...values) {
    const query = strings.join('?').replace(/\s+/g, ' ').trim();
    calls.push({ query, values });

    if (query.startsWith('CREATE EXTENSION IF NOT EXISTS postgis')) return [];
    if (query.startsWith('CREATE TABLE IF NOT EXISTS fairvalue_property_manifests')) return [];
    if (query.startsWith('CREATE TABLE IF NOT EXISTS fairvalue_properties')) return [];
    if (query.startsWith('CREATE INDEX IF NOT EXISTS fairvalue_properties')) return [];
    if (query.startsWith('DELETE FROM fairvalue_properties')) {
      propertyRows.length = 0;
      return [];
    }
    if (query.startsWith('DELETE FROM fairvalue_property_manifests')) {
      manifestRow = null;
      return [];
    }
    if (query.startsWith('INSERT INTO fairvalue_property_manifests')) {
      manifestRow = {
        dataset_id: values[0],
        schema_version: values[1],
        source_kind: values[2],
        source_sha256: values[3],
        property_count: values[4],
        latest_observed_at: values[5],
        provider_summary: JSON.parse(values[6]),
        field_coverage: JSON.parse(values[7]),
        legal_limitations: JSON.parse(values[8]),
        updated_at: new Date('2026-05-22T00:00:00.000Z'),
      };
      return [];
    }
    if (query.startsWith('INSERT INTO fairvalue_properties')) {
      propertyRows.push({
        property_id: values[0],
        dataset_id: values[1],
        price: values[2],
        address: values[3],
        city: values[4],
        state: values[5],
        zip_code: values[6],
        home_status: values[7],
        home_type: values[8],
        bedrooms: values[9],
        bathrooms: values[10],
        living_area: values[11],
        rent_zestimate: values[12],
        zestimate: values[13],
        tax_assessed_value: values[14],
        year_built: values[15],
        school_rating_average: values[16],
        school_count: values[17],
        latitude: values[18],
        longitude: values[19],
        has_bad_geocode: values[25],
        provider_source: values[26],
        observed_at: values[27],
        source_sha256: values[28],
        raw_public: JSON.parse(values[29]),
      });
      return [];
    }
    if (query.startsWith('SELECT dataset_id')) return manifestRow ? [manifestRow] : [];
    if (query.startsWith('SELECT property_id')) return propertyRows;

    throw new Error(`Unexpected fake SQL query: ${query}`);
  }

  sql.isConfigured = true;
  sql.calls = calls;
  sql.propertyRows = propertyRows;
  return sql;
}

test('property Postgres projection normalizes public-safe rows for PostGIS storage', () => {
  const projection = buildPropertyPostgresRows({
    properties: fixtureProperties(),
    manifest: fixtureManifest(),
  });

  assert.equal(projection.schema_version, PROPERTY_POSTGRES_PROJECTION_SCHEMA_VERSION);
  assert.equal(projection.table_name, PROPERTY_TABLE_NAME);
  assert.equal(projection.count, 2);
  assert.equal(projection.provenance.source_sha256, 'fixture-source-hash');
  assert.equal(projection.rows[0].property_id, '101');
  assert.equal(projection.rows[0].latitude, 37.8044);
  assert.equal(projection.rows[0].longitude, -122.2712);
  assert.equal(projection.rows[0].school_rating_average, 7);
  assert.equal(JSON.stringify(projection.rows).includes('streetViewMetadataUrl'), false);
  assert.match(projection.limitations.join(' '), /PostGIS-ready projection/);
});

test('property Postgres projection writes schema, geography points, manifest, and rows', async () => {
  const sql = createFakeSql();
  const projection = createPropertyPostgresProjection({ sql });

  assert.equal(projection.enabled, true);
  assert.equal(projection.kind, 'postgres-property-projection');

  const written = await projection.replaceSnapshot({
    properties: fixtureProperties(),
    manifest: fixtureManifest(),
  });
  assert.equal(written.count, 2);
  assert.equal(sql.propertyRows.length, 2);
  assert.equal(sql.propertyRows[0].source_sha256, 'fixture-source-hash');
  assert.equal(sql.propertyRows[0].raw_public.address, '10 Query St');

  const queryText = sql.calls.map((call) => call.query).join('\n');
  assert.match(queryText, /CREATE EXTENSION IF NOT EXISTS postgis/);
  assert.match(queryText, /geog geography\(Point, 4326\)/);
  assert.match(queryText, /USING GIST \(geog\)/);
  assert.match(queryText, /ST_SetSRID\(ST_MakePoint/);

  const loaded = await projection.loadSnapshot();
  assert.equal(loaded.count, 2);
  assert.equal(loaded.properties[1].property_id, '102');
  assert.equal(loaded.provenance.dataset_id, 'fixture-property-snapshot');
  assert.equal(loaded.provenance.source_sha256, 'fixture-source-hash');
});

test('property Postgres projection degrades honestly without a configured database', async () => {
  const projection = createPropertyPostgresProjection({
    sql: Object.assign(async () => [], { isConfigured: false }),
  });

  assert.equal(projection.enabled, false);
  assert.equal(projection.kind, 'postgres-property-projection');
  assert.match(projection.reason, /DATABASE_URL/);
  assert.equal((await projection.replaceSnapshot({ properties: fixtureProperties(), manifest: fixtureManifest() })).count, 0);
});
