const { after, afterEach, before, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  server,
  rooms,
  configureRoomPersistence,
  configureOperatorIncidentWorkflowPersistence,
  observability,
  roomEventStore,
} = require('../index');

let baseUrl;
const originalOpsToken = process.env.FAIRVALUE_OPS_TOKEN;
const originalNodeEnv = process.env.NODE_ENV;

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function listen() {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
}

function close() {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function request(path, { method = 'GET', body, headers } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(headers || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data, headers: res.headers };
}

async function textRequest(path, { headers } = {}) {
  const res = await fetch(`${baseUrl}${path}`, { headers });
  return { status: res.status, text: await res.text(), headers: res.headers };
}

async function createHostedRoom() {
  const created = await request('/api/rooms', {
    method: 'POST',
    body: { address: '321 Observability Loop', asking_price: 725000 },
  });
  assert.equal(created.status, 200);
  return created.data;
}

before(listen);

afterEach(() => {
  restoreEnv('FAIRVALUE_OPS_TOKEN', originalOpsToken);
  restoreEnv('NODE_ENV', originalNodeEnv);
  configureRoomPersistence(null);
  configureOperatorIncidentWorkflowPersistence(null);
  observability.resetObservability();
  roomEventStore.clearAll();
  for (const room of Object.values(rooms)) {
    if (room.aiInterval) clearInterval(room.aiInterval);
  }
  for (const code of Object.keys(rooms)) {
    delete rooms[code];
  }
});

after(close);

test('health and readiness expose runtime status without requiring database credentials', async () => {
  const health = await request('/healthz');
  assert.equal(health.status, 200);
  assert.equal(health.data.service, 'fairvalue');
  assert.equal(health.data.status, 'ok');
  assert.equal(typeof health.data.uptime_seconds, 'number');
  assert.ok(health.headers.get('x-request-id'));

  const ready = await request('/readyz');
  assert.equal(ready.status, 200);
  assert.equal(ready.data.ready, true);
  assert.equal(ready.data.checks.database.configured, false);
  assert.equal(ready.data.checks.database.required, false);

  const disabledSql = Object.assign(async () => [], { isConfigured: false });
  await configureRoomPersistence({ mode: 'postgres', sql: disabledSql });
  const degraded = await request('/readyz');
  assert.equal(degraded.status, 503);
  assert.equal(degraded.data.ready, false);
  assert.equal(degraded.data.checks.database.required, true);
  assert.equal(degraded.data.checks.room_persistence.ok, false);
});

test('ops metrics track requests, room lifecycle, and avoid room secret leakage', async () => {
  observability.resetObservability();
  const room = await createHostedRoom();
  const code = room.room_code;

  const join = await request(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: { session_id: 'metrics-player', nickname: 'Metrics Player' },
  });
  assert.equal(join.status, 200);

  const bet = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'metrics-bet-001' },
    body: { session_id: 'metrics-player', outcome: 'over', wager: 25 },
  });
  assert.equal(bet.status, 200);

  const settled = await request(`/api/rooms/${code}/settle`, {
    method: 'POST',
    headers: { 'X-FairValue-Host-Token': room.host_token },
    body: { actual_price: 750000 },
  });
  assert.equal(settled.status, 200);

  const replayIntegrity = await request(`/api/rooms/${code}/replay/verify`, {
    headers: { 'X-FairValue-Host-Token': room.host_token },
  });
  assert.equal(replayIntegrity.status, 200);
  assert.equal(replayIntegrity.data.ok, true);

  const metrics = await request('/api/ops/metrics');
  assert.equal(metrics.status, 200);
  assert.ok(metrics.data.requests.total >= 4);
  assert.ok(metrics.data.requests.by_route['/api/rooms'] >= 1);
  assert.ok(metrics.data.requests.by_route['/api/rooms/:code/join'] >= 1);
  assert.ok(metrics.data.requests.by_route['/api/rooms/:code/bet'] >= 1);
  assert.equal(metrics.data.room_lifecycle.created, 1);
  assert.equal(metrics.data.room_lifecycle.joined, 1);
  assert.equal(metrics.data.room_lifecycle.bets, 1);
  assert.equal(metrics.data.room_lifecycle.settlements, 1);
  assert.equal(metrics.data.rooms.active_rooms, 1);
  assert.equal(metrics.data.rooms.settled_rooms, 1);
  assert.equal(metrics.data.rooms.total_players, 1);
  assert.equal(metrics.data.database.configured, false);
  assert.equal(metrics.data.event_log.enabled, false);
  assert.equal(metrics.data.replay_integrity.checks, 1);
  assert.equal(metrics.data.replay_integrity.failures, 0);
  assert.equal(JSON.stringify(metrics.data).includes(room.host_token), false);
});

