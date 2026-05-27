const crypto = require('crypto');

const OPERATOR_INCIDENT_QUEUE_SCHEMA_VERSION = 'fairvalue.operatorIncidentQueue.v1';
const SEVERITIES = ['critical', 'high', 'medium', 'low'];

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function hashId(parts) {
  return crypto.createHash('sha256').update(parts.map((part) => String(part || '')).join('|')).digest('hex').slice(0, 24);
}

function sanitizeRoomCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function sanitizeText(value, maxLength = 220) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function lastEventSequence(events = []) {
  return events.reduce((max, event) => Math.max(max, Number(event?.sequence) || 0), 0);
}

function reasonedBetSides(activity = []) {
  const sides = new Set();
  for (const entry of activity) {
    if (entry?.type !== 'bet' || !entry.reason) continue;
    const outcome = sanitizeText(entry.outcome, 40).toLowerCase();
    if (outcome) sides.add(outcome);
  }
  return sides;
}

function evidence(label, value, detail) {
  return {
    label,
    value: value == null ? 'Unavailable' : String(value).slice(0, 120),
    detail: sanitizeText(detail, 260),
  };
}

function createIncident({ room, events, incidentType, severity, title, summary, evidenceItems, recommendedActions }) {
  const roomCode = sanitizeRoomCode(room?.code);
  const sequence = lastEventSequence(events);
  return {
    incident_id: `opinc_${hashId([roomCode, incidentType, severity, sequence, title])}`,
    room_code: roomCode,
    incident_type: incidentType,
    severity,
    status: 'open',
    title: sanitizeText(title, 140),
    summary: sanitizeText(summary, 320),
    evidence: evidenceItems,
    recommended_actions: recommendedActions.map((action) => sanitizeText(action, 220)).filter(Boolean),
    last_event_sequence: sequence,
    privacy_classification: 'operator_internal_redacted',
    source: 'live_room_review_projection',
    limitations: [
      'Deterministic local triage only; not legal, appraisal, arbitration, fraud, or compliance authority.',
      'Incidents are derived from redacted room/review state and do not include host tokens, user tokens, or raw private evidence.',
    ],
  };
}

function incidentsForRoom(room, events = []) {
  const incidents = [];
  const roomCode = sanitizeRoomCode(room?.code);
  const settlement = room?.settlement || null;
  const evidencePacket = settlement?.evidence_packet || null;
  const hasExternalEvidenceMetadata = evidencePacket && evidencePacket.status !== 'host_attested';
  const phase = room?.phase || {};
  const activity = room?.activity || [];
  const reasonSides = reasonedBetSides(activity);

  if (room?.durabilityError) {
    incidents.push(createIncident({
      room,
      events,
      incidentType: 'durability_failure',
      severity: 'critical',
      title: `${roomCode} has a room durability failure`,
      summary: `Room persistence or event-log durability reported ${sanitizeText(room.durabilityError.action, 80) || 'an action'} failure.`,
      evidenceItems: [
        evidence('Action', room.durabilityError.action, 'The room recorded a durability failure action.'),
        evidence('Error', room.durabilityError.error, 'The public-safe durability error category.'),
      ],
      recommendedActions: [
        'Pause host-critical actions for this room until persistence is healthy.',
        'Inspect backend persistence logs using the request time and room code.',
        'Export public-safe replay artifacts only after the durability error clears.',
      ],
    }));
  }

  if (room?.settled && !hasExternalEvidenceMetadata) {
    incidents.push(createIncident({
      room,
      events,
      incidentType: 'settlement_packet_missing',
      severity: 'high',
      title: `${roomCode} settled without external evidence metadata`,
      summary: 'The room is settled, but the operator review only has host-attested settlement evidence.',
      evidenceItems: [
        evidence('Winning outcome', settlement?.winning_outcome, 'Settlement exists without external public-safe evidence metadata.'),
        evidence('Packet status', evidencePacket?.status || 'missing', 'Host-attested default packets still need operator review.'),
        evidence('Activity items', activity.length, 'Room activity is available for context, not as external proof.'),
      ],
      recommendedActions: [
        'Ask the host to attach public-safe external settlement evidence metadata.',
        'Compare the final outcome with replay/public verification before sharing.',
        'Keep the recap limited while evidence is host-attested only.',
      ],
    }));
  }

  if (!room?.settled && (phase.status === 'locked' || phase.betting_locked)) {
    incidents.push(createIncident({
      room,
      events,
      incidentType: 'locked_unsettled_room',
      severity: 'medium',
      title: `${roomCode} is locked but not settled`,
      summary: 'Betting appears locked while the room still needs settlement or reopening.',
      evidenceItems: [
        evidence('Phase', phase.status || 'unknown', 'Current canonical room phase.'),
        evidence('Betting locked', Boolean(phase.betting_locked), 'Server-side betting lock status.'),
      ],
      recommendedActions: [
        'Confirm whether the host intends to settle or reopen discussion.',
        'Review room events before allowing more betting.',
      ],
    }));
  }

  if (!events.length) {
    incidents.push(createIncident({
      room,
      events,
      incidentType: 'event_log_missing',
      severity: room?.settled ? 'medium' : 'low',
      title: `${roomCode} has no loaded canonical event log`,
      summary: 'Operator review would fall back to public room state because no canonical events are loaded.',
      evidenceItems: [
        evidence('Event count', 0, 'No host-review event log entries are currently loaded.'),
      ],
      recommendedActions: [
        'Load or restore the canonical event journal before making operator decisions.',
        'Treat review output as a preview until event history is available.',
      ],
    }));
  }

  if (!room?.settled && reasonSides.size >= 2) {
    incidents.push(createIncident({
      room,
      events,
      incidentType: 'dispute_review_ready',
      severity: 'low',
      title: `${roomCode} has public reasons on multiple sides`,
      summary: 'Both sides have at least one public bet reason, so the room is ready for a structured dispute prompt.',
      evidenceItems: [
        evidence('Reasoned sides', Array.from(reasonSides).sort().join(', '), 'Public bet reasons are available on multiple outcomes.'),
      ],
      recommendedActions: [
        'Use the operator review dispute questions before settlement.',
        'Ask each side for the strongest public-safe evidence they would accept.',
      ],
    }));
  }

  return incidents;
}

