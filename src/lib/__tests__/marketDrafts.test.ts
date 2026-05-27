import {
  formatDraftPrice,
  generateMarketDraft,
  parseAddress,
  parseAskingPrice,
  parsePropertyFacts,
  validateMarketDraft,
} from '../marketDrafts';

describe('market draft generation', () => {
  const listing = `
    1428 Dolores Street
    San Francisco, CA 94110
    Listed at $1,250,000
    3 beds, 2 baths, 1,640 sqft single-family home with updated kitchen and garden.
  `;

  it('parses core listing facts from pasted text', () => {
    const draft = generateMarketDraft(listing);

    expect(draft.address).toBe('1428 Dolores Street');
    expect(draft.city).toBe('San Francisco');
    expect(draft.state).toBe('CA');
    expect(draft.zip).toBe('94110');
    expect(draft.asking_price).toBe(1_250_000);
    expect(draft.beds).toBe(3);
    expect(draft.baths).toBe(2);
    expect(draft.sqft).toBe(1640);
    expect(draft.home_type).toBe('Single Family');
    expect(draft.market_question).toBe('Will 1428 Dolores Street appraise above $1,250,000?');
    expect(draft.market_format).toBe('binary_over_under');
    expect(draft.provenance.confidence).toBe('high');
  });

  it('supports shorthand million prices and formatted output', () => {
    expect(parseAskingPrice('Offered at 1.45M near Dolores Park')).toBe(1_450_000);
    expect(formatDraftPrice(1_450_000)).toBe('$1,450,000');
  });

  it('parses address and property facts independently', () => {
    expect(parseAddress('Meet at 88 Resilience Way, Oakland, CA 94607')).toEqual({
      address: '88 Resilience Way',
      city: 'Oakland',
      state: 'CA',
      zip: '94607',
    });
    expect(parsePropertyFacts('2 bd / 1.5 ba condo with 940 square feet')).toEqual({
      beds: 2,
      baths: 1.5,
      sqft: 940,
      home_type: 'Condo',
    });
  });

  it('returns validation issues for incomplete drafts', () => {
    const invalid = validateMarketDraft({ address: '', asking_price: null });

    expect(invalid.valid).toBe(false);
    expect(invalid.issues).toContain('Property address is required.');
    expect(invalid.issues).toContain('Asking price must be greater than $0.');
  });

  it('validates registered market formats against the playable registry', () => {
    const playable = validateMarketDraft({
      address: '1428 Dolores Street',
      asking_price: 1_250_000,
      market_format: 'binary_over_under',
    });
    expect(playable.valid).toBe(true);

    const range = validateMarketDraft({
      address: '1428 Dolores Street',
      asking_price: 1_250_000,
      market_format: 'range_price_band',
    });
    expect(range.valid).toBe(true);

    const draftOnly = validateMarketDraft({
      address: '1428 Dolores Street',
      asking_price: 1_250_000,
      market_format: 'rent_yield_over_under',
    });
    expect(draftOnly.valid).toBe(false);
    expect(draftOnly.issues).toContain('Market format is registered but not playable yet.');
  });

  it('records deterministic provenance, warnings, and settlement evidence', () => {
    const draft = generateMarketDraft('No usable listing data yet');

    expect(draft.provenance.source).toBe('Local deterministic listing parser');
    expect(draft.warnings).toContain('No street address was detected.');
    expect(draft.warnings).toContain('No asking price was detected.');
    expect(draft.evidence_required).toContain('Final sale price, appraisal report, or signed valuation evidence.');
    expect(draft.generated_summary).toContain('Verify the source data before settlement.');
  });
});
