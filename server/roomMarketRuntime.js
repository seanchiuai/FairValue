const {
  DEFAULT_B,
  createMarketState,
  getPublicMarketState,
  placeBetWithBudget,
  getWinningOutcome,
  settlePlayers,
  roundMoney,
} = require('../src/lib/marketEngine');
const {
  createMultiOutcomeMarketState,
  getPublicMultiOutcomeMarketState,
  placeMultiOutcomeBetWithBudget,
  settleMultiOutcomePlayers,
  normalizeOutcomeId,
} = require('../src/lib/multiOutcomeMarketEngine');

const BINARY_MARKET_FORMAT = 'binary_over_under';
const RANGE_PRICE_BAND_FORMAT = 'range_price_band';
const RENT_YIELD_FORMAT = 'rent_yield_over_under';
const RANGE_OUTCOMES = Object.freeze(['below_band', 'inside_band', 'above_band']);
const BINARY_OUTCOMES = Object.freeze(['over', 'under']);
const BINARY_LMSR_FORMATS = new Set([BINARY_MARKET_FORMAT, RENT_YIELD_FORMAT]);
const MAX_PRICE = 100_000_000;
const MAX_ANNUAL_RENT = 10_000_000;

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPositiveNumber(value, max = MAX_PRICE) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= max;
}

function positiveNumberOrNull(value, max = MAX_PRICE) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= max ? parsed : null;
}

function percentOrNull(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const normalized = parsed > 1 ? parsed / 100 : parsed;
  return normalized > 0 && normalized <= 1 ? Math.round(normalized * 10000) / 10000 : null;
}

function readRangeBound(rawDraft, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(rawDraft || {}, key)) {
      return rawDraft[key];
    }
  }
  const rangeBand = rawDraft?.range_band || rawDraft?.price_band || rawDraft?.band;
  if (rangeBand && typeof rangeBand === 'object' && !Array.isArray(rangeBand)) {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(rangeBand, key)) return rangeBand[key];
    }
  }
  return undefined;
}

function defaultRangeConfig(askingPrice) {
  return {
    band_low: roundMoney(askingPrice * 0.95),
    band_high: roundMoney(askingPrice * 1.05),
  };
}

function readFirstPresent(rawDraft, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(rawDraft || {}, key)) return rawDraft[key];
  }
  return undefined;
}

function createMarketConfigForRoom(format, house, rawDraft = {}, liquidityB = DEFAULT_B) {
  const marketFormat = format || BINARY_MARKET_FORMAT;
  const askingPrice = positiveNumberOrNull(house?.asking_price);
  if (!askingPrice) return { error: 'Market config asking price is invalid' };

  if (marketFormat === BINARY_MARKET_FORMAT) {
    return {
      value: {
        schema_version: 'binary-over-under-config/v1',
        market_format: BINARY_MARKET_FORMAT,
        threshold_price: askingPrice,
        outcomes: [...BINARY_OUTCOMES],
        liquidity_b: liquidityB,
      },
    };
  }

  if (marketFormat === RENT_YIELD_FORMAT) {
    const rawThreshold = readFirstPresent(rawDraft, ['yield_threshold', 'rent_yield_threshold', 'target_yield', 'threshold']);
    const yieldThreshold = rawThreshold === undefined || rawThreshold === null || rawThreshold === ''
      ? 0.05
      : percentOrNull(rawThreshold);
    if (!yieldThreshold) return { error: 'Rent yield threshold must be between 0% and 100%' };
    return {
      value: {
        schema_version: 'rent-yield-over-under-config/v1',
        market_format: RENT_YIELD_FORMAT,
        yield_threshold: yieldThreshold,
        threshold_percent: Math.round(yieldThreshold * 10000) / 100,
        settlement_price_hint: askingPrice,
        outcomes: [...BINARY_OUTCOMES],
        liquidity_b: liquidityB,
      },
    };
  }

  if (marketFormat === RANGE_PRICE_BAND_FORMAT) {
    const defaults = defaultRangeConfig(askingPrice);
    const lowValue = readRangeBound(rawDraft, ['band_low', 'low', 'range_low', 'price_low']);
    const highValue = readRangeBound(rawDraft, ['band_high', 'high', 'range_high', 'price_high']);
    const bandLow = lowValue === undefined || lowValue === null || lowValue === ''
      ? defaults.band_low
      : positiveNumberOrNull(lowValue);
    const bandHigh = highValue === undefined || highValue === null || highValue === ''
      ? defaults.band_high
      : positiveNumberOrNull(highValue);

    if (!isPositiveNumber(bandLow) || !isPositiveNumber(bandHigh)) {
      return { error: 'Range price band bounds must be positive prices up to $100M' };
    }
    if (bandLow >= bandHigh) return { error: 'Range price band low must be below band high' };

    return {
      value: {
        schema_version: 'range-price-band-config/v1',
        market_format: RANGE_PRICE_BAND_FORMAT,
        band_low: roundMoney(bandLow),
        band_high: roundMoney(bandHigh),
        outcomes: [...RANGE_OUTCOMES],
        liquidity_b: liquidityB,
      },
    };
  }

  return { error: `Unsupported room market format: ${marketFormat}` };
}

