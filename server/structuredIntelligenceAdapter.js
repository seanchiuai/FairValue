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
      'The contract is a provider adapter boundary, not a live provider call.',
      'Provider-backed output must still be settled with public-safe sale, appraisal, or signed valuation evidence.',
    ],
  };
  return {
    ...contract,
    request_hash: hashObject(contract),
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
    intelligence: accepted ? providerOutput : null,
    citations: accepted ? validation.citations : [],
    limitations: accepted
      ? ['Provider output passed adapter checks, but settlement still requires public-safe evidence.']
      : [
          'Provider output was absent or rejected by the adapter.',
          'Use deterministic local intelligence until provider-backed output passes the contract.',
        ],
  };
}

module.exports = {
  CONTRACT_SCHEMA_VERSION,
  ADAPTER_SCHEMA_VERSION,
  REQUIRED_OUTPUT_SCHEMA_VERSION,
  REQUIRED_ANALYST_ROLES,
  buildPropertyIntelligenceProviderContract,
  validateStructuredMarketIntelligenceOutput,
  buildStructuredIntelligenceProviderEnvelope,
};
