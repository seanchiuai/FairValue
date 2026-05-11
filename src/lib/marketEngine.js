const DEFAULT_B = 100.0;
const IMPLIED_VALUE_RANGE = 0.10;

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

function normalizeOutcome(outcome) {
  const normalized = String(outcome || '').trim().toLowerCase();
  if (normalized !== 'over' && normalized !== 'under') {
    throw new Error("Outcome must be 'over' or 'under'");
  }
  return normalized;
}

function roundTo(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function roundMoney(value) {
  return roundTo(value, 2);
}

function roundShares(value) {
  return roundTo(value, 2);
}

function roundProbability(value) {
  return roundTo(value, 4);
}

function costFunction(qOver, qUnder, b = DEFAULT_B) {
  const over = assertFiniteNumber(qOver, 'qOver');
  const under = assertFiniteNumber(qUnder, 'qUnder');
  const liquidity = assertPositiveNumber(b, 'b');
  const scaledOver = over / liquidity;
  const scaledUnder = under / liquidity;
  const maxScaled = Math.max(scaledOver, scaledUnder);
  return liquidity * (maxScaled + Math.log(Math.exp(scaledOver - maxScaled) + Math.exp(scaledUnder - maxScaled)));
}

function priceOver(qOver, qUnder, b = DEFAULT_B) {
  const over = assertFiniteNumber(qOver, 'qOver');
  const under = assertFiniteNumber(qUnder, 'qUnder');
  const liquidity = assertPositiveNumber(b, 'b');
  const diff = (under - over) / liquidity;
  if (diff > 709) return 0;
  if (diff < -709) return 1;
  return 1 / (1 + Math.exp(diff));
}

function priceUnder(qOver, qUnder, b = DEFAULT_B) {
  return 1 - priceOver(qOver, qUnder, b);
}

function calculateImpliedPrice(probOver, askingPrice) {
  const probability = assertFiniteNumber(probOver, 'probOver');
  const asking = assertPositiveNumber(askingPrice, 'askingPrice');
  if (probability < 0 || probability > 1) throw new Error('probOver must be between 0 and 1');
  return asking + (probability - 0.5) * 2 * asking * IMPLIED_VALUE_RANGE;
}

function createMarketState(input = {}) {
  const qOver = assertFiniteNumber(input.q_over ?? input.qOver ?? 0, 'q_over');
  const qUnder = assertFiniteNumber(input.q_under ?? input.qUnder ?? 0, 'q_under');
  const liquidity = assertPositiveNumber(input.b ?? DEFAULT_B, 'b');
  const totalTrades = assertNonNegativeNumber(input.total_trades ?? input.totalTrades ?? 0, 'total_trades');
  const totalWagered = assertNonNegativeNumber(input.total_wagered ?? input.totalWagered ?? 0, 'total_wagered');
  const probOver = priceOver(qOver, qUnder, liquidity);
  const probUnder = 1 - probOver;

  return {
    prob_over: probOver,
    prob_under: probUnder,
    q_over: qOver,
    q_under: qUnder,
    total_trades: totalTrades,
    total_wagered: totalWagered,
    avg_bet_size: totalTrades > 0 ? totalWagered / totalTrades : 0,
    b: liquidity,
  };
}

function getPublicMarketState(market) {
  const state = createMarketState(market);
  return {
    prob_over: roundProbability(state.prob_over),
    prob_under: roundProbability(state.prob_under),
    q_over: roundShares(state.q_over),
    q_under: roundShares(state.q_under),
    total_trades: state.total_trades,
    total_wagered: roundMoney(state.total_wagered),
    avg_bet_size: state.total_trades > 0 ? roundMoney(state.total_wagered / state.total_trades) : 0,
    b: state.b,
  };
}

function executeBuy(outcome, shares, qOver, qUnder, b = DEFAULT_B) {
  const normalizedOutcome = normalizeOutcome(outcome);
  const purchasedShares = assertNonNegativeNumber(shares, 'shares');
  const currentQOver = assertFiniteNumber(qOver, 'qOver');
  const currentQUnder = assertFiniteNumber(qUnder, 'qUnder');
  const liquidity = assertPositiveNumber(b, 'b');
  const oldCost = costFunction(currentQOver, currentQUnder, liquidity);
  const newQOver = normalizedOutcome === 'over' ? currentQOver + purchasedShares : currentQOver;
  const newQUnder = normalizedOutcome === 'under' ? currentQUnder + purchasedShares : currentQUnder;
  const newCost = costFunction(newQOver, newQUnder, liquidity);
  const cost = newCost - oldCost;
  const newProbOver = priceOver(newQOver, newQUnder, liquidity);

  return { cost, newQOver, newQUnder, newProbOver };
}

function buyWithBudget(outcome, budget, qOver, qUnder, b = DEFAULT_B) {
  const normalizedOutcome = normalizeOutcome(outcome);
  const spend = assertNonNegativeNumber(budget, 'budget');
  const currentQOver = assertFiniteNumber(qOver, 'qOver');
  const currentQUnder = assertFiniteNumber(qUnder, 'qUnder');
  const liquidity = assertPositiveNumber(b, 'b');
  if (spend === 0) return 0;

  let lo = 0;
  let hi = spend * 10;
  for (let i = 0; i < 100; i += 1) {
    const mid = (lo + hi) / 2;
    const cost = normalizedOutcome === 'over'
      ? costFunction(currentQOver + mid, currentQUnder, liquidity) - costFunction(currentQOver, currentQUnder, liquidity)
      : costFunction(currentQOver, currentQUnder + mid, liquidity) - costFunction(currentQOver, currentQUnder, liquidity);

    if (Math.abs(cost - spend) < 0.001) return mid;
    if (cost < spend) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function buyWithBudgetForState(market, outcome, budget) {
  const state = createMarketState(market);
  return buyWithBudget(outcome, budget, state.q_over, state.q_under, state.b);
}

function calculateSlippage(beforeMarket, afterMarket) {
  const before = createMarketState(beforeMarket);
  const after = createMarketState(afterMarket);
  return {
    prob_over_delta: roundProbability(after.prob_over - before.prob_over),
    prob_under_delta: roundProbability(after.prob_under - before.prob_under),
  };
}

function applyTrade(market, outcome, shares, source = 'manual', timestamp = Date.now() / 1000) {
  const state = createMarketState(market);
  const normalizedOutcome = normalizeOutcome(outcome);
  const purchasedShares = assertPositiveNumber(shares, 'shares');
  const result = executeBuy(normalizedOutcome, purchasedShares, state.q_over, state.q_under, state.b);
  const nextMarket = createMarketState({
    ...state,
    q_over: result.newQOver,
    q_under: result.newQUnder,
    total_trades: state.total_trades + 1,
    total_wagered: state.total_wagered + result.cost,
  });

  const trade = {
    outcome: normalizedOutcome,
    wager: roundMoney(result.cost),
    payout: roundShares(purchasedShares),
    profit_if_correct: roundMoney(purchasedShares - result.cost),
    prob_over_after: roundProbability(nextMarket.prob_over),
    prob_under_after: roundProbability(nextMarket.prob_under),
    timestamp,
    source,
  };

  return {
    market: nextMarket,
    publicMarket: getPublicMarketState(nextMarket),
    trade,
    shares: roundShares(purchasedShares),
    slippage: calculateSlippage(state, nextMarket),
  };
}

function placeBetWithBudget(market, outcome, budget, source = 'manual', timestamp = Date.now() / 1000) {
  const shares = buyWithBudgetForState(market, outcome, budget);
  return applyTrade(market, outcome, shares, source, timestamp);
}

function getWinningOutcome(actualPrice, askingPrice) {
  const actual = assertPositiveNumber(actualPrice, 'actualPrice');
  const asking = assertPositiveNumber(askingPrice, 'askingPrice');
  return actual >= asking ? 'over' : 'under';
}

function settlePlayers(players, winningOutcome) {
  const normalizedOutcome = normalizeOutcome(winningOutcome);
  const playerList = Array.isArray(players) ? players : Object.values(players || {});
  const updatedPlayers = playerList.map((player) => {
    const bets = Array.isArray(player.bets) ? player.bets : [];
    const payout = bets.reduce((sum, bet) => {
      return bet.outcome === normalizedOutcome ? sum + assertNonNegativeNumber(bet.shares || 0, 'bet.shares') : sum;
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
  DEFAULT_B,
  IMPLIED_VALUE_RANGE,
  costFunction,
  priceOver,
  priceUnder,
  calculateImpliedPrice,
  createMarketState,
  getPublicMarketState,
  executeBuy,
  buyWithBudget,
  buyWithBudgetForState,
  calculateSlippage,
  applyTrade,
  placeBetWithBudget,
  getWinningOutcome,
  settlePlayers,
  normalizeOutcome,
  roundMoney,
  roundShares,
  roundProbability,
};
