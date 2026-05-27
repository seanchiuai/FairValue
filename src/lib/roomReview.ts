import type {
  ActivityEntry,
  House,
  Market,
  MarketDraftAudit,
  PlayerData,
  RoomEvent,
  SettleResult,
} from '../types';
import { calculateImpliedPrice } from './lmsr';

export interface RoomReviewMetric {
  label: string;
  value: string;
  detail: string;
  tone: 'positive' | 'negative' | 'neutral' | 'caution';
}

export interface RoomReviewTimelineItem {
  sequence: number;
  label: string;
  detail: string;
}

export interface RoomReviewEvidenceItem {
  label: string;
  value: string;
  detail: string;
}

export interface RoomReviewDisputeBrief {
  status: 'needs_evidence' | 'ready_to_review' | 'settled_with_packet' | 'settled_needs_packet';
  evidence_summary: string[];
  dispute_questions: string[];
  operator_actions: string[];
  limitations: string[];
}

export interface RoomReviewReport {
  status: 'live' | 'ready_to_settle' | 'settled';
  headline: string;
  summary: string;
  metrics: RoomReviewMetric[];
  evidence: RoomReviewEvidenceItem[];
  dispute_brief: RoomReviewDisputeBrief;
  integrity_checks: string[];
  timeline: RoomReviewTimelineItem[];
  recap: string[];
}

export interface RoomReviewInput {
  roomCode: string;
  house: House;
  market: Market;
  players: PlayerData[];
  activity: ActivityEntry[];
  draftAudit?: MarketDraftAudit | null;
  settled: boolean;
  settlement?: SettleResult | null;
  events: RoomEvent[];
  eventSequence?: number;
}

function formatMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return 'Unavailable';
  return `$${Math.round(value).toLocaleString()}`;
}

function formatProbability(value: number) {
  if (!Number.isFinite(value)) return '50%';
  return `${Math.round(value * 100)}%`;
}

