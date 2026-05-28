const crypto = require('crypto');

const CONTRACT_SCHEMA_VERSION = 'fairvalue.propertyIntelligenceProviderContract.v1';
const ADAPTER_SCHEMA_VERSION = 'fairvalue.structuredIntelligenceAdapter.v1';
const REQUIRED_OUTPUT_SCHEMA_VERSION = 'fairvalue.marketIntelligence.v2';
const REQUIRED_ANALYST_ROLES = Object.freeze([
  'bull',
  'bear',
  'comp',
  'affordability',
  'fraud_check',
  'neighborhood',
]);
const VALID_CONFIDENCE = new Set(['high', 'medium', 'low']);
const VALID_TONES = new Set(['positive', 'negative', 'neutral', 'caution']);
const PROVIDER_REQUEST_SCHEMA_VERSION = 'fairvalue.structuredIntelligenceProviderRequest.v1';
const PROHIBITED_CLAIMS = Object.freeze([
  { id: 'appraisal_authority', pattern: /\b(certified|official|guaranteed)\s+appraisal\b/i },
  { id: 'fraud_authority', pattern: /\bfraud\s+(confirmed|proven|verified)\b/i },
  { id: 'compliance_authority', pattern: /\bcompliance\s+(approved|certified|cleared)\b/i },
  { id: 'trading_instruction', pattern: /\breal-money\s+trading\s+instruction\b/i },
  { id: 'investment_authority', pattern: /\b(personalized|official|actionable)\s+investment\s+advice\b/i },
]);

function sanitizeText(value, maxLength = 240) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function sanitizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

