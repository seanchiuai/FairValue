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
    { type: 'bet', nickname: 'Ada', outcome: 'over', wager: 50, reason: 'Local comps support the ask.', timestamp: 2 },
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
    expect(recap.timeline[1].detail).toContain('Reason: Local comps support the ask.');
  });

  it('adds public settlement evidence for settled rooms', () => {
    const recap = generatePublicRoomRecap({
      ...baseInput,
      settled: true,
      settlement: {
        winning_outcome: 'over',
        actual_price: 735_000,
        evidence_packet: {
          schema_version: 'settlement-evidence/v1',
          status: 'metadata_attached',
          actual_price: 735_000,
          summary: 'Public sale record metadata confirmed the settlement value.',
          items: [
            {
              type: 'sale_record',
              label: 'County sale record',
              source: 'County recorder',
              reference: 'Document 735',
              observed_at: '2026-05-25',
              confidence: 'high',
              notes: null,
            },
          ],
          limitations: ['Public-safe metadata only.'],
        },
        results: [
          { nickname: 'Ada', payout: 48.2, final_balance: 998.2 },
        ],
        reputation_summary: {
          schema_version: 'room-reputation/v1',
          scoring_model: 'single-room-brier-v1',
          status: 'settled',
          winning_outcome: 'over',
          player_count: 1,
          eligible_player_count: 1,
          total_bets: 1,
          reason_count: 1,
          correct_bets: 1,
          accuracy: 1,
          average_entry_confidence: 0.62,
          average_brier_score: 0.144,
          average_calibration_score: 86,
          top_players: [
            {
              rank: 1,
              nickname: 'Ada',
              badge: 'well_calibrated_reasoner',
              bet_count: 1,
              reason_count: 1,
              accuracy: 1,
              calibration_score: 86,
            },
          ],
          players: [
            {
              rank: 1,
              nickname: 'Ada',
              bet_count: 1,
              reason_count: 1,
              correct_bets: 1,
              incorrect_bets: 0,
              total_wagered: 50,
              winning_wagered: 50,
              accuracy: 1,
              average_entry_confidence: 0.62,
              average_brier_score: 0.144,
              calibration_score: 86,
              payout: 48.2,
              final_balance: 998.2,
              badge: 'well_calibrated_reasoner',
            },
          ],
          limitations: ['Single-room simulation signal.'],
        },
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
        expect.objectContaining({ label: 'Settlement evidence packet', value: '1 public item' }),
        expect.objectContaining({ label: 'Reputation and calibration', value: '1 scored player' }),
      ])
    );
    expect(recap.highlights).toContain('1 scored player averaged 86/100 calibration.');
    expect(recap.guardrails.join(' ')).toContain('public-safe metadata only');
    expect(recap.guardrails.join(' ')).toContain('single-room simulation signals');
    expect(recap.timeline.at(-1)).toEqual({
      label: 'Settlement recorded',
      detail: 'OVER won at $735,000.',
    });
  });
});
