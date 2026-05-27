const { after, afterEach, before, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  REQUIRED_ANALYST_ROLES,
  buildPropertyIntelligenceProviderContract,
  validateStructuredMarketIntelligenceOutput,
  buildStructuredIntelligenceProviderEnvelope,
} = require('../structuredIntelligenceAdapter');
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

function fixtureProperty() {
  return {
    property_id: '101',
    price: 700000,
    address: '10 Query St',
    city: 'Oakland',
    state: 'CA',
    zip_code: '94607',
    home_status: 'FOR_SALE',
    provider_source: 'Fixture MLS',
    observed_at: '2026-05-20',
    streetViewURL: 'https://provider.example/secret-street-view',
  };
}

function fixtureProvenance() {
  return {
    schema_version: 'fairvalue.propertyDataManifest.v1',
    dataset_id: 'fixture-property-snapshot',
    source_kind: 'static_provider_snapshot',
    source_sha256: 'fixture-source-hash',
    latest_observed_at: '2026-05-22',
    provider_summary: [{ provider: 'Fixture MLS', count: 1 }],
  };
}

function validProviderOutput() {
  return {
    analysis_schema_version: 'fairvalue.marketIntelligence.v2',
    summary: 'Provider-backed brief using cited local comps and FairValue room constraints.',
    confidence: 'medium',
    confidence_reason: 'Cited provider facts are present, but settlement still needs public-safe evidence.',
    metrics: [],
    analyst_cases: REQUIRED_ANALYST_ROLES.map((role) => ({
      role,
      label: `${role} agent`,
      evidence: ['Cited provider fact plus local FairValue signal.'],
      limitation: 'Limited to cited provider facts; not a valuation conclusion.',
      tone: 'neutral',
    })),
    bullish_cases: ['Cited sale supports the over case.'],
    bearish_cases: ['Inspection and financing risks remain unresolved.'],
    uncertainty_cases: ['Provider facts are not settlement authority.'],
    scenario_prompts: [{ label: 'Comp check', question: 'Which comp is decisive?', rationale: 'Provider facts need adversarial review.' }],
    settlement_checklist: ['Final sale price, appraisal report, or signed valuation evidence.'],
    citations: [{ id: 'comp-1', label: 'Closed sale comp', source: 'provider://comp/1', detail: 'Fixture comp.' }],
  };
}

before(() => listen());

afterEach(() => {
  configurePropertySnapshot(null);
});

after(() => close());

test('provider contract redacts property input and pins the required output shape', () => {
  const contract = buildPropertyIntelligenceProviderContract({
    property: fixtureProperty(),
    provenance: fixtureProvenance(),
  });

  assert.equal(contract.schema_version, 'fairvalue.propertyIntelligenceProviderContract.v1');
  assert.equal(contract.property_context.property_id, '101');
  assert.equal(contract.property_context.asking_price, 700000);
  assert.deepEqual(contract.output_contract.required_analyst_roles, REQUIRED_ANALYST_ROLES);
  assert.equal(contract.output_contract.required_output_schema_version, 'fairvalue.marketIntelligence.v2');
  assert.match(contract.request_hash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(contract).includes('streetView'), false);
});

test('provider output adapter accepts cited structured intelligence and rejects unsafe claims', () => {
  const valid = validateStructuredMarketIntelligenceOutput(validProviderOutput());
  assert.equal(valid.ok, true);
  assert.equal(valid.citations[0].id, 'comp-1');

  const unsafe = validProviderOutput();
  unsafe.citations = [];
  unsafe.summary = 'This is an official appraisal and fraud confirmed finding.';
  unsafe.analyst_cases[0].limitation = '';

  const rejected = validateStructuredMarketIntelligenceOutput(unsafe);
  assert.equal(rejected.ok, false);
  assert.match(rejected.issues.join(' '), /Provider-backed output requires citations/);
  assert.match(rejected.issues.join(' '), /needs a limitation/);
  assert.match(rejected.issues.join(' '), /appraisal_authority/);
  assert.match(rejected.issues.join(' '), /fraud_authority/);
});

test('provider envelope falls back locally when output fails the adapter contract', () => {
  const envelope = buildStructuredIntelligenceProviderEnvelope({
    property: fixtureProperty(),
    provenance: fixtureProvenance(),
    providerOutput: { analysis_schema_version: 'wrong' },
    providerName: 'FixtureAI',
  });

  assert.equal(envelope.schema_version, 'fairvalue.structuredIntelligenceAdapter.v1');
  assert.equal(envelope.provider_status, 'local_fallback');
  assert.equal(envelope.provider_name, 'local_deterministic');
  assert.equal(envelope.intelligence, null);
  assert.ok(envelope.validation.issues.length > 0);
  assert.match(envelope.request_hash, /^[a-f0-9]{64}$/);
});

test('property intelligence contract endpoint exposes provider-ready instructions without provider secrets', async () => {
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
        streetViewURL: 'https://provider.example/secret-street-view',
      },
    ],
    manifest: {
      schema_version: 'fairvalue.propertyDataManifest.v1',
      dataset_id: 'fixture-property-snapshot',
      source_kind: 'static_provider_snapshot',
      source_files: [{ sha256: 'fixture-source-hash' }],
      property_count: 1,
      provider_summary: [{ provider: 'Fixture MLS', count: 1 }],
      freshness: { latest_observed_at: '2026-05-22' },
    },
  });

  const response = await request('/api/ai/intelligence/properties/101/contract');
  assert.equal(response.status, 200);
  assert.equal(response.data.schema_version, 'fairvalue.propertyIntelligenceProviderContract.v1');
  assert.equal(response.data.property_context.property_id, '101');
  assert.equal(response.data.provenance.source_sha256, 'fixture-source-hash');
  assert.deepEqual(response.data.output_contract.required_analyst_roles, REQUIRED_ANALYST_ROLES);
  assert.equal(JSON.stringify(response.data).includes('streetView'), false);

  const missing = await request('/api/ai/intelligence/properties/missing/contract');
  assert.equal(missing.status, 404);
});
