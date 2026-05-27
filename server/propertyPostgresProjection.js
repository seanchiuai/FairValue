const { mapRawProperty } = require('./propertySnapshot');

const PROPERTY_POSTGRES_PROJECTION_SCHEMA_VERSION = 'fairvalue.propertyPostgresProjection.v1';
const PROPERTY_TABLE_NAME = 'fairvalue_properties';
const PROPERTY_MANIFEST_TABLE_NAME = 'fairvalue_property_manifests';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function manifestProjection(manifest = {}) {
  const sourceFile = Array.isArray(manifest.source_files) ? manifest.source_files[0] || {} : {};
  return {
    schema_version: manifest.schema_version || null,
    dataset_id: manifest.dataset_id || 'static-provider-snapshot',
    source_kind: manifest.source_kind || 'static_provider_snapshot',
    source_sha256: manifest.source_sha256 || sourceFile.sha256 || null,
    property_count: Number.isFinite(Number(manifest.property_count)) ? Number(manifest.property_count) : null,
    latest_observed_at: manifest.freshness?.latest_observed_at || null,
    provider_summary: Array.isArray(manifest.provider_summary) ? manifest.provider_summary.slice(0, 12) : [],
    field_coverage: Array.isArray(manifest.field_coverage) ? manifest.field_coverage.slice(0, 30) : [],
    legal_limitations: Array.isArray(manifest.legal_limitations) ? manifest.legal_limitations.slice(0, 12) : [],
  };
}

function buildPropertyPostgresRows({ properties = [], manifest = {} } = {}) {
  const provenance = manifestProjection(manifest);
  const rows = (Array.isArray(properties) ? properties : [])
    .map((property, index) => mapRawProperty(property, index))
    .filter((property) => property.property_id && property.price)
    .map((property) => ({
      ...property,
      dataset_id: provenance.dataset_id,
      source_sha256: provenance.source_sha256,
      projection_schema_version: PROPERTY_POSTGRES_PROJECTION_SCHEMA_VERSION,
      raw_public: cloneJson(property),
    }));

  return {
    schema_version: PROPERTY_POSTGRES_PROJECTION_SCHEMA_VERSION,
    table_name: PROPERTY_TABLE_NAME,
    manifest_table_name: PROPERTY_MANIFEST_TABLE_NAME,
    count: rows.length,
    rows,
    provenance,
    limitations: [
      'This is a PostGIS-ready projection of the current static provider snapshot, not a live ingestion feed.',
      'The geography point is derived from provider centroids and is not parcel, title, zoning, or boundary evidence.',
      'Raw provider payloads are not stored by this projection; only public-safe normalized fields and manifest provenance are written.',
    ],
  };
}

function rowFromPostgres(row = {}) {
  return {
    property_id: String(row.property_id || ''),
    price: row.price == null ? null : Number(row.price),
    address: row.address || '',
    city: row.city || '',
    state: row.state || '',
    zip_code: row.zip_code || '',
    home_status: row.home_status || '',
    home_type: row.home_type || '',
    bedrooms: row.bedrooms == null ? null : Number(row.bedrooms),
    bathrooms: row.bathrooms == null ? null : Number(row.bathrooms),
    living_area: row.living_area == null ? null : Number(row.living_area),
    rent_zestimate: row.rent_zestimate == null ? null : Number(row.rent_zestimate),
    zestimate: row.zestimate == null ? null : Number(row.zestimate),
    tax_assessed_value: row.tax_assessed_value == null ? null : Number(row.tax_assessed_value),
    year_built: row.year_built == null ? null : Number(row.year_built),
    school_rating_average: row.school_rating_average == null ? null : Number(row.school_rating_average),
    school_count: row.school_count == null ? 0 : Number(row.school_count),
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    has_bad_geocode: row.has_bad_geocode === true,
    provider_source: row.provider_source || '',
    observed_at: row.observed_at || null,
  };
}

