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

test('time-on-market rooms create, trade, settle, replay, and verify through the API', async () => {
  const templates = await request('/api/market-templates');
  assert.equal(templates.status, 200);
  const timeTemplate = templates.data.templates.find((template) => template.market_format === 'time_on_market_over_under');
  assert.equal(timeTemplate.status, 'playable');
  assert.equal(timeTemplate.pricing_engine, 'lmsr_binary_v1');

  const created = await request('/api/rooms', {
    method: 'POST',
    body: {
      address: '88 Listing Clock Lane',
      asking_price: 700000,
      market_draft: {
        source_type: 'manual',
        address: '88 Listing Clock Lane',
        asking_price: 700000,
        market_format: 'time_on_market_over_under',
        days_threshold: 45,
        market_question: 'Will 88 Listing Clock Lane take at least 45 days to go under contract?',
      },
    },
  });
  assert.equal(created.status, 200);
  assert.equal(created.data.market_format, 'time_on_market_over_under');
  assert.equal(created.data.market_config.schema_version, 'time-on-market-over-under-config/v1');
  assert.equal(created.data.market_config.days_threshold, 45);
  const code = created.data.room_code;
  const hostHeaders = { 'X-FairValue-Host-Token': created.data.host_token };

  const joined = await request(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: { session_id: 'dom-player', nickname: 'DOM Player' },
  });
  assert.equal(joined.status, 200);

  const bet = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'time-on-market-bet-001' },
    body: {
      session_id: 'dom-player',
      outcome: 'over',
      wager: 55,
      reason: 'Price cuts nearby suggest a longer listing lifecycle.',
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

  const missingDays = await request(`/api/rooms/${code}/settle`, {
    method: 'POST',
    headers: hostHeaders,
    body: {},
  });
  assert.equal(missingDays.status, 400);
  assert.match(missingDays.data.error, /Days on market/);
  assert.equal(rooms[code].settled, false);

  const settled = await request(`/api/rooms/${code}/settle`, {
    method: 'POST',
    headers: hostHeaders,
    body: {
      days_on_market: 52,
      settlement_evidence: {
        summary: 'MLS listing lifecycle metadata.',
        items: [
          {
            type: 'mls_update',
            source: 'MLS status history',
            reference: 'MLS-Clock-52',
            confidence: 'high',
          },
        ],
      },
    },
  });
  assert.equal(settled.status, 200);
  assert.equal(settled.data.winning_outcome, 'over');
  assert.equal(settled.data.actual_price, 52);
  assert.equal(settled.data.days_on_market, 52);
  assert.equal(settled.data.days_threshold, 45);

  const state = await request(`/api/rooms/${code}/state`);
  assert.equal(state.status, 200);
  assert.equal(state.data.settlement.days_on_market, 52);

  const replay = await request(`/api/rooms/${code}/replay`, { headers: hostHeaders });
  assert.equal(replay.status, 200);
  assert.equal(replay.data.replay.settlement.days_threshold, 45);

  const verification = await request(`/api/rooms/${code}/public-verification`);
  assert.equal(verification.status, 200);
  assert.equal(verification.data.settlement.days_on_market, 52);
  assert.equal(JSON.stringify(verification.data).includes(created.data.host_token), false);
});
