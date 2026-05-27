import type { MarketFormat } from './marketTemplates';

export type MarketDraftSourceType = 'pasted_listing' | 'manual' | 'csv_row' | 'address' | 'existing_property';

export type { MarketFormat } from './marketTemplates';

export interface MarketDraftProvenance {
  source: string;
  confidence: 'low' | 'medium' | 'high';
  matchedSignals: string[];
}

export interface MarketDraft {
  source_type: MarketDraftSourceType;
  source_text: string;
  property_id: string | null;
  address: string;
  city: string;
  state: string;
  zip: string;
  asking_price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  home_type: string;
  listing_description: string;
  provenance: MarketDraftProvenance;
  market_question: string;
  market_format: MarketFormat;
  liquidity_b: number;
  settlement_rule: string;
  evidence_required: string[];
  generated_summary: string;
  warnings: string[];
}

export interface MarketDraftValidation {
  valid: boolean;
  issues: string[];
}

const MAX_ASKING_PRICE = 100_000_000;
const DEFAULT_LIQUIDITY_B = 100;
const DEFAULT_MARKET_FORMAT: MarketFormat = 'binary_over_under';
const REGISTERED_MARKET_FORMATS = new Set<MarketFormat>([
  'binary_over_under',
  'range_price_band',
  'rent_yield_over_under',
  'time_on_market_over_under',
  'renovation_budget_over_under',
]);
const PLAYABLE_MARKET_FORMATS = new Set<MarketFormat>(['binary_over_under', 'range_price_band', 'rent_yield_over_under']);

const STREET_SUFFIX_PATTERN =
  'Street|St\\.?|Avenue|Ave\\.?|Road|Rd\\.?|Way|Boulevard|Blvd\\.?|Drive|Dr\\.?|Court|Ct\\.?|Lane|Ln\\.?|Place|Pl\\.?|Terrace|Ter\\.?|Circle|Cir\\.?|Highway|Hwy\\.?|Parkway|Pkwy\\.?|Loop|Square|Sq\\.?';

const ADDRESS_PATTERN = new RegExp(
  `\\b\\d{1,6}\\s+[A-Za-z0-9 .'-]+?(?:${STREET_SUFFIX_PATTERN})(?:\\s+(?:Unit|Apt|Apartment|#)\\s*[A-Za-z0-9-]+)?\\b`,
  'i'
);

function clampListingDescription(sourceText: string) {
  return sourceText.replace(/\s+/g, ' ').trim().slice(0, 480);
}

