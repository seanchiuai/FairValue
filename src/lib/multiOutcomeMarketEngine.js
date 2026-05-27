const { DEFAULT_B, roundMoney, roundProbability, roundShares } = require('./marketEngine');

const MULTI_OUTCOME_STATE_SCHEMA_VERSION = 'multi-outcome-lmsr-state/v1';

function assertFiniteNumber(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a finite number`);
  return parsed;
}

function assertNonNegativeNumber(value, name) {
  const parsed = assertFiniteNumber(value, name);
  if (parsed < 0) throw new Error(`${name} must be non-negative`);
  return parsed;
}

function assertPositiveNumber(value, name) {
  const parsed = assertFiniteNumber(value, name);
  if (parsed <= 0) throw new Error(`${name} must be positive`);
  return parsed;
}

function normalizeOutcomeId(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9_:-]{1,63}$/.test(normalized)) {
    throw new Error('Outcome id must be 2-64 lowercase letters, numbers, underscores, colons, or dashes');
  }
  return normalized;
}

function normalizeOutcomeIds(outcomes) {
  if (!Array.isArray(outcomes) || outcomes.length < 2) {
    throw new Error('At least two outcomes are required');
  }
  const ids = outcomes.map((outcome) => normalizeOutcomeId(typeof outcome === 'string' ? outcome : outcome?.id));
  const unique = new Set(ids);
  if (unique.size !== ids.length) throw new Error('Outcome ids must be unique');
  return ids;
}

function outcomeIdsFrom(input = {}) {
  if (Array.isArray(input.outcomes) && input.outcomes.length > 0) return normalizeOutcomeIds(input.outcomes);
  if (input.quantities && typeof input.quantities === 'object' && !Array.isArray(input.quantities)) {
    return normalizeOutcomeIds(Object.keys(input.quantities));
  }
  throw new Error('outcomes are required');
}

function quantityMapFor(outcomeIds, quantities = {}) {
  const map = {};
  for (const id of outcomeIds) {
    map[id] = assertFiniteNumber(quantities[id] ?? 0, `quantities.${id}`);
  }
  return map;
}

function stableLogSumExp(values) {
  const max = Math.max(...values);
  return max + Math.log(values.reduce((sum, value) => sum + Math.exp(value - max), 0));
}

function multiOutcomeCost(quantities, b = DEFAULT_B) {
  const outcomeIds = normalizeOutcomeIds(Object.keys(quantities || {}));
  const liquidity = assertPositiveNumber(b, 'b');
  const scaled = outcomeIds.map((id) => assertFiniteNumber(quantities[id], `quantities.${id}`) / liquidity);
  return liquidity * stableLogSumExp(scaled);
}

function multiOutcomePrices(quantities, b = DEFAULT_B) {
  const outcomeIds = normalizeOutcomeIds(Object.keys(quantities || {}));
  const liquidity = assertPositiveNumber(b, 'b');
  const scaled = outcomeIds.map((id) => assertFiniteNumber(quantities[id], `quantities.${id}`) / liquidity);
  const max = Math.max(...scaled);
  const weights = scaled.map((value) => Math.exp(value - max));
  const total = weights.reduce((sum, value) => sum + value, 0);
  return outcomeIds.reduce((prices, id, index) => {
    prices[id] = weights[index] / total;
    return prices;
  }, {});
}

function createMultiOutcomeMarketState(input = {}) {
  const outcomeIds = outcomeIdsFrom(input);
  const quantities = quantityMapFor(outcomeIds, input.quantities || input.q || {});
  const liquidity = assertPositiveNumber(input.b ?? DEFAULT_B, 'b');
  const totalTrades = assertNonNegativeNumber(input.total_trades ?? input.totalTrades ?? 0, 'total_trades');
  const totalWagered = assertNonNegativeNumber(input.total_wagered ?? input.totalWagered ?? 0, 'total_wagered');
  const prices = multiOutcomePrices(quantities, liquidity);

  return {
    schema_version: MULTI_OUTCOME_STATE_SCHEMA_VERSION,
    outcomes: outcomeIds.map((id) => ({
      id,
      q: quantities[id],
      probability: prices[id],
    })),
    quantities,
    probabilities: prices,
    total_trades: totalTrades,
    total_wagered: totalWagered,
    avg_bet_size: totalTrades > 0 ? totalWagered / totalTrades : 0,
    b: liquidity,
  };
}

function getPublicMultiOutcomeMarketState(market) {
  const state = createMultiOutcomeMarketState(market);
  return {
    schema_version: state.schema_version,
    outcomes: state.outcomes.map((outcome) => ({
      id: outcome.id,
      q: roundShares(outcome.q),
      probability: roundProbability(outcome.probability),
    })),
    quantities: Object.fromEntries(state.outcomes.map((outcome) => [outcome.id, roundShares(outcome.q)])),
    probabilities: Object.fromEntries(state.outcomes.map((outcome) => [outcome.id, roundProbability(outcome.probability)])),
    total_trades: state.total_trades,
    total_wagered: roundMoney(state.total_wagered),
    avg_bet_size: state.total_trades > 0 ? roundMoney(state.total_wagered / state.total_trades) : 0,
    b: state.b,
  };
}

function executeMultiOutcomeBuy(market, outcomeId, shares) {
  const state = createMultiOutcomeMarketState(market);
  const normalizedOutcome = normalizeOutcomeId(outcomeId);
  if (!Object.prototype.hasOwnProperty.call(state.quantities, normalizedOutcome)) {
    throw new Error(`Unknown outcome: ${normalizedOutcome}`);
  }
  const purchasedShares = assertNonNegativeNumber(shares, 'shares');
  const oldCost = multiOutcomeCost(state.quantities, state.b);
  const nextQuantities = {
    ...state.quantities,
    [normalizedOutcome]: state.quantities[normalizedOutcome] + purchasedShares,
  };
  const cost = multiOutcomeCost(nextQuantities, state.b) - oldCost;
  const probabilities = multiOutcomePrices(nextQuantities, state.b);

  return {
    cost,
    quantities: nextQuantities,
    probabilities,
  };
}

function buyMultiOutcomeWithBudget(market, outcomeId, budget) {
  const spend = assertNonNegativeNumber(budget, 'budget');
  if (spend === 0) return 0;

  let lo = 0;
  let hi = Math.max(1, spend * 2);
  while (executeMultiOutcomeBuy(market, outcomeId, hi).cost < spend) {
    hi *= 2;
  }

  for (let index = 0; index < 100; index += 1) {
    const mid = (lo + hi) / 2;
    const cost = executeMultiOutcomeBuy(market, outcomeId, mid).cost;
    if (Math.abs(cost - spend) < 0.001) return mid;
    if (cost < spend) lo = mid;
    else hi = mid;
  }

  return (lo + hi) / 2;
}

function applyMultiOutcomeTrade(market, outcomeId, shares, source = 'manual', timestamp = Date.now() / 1000) {
  const state = createMultiOutcomeMarketState(market);
  const purchasedShares = assertPositiveNumber(shares, 'shares');
  const execution = executeMultiOutcomeBuy(state, outcomeId, purchasedShares);
  const nextMarket = createMultiOutcomeMarketState({
    outcomes: state.outcomes.map((outcome) => outcome.id),
    quantities: execution.quantities,
    b: state.b,
    total_trades: state.total_trades + 1,
    total_wagered: state.total_wagered + execution.cost,
  });

  return {
    market: nextMarket,
    publicMarket: getPublicMultiOutcomeMarketState(nextMarket),
    trade: {
      outcome: normalizeOutcomeId(outcomeId),
      wager: roundMoney(execution.cost),
      payout: roundShares(purchasedShares),
      profit_if_correct: roundMoney(purchasedShares - execution.cost),
      probabilities_after: Object.fromEntries(
        Object.entries(nextMarket.probabilities).map(([id, probability]) => [id, roundProbability(probability)])
      ),
      timestamp,
      source,
    },
    shares: roundShares(purchasedShares),
  };
}

function placeMultiOutcomeBetWithBudget(market, outcomeId, budget, source = 'manual', timestamp = Date.now() / 1000) {
  const spend = assertPositiveNumber(budget, 'budget');
  const shares = buyMultiOutcomeWithBudget(market, outcomeId, spend);
  return applyMultiOutcomeTrade(market, outcomeId, shares, source, timestamp);
}

function settleMultiOutcomePlayers(players, winningOutcome) {
  const normalizedOutcome = normalizeOutcomeId(winningOutcome);
  const playerList = Array.isArray(players) ? players : Object.values(players || {});
  const updatedPlayers = playerList.map((player) => {
    const bets = Array.isArray(player.bets) ? player.bets : [];
    const payout = bets.reduce((sum, bet) => {
      return normalizeOutcomeId(bet.outcome) === normalizedOutcome
        ? sum + assertNonNegativeNumber(bet.shares || 0, 'bet.shares')
        : sum;
    }, 0);
    return {
      ...player,
      balance: roundMoney(assertFiniteNumber(player.balance || 0, 'player.balance') + payout),
    };
  });

  return {
    players: updatedPlayers,
    results: updatedPlayers.map((player, index) => {
      const original = playerList[index] || {};
      const payout = roundMoney(player.balance - assertFiniteNumber(original.balance || 0, 'player.balance'));
      return {
        nickname: player.nickname,
        payout,
        final_balance: player.balance,
      };
    }),
  };
}

module.exports = {
  MULTI_OUTCOME_STATE_SCHEMA_VERSION,
  createMultiOutcomeMarketState,
  getPublicMultiOutcomeMarketState,
  multiOutcomeCost,
  multiOutcomePrices,
  executeMultiOutcomeBuy,
  buyMultiOutcomeWithBudget,
  applyMultiOutcomeTrade,
  placeMultiOutcomeBetWithBudget,
  settleMultiOutcomePlayers,
  normalizeOutcomeId,
  normalizeOutcomeIds,
};
