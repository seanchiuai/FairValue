const { after, afterEach, before, test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {
  buildNeighborhoodMarketDrafts,
} = require('../neighborhoodMarketDrafts');
const {
  CONTRACT_SCHEMA_VERSION,
  REQUIRED_EVIDENCE_SCHEMA_VERSION,
  buildNeighborhoodEvidenceProviderContract,
  validateNeighborhoodEvidenceOutput,
  executeNeighborhoodEvidenceProvider,
} = require('../neighborhoodEvidenceAdapter');
const {
  server,
  configurePropertySnapshot,
} = require('../index');

let baseUrl;
const originalProviderUrl = process.env.FAIRVALUE_NEIGHBORHOOD_EVIDENCE_PROVIDER_URL;
const originalProviderApiKey = process.env.FAIRVALUE_NEIGHBORHOOD_EVIDENCE_PROVIDER_API_KEY;
const originalProviderName = process.env.FAIRVALUE_NEIGHBORHOOD_EVIDENCE_PROVIDER_NAME;

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

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

async function request(pathname, { method = 'GET' } = {}) {
  const res = await fetch(`${baseUrl}${pathname}`, { method });
  const data = await res.json();
  return { status: res.status, data };
}

function listenMockProvider(handler) {
  const mock = http.createServer(handler);
  return new Promise((resolve) => {
    mock.listen(0, '127.0.0.1', () => {
      const address = mock.address();
      resolve({
        url: `http://127.0.0.1:${address.port}/neighborhood-evidence`,
        close: () => new Promise((done, reject) => mock.close((error) => (error ? reject(error) : done()))),
      });
    });
  });
}

function fixtureEntity() {
  return {
    entity_id: 'zip:CA:94607',
    entity_type: 'zip_code',
    label: 'Oakland CA 94607',
    city: 'Oakland',
    state: 'CA',
    zip_code: '94607',
    property_count: 6,
    latest_observed_at: '2026-05-22',
    sample_confidence: 'thin_sample',
    metrics: {
      median_price: 950000,
      median_price_per_sqft: 750,
      median_rent_estimate: 4000,
      median_gross_rent_yield: 0.05,
      average_school_rating: 5.75,
    },
    data_quality: [{ field: 'price', coverage_percent: 100 }],
  };
}

function fixtureProvenance() {
  return {
    schema_version: 'fairvalue.propertyDataManifest.v1',
    dataset_id: 'fixture-property-snapshot',
    source_kind: 'static_provider_snapshot',
    source_sha256: 'fixture-source-hash',
    latest_observed_at: '2026-05-22',
    provider_summary: [{ provider: 'Fixture MLS', count: 6 }],
  };
}

function fixtureDraft() {
  return buildNeighborhoodMarketDrafts({
    entity: fixtureEntity(),
    provenance: fixtureProvenance(),
    nowSeconds: 1_779_000_000,
  }).drafts[0];
}

function validProviderEvidence(marketFormat = fixtureDraft().market_format) {
  return {
    evidence_schema_version: REQUIRED_EVIDENCE_SCHEMA_VERSION,
    neighborhood_entity_id: 'zip:CA:94607',
    provider_snapshot_id: 'fixture-neighborhood-snapshot-2026q3',
    observed_at: '2026-08-22',
    citations: [{ id: 'zip-median-1', label: 'ZIP median aggregate', source: 'provider://zip/94607/q3', detail: 'Public aggregate row.' }],
    draft_evidence: [
      {
        market_format: marketFormat,
        status: 'supported',
        observed_value: 982000,
        observed_property_count: 9,
        evidence: ['Provider aggregate median price crossed the configured draft threshold.'],
        settlement_note: 'Use cited ZIP median aggregate as candidate settlement evidence for the draft.',
        limitations: ['Aggregate provider row only; raw listings are not included.'],
      },
    ],
    limitations: ['Provider evidence is public aggregate context, not appraisal or official boundary evidence.'],
  };
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
        livingArea: 1000,
        rentZestimate: 3000,
        homeType: 'CONDO',
        homeStatus: 'FOR_SALE',
      },
      {
        zpid: 103,
        streetAddress: '30 Query Ct',
        city: 'Oakland',
        state: 'CA',
        zipcode: '94607',
        price: 1200000,
        livingArea: 1500,
        rentZestimate: 5000,
        homeType: 'CONDO',
        homeStatus: 'RECENTLY_SOLD',
      },
    ],
    manifest: fixtureProvenance(),
  });
}

before(() => listen());

afterEach(() => {
  configurePropertySnapshot(null);
  restoreEnv('FAIRVALUE_NEIGHBORHOOD_EVIDENCE_PROVIDER_URL', originalProviderUrl);
  restoreEnv('FAIRVALUE_NEIGHBORHOOD_EVIDENCE_PROVIDER_API_KEY', originalProviderApiKey);
  restoreEnv('FAIRVALUE_NEIGHBORHOOD_EVIDENCE_PROVIDER_NAME', originalProviderName);
});

