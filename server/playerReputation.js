const ROOM_REPUTATION_SCHEMA_VERSION = 'room-reputation/v1';
const ROOM_REPUTATION_SCORING_MODEL = 'single-room-brier-v1';

const REPUTATION_LIMITATIONS = Object.freeze([
  'Scores use only public room bet history, public bet reasoning counts, and the final settlement outcome.',
  'Single-room calibration is a small-sample simulation signal, not an appraisal, credit score, financial rating, or professional credential.',
  'Session IDs, host tokens, user tokens, and private evidence documents are not included in reputation summaries.',
]);

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return null;
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function roundMoney(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function clampProbability(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.5;
  return Math.max(0, Math.min(1, numeric));
}

function normalizeOutcome(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'over' || normalized === 'under' ? normalized : null;
}

function playerListFrom(players) {
  if (Array.isArray(players)) return players;
  return Object.values(players || {});
}

function resultMapFrom(results) {
  const map = new Map();
  for (const result of Array.isArray(results) ? results : []) {
    if (typeof result?.nickname === 'string' && result.nickname.trim()) {
      map.set(result.nickname.trim(), result);
    }
  }
  return map;
}

function reputationBadge(entry) {
  if (entry.bet_count === 0) return 'no_bets';
  if (entry.calibration_score >= 85 && entry.reason_count > 0) return 'well_calibrated_reasoner';
  if (entry.accuracy >= 0.75) return 'outcome_reader';
  if (entry.reason_count === entry.bet_count) return 'evidence_thesis';
  if (entry.correct_bets === 0) return 'learning_sample';
  return 'early_signal';
}

function createPlayerReputationEntry(player, winningOutcome, result) {
  const bets = Array.isArray(player?.bets) ? player.bets : [];
  const scoredBets = bets.map((bet) => {
    const outcome = normalizeOutcome(bet?.outcome);
    const resolved = winningOutcome && outcome === winningOutcome ? 1 : 0;
    const confidence = clampProbability(bet?.prob_at_entry);
    const wager = Number.isFinite(Number(bet?.wager)) ? Number(bet.wager) : 0;
    return {
      correct: resolved === 1,
      confidence,
      wager,
      hasReason: typeof bet?.reason === 'string' && bet.reason.trim().length > 0,
      brier: (confidence - resolved) ** 2,
    };
  });

  const betCount = scoredBets.length;
  const correctBets = scoredBets.filter((bet) => bet.correct).length;
  const totalWagered = scoredBets.reduce((sum, bet) => sum + bet.wager, 0);
  const winningWagered = scoredBets
    .filter((bet) => bet.correct)
    .reduce((sum, bet) => sum + bet.wager, 0);
  const brierTotal = scoredBets.reduce((sum, bet) => sum + bet.brier, 0);
  const confidenceTotal = scoredBets.reduce((sum, bet) => sum + bet.confidence, 0);
  const avgBrierScore = betCount > 0 ? brierTotal / betCount : null;

  const entry = {
    nickname: typeof player?.nickname === 'string' && player.nickname.trim() ? player.nickname.trim() : 'Player',
    bet_count: betCount,
    reason_count: scoredBets.filter((bet) => bet.hasReason).length,
    correct_bets: correctBets,
    incorrect_bets: betCount - correctBets,
    total_wagered: roundMoney(totalWagered),
    winning_wagered: roundMoney(winningWagered),
    accuracy: betCount > 0 ? round(correctBets / betCount) : null,
    average_entry_confidence: betCount > 0 ? round(confidenceTotal / betCount) : null,
    average_brier_score: avgBrierScore == null ? null : round(avgBrierScore),
    calibration_score: avgBrierScore == null ? null : Math.max(0, Math.min(100, Math.round((1 - avgBrierScore) * 100))),
    payout: roundMoney(Number(result?.payout) || 0),
    final_balance: roundMoney(Number.isFinite(Number(result?.final_balance)) ? Number(result.final_balance) : Number(player?.balance) || 0),
    badge: 'early_signal',
  };

  entry.badge = reputationBadge(entry);
  return entry;
}

function compareReputationEntries(a, b) {
  const aScore = Number.isFinite(a.calibration_score) ? a.calibration_score : -1;
  const bScore = Number.isFinite(b.calibration_score) ? b.calibration_score : -1;
  if (bScore !== aScore) return bScore - aScore;
  const aAccuracy = Number.isFinite(a.accuracy) ? a.accuracy : -1;
  const bAccuracy = Number.isFinite(b.accuracy) ? b.accuracy : -1;
  if (bAccuracy !== aAccuracy) return bAccuracy - aAccuracy;
  if (b.total_wagered !== a.total_wagered) return b.total_wagered - a.total_wagered;
  return a.nickname.localeCompare(b.nickname);
}

function leaderProjection(entry) {
  return {
    rank: entry.rank,
    nickname: entry.nickname,
    badge: entry.badge,
    bet_count: entry.bet_count,
    reason_count: entry.reason_count,
    accuracy: entry.accuracy,
    calibration_score: entry.calibration_score,
  };
}

function createRoomReputationSummary(players, settlement) {
  const winningOutcome = normalizeOutcome(settlement?.winning_outcome);
  const playerList = playerListFrom(players);
  const resultMap = resultMapFrom(settlement?.results);
  const entries = playerList
    .map((player) => {
      const nickname = typeof player?.nickname === 'string' ? player.nickname.trim() : player?.nickname;
      return createPlayerReputationEntry(player, winningOutcome, resultMap.get(nickname));
    })
    .sort(compareReputationEntries)
    .map((entry, index) => ({
      ...entry,
      rank: entry.bet_count > 0 ? index + 1 : null,
    }));

  const eligibleEntries = entries.filter((entry) => entry.bet_count > 0);
  const totalBets = eligibleEntries.reduce((sum, entry) => sum + entry.bet_count, 0);
  const totalReasons = eligibleEntries.reduce((sum, entry) => sum + entry.reason_count, 0);
  const correctBets = eligibleEntries.reduce((sum, entry) => sum + entry.correct_bets, 0);
  const weightedBrier = eligibleEntries.reduce((sum, entry) => sum + (entry.average_brier_score || 0) * entry.bet_count, 0);
  const weightedConfidence = eligibleEntries.reduce((sum, entry) => sum + (entry.average_entry_confidence || 0) * entry.bet_count, 0);
  const averageBrierScore = totalBets > 0 ? weightedBrier / totalBets : null;

  return {
    schema_version: ROOM_REPUTATION_SCHEMA_VERSION,
    scoring_model: ROOM_REPUTATION_SCORING_MODEL,
    status: winningOutcome ? 'settled' : 'unscored',
    winning_outcome: winningOutcome,
    player_count: entries.length,
    eligible_player_count: eligibleEntries.length,
    total_bets: totalBets,
    reason_count: totalReasons,
    correct_bets: correctBets,
    accuracy: totalBets > 0 ? round(correctBets / totalBets) : null,
    average_entry_confidence: totalBets > 0 ? round(weightedConfidence / totalBets) : null,
    average_brier_score: averageBrierScore == null ? null : round(averageBrierScore),
    average_calibration_score: averageBrierScore == null ? null : Math.max(0, Math.min(100, Math.round((1 - averageBrierScore) * 100))),
    top_players: eligibleEntries.slice(0, 3).map(leaderProjection),
    players: entries,
    limitations: [...REPUTATION_LIMITATIONS],
  };
}

function publicReputationProjection(summary) {
  if (!summary) return null;
  return {
    schema_version: summary.schema_version || ROOM_REPUTATION_SCHEMA_VERSION,
    scoring_model: summary.scoring_model || ROOM_REPUTATION_SCORING_MODEL,
    player_count: Number.isFinite(summary.player_count) ? summary.player_count : 0,
    eligible_player_count: Number.isFinite(summary.eligible_player_count) ? summary.eligible_player_count : 0,
    total_bets: Number.isFinite(summary.total_bets) ? summary.total_bets : 0,
    reason_count: Number.isFinite(summary.reason_count) ? summary.reason_count : 0,
    accuracy: Number.isFinite(summary.accuracy) ? summary.accuracy : null,
    average_brier_score: Number.isFinite(summary.average_brier_score) ? summary.average_brier_score : null,
    average_calibration_score: Number.isFinite(summary.average_calibration_score) ? summary.average_calibration_score : null,
    top_players: (Array.isArray(summary.top_players) ? summary.top_players : [])
      .slice(0, 3)
      .map((player) => ({
        rank: Number.isFinite(player.rank) ? player.rank : null,
        nickname: typeof player.nickname === 'string' && player.nickname.trim() ? player.nickname.trim() : 'Player',
        badge: typeof player.badge === 'string' ? player.badge : 'early_signal',
        bet_count: Number.isFinite(player.bet_count) ? player.bet_count : 0,
        reason_count: Number.isFinite(player.reason_count) ? player.reason_count : 0,
        accuracy: Number.isFinite(player.accuracy) ? player.accuracy : null,
        calibration_score: Number.isFinite(player.calibration_score) ? player.calibration_score : null,
      })),
  };
}

module.exports = {
  ROOM_REPUTATION_SCHEMA_VERSION,
  ROOM_REPUTATION_SCORING_MODEL,
  createRoomReputationSummary,
  publicReputationProjection,
};
