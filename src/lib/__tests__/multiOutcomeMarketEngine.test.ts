import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const engine = require('../multiOutcomeMarketEngine');

describe('multiOutcomeMarketEngine canonical state', () => {
  it('creates balanced multi-outcome LMSR state with probabilities that sum to one', () => {
    const state = engine.createMultiOutcomeMarketState({
      outcomes: ['below_band', 'inside_band', 'above_band'],
    });

    expect(state.schema_version).toBe('multi-outcome-lmsr-state/v1');
    expect(state.outcomes.map((outcome: { id: string }) => outcome.id)).toEqual([
      'below_band',
      'inside_band',
      'above_band',
    ]);
    expect(state.probabilities.below_band).toBeCloseTo(1 / 3, 10);
    expect(
      Object.values(state.probabilities).reduce((sum: number, probability) => sum + Number(probability), 0)
    ).toBeCloseTo(1, 10);
  });

  it('publishes rounded public state without mutating canonical quantities', () => {
    const state = engine.createMultiOutcomeMarketState({
      outcomes: ['low', 'mid', 'high'],
      quantities: { low: 1.23456, mid: 2.34567, high: 0 },
      total_trades: 2,
      total_wagered: 25.555,
    });
    const publicState = engine.getPublicMultiOutcomeMarketState(state);

    expect(state.quantities.low).toBeCloseTo(1.23456, 5);
    expect(publicState.quantities.low).toBe(1.23);
    expect(publicState.total_wagered).toBe(25.56);
    expect(publicState.outcomes).toHaveLength(3);
  });
});

describe('multiOutcomeMarketEngine trading behavior', () => {
  it('buys shares within budget and raises the selected outcome probability', () => {
    const market = engine.createMultiOutcomeMarketState({
      outcomes: ['below_band', 'inside_band', 'above_band'],
    });
    const before = market.probabilities.inside_band;
    const execution = engine.placeMultiOutcomeBetWithBudget(market, 'inside_band', 75, 'Range Player', 123);

    expect(execution.trade.wager).toBeCloseTo(75, 0);
    expect(execution.trade.outcome).toBe('inside_band');
    expect(execution.trade.timestamp).toBe(123);
    expect(execution.trade.source).toBe('Range Player');
    expect(execution.market.probabilities.inside_band).toBeGreaterThan(before);
    expect(
      Object.values(execution.market.probabilities).reduce((sum: number, probability) => sum + Number(probability), 0)
    ).toBeCloseTo(1, 10);
  });

  it('keeps costs and probabilities finite for extreme imbalanced quantities', () => {
    const quantities = {
      low: 1_000_000,
      mid: -1_000_000,
      high: 999_900,
    };

    expect(Number.isFinite(engine.multiOutcomeCost(quantities))).toBe(true);
    const prices = engine.multiOutcomePrices(quantities);
    expect(prices.low).toBeGreaterThan(0.7);
    expect(prices.mid).toBeGreaterThanOrEqual(0);
    expect(prices.high).toBeLessThanOrEqual(1);
  });

  it('rejects invalid outcome schemas and unknown trades', () => {
    expect(() => engine.createMultiOutcomeMarketState({ outcomes: ['only_one'] })).toThrow(/At least two outcomes/);
    expect(() => engine.createMultiOutcomeMarketState({ outcomes: ['low', 'low'] })).toThrow(/unique/);
    expect(() => engine.createMultiOutcomeMarketState({ outcomes: ['up outcome', 'down'] })).toThrow(/Outcome id/);
    expect(() => engine.placeMultiOutcomeBetWithBudget({
      outcomes: ['low', 'high'],
    }, 'mid', 10)).toThrow(/Unknown outcome/);
    expect(() => engine.applyMultiOutcomeTrade({ outcomes: ['low', 'high'] }, 'low', 0)).toThrow(/shares/);
    expect(() => engine.placeMultiOutcomeBetWithBudget({ outcomes: ['low', 'high'] }, 'low', 0)).toThrow(/budget/);
  });
});

describe('multiOutcomeMarketEngine settlement', () => {
  it('pays only shares on the winning outcome', () => {
    const players = [
      {
        session_id: 'p1',
        nickname: 'Range Winner',
        balance: 920,
        bets: [{ outcome: 'inside_band', shares: 82.5 }],
      },
      {
        session_id: 'p2',
        nickname: 'Range Miss',
        balance: 975,
        bets: [{ outcome: 'above_band', shares: 40 }],
      },
    ];

    const settlement = engine.settleMultiOutcomePlayers(players, 'inside_band');

    expect(settlement.results).toEqual([
      { nickname: 'Range Winner', payout: 82.5, final_balance: 1002.5 },
      { nickname: 'Range Miss', payout: 0, final_balance: 975 },
    ]);
    expect(settlement.players[0].balance).toBe(1002.5);
    expect(settlement.players[1].balance).toBe(975);
  });
});