after(() => close());

test('neighborhood evidence contract pins draft evidence requirements', () => {
  const draft = fixtureDraft();
  const contract = buildNeighborhoodEvidenceProviderContract({
    entity: fixtureEntity(),
    drafts: [draft],
    provenance: fixtureProvenance(),
  });

  assert.equal(contract.schema_version, CONTRACT_SCHEMA_VERSION);
  assert.equal(contract.neighborhood_context.entity_id, 'zip:CA:94607');
  assert.equal(contract.draft_contracts.length, 1);
  assert.equal(contract.draft_contracts[0].market_format, 'neighborhood_price_momentum_over_under');
  assert.equal(contract.output_contract.required_output_schema_version, REQUIRED_EVIDENCE_SCHEMA_VERSION);
  assert.match(contract.request_hash, /^[a-f0-9]{64}$/);
});

test('neighborhood evidence validator accepts cited provider aggregates and rejects unsafe claims', () => {
  const contract = buildNeighborhoodEvidenceProviderContract({
    entity: fixtureEntity(),
    drafts: [fixtureDraft()],
    provenance: fixtureProvenance(),
  });

  const accepted = validateNeighborhoodEvidenceOutput(validProviderEvidence(), contract);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.citations[0].id, 'zip-median-1');

  const unsafe = validProviderEvidence();
  unsafe.citations = [];
  unsafe.draft_evidence[0].settlement_note = 'This is an official appraisal and official neighborhood boundary.';
  const rejected = validateNeighborhoodEvidenceOutput(unsafe, contract);
  assert.equal(rejected.ok, false);
  assert.match(rejected.issues.join(' '), /requires citations/);
  assert.match(rejected.issues.join(' '), /appraisal_authority/);
  assert.match(rejected.issues.join(' '), /boundary_authority/);
});

test('neighborhood evidence execution posts contract behind server credentials', async () => {
  const draft = fixtureDraft();
  let providerRequest;
  const mock = await listenMockProvider((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      providerRequest = {
        authorization: req.headers.authorization,
        contractSchema: req.headers['x-fairvalue-contract-schema'],
        requestHash: req.headers['x-fairvalue-request-hash'],
        body: JSON.parse(raw),
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ evidence: validProviderEvidence(draft.market_format) }));
    });
  });

  try {
    const envelope = await executeNeighborhoodEvidenceProvider({
      entity: fixtureEntity(),
      drafts: [draft],
      provenance: fixtureProvenance(),
      providerOptions: {
        providerUrl: mock.url,
        apiKey: 'server-side-neighborhood-key',
        providerName: 'FixtureNeighborhoodAI',
      },
    });

    assert.equal(envelope.provider_status, 'provider_backed');
    assert.equal(envelope.provider_name, 'FixtureNeighborhoodAI');
    assert.equal(envelope.playability_assessment[0].status, 'evidence_adapter_ready');
    assert.equal(providerRequest.authorization, 'Bearer server-side-neighborhood-key');
    assert.equal(providerRequest.contractSchema, CONTRACT_SCHEMA_VERSION);
    assert.equal(providerRequest.requestHash, providerRequest.body.request_hash);
    assert.equal(providerRequest.body.schema_version, 'fairvalue.neighborhoodEvidenceProviderRequest.v1');
    assert.equal(JSON.stringify(envelope).includes('server-side-neighborhood-key'), false);
  } finally {
    await mock.close();
  }
});

test('neighborhood evidence routes return contracts and local fallback without provider config', async () => {
  configureFixtureSnapshot();

  const contract = await request('/api/neighborhoods/94607/market-drafts/neighborhood_price_momentum_over_under/evidence-contract');
  assert.equal(contract.status, 200);
  assert.equal(contract.data.schema_version, CONTRACT_SCHEMA_VERSION);
  assert.equal(contract.data.draft_contracts.length, 1);

  const generated = await request('/api/neighborhoods/94607/market-drafts/neighborhood_price_momentum_over_under/evidence/generate', {
    method: 'POST',
  });
  assert.equal(generated.status, 200);
  assert.equal(generated.data.schema_version, 'fairvalue.neighborhoodEvidenceAdapter.v1');
  assert.equal(generated.data.provider_status, 'local_fallback');
  assert.equal(generated.data.provider_attempt.status, 'skipped');
  assert.equal(generated.data.evidence.draft_evidence[0].status, 'insufficient');
  assert.equal(generated.data.playability_assessment[0].status, 'blocked');

  const missing = await request('/api/neighborhoods/99999/market-drafts/neighborhood_price_momentum_over_under/evidence-contract');
  assert.equal(missing.status, 404);
});
