import type { Property } from '../../data/properties';
import { generateMarketDraft } from '../marketDrafts';
import {
  MARKET_STUDIO_DRAFTS_STORAGE_KEY,
  createDraftFromProperty,
  deleteMarketStudioDraft,
  matchDraftToProperties,
  readSavedMarketStudioDrafts,
  saveMarketStudioDraft,
} from '../marketStudioDrafts';

const property: Property = {
  id: '440298192',
  zpid: 440298192,
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
  description: 'Updated home near 26th Street.',
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
  attributionInfo: null,
  schools: [],
  priceHistory: [],
};

function createMemoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

describe('market studio property matching', () => {
  let storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

  beforeEach(() => {
    storage = createMemoryStorage();
  });

  it('matches a pasted listing to an existing local property', () => {
    const draft = generateMarketDraft(`
      3004 26th St
      San Francisco, CA 94110
      Listed at $800,000
      3 beds, 2 baths, 1,200 sqft single-family home.
    `);

    const matches = matchDraftToProperties(draft, [property]);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      property_id: '440298192',
      confidence: 'high',
      score: 100,
    });
    expect(matches[0].reasons).toEqual(
      expect.arrayContaining(['street address match', 'zip code match', 'asking price within 1%'])
    );
  });

  it('ignores weak address-only noise below the match threshold', () => {
    const draft = generateMarketDraft('99 Totally Different Ave, Oakland, CA 94607 listed at $500,000');

    expect(matchDraftToProperties(draft, [property])).toEqual([]);
  });

  it('creates a draft directly from a local property record', () => {
    const draft = createDraftFromProperty(property);

    expect(draft.source_type).toBe('existing_property');
    expect(draft.property_id).toBe('440298192');
    expect(draft.address).toBe('3004 26th St');
    expect(draft.asking_price).toBe(800_000);
    expect(draft.market_question).toBe('Will 3004 26th St appraise above $800,000?');
    expect(draft.provenance.source).toBe('Local property dataset match');
  });

  it('saves, updates, reads, and deletes market studio drafts', () => {
    const draft = createDraftFromProperty(property);
    const first = saveMarketStudioDraft(draft, storage, '2026-05-16T05:00:00.000Z');
    const second = saveMarketStudioDraft(
      { ...draft, generated_summary: 'Updated summary' },
      storage,
      '2026-05-16T06:00:00.000Z'
    );

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second[0].created_at).toBe('2026-05-16T05:00:00.000Z');
    expect(second[0].updated_at).toBe('2026-05-16T06:00:00.000Z');
    expect(readSavedMarketStudioDrafts(storage)[0].draft.generated_summary).toBe('Updated summary');

    const afterDelete = deleteMarketStudioDraft(second[0].id, storage);
    expect(afterDelete).toEqual([]);
    expect(storage.getItem(MARKET_STUDIO_DRAFTS_STORAGE_KEY)).toBeNull();
  });
});
