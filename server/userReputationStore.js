const fs = require('fs');
const path = require('path');

const USER_REPUTATION_SCHEMA_VERSION = 'fairvalue.userReputation.v1';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return null;
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function roundMoney(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function emptyState() {
  return {
    schema_version: USER_REPUTATION_SCHEMA_VERSION,
    users: {},
  };
}

function safeNickname(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 40) : 'Player';
}

function scorePlayerRoom(player, settlement, room, userId, settledAt) {
  const bets = Array.isArray(player?.bets) ? player.bets : [];
  const winningOutcome = String(settlement?.winning_outcome || '').trim().toLowerCase();
  const scoredBets = bets.map((bet) => {
    const outcome = String(bet?.outcome || '').trim().toLowerCase();
    const correct = Boolean(winningOutcome && outcome === winningOutcome);
    const confidence = Math.max(0, Math.min(1, Number(bet?.prob_at_entry) || 0.5));
    return {
      correct,
      wager: Number.isFinite(Number(bet?.wager)) ? Number(bet.wager) : 0,
      reason: typeof bet?.reason === 'string' && bet.reason.trim() ? bet.reason.trim() : null,
      brier: (confidence - (correct ? 1 : 0)) ** 2,
    };
  });
  const betCount = scoredBets.length;
  const correctBets = scoredBets.filter((bet) => bet.correct).length;
  const reasonCount = scoredBets.filter((bet) => bet.reason).length;
  const totalWagered = scoredBets.reduce((sum, bet) => sum + bet.wager, 0);
  const payout = bets.reduce((sum, bet) => {
    const outcome = String(bet?.outcome || '').trim().toLowerCase();
    return outcome === winningOutcome ? sum + (Number(bet?.shares) || 0) : sum;
  }, 0);
  const brierTotal = scoredBets.reduce((sum, bet) => sum + bet.brier, 0);
  const averageBrierScore = betCount > 0 ? brierTotal / betCount : null;

  return {
    room_code: room.code,
    market_format: room.marketFormat || room.market_format || 'binary_over_under',
    settled_at: settledAt,
    nickname: safeNickname(player?.nickname),
    winning_outcome: winningOutcome || null,
    bet_count: betCount,
    correct_bets: correctBets,
    reason_count: reasonCount,
    total_wagered: roundMoney(totalWagered),
    payout: roundMoney(payout),
    average_brier_score: averageBrierScore == null ? null : round(averageBrierScore),
    calibration_score: averageBrierScore == null
      ? null
      : Math.max(0, Math.min(100, Math.round((1 - averageBrierScore) * 100))),
    user_id: userId,
  };
}

function aggregateUser(user) {
  const rooms = Object.values(user.rooms || {});
  const eligibleRooms = rooms.filter((room) => room.bet_count > 0);
  const totalBets = eligibleRooms.reduce((sum, room) => sum + room.bet_count, 0);
  const correctBets = eligibleRooms.reduce((sum, room) => sum + room.correct_bets, 0);
  const reasonCount = eligibleRooms.reduce((sum, room) => sum + room.reason_count, 0);
  const totalWagered = eligibleRooms.reduce((sum, room) => sum + room.total_wagered, 0);
  const totalPayout = eligibleRooms.reduce((sum, room) => sum + room.payout, 0);
  const weightedBrier = eligibleRooms.reduce(
    (sum, room) => sum + (Number.isFinite(room.average_brier_score) ? room.average_brier_score : 0) * room.bet_count,
    0
  );
  const marketFormats = eligibleRooms.reduce((counts, room) => {
    counts[room.market_format] = (counts[room.market_format] || 0) + 1;
    return counts;
  }, {});
  const averageBrierScore = totalBets > 0 ? weightedBrier / totalBets : null;
  const recentRooms = [...eligibleRooms]
    .sort((a, b) => (b.settled_at || 0) - (a.settled_at || 0))
    .slice(0, 12)
    .map(({ user_id, ...room }) => cloneJson(room));

  return {
    schema_version: USER_REPUTATION_SCHEMA_VERSION,
    user_id: user.user_id,
    nickname: user.nickname || 'Player',
    rooms_played: eligibleRooms.length,
    total_bets: totalBets,
    correct_bets: correctBets,
    accuracy: totalBets > 0 ? round(correctBets / totalBets) : null,
    reason_count: reasonCount,
    total_wagered: roundMoney(totalWagered),
    total_payout: roundMoney(totalPayout),
    average_brier_score: averageBrierScore == null ? null : round(averageBrierScore),
    average_calibration_score: averageBrierScore == null
      ? null
      : Math.max(0, Math.min(100, Math.round((1 - averageBrierScore) * 100))),
    market_formats: marketFormats,
    last_settled_at: recentRooms[0]?.settled_at || null,
    recent_rooms: recentRooms,
    limitations: [
      'This reputation is aggregated from FairValue simulation-credit rooms only.',
      'It is not an appraisal credential, credit score, investment rating, or professional certification.',
      'Private player session IDs, host tokens, user tokens, and raw evidence documents are not included.',
    ],
  };
}

function normalizeState(raw) {
  const state = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const users = {};
  for (const [userId, user] of Object.entries(state.users || {})) {
    if (!userId || !user || typeof user !== 'object') continue;
    users[userId] = {
      user_id: userId,
      nickname: safeNickname(user.nickname),
      rooms: user.rooms && typeof user.rooms === 'object' && !Array.isArray(user.rooms)
        ? cloneJson(user.rooms)
        : {},
    };
  }
  return {
    schema_version: USER_REPUTATION_SCHEMA_VERSION,
    users,
  };
}

function createUserReputationStore({ filePath = null } = {}) {
  let state = emptyState();

  function load() {
    if (!filePath) return state;
    try {
      if (!fs.existsSync(filePath)) {
        state = emptyState();
        return state;
      }
      state = normalizeState(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } catch {
      state = emptyState();
    }
    return state;
  }

  function save() {
    if (!filePath) return;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`);
    fs.renameSync(tempPath, filePath);
  }

  function clear() {
    state = emptyState();
    if (filePath && fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
  }

  function recordRoomSettlement(room, { settledAt = Date.now() / 1000 } = {}) {
    const settlement = room?.settlement;
    if (!room?.code || !settlement) return [];
    const players = Object.values(room.players || {});
    const updated = [];
    for (const player of players) {
      const userId = room.userIdsBySession?.[player.session_id];
      if (!userId) continue;
      const roomScore = scorePlayerRoom(player, settlement, room, userId, settledAt);
      const user = state.users[userId] || { user_id: userId, nickname: roomScore.nickname, rooms: {} };
      user.nickname = roomScore.nickname;
      user.rooms[room.code] = roomScore;
      state.users[userId] = user;
      updated.push(aggregateUser(user));
    }
    if (updated.length) save();
    return updated;
  }

  function getUser(userId) {
    const user = state.users[userId];
    if (!user) {
      return aggregateUser({ user_id: userId, nickname: 'Player', rooms: {} });
    }
    return aggregateUser(user);
  }

  load();

  return {
    kind: filePath ? 'json-user-reputation' : 'memory-user-reputation',
    filePath,
    load,
    save,
    clear,
    recordRoomSettlement,
    getUser,
    rawState: () => cloneJson(state),
  };
}

module.exports = {
  USER_REPUTATION_SCHEMA_VERSION,
  createUserReputationStore,
};
