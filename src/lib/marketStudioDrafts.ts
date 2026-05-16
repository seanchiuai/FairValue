import type { Property } from '../data/properties';
import {
  MarketDraft,
  formatDraftPrice,
  generateMarketDraft,
} from './marketDrafts';

export interface MarketDraftPropertyMatch {
  property: Property;
  property_id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  asking_price: number;
  score: number;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
}

export interface SavedMarketStudioDraft {
  id: string;
  title: string;
  price_label: string;
  created_at: string;
  updated_at: string;
  draft: MarketDraft;
}

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const MARKET_STUDIO_DRAFTS_STORAGE_KEY = 'fairvalue.marketStudioDrafts.v1';
const MAX_SAVED_DRAFTS = 6;

const homeTypeLabels: Record<string, string> = {
  SINGLE_FAMILY: 'Single Family',
  CONDO: 'Condo',
  MULTI_FAMILY: 'Multi-Family',
  APARTMENT: 'Apartment',
  LOT: 'Lot',
};

function normalizeAddress(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(street)\b/g, 'st')
    .replace(/\b(avenue)\b/g, 'ave')
    .replace(/\b(road)\b/g, 'rd')
    .replace(/\b(boulevard)\b/g, 'blvd')
    .replace(/\b(drive)\b/g, 'dr')
    .replace(/\b(court)\b/g, 'ct')
    .replace(/\b(lane)\b/g, 'ln')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function numericDeltaPercent(left: number | null | undefined, right: number | null | undefined) {
  if (!left || !right || right <= 0) return null;
  return Math.abs(left - right) / right;
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function confidenceForScore(score: number): MarketDraftPropertyMatch['confidence'] {
  if (score >= 78) return 'high';
  if (score >= 55) return 'medium';
  return 'low';
}

function createDraftHash(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function getDefaultStorage(): DraftStorage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

function createSavedDraftTitle(draft: MarketDraft) {
  return draft.address || draft.market_question || 'Untitled market draft';
}

function createDraftFingerprint(draft: MarketDraft) {
  return [
    draft.property_id || '',
    normalizeAddress(`${draft.address} ${draft.city} ${draft.state} ${draft.zip}`),
    draft.asking_price || '',
  ].join('|');
}

export function matchDraftToProperties(
  draft: MarketDraft,
  properties: Property[],
  limit = 3
): MarketDraftPropertyMatch[] {
  const draftStreet = normalizeAddress(draft.address);
  const sourceText = normalizeAddress(draft.source_text);

  return properties
    .map((property) => {
      const propertyStreet = normalizeAddress(property.address);
      const propertyFullAddress = normalizeAddress(`${property.address} ${property.city} ${property.state} ${property.zipCode}`);
      const reasons: string[] = [];
      let score = 0;

      if (draftStreet && propertyStreet === draftStreet) {
        score += 50;
        reasons.push('street address match');
      } else if (draftStreet && propertyFullAddress.includes(draftStreet)) {
        score += 38;
        reasons.push('street address appears in local property');
      } else if (sourceText && propertyStreet && sourceText.includes(propertyStreet)) {
        score += 34;
        reasons.push('source text mentions local property address');
      }

      if (draft.zip && property.zipCode === draft.zip) {
        score += 14;
        reasons.push('zip code match');
      }
      if (draft.city && property.city.toLowerCase() === draft.city.toLowerCase()) {
        score += 8;
        reasons.push('city match');
      }
      if (draft.state && property.state.toLowerCase() === draft.state.toLowerCase()) {
        score += 6;
        reasons.push('state match');
      }

      const priceDelta = numericDeltaPercent(draft.asking_price, property.price);
      if (priceDelta != null) {
        if (priceDelta <= 0.01) {
          score += 14;
          reasons.push('asking price within 1%');
        } else if (priceDelta <= 0.05) {
          score += 9;
          reasons.push('asking price within 5%');
        } else if (priceDelta <= 0.12) {
          score += 4;
          reasons.push('asking price in the same range');
        }
      }

      if (draft.beds != null && property.bedrooms != null && draft.beds === property.bedrooms) {
        score += 4;
        reasons.push('bed count match');
      }
      if (draft.baths != null && property.bathrooms != null && draft.baths === property.bathrooms) {
        score += 4;
        reasons.push('bath count match');
      }

      const sqftDelta = numericDeltaPercent(draft.sqft, property.livingArea);
      if (sqftDelta != null && sqftDelta <= 0.08) {
        score += 4;
        reasons.push('square footage within 8%');
      }

      const finalScore = clampScore(score);
      return {
        property,
        property_id: property.id,
        address: property.address,
        city: property.city,
        state: property.state,
        zip: property.zipCode,
        asking_price: property.price,
        score: finalScore,
        confidence: confidenceForScore(finalScore),
        reasons,
      };
    })
    .filter((match) => match.score >= 45)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function createDraftFromProperty(property: Property, sourceText = ''): MarketDraft {
  const source = sourceText.trim() || [
    property.address,
    `${property.city}, ${property.state} ${property.zipCode}`,
    `Listed at ${formatDraftPrice(property.price)}`,
    [property.bedrooms ? `${property.bedrooms} beds` : '', property.bathrooms ? `${property.bathrooms} baths` : '', property.livingArea ? `${property.livingArea} sqft` : '', homeTypeLabels[property.homeType] || property.homeType]
      .filter(Boolean)
      .join(', '),
    property.description,
  ].filter(Boolean).join('\n');
  const draft = generateMarketDraft(source, 'existing_property');
  const facts = [
    property.bedrooms ? 'bed count' : '',
    property.bathrooms ? 'bath count' : '',
    property.livingArea ? 'square footage' : '',
    property.homeType ? 'home type' : '',
  ].filter(Boolean);

  return {
    ...draft,
    source_type: 'existing_property',
    property_id: property.id,
    address: property.address,
    city: property.city,
    state: property.state,
    zip: property.zipCode,
    asking_price: property.price,
    beds: property.bedrooms,
    baths: property.bathrooms,
    sqft: property.livingArea,
    home_type: homeTypeLabels[property.homeType] || property.homeType,
    listing_description: property.description || draft.listing_description,
    provenance: {
      source: 'Local property dataset match',
      confidence: 'high',
      matchedSignals: ['existing property', 'street address', 'asking price', ...facts],
    },
    market_question: `Will ${property.address} appraise above ${formatDraftPrice(property.price)}?`,
    generated_summary: `${property.address} matched a local property snapshot in ${property.city}. Asking price is ${formatDraftPrice(property.price)} with ${[
      property.bedrooms ? `${property.bedrooms} bed` : '',
      property.bathrooms ? `${property.bathrooms} bath` : '',
      property.livingArea ? `${property.livingArea.toLocaleString()} sqft` : '',
      homeTypeLabels[property.homeType] || property.homeType,
    ].filter(Boolean).join(', ')}. Verify the source data before settlement.`,
    warnings: [
      'Matched to the local property dataset; review listing facts before hosting the room.',
      'Settlement still requires final sale, appraisal, or signed valuation evidence.',
    ],
  };
}

export function readSavedMarketStudioDrafts(storage: DraftStorage | null = getDefaultStorage()): SavedMarketStudioDraft[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(MARKET_STUDIO_DRAFTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is SavedMarketStudioDraft =>
        item
        && typeof item.id === 'string'
        && typeof item.title === 'string'
        && typeof item.updated_at === 'string'
        && item.draft
        && typeof item.draft.address === 'string'
      )
      .slice(0, MAX_SAVED_DRAFTS);
  } catch {
    storage.removeItem(MARKET_STUDIO_DRAFTS_STORAGE_KEY);
    return [];
  }
}

export function saveMarketStudioDraft(
  draft: MarketDraft,
  storage: DraftStorage | null = getDefaultStorage(),
  now = new Date().toISOString()
): SavedMarketStudioDraft[] {
  if (!storage) return [];
  const existing = readSavedMarketStudioDrafts(storage);
  const id = `studio_${createDraftHash(createDraftFingerprint(draft))}`;
  const previous = existing.find((item) => item.id === id);
  const saved: SavedMarketStudioDraft = {
    id,
    title: createSavedDraftTitle(draft),
    price_label: formatDraftPrice(draft.asking_price),
    created_at: previous?.created_at || now,
    updated_at: now,
    draft,
  };
  const next = [
    saved,
    ...existing.filter((item) => item.id !== id),
  ].slice(0, MAX_SAVED_DRAFTS);
  storage.setItem(MARKET_STUDIO_DRAFTS_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function deleteMarketStudioDraft(
  id: string,
  storage: DraftStorage | null = getDefaultStorage()
): SavedMarketStudioDraft[] {
  if (!storage) return [];
  const next = readSavedMarketStudioDrafts(storage).filter((item) => item.id !== id);
  if (next.length) {
    storage.setItem(MARKET_STUDIO_DRAFTS_STORAGE_KEY, JSON.stringify(next));
  } else {
    storage.removeItem(MARKET_STUDIO_DRAFTS_STORAGE_KEY);
  }
  return next;
}