function marketFormatFrom(roomOrFormat) {
  if (typeof roomOrFormat === 'string') return roomOrFormat || BINARY_MARKET_FORMAT;
  return roomOrFormat?.marketFormat || roomOrFormat?.market_format || BINARY_MARKET_FORMAT;
}

function marketConfigFrom(room) {
  return room?.marketConfig || room?.market_config || null;
}

function isBinaryMarket(formatOrRoom) {
  return BINARY_LMSR_FORMATS.has(marketFormatFrom(formatOrRoom));
}

function isRangeMarket(formatOrRoom) {
  return marketFormatFrom(formatOrRoom) === RANGE_PRICE_BAND_FORMAT;
}

function createInitialMarketState(format, marketConfig = {}, liquidityB = DEFAULT_B) {
  if (format === RANGE_PRICE_BAND_FORMAT) {
    return createMultiOutcomeMarketState({
      outcomes: marketConfig.outcomes || RANGE_OUTCOMES,
      b: marketConfig.liquidity_b || liquidityB,
    });
  }
  return createMarketState({ b: marketConfig.liquidity_b || liquidityB || DEFAULT_B });
}

function hydrateRoomMarketState(format, market, marketConfig = {}) {
  if (format === RANGE_PRICE_BAND_FORMAT) {
    return createMultiOutcomeMarketState({
      outcomes: market?.outcomes?.map((outcome) => outcome.id) || marketConfig.outcomes || RANGE_OUTCOMES,
      quantities: market?.quantities,
      b: market?.b || marketConfig.liquidity_b || DEFAULT_B,
      total_trades: market?.total_trades || 0,
      total_wagered: market?.total_wagered || 0,
    });
  }
  return createMarketState(market || { b: DEFAULT_B });
}

function getPublicRoomMarketState(room) {
  const format = marketFormatFrom(room);
  if (format === RANGE_PRICE_BAND_FORMAT) {
    return getPublicMultiOutcomeMarketState(room.market);
  }
  return getPublicMarketState(room.market);
}

function getRoomOutcomeIds(room) {
  const configOutcomes = marketConfigFrom(room)?.outcomes;
  if (Array.isArray(configOutcomes) && configOutcomes.length >= 2) return [...configOutcomes];
  if (Array.isArray(room?.market?.outcomes) && room.market.outcomes.length >= 2) {
    return room.market.outcomes.map((outcome) => outcome.id);
  }
  return ['over', 'under'];
}

function normalizeOutcomeForRoom(room, outcome) {
  let normalized;
  try {
    normalized = isBinaryMarket(room)
      ? String(outcome || '').trim().toLowerCase()
      : normalizeOutcomeId(outcome);
  } catch {
    return { error: `Outcome must be one of: ${getRoomOutcomeIds(room).join(', ')}` };
  }
  const allowed = new Set(getRoomOutcomeIds(room));
  if (!allowed.has(normalized)) {
    return {
      error: isBinaryMarket(room)
        ? "Outcome must be 'over' or 'under'"
        : `Outcome must be one of: ${[...allowed].join(', ')}`,
    };
  }
  return { value: normalized };
}

