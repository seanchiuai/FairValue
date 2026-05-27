import registryData from '../data/marketTemplates.json';

export type MarketTemplateStatus = 'playable' | 'draft_only';

export type MarketFormat =
  | 'binary_over_under'
  | 'range_price_band'
  | 'rent_yield_over_under'
  | 'time_on_market_over_under'
  | 'renovation_budget_over_under';

export interface MarketTemplate {
  market_format: MarketFormat;
  label: string;
  status: MarketTemplateStatus;
  summary: string;
  outcome_schema: {
    type: string;
    outcomes: string[];
  };
  pricing_engine: string;
  settlement_inputs: string[];
  settlement_rule: string;
  supported_surfaces: string[];
  limitations: string[];
}

export interface MarketTemplateRegistry {
  schema_version: string;
  default_market_format: MarketFormat;
  templates: MarketTemplate[];
}

const registry = registryData as MarketTemplateRegistry;

export const MARKET_TEMPLATE_REGISTRY_SCHEMA_VERSION = registry.schema_version;
export const DEFAULT_MARKET_FORMAT = registry.default_market_format;

export function listMarketTemplates(): MarketTemplate[] {
  return registry.templates.map((template) => ({
    ...template,
    outcome_schema: {
      ...template.outcome_schema,
      outcomes: [...template.outcome_schema.outcomes],
    },
    settlement_inputs: [...template.settlement_inputs],
    supported_surfaces: [...template.supported_surfaces],
    limitations: [...template.limitations],
  }));
}

export function getMarketTemplate(format: string | null | undefined): MarketTemplate | null {
  const normalized = String(format || '').trim();
  const template = registry.templates.find((item) => item.market_format === normalized);
  return template ? listMarketTemplates().find((item) => item.market_format === template.market_format) || null : null;
}

export function isRegisteredMarketFormat(format: string | null | undefined): format is MarketFormat {
  return Boolean(getMarketTemplate(format));
}

export function isPlayableMarketFormat(format: string | null | undefined) {
  return getMarketTemplate(format)?.status === 'playable';
}

export function getMarketTemplateRegistry(): MarketTemplateRegistry {
  return {
    schema_version: registry.schema_version,
    default_market_format: registry.default_market_format,
    templates: listMarketTemplates(),
  };
}
