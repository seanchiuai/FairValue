import { generatePlayerBetPreview } from '../playerBetPreview';

const baseInput = {
  house: {
    address: '123 Player Loop',
    asking_price: 700_000,
  },
  market: {
    prob_over: 0.5,
    prob_under: 0.5,
    q_over: 0,
    q_under: 0,
    total_trades: 0,
    total_wagered: 0,
    avg_bet_size: 0,
    b: 100,
  },
  player: {
    session_id: 'player-1',
    nickname: 'Player One',
    balance: 1000,
    bets: [],
  },
  wager: 25,
  activity: [],
};

describe('player bet preview generation', () => {
  it('creates a balanced pre-bet read with both outcome previews', () => {
    const preview = generatePlayerBetPreview(baseInput);

    expect(preview.headline).toContain('50% OVER');
    expect(preview.reason_to_believe).toContain('first evidence-backed wager');
    expect(preview.reason_to_doubt).toContain('thin liquidity');
    expect(preview.provenance).toContain('No external comps were queried');
    expect(preview.balance_warning).toBeNull();
    expect(preview.outcomes.over.summary).toContain('OVER');
    expect(preview.outcomes.under.summary).toContain('UNDER');
    expect(preview.outcomes.over.shares).toBeGreaterThan(0);
    expect(preview.outcomes.under.shares).toBeGreaterThan(0);
    expect(preview.outcomes.over.side_probability_after).toBeGreaterThan(0.5);
    expect(preview.outcomes.under.side_probability_after).toBeGreaterThan(0.5);
  });

  it('explains consensus, herd risk, and balance-capped previews', () => {
    const preview = generatePlayerBetPreview({
      ...baseInput,
      market: {
        ...baseInput.market,
        prob_over: 0.68,
        prob_under: 0.32,
        q_over: 42,
        q_under: -34,
        total_trades: 4,
        total_wagered: 175,
      },
      player: {
        ...baseInput.player,
        balance: 20,
      },
      wager: 50,
      activity: [
        { type: 'bet', nickname: 'Ada', outcome: 'over', wager: 50, timestamp: 1 },
        { type: 'bet', nickname: 'Lin', outcome: 'over', wager: 75, timestamp: 2 },
        { type: 'bet', nickname: 'Mina', outcome: 'over', wager: 50, timestamp: 3 },
      ],
    });

    expect(preview.reason_to_believe).toContain('pricing OVER');
    expect(preview.reason_to_doubt).toContain('herd momentum');
    expect(preview.balance_warning).toBe('Preview capped at your current $20 balance.');
    expect(preview.outcomes.over.summary).toContain('OVER');
    expect(preview.outcomes.under.summary).toContain('UNDER');
  });
});