function hashObject(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function propertyContext(property = {}) {
  return {
    property_id: sanitizeText(property.property_id, 80),
    address: sanitizeText(property.address),
    city: sanitizeText(property.city, 80),
    state: sanitizeText(property.state, 24),
    zip_code: sanitizeText(property.zip_code, 24),
    asking_price: sanitizeNumber(property.price),
    home_status: sanitizeText(property.home_status, 80),
    provider_source: sanitizeText(property.provider_source, 120),
    observed_at: sanitizeText(property.observed_at, 80) || null,
  };
}

function provenanceSummary(provenance = {}) {
  return {
    schema_version: sanitizeText(provenance.schema_version, 80) || null,
    dataset_id: sanitizeText(provenance.dataset_id, 120) || null,
    source_kind: sanitizeText(provenance.source_kind, 80) || null,
    source_sha256: sanitizeText(provenance.source_sha256, 96) || null,
    latest_observed_at: sanitizeText(provenance.latest_observed_at, 80) || null,
    provider_summary: Array.isArray(provenance.provider_summary)
      ? provenance.provider_summary.slice(0, 8).map((entry) => ({
        provider: sanitizeText(entry?.provider, 100),
        count: sanitizeNumber(entry?.count),
      }))
      : [],
  };
}

function outputContract() {
  return {
    required_output_schema_version: REQUIRED_OUTPUT_SCHEMA_VERSION,
    required_fields: [
      'summary',
      'confidence',
      'confidence_reason',
      'metrics',
      'analyst_cases',
      'scenario_prompts',
      'settlement_checklist',
    ],
    required_analyst_roles: [...REQUIRED_ANALYST_ROLES],
    analyst_case_required_fields: ['role', 'label', 'evidence', 'limitation', 'tone'],
    citation_required_for_provider_backed_output: true,
    prohibited_claims: PROHIBITED_CLAIMS.map((claim) => claim.id),
  };
}

function buildPropertyIntelligenceProviderContract({ property, provenance } = {}) {
  const contract = {
    schema_version: CONTRACT_SCHEMA_VERSION,
    property_context: propertyContext(property),
    provenance: provenanceSummary(provenance),
    output_contract: outputContract(),
    instructions: [
      'Return only structured JSON matching the required output schema.',
      'Every analyst case must include evidence and a limitation.',
      'Do not claim appraisal, fraud, compliance, lending, investment, or real-money trading authority.',
      'Cite provider-backed facts separately from local FairValue signals.',
    ],
    limitations: [
      'The contract is a provider adapter boundary; the contract endpoint alone is not a live provider call.',
      'Provider-backed output must still be settled with public-safe sale, appraisal, or signed valuation evidence.',
    ],
  };
  return {
    ...contract,
    request_hash: hashObject(contract),
  };
}

function localMetric(label, value, detail, tone = 'neutral') {
  return {
    label: sanitizeText(label, 80),
    value: sanitizeText(value, 120),
    detail: sanitizeText(detail, 240),
    tone: VALID_TONES.has(tone) ? tone : 'neutral',
  };
}

function buildLocalStructuredMarketIntelligence(contract = {}) {
  const property = contract.property_context || {};
  const provenance = contract.provenance || {};
  const label = [property.address, property.city, property.state].filter(Boolean).join(', ') || 'this property';
  const price = Number.isFinite(Number(property.asking_price))
    ? `$${Math.round(Number(property.asking_price)).toLocaleString()}`
    : 'Unavailable';
  const provider = provenance.provider_summary?.[0]?.provider || property.provider_source || 'static provider snapshot';
  const observed = property.observed_at || provenance.latest_observed_at || 'unverified snapshot date';
  const confidence = property.asking_price && property.address && provenance.source_sha256 ? 'medium' : 'low';
  const localEvidence = [
    `${label} is represented by the redacted FairValue property context.`,
    `Asking price signal is ${price}; provider source is ${provider}.`,
    `Latest local observation is ${observed}.`,
  ];
  const roleCopy = {
    bull: ['Ask whether the current ask is supported by local demand and property-specific condition.'],
    bear: ['Ask what inspection, financing, insurance, or stale-data risk could pull value below the ask.'],
    comp: ['Use comparable sale or appraisal evidence before treating this as a valuation conclusion.'],
    affordability: ['Translate the ask into payment pressure before calling demand durable.'],
    fraud_check: ['Check for data-quality gaps and source inconsistencies; do not infer fraud from missing fields.'],
    neighborhood: ['Compare the property against ZIP-level context, but do not treat a ZIP as a true neighborhood boundary.'],
  };
  return {
    analysis_schema_version: REQUIRED_OUTPUT_SCHEMA_VERSION,
    summary: `Local FairValue intelligence for ${label}: ${price} ask, ${property.home_status || 'unknown'} status, and ${provider} snapshot context. No external intelligence provider was called.`,
    confidence,
    confidence_reason: confidence === 'medium'
      ? 'The local snapshot has a property context and manifest provenance, but no live provider-backed comps or appraisal evidence.'
      : 'The local snapshot is missing enough fields that this should be treated as a low-confidence debate prompt.',
    metrics: [
      localMetric('Asking price', price, 'Static snapshot asking price; not an appraisal.', 'neutral'),
      localMetric('Provider source', provider, 'Source label from the redacted local manifest/property context.', 'caution'),
      localMetric('Observed', observed, 'Snapshot observation date or manifest freshness marker.', property.observed_at ? 'neutral' : 'caution'),
    ],
    analyst_cases: REQUIRED_ANALYST_ROLES.map((role) => ({
      role,
      label: `${role.replace(/_/g, ' ')} analyst`,
      evidence: [...localEvidence, ...(roleCopy[role] || [])].slice(0, 3),
      limitation: 'Deterministic local fallback only; not a provider-backed appraisal, fraud finding, lending decision, compliance review, or investment recommendation.',
      tone: role === 'bear' || role === 'fraud_check' ? 'caution' : 'neutral',
    })),
    bullish_cases: [
      `Supporters must show why ${price} is defensible against current local context.`,
      'A stronger bull case needs cited comps, active demand, or signed valuation evidence.',
    ],
    bearish_cases: [
      'Skeptics should test stale snapshot, condition, financing, insurance, and liquidity risk.',
      'A stronger bear case needs cited contrary comps or settlement evidence.',
    ],
    uncertainty_cases: [
      'Local fallback has no live provider fetch, MLS refresh, permit feed, insurance quote, climate model, or appraisal report.',
      'Settlement still requires public-safe sale, appraisal, MLS, or signed valuation evidence.',
    ],
    scenario_prompts: [
      {
        label: 'Provider evidence gap',
        question: `Which cited external fact would most change the market for ${label}?`,
        rationale: 'The local fallback names the missing provider evidence instead of pretending to have it.',
      },
      {
        label: 'Settlement standard',
        question: 'What exact public-safe artifact should settle this market?',
        rationale: 'A prediction room needs a verifiable closeout rule before debate hardens into consensus.',
      },
    ],
    settlement_checklist: [
      'Final sale price or closing disclosure metadata that can be shared safely.',
      'Appraisal report metadata or signed valuation evidence, redacted where necessary.',
      'MLS/public-record update matching the room address and settlement rule.',
    ],
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item.trim());
}

function collectStrings(value, output = []) {
  if (typeof value === 'string') {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, output));
    return output;
  }
  if (isPlainObject(value)) {
    Object.values(value).forEach((item) => collectStrings(item, output));
  }
  return output;
}

