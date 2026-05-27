const crypto = require('crypto');
const { normalizeRoomPhase, replayRoomEvents } = require('./roomEventLog');
const { getPublicMarketState } = require('../src/lib/marketEngine');

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      result[key] = sortJson(value[key]);
      return result;
    }, {});
}

function stableJson(value) {
  return JSON.stringify(sortJson(value));
}

function projectionHash(value) {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex').slice(0, 16);
}

function projectionSize(value) {
  return Buffer.byteLength(stableJson(value));
}

function sortedPlayers(players) {
  return Object.values(players || {})
    .map((player) => cloneJson(player))
    .sort((a, b) => String(a.session_id || '').localeCompare(String(b.session_id || '')));
}

function createReplayIntegrityReport(room, events) {
  const replay = replayRoomEvents(events);
  const liveProjection = {
    room_code: room.code,
    house: cloneJson(room.house),
    draft_audit: room.draftAudit ? cloneJson(room.draftAudit) : null,
    market: getPublicMarketState(room.market),
    players: sortedPlayers(room.players),
    activity: cloneJson(room.activity || []),
    room_phase: normalizeRoomPhase(room.phase),
    ai_enabled: Boolean(room.aiEnabled),
    settled: Boolean(room.settled),
    settlement: room.settlement ? cloneJson(room.settlement) : null,
  };
  const replayProjection = {
    room_code: replay.room_code,
    house: replay.house,
    draft_audit: replay.draft_audit,
    market: replay.market,
    players: sortedPlayers(replay.players),
    activity: replay.activity,
    room_phase: replay.room_phase,
    ai_enabled: Boolean(replay.ai_enabled),
    settled: Boolean(replay.settled),
    settlement: replay.settlement,
  };

  const checks = Object.keys(liveProjection).map((pathName) => {
    const replayValue = replayProjection[pathName];
    const liveValue = liveProjection[pathName];
    const replayHash = projectionHash(replayValue);
    const liveHash = projectionHash(liveValue);
    return {
      path: pathName,
      ok: replayHash === liveHash,
      replay_hash: replayHash,
      live_hash: liveHash,
      replay_size_bytes: projectionSize(replayValue),
      live_size_bytes: projectionSize(liveValue),
    };
  });
  const mismatches = checks.filter((check) => !check.ok);

  return {
    room_code: room.code,
    ok: mismatches.length === 0,
    checked_at: new Date().toISOString(),
    event_count: events.length,
    last_sequence: events.at(-1)?.sequence || 0,
    checks,
    mismatch_count: mismatches.length,
    mismatches,
  };
}

module.exports = {
  createReplayIntegrityReport,
  projectionHash,
};
