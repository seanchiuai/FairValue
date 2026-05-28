const registry = require('../src/data/marketTemplates.json');

const DEFAULT_MARKET_FORMAT = registry.default_market_format || 'binary_over_under';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeMarketFormat(value) {
  return String(value || '').trim();
}

function listMarketTemplates() {
  return cloneJson(registry.templates || []);
}

function getMarketTemplate(format) {
  const normalized = normalizeMarketFormat(format);
  return listMarketTemplates().find((template) => template.market_format === normalized) || null;
}

function isRegisteredMarketFormat(format) {
  return Boolean(getMarketTemplate(format));
}

function isPlayableMarketFormat(format) {
  return getMarketTemplate(format)?.status === 'playable';
}

function validateMarketFormatForRoom(format) {
  const normalized = normalizeMarketFormat(format) || DEFAULT_MARKET_FORMAT;
  const template = getMarketTemplate(normalized);
  if (!template) {
    return { error: 'Market draft format is not registered' };
  }
  if (template.status !== 'playable') {
    return {
      error: `Market draft format ${normalized} is registered but not playable yet`,
      template,
    };
  }
  return { value: normalized, template };
}

function marketTemplateAuditProjection(template) {
  if (!template) return null;
  return {
    market_format: template.market_format,
    label: template.label,
    status: template.status,
    pricing_engine: template.pricing_engine,
    outcome_schema: cloneJson(template.outcome_schema),
    settlement_inputs: Array.isArray(template.settlement_inputs) ? [...template.settlement_inputs] : [],
    settlement_rule: template.settlement_rule,
  };
}

function publicMarketTemplateRegistry() {
  return {
    schema_version: registry.schema_version,
    default_market_format: DEFAULT_MARKET_FORMAT,
    templates: listMarketTemplates(),
  };
}

module.exports = {
  DEFAULT_MARKET_FORMAT,
  getMarketTemplate,
  isPlayableMarketFormat,
  isRegisteredMarketFormat,
  listMarketTemplates,
  marketTemplateAuditProjection,
  publicMarketTemplateRegistry,
  validateMarketFormatForRoom,
};