test('ops metrics require a configured token before exposing counters', async () => {
  process.env.FAIRVALUE_OPS_TOKEN = 'observability-test-token';

  const denied = await request('/api/ops/metrics');
  assert.equal(denied.status, 403);
  assert.equal(denied.data.error, 'Ops token required');

  const allowed = await request('/api/ops/metrics', {
    headers: { Authorization: 'Bearer observability-test-token' },
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.data.service, 'fairvalue');
});

test('ops incidents expose redacted operator triage behind the ops token', async () => {
  process.env.FAIRVALUE_OPS_TOKEN = 'incident-test-token';
  const room = await createHostedRoom();
  const code = room.room_code;

  const join = await request(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: { session_id: 'incident-player', nickname: 'Incident Player' },
  });
  assert.equal(join.status, 200);

  const bet = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'incident-bet-001' },
    body: {
      session_id: 'incident-player',
      outcome: 'over',
      wager: 25,
      reason: 'The closing comp supports the host ask.',
    },
  });
  assert.equal(bet.status, 200);

  const settled = await request(`/api/rooms/${code}/settle`, {
    method: 'POST',
    headers: { 'X-FairValue-Host-Token': room.host_token },
    body: { actual_price: 750000 },
  });
  assert.equal(settled.status, 200);

  const denied = await request('/api/ops/incidents');
  assert.equal(denied.status, 403);

  const allowed = await request('/api/ops/incidents?severity=high', {
    headers: { Authorization: 'Bearer incident-test-token' },
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.data.schema_version, 'fairvalue.operatorIncidentQueue.v1');
  assert.equal(allowed.data.count, 1);
  assert.equal(allowed.data.incidents[0].room_code, code);
  assert.equal(allowed.data.incidents[0].incident_type, 'settlement_packet_missing');
  assert.equal(allowed.data.incidents[0].severity, 'high');
  assert.equal(allowed.data.incidents[0].privacy_classification, 'operator_internal_redacted');
  assert.equal(allowed.data.incidents[0].workflow.status, 'open');
  assert.equal(allowed.data.workflow_summary.by_status.open, 1);
  assert.equal(JSON.stringify(allowed.data).includes(room.host_token), false);
  assert.match(allowed.data.limitations.join(' '), /redacted/);

  const deniedReplay = await request(`/api/ops/incidents/${allowed.data.incidents[0].incident_id}/replay`);
  assert.equal(deniedReplay.status, 403);

  const replayReview = await request(`/api/ops/incidents/${allowed.data.incidents[0].incident_id}/replay`, {
    headers: { Authorization: 'Bearer incident-test-token' },
  });
  assert.equal(replayReview.status, 200);
  assert.equal(replayReview.data.schema_version, 'fairvalue.operatorIncidentReplayReview.v1');
  assert.equal(replayReview.data.incident_id, allowed.data.incidents[0].incident_id);
  assert.equal(replayReview.data.room_code, code);
  assert.equal(replayReview.data.replay_status.ok, true);
  assert.equal(replayReview.data.replay_status.mismatch_count, 0);
  assert.equal(replayReview.data.replay_summary.settled, true);
  assert.equal(replayReview.data.replay_summary.winning_outcome, 'over');
  assert.equal(replayReview.data.replay_summary.settlement_evidence_status, 'host_attested');
  assert.equal(replayReview.data.checks.some((check) => check.path === 'settlement' && check.ok), true);
  assert.match(replayReview.data.limitations.join(' '), /operator-only redacted projection check/);
  assert.equal(JSON.stringify(replayReview.data).includes(room.host_token), false);

  const deniedWorkflow = await request(`/api/ops/incidents/${allowed.data.incidents[0].incident_id}`, {
    method: 'PATCH',
    body: { status: 'investigating' },
  });
  assert.equal(deniedWorkflow.status, 403);

  const updated = await request(`/api/ops/incidents/${allowed.data.incidents[0].incident_id}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer incident-test-token' },
    body: {
      status: 'investigating',
      assignee: 'Ops Lead',
      note: `Review host_token=${room.host_token} before sharing the recap.`,
    },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.schema_version, 'fairvalue.operatorIncidentWorkflow.v1');
  assert.equal(updated.data.status, 'investigating');
  assert.equal(updated.data.timeline[0].action, 'status_changed');
  assert.equal(JSON.stringify(updated.data).includes(room.host_token), false);

  const listedAgain = await request('/api/ops/incidents?severity=high', {
    headers: { Authorization: 'Bearer incident-test-token' },
  });
  assert.equal(listedAgain.status, 200);
  assert.equal(listedAgain.data.workflow_summary.total_tracked, 1);
  assert.equal(listedAgain.data.workflow_summary.by_status.investigating, 1);
  assert.equal(listedAgain.data.incidents[0].status, 'investigating');
  assert.equal(listedAgain.data.incidents[0].workflow.tracked, true);
  assert.equal(listedAgain.data.incidents[0].workflow.timeline[0].note.includes('[redacted-token]'), true);
  assert.equal(JSON.stringify(listedAgain.data).includes(room.host_token), false);
});

test('prometheus metrics expose aggregate counters for external scrapers', async () => {
  observability.resetObservability();
  const room = await createHostedRoom();
  const code = room.room_code;

  const join = await request(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: { session_id: 'prometheus-player', nickname: 'Prometheus Player' },
  });
  assert.equal(join.status, 200);

  const bet = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'prometheus-bet-001' },
    body: { session_id: 'prometheus-player', outcome: 'under', wager: 30 },
  });
  assert.equal(bet.status, 200);

  const metrics = await textRequest('/metrics');
  assert.equal(metrics.status, 200);
  assert.match(metrics.headers.get('content-type') || '', /text\/plain/);
  assert.match(metrics.text, /^# HELP fairvalue_up/m);
  assert.match(metrics.text, /fairvalue_up 1/);
  assert.match(metrics.text, /fairvalue_http_requests_total\{status_class="2xx"\} [1-9]/);
  assert.match(metrics.text, /fairvalue_room_lifecycle_total\{event="created"\} 1/);
  assert.match(metrics.text, /fairvalue_room_lifecycle_total\{event="joined"\} 1/);
  assert.match(metrics.text, /fairvalue_room_lifecycle_total\{event="bets"\} 1/);
  assert.match(metrics.text, /fairvalue_rooms\{state="active"\} 1/);
  assert.match(metrics.text, /fairvalue_room_players 1/);
  assert.match(metrics.text, /fairvalue_database_configured 0/);
  assert.match(metrics.text, /fairvalue_room_event_log_enabled\{kind="json"\} 0/);
  assert.match(metrics.text, /fairvalue_replay_integrity_checks_total 0/);
  assert.match(metrics.text, /fairvalue_replay_integrity_failures_total 0/);
  assert.equal(metrics.text.includes(room.host_token), false);

  process.env.FAIRVALUE_OPS_TOKEN = 'prometheus-test-token';
  const denied = await textRequest('/metrics');
  assert.equal(denied.status, 403);

  const allowed = await textRequest('/metrics', {
    headers: { 'X-FairValue-Ops-Token': 'prometheus-test-token' },
  });
  assert.equal(allowed.status, 200);
  assert.match(allowed.text, /fairvalue_up 1/);
});