function placeRoomBetWithBudget(room, outcome, wager, source) {
  if (isRangeMarket(room)) {
    return placeMultiOutcomeBetWithBudget(room.market, outcome, wager, source);
  }
  return placeBetWithBudget(room.market, outcome, wager, source);
}

function selectedProbabilityAfter(room, trade, outcome) {
  if (isRangeMarket(room)) return Number(trade?.probabilities_after?.[outcome]) || 0;
  return outcome === 'over' ? trade.prob_over_after : trade.prob_under_after;
}

function winningOutcomeForRoom(room, actualPrice) {
  if (marketFormatFrom(room) === RENT_YIELD_FORMAT) {
    const input = typeof actualPrice === 'object' && actualPrice !== null
      ? actualPrice
      : { settlement_price: actualPrice };
    const settlementPrice = positiveNumberOrNull(input.settlement_price ?? input.actual_price);
    const annualRent = positiveNumberOrNull(input.annual_rent, MAX_ANNUAL_RENT);
    const threshold = percentOrNull(marketConfigFrom(room)?.yield_threshold);
    if (!settlementPrice) throw new Error('settlement_price must be positive');
    if (!annualRent) throw new Error('annual_rent must be positive');
    if (!threshold) throw new Error('Rent yield config is invalid');
    return annualRent / settlementPrice >= threshold ? 'over' : 'under';
  }
  if (isRangeMarket(room)) {
    const actual = Number(typeof actualPrice === 'object' && actualPrice !== null ? actualPrice.actual_price : actualPrice);
    const config = marketConfigFrom(room);
    if (!Number.isFinite(actual) || actual <= 0) throw new Error('actualPrice must be positive');
    if (!config || !isPositiveNumber(config.band_low) || !isPositiveNumber(config.band_high)) {
      throw new Error('Range price band config is invalid');
    }
    if (actual < config.band_low) return 'below_band';
    if (actual <= config.band_high) return 'inside_band';
    return 'above_band';
  }
  const actual = typeof actualPrice === 'object' && actualPrice !== null ? actualPrice.actual_price : actualPrice;
  return getWinningOutcome(actual, room.house.asking_price);
}

function settlementMetricsForRoom(room, settlementInput) {
  if (marketFormatFrom(room) !== RENT_YIELD_FORMAT) return {};
  const settlementPrice = positiveNumberOrNull(settlementInput?.settlement_price ?? settlementInput?.actual_price);
  const annualRent = positiveNumberOrNull(settlementInput?.annual_rent, MAX_ANNUAL_RENT);
  return {
    settlement_price: settlementPrice,
    annual_rent: annualRent,
    rent_yield: settlementPrice && annualRent ? Math.round((annualRent / settlementPrice) * 10000) / 10000 : null,
  };
}

function settlePlayersForRoom(room, players, winningOutcome) {
  if (isRangeMarket(room)) return settleMultiOutcomePlayers(players, winningOutcome);
  return settlePlayers(players, winningOutcome);
}

function eventMarketPayload(room) {
  return getPublicRoomMarketState(room);
}

function marketConfigPayload(room) {
  const config = marketConfigFrom(room);
  return config ? cloneJson(config) : null;
}

module.exports = {
  BINARY_MARKET_FORMAT,
  RANGE_PRICE_BAND_FORMAT,
  RENT_YIELD_FORMAT,
  RANGE_OUTCOMES,
  createMarketConfigForRoom,
  createInitialMarketState,
  hydrateRoomMarketState,
  getPublicRoomMarketState,
  getRoomOutcomeIds,
  normalizeOutcomeForRoom,
  placeRoomBetWithBudget,
  selectedProbabilityAfter,
  winningOutcomeForRoom,
  settlementMetricsForRoom,
  settlePlayersForRoom,
  eventMarketPayload,
  isBinaryMarket,
  isRangeMarket,
  marketConfigPayload,
};