function summarize(incidents) {
  const summary = {
    total: incidents.length,
    by_severity: {},
    by_type: {},
  };
  for (const severity of SEVERITIES) summary.by_severity[severity] = 0;
  for (const incident of incidents) {
    summary.by_severity[incident.severity] = (summary.by_severity[incident.severity] || 0) + 1;
    summary.by_type[incident.incident_type] = (summary.by_type[incident.incident_type] || 0) + 1;
  }
  return summary;
}

function buildOperatorIncidentQueue({ rooms = {}, roomEventsByCode = () => [], filters = {}, nowSeconds = null } = {}) {
  const severityFilter = sanitizeText(filters.severity, 40).toLowerCase();
  const roomCodeFilter = sanitizeRoomCode(filters.room_code || filters.roomCode);
  const limit = Math.max(1, Math.min(Math.floor(Number(filters.limit) || 100), 250));
  const generatedAt = Number.isFinite(Number(nowSeconds)) && Number(nowSeconds) > 0
    ? Math.floor(Number(nowSeconds))
    : Math.floor(Date.now() / 1000);
  const roomList = Array.isArray(rooms) ? rooms : Object.values(rooms || {});
  let incidents = [];
  for (const room of roomList) {
    const roomCode = sanitizeRoomCode(room?.code);
    if (!roomCode) continue;
    if (roomCodeFilter && roomCode !== roomCodeFilter) continue;
    const events = roomEventsByCode(roomCode) || [];
    incidents = incidents.concat(incidentsForRoom(room, events));
  }
  if (severityFilter) {
    incidents = incidents.filter((incident) => incident.severity === severityFilter);
  }
  incidents.sort((left, right) =>
    SEVERITIES.indexOf(left.severity) - SEVERITIES.indexOf(right.severity) ||
    right.last_event_sequence - left.last_event_sequence ||
    left.room_code.localeCompare(right.room_code) ||
    left.incident_type.localeCompare(right.incident_type)
  );
  const limited = incidents.slice(0, limit);
  return {
    schema_version: OPERATOR_INCIDENT_QUEUE_SCHEMA_VERSION,
    generated_at: generatedAt,
    filters: {
      room_code: roomCodeFilter || null,
      severity: severityFilter || null,
      limit,
    },
    count: limited.length,
    total_matches: incidents.length,
    summary: summarize(incidents),
    incidents: cloneJson(limited),
    limitations: [
      'Operator incidents are deterministic triage hints derived from current in-process room state and loaded event logs.',
      'They are not moderation enforcement, arbitration, legal advice, appraisal authority, fraud findings, or compliance review.',
      'The queue is redacted and intentionally excludes host tokens, user tokens, private profile state, and raw evidence documents.',
    ],
  };
}

module.exports = {
  OPERATOR_INCIDENT_QUEUE_SCHEMA_VERSION,
  buildOperatorIncidentQueue,
};
