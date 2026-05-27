const OPERATOR_INCIDENT_REPLAY_REVIEW_SCHEMA_VERSION = 'fairvalue.operatorIncidentReplayReview.v1';

function objectCount(value) {
  if (!value || typeof value !== 'object') return 0;
  return Object.keys(value).length;
}

function publicCheck(check) {
  return {
    path: check.path,
    ok: Boolean(check.ok),
    replay_hash: check.replay_hash,
    live_hash: check.live_hash,
    replay_size_bytes: check.replay_size_bytes,
    live_size_bytes: check.live_size_bytes,
  };
}

function buildOperatorIncidentReplayReview({ incident, replay, integrityReport }) {
  const settlement = replay?.settlement || null;
  const evidencePacket = settlement?.evidence_packet || null;
  const activity = Array.isArray(replay?.activity) ? replay.activity : [];
  const lastActivity = activity.at(-1) || null;

  return {
    schema_version: OPERATOR_INCIDENT_REPLAY_REVIEW_SCHEMA_VERSION,
    incident_id: incident.incident_id,
    room_code: incident.room_code,
    incident_type: incident.incident_type,
    privacy_classification: 'operator_internal_redacted',
    replay_status: {
      ok: Boolean(integrityReport.ok),
      checked_at: integrityReport.checked_at,
      event_count: integrityReport.event_count,
      last_sequence: integrityReport.last_sequence,
      mismatch_count: integrityReport.mismatch_count,
      mismatches: integrityReport.mismatches.map(publicCheck),
    },
    replay_summary: {
      market_format: replay?.market_format || 'binary_over_under',
      settled: Boolean(replay?.settled),
      winning_outcome: settlement?.winning_outcome || null,
      settlement_evidence_status: evidencePacket?.status || 'missing',
      total_trades: Number(replay?.market?.total_trades) || 0,
      player_count: objectCount(replay?.players),
      activity_count: activity.length,
      room_phase: replay?.room_phase?.status || 'unknown',
      last_activity_type: lastActivity?.type || null,
    },
    checks: integrityReport.checks.map(publicCheck),
    limitations: [
      'Replay review is an operator-only redacted projection check, not moderation enforcement or settlement authority.',
      'The payload intentionally excludes host tokens, user tokens, raw private evidence documents, and private profile state.',
      'Hash matches prove the loaded event projection matches current room state; they do not prove external evidence truth.',
    ],
  };
}

module.exports = {
  OPERATOR_INCIDENT_REPLAY_REVIEW_SCHEMA_VERSION,
  buildOperatorIncidentReplayReview,
};