function normalizeCitations(output = {}) {
  const rawCitations = Array.isArray(output.citations)
    ? output.citations
    : Array.isArray(output.provider_citations)
      ? output.provider_citations
      : [];
  return rawCitations.slice(0, 12).map((citation, index) => ({
    id: sanitizeText(citation?.id, 120) || `citation-${index + 1}`,
    label: sanitizeText(citation?.label, 160) || 'Provider citation',
    source: sanitizeText(citation?.source || citation?.url, 240) || null,
    detail: sanitizeText(citation?.detail || citation?.snippet, 500) || null,
  }));
}

function validateStructuredMarketIntelligenceOutput(output) {
  const issues = [];
  if (!isPlainObject(output)) {
    return { ok: false, issues: ['Provider output must be an object.'] };
  }

  if (output.analysis_schema_version !== REQUIRED_OUTPUT_SCHEMA_VERSION) {
    issues.push(`analysis_schema_version must be ${REQUIRED_OUTPUT_SCHEMA_VERSION}.`);
  }
  if (!sanitizeText(output.summary, 2000)) issues.push('summary is required.');
  if (!VALID_CONFIDENCE.has(output.confidence)) issues.push('confidence must be high, medium, or low.');
  if (!sanitizeText(output.confidence_reason, 1000)) issues.push('confidence_reason is required.');
  if (!Array.isArray(output.metrics)) issues.push('metrics must be an array.');
  if (!Array.isArray(output.scenario_prompts)) issues.push('scenario_prompts must be an array.');
  if (!stringArray(output.settlement_checklist)) issues.push('settlement_checklist must be a non-empty string array.');

  const cases = Array.isArray(output.analyst_cases) ? output.analyst_cases : [];
  if (!Array.isArray(output.analyst_cases)) issues.push('analyst_cases must be an array.');
  const roles = new Set();
  for (const analystCase of cases) {
    if (!isPlainObject(analystCase)) {
      issues.push('Each analyst case must be an object.');
      continue;
    }
    if (!REQUIRED_ANALYST_ROLES.includes(analystCase.role)) issues.push(`Unknown analyst role: ${analystCase.role || 'missing'}.`);
    else roles.add(analystCase.role);
    if (!sanitizeText(analystCase.label, 120)) issues.push(`Analyst case ${analystCase.role || 'unknown'} is missing label.`);
    if (!stringArray(analystCase.evidence)) issues.push(`Analyst case ${analystCase.role || 'unknown'} needs evidence strings.`);
    if (!sanitizeText(analystCase.limitation, 500)) issues.push(`Analyst case ${analystCase.role || 'unknown'} needs a limitation.`);
    if (!VALID_TONES.has(analystCase.tone)) issues.push(`Analyst case ${analystCase.role || 'unknown'} has invalid tone.`);
  }
  for (const role of REQUIRED_ANALYST_ROLES) {
    if (!roles.has(role)) issues.push(`Missing analyst role: ${role}.`);
  }

  const citations = normalizeCitations(output);
  if (citations.length === 0) issues.push('Provider-backed output requires citations.');

  const text = collectStrings(output).join('\n');
  for (const claim of PROHIBITED_CLAIMS) {
    if (claim.pattern.test(text)) issues.push(`Prohibited claim detected: ${claim.id}.`);
  }

  return {
    ok: issues.length === 0,
    issues,
    citations,
  };
}

function buildStructuredIntelligenceProviderEnvelope({
  property,
  provenance,
  providerOutput,
  providerName = 'external_provider',
  localIntelligence = null,
  providerAttempt = null,
} = {}) {
  const contract = buildPropertyIntelligenceProviderContract({ property, provenance });
  const validation = validateStructuredMarketIntelligenceOutput(providerOutput);
  const accepted = validation.ok;
  return {
    schema_version: ADAPTER_SCHEMA_VERSION,
    provider_status: accepted ? 'provider_backed' : 'local_fallback',
    provider_name: accepted ? sanitizeText(providerName, 80) || 'external_provider' : 'local_deterministic',
    request_hash: contract.request_hash,
    contract,
    validation: {
      accepted,
      issues: validation.issues,
    },
    provider_attempt: providerAttempt,
    intelligence: accepted ? providerOutput : localIntelligence,
    citations: accepted ? validation.citations : [],
    limitations: accepted
      ? ['Provider output passed adapter checks, but settlement still requires public-safe evidence.']
      : [
          'Provider output was absent or rejected by the adapter.',
          'Use deterministic local intelligence until provider-backed output passes the contract.',
        ],
  };
}

