const crypto = require('crypto');
const { getMarketTemplate } = require('./marketTemplateRegistry');

const NEIGHBORHOOD_MARKET_DRAFTS_SCHEMA_VERSION = 'fairvalue.neighborhoodMarketDrafts.v1';
const NEIGHBORHOOD_DRAFT_MARKET_FORMATS = Object.freeze([
  'neighborhood_price_momentum_over_under',
  'neighborhood_rent_yield_over_under',
  'neighborhood_outperformance_over_under',
]);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function round(value, decimals = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** decimals;
  return Math.round(number * factor) / factor;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function createDraftId(entity, marketFormat, seed) {
  const hash = crypto
    .createHash('sha256')
    .update(`${entity?.entity_id || 'unknown'}|${marketFormat}|${JSON.stringify(seed || {})}`)
    .digest('hex')
    .slice(0, 16);
  return `neighborhood-draft:${hash}`;
}

function neighborhoodName(entity) {
  return entity?.label || [entity?.city, entity?.state, entity?.zip_code].filter(Boolean).join(' ') || 'this ZIP code';
}

function buildDraft({ entity, marketFormat, label, question, baseline, defaultConfig, sourceMetrics, evidenceRequired }) {
  const template = getMarketTemplate(marketFormat);
  if (!template || template.status !== 'draft_only') return null;
  const seed = { baseline, default_config: defaultConfig };
  return {
    draft_id: createDraftId(entity, marketFormat, seed),
    market_format: marketFormat,
    template_status: template.status,
    template_label: template.label,
    pricing_engine: template.pricing_engine,
    label,
    question,
    baseline: cloneJson(baseline),
    default_config: cloneJson(defaultConfig),
    source_metrics: cloneJson(sourceMetrics),
    evidence_required: [...evidenceRequired],
    settlement_rule: template.settlement_rule,
    trust_notice: 'Draft-only scenario contract. FairValue will not accept live bets on this format until provider-backed neighborhood evidence, pricing, replay, and settlement workflows exist.',
    limitations: [
      ...template.limitations,
      ...(Array.isArray(entity?.limitations) ? entity.limitations : []),
    ],
  };
}

function buildPriceMomentumDraft(entity) {
  const metrics = entity.metrics || {};
  const medianPrice = positiveNumber(metrics.median_price);
  const thresholdPercent = 0.03;
  const thresholdPrice = medianPrice ? Math.round(medianPrice * (1 + thresholdPercent)) : null;
  return buildDraft({
    entity,
    marketFormat: 'neighborhood_price_momentum_over_under',
    label: `${neighborhoodName(entity)} price momentum`,
    question: thresholdPrice
      ? `Will ${neighborhoodName(entity)} median home price verify at or above $${thresholdPrice.toLocaleString('en-US')} in the next provider snapshot window?`
      : `Will ${neighborhoodName(entity)} median home price clear a configured future threshold in the next provider snapshot window?`,
    baseline: {
      metric: 'median_price',
      value: medianPrice,
      observed_at: entity.latest_observed_at || null,
      property_count: entity.property_count || 0,
      sample_confidence: entity.sample_confidence || 'unknown',
    },
    defaultConfig: {
      comparison_window: 'next_provider_snapshot_90_days',
      price_momentum_threshold: thresholdPrice,
      threshold_percent: thresholdPercent,
      minimum_provider_properties: Math.max(4, Math.min(Number(entity.property_count || 0), 12)),
    },
    sourceMetrics: {
      median_price: medianPrice,
      median_price_per_sqft: positiveNumber(metrics.median_price_per_sqft),
      min_price: positiveNumber(metrics.min_price),
      max_price: positiveNumber(metrics.max_price),
      status_mix: entity.status_mix || [],
    },
    evidenceRequired: [
      'Provider-backed future ZIP-code neighborhood snapshot with median price and property count.',
      'Baseline static FairValue snapshot hash and ZIP entity identifier.',
      'Public-safe settlement note explaining data coverage changes between baseline and future snapshot.',
    ],
  });
}

function buildRentYieldDraft(entity) {
  const metrics = entity.metrics || {};
  const baselineYield = positiveNumber(metrics.median_gross_rent_yield);
  const targetYield = baselineYield ? round(baselineYield + 0.005, 4) : 0.045;
  return buildDraft({
    entity,
    marketFormat: 'neighborhood_rent_yield_over_under',
    label: `${neighborhoodName(entity)} rent yield`,
    question: `Will ${neighborhoodName(entity)} gross rent yield verify at or above ${(targetYield * 100).toFixed(2)}% in the next provider snapshot window?`,
    baseline: {
      metric: 'median_gross_rent_yield',
      value: baselineYield,
      observed_at: entity.latest_observed_at || null,
      property_count: entity.property_count || 0,
      sample_confidence: entity.sample_confidence || 'unknown',
    },
    defaultConfig: {
      comparison_window: 'next_provider_snapshot_90_days',
      yield_threshold: targetYield,
      minimum_provider_properties: Math.max(4, Math.min(Number(entity.property_count || 0), 12)),
    },
    sourceMetrics: {
      median_gross_rent_yield: baselineYield,
      median_rent_estimate: positiveNumber(metrics.median_rent_estimate),
      median_price: positiveNumber(metrics.median_price),
      rent_estimate_coverage_percent: (entity.data_quality || []).find((item) => item.field === 'rent_zestimate')?.coverage_percent ?? null,
    },
    evidenceRequired: [
      'Provider-backed future ZIP-code median rent estimate and median price fields.',
      'Public-safe methodology for annualizing rent and excluding incomplete rows.',
      'Baseline static FairValue snapshot hash and ZIP entity identifier.',
    ],
  });
}

function buildOutperformanceDraft(entity) {
  const metrics = entity.metrics || {};
  const medianPrice = positiveNumber(metrics.median_price);
  return buildDraft({
    entity,
    marketFormat: 'neighborhood_outperformance_over_under',
    label: `${neighborhoodName(entity)} benchmark outperformance`,
    question: `Will ${neighborhoodName(entity)} outperform its disclosed metro benchmark by at least 1.50 percentage points over the configured settlement window?`,
    baseline: {
      metric: 'subject_region_return_minus_benchmark_region_return',
      value: null,
      subject_baseline_median_price: medianPrice,
      benchmark_region_return: null,
      observed_at: entity.latest_observed_at || null,
      property_count: entity.property_count || 0,
      sample_confidence: entity.sample_confidence || 'unknown',
    },
    defaultConfig: {
      comparison_window: 'next_provider_snapshot_180_days',
      benchmark_definition: 'provider_defined_metro_region',
      outperformance_threshold: 0.015,
      minimum_subject_properties: Math.max(4, Math.min(Number(entity.property_count || 0), 12)),
      minimum_benchmark_properties: 25,
    },
    sourceMetrics: {
      subject_median_price: medianPrice,
      subject_median_price_per_sqft: positiveNumber(metrics.median_price_per_sqft),
      benchmark_region_return: null,
      status_mix: entity.status_mix || [],
    },
    evidenceRequired: [
      'Pre-disclosed benchmark region definition before market launch.',
      'Provider-backed subject ZIP-code and benchmark-region future snapshots.',
      'Settlement calculation showing subject return, benchmark return, and spread.',
    ],
  });
}

function buildNeighborhoodMarketDrafts({ entity, provenance = null, nowSeconds = Date.now() / 1000 } = {}) {
  const generatedAt = new Date(Math.floor(Number(nowSeconds) || 0) * 1000).toISOString();
  const drafts = [
    buildPriceMomentumDraft(entity),
    buildRentYieldDraft(entity),
    buildOutperformanceDraft(entity),
  ].filter(Boolean);

  return {
    schema_version: NEIGHBORHOOD_MARKET_DRAFTS_SCHEMA_VERSION,
    generated_at: generatedAt,
    neighborhood_entity_id: entity?.entity_id || null,
    entity_type: entity?.entity_type || null,
    zip_code: entity?.zip_code || null,
    label: neighborhoodName(entity),
    property_count: entity?.property_count || 0,
    sample_confidence: entity?.sample_confidence || 'unknown',
    template_formats: [...NEIGHBORHOOD_DRAFT_MARKET_FORMATS],
    count: drafts.length,
    drafts,
    provenance: cloneJson(provenance || {}),
    limitations: [
      'These are draft-only neighborhood scenario contracts, not playable rooms.',
      'They use static ZIP-code aggregate baselines and require future provider-backed evidence before settlement.',
      'They are not appraisals, investment advice, lending decisions, or formal neighborhood-boundary definitions.',
    ],
  };
}

module.exports = {
  NEIGHBORHOOD_DRAFT_MARKET_FORMATS,
  NEIGHBORHOOD_MARKET_DRAFTS_SCHEMA_VERSION,
  buildNeighborhoodMarketDrafts,
};
