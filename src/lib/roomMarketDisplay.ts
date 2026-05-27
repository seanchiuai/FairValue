import type { Market, RoomMarketConfig } from '../types';

export const BINARY_MARKET_FORMAT = 'binary_over_under';
export const RANGE_PRICE_BAND_FORMAT = 'range_price_band';
export const RENT_YIELD_MARKET_FORMAT = 'rent_yield_over_under';
export const TIME_ON_MARKET_MARKET_FORMAT = 'time_on_market_over_under';
export const RENOVATION_BUDGET_MARKET_FORMAT = 'renovation_budget_over_under';

export function isRangeMarket(format?: string | null) {
  return format === RANGE_PRICE_BAND_FORMAT;
}

export function isBinaryMarket(format?: string | null) {
  return !format ||
    format === BINARY_MARKET_FORMAT ||
    format === RENT_YIELD_MARKET_FORMAT ||
    format === TIME_ON_MARKET_MARKET_FORMAT ||
    format === RENOVATION_BUDGET_MARKET_FORMAT;
}

export function isRentYieldMarket(format?: string | null) {
  return format === RENT_YIELD_MARKET_FORMAT;
}

export function isTimeOnMarketMarket(format?: string | null) {
  return format === TIME_ON_MARKET_MARKET_FORMAT;
}

export function isRenovationBudgetMarket(format?: string | null) {
  return format === RENOVATION_BUDGET_MARKET_FORMAT;
}

export function formatOutcomeLabel(outcome: string) {
  const normalized = String(outcome || '').trim().toLowerCase();
  if (normalized === 'over') return 'OVER';
  if (normalized === 'under') return 'UNDER';
  if (normalized === 'below_band') return 'Below band';
  if (normalized === 'inside_band') return 'Inside band';
  if (normalized === 'above_band') return 'Above band';
  return normalized.replace(/[_:-]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatMarketLabel(format?: string | null) {
  if (format === RANGE_PRICE_BAND_FORMAT) return 'Range price band';
  if (format === RENT_YIELD_MARKET_FORMAT) return 'Rent yield over/under';
  if (format === TIME_ON_MARKET_MARKET_FORMAT) return 'Time on market over/under';
  if (format === RENOVATION_BUDGET_MARKET_FORMAT) return 'Renovation budget over/under';
  return 'Over/Under';
}

export function formatMoney(value?: number | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '$0';
  return `$${Math.round(parsed).toLocaleString()}`;
}

export function rangeBandLabel(config?: RoomMarketConfig | null) {
  if (!config || !Number.isFinite(config.band_low) || !Number.isFinite(config.band_high)) {
    return 'configured band';
  }
  return `${formatMoney(config.band_low)}-${formatMoney(config.band_high)}`;
}

export function rangeOutcomeDescription(outcome: string, config?: RoomMarketConfig | null) {
  if (!config || !Number.isFinite(config.band_low) || !Number.isFinite(config.band_high)) {
    return '';
  }
  if (outcome === 'below_band') return `< ${formatMoney(config.band_low)}`;
  if (outcome === 'inside_band') return rangeBandLabel(config);
  if (outcome === 'above_band') return `> ${formatMoney(config.band_high)}`;
  return '';
}

export function rangeSettlementOutcome(actualPrice: number, config?: RoomMarketConfig | null) {
  if (!config || !Number.isFinite(config.band_low) || !Number.isFinite(config.band_high)) return '';
  if (actualPrice < Number(config.band_low)) return 'below_band';
  if (actualPrice <= Number(config.band_high)) return 'inside_band';
  return 'above_band';
}

export function rentYieldThresholdLabel(config?: RoomMarketConfig | null) {
  const threshold = Number(config?.yield_threshold);
  if (!Number.isFinite(threshold) || threshold <= 0) return 'configured yield';
  return `${Math.round(threshold * 10000) / 100}%`;
}

export function rentYieldSettlementOutcome(annualRent: number, settlementPrice: number, config?: RoomMarketConfig | null) {
  const threshold = Number(config?.yield_threshold);
  if (!Number.isFinite(threshold) || threshold <= 0 || !Number.isFinite(annualRent) || !Number.isFinite(settlementPrice) || settlementPrice <= 0) {
    return '';
  }
  return annualRent / settlementPrice >= threshold ? 'over' : 'under';
}

export function timeOnMarketThresholdLabel(config?: RoomMarketConfig | null) {
  const threshold = Number(config?.days_threshold);
  if (!Number.isFinite(threshold) || threshold <= 0) return 'configured days';
  return `${Math.round(threshold)} days`;
}

export function timeOnMarketSettlementOutcome(daysOnMarket: number, config?: RoomMarketConfig | null) {
  const threshold = Number(config?.days_threshold);
  if (!Number.isFinite(threshold) || threshold <= 0 || !Number.isFinite(daysOnMarket) || daysOnMarket <= 0) {
    return '';
  }
  return daysOnMarket >= threshold ? 'over' : 'under';
}

export function renovationBudgetThresholdLabel(config?: RoomMarketConfig | null) {
  const threshold = Number(config?.budget_threshold);
  if (!Number.isFinite(threshold) || threshold <= 0) return 'configured budget';
  return formatMoney(threshold);
}

export function renovationBudgetSettlementOutcome(verifiedCost: number, config?: RoomMarketConfig | null) {
  const threshold = Number(config?.budget_threshold);
  if (!Number.isFinite(threshold) || threshold <= 0 || !Number.isFinite(verifiedCost) || verifiedCost <= 0) {
    return '';
  }
  return verifiedCost >= threshold ? 'over' : 'under';
}

export function roomOutcomeIds(market: Market | null, config?: RoomMarketConfig | null) {
  if (Array.isArray(market?.outcomes) && market.outcomes.length > 0) {
    return market.outcomes.map((outcome) => outcome.id);
  }
  if (Array.isArray(config?.outcomes) && config.outcomes.length > 0) return config.outcomes;
  return ['over', 'under'];
}

export function outcomeProbability(market: Market | null, outcome: string) {
  if (!market) return 0;
  if (outcome === 'over' && Number.isFinite(market.prob_over)) return market.prob_over;
  if (outcome === 'under' && Number.isFinite(market.prob_under)) return market.prob_under;
  const fromMap = market.probabilities?.[outcome];
  if (Number.isFinite(fromMap)) return Number(fromMap);
  const fromList = market.outcomes?.find((item) => item.id === outcome)?.probability;
  return Number.isFinite(fromList) ? Number(fromList) : 0;
}

export function leadingOutcome(market: Market | null, config?: RoomMarketConfig | null) {
  return roomOutcomeIds(market, config)
    .map((id) => ({ id, probability: outcomeProbability(market, id) }))
    .sort((left, right) => right.probability - left.probability)[0] || { id: 'over', probability: 0.5 };
}
