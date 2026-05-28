import type { ActivityEntry, House, Market, PlayerData } from '../types';
import { buyWithBudget, calculateImpliedPrice, executeBuy, type Outcome } from './lmsr';

export interface PlayerBetOutcomePreview {
  outcome: Outcome;
  shares: number;
  side_probability_after: number;
  side_probability_delta: number;
  implied_value_after: number;
  summary: string;
}

export interface PlayerBetPreview {
  headline: string;
  reason_to_believe: string;
  reason_to_doubt: string;
  balance_warning: string | null;
  provenance: string;
  outcomes: Record<Outcome, PlayerBetOutcomePreview>;
}

export interface PlayerBetPreviewInput {
  house: House;
  market: Market;
  player: PlayerData;
  wager: number;
  activity: ActivityEntry[];
}

function formatMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return 'Unavailable';
  return `$${Math.round(value).toLocaleString()}`;
}

function formatProbability(value: number) {
  if (!Number.isFinite(value)) return '50%';
  return `${Math.round(value * 100)}%`;
}

function formatSignedProbability(value: number) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.005) return 'flat';
  const sign = value > 0 ? '+' : '';
  return `${sign}${Math.round(value * 100)} pts`;
}

function recentBets(activity: ActivityEntry[]) {
  return activity
    .filter((entry) => entry.type === 'bet' && entry.outcome && typeof entry.wager === 'number')
    .slice(-3);
}

function effectiveWager(wager: number, balance: number) {
  const parsed = Number(wager);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(parsed, Math.max(0, balance));
}

function buildOutcomePreview(
  outcome: Outcome,
  input: PlayerBetPreviewInput,
  spend: number
): PlayerBetOutcomePreview {
  const { house, market } = input;
  const currentSideProbability = outcome === 'over' ? market.prob_over : market.prob_under;
  const shares = spend > 0
    ? buyWithBudget(outcome, spend, market.q_over, market.q_under, market.b)
    : 0;
  const execution = executeBuy(outcome, shares, market.q_over, market.q_under, market.b);
  const sideProbabilityAfter = outcome === 'over'
    ? execution.newProbOver
    : 1 - execution.newProbOver;
  const impliedValueAfter = calculateImpliedPrice(execution.newProbOver, house.asking_price);
  const delta = sideProbabilityAfter - currentSideProbability;
  const label = outcome.toUpperCase();

  return {
    outcome,
    shares,
    side_probability_after: sideProbabilityAfter,
    side_probability_delta: delta,
    implied_value_after: impliedValueAfter,
    summary: spend > 0
      ? `${label}: ~${shares.toFixed(1)} shares, ${formatProbability(sideProbabilityAfter)} ${label} after, ${formatSignedProbability(delta)}.`
      : `${label}: enter a wager to preview shares and probability movement.`,
  };
}

function buildReasonToBelieve(input: PlayerBetPreviewInput) {
  const { house, market, activity } = input;
  const overProbability = Number.isFinite(market.prob_over) ? market.prob_over : 0.5;
  const recent = recentBets(activity);

  if (market.total_trades === 0) {
    return `The room has not moved yet, so your first evidence-backed wager can set the opening signal around ${formatMoney(house.asking_price)}.`;
  }

  if (overProbability >= 0.57) {
    return `${formatProbability(overProbability)} of the room is pricing OVER, so backing OVER follows the current LMSR consensus if you trust the recent evidence.`;
  }

  if (overProbability <= 0.43) {
    return `${formatProbability(1 - overProbability)} of the room is pricing UNDER, so backing UNDER follows the current LMSR consensus if you trust the recent evidence.`;
  }

  if (recent.length > 0) {
    const latest = recent.at(-1);
    return `${latest?.nickname || 'A player'} just pushed ${String(latest?.outcome || '').toUpperCase()} with ${formatMoney(latest?.wager)}, so there is fresh movement to react to.`;
  }

  return 'The market is balanced, which makes a clear property fact or settlement clue more valuable than following momentum.';
}

function buildReasonToDoubt(input: PlayerBetPreviewInput) {
  const { market, activity } = input;
  const recent = recentBets(activity);
  const overProbability = Number.isFinite(market.prob_over) ? market.prob_over : 0.5;

  if (market.total_trades < 3) {
    return `${market.total_trades} trade${market.total_trades === 1 ? '' : 's'} is still thin liquidity; one player can move the room without proving the valuation.`;
  }

  const latestOutcomes = new Set(recent.map((entry) => String(entry.outcome).toLowerCase()));
  if (recent.length >= 2 && latestOutcomes.size === 1) {
    const side = String(recent[0].outcome || '').toUpperCase();
    return `Recent bets are all ${side}, so this may be herd momentum unless someone names the sale, appraisal, or comp evidence behind it.`;
  }

  if (overProbability >= 0.7 || overProbability <= 0.3) {
    return 'The room is leaning hard to one side; the opposing payout is tempting only if you can name the evidence the majority is missing.';
  }

  return 'Before betting, ask what settlement artifact would make your side wrong; FairValue is a simulation, not an appraisal.';
}

export function generatePlayerBetPreview(input: PlayerBetPreviewInput): PlayerBetPreview {
  const { house, market, player, wager } = input;
  const spend = effectiveWager(wager, player.balance);
  const overProbability = Number.isFinite(market.prob_over) ? market.prob_over : 0.5;
  const impliedValue = calculateImpliedPrice(overProbability, house.asking_price);
  const balanceWarning = wager > player.balance
    ? `Preview capped at your current ${formatMoney(player.balance)} balance.`
    : null;

  return {
    headline: `${formatProbability(overProbability)} OVER implies ${formatMoney(impliedValue)} around the ${formatMoney(house.asking_price)} ask.`,
    reason_to_believe: buildReasonToBelieve(input),
    reason_to_doubt: buildReasonToDoubt(input),
    balance_warning: balanceWarning,
    provenance: 'Local LMSR preview from room probability, wager size, recent room activity, and simulation-credit balance. No external comps were queried.',
    outcomes: {
      over: buildOutcomePreview('over', input, spend),
      under: buildOutcomePreview('under', input, spend),
    },
  };
}
