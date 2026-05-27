const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  OPERATOR_INCIDENT_QUEUE_SCHEMA_VERSION,
  buildOperatorIncidentQueue,
} = require('../operatorIncidentQueue');

test('operator incident queue derives redacted severity-ordered room incidents', () => {
  const queue = buildOperatorIncidentQueue({
    nowSeconds: 1779865555,
    rooms: {
      ABCD: {
        code: 'ABCD',
        hostToken: 'secret-host-token',
        host_token: 'secret-host-token',
        settled: false,
        phase: { status: 'locked', betting_locked: true },
        durabilityError: {
          action: 'ai_trade',
          error: 'Room persistence failed',
          message: 'Do not expose storage internals',
        },
        activity: [
          { type: 'bet', outcome: 'over', reason: 'Recent comp supports the ask.' },
          { type: 'bet', outcome: 'under', reason: 'Inspection risk could matter.' },
        ],
      },
    },
    roomEventsByCode: () => [],
  });

  assert.equal(queue.schema_version, OPERATOR_INCIDENT_QUEUE_SCHEMA_VERSION);
  assert.equal(queue.generated_at, 1779865555);
  assert.equal(queue.count, 4);
  assert.equal(queue.summary.by_severity.critical, 1);
  assert.equal(queue.summary.by_type.durability_failure, 1);
  assert.equal(queue.incidents[0].severity, 'critical');
  assert.equal(queue.incidents[0].incident_type, 'durability_failure');
  assert.deepEqual(
    queue.incidents.map((incident) => incident.incident_type).sort(),
    ['dispute_review_ready', 'durability_failure', 'event_log_missing', 'locked_unsettled_room']
  );
  assert.equal(JSON.stringify(queue).includes('secret-host-token'), false);
  assert.match(queue.limitations.join(' '), /not moderation enforcement/);
});