function formatScore(value: number | null | undefined) {
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value))}/100` : 'Unscored';
}

function winnerFor(actualPrice: number, askingPrice: number) {
  return actualPrice >= askingPrice ? 'over' : 'under';
}

function settlementValue(settlement: SettleResult) {
  const outcome = settlement.winning_outcome.toUpperCase();
  if (Number.isFinite(settlement.days_on_market)) {
    return `${outcome} at ${Math.round(Number(settlement.days_on_market))} days`;
  }
  if (Number.isFinite(settlement.rent_yield)) {
    return `${outcome} at ${Math.round(Number(settlement.rent_yield) * 10000) / 100}% yield`;
  }
  if (Number.isFinite(settlement.verified_cost)) {
    return `${outcome} at ${formatMoney(settlement.verified_cost)}`;
  }
  return `${outcome} at ${formatMoney(settlement.actual_price)}`;
}

function settlementSentence(settlement: SettleResult) {
  return settlementValue(settlement).replace(' at ', ' won at ');
}

function settlementDetail(settlement: SettleResult, house: House) {
  if (Number.isFinite(settlement.days_on_market)) {
    return `Lifecycle value is ${Math.round(Number(settlement.days_on_market))} days against a ${Math.round(Number(settlement.days_threshold || 0))}-day threshold.`;
  }
  if (Number.isFinite(settlement.rent_yield)) {
    return `Rent-yield value uses ${formatMoney(settlement.annual_rent)} annual rent and ${formatMoney(settlement.settlement_price || settlement.actual_price)} settlement price.`;
  }
  if (Number.isFinite(settlement.verified_cost)) {
    return `Renovation value is ${formatMoney(settlement.verified_cost)} verified cost against a ${formatMoney(settlement.budget_threshold)} budget.`;
  }
  return `Actual value is ${formatMoney(Math.abs(settlement.actual_price - house.asking_price))} ${settlement.actual_price >= house.asking_price ? 'above' : 'below'} the ${formatMoney(house.asking_price)} ask.`;
}

function settlementIntegrityCheck(settlement: SettleResult, house: House) {
  if (Number.isFinite(settlement.days_on_market)) {
    return `Settlement outcome ${settlement.winning_outcome.toUpperCase()} ${Number(settlement.days_on_market) >= Number(settlement.days_threshold) ? 'matches' : 'does not match'} the days-on-market threshold.`;
  }
  if (Number.isFinite(settlement.rent_yield)) {
    return `Settlement outcome ${settlement.winning_outcome.toUpperCase()} is tied to the recorded rent-yield evidence.`;
  }
  if (Number.isFinite(settlement.verified_cost)) {
    return `Settlement outcome ${settlement.winning_outcome.toUpperCase()} ${Number(settlement.verified_cost) >= Number(settlement.budget_threshold) ? 'matches' : 'does not match'} the renovation-budget threshold.`;
  }
  return `Settlement outcome ${settlement.winning_outcome.toUpperCase()} ${winnerFor(settlement.actual_price, house.asking_price) === settlement.winning_outcome ? 'matches' : 'does not match'} the asking-price comparison.`;
}

function recentBets(activity: ActivityEntry[]) {
  return activity
    .filter((entry) => entry.type === 'bet' && entry.outcome && typeof entry.wager === 'number')
    .slice(-3);
}

function eventLabel(event: RoomEvent) {
  switch (event.type) {
    case 'room_created':
      return 'Room created';
    case 'player_joined':
      return 'Player joined';
    case 'bet_placed':
      return 'Bet placed';
    case 'ai_trade':
      return 'AI trade';
    case 'phase_changed':
      return 'Phase changed';
    case 'settlement_completed':
      return 'Settlement completed';
    case 'error':
      return 'Room error';
    default:
      return event.type.replace(/_/g, ' ');
  }
}

function eventDetail(event: RoomEvent) {
  const payload = event.payload || {};
  if (event.type === 'room_created') {
    const address = typeof payload.house?.address === 'string' ? payload.house.address : 'room property';
    return `${address} opened for ${formatMoney(payload.house?.asking_price)}.`;
  }
  if (event.type === 'player_joined') {
    return `${payload.nickname || payload.player?.nickname || 'A player'} entered the room.`;
  }
  if (event.type === 'bet_placed') {
    const reason = typeof payload.reason === 'string' && payload.reason.trim()
      ? ` Reason: ${payload.reason.trim()}.`
      : '';
    return `${payload.nickname || payload.player?.nickname || 'A player'} bet ${formatMoney(payload.wager)} on ${String(payload.outcome || 'unknown').toUpperCase()}.${reason}`;
  }
  if (event.type === 'settlement_completed') {
    const settlement = payload.settlement || payload;
    if (Number.isFinite(settlement.days_on_market)) {
      return `${String(settlement.winning_outcome || payload.winning_outcome || 'unknown').toUpperCase()} won at ${Math.round(Number(settlement.days_on_market))} days.`;
    }
    return `${String(settlement.winning_outcome || payload.winning_outcome || 'unknown').toUpperCase()} won at ${formatMoney(settlement.actual_price || payload.actual_price)}.`;
  }
  if (event.type === 'error') {
    return `${payload.action || 'room action'}: ${payload.message || 'error recorded'}.`;
  }
  return 'Recorded in the room event log.';
}

function buildTimeline(events: RoomEvent[], activity: ActivityEntry[]) {
  if (events.length > 0) {
    return events.slice(-8).map((event) => ({
      sequence: event.sequence,
      label: eventLabel(event),
      detail: eventDetail(event),
    }));
  }

  return activity.slice(-8).map((entry, index) => ({
    sequence: entry.event_sequence || index + 1,
    label: entry.type === 'bet' ? 'Bet activity' : entry.type === 'settle' ? 'Settlement activity' : 'Room activity',
    detail: entry.type === 'bet'
      ? `${entry.nickname || 'A player'} bet ${formatMoney(entry.wager)} on ${String(entry.outcome || 'unknown').toUpperCase()}.${entry.reason ? ` Reason: ${entry.reason}.` : ''}`
      : entry.type === 'settle'
        ? `${String(entry.winning_outcome || 'unknown').toUpperCase()} won at ${formatMoney(entry.actual_price)}.`
        : `${entry.nickname || 'Room'} recorded ${entry.type}.`,
  }));
}

function buildDisputeBrief({
  roomCode,
  house,
  market,
  draftAudit,
  settlement,
  events,
  activity,
}: Pick<RoomReviewInput, 'roomCode' | 'house' | 'market' | 'draftAudit' | 'settlement' | 'events' | 'activity'>): RoomReviewDisputeBrief {
  const hasEventLog = events.length > 0;
  const hasPacket = Boolean(settlement?.evidence_packet);
  const reasonedBets = activity.filter((entry) => entry.type === 'bet' && entry.reason).length;
  const evidenceSummary = [
    hasEventLog ? `Host event log has ${events.length} canonical event${events.length === 1 ? '' : 's'}.` : 'Host event log is not loaded.',
    draftAudit ? `Draft audit source: ${draftAudit.provenance.source}.` : 'No Market Studio draft audit is attached.',
    hasPacket
      ? `Settlement packet attached with ${settlement?.evidence_packet?.items.length || 0} public item${settlement?.evidence_packet?.items.length === 1 ? '' : 's'}.`
      : 'Settlement evidence packet is still missing.',
    `${reasonedBets} public bet reason${reasonedBets === 1 ? '' : 's'} available for dispute review.`,
  ];
  const disputeQuestions = [
    settlement
      ? `Does the packet directly support ${settlementValue(settlement)} for ${house.address}?`
      : `What public-safe document will settle ${house.address}?`,
    market.prob_over >= 0.62
      ? 'What evidence could still make the UNDER side right?'
      : market.prob_over <= 0.38
        ? 'What evidence could still make the OVER side right?'
        : 'Which side has the clearest evidence gap?',
    hasEventLog ? `Which event in ${roomCode} changed the room most?` : 'Can the host load the event log before final review?',
  ];
  const operatorActions = settlement
    ? [
        hasPacket ? 'Compare packet metadata with settlement result before sharing.' : 'Attach a public-safe settlement packet before sharing.',
        'Review public verification replay digest before exporting.',
        'Use this brief as an audit prompt, not a dispute ruling.',
      ]
    : [
        'Read the required settlement checklist before closing the room.',
        'Ask each side to answer the strongest dispute question.',
        'Capture the settlement packet before final recap.',
      ];

  return {
    status: settlement ? (hasPacket ? 'settled_with_packet' : 'settled_needs_packet') : hasEventLog ? 'ready_to_review' : 'needs_evidence',
    evidence_summary: evidenceSummary,
    dispute_questions: disputeQuestions,
    operator_actions: operatorActions,
    limitations: [
      'Deterministic local audit prompt only.',
      'Not arbitration, legal advice, appraisal authority, or compliance review.',
    ],
  };
}

export function generateRoomReview(input: RoomReviewInput): RoomReviewReport {
  const {
    roomCode,
    house,
    market,
    players,
    activity,
    draftAudit,
    settled,
    settlement,
    events,
    eventSequence,
  } = input;
  const overProbability = Number.isFinite(market.prob_over) ? market.prob_over : 0.5;
  const impliedPrice = calculateImpliedPrice(overProbability, house.asking_price);
  const tradeDepth = market.total_trades;
  const hasEventLog = events.length > 0;
  const reputation = settlement?.reputation_summary || null;
  const topReputationPlayer = reputation?.top_players?.[0];
  const status: RoomReviewReport['status'] = settled
    ? 'settled'
    : tradeDepth > 0
      ? 'ready_to_settle'
      : 'live';

  const evidence: RoomReviewEvidenceItem[] = [
    {
      label: 'Market question',
      value: draftAudit?.market_question || `Will ${house.address} settle above ${formatMoney(house.asking_price)}?`,
      detail: draftAudit
        ? `Server accepted this ${draftAudit.market_format.replace(/_/g, ' ')} draft from ${draftAudit.provenance.source}.`
        : 'No Market Studio draft audit is attached; the room uses host-entered address and asking price.',
    },
    {
      label: 'Required settlement evidence',
      value: draftAudit?.evidence_required.length ? `${draftAudit.evidence_required.length} item checklist` : 'Default checklist',
      detail: (draftAudit?.evidence_required.length
        ? draftAudit.evidence_required
        : [
            'Final sale price, appraisal report, or signed valuation evidence.',
            'Original asking price and property facts.',
          ]).join(' '),
    },
    {
      label: 'Event history',
      value: hasEventLog ? `${events.length} event${events.length === 1 ? '' : 's'}` : 'Locked',
      detail: hasEventLog
        ? `Host-authorized event log loaded through sequence ${events.at(-1)?.sequence || eventSequence || 0}.`
        : 'Open this route from the original host browser to load the host-only event log.',
    },
  ];

  if (settlement) {
    evidence.push({
      label: 'Settlement evidence',
      value: settlementValue(settlement),
      detail: settlementDetail(settlement, house),
    });
    if (settlement.evidence_packet) {
      evidence.push({
        label: 'Settlement evidence packet',
        value: `${settlement.evidence_packet.items.length} public item${settlement.evidence_packet.items.length === 1 ? '' : 's'}`,
        detail: `${settlement.evidence_packet.summary} Sources: ${settlement.evidence_packet.items.map((item) => `${item.label} (${item.confidence})`).join('; ')}.`,
      });
    }
    if (reputation) {
      evidence.push({
        label: 'Reputation calibration',
        value: `${reputation.eligible_player_count} scored player${reputation.eligible_player_count === 1 ? '' : 's'}`,
        detail: topReputationPlayer
          ? `${topReputationPlayer.nickname} leads at ${formatScore(topReputationPlayer.calibration_score)}; room average is ${formatScore(reputation.average_calibration_score)} across ${reputation.total_bets} public bet${reputation.total_bets === 1 ? '' : 's'}.`
          : `Room average is ${formatScore(reputation.average_calibration_score)} across ${reputation.total_bets} public bet${reputation.total_bets === 1 ? '' : 's'}.`,
      });
    }
  }

  const integrityChecks = [
    hasEventLog
      ? `Event log loaded for ${roomCode}; public state sequence is ${eventSequence || events.at(-1)?.sequence || 0}.`
      : 'Event log is not loaded, so this review is a public-state preview rather than an operator audit.',
    draftAudit
      ? `Draft audit accepted from ${draftAudit.provenance.source}; raw pasted listing text is not stored.`
      : 'No draft audit envelope is attached to this room.',
    settlement
      ? settlementIntegrityCheck(settlement, house)
      : 'Settlement has not been recorded yet.',
    settlement?.evidence_packet
      ? `Settlement evidence packet is ${settlement.evidence_packet.status.replace(/_/g, ' ')} with ${settlement.evidence_packet.items.length} public-safe metadata item${settlement.evidence_packet.items.length === 1 ? '' : 's'}.`
      : 'Settlement evidence packet has not been recorded yet.',
    reputation
      ? `Reputation summary ${reputation.schema_version} scored ${reputation.eligible_player_count} player${reputation.eligible_player_count === 1 ? '' : 's'} without session IDs.`
      : 'Reputation calibration is pending until settlement produces a scoreable room summary.',
    'All balances and payouts are simulation credits only.',
  ];
  const disputeBrief = buildDisputeBrief({
    roomCode,
    house,
    market,
    draftAudit,
    settlement,
    events,
    activity,
  });

  const latestBets = recentBets(activity);
  const recap = [
    `${house.address} is trading ${formatProbability(overProbability)} OVER with an implied room value of ${formatMoney(impliedPrice)}.`,
    `${players.length} player${players.length === 1 ? '' : 's'} generated ${tradeDepth} trade${tradeDepth === 1 ? '' : 's'} and ${formatMoney(market.total_wagered)} in simulation-credit volume.`,
    latestBets.length
      ? `Latest movement: ${latestBets.map((bet) => `${bet.nickname || 'player'} ${String(bet.outcome).toUpperCase()} ${formatMoney(bet.wager)}`).join('; ')}.`
      : 'No player bets have landed yet, so the room still needs evidence-backed opening movement.',
    settlement
      ? `Settlement recap: ${settlementSentence(settlement)}.`
      : 'Settlement recap is pending until the host records an actual sale, appraisal, or signed valuation.',
    reputation
      ? `Calibration recap: ${reputation.eligible_player_count} player${reputation.eligible_player_count === 1 ? '' : 's'} averaged ${formatScore(reputation.average_calibration_score)} in this settled room.`
      : 'Calibration recap is pending until the room settles.',
  ];

  return {
    status,
    headline: status === 'settled'
      ? `${roomCode} settled ${settlement?.winning_outcome.toUpperCase()}`
      : status === 'ready_to_settle'
        ? `${roomCode} is ready for operator review`
        : `${roomCode} is collecting opening evidence`,
    summary: `Operator review for ${house.address}: compare the accepted market draft, live LMSR movement, host-only event log, and settlement evidence before sharing a recap.`,
    metrics: [
      {
        label: 'Consensus',
        value: `${formatProbability(overProbability)} over`,
        detail: `Implied room value ${formatMoney(impliedPrice)} around the ${formatMoney(house.asking_price)} ask.`,
        tone: overProbability >= 0.62 ? 'positive' : overProbability <= 0.38 ? 'negative' : 'neutral',
      },
      {
        label: 'Trade depth',
        value: `${tradeDepth} trade${tradeDepth === 1 ? '' : 's'}`,
        detail: `${formatMoney(market.total_wagered)} simulation credits in room volume.`,
        tone: tradeDepth >= 3 ? 'positive' : 'caution',
      },
      {
        label: 'Players',
        value: String(players.length),
        detail: players.length <= 1 ? 'Single participant so far.' : 'Multiple participants are represented.',
        tone: players.length >= 3 ? 'positive' : players.length >= 2 ? 'neutral' : 'caution',
      },
      {
        label: 'Audit status',
        value: draftAudit ? 'Draft accepted' : 'Draft missing',
        detail: draftAudit?.property_id ? `Linked property ${draftAudit.property_id}.` : 'No linked local property audit.',
        tone: draftAudit ? 'positive' : 'caution',
      },
      {
        label: 'Settlement',
        value: settlement ? settlement.winning_outcome.toUpperCase() : 'Pending',
        detail: settlement ? settlementDetail(settlement, house) : 'Host has not settled this room.',
        tone: settlement ? 'positive' : 'neutral',
      },
      {
        label: 'Calibration',
        value: reputation ? formatScore(reputation.average_calibration_score) : 'Pending',
        detail: reputation
          ? `${reputation.eligible_player_count} scored player${reputation.eligible_player_count === 1 ? '' : 's'}; ${reputation.reason_count} public reason${reputation.reason_count === 1 ? '' : 's'} counted.`
          : 'Room reputation scores are created at settlement.',
        tone: reputation?.average_calibration_score == null
          ? 'neutral'
          : reputation.average_calibration_score >= 80
            ? 'positive'
            : 'caution',
      },
    ],
    evidence,
    dispute_brief: disputeBrief,
    integrity_checks: integrityChecks,
    timeline: buildTimeline(events, activity),
    recap,
  };
}
