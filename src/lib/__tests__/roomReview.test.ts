import { generateRoomReview } from '../roomReview';
import type { MarketDraftAudit, RoomEvent } from '../../types';

const draftAudit: MarketDraftAudit = {
  schema_version: 'market-draft-audit/v1',
  source_type: 'existing_property',
  property_id: '440298192',
  normalized_fields: {
    address: '3004 26th St',
    city: 'San Francisco',
    state: 'CA',
    zip: '94110',
    asking_price: 800_000,
    beds: 3,
    baths: 2,
    sqft: 1200,
    home_type: 'Single Family',
  },
  provenance: {
    source: 'Local property dataset match',
    confidence: 'high',
    matchedSignals: ['street address', 'asking price'],
  },
  market_question: 'Will 3004 26th St appraise above $800,000?',
  market_format: 'binary_over_under',
  liquidity_b: 100,
  settlement_rule: 'Settle using final sale price, appraisal, or host-provided valuation evidence.',
  evidence_required: [
    'Final sale price, appraisal report, or signed valuation evidence.',
    'Original listing snapshot with asking price and property facts.',
  ],
  generated_summary: 'Matched local property draft.',
  warnings: ['Settlement still requires final evidence.'],
  source_text_hash: 'a'.repeat(64),
  source_text_length: 120,
  validation: {
    status: 'accepted',
    checked_at: 1778900000,
    issues: [],
  },
};

const baseInput = {
  roomCode: 'ABCD',
  house: {
    address: '3004 26th St',
    asking_price: 800_000,
  },
  market: {
    prob_over: 0.64,
    prob_under: 0.36,
    q_over: 24,
    q_under: 8,
    total_trades: 2,
    total_wagered: 75,
    avg_bet_size: 37.5,
    b: 100,
  },
  players: [
    {
      session_id: 'host',
      nickname: 'Host',
      balance: 1000,
      bets: [],
    },
    {
      session_id: 'ada',
      nickname: 'Ada',
      balance: 950,
      bets: [
        {
          outcome: 'over',
          wager: 50,
          shares: 48.2,
          prob_at_entry: 0.5,
          timestamp: 2,
          reason: 'Local comps support the ask.',
        },
      ],
    },
  ],
  activity: [
    { type: 'join', nickname: 'Ada', timestamp: 1, event_sequence: 2 },
    { type: 'bet', nickname: 'Ada', outcome: 'over', wager: 50, reason: 'Local comps support the ask.', timestamp: 2, event_sequence: 3 },
    { type: 'bet', nickname: 'Lin', outcome: 'under', wager: 25, timestamp: 3, event_sequence: 4 },
  ],
  draftAudit,
  settled: false,
  settlement: null,
  eventSequence: 4,
};

const events: RoomEvent[] = [
  {
    id: 'ABCD-00000001',
    room_code: 'ABCD',
    sequence: 1,
    type: 'room_created',
    timestamp: 1,
    payload: {
      house: {
        address: '3004 26th St',
        asking_price: 800_000,
      },
      draft_audit: draftAudit,
    },
  },
  {
    id: 'ABCD-00000002',
    room_code: 'ABCD',
    sequence: 2,
    type: 'player_joined',
    timestamp: 2,
    payload: {
      nickname: 'Ada',
      player: baseInput.players[1],
    },
  },
  {
    id: 'ABCD-00000003',
    room_code: 'ABCD',
    sequence: 3,
    type: 'bet_placed',
    timestamp: 3,
    payload: {
      nickname: 'Ada',
      outcome: 'over',
      wager: 50,
      reason: 'Local comps support the ask.',
      player: baseInput.players[1],
      market: baseInput.market,
    },
  },
];

describe('room review generation', () => {
  it('combines draft audit, event history, movement, and pending settlement evidence', () => {
    const review = generateRoomReview({ ...baseInput, events });

    expect(review.status).toBe('ready_to_settle');
    expect(review.headline).toContain('ready for operator review');
    expect(review.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Consensus', value: '64% over' }),
        expect.objectContaining({ label: 'Audit status', value: 'Draft accepted' }),
      ])
    );
    expect(review.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Required settlement evidence', value: '2 item checklist' }),
        expect.objectContaining({ label: 'Event history', value: '3 events' }),
      ])
    );
    expect(review.integrity_checks.join(' ')).toContain('raw pasted listing text is not stored');
    expect(review.timeline.map((item) => item.label)).toEqual(['Room created', 'Player joined', 'Bet placed']);
    expect(review.timeline[2].detail).toContain('Reason: Local comps support the ask.');
    expect(review.recap.join(' ')).toContain('Latest movement');
  });

  it('adds settlement comparison and flags locked event history honestly', () => {
    const review = generateRoomReview({
      ...baseInput,
      events: [],
      settled: true,
      settlement: {
        winning_outcome: 'over',
        actual_price: 835_000,
        evidence_packet: {
          schema_version: 'settlement-evidence/v1',
          status: 'metadata_attached',
          actual_price: 835_000,
          summary: 'County sale record metadata confirmed the settlement value.',
          items: [
            {
              type: 'sale_record',
              label: 'County sale record',
              source: 'County recorder',
              reference: 'Document 835',
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
      eventSequence: 8,
    });

    expect(review.status).toBe('settled');
    expect(review.headline).toBe('ABCD settled OVER');
    expect(review.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Event history', value: 'Locked' }),
        expect.objectContaining({ label: 'Settlement evidence', value: 'OVER at $835,000' }),
        expect.objectContaining({ label: 'Settlement evidence packet', value: '1 public item' }),
        expect.objectContaining({ label: 'Reputation calibration', value: '1 scored player' }),
      ])
    );
    expect(review.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Calibration', value: '86/100' }),
    ]));
    expect(review.integrity_checks).toContain('Settlement outcome OVER matches the asking-price comparison.');
    expect(review.integrity_checks.join(' ')).toContain('metadata attached');
    expect(review.integrity_checks.join(' ')).toContain('room-reputation/v1');
    expect(review.recap).toContain('Settlement recap: OVER won at $835,000.');
    expect(review.recap).toContain('Calibration recap: 1 player averaged 86/100 in this settled room.');
  });
});
