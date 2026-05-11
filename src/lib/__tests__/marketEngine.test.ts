const engine = require('../marketEngine');

describe('marketEngine canonical state', () => {
  it('normalizes camel inputs to one snake_case market shape', () => {
    const state = engine.createMarketState({
      qOver: 12.5,
      qUnder: 4.25,
      totalTrades: 3,
      totalWagered: 150,
    });

    expect(state.q_over).toBe(12.5);
    expect(state.q_under).toBe(4.25);
    expect(state.total_trades).toBe(3);
    expect(state.total_wagered).toBe(150);
    expect(state.qOver).toBeUndefined();
    expect(state.totalTrades).toBeUndefined();
  });

  it('formats public market state without changing the canonical raw state', () => {
    const state = engine.createMarketState({
      q_over: 1.23456,
      q_under: 2.34567,
      total_trades: 2,
      total_wagered: 25.555,
    });
    const publicState = engine.getPublicMarketState(state);

    expect(state.q_over).toBeCloseTo(1.23456, 5);
    expect(publicState.q_over).toBe(1.23);
    expect(publicState.total_wagered).toBe(25.56);
  });
});

describe('marketEngine numerical stability and validation', () => {
  it('keeps cost and prices finite for extreme imbalanced quantities', () => {
    expect(Number.isFinite(engine.costFunction(1_000_000, 999_900))).toBe(true);
    expect(engine.priceOver(1_000_000, -1_000_000)).toBe(1);
    expect(engine.priceOver(-1_000_000, 1_000_000)).toBe(0);
  });

  it('rejects invalid market inputs', () => {
    expect(() => engine.costFunction(Number.NaN, 0)).toThrow(/finite/);
    expect(() => engine.priceOver(0, 0, 0)).toThrow(/positive/);
    expect(() => engine.buyWithBudget('over', -1, 0, 0)).toThrow(/non-negative/);
    expect(() => engine.applyTrade(engine.createMarketState(), 'sideways', 1)).toThrow(/Outcome/);
    expect(() => engine.calculateImpliedPrice(1.2, 500000)).toThrow(/between 0 and 1/);
  });
});

describe('marketEngine trading behavior', () => {
  it('buys shares within budget for both outcomes', () => {
    for (const outcome of ['over', 'under']) {
      const market = engine.createMarketState({ q_over: 8, q_under: 4 });
      const shares = engine.buyWithBudgetForState(market, outcome, 75);
      const trade = engine.applyTrade(market, outcome, shares, 'test').trade;

      expect(shares).toBeGreaterThan(0);
      expect(trade.wager).toBeCloseTo(75, 0);
    }
  });

  it('reports slippage and public state after a budget trade', () => {
    const market = engine.createMarketState();
    const execution = engine.placeBetWithBudget(market, 'over', 50, 'Player One', 123);

    expect(execution.publicMarket.total_trades).toBe(1);
    expect(execution.trade.timestamp).toBe(123);
    expect(execution.trade.source).toBe('Player One');
    expect(execution.trade.wager).toBeCloseTo(50, 0);
    expect(execution.slippage.prob_over_delta).toBeGreaterThan(0);
    expect(execution.slippage.prob_under_delta).toBeLessThan(0);
  });
});

describe('marketEngine settlement', () => {
  it('determines winner and pays only winning shares', () => {
    const players = [
      {
        session_id: 'p1',
        nickname: 'Over Player',
        balance: 950,
        bets: [{ outcome: 'over', shares: 60 }],
      },
      {
        session_id: 'p2',
        nickname: 'Under Player',
        balance: 975,
        bets: [{ outcome: 'under', shares: 40 }],
      },
    ];

    const winningOutcome = engine.getWinningOutcome(510000, 500000);
    const settlement = engine.settlePlayers(players, winningOutcome);

    expect(winningOutcome).toBe('over');
    expect(settlement.results).toEqual([
      { nickname: 'Over Player', payout: 60, final_balance: 1010 },
      { nickname: 'Under Player', payout: 0, final_balance: 975 },
    ]);
    expect(settlement.players[0].balance).toBe(1010);
    expect(settlement.players[1].balance).toBe(975);
  });
});
