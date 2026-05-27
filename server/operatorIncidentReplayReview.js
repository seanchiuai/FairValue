const crypto = require('crypto');

const OPERATOR_INCIDENT_REPLAY_REVIEW_SCHEMA_VERSION = 'fairvalue.operatorIncidentReplayReview.v1';
const EVENT_ROW_LIMIT = 25;

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

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(',')}}`;
}

function hashJson(value) {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function text(value, maxLength = 120) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength) || null;
}

function publicMarketConfig(config = {}) {
  if (!config || typeof config !== 'object') return null;
  return {
    schema_version: config.schema_version || null,
    market_format: config.market_format || null,
    threshold_price: Number.isFinite(config.threshold_price) ? config.threshold_price : null,
    band_low: Number.isFinite(config.band_low) ? config.band_low : null,
    band_high: Number.isFinite(config.band_high) ? config.band_high : null,
    yield_threshold: Number.isFinite(config.yield_threshold) ? config.yield_threshold : null,
    days_threshold: Number.isFinite(config.days_threshold) ? config.days_threshold : null,
    budget_threshold: Number.isFinite(config.budget_threshold) ? config.budget_threshold : null,
    baseline_median_price: Number.isFinite(config.baseline_median_price) ? config.baseline_median_price : null,
    price_momentum_threshold: Number.isFinite(config.price_momentum_threshold) ? config.price_momentum_threshold : null,
    comparison_window: text(config.comparison_window, 80),
    zip_code: text(config.zip_code, 20),
    outcome_count: Array.isArray(config.outcomes) ? config.outcomes.length : 0,
  };
}

function publicPlayer(player = {}) {
  const bets = Array.isArray(player.bets) ? player.bets : [];
  return {
    nickname: text(player.nickname, 40) || 'Player',
    connected: typeof player.connected === 'boolean' ? player.connected : null,
    bet_count: bets.length,
    balance: Number.isFinite(player.balance) ? Math.round(player.balance * 100) / 100 : null,
  };
}

function publicEvidencePacket(packet = {}) {
  if (!packet || typeof packet !== 'object') return null;
  return {
    status: packet.status || 'missing',
    item_count: Array.isArray(packet.items) ? packet.items.length : 0,
    summary_hash: packet.summary ? hashJson(text(packet.summary, 180)) : null,
  };
}

function eventPayloadKeys(payload = {}) {
  if (!payload || typeof payload !== 'object') return [];
  return Object.keys(payload)
    .filter((key) => !/(token|secret|session_id|user_id|authorization|cookie|password|api_key)/i.test(key))
    .sort();
}

function redactedPayloadForEvent(type, payload = {}) {
  switch (type) {
    case 'room_created':
      return {
        house: {
          address: text(payload.house?.address, 100),
          asking_price: Number.isFinite(payload.house?.asking_price) ? payload.house.asking_price : null,
        },
        market_format: payload.market_format || payload.draft_audit?.market_format || 'binary_over_under',
        market_config: publicMarketConfig(payload.market_config || payload.draft_audit?.market_config),
        room_phase: payload.room_phase?.status || null,
      };
    case 'player_joined':
    case 'reconnect':
      return {
        player: publicPlayer(payload.player || payload),
      };
    case 'player_left':
      return {
        source: text(payload.source, 80),
      };
    case 'bet_placed':
      return {
        nickname: text(payload.nickname || payload.player?.nickname, 40),
        outcome: payload.outcome || null,
        wager: Number.isFinite(payload.wager) ? payload.wager : null,
        reason_present: Boolean(text(payload.reason, 280)),
        reason_hash: payload.reason ? hashJson(text(payload.reason, 280)) : null,
        market_trade_count: Number(payload.market?.total_trades) || 0,
      };
    case 'ai_trade':
      return {
        outcome: payload.outcome || null,
        wager: Number.isFinite(payload.wager) ? payload.wager : null,
        market_trade_count: Number(payload.market?.total_trades) || 0,
      };
    case 'phase_changed':
      return {
        phase: payload.phase || null,
        room_phase: payload.room_phase?.status || null,
        betting_locked: typeof payload.room_phase?.betting_locked === 'boolean' ? payload.room_phase.betting_locked : null,
        ai_enabled: typeof payload.ai_enabled === 'boolean' ? payload.ai_enabled : null,
      };
    case 'settlement_completed': {
      const settlement = payload.settlement || {};
      return {
        winning_outcome: payload.winning_outcome || settlement.winning_outcome || null,
        actual_price: Number.isFinite(payload.actual_price) ? payload.actual_price : settlement.actual_price || null,
        future_median_price: Number.isFinite(settlement.future_median_price) ? settlement.future_median_price : null,
        evidence_packet: publicEvidencePacket(payload.evidence_packet || settlement.evidence_packet),
        result_count: Array.isArray(payload.results || settlement.results) ? (payload.results || settlement.results).length : 0,
        reputation_player_count: Number(settlement.reputation_summary?.player_count) || 0,
        room_phase: payload.room_phase?.status || null,
      };
    }
    case 'error':
      return {
        action: text(payload.action, 80),
        status: Number(payload.status) || null,
        message: text(payload.message, 160),
      };
    default:
      return {
        payload_key_count: eventPayloadKeys(payload).length,
      };
  }
}

function publicEventRow(event) {
  const payload = event?.payload && typeof event.payload === 'object' ? event.payload : {};
  const redactedPayload = redactedPayloadForEvent(event?.type, payload);
  return {
    sequence: Number(event?.sequence) || 0,
    event_id: text(event?.id, 100),
    type: event?.type || 'unknown',
    timestamp: Number.isFinite(event?.timestamp) ? event.timestamp : null,
    request_id_present: Boolean(event?.request_id),
    payload_keys: eventPayloadKeys(payload),
    summary: summarizeRedactedEventPayload(redactedPayload),
    redacted_payload_hash: hashJson(redactedPayload),
    redacted_payload: redactedPayload,
  };
}

function summarizeRedactedEventPayload(payload = {}) {
  const evidencePacket = payload.evidence_packet || null;
  return [
    payload.market_format ? String(payload.market_format).replace(/_/g, ' ') : '',
    payload.outcome ? `outcome ${String(payload.outcome).toUpperCase()}` : '',
    Number.isFinite(payload.wager) ? `wager $${Number(payload.wager).toLocaleString()}` : '',
    payload.winning_outcome ? `winner ${String(payload.winning_outcome).toUpperCase()}` : '',
    Number.isFinite(payload.actual_price) ? `value $${Number(payload.actual_price).toLocaleString()}` : '',
    Number.isFinite(payload.future_median_price) ? `future median $${Number(payload.future_median_price).toLocaleString()}` : '',
    evidencePacket?.status ? `evidence ${String(evidencePacket.status).replace(/_/g, ' ')}` : '',
    payload.room_phase ? `phase ${String(payload.room_phase).replace(/_/g, ' ')}` : '',
    payload.phase ? `phase ${String(payload.phase).replace(/_/g, ' ')}` : '',
    payload.action ? `action ${String(payload.action).replace(/_/g, ' ')}` : '',
  ].filter(Boolean).join(' - ') || 'Redacted payload hash only';
}

function buildOperatorIncidentReplayReview({ incident, replay, integrityReport, events = [] }) {
  const settlement = replay?.settlement || null;
  const evidencePacket = settlement?.evidence_packet || null;
  const activity = Array.isArray(replay?.activity) ? replay.activity : [];
  const lastActivity = activity.at(-1) || null;
  const canonicalEvents = Array.isArray(events) ? events : [];
  const eventRows = canonicalEvents.slice(-EVENT_ROW_LIMIT).map(publicEventRow);

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
    event_rows: eventRows,
    event_rows_meta: {
      returned_count: eventRows.length,
      total_count: canonicalEvents.length,
      limit: EVENT_ROW_LIMIT,
      truncated: canonicalEvents.length > EVENT_ROW_LIMIT,
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
