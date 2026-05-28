import type { Property } from '../data/properties';
import type { ActivityEntry, House, Market, MarketDraftAudit, PlayerData } from '../types';
import { calculateImpliedPrice } from './lmsr';

export type IntelligenceTone = 'positive' | 'negative' | 'neutral' | 'caution';

export interface IntelligenceMetric {
  label: string;
  value: string;
  detail: string;
  tone: IntelligenceTone;
}

export interface IntelligencePrompt {
  label: string;
  question: string;
  rationale: string;
}

export type IntelligenceAnalystRole =
  | 'bull'
  | 'bear'
  | 'comp'
  | 'affordability'
  | 'fraud_check'
  | 'neighborhood';

export interface IntelligenceAnalystCase {
  role: IntelligenceAnalystRole;
  label: string;
  evidence: string[];
  limitation: string;
  tone: IntelligenceTone;
}

export interface MarketIntelligence {
  analysis_schema_version: 'fairvalue.marketIntelligence.v2';
  summary: string;
  confidence: 'high' | 'medium' | 'low';
  confidence_reason: string;
  metrics: IntelligenceMetric[];
  analyst_cases: IntelligenceAnalystCase[];
  bullish_cases: string[];
  bearish_cases: string[];
  uncertainty_cases: string[];
  scenario_prompts: IntelligencePrompt[];
  settlement_checklist: string[];
}

export interface RoomMarketIntelligence {
  summary: string;
  confidence: 'high' | 'medium' | 'low';
  confidence_reason: string;
  provider_status: 'local_fallback' | 'provider_backed';
  live_metrics: IntelligenceMetric[];
  movement_explanations: string[];
  pressure_points: string[];
  host_script: string[];
  next_questions: IntelligencePrompt[];
  settlement_checklist: string[];
  provenance_notes: string[];
}

export interface RoomMarketIntelligenceInput {
  house: House;
  market: Market;
  players: PlayerData[];
  activity: ActivityEntry[];
  draftAudit?: MarketDraftAudit | null;
}

const typeLabels: Record<string, string> = {
  SINGLE_FAMILY: 'single-family home',
  CONDO: 'condo',
  MULTI_FAMILY: 'multi-family property',
  APARTMENT: 'apartment',
  LOT: 'lot',
};

function formatMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return 'Unavailable';
  return `$${Math.round(value).toLocaleString()}`;
}

