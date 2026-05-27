import type { Property } from '../../data/properties';
import { generateMarketIntelligence, generateRoomMarketIntelligence } from '../marketIntelligence';

const baseProperty: Property = {
  id: 'sf-brief',
  zpid: 123,
  address: '3004 26th St',
  city: 'San Francisco',
  state: 'CA',
  zipCode: '94110',
  bedrooms: 3,
  bathrooms: 2,
  livingArea: 1200,
  yearBuilt: 1930,
  price: 800_000,
  zestimate: 848_000,
  rentZestimate: 4_000,
  homeType: 'SINGLE_FAMILY',
  homeStatus: 'FOR_SALE',
  dateSoldString: null,
  daysOnZillow: 7,
  description: 'Updated Mission District home with garden, flexible lower level, and walkable neighborhood access.',
  brokerageName: 'FairValue Realty',
  imgSrc: '',
  photos: [],
  hdpUrl: '',
  latitude: 37.7,
  longitude: -122.4,
  county: 'San Francisco County',
  propertyTaxRate: 1.18,
  listingDataSource: 'Phoenix',
  listingSource: null,
  attributionInfo: {
    mlsName: 'MLSListings Inc',
    lastChecked: '2026-02-07 14:00:29',
  },
  schools: [
    { name: 'Aptos Middle', rating: 8, distance: 1.1, level: 'Middle', link: '' },
    { name: 'Balboa High', rating: 7, distance: 1.7, level: 'High', link: '' },
  ],
  priceHistory: [
    { date: '2026-02-07', event: 'Listed for sale', price: 800_000, source: 'MLSListings Inc' },
  ],
};

describe('market intelligence generation', () => {
  it('builds a deterministic high-confidence property brief', () => {
    const brief = generateMarketIntelligence(baseProperty);

    expect(brief.confidence).toBe('high');
    expect(brief.analysis_schema_version).toBe('fairvalue.marketIntelligence.v2');
    expect(brief.summary).toContain('3004 26th St');
    expect(brief.summary).toContain('MLSListings Inc');
    expect(brief.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Zestimate gap', value: '+6.0%', tone: 'positive' }),
        expect.objectContaining({ label: 'Gross rent yield', value: '6.0%', tone: 'positive' }),
        expect.objectContaining({ label: 'Price per sqft', value: '$667/sqft' }),
      ])
    );
  });

  it('separates bullish, bearish, uncertainty, and scenario prompts', () => {
    const brief = generateMarketIntelligence(baseProperty);

    expect(brief.bullish_cases.join(' ')).toContain('Zestimate sits +6.0% above asking');
    expect(brief.bearish_cases.join(' ')).toContain('Built in 1930');
    expect(brief.uncertainty_cases).toContain(
      'Room settlement should rely on a final sale price, appraisal report, or signed valuation evidence.'
    );
    expect(brief.scenario_prompts).toHaveLength(3);
    expect(brief.scenario_prompts[0].label).toBe('Over scenario');
    expect(brief.settlement_checklist).toContain('Room event history preserved with joins, bets, and settlement.');
  });

  it('builds a structured local analyst case network without pretending provider coverage', () => {
    const brief = generateMarketIntelligence(baseProperty);

    expect(brief.analyst_cases.map((item) => item.role)).toEqual([
      'bull',
      'bear',
      'comp',
      'affordability',
      'fraud_check',
      'neighborhood',
    ]);
    expect(brief.analyst_cases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Comp agent',
          limitation: 'Local brief only; no live comp provider queried.',
        }),
        expect.objectContaining({
          label: 'Fraud/data-quality agent',
          limitation: 'Data-quality risk only; no fraud accusation or compliance review.',
        }),
        expect.objectContaining({
          label: 'Affordability agent',
          limitation: 'Stress prompt only; not lending, tax, insurance, HOA, or investment advice.',
        }),
      ])
    );
  });

  it('surfaces under-asking pressure when reference value is below asking', () => {
    const brief = generateMarketIntelligence({
      ...baseProperty,
      price: 900_000,
      zestimate: 820_000,
      rentZestimate: 1_800,
      daysOnZillow: 91,
    });

    expect(brief.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Zestimate gap', value: '-8.9%', tone: 'negative' }),
        expect.objectContaining({ label: 'Gross rent yield', value: '2.4%', tone: 'caution' }),
        expect.objectContaining({ label: 'Market age', value: '91 days', tone: 'caution' }),
      ])
    );
    expect(brief.bearish_cases.join(' ')).toContain('Zestimate sits -8.9% below asking');
    expect(brief.bearish_cases.join(' ')).toContain('91 days on Zillow');
  });

  it('downgrades confidence and names missing valuation references', () => {
    const brief = generateMarketIntelligence({
      ...baseProperty,
      zestimate: null,
      rentZestimate: null,
      livingArea: null,
      schools: [],
      description: 'Sparse.',
    });

    expect(brief.confidence).toBe('medium');
    expect(brief.confidence_reason).toContain('some valuation references are missing');
    expect(brief.uncertainty_cases).toEqual(
      expect.arrayContaining([
        'No Zestimate is available, so the room should lean harder on comps and appraisal evidence.',
        'Living area is missing, so price-per-square-foot comparisons may be unreliable.',
        'The listing description is sparse; inspect disclosures and photos before treating the market as informed.',
      ])
    );
  });
});

