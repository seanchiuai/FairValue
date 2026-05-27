const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  OPERATOR_INCIDENT_WORKFLOW_SCHEMA_VERSION,
  createOperatorIncidentWorkflowStore,
} = require('../operatorIncidentWorkflowStore');

const generatedIncident = {
  incident_id: 'opinc_1234567890abcdef12345678',
  room_code: 'ABCD',
  incident_type: 'settlement_packet_missing',
  severity: 'high',
  status: 'open',
  last_event_sequence: 12,
};

test('operator incident workflow store persists redacted triage timeline state', () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'fairvalue-operator-incident-workflow-'));
  const filePath = path.join(tempRoot, 'operator-incidents.json');
  try {
    const store = createOperatorIncidentWorkflowStore({ filePath });
    const updated = store.updateIncidentWorkflow(generatedIncident, {
      status: 'investigating',
      assignee: '<b>Ops Lead</b>',
      note: 'Review host_token=abcdefghijklmnopqrstuvwxyz1234567890 and fv1.private-user-token before recap.',
    }, { nowSeconds: 1779866000 });

    assert.equal(updated.value.schema_version, OPERATOR_INCIDENT_WORKFLOW_SCHEMA_VERSION);
    assert.equal(updated.value.status, 'investigating');
    assert.equal(updated.value.assignee, 'Ops Lead');
    assert.equal(updated.value.timeline.length, 1);
    assert.equal(updated.value.timeline[0].action, 'status_changed');
    assert.match(updated.value.timeline[0].note, /\[redacted-token\]/);
    assert.equal(JSON.stringify(updated.value).includes('private-user-token'), false);
    assert.equal(JSON.stringify(updated.value).includes('abcdefghijklmnopqrstuvwxyz1234567890'), false);

    const restored = createOperatorIncidentWorkflowStore({ filePath });
    const projected = restored.projectQueue({
      schema_version: 'fairvalue.operatorIncidentQueue.v1',
      count: 1,
      total_matches: 1,
      incidents: [generatedIncident],
      summary: { total: 1, by_severity: { high: 1 }, by_type: { settlement_packet_missing: 1 } },
      limitations: [],
    }, { nowSeconds: 1779866001 });

    assert.equal(projected.workflow_schema_version, OPERATOR_INCIDENT_WORKFLOW_SCHEMA_VERSION);
    assert.equal(projected.workflow_summary.total_tracked, 1);
    assert.equal(projected.workflow_summary.by_status.investigating, 1);
    assert.equal(projected.incidents[0].status, 'investigating');
    assert.equal(projected.incidents[0].workflow.tracked, true);
    assert.equal(projected.incidents[0].workflow.timeline[0].note.includes('[redacted-token]'), true);

    const invalid = restored.updateIncidentWorkflow(generatedIncident, { status: 'approved' });
    assert.equal(invalid.statusCode, 400);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
