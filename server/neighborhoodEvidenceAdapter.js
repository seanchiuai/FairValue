const crypto = require('crypto');

const CONTRACT_SCHEMA_VERSION = 'fairvalue.neighborhoodEvidenceProviderContract.v1';
const ADAPTER_SCHEMA_VERSION = 'fairvalue.neighborhoodEvidenceAdapter.v1';
const PROVIDER_REQUEST_SCHEMA_VERSION = 'fairvalue.neighborhoodEvidenceProviderRequest.v1';
const REQUIRED_EVIDENCE_SCHEMA_VERSION = 'fairvalue.neighborhoodEvidence.v1';
const PRICE_MOMENTUM_FORMAT = 'neighborhood_price_momentum_over_under';
const SUPPORTED_MARKET_FORMATS = Object.freeze([PRICE_MOMENTUM_FORMAT]);
const VALID_EVIDENCE_STATUSES = new Set(['supported', 'unsupported', 'insufficient']);
const PROHIBITED_CLAIMS = Object.freeze([
  { id: 'appraisal_authority', pattern: /\b(certified|official|guaranteed)\s+appraisal\b/i },
  { id: 'fraud_authority', pattern: /\bfraud\s+(confirmed|proven|verified)\b/i },
  { id: 'compliance_authority', pattern: /\bcompliance\s+(approved|certified|cleared)\b/i },
  { id: 'investment_authority', pattern: /\b(personalized|official|actionable)\s+investment\s+advice\b/i },
  { id: 'boundary_authority', pattern: /\bofficial\s+(neighborhood|school|parcel)\s+boundary\b/i },
]);

function sanitizeText(value, maxLength = 240) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function sanitizeNumber(value, decimals = 4) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** decimals;
  return Math.round(number * factor) / factor;
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

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
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
        count: sanitizeNumber(entry?.count, 0),
      }))
      : [],
  };
}

function entityContext(entity = {}) {
  const metrics = entity.metrics || {};
  return {
    entity_id: sanitizeText(entity.entity_id, 120),
    entity_type: sanitizeText(entity.entity_type, 80),
    label: sanitizeText(entity.label, 160),
    city: sanitizeText(entity.city, 80),
    state: sanitizeText(entity.state, 24),
    zip_code: sanitizeText(entity.zip_code, 24),
    property_count: sanitizeNumber(entity.property_count, 0),
    sample_confidence: sanitizeText(entity.sample_confidence, 80) || 'unknown',
    latest_observed_at: sanitizeText(entity.latest_observed_at, 80) || null,
    metrics: {
      median_price: sanitizeNumber(metrics.median_price, 2),
      median_price_per_sqft: sanitizeNumber(metrics.median_price_per_sqft, 2),
      median_rent_estimate: sanitizeNumber(metrics.median_rent_estimate, 2),
      median_gross_rent_yield: sanitizeNumber(metrics.median_gross_rent_yield, 4),
      average_school_rating: sanitizeNumber(metrics.average_school_rating, 2),
    },
    data_quality: Array.isArray(entity.data_quality)
      ? entity.data_quality.slice(0, 8).map((item) => ({
        field: sanitizeText(item?.field, 80),
        coverage_percent: sanitizeNumber(item?.coverage_percent, 1),
      }))
      : [],
  };
}

function draftContext(draft = {}) {
  return {
    draft_id: sanitizeText(draft.draft_id, 120),
    market_format: sanitizeText(draft.market_format, 120),
    template_status: sanitizeText(draft.template_status, 80),
    question: sanitizeText(draft.question, 500),
    baseline: cloneJson(draft.baseline || {}),
    default_config: cloneJson(draft.default_config || {}),
    evidence_required: Array.isArray(draft.evidence_required)
      ? draft.evidence_required.slice(0, 8).map((item) => sanitizeText(item, 240)).filter(Boolean)
      : [],
    settlement_rule: sanitizeText(draft.settlement_rule, 500),
  };
}