function formatPercent(value: number) {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(1)}%`;
}

function safeRatio(numerator: number | null | undefined, denominator: number | null | undefined) {
  if (!numerator || !denominator || denominator <= 0) return null;
  return numerator / denominator;
}

function formatProbability(value: number) {
  return `${Math.round(value * 100)}%`;
}

function recentBetActivity(activity: ActivityEntry[]) {
  return activity
    .filter((entry) => entry.type === 'bet' && entry.outcome && typeof entry.wager === 'number')
    .slice(-4);
}

function buildRoomMetrics(input: RoomMarketIntelligenceInput): IntelligenceMetric[] {
  const { house, market, players, draftAudit } = input;
  const overProbability = Number.isFinite(market.prob_over) ? market.prob_over : 0.5;
  const impliedPrice = calculateImpliedPrice(overProbability, house.asking_price);
  const favorite = overProbability >= 0.5 ? 'over asking' : 'under asking';
  const probabilityTone: IntelligenceTone = overProbability >= 0.62
    ? 'positive'
    : overProbability <= 0.38
      ? 'negative'
      : 'neutral';
  const tradeTone: IntelligenceTone = market.total_trades >= 8
    ? 'positive'
    : market.total_trades >= 3
      ? 'neutral'
      : 'caution';
  const participantTone: IntelligenceTone = players.length >= 6
    ? 'positive'
    : players.length >= 3
      ? 'neutral'
      : 'caution';

  return [
    {
      label: 'Live consensus',
      value: `${formatProbability(overProbability)} over`,
      detail: `Room leans ${favorite} against the ${formatMoney(house.asking_price)} ask.`,
      tone: probabilityTone,
    },
    {
      label: 'Implied room value',
      value: formatMoney(impliedPrice),
      detail: 'LMSR over probability around ask; not an appraisal.',
      tone: probabilityTone,
    },
    {
      label: 'Room liquidity',
      value: `${market.total_trades} trade${market.total_trades === 1 ? '' : 's'}`,
      detail: `${formatMoney(market.total_wagered)} simulation credits have moved through this room.`,
      tone: tradeTone,
    },
    {
      label: 'Participant base',
      value: `${players.length} player${players.length === 1 ? '' : 's'}`,
      detail: players.length <= 1
        ? 'Thin room: one bet can still swing it.'
        : 'Broader room: one player has less swing.',
      tone: participantTone,
    },
    {
      label: 'Draft audit',
      value: draftAudit ? 'Accepted' : 'Not attached',
      detail: draftAudit
        ? `Accepted from ${draftAudit.provenance.source}${draftAudit.property_id ? `; property ${draftAudit.property_id}` : ''}.`
        : 'No Market Studio draft audit is attached to this room.',
      tone: draftAudit ? 'positive' : 'caution',
    },
  ];
}

function buildMovementExplanations(input: RoomMarketIntelligenceInput) {
  const recentBets = recentBetActivity(input.activity);
  if (recentBets.length === 0) {
    return [
      'No player bets have landed yet; current probability is still close to the LMSR starting point.',
      'The first few wagers should be treated as early sentiment, not a durable room consensus.',
    ];
  }

  return recentBets.map((entry) => {
    const nickname = entry.nickname || 'A player';
    const outcome = String(entry.outcome).toUpperCase();
    const wager = formatMoney(entry.wager);
    return `${nickname} pushed ${outcome} with ${wager}.`;
  });
}

function buildPressurePoints(input: RoomMarketIntelligenceInput) {
  const { house, market, draftAudit } = input;
  const points: string[] = [];
  const overProbability = Number.isFinite(market.prob_over) ? market.prob_over : 0.5;

  if (overProbability >= 0.62) {
    points.push(`Over leads; ask what evidence pulls value below ${formatMoney(house.asking_price)}.`);
  } else if (overProbability <= 0.38) {
    points.push(`Under leads; ask what comp, appraisal, or offer defends ${formatMoney(house.asking_price)}.`);
  } else {
    points.push('Room sentiment is balanced; one strong evidence drop can define the debate.');
  }

  if (market.total_trades < 3) {
    points.push('Liquidity is thin; frame this as early price discovery.');
  } else {
    points.push(`${market.total_trades} trades let the host ask why the market moved.`);
  }

  if (draftAudit) {
    points.push(`Use the draft audit evidence list before close: ${draftAudit.evidence_required.slice(0, 2).join(' ')}`);
  } else {
    points.push('No draft audit; state settlement evidence before close.');
  }

  return points;
}

function buildRoomQuestions(input: RoomMarketIntelligenceInput): IntelligencePrompt[] {
  const { house, market, draftAudit } = input;
  const overProbability = Number.isFinite(market.prob_over) ? market.prob_over : 0.5;
  const consensus = overProbability >= 0.5 ? 'over' : 'under';
  return [
    {
      label: 'Consensus challenge',
      question: `What single fact would make the ${consensus.toUpperCase()} side wrong about ${house.address}?`,
      rationale: 'A live room needs adversarial evidence, not agreement.',
    },
    {
      label: 'Evidence gap',
      question: draftAudit
        ? `Which item from the draft audit evidence checklist is still missing before settlement?`
        : 'Which sale, appraisal, or signed valuation artifact will settle this room?',
      rationale: draftAudit
        ? 'The server-preserved draft audit gives the host a closeout checklist.'
        : 'Without a draft audit, the host must define settlement evidence.',
    },
    {
      label: 'Movement read',
      question: market.total_trades > 0
        ? 'Did the latest bets reveal new information or just player momentum?'
        : 'What evidence should players see before the first bet moves the market?',
      rationale: 'Separate information-driven moves from game-flow moves before treating the probability as a valuation signal.',
    },
  ];
}

export function generateRoomMarketIntelligence(input: RoomMarketIntelligenceInput): RoomMarketIntelligence {
  const { house, market, players, draftAudit } = input;
  const overProbability = Number.isFinite(market.prob_over) ? market.prob_over : 0.5;
  const impliedPrice = calculateImpliedPrice(overProbability, house.asking_price);
  const recentBets = recentBetActivity(input.activity);
  const liveMetrics = buildRoomMetrics(input);
  const confidence: RoomMarketIntelligence['confidence'] = draftAudit && market.total_trades >= 3 && players.length >= 3
    ? 'high'
    : draftAudit || market.total_trades >= 2
      ? 'medium'
      : 'low';
  const providerStatus: RoomMarketIntelligence['provider_status'] = 'local_fallback';
  const auditSource = draftAudit?.provenance.source || 'room creation payload';
  const propertyContext = draftAudit?.property_id
    ? `linked local property ${draftAudit.property_id}`
    : draftAudit
      ? 'server-accepted draft metadata'
      : 'room address and asking price only';

  return {
    summary: `Live room intelligence: ${formatProbability(overProbability)} over, implying ${formatMoney(impliedPrice)} around the ${formatMoney(house.asking_price)} ask from LMSR flow, ${players.length} player${players.length === 1 ? '' : 's'}, ${market.total_trades} trade${market.total_trades === 1 ? '' : 's'}, and ${propertyContext}. No provider-backed comps were queried.`,
    confidence,
    confidence_reason: confidence === 'high'
      ? 'Draft audit, participation, and live trade flow are present.'
      : confidence === 'medium'
        ? 'Some structured room evidence exists; depth is still developing.'
        : 'Early room state with little trade depth.',
    provider_status: providerStatus,
    live_metrics: liveMetrics,
    movement_explanations: buildMovementExplanations(input),
    pressure_points: buildPressurePoints(input),
    host_script: [
      `Open with the live consensus: ${formatProbability(overProbability)} over.`,
      recentBets.length > 0
        ? 'Ask latest bettors what changed, then ask the other side for missing evidence.'
        : 'Ask players to name the first evidence artifact before the opening bet.',
      draftAudit
        ? `Close with the draft audit source and checklist from ${auditSource}.`
        : 'Close by restating final sale, appraisal, or signed valuation evidence.',
    ],
    next_questions: buildRoomQuestions(input),
    settlement_checklist: draftAudit?.evidence_required.length
      ? draftAudit.evidence_required
      : [
          'Final sale price, appraisal report, or signed valuation evidence.',
          'Host-entered actual value and room event history.',
          'Confirmation that all balances are simulation credits only.',
        ],
    provenance_notes: [
      draftAudit
        ? `Draft audit accepted from ${auditSource}; pasted text is not stored.`
        : 'No Market Studio audit envelope is attached to this room.',
      'Room intelligence is deterministic local fallback output.',
      'No provider-backed comps were queried for this panel.',
    ],
  };
}

function averageSchoolRating(property: Property) {
  const ratings = property.schools
    .map((school) => school.rating)
    .filter((rating): rating is number => rating != null);
  if (ratings.length === 0) return null;
  return ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
}

function estimateMonthlyPrincipalInterest(price: number) {
  return Number.isFinite(price) && price > 0 ? price * 0.8 * 0.006486 : null;
}

function sourceLabel(property: Property) {
  return property.attributionInfo?.mlsName
    || property.listingDataSource
    || property.listingSource
    || property.priceHistory.find((entry) => entry.source)?.source
    || 'local property snapshot';
}

function summarizeConfidence(property: Property, metricCount: number): MarketIntelligence['confidence'] {
  if (property.price > 0 && property.zestimate && property.livingArea && metricCount >= 4) return 'high';
  if (property.price > 0 && metricCount >= 2) return 'medium';
  return 'low';
}

function buildMetrics(property: Property): IntelligenceMetric[] {
  const metrics: IntelligenceMetric[] = [];
  const zestimateGap = safeRatio((property.zestimate ?? 0) - property.price, property.price);
  if (zestimateGap != null) {
    const pct = zestimateGap * 100;
    metrics.push({
      label: 'Zestimate gap',
      value: formatPercent(pct),
      detail: `${formatMoney(property.zestimate)} Zestimate vs ${formatMoney(property.price)} ask.`,
      tone: pct >= 3 ? 'positive' : pct <= -3 ? 'negative' : 'neutral',
    });
  }

  const rentYield = safeRatio((property.rentZestimate ?? 0) * 12, property.price);
  if (rentYield != null) {
    const pct = rentYield * 100;
    metrics.push({
      label: 'Gross rent yield',
      value: `${pct.toFixed(1)}%`,
      detail: `${formatMoney(property.rentZestimate)}/mo before tax, insurance, maintenance, vacancy.`,
      tone: pct >= 4 ? 'positive' : pct < 2.5 ? 'caution' : 'neutral',
    });
  }

  const pricePerSqft = safeRatio(property.price, property.livingArea);
  if (pricePerSqft != null) {
    metrics.push({
      label: 'Price per sqft',
      value: `${formatMoney(pricePerSqft)}/sqft`,
      detail: `${property.livingArea?.toLocaleString()} sqft in the listing snapshot.`,
      tone: 'neutral',
    });
  }

  const schoolAverage = averageSchoolRating(property);
  if (schoolAverage != null) {
    metrics.push({
      label: 'School signal',
      value: `${schoolAverage.toFixed(1)}/10 avg`,
      detail: `${property.schools.length} nearby school reference${property.schools.length === 1 ? '' : 's'}.`,
      tone: schoolAverage >= 7 ? 'positive' : schoolAverage < 4 ? 'caution' : 'neutral',
    });
  }

  if (property.daysOnZillow != null) {
    metrics.push({
      label: 'Market age',
      value: `${property.daysOnZillow} days`,
      detail: property.daysOnZillow <= 14
        ? 'Fresh listing; early markets can swing quickly.'
        : 'Longer exposure may signal negotiation or stale context.',
      tone: property.daysOnZillow <= 14 ? 'positive' : property.daysOnZillow >= 60 ? 'caution' : 'neutral',
    });
  }

  return metrics;
}

function buildBullCases(property: Property, metrics: IntelligenceMetric[]) {
  const cases: string[] = [];
  const zestimateGap = safeRatio((property.zestimate ?? 0) - property.price, property.price);
  if (zestimateGap != null && zestimateGap > 0.02) {
    cases.push(`Zestimate sits ${formatPercent(zestimateGap * 100)} above asking as an over-side reference.`);
  }
  const yieldMetric = metrics.find((metric) => metric.label === 'Gross rent yield');
  if (yieldMetric?.tone === 'positive') {
    cases.push(`${yieldMetric.value} gross rent yield can support a rental-value argument.`);
  }
  const schoolAverage = averageSchoolRating(property);
  if (schoolAverage != null && schoolAverage >= 7) {
    cases.push(`Nearby school refs average ${schoolAverage.toFixed(1)}/10.`);
  }
  if (property.daysOnZillow != null && property.daysOnZillow <= 14) {
    cases.push('Fresh exposure may leave room for competitive bidding.');
  }
  if (cases.length === 0) {
    cases.push('The over case needs stronger comp, inspection, or appraisal evidence.');
  }
  return cases;
}

function buildBearCases(property: Property, metrics: IntelligenceMetric[]) {
  const cases: string[] = [];
  const zestimateGap = safeRatio((property.zestimate ?? 0) - property.price, property.price);
  if (zestimateGap != null && zestimateGap < -0.02) {
    cases.push(`Zestimate sits ${formatPercent(zestimateGap * 100)} below asking as an under-side signal.`);
  }
  const yieldMetric = metrics.find((metric) => metric.label === 'Gross rent yield');
  if (yieldMetric?.tone === 'caution') {
    cases.push(`${yieldMetric.value} gross rent yield is thin before ownership costs.`);
  }
  if (property.yearBuilt && property.yearBuilt < 1950) {
    cases.push(`Built in ${property.yearBuilt}; condition and permit history may matter more than headline price.`);
  }
  if (property.daysOnZillow != null && property.daysOnZillow >= 45) {
    cases.push(`${property.daysOnZillow} days on Zillow may point to stale listing assumptions.`);
  }
  if (cases.length === 0) {
    cases.push('The under case needs concrete condition, financing, or comp weakness.');
  }
  return cases;
}

function buildUncertaintyCases(property: Property) {
  const cases = [
    'Listing fields are reference signals, not settlement authority.',
    'Room settlement should rely on a final sale price, appraisal report, or signed valuation evidence.',
  ];
  if (!property.zestimate) cases.push('No Zestimate is available, so the room should lean harder on comps and appraisal evidence.');
  if (!property.livingArea) cases.push('Living area is missing, so price-per-square-foot comparisons may be unreliable.');
  if (property.description.length < 80) cases.push('The listing description is sparse; inspect disclosures and photos before treating the market as informed.');
  return cases;
}

function buildScenarioPrompts(property: Property, metrics: IntelligenceMetric[]): IntelligencePrompt[] {
  const zestimateMetric = metrics.find((metric) => metric.label === 'Zestimate gap');
  const yieldMetric = metrics.find((metric) => metric.label === 'Gross rent yield');
  return [
    {
      label: 'Over scenario',
      question: `What new comp or appraisal evidence would justify ${property.address} clearing above ${formatMoney(property.price)}?`,
      rationale: zestimateMetric
        ? `Start from the ${zestimateMetric.value} Zestimate gap, then test condition and comps.`
        : 'No Zestimate reference; comps and appraisal evidence should lead.',
    },
    {
      label: 'Under scenario',
      question: 'Which defect, disclosure, financing, or stale-listing signal would push fair value below asking?',
      rationale: property.yearBuilt
        ? `${property.yearBuilt} build year makes inspection risk a useful counterweight.`
        : 'Use inspection, financing, and time-on-market evidence.',
    },
    {
      label: 'Yield scenario',
      question: 'Would a rental investor still defend the price after realistic ownership costs?',
      rationale: yieldMetric
        ? `Starting gross yield is ${yieldMetric.value}; ownership costs decide whether it holds.`
        : 'Rent reference is unavailable; use local rent comps.',
    },
  ];
}

function buildAnalystCases(property: Property, metrics: IntelligenceMetric[]): IntelligenceAnalystCase[] {
  const bullCases = buildBullCases(property, metrics);
  const bearCases = buildBearCases(property, metrics);
  const zestimateMetric = metrics.find((metric) => metric.label === 'Zestimate gap');
  const sqftMetric = metrics.find((metric) => metric.label === 'Price per sqft');
  const rentYieldMetric = metrics.find((metric) => metric.label === 'Gross rent yield');
  const schoolAverage = averageSchoolRating(property);
  const monthlyPayment = estimateMonthlyPrincipalInterest(property.price);
  const source = sourceLabel(property);
  const missingFields = [
    property.zestimate ? null : 'Zestimate',
    property.rentZestimate ? null : 'rent reference',
    property.livingArea ? null : 'living area',
    property.description.length >= 80 ? null : 'rich listing description',
  ].filter((item): item is string => Boolean(item));

  const rows: Array<[IntelligenceAnalystRole, string, string[], string, IntelligenceTone]> = [
    [
      'bull',
      'Bull agent',
      bullCases.slice(0, 2),
      'Argument prompt only; not a valuation conclusion.',
      'positive',
    ],
    [
      'bear',
      'Bear agent',
      bearCases.slice(0, 2),
      'Needs inspection, disclosure, financing, or comp evidence before settlement.',
      'negative',
    ],
    [
      'comp',
      'Comp agent',
      [
        zestimateMetric ? `Auto reference gap: ${zestimateMetric.value}.` : 'Zestimate unavailable.',
        sqftMetric ? `${sqftMetric.label}: ${sqftMetric.value}.` : 'Sqft comparison unavailable.',
        `Source: ${source}.`,
      ],
      'Local brief only; no live comp provider queried.',
      zestimateMetric?.tone || 'neutral',
    ],
    [
      'affordability',
      'Affordability agent',
      [
        monthlyPayment ? `20% down, 6.75% P&I: ${formatMoney(monthlyPayment)}/mo.` : 'P&I estimate unavailable.',
        `Ask: ${formatMoney(property.price)}.`,
        rentYieldMetric ? `Rent reference: ${rentYieldMetric.value} gross yield.` : 'Rent unavailable.',
      ],
      'Stress prompt only; not lending, tax, insurance, HOA, or investment advice.',
      rentYieldMetric?.tone === 'positive' ? 'neutral' : 'caution',
    ],
    [
      'fraud_check',
      'Fraud/data-quality agent',
      [
        missingFields.length ? `Verify missing: ${missingFields.join(', ')}.` : 'Local fields complete.',
        `Source: ${source}.`,
        property.attributionInfo?.lastChecked ? `Checked: ${property.attributionInfo.lastChecked}.` : 'No source-check timestamp.',
        `${property.priceHistory.length} price-history event${property.priceHistory.length === 1 ? '' : 's'}.`,
      ],
      'Data-quality risk only; no fraud accusation or compliance review.',
      missingFields.length ? 'caution' : 'neutral',
    ],
    [
      'neighborhood',
      'Neighborhood agent',
      [
        schoolAverage != null ? `${property.city} school refs: ${schoolAverage.toFixed(1)}/10 avg.` : `${property.city} demand needs local evidence.`,
        property.county ? `County: ${property.county}.` : 'County unavailable.',
        property.daysOnZillow != null ? `Market age: ${property.daysOnZillow} days.` : 'Market age unavailable.',
        `${property.schools.length} school reference${property.schools.length === 1 ? '' : 's'}.`,
      ],
      'No live neighborhood, crime, commute, insurance, climate, or school-boundary feed queried.',
      schoolAverage != null && schoolAverage >= 7 ? 'positive' : 'neutral',
    ],
  ];

  return rows.map(([role, label, evidence, limitation, tone]) => ({
    role,
    label,
    evidence,
    limitation,
    tone,
  }));
}

export function generateMarketIntelligence(property: Property): MarketIntelligence {
  const metrics = buildMetrics(property);
  const confidence = summarizeConfidence(property, metrics.length);
  const typeLabel = typeLabels[property.homeType] || 'property';
  const source = sourceLabel(property);
  const pricePerSqft = safeRatio(property.price, property.livingArea);
  const summaryFacts = [
    `${property.bedrooms ?? 'unknown'} bed`,
    `${property.bathrooms ?? 'unknown'} bath`,
    pricePerSqft != null ? `${formatMoney(pricePerSqft)}/sqft` : 'sqft unavailable',
  ];

  return {
    analysis_schema_version: 'fairvalue.marketIntelligence.v2',
    summary: `Local market brief: ${property.address} is a ${summaryFacts.join(', ')} ${typeLabel} asking ${formatMoney(property.price)} in ${property.city}. Generated from ${source} reference data for over/under debate before settlement evidence arrives.`,
    confidence,
    confidence_reason: confidence === 'high'
      ? 'Price, Zestimate, size, rent, and provenance signals are present.'
      : confidence === 'medium'
        ? 'Enough listing fields exist for a directional brief, but some valuation references are missing.'
        : 'Core valuation references are sparse; treat this as a prompt starter.',
    metrics,
    analyst_cases: buildAnalystCases(property, metrics),
    bullish_cases: buildBullCases(property, metrics),
    bearish_cases: buildBearCases(property, metrics),
    uncertainty_cases: buildUncertaintyCases(property),
    scenario_prompts: buildScenarioPrompts(property, metrics),
    settlement_checklist: [
      'Final sale price, appraisal report, or signed valuation document.',
      'Timestamped source link or document owner.',
      'Host confirms simulation credits only.',
      'Room event history preserved with joins, bets, and settlement.',
    ],
  };
}
