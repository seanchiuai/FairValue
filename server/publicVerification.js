const crypto = require('crypto');
const { createReplayIntegrityReport } = require('./replayIntegrity');
const { normalizeRoomPhase, replayRoomEvents } = require('./roomEventLog');
const { publicReputationProjection } = require('./playerReputation');
const { getPublicRoomMarketState, marketConfigPayload } = require('./roomMarketRuntime');

const DEFAULT_IDENTITY_SECRET = 'fairvalue-local-dev-identity-secret';
const SIGNED_SCHEMA_VERSION = 'public-room-verification/v1';

function cloneJson(value) {
  if (value == null) return value;
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

function hashJson(value) {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function publicActivityProjection(activity) {
  return (activity || []).map((entry) => ({
    type: entry.type,
    nickname: entry.nickname || null,
    outcome: entry.outcome || null,
    wager: typeof entry.wager === 'number' ? entry.wager : null,
    reason: typeof entry.reason === 'string' && entry.reason.trim() ? entry.reason.trim() : null,
    actual_price: typeof entry.actual_price === 'number' ? entry.actual_price : null,
    winning_outcome: entry.winning_outcome || null,
    phase_status: entry.phase_status || null,
    phase_label: entry.phase_label || null,
    betting_locked: typeof entry.betting_locked === 'boolean' ? entry.betting_locked : null,
    timer_ends_at: typeof entry.timer_ends_at === 'number' ? entry.timer_ends_at : null,
    event_sequence: typeof entry.event_sequence === 'number' ? entry.event_sequence : null,
    timestamp: typeof entry.timestamp === 'number' ? entry.timestamp : null,
  }));
}

function publicPlayerProjection(players) {
  return Object.values(players || {})
    .map((player) => {
      const bets = Array.isArray(player.bets) ? player.bets : [];
      return {
        nickname: player.nickname || 'Player',
        balance: typeof player.balance === 'number' ? player.balance : null,
        bet_count: bets.length,
        reason_count: bets.filter((bet) => typeof bet.reason === 'string' && bet.reason.trim()).length,
        total_wagered: bets.reduce((sum, bet) => sum + (Number.isFinite(bet.wager) ? bet.wager : 0), 0),
        over_bets: bets.filter((bet) => bet.outcome === 'over').length,
        under_bets: bets.filter((bet) => bet.outcome === 'under').length,
        outcome_counts: bets.reduce((counts, bet) => {
          const outcome = String(bet.outcome || '').trim().toLowerCase();
          if (outcome) counts[outcome] = (counts[outcome] || 0) + 1;
          return counts;
        }, {}),
      };
    })
    .sort((a, b) => a.nickname.localeCompare(b.nickname));
}

function publicSettlementProjection(settlement) {
  if (!settlement) return null;
  const results = Array.isArray(settlement.results) ? settlement.results : [];
  const reputationSummary = publicReputationProjection(settlement.reputation_summary);
  return {
    winning_outcome: settlement.winning_outcome,
    actual_price: settlement.actual_price,
    settlement_price: Number.isFinite(settlement.settlement_price) ? settlement.settlement_price : null,
    annual_rent: Number.isFinite(settlement.annual_rent) ? settlement.annual_rent : null,
    rent_yield: Number.isFinite(settlement.rent_yield) ? settlement.rent_yield : null,
    verified_cost: Number.isFinite(settlement.verified_cost) ? settlement.verified_cost : null,
    budget_threshold: Number.isFinite(settlement.budget_threshold) ? settlement.budget_threshold : null,
    days_on_market: Number.isFinite(settlement.days_on_market) ? settlement.days_on_market : null,
    days_threshold: Number.isFinite(settlement.days_threshold) ? settlement.days_threshold : null,
    result_count: results.length,
    total_positive_payout: results.reduce((sum, result) => sum + Math.max(0, Number(result.payout) || 0), 0),
    evidence_packet: settlement.evidence_packet ? cloneJson(settlement.evidence_packet) : null,
    reputation_summary: reputationSummary,
  };
}

function publicLiveProjection(room) {
  return {
    room_code: room.code,
    house: cloneJson(room.house),
    draft_audit: room.draftAudit ? cloneJson(room.draftAudit) : null,
    market_format: room.marketFormat || 'binary_over_under',
    market_config: marketConfigPayload(room),
    market: getPublicRoomMarketState(room),
    players: publicPlayerProjection(room.players),
    activity: publicActivityProjection(room.activity),
    room_phase: normalizeRoomPhase(room.phase),
    settled: Boolean(room.settled),
    settlement: publicSettlementProjection(room.settlement),
  };
}

function publicReplayProjection(replay) {
  return {
    room_code: replay.room_code,
    house: replay.house,
    draft_audit: replay.draft_audit,
    market_format: replay.market_format || 'binary_over_under',
    market_config: replay.market_config || null,
    market: replay.market,
    players: publicPlayerProjection(replay.players),
    activity: publicActivityProjection(replay.activity),
    room_phase: replay.room_phase,
    settled: Boolean(replay.settled),
    settlement: publicSettlementProjection(replay.settlement),
  };
}

function resolveSigningSecret(env = process.env) {
  const explicitSecret = String(env.FAIRVALUE_PUBLIC_VERIFICATION_SECRET || '').trim();
  if (explicitSecret) {
    return {
      secret: explicitSecret,
      key_hint: 'FAIRVALUE_PUBLIC_VERIFICATION_SECRET',
    };
  }

  const identitySecret = String(env.FAIRVALUE_IDENTITY_SECRET || '').trim();
  if (identitySecret && identitySecret !== DEFAULT_IDENTITY_SECRET) {
    return {
      secret: identitySecret,
      key_hint: 'FAIRVALUE_IDENTITY_SECRET',
    };
  }

  return null;
}

function attachSignature(artifact, env = process.env) {
  const payloadHash = hashJson(artifact);
  const signingSecret = resolveSigningSecret(env);
  if (!signingSecret) {
    return {
      ...artifact,
      signature: {
        status: 'unsigned_local',
        algorithm: null,
        key_hint: null,
        payload_hash: payloadHash,
        value: null,
        reason: 'Set FAIRVALUE_PUBLIC_VERIFICATION_SECRET to emit signed public verification artifacts.',
      },
    };
  }

  return {
    ...artifact,
    signature: {
      status: 'signed',
      algorithm: 'HMAC-SHA256',
      key_hint: signingSecret.key_hint,
      payload_hash: payloadHash,
      value: crypto.createHmac('sha256', signingSecret.secret).update(stableJson(artifact)).digest('hex'),
    },
  };
}

function verificationPayload(artifact) {
  const { signature, ...payload } = artifact || {};
  return payload;
}

function verifyPublicVerificationArtifactSignature(artifact, secret) {
  const signingSecret = String(secret || '').trim();
  if (!artifact?.signature || artifact.signature.status !== 'signed' || !signingSecret) {
    return false;
  }

  const payload = verificationPayload(artifact);
  const payloadHash = hashJson(payload);
  const expectedValue = crypto.createHmac('sha256', signingSecret).update(stableJson(payload)).digest('hex');
  return artifact.signature.payload_hash === payloadHash && artifact.signature.value === expectedValue;
}

function createPublicVerificationArtifact(room, events, options = {}) {
  const replay = replayRoomEvents(events);
  const integrityReport = options.integrityReport || createReplayIntegrityReport(room, events);
  const liveProjection = publicLiveProjection(room);
  const replayProjection = publicReplayProjection(replay);
  const settlement = room.settlement || replay.settlement || null;
  const evidencePacket = settlement?.evidence_packet || null;
  const evidencePacketHash = evidencePacket ? hashJson(evidencePacket) : null;

  const artifact = {
    schema_version: SIGNED_SCHEMA_VERSION,
    room_code: room.code,
    generated_at: options.generatedAt || new Date().toISOString(),
    status: !room.settled ? 'unsettled' : integrityReport.ok ? 'verified' : 'replay_mismatch',
    settled: Boolean(room.settled),
    event_stream: {
      event_count: events.length,
      last_sequence: events.at(-1)?.sequence || 0,
    },
    replay: {
      live_match: Boolean(integrityReport.ok),
      mismatch_count: integrityReport.mismatch_count,
      replay_hash: hashJson(replayProjection),
      live_hash: hashJson(liveProjection),
    },
    settlement: settlement
      ? {
        winning_outcome: settlement.winning_outcome,
        actual_price: settlement.actual_price,
        settlement_price: Number.isFinite(settlement.settlement_price) ? settlement.settlement_price : null,
        annual_rent: Number.isFinite(settlement.annual_rent) ? settlement.annual_rent : null,
        rent_yield: Number.isFinite(settlement.rent_yield) ? settlement.rent_yield : null,
        verified_cost: Number.isFinite(settlement.verified_cost) ? settlement.verified_cost : null,
        budget_threshold: Number.isFinite(settlement.budget_threshold) ? settlement.budget_threshold : null,
        days_on_market: Number.isFinite(settlement.days_on_market) ? settlement.days_on_market : null,
        days_threshold: Number.isFinite(settlement.days_threshold) ? settlement.days_threshold : null,
        evidence_packet_status: evidencePacket?.status || 'missing',
        evidence_packet_hash: evidencePacketHash,
        evidence_item_count: Array.isArray(evidencePacket?.items) ? evidencePacket.items.length : 0,
        reputation_schema_version: settlement.reputation_summary?.schema_version || null,
        reputation_player_count: Number.isFinite(settlement.reputation_summary?.player_count)
          ? settlement.reputation_summary.player_count
          : 0,
        reputation_eligible_player_count: Number.isFinite(settlement.reputation_summary?.eligible_player_count)
          ? settlement.reputation_summary.eligible_player_count
          : 0,
        reputation_average_calibration_score: Number.isFinite(settlement.reputation_summary?.average_calibration_score)
          ? settlement.reputation_summary.average_calibration_score
          : null,
        reputation_top_players: publicReputationProjection(settlement.reputation_summary)?.top_players || [],
      }
      : null,
    public_recap: {
      digest_hash: hashJson({
        room_code: room.code,
        house: liveProjection.house,
        market: liveProjection.market,
        player_count: liveProjection.players.length,
        activity_count: liveProjection.activity.length,
        settlement: liveProjection.settlement,
        evidence_packet_hash: evidencePacketHash,
      }),
      source: 'Public room state plus canonical event replay.',
    },
    trust_limitations: [
      'This artifact proves public hashes, counts, replay parity, and settlement metadata only.',
      'It does not expose host tokens, user tokens, player session IDs, private evidence documents, or host-only event logs.',
      'FairValue settlement artifacts are simulation-credit records and are not appraisals, brokerage records, lending decisions, or investment advice.',
      'A signed artifact requires FAIRVALUE_PUBLIC_VERIFICATION_SECRET or a non-default FAIRVALUE_IDENTITY_SECRET.',
    ],
  };

  return attachSignature(artifact, options.env || process.env);
}

module.exports = {
  createPublicVerificationArtifact,
  hashJson,
  publicLiveProjection,
  publicReplayProjection,
  resolveSigningSecret,
  verifyPublicVerificationArtifactSignature,
};