function buildNeighborhoodEvidenceProviderContract({ entity, drafts = [], provenance } = {}) {
  const contract = {
    schema_version: CONTRACT_SCHEMA_VERSION,
    neighborhood_context: entityContext(entity),
    provenance: provenanceSummary(provenance),
    draft_contracts: drafts.map(draftContext),
    output_contract: {
      required_output_schema_version: REQUIRED_EVIDENCE_SCHEMA_VERSION,
      required_fields: [
        'provider_snapshot_id',
        'observed_at',
        'draft_evidence',
        'citations',
        'limitations',
      ],
      draft_evidence_required_fields: [
        'market_format',
        'status',
        'observed_value',
        'observed_property_count',
        'evidence',
        'settlement_note',
      ],
      valid_statuses: [...VALID_EVIDENCE_STATUSES],
      citation_required_for_provider_backed_output: true,
      prohibited_claims: PROHIBITED_CLAIMS.map((claim) => claim.id),
    },
    instructions: [
      'Return only structured JSON matching the required evidence schema.',
      'Use public-safe aggregate neighborhood evidence; do not include raw listings, private notes, or provider credentials.',
      'Do not claim appraisal, compliance, investment, fraud, school-boundary, parcel-boundary, or official neighborhood-boundary authority.',
      'Mark a draft as supported only when the cited provider snapshot can settle that draft according to its configured rule.',
    ],
    limitations: [
      'The contract is a provider adapter boundary; the contract endpoint alone is not a live provider call.',
      'Accepted evidence can unblock evidence review but does not make draft-only market formats playable without pricing, replay, and settlement workflows.',
    ],
  };
  return {
    ...contract,
    request_hash: hashObject(contract),
  };
}

function buildLocalNeighborhoodEvidence(contract = {}) {
  const entity = contract.neighborhood_context || {};
  return {
    evidence_schema_version: REQUIRED_EVIDENCE_SCHEMA_VERSION,
    neighborhood_entity_id: entity.entity_id || null,
    provider_snapshot_id: null,
    observed_at: entity.latest_observed_at || contract.provenance?.latest_observed_at || null,
    citations: [],
    draft_evidence: (contract.draft_contracts || []).map((draft) => ({
      market_format: draft.market_format,
      status: 'insufficient',
      observed_value: null,
      observed_property_count: entity.property_count || 0,
      evidence: [
        'Only the static FairValue baseline is available locally.',
        'A future provider-backed aggregate snapshot is required before this draft can become settlement-ready.',
      ],
      settlement_note: 'Provider-backed neighborhood evidence is not configured, so this draft remains blocked from playable-room promotion.',
      limitations: [
        'Local fallback is a gap assessment, not settlement evidence.',
        'Static ZIP aggregates are not official neighborhood, parcel, school, or appraisal boundaries.',
      ],
    })),
    limitations: [
      'No external neighborhood evidence provider was called.',
      'Draft-only market formats remain blocked until provider evidence, pricing, replay, and settlement paths are implemented.',
    ],
  };
}

function normalizeCitations(output = {}) {
  const raw = Array.isArray(output.citations) ? output.citations : [];
  return raw.slice(0, 12).map((citation, index) => ({
    id: sanitizeText(citation?.id, 120) || `citation-${index + 1}`,
    label: sanitizeText(citation?.label, 160) || 'Provider citation',
    source: sanitizeText(citation?.source || citation?.url, 240) || null,
    detail: sanitizeText(citation?.detail || citation?.snippet, 500) || null,
  }));
}

