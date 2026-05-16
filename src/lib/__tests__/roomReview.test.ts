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
        },
      ],
    },
  ],
  activity: [
    { type: 'join', nickname: 'Ada', timestamp: 1, event_sequence: 2 },
    { type: 'bet', nickname: 'Ada', outcome: 'over', wager: 50, timestamp: 2, event_sequence: 3 },
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
        results: [
          { nickname: 'Ada', payout: 48.2, final_balance: 998.2 },
        ],
      },
      eventSequence: 8,
    });

    expect(review.status).toBe('settled');
    expect(review.headline).toBe('ABCD settled OVER');
    expect(review.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Event history', value: 'Locked' }),
        expect.objectContaining({ label: 'Settlement evidence', value: 'OVER at $835,000' }),
      ])
    );
    expect(review.integrity_checks).toContain('Settlement outcome OVER matches the asking-price comparison.');
    expect(review.recap).toContain('Settlement recap: OVER won at $835,000.');
  });
});
