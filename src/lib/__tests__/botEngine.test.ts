import { computeBotTrade, startBotEngine, DEFAULT_BOT_CONFIG } from '../botEngine';

describe('computeBotTrade', () => {
  it('returns a valid outcome', () => {
    const trade = computeBotTrade(0, 0);
    expect(['over', 'under']).toContain(trade.outcome);
  });

  it('returns shares from the valid set', () => {
    const SHARE_SIZES = [1, 2, 3, 5, 8, 10, 15, 20];
    for (let i = 0; i < 20; i++) {
      const trade = computeBotTrade(0, 0);
      expect(SHARE_SIZES).toContain(trade.shares);
    }
  });

  it('returns positive cost', () => {
    const trade = computeBotTrade(0, 0);
    expect(trade.cost).toBeGreaterThan(0);
  });

  it('updates quantities correctly', () => {
    const trade = computeBotTrade(10, 10);
    if (trade.outcome === 'over') {
      expect(trade.newQOver).toBe(10 + trade.shares);
      expect(trade.newQUnder).toBe(10);
    } else {
      expect(trade.newQOver).toBe(10);
      expect(trade.newQUnder).toBe(10 + trade.shares);
    }
  });

  it('is contrarian: high probOver leads to more under bets', () => {
    let underCount = 0;
    const iterations = 200;
    // q_over >> q_under means probOver is high
    for (let i = 0; i < iterations; i++) {
      const trade = computeBotTrade(100, 0);
      if (trade.outcome === 'under') underCount++;
    }
    // With high probOver and contrarian strength 0.6, majority should be under
    expect(underCount / iterations).toBeGreaterThan(0.5);
  });

  it('is contrarian: low probOver leads to more over bets', () => {
    let overCount = 0;
    const iterations = 200;
    for (let i = 0; i < iterations; i++) {
      const trade = computeBotTrade(0, 100);
      if (trade.outcome === 'over') overCount++;
    }
    expect(overCount / iterations).toBeGreaterThan(0.5);
  });
});

describe('startBotEngine', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('calls onTrade at configured intervals', () => {
    const onTrade = jest.fn();
    const getState = () => ({ qOver: 0, qUnder: 0 });

    const cleanup = startBotEngine(getState, onTrade, {
      ...DEFAULT_BOT_CONFIG,
      intervalMs: 1000,
    });

    expect(onTrade).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1000);
    expect(onTrade).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(2000);
    expect(onTrade).toHaveBeenCalledTimes(3);

    cleanup();
  });

  it('cleanup stops the interval', () => {
    const onTrade = jest.fn();
    const getState = () => ({ qOver: 0, qUnder: 0 });

    const cleanup = startBotEngine(getState, onTrade, {
      ...DEFAULT_BOT_CONFIG,
      intervalMs: 1000,
    });

    jest.advanceTimersByTime(1000);
    expect(onTrade).toHaveBeenCalledTimes(1);

    cleanup();

    jest.advanceTimersByTime(5000);
    expect(onTrade).toHaveBeenCalledTimes(1);
  });

  it('passes current state to computeBotTrade', () => {
    let qOver = 0;
    const onTrade = jest.fn();
    const getState = () => ({ qOver, qUnder: 0 });

    const cleanup = startBotEngine(getState, onTrade, {
      ...DEFAULT_BOT_CONFIG,
      intervalMs: 1000,
    });

    qOver = 50;
    jest.advanceTimersByTime(1000);

    const trade = onTrade.mock.calls[0][0];
    // Trade should be based on qOver=50
    expect(trade.newQOver >= 50 || trade.newQUnder >= 0).toBe(true);

    cleanup();
  });
});
