const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OPERATOR_INCIDENT_WORKFLOW_SCHEMA_VERSION = 'fairvalue.operatorIncidentWorkflow.v1';
const INCIDENT_ID_PATTERN = /^opinc_[a-f0-9]{24}$/;
const TIMELINE_ID_PATTERN = /^opitl_[a-f0-9]{24}$/;
const WORKFLOW_STATUSES = new Set(['open', 'investigating', 'waiting_on_host', 'resolved', 'dismissed']);
const TIMELINE_ACTIONS = new Set(['status_changed', 'assignment_changed', 'note_added', 'touched']);
const MAX_TIMELINE_ENTRIES = 25;

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function emptyState() {
  return {
    schema_version: OPERATOR_INCIDENT_WORKFLOW_SCHEMA_VERSION,
    incidents: {},
  };
}

function hashId(parts) {
  return crypto.createHash('sha256').update(parts.map((part) => String(part || '')).join('|')).digest('hex').slice(0, 24);
}

function sanitizeIncidentId(value) {
  const incidentId = typeof value === 'string' ? value.trim() : '';
  return INCIDENT_ID_PATTERN.test(incidentId) ? incidentId : null;
}

function sanitizeTimelineId(value) {
  const timelineId = typeof value === 'string' ? value.trim() : '';
  return TIMELINE_ID_PATTERN.test(timelineId) ? timelineId : null;
}

function sanitizeRoomCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || null;
}

function sanitizeIncidentType(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_:-]/g, '').slice(0, 80) || 'unknown';
}

function sanitizeStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  return WORKFLOW_STATUSES.has(status) ? status : null;
}

function sanitizeTimestamp(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : null;
}

function redactSensitiveText(value) {
  return String(value || '')
    .replace(/\bfv1\.[A-Za-z0-9._:-]+/g, '[redacted-token]')
    .replace(/\b(host|user|ops)[_-]?token\s*[:=]\s*\S+/gi, '$1_token=[redacted-token]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[redacted-token]');
}

function sanitizeText(value, maxLength = 320) {
  if (typeof value !== 'string') return null;
  const text = redactSensitiveText(value)
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
  return text || null;
}

function sanitizeAssignee(value) {
  if (value == null) return null;
  return sanitizeText(value, 80);
}

function createTimelineId({ incidentId, at, action, status, note }) {
  return `opitl_${hashId([incidentId, at, action, status, note])}`;
}

function normalizeTimelineEntry(raw, incidentId) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const at = sanitizeTimestamp(raw.at) || sanitizeTimestamp(raw.created_at);
  const action = TIMELINE_ACTIONS.has(raw.action) ? raw.action : null;
  const status = sanitizeStatus(raw.status);
  if (!at || !action || !status) return null;
  const note = sanitizeText(raw.note, 500);
  const entry = {
    entry_id: sanitizeTimelineId(raw.entry_id) || createTimelineId({ incidentId, at, action, status, note }),
    at,
    actor: 'operator',
    action,
    status,
    assignee: sanitizeAssignee(raw.assignee),
    note,
  };
  return entry;
}

function normalizeWorkflow(raw, fallbackIncidentId = null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const incidentId = sanitizeIncidentId(raw.incident_id || fallbackIncidentId);
  if (!incidentId) return null;
  const createdAt = sanitizeTimestamp(raw.created_at) || Math.floor(Date.now() / 1000);
  const updatedAt = sanitizeTimestamp(raw.updated_at) || createdAt;
  const status = sanitizeStatus(raw.status) || 'open';
  const timeline = Array.isArray(raw.timeline)
    ? raw.timeline.map((entry) => normalizeTimelineEntry(entry, incidentId)).filter(Boolean)
    : [];
  return {
    incident_id: incidentId,
    room_code: sanitizeRoomCode(raw.room_code),
    incident_type: sanitizeIncidentType(raw.incident_type),
    severity: sanitizeText(raw.severity, 20),
    status,
    assignee: sanitizeAssignee(raw.assignee),
    created_at: createdAt,
    updated_at: updatedAt,
    resolved_at: ['resolved', 'dismissed'].includes(status) ? sanitizeTimestamp(raw.resolved_at) || updatedAt : null,
    last_seen_at: sanitizeTimestamp(raw.last_seen_at),
    last_event_sequence: Number.isFinite(Number(raw.last_event_sequence)) ? Math.max(0, Math.floor(Number(raw.last_event_sequence))) : null,
    timeline: timeline
      .sort((left, right) => left.at - right.at || left.entry_id.localeCompare(right.entry_id))
      .slice(-MAX_TIMELINE_ENTRIES),
  };
}

function normalizeState(raw) {
  const state = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const incidents = {};
  for (const [incidentId, workflow] of Object.entries(state.incidents || {})) {
    const normalized = normalizeWorkflow(workflow, incidentId);
    if (!normalized) continue;
    incidents[normalized.incident_id] = normalized;
  }
  return {
    schema_version: OPERATOR_INCIDENT_WORKFLOW_SCHEMA_VERSION,
    incidents,
  };
}

function workflowFromIncident(incident, nowSeconds) {
  return {
    incident_id: incident.incident_id,
    room_code: sanitizeRoomCode(incident.room_code),
    incident_type: sanitizeIncidentType(incident.incident_type),
    severity: sanitizeText(incident.severity, 20),
    status: 'open',
    assignee: null,
    created_at: nowSeconds,
    updated_at: nowSeconds,
    resolved_at: null,
    last_seen_at: nowSeconds,
    last_event_sequence: Number.isFinite(Number(incident.last_event_sequence)) ? Math.max(0, Math.floor(Number(incident.last_event_sequence))) : null,
    timeline: [],
  };
}

