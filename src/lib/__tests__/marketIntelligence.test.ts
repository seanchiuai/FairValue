import type { Property } from '../../data/properties';
import { generateMarketIntelligence } from '../marketIntelligence';

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