function normalizeProviderOptions(options = {}) {
  return {
    providerUrl: sanitizeText(options.providerUrl || options.provider_url, 500),
    apiKey: typeof options.apiKey === 'string' ? options.apiKey.trim() : '',
    providerName: sanitizeText(options.providerName || options.provider_name, 80) || 'external_provider',
    timeoutMs: Math.max(1000, Math.min(Math.floor(Number(options.timeoutMs || options.timeout_ms) || 8000), 30000)),
  };
}

function validateProviderUrl(providerUrl) {
  if (!providerUrl) return { ok: false, reason: 'provider_not_configured' };
  try {
    const url = new URL(providerUrl);
    const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localHosts.has(url.hostname))) {
      return { ok: false, reason: 'provider_url_must_use_https_outside_localhost' };
    }
    return { ok: true, url };
  } catch {
    return { ok: false, reason: 'provider_url_invalid' };
  }
}

function extractProviderOutput(data) {
  if (isPlainObject(data?.intelligence)) return data.intelligence;
  if (isPlainObject(data?.output)) return data.output;
  return data;
}

async function executeStructuredIntelligenceProvider({
  property,
  provenance,
  providerOptions = {},
  fetchImpl = globalThis.fetch,
} = {}) {
  const contract = buildPropertyIntelligenceProviderContract({ property, provenance });
  const localIntelligence = buildLocalStructuredMarketIntelligence(contract);
  const options = normalizeProviderOptions(providerOptions);
  const urlValidation = validateProviderUrl(options.providerUrl);
  if (!urlValidation.ok || !options.apiKey || typeof fetchImpl !== 'function') {
    const skipReason = !urlValidation.ok
      ? urlValidation.reason
      : !options.apiKey
        ? 'provider_api_key_missing'
        : 'fetch_unavailable';
    return buildStructuredIntelligenceProviderEnvelope({
      property,
      provenance,
      providerOutput: null,
      localIntelligence,
      providerName: options.providerName,
      providerAttempt: {
        status: 'skipped',
        reason: skipReason,
      },
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  if (typeof timeout.unref === 'function') timeout.unref();
  try {
    const response = await fetchImpl(urlValidation.url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`,
        'X-FairValue-Contract-Schema': CONTRACT_SCHEMA_VERSION,
        'X-FairValue-Request-Hash': contract.request_hash,
      },
      body: JSON.stringify({
        schema_version: PROVIDER_REQUEST_SCHEMA_VERSION,
        request_hash: contract.request_hash,
        contract,
      }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return buildStructuredIntelligenceProviderEnvelope({
        property,
        provenance,
        providerOutput: null,
        localIntelligence,
        providerName: options.providerName,
        providerAttempt: {
          status: 'failed',
          reason: 'provider_http_error',
          http_status: response.status,
        },
      });
    }
    const providerOutput = extractProviderOutput(data);
    const envelope = buildStructuredIntelligenceProviderEnvelope({
      property,
      provenance,
      providerOutput,
      localIntelligence,
      providerName: options.providerName,
      providerAttempt: {
        status: 'completed',
        http_status: response.status,
      },
    });
    if (!envelope.validation.accepted) {
      envelope.provider_attempt = {
        status: 'rejected',
        reason: 'provider_output_failed_validation',
        http_status: response.status,
      };
    }
    return envelope;
  } catch (error) {
    return buildStructuredIntelligenceProviderEnvelope({
      property,
      provenance,
      providerOutput: null,
      localIntelligence,
      providerName: options.providerName,
      providerAttempt: {
        status: 'failed',
        reason: error?.name === 'AbortError' ? 'provider_timeout' : 'provider_request_failed',
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  CONTRACT_SCHEMA_VERSION,
  ADAPTER_SCHEMA_VERSION,
  PROVIDER_REQUEST_SCHEMA_VERSION,
  REQUIRED_OUTPUT_SCHEMA_VERSION,
  REQUIRED_ANALYST_ROLES,
  buildPropertyIntelligenceProviderContract,
  buildLocalStructuredMarketIntelligence,
  validateStructuredMarketIntelligenceOutput,
  buildStructuredIntelligenceProviderEnvelope,
  executeStructuredIntelligenceProvider,
};
