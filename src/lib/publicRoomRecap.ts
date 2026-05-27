import type { ActivityEntry, House, Market, MarketDraftAudit, PlayerData, SettleResult } from '../types';
import { calculateImpliedPrice } from './lmsr';

export interface PublicRecapEvidence {
  label: string;
  value: string;
  detail: string;
}

export interface PublicRecapTimelineItem {
  label: string;
  detail: string;
}

export interface PublicRoomRecap {
  status: 'live' | 'settled';
  headline: string;
  summary: string;
  highlights: string[];
  evidence: PublicRecapEvidence[];
  guardrails: string[];
  timeline: PublicRecapTimelineItem[];
}

export interface PublicRoomRecapInput {
  roomCode: string;
  house: House;
  market: Market;
  players: PlayerData[];
  activity: ActivityEntry[];
  draftAudit?: MarketDraftAudit | null;
  settled: boolean;
  settlement?: SettleResult | null;
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

function recentBets(activity: ActivityEntry[]) {
  return activity
    .filter((entry) => entry.type === 'bet' && entry.outcome && typeof entry.wager === 'number')
    .slice(-3);
}

function activityLabel(entry: ActivityEntry) {
  if (entry.type === 'bet') return 'Bet placed';
  if (entry.type === 'settle') return 'Settlement recorded';
  if (entry.type === 'join') return 'Player joined';
  return entry.type.replace(/_/g, ' ');
}

function activityDetail(entry: ActivityEntry) {
  if (entry.type === 'bet') {
    const reason = entry.reason ? ` Reason: ${entry.reason}.` : '';
    return `${entry.nickname || 'A player'} backed ${String(entry.outcome || 'unknown').toUpperCase()} with ${formatMoney(entry.wager)}.${reason}`;
  }
  if (entry.type === 'settle') {
    return `${String(entry.winning_outcome || 'unknown').toUpperCase()} won at ${formatMoney(entry.actual_price)}.`;
  }
  if (entry.type === 'join') {
    return `${entry.nickname || 'A player'} entered the room.`;
  }
  return 'Public room activity recorded.';
}

function buildTimeline(activity: ActivityEntry[]): PublicRecapTimelineItem[] {
  if (activity.length === 0) {
    return [
      {
        label: 'Room opened',
        detail: 'No public joins, bets, or settlement activity has been recorded yet.',
      },
    ];
  }

  return activity.slice(-6).map((entry) => ({
    label: activityLabel(entry),
    detail: activityDetail(entry),
  }));
}

export function generatePublicRoomRecap(input: PublicRoomRecapInput): PublicRoomRecap {
  const { roomCode, house, market, players, activity, draftAudit, settled, settlement } = input;
  const overProbability = Number.isFinite(market.prob_over) ? market.prob_over : 0.5;
  const impliedValue = calculateImpliedPrice(overProbability, house.asking_price);
  const latestBets = recentBets(activity);
  const status: PublicRoomRecap['status'] = settled ? 'settled' : 'live';
  const settlementLine = settlement
    ? `${settlement.winning_outcome.toUpperCase()} won at ${formatMoney(settlement.actual_price)}.`
    : 'Settlement has not been recorded yet.';
  const reputation = settlement?.reputation_summary || null;
  const topReputationPlayer = reputation?.top_players?.[0];
  const reputationLine = reputation
    ? `${reputation.eligible_player_count} scored player${reputation.eligible_player_count === 1 ? '' : 's'} averaged ${formatScore(reputation.average_calibration_score)} calibration.`
    : 'Reputation and calibration are pending until settlement.';

  const evidence: PublicRecapEvidence[] = [
    {
      label: 'Market question',
      value: draftAudit?.market_question || `Will ${house.address} settle above ${formatMoney(house.asking_price)}?`,
      detail: draftAudit
        ? `Based on server-accepted draft metadata from ${draftAudit.provenance.source}; raw pasted listing text is not stored.`
        : 'Based on the public room address and asking price.',
    },
    {
      label: 'Public market movement',
      value: `${formatProbability(overProbability)} OVER`,
      detail: `${market.total_trades} trade${market.total_trades === 1 ? '' : 's'} and ${formatMoney(market.total_wagered)} in simulation-credit volume imply ${formatMoney(impliedValue)} around the ask.`,
    },
  ];

  if (settlement) {
    evidence.push({
      label: 'Settlement result',
      value: `${settlement.winning_outcome.toUpperCase()} at ${formatMoney(settlement.actual_price)}`,
      detail: `Host-entered public settlement value is ${formatMoney(Math.abs(settlement.actual_price - house.asking_price))} ${settlement.actual_price >= house.asking_price ? 'above' : 'below'} the ${formatMoney(house.asking_price)} ask.`,
    });
    if (settlement.evidence_packet) {
      evidence.push({
        label: 'Settlement evidence packet',
        value: `${settlement.evidence_packet.items.length} public item${settlement.evidence_packet.items.length === 1 ? '' : 's'}`,
        detail: `${settlement.evidence_packet.summary} FairValue stores public-safe metadata, not private document contents.`,
      });
    }
    if (reputation) {
      evidence.push({
        label: 'Reputation and calibration',
        value: `${reputation.eligible_player_count} scored player${reputation.eligible_player_count === 1 ? '' : 's'}`,
        detail: topReputationPlayer
          ? `Average calibration is ${formatScore(reputation.average_calibration_score)} using ${reputation.total_bets} public bet${reputation.total_bets === 1 ? '' : 's'}; top signal is ${topReputationPlayer.nickname} at ${formatScore(topReputationPlayer.calibration_score)}.`
          : `Average calibration is ${formatScore(reputation.average_calibration_score)} using ${reputation.total_bets} public bet${reputation.total_bets === 1 ? '' : 's'}.`,
      });
    }
  }

  return {
    status,
    headline: status === 'settled'
      ? `${roomCode} public recap: ${settlement?.winning_outcome.toUpperCase()} wins`
      : `${roomCode} public recap: live market`,
    summary: `Share-safe recap for ${house.address}. This view uses public room state, LMSR movement, draft-audit metadata, and settlement data; host-only event history and capability tokens are not included.`,
    highlights: [
      `${house.address} traded at ${formatProbability(overProbability)} OVER, implying ${formatMoney(impliedValue)} around the ${formatMoney(house.asking_price)} ask.`,
      `${players.length} player${players.length === 1 ? '' : 's'} generated ${market.total_trades} trade${market.total_trades === 1 ? '' : 's'} and ${formatMoney(market.total_wagered)} in simulation-credit volume.`,
      latestBets.length
        ? `Latest public movement: ${latestBets.map((bet) => `${bet.nickname || 'player'} ${String(bet.outcome).toUpperCase()} ${formatMoney(bet.wager)}`).join('; ')}.`
        : 'No public player bets are available in this recap yet.',
      settlementLine,
      reputationLine,
    ],
    evidence,
    guardrails: [
      'Balances, wagers, and payouts are simulation credits only.',
      'This recap is not a FairValue appraisal, investment product, or real-money market.',
      'Host-only event log is not included, and host tokens/user tokens are never shown here.',
      'Settlement evidence packets include public-safe metadata only, not private document contents.',
      'Reputation and calibration are single-room simulation signals, not professional rankings.',
      'No provider-backed comps were queried for this public recap.',
    ],
    timeline: buildTimeline(activity),
  };
}
