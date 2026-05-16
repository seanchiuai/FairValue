import { generatePublicRoomRecap } from '../publicRoomRecap';
import type { MarketDraftAudit } from '../../types';

const draftAudit: MarketDraftAudit = {
  schema_version: 'market-draft-audit/v1',
  source_type: 'existing_property',
  property_id: '440298192',
  normalized_fields: {
    address: '88 Resilience Way',
    asking_price: 720_000,
  },
  provenance: {
    source: 'Local property dataset match',
    confidence: 'high',
    matchedSignals: ['address', 'asking price'],
  },
  market_question: 'Will 88 Resilience Way settle above $720,000?',
  market_format: 'binary_over_under',
  liquidity_b: 100,
  settlement_rule: 'Use public sale, appraisal, or signed valuation evidence.',
  evidence_required: ['Final sale price or appraisal report.'],
  generated_summary: 'Local draft summary.',
  warnings: [],
  source_text_hash: 'b'.repeat(64),
  source_text_length: 500,
  validation: {
    status: 'accepted',
    checked_at: 1778900000,
    issues: [],
  },
};

const baseInput = {
  roomCode: 'ABCD',
  house: {
    address: '88 Resilience Way',
    asking_price: 720_000,
  },
  market: {
    prob_over: 0.58,
    prob_under: 0.42,
    q_over: 16,
    q_under: 0,
    total_trades: 2,
    total_wagered: 75,
    avg_bet_size: 37.5,
    b: 100,
  },
  players: [
    { session_id: 'host', nickname: 'Host', balance: 1000, bets: [] },
    { session_id: 'ada', nickname: 'Ada', balance: 950, bets: [] },
  ],
  activity: [
    { type: 'join', nickname: 'Ada', timestamp: 1 },
    { type: 'bet', nickname: 'Ada', outcome: 'over', wager: 50, timestamp: 2 },
    { type: 'bet', nickname: 'Lin', outcome: 'under', wager: 25, timestamp: 3 },
  ],
  draftAudit,
  settled: false,
  settlement: null,
};

describe('public room recap generation', () => {
  it('creates a share-safe live recap without host-only data', () => {
    const recap = generatePublicRoomRecap(baseInput);

    expect(recap.status).toBe('live');
    expect(recap.headline).toContain('live market');
    expect(recap.summary).toContain('host-only event history and capability tokens are not included');
    expect(recap.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Market question' }),
        expect.objectContaining({ label: 'Public market movement', value: '58% OVER' }),
      ])
    );
    expect(recap.guardrails.join(' ')).toContain('host tokens/user tokens are never shown');
    expect(recap.guardrails.join(' ')).toContain('No provider-backed comps');
    expect(recap.timeline.map((item) => item.label)).toEqual(['Player joined', 'Bet placed', 'Bet placed']);
  });

  it('adds public settlement evidence for settled rooms', () => {
    const recap = generatePublicRoomRecap({
      ...baseInput,
      settled: true,
      settlement: {
        winning_outcome: 'over',
        actual_price: 735_000,
        results: [
          { nickname: 'Ada', payout: 48.2, final_balance: 998.2 },
        ],
      },
      activity: [
        ...baseInput.activity,
        { type: 'settle', winning_outcome: 'over', actual_price: 735_000, timestamp: 4 },
      ],
    });

    expect(recap.status).toBe('settled');
    expect(recap.headline).toBe('ABCD public recap: OVER wins');
    expect(recap.highlights).toContain('OVER won at $735,000.');
    expect(recap.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Settlement result', value: 'OVER at $735,000' }),
      ])
    );
    expect(recap.timeline.at(-1)).toEqual({
      label: 'Settlement recorded',
      detail: 'OVER won at $735,000.',
    });
  });
});
