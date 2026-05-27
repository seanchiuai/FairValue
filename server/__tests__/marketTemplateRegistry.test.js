const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_MARKET_FORMAT,
  getMarketTemplate,
  isPlayableMarketFormat,
  isRegisteredMarketFormat,
  marketTemplateAuditProjection,
  publicMarketTemplateRegistry,
  validateMarketFormatForRoom,
} = require('../marketTemplateRegistry');

test('market template registry exposes playable binary/range/rent-yield and draft-only future formats', () => {
  const registry = publicMarketTemplateRegistry();
  assert.equal(registry.schema_version, 'market-template-registry/v1');
  assert.equal(registry.default_market_format, 'binary_over_under');
  assert.ok(registry.templates.length >= 4);

  const binary = getMarketTemplate(DEFAULT_MARKET_FORMAT);
  assert.equal(binary.status, 'playable');
  assert.equal(binary.pricing_engine, 'lmsr_binary_v1');
  assert.deepEqual(binary.outcome_schema.outcomes, ['over', 'under']);
  assert.equal(isRegisteredMarketFormat('range_price_band'), true);
  assert.equal(isPlayableMarketFormat('range_price_band'), true);
  assert.equal(getMarketTemplate('range_price_band').pricing_engine, 'lmsr_multi_outcome_v1');
  assert.equal(isRegisteredMarketFormat('rent_yield_over_under'), true);
  assert.equal(isPlayableMarketFormat('rent_yield_over_under'), true);
  assert.equal(getMarketTemplate('rent_yield_over_under').pricing_engine, 'lmsr_binary_v1');

  registry.templates[0].label = 'mutated outside';
  assert.equal(publicMarketTemplateRegistry().templates[0].label, 'Binary over/under');
});

test('room market format validation accepts playable rent-yield and blocks remaining draft-only formats', () => {
  const binary = validateMarketFormatForRoom('binary_over_under');
  assert.equal(binary.value, 'binary_over_under');
  assert.equal(binary.template.status, 'playable');

  const range = validateMarketFormatForRoom('range_price_band');
  assert.equal(range.value, 'range_price_band');
  assert.equal(range.template.status, 'playable');

  const rentYield = validateMarketFormatForRoom('rent_yield_over_under');
  assert.equal(rentYield.value, 'rent_yield_over_under');
  assert.equal(rentYield.template.status, 'playable');

  const draftOnly = validateMarketFormatForRoom('time_on_market_over_under');
  assert.match(draftOnly.error, /registered but not playable yet/);
  assert.equal(draftOnly.template.status, 'draft_only');

  const missing = validateMarketFormatForRoom('weather_derivative');
  assert.equal(missing.error, 'Market draft format is not registered');
});

test('market template audit projection keeps only stable contract fields', () => {
  const projection = marketTemplateAuditProjection(getMarketTemplate('binary_over_under'));
  assert.equal(projection.market_format, 'binary_over_under');
  assert.equal(projection.status, 'playable');
  assert.equal(projection.pricing_engine, 'lmsr_binary_v1');
  assert.deepEqual(projection.settlement_inputs, ['actual_price', 'asking_price', 'settlement_evidence']);

  projection.settlement_inputs.push('mutated');
  const nextProjection = marketTemplateAuditProjection(getMarketTemplate('binary_over_under'));
  assert.equal(nextProjection.settlement_inputs.includes('mutated'), false);
});