describe('room-aware market intelligence generation', () => {
  const baseRoom = {
    house: {
      address: '3004 26th St',
      asking_price: 800_000,
    },
    market: {
      prob_over: 0.62,
      prob_under: 0.38,
      q_over: 24,
      q_under: 6,
      total_trades: 4,
      total_wagered: 180,
      avg_bet_size: 45,
      b: 100,
    },
    players: [
      { session_id: 'host', nickname: 'Host', balance: 1000, bets: [] },
      { session_id: 'ada', nickname: 'Ada', balance: 950, bets: [] },
      { session_id: 'lin', nickname: 'Lin', balance: 975, bets: [] },
    ],
    activity: [
      { type: 'join', nickname: 'Ada', timestamp: 1 },
      { type: 'bet', nickname: 'Ada', outcome: 'over', wager: 50, timestamp: 2 },
      { type: 'bet', nickname: 'Lin', outcome: 'under', wager: 25, timestamp: 3 },
    ],
    draftAudit: {
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
        confidence: 'high' as const,
        matchedSignals: ['existing property', 'street address', 'asking price'],
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
    },
  };

  it('combines live LMSR flow, players, bets, and draft audit provenance', () => {
    const brief = generateRoomMarketIntelligence(baseRoom);

    expect(brief.confidence).toBe('high');
    expect(brief.provider_status).toBe('local_fallback');
    expect(brief.summary).toContain('62% over');
    expect(brief.summary).toContain('linked local property 440298192');
    expect(brief.summary).toContain('No provider-backed comps were queried');
    expect(brief.live_metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Live consensus', value: '62% over', tone: 'positive' }),
        expect.objectContaining({ label: 'Room liquidity', value: '4 trades' }),
        expect.objectContaining({ label: 'Draft audit', value: 'Accepted', tone: 'positive' }),
      ])
    );
    expect(brief.movement_explanations.join(' ')).toContain('Ada pushed OVER with $50');
    expect(brief.movement_explanations.join(' ')).toContain('Lin pushed UNDER with $25');
    expect(brief.provenance_notes).toContain('No provider-backed comps were queried for this panel.');
  });

  it('falls back honestly when no draft audit or bet flow exists yet', () => {
    const brief = generateRoomMarketIntelligence({
      ...baseRoom,
      market: { ...baseRoom.market, prob_over: 0.5, prob_under: 0.5, total_trades: 0, total_wagered: 0 },
      players: [baseRoom.players[0]],
      activity: [],
      draftAudit: null,
    });

    expect(brief.confidence).toBe('low');
    expect(brief.summary).toContain('50% over');
    expect(brief.summary).toContain('room address and asking price only');
    expect(brief.live_metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Draft audit', value: 'Not attached', tone: 'caution' }),
        expect.objectContaining({ label: 'Room liquidity', value: '0 trades', tone: 'caution' }),
      ])
    );
    expect(brief.live_metrics.find((metric) => metric.label === 'Room liquidity')?.detail).toContain('$0');
    expect(brief.movement_explanations).toContain(
      'No player bets have landed yet; current probability is still close to the LMSR starting point.'
    );
    expect(brief.settlement_checklist).toContain('Confirmation that all balances are simulation credits only.');
  });
});