function projectWorkflow(workflow, { tracked = true } = {}) {
  const projected = {
    schema_version: OPERATOR_INCIDENT_WORKFLOW_SCHEMA_VERSION,
    tracked: Boolean(tracked),
    incident_id: workflow.incident_id,
    room_code: workflow.room_code,
    incident_type: workflow.incident_type,
    severity: workflow.severity,
    status: workflow.status,
    assignee: workflow.assignee,
    created_at: workflow.created_at,
    updated_at: workflow.updated_at,
    resolved_at: workflow.resolved_at,
    last_seen_at: workflow.last_seen_at,
    last_event_sequence: workflow.last_event_sequence,
    timeline: cloneJson(workflow.timeline || []),
    limitations: [
      'Operator workflow state is internal triage metadata, not moderation enforcement, arbitration, legal advice, appraisal authority, fraud findings, or compliance review.',
      'Timeline notes are sanitized and redacted before persistence; do not store host tokens, user tokens, private profile state, or raw evidence documents here.',
    ],
  };
  return projected;
}

function createOperatorIncidentWorkflowStore({ filePath = null } = {}) {
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

  function workflowForIncident(incident, { nowSeconds = Math.floor(Date.now() / 1000), trackedDefault = false } = {}) {
    const incidentId = sanitizeIncidentId(incident?.incident_id);
    if (!incidentId) return null;
    const existing = state.incidents[incidentId];
    if (existing) {
      return { workflow: existing, tracked: true };
    }
    return { workflow: workflowFromIncident({ ...incident, incident_id: incidentId }, nowSeconds), tracked: trackedDefault };
  }

  function projectQueue(queue, { nowSeconds = Math.floor(Date.now() / 1000) } = {}) {
    const incidents = (queue.incidents || []).map((incident) => {
      const result = workflowForIncident(incident, { nowSeconds, trackedDefault: false });
      if (!result) return incident;
      const workflow = projectWorkflow(result.workflow, { tracked: result.tracked });
      return {
        ...cloneJson(incident),
        status: workflow.status,
        workflow,
      };
    });
    const byStatus = {};
    for (const status of WORKFLOW_STATUSES) byStatus[status] = 0;
    for (const incident of incidents) {
      byStatus[incident.status] = (byStatus[incident.status] || 0) + 1;
    }
    return {
      ...cloneJson(queue),
      workflow_schema_version: OPERATOR_INCIDENT_WORKFLOW_SCHEMA_VERSION,
      workflow_summary: {
        total_tracked: incidents.filter((incident) => incident.workflow?.tracked).length,
        by_status: byStatus,
      },
      incidents,
    };
  }

  function updateIncidentWorkflow(incident, patch = {}, { nowSeconds = Math.floor(Date.now() / 1000) } = {}) {
    const incidentId = sanitizeIncidentId(incident?.incident_id);
    if (!incidentId) return { error: 'Incident ID is invalid', statusCode: 400 };
    const now = sanitizeTimestamp(nowSeconds) || Math.floor(Date.now() / 1000);
    const existing = state.incidents[incidentId];
    const workflow = existing || workflowFromIncident({ ...incident, incident_id: incidentId }, now);

    const hasStatus = Object.prototype.hasOwnProperty.call(patch || {}, 'status');
    const hasAssignee = Object.prototype.hasOwnProperty.call(patch || {}, 'assignee');
    const hasNote = Object.prototype.hasOwnProperty.call(patch || {}, 'note');
    const nextStatus = hasStatus ? sanitizeStatus(patch.status) : workflow.status;
    if (hasStatus && !nextStatus) return { error: 'Incident workflow status is invalid', statusCode: 400 };

    const nextAssignee = hasAssignee ? sanitizeAssignee(patch.assignee) : workflow.assignee;
    const note = hasNote ? sanitizeText(patch.note, 500) : null;
    const statusChanged = nextStatus !== workflow.status;
    const assigneeChanged = nextAssignee !== workflow.assignee;
    let action = 'touched';
    if (statusChanged) action = 'status_changed';
    else if (assigneeChanged) action = 'assignment_changed';
    else if (note) action = 'note_added';

    workflow.status = nextStatus;
    workflow.assignee = nextAssignee;
    workflow.room_code = sanitizeRoomCode(incident.room_code) || workflow.room_code;
    workflow.incident_type = sanitizeIncidentType(incident.incident_type) || workflow.incident_type;
    workflow.severity = sanitizeText(incident.severity, 20) || workflow.severity;
    workflow.updated_at = now;
    workflow.last_seen_at = now;
    workflow.last_event_sequence = Number.isFinite(Number(incident.last_event_sequence))
      ? Math.max(0, Math.floor(Number(incident.last_event_sequence)))
      : workflow.last_event_sequence;
    workflow.resolved_at = ['resolved', 'dismissed'].includes(workflow.status) ? now : null;
    workflow.timeline.push({
      entry_id: createTimelineId({ incidentId, at: now, action, status: workflow.status, note }),
      at: now,
      actor: 'operator',
      action,
      status: workflow.status,
      assignee: workflow.assignee,
      note,
    });
    workflow.timeline = workflow.timeline.slice(-MAX_TIMELINE_ENTRIES);
    state.incidents[incidentId] = workflow;
    save();
    return { value: projectWorkflow(workflow, { tracked: true }) };
  }

  load();

  return {
    kind: filePath ? 'json-operator-incident-workflow' : 'memory-operator-incident-workflow',
    filePath,
    load,
    save,
    clear,
    projectQueue,
    updateIncidentWorkflow,
    rawState: () => cloneJson(state),
  };
}

module.exports = {
  OPERATOR_INCIDENT_WORKFLOW_SCHEMA_VERSION,
  WORKFLOW_STATUSES,
  createOperatorIncidentWorkflowStore,
};