function normalizeSpaces(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function currencyMatchToNumber(rawAmount: string, rawScale = '') {
  const normalized = rawAmount.replace(/,/g, '').trim();
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const scale = rawScale.trim().toLowerCase();
  if (scale.startsWith('m') || scale.includes('million')) return Math.round(amount * 1_000_000);
  if (scale.startsWith('k')) return Math.round(amount * 1_000);

  return Math.round(amount);
}

export function parseAskingPrice(sourceText: string): number | null {
  const text = sourceText.replace(/\s+/g, ' ');
  const pricePatterns: RegExp[] = [
    /\$\s*([0-9][0-9,]+|[0-9]+(?:\.[0-9]+)?)(?:\s*(m|million|k))?/i,
    /\b(?:asking|asking price|list price|listed at|priced at|offered at|price)\D{0,20}([0-9][0-9,]+|[0-9]+(?:\.[0-9]+)?)\s*(m|million|k)?\b/i,
    /\b([0-9]+(?:\.[0-9]+)?)\s*(m|million)\b/i,
    /\b([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{6,8})\b/,
  ];

  for (const pattern of pricePatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const amount = currencyMatchToNumber(match[1], match[2] || '');
    if (amount && amount <= MAX_ASKING_PRICE) return amount;
  }

  return null;
}

export function parseAddress(sourceText: string) {
  const lines = sourceText
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);
  const text = sourceText.replace(/\s+/g, ' ');
  const addressMatch = text.match(ADDRESS_PATTERN);
  const address = addressMatch ? normalizeSpaces(addressMatch[0].replace(/[,.]+$/, '')) : '';
  const localityMatch = lines.reduce<RegExpMatchArray | null>((found, line) => {
    if (found) return found;
    return line.match(/([A-Za-z .'-]+),\s*([A-Z]{2})\s*(\d{5})(?:-\d{4})?/);
  }, null);

  return {
    address,
    city: localityMatch ? normalizeSpaces(localityMatch[1]) : '',
    state: localityMatch ? localityMatch[2] : '',
    zip: localityMatch ? localityMatch[3] : '',
  };
}

function parseNumberBefore(sourceText: string, pattern: RegExp) {
  const match = sourceText.match(pattern);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

export function parsePropertyFacts(sourceText: string) {
  return {
    beds: parseNumberBefore(sourceText, /\b(\d+(?:\.\d+)?)\s*(?:beds?|bd|br|bedrooms?)\b/i),
    baths: parseNumberBefore(sourceText, /\b(\d+(?:\.\d+)?)\s*(?:baths?|ba|bathrooms?)\b/i),
    sqft: parseNumberBefore(sourceText, /\b([0-9][0-9,]*)\s*(?:sq\.?\s*ft\.?|sqft|square feet)\b/i),
    home_type: detectHomeType(sourceText),
  };
}

export function detectHomeType(sourceText: string) {
  const text = sourceText.toLowerCase();
  if (/\b(?:condo|condominium)\b/.test(text)) return 'Condo';
  if (/\btownhome|townhouse\b/.test(text)) return 'Townhouse';
  if (/\bduplex|triplex|multi[- ]family|multifamily\b/.test(text)) return 'Multi-Family';
  if (/\bapartment\b/.test(text)) return 'Apartment';
  if (/\blot|land\b/.test(text)) return 'Lot';
  if (/\bsingle[- ]family|house|home\b/.test(text)) return 'Single Family';
  return '';
}

export function formatDraftPrice(value: number | null) {
  if (!value) return '';
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function createMarketQuestion(address: string, askingPrice: number | null) {
  const target = askingPrice ? formatDraftPrice(askingPrice) : 'the asking price';
  const subject = address || 'this property';
  return `Will ${subject} appraise above ${target}?`;
}

function createEvidenceChecklist() {
  return [
    'Final sale price, appraisal report, or signed valuation evidence.',
    'Original listing snapshot with asking price and property facts.',
    'At least three comparable nearby sales or active listings.',
    'Any material renovation, disclosure, or inspection notes used during settlement.',
  ];
}

function createGeneratedSummary(address: string, askingPrice: number | null, facts: ReturnType<typeof parsePropertyFacts>) {
  const factParts = [
    facts.beds ? `${facts.beds} bed` : '',
    facts.baths ? `${facts.baths} bath` : '',
    facts.sqft ? `${facts.sqft.toLocaleString()} sqft` : '',
    facts.home_type,
  ].filter(Boolean);
  const price = askingPrice ? `at ${formatDraftPrice(askingPrice)}` : 'without a verified asking price yet';
  const subject = address || 'This pasted listing';
  const factText = factParts.length ? ` Parsed facts: ${factParts.join(', ')}.` : '';
  return `${subject} is ready for a binary over/under valuation room ${price}.${factText} Verify the source data before settlement.`;
}

function createWarnings(address: string, askingPrice: number | null) {
  const warnings = [
    'Generated locally from pasted text; no external comps or AI provider were queried.',
    'Review every generated field before hosting the room.',
  ];
  if (!address) warnings.unshift('No street address was detected.');
  if (!askingPrice) warnings.unshift('No asking price was detected.');
  return warnings;
}

function createProvenance(address: string, askingPrice: number | null, facts: ReturnType<typeof parsePropertyFacts>): MarketDraftProvenance {
  const matchedSignals = [
    address ? 'street address' : '',
    askingPrice ? 'asking price' : '',
    facts.beds ? 'bed count' : '',
    facts.baths ? 'bath count' : '',
    facts.sqft ? 'square footage' : '',
    facts.home_type ? 'home type' : '',
  ].filter(Boolean);

  return {
    source: 'Local deterministic listing parser',
    confidence: matchedSignals.length >= 4 ? 'high' : matchedSignals.length >= 2 ? 'medium' : 'low',
    matchedSignals,
  };
}

export function generateMarketDraft(sourceText: string, sourceType: MarketDraftSourceType = 'pasted_listing'): MarketDraft {
  const source_text = sourceText.trim();
  const addressParts = parseAddress(source_text);
  const asking_price = parseAskingPrice(source_text);
  const facts = parsePropertyFacts(source_text);

  return {
    source_type: sourceType,
    source_text,
    property_id: null,
    address: addressParts.address,
    city: addressParts.city,
    state: addressParts.state,
    zip: addressParts.zip,
    asking_price,
    beds: facts.beds,
    baths: facts.baths,
    sqft: facts.sqft,
    home_type: facts.home_type,
    listing_description: clampListingDescription(source_text),
    provenance: createProvenance(addressParts.address, asking_price, facts),
    market_question: createMarketQuestion(addressParts.address, asking_price),
    market_format: DEFAULT_MARKET_FORMAT,
    liquidity_b: DEFAULT_LIQUIDITY_B,
    settlement_rule: 'Settle using final sale price, appraisal, or host-provided valuation evidence.',
    evidence_required: createEvidenceChecklist(),
    generated_summary: createGeneratedSummary(addressParts.address, asking_price, facts),
    warnings: createWarnings(addressParts.address, asking_price),
  };
}

export function validateMarketDraft(
  draft: Pick<MarketDraft, 'address' | 'asking_price'> & Partial<Pick<MarketDraft, 'market_format'>>
): MarketDraftValidation {
  const issues: string[] = [];
  if (!draft.address.trim()) issues.push('Property address is required.');
  if (!draft.asking_price || draft.asking_price <= 0) issues.push('Asking price must be greater than $0.');
  if (draft.asking_price && draft.asking_price > MAX_ASKING_PRICE) {
    issues.push('Asking price must be $100M or less.');
  }
  if (draft.market_format && !REGISTERED_MARKET_FORMATS.has(draft.market_format)) {
    issues.push('Market format is not registered.');
  } else if (draft.market_format && !PLAYABLE_MARKET_FORMATS.has(draft.market_format)) {
    issues.push('Market format is registered but not playable yet.');
  }
  return {
    valid: issues.length === 0,
    issues,
  };
}