function disabledProjection(reason) {
  return {
    enabled: false,
    kind: 'postgres-property-projection',
    reason,
    tableName: PROPERTY_TABLE_NAME,
    manifestTableName: PROPERTY_MANIFEST_TABLE_NAME,
    async ensureSchema() {
      return { enabled: false, reason };
    },
    async replaceSnapshot() {
      return { enabled: false, reason, count: 0 };
    },
    async loadSnapshot() {
      return { enabled: false, reason, properties: [], provenance: manifestProjection() };
    },
  };
}

function createPropertyPostgresProjection({ sql } = {}) {
  if (!sql || sql.isConfigured === false) {
    return disabledProjection('DATABASE_URL is not configured');
  }

  let schemaReady = false;

  async function ensureSchema() {
    if (schemaReady) return { enabled: true, already_ready: true };
    await sql`CREATE EXTENSION IF NOT EXISTS postgis`;
    await sql`
      CREATE TABLE IF NOT EXISTS fairvalue_property_manifests (
        dataset_id text PRIMARY KEY,
        schema_version text,
        source_kind text,
        source_sha256 text,
        property_count integer,
        latest_observed_at text,
        provider_summary jsonb NOT NULL DEFAULT '[]'::jsonb,
        field_coverage jsonb NOT NULL DEFAULT '[]'::jsonb,
        legal_limitations jsonb NOT NULL DEFAULT '[]'::jsonb,
        projection_schema_version text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS fairvalue_properties (
        property_id text PRIMARY KEY,
        dataset_id text NOT NULL REFERENCES fairvalue_property_manifests(dataset_id) ON DELETE CASCADE,
        price numeric,
        address text NOT NULL,
        city text,
        state text,
        zip_code text,
        home_status text,
        home_type text,
        bedrooms numeric,
        bathrooms numeric,
        living_area numeric,
        rent_zestimate numeric,
        zestimate numeric,
        tax_assessed_value numeric,
        year_built integer,
        school_rating_average numeric,
        school_count integer NOT NULL DEFAULT 0,
        latitude double precision,
        longitude double precision,
        geog geography(Point, 4326),
        has_bad_geocode boolean NOT NULL DEFAULT false,
        provider_source text,
        observed_at text,
        source_sha256 text,
        raw_public jsonb NOT NULL DEFAULT '{}'::jsonb,
        projection_schema_version text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS fairvalue_properties_geog_gix ON fairvalue_properties USING GIST (geog)`;
    await sql`CREATE INDEX IF NOT EXISTS fairvalue_properties_city_state_idx ON fairvalue_properties (city, state)`;
    await sql`CREATE INDEX IF NOT EXISTS fairvalue_properties_zip_idx ON fairvalue_properties (zip_code)`;
    schemaReady = true;
    return {
      enabled: true,
      table_name: PROPERTY_TABLE_NAME,
      manifest_table_name: PROPERTY_MANIFEST_TABLE_NAME,
      projection_schema_version: PROPERTY_POSTGRES_PROJECTION_SCHEMA_VERSION,
    };
  }

  async function replaceSnapshot({ properties = [], manifest = {} } = {}) {
    const projection = buildPropertyPostgresRows({ properties, manifest });
    await ensureSchema();
    await sql`DELETE FROM fairvalue_properties`;
    await sql`DELETE FROM fairvalue_property_manifests`;
    await sql`
      INSERT INTO fairvalue_property_manifests (
        dataset_id,
        schema_version,
        source_kind,
        source_sha256,
        property_count,
        latest_observed_at,
        provider_summary,
        field_coverage,
        legal_limitations,
        projection_schema_version
      ) VALUES (
        ${projection.provenance.dataset_id},
        ${projection.provenance.schema_version},
        ${projection.provenance.source_kind},
        ${projection.provenance.source_sha256},
        ${projection.count},
        ${projection.provenance.latest_observed_at},
        ${JSON.stringify(projection.provenance.provider_summary)},
        ${JSON.stringify(projection.provenance.field_coverage)},
        ${JSON.stringify(projection.provenance.legal_limitations)},
        ${PROPERTY_POSTGRES_PROJECTION_SCHEMA_VERSION}
      )
    `;
    for (const row of projection.rows) {
      await sql`
        INSERT INTO fairvalue_properties (
          property_id,
          dataset_id,
          price,
          address,
          city,
          state,
          zip_code,
          home_status,
          home_type,
          bedrooms,
          bathrooms,
          living_area,
          rent_zestimate,
          zestimate,
          tax_assessed_value,
          year_built,
          school_rating_average,
          school_count,
          latitude,
          longitude,
          geog,
          has_bad_geocode,
          provider_source,
          observed_at,
          source_sha256,
          raw_public,
          projection_schema_version
        ) VALUES (
          ${row.property_id},
          ${row.dataset_id},
          ${row.price},
          ${row.address},
          ${row.city},
          ${row.state},
          ${row.zip_code},
          ${row.home_status},
          ${row.home_type},
          ${row.bedrooms},
          ${row.bathrooms},
          ${row.living_area},
          ${row.rent_zestimate},
          ${row.zestimate},
          ${row.tax_assessed_value},
          ${row.year_built},
          ${row.school_rating_average},
          ${row.school_count},
          ${row.latitude},
          ${row.longitude},
          CASE
            WHEN ${row.latitude}::double precision IS NULL OR ${row.longitude}::double precision IS NULL OR ${row.has_bad_geocode}
            THEN NULL
            ELSE ST_SetSRID(ST_MakePoint(${row.longitude}, ${row.latitude}), 4326)::geography
          END,
          ${row.has_bad_geocode},
          ${row.provider_source},
          ${row.observed_at},
          ${row.source_sha256},
          ${JSON.stringify(row.raw_public)},
          ${PROPERTY_POSTGRES_PROJECTION_SCHEMA_VERSION}
        )
      `;
    }

    return projection;
  }

  async function loadSnapshot() {
    await ensureSchema();
    const manifestRows = await sql`
      SELECT
        dataset_id,
        schema_version,
        source_kind,
        source_sha256,
        property_count,
        latest_observed_at,
        provider_summary,
        field_coverage,
        legal_limitations
      FROM fairvalue_property_manifests
      ORDER BY updated_at DESC
      LIMIT 1
    `;
    const propertyRows = await sql`
      SELECT
        property_id,
        price,
        address,
        city,
        state,
        zip_code,
        home_status,
        home_type,
        bedrooms,
        bathrooms,
        living_area,
        rent_zestimate,
        zestimate,
        tax_assessed_value,
        year_built,
        school_rating_average,
        school_count,
        latitude,
        longitude,
        has_bad_geocode,
        provider_source,
        observed_at
      FROM fairvalue_properties
      ORDER BY property_id
    `;
    return {
      enabled: true,
      schema_version: PROPERTY_POSTGRES_PROJECTION_SCHEMA_VERSION,
      table_name: PROPERTY_TABLE_NAME,
      manifest_table_name: PROPERTY_MANIFEST_TABLE_NAME,
      count: propertyRows.length,
      properties: propertyRows.map(rowFromPostgres),
      provenance: manifestProjection(manifestRows[0] || {}),
    };
  }

  return {
    enabled: true,
    kind: 'postgres-property-projection',
    tableName: PROPERTY_TABLE_NAME,
    manifestTableName: PROPERTY_MANIFEST_TABLE_NAME,
    ensureSchema,
    replaceSnapshot,
    loadSnapshot,
  };
}

module.exports = {
  PROPERTY_MANIFEST_TABLE_NAME,
  PROPERTY_POSTGRES_PROJECTION_SCHEMA_VERSION,
  PROPERTY_TABLE_NAME,
  buildPropertyPostgresRows,
  createPropertyPostgresProjection,
  manifestProjection,
  rowFromPostgres,
};