function validateNeighborhoodEvidenceOutput(output, contract = {}) {
  const issues = [];
  if (!isPlainObject(output)) {
    return { ok: false, issues: ['Provider evidence output must be an object.'], citations: [] };
  }
  if (output.evidence_schema_version !== REQUIRED_EVIDENCE_SCHEMA_VERSION) {
    issues.push(`evidence_schema_version must be ${REQUIRED_EVIDENCE_SCHEMA_VERSION}.`);
  }
  if (!sanitizeText(output.provider_snapshot_id, 160)) issues.push('provider_snapshot_id is required.');
  if (!sanitizeText(output.observed_at, 80)) issues.push('observed_at is required.');
  if (!Array.isArray(output.draft_evidence)) issues.push('draft_evidence must be an array.');
  if (!stringArray(output.limitations)) issues.push('limitations must be a non-empty string array.');

  const contractFormats = new Set((contract.draft_contracts || []).map((draft) => draft.market_format));
  const evidenceRows = Array.isArray(output.draft_evidence) ? output.draft_evidence : [];
  for (const row of evidenceRows) {
    if (!isPlainObject(row)) {
      issues.push('Each draft evidence row must be an object.');
      continue;
    }
    if (!contractFormats.has(row.market_format)) issues.push(`Unknown draft market format: ${row.market_format || 'missing'}.`);
    if (!VALID_EVIDENCE_STATUSES.has(row.status)) issues.push(`Invalid evidence status for ${row.market_format || 'unknown'}.`);
    if (sanitizeNumber(row.observed_property_count, 0) == null || Number(row.observed_property_count) < 0) {
      issues.push(`observed_property_count is required for ${row.market_format || 'unknown'}.`);
    }
    if (!stringArray(row.evidence)) issues.push(`evidence strings are required for ${row.market_format || 'unknown'}.`);
    if (!sanitizeText(row.settlement_note, 800)) issues.push(`settlement_note is required for ${row.market_format || 'unknown'}.`);
  }
  if (!evidenceRows.length) issues.push('At least one draft evidence row is required.');

  const citations = normalizeCitations(output);
  if (!citations.length) issues.push('Provider-backed neighborhood evidence requires citations.');

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

function buildPlayabilityAssessment(contract, evidence, accepted) {
  const rows = new Map((evidence?.draft_evidence || []).map((row) => [row.market_format, row]));
  return (contract.draft_contracts || []).map((draft) => {
    const row = rows.get(draft.market_format);
    const evidenceReady = accepted && row?.status === 'supported';
    return {
      market_format: draft.market_format,
      evidence_status: row?.status || 'insufficient',
      status: evidenceReady ? 'evidence_adapter_ready' : 'blocked',
      blockers: evidenceReady
        ? ['Pricing, replay, room creation, and settlement workflows are still required before playable promotion.']
        : ['Provider-backed settlement evidence is not accepted for this draft yet.'],
    };
  });
}

function buildNeighborhoodEvidenceEnvelope({
  entity,
  drafts,
  provenance,
  providerOutput,
  providerName = 'external_neighborhood_evidence_provider',
  localEvidence = null,
  providerAttempt = null,
} = {}) {
  const contract = buildNeighborhoodEvidenceProviderContract({ entity, drafts, provenance });
  const validation = validateNeighborhoodEvidenceOutput(providerOutput, contract);
  const accepted = validation.ok;
  const evidence = accepted ? providerOutput : localEvidence;
  return {
    schema_version: ADAPTER_SCHEMA_VERSION,
    provider_status: accepted ? 'provider_backed' : 'local_fallback',
    provider_name: accepted ? sanitizeText(providerName, 80) || 'external_neighborhood_evidence_provider' : 'local_deterministic',
    request_hash: contract.request_hash,
    contract,
    validation: {
      accepted,
      issues: validation.issues,
    },
    provider_attempt: providerAttempt,
    evidence,
    citations: accepted ? validation.citations : [],
    playability_assessment: buildPlayabilityAssessment(contract, evidence, accepted),
    limitations: accepted
      ? ['Provider evidence passed adapter checks, but draft markets still require pricing, replay, and settlement implementation before live betting.']
      : [
          'Provider evidence was absent or rejected by the adapter.',
          'Draft neighborhood markets remain non-playable until provider-backed evidence and market workflows exist.',
        ],
  };
}

function normalizeProviderOptions(options = {}) {
  return {
    providerUrl: sanitizeText(options.providerUrl || options.provider_url, 500),
    apiKey: typeof options.apiKey === 'string' ? options.apiKey.trim() : '',
    providerName: sanitizeText(options.providerName || options.provider_name, 80) || 'external_neighborhood_evidence_provider',
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
  if (isPlainObject(data?.evidence)) return data.evidence;
  if (isPlainObject(data?.output)) return data.output;
  return data;
}

async function executeNeighborhoodEvidenceProvider({
  entity,
  drafts,
  provenance,
  providerOptions = {},
  fetchImpl = globalThis.fetch,
} = {}) {
  const contract = buildNeighborhoodEvidenceProviderContract({ entity, drafts, provenance });
  const localEvidence = buildLocalNeighborhoodEvidence(contract);
  const options = normalizeProviderOptions(providerOptions);
  const urlValidation = validateProviderUrl(options.providerUrl);
  if (!urlValidation.ok || !options.apiKey || typeof fetchImpl !== 'function') {
    const skipReason = !urlValidation.ok
      ? urlValidation.reason
      : !options.apiKey
        ? 'provider_api_key_missing'
        : 'fetch_unavailable';
    return buildNeighborhoodEvidenceEnvelope({
      entity,
      drafts,
      provenance,
      providerOutput: null,
      localEvidence,
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
      return buildNeighborhoodEvidenceEnvelope({
        entity,
        drafts,
        provenance,
        providerOutput: null,
        localEvidence,
        providerName: options.providerName,
        providerAttempt: {
          status: 'failed',
          reason: 'provider_http_error',
          http_status: response.status,
        },
      });
    }
    const providerOutput = extractProviderOutput(data);
    const envelope = buildNeighborhoodEvidenceEnvelope({
      entity,
      drafts,
      provenance,
      providerOutput,
      localEvidence,
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
    return buildNeighborhoodEvidenceEnvelope({
      entity,
      drafts,
      provenance,
      providerOutput: null,
      localEvidence,
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
  REQUIRED_EVIDENCE_SCHEMA_VERSION,
  PRICE_MOMENTUM_FORMAT,
  SUPPORTED_MARKET_FORMATS,
  buildNeighborhoodEvidenceProviderContract,
  buildLocalNeighborhoodEvidence,
  validateNeighborhoodEvidenceOutput,
  buildNeighborhoodEvidenceEnvelope,
  executeNeighborhoodEvidenceProvider,
};
