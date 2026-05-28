const { after, afterEach, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { server, rooms, configureRoomPersistence, roomEventStore } = require('../index');

let baseUrl;

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
  return { status: res.status, data };
}

before(listen);

afterEach(() => {
  configureRoomPersistence(null);
  roomEventStore.clearAll();
  for (const room of Object.values(rooms)) {
    if (room.aiInterval) clearInterval(room.aiInterval);
  }
  for (const code of Object.keys(rooms)) delete rooms[code];
});

after(close);

test('renovation-budget rooms create, trade, settle, replay, and verify through the API', async () => {
  const templates = await request('/api/market-templates');
  assert.equal(templates.status, 200);
  const renovationTemplate = templates.data.templates.find((template) => template.market_format === 'renovation_budget_over_under');
  assert.equal(renovationTemplate.status, 'playable');
  assert.equal(renovationTemplate.pricing_engine, 'lmsr_binary_v1');

  const created = await request('/api/rooms', {
    method: 'POST',
    body: {
      address: '11 Permit Court',
      asking_price: 900000,
      market_draft: {
        source_type: 'manual',
        address: '11 Permit Court',
        asking_price: 900000,
        market_format: 'renovation_budget_over_under',
        budget_threshold: 125000,
        market_question: 'Will verified renovation cost exceed $125,000?',
      },
    },
  });
  assert.equal(created.status, 200);
  assert.equal(created.data.market_format, 'renovation_budget_over_under');
  assert.equal(created.data.market_config.schema_version, 'renovation-budget-over-under-config/v1');
  assert.equal(created.data.market_config.budget_threshold, 125000);
  const code = created.data.room_code;
  const hostHeaders = { 'X-FairValue-Host-Token': created.data.host_token };

  const joined = await request(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: { session_id: 'reno-player', nickname: 'Reno Player' },
  });
  assert.equal(joined.status, 200);

  const bet = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'renovation-budget-bet-001' },
    body: {
      session_id: 'reno-player',
      outcome: 'over',
      wager: 60,
      reason: 'Permit scope and finish level suggest the work clears budget.',
    },
  });
  assert.equal(bet.status, 200);
  assert.equal(bet.data.player.bets[0].outcome, 'over');

  const aiToggle = await request(`/api/rooms/${code}/toggle-ai`, {
    method: 'POST',
    headers: hostHeaders,
  });
  assert.equal(aiToggle.status, 400);
  assert.match(aiToggle.data.error, /binary over\/under/);

  const missingCost = await request(`/api/rooms/${code}/settle`, {
    method: 'POST',
    headers: hostHeaders,
    body: {},
  });
  assert.equal(missingCost.status, 400);
  assert.match(missingCost.data.error, /Verified renovation cost/);
  assert.equal(rooms[code].settled, false);

  const settled = await request(`/api/rooms/${code}/settle`, {
    method: 'POST',
    headers: hostHeaders,
    body: {
      verified_cost: 140000,
      settlement_evidence: {
        summary: 'Invoice and permit metadata.',
        items: [
          {
            type: 'permit_record',
            source: 'Permit portal',
            reference: 'Permit-2026-11',
            confidence: 'high',
          },
        ],
      },
    },
  });
  assert.equal(settled.status, 200);
  assert.equal(settled.data.winning_outcome, 'over');
  assert.equal(settled.data.actual_price, 140000);
  assert.equal(settled.data.verified_cost, 140000);
  assert.equal(settled.data.budget_threshold, 125000);

  const state = await request(`/api/rooms/${code}/state`);
  assert.equal(state.status, 200);
  assert.equal(state.data.settlement.verified_cost, 140000);

  const replay = await request(`/api/rooms/${code}/replay`, { headers: hostHeaders });
  assert.equal(replay.status, 200);
  assert.equal(replay.data.replay.settlement.budget_threshold, 125000);

  const verification = await request(`/api/rooms/${code}/public-verification`);
  assert.equal(verification.status, 200);
  assert.equal(verification.data.settlement.verified_cost, 140000);
  assert.equal(JSON.stringify(verification.data).includes(created.data.host_token), false);
});
