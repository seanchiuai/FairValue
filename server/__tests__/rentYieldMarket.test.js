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

test('rent-yield rooms create, trade, settle, replay, and verify through the API', async () => {
  const templates = await request('/api/market-templates');
  assert.equal(templates.status, 200);
  const rentTemplate = templates.data.templates.find((template) => template.market_format === 'rent_yield_over_under');
  assert.equal(rentTemplate.status, 'playable');
  assert.equal(rentTemplate.pricing_engine, 'lmsr_binary_v1');

  const created = await request('/api/rooms', {
    method: 'POST',
    body: {
      address: '22 Yield Loop',
      asking_price: 800000,
      market_draft: {
        source_type: 'manual',
        address: '22 Yield Loop',
        asking_price: 800000,
        market_format: 'rent_yield_over_under',
        yield_threshold: 0.05,
        market_question: 'Will 22 Yield Loop clear a 5% annual rent yield?',
      },
    },
  });
  assert.equal(created.status, 200);
  assert.equal(created.data.market_format, 'rent_yield_over_under');
  assert.equal(created.data.market_config.schema_version, 'rent-yield-over-under-config/v1');
  assert.equal(created.data.market_config.yield_threshold, 0.05);
  const code = created.data.room_code;
  const hostHeaders = { 'X-FairValue-Host-Token': created.data.host_token };

  const joined = await request(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: { session_id: 'yield-player', nickname: 'Yield Player' },
  });
  assert.equal(joined.status, 200);

  const bet = await request(`/api/rooms/${code}/bet`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'rent-yield-bet-001' },
    body: {
      session_id: 'yield-player',
      outcome: 'over',
      wager: 50,
      reason: 'Lease comps suggest a strong gross yield.',
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

  const missingRent = await request(`/api/rooms/${code}/settle`, {
    method: 'POST',
    headers: hostHeaders,
    body: { actual_price: 800000 },
  });
  assert.equal(missingRent.status, 400);
  assert.match(missingRent.data.error, /Annual rent/);
  assert.equal(rooms[code].settled, false);

  const settled = await request(`/api/rooms/${code}/settle`, {
    method: 'POST',
    headers: hostHeaders,
    body: {
      actual_price: 800000,
      annual_rent: 48000,
      settlement_evidence: {
        summary: 'Signed lease and closing statement metadata.',
        items: [
          {
            type: 'rental_outcome',
            source: 'Lease abstract',
            reference: 'Lease-2026-05',
            confidence: 'high',
          },
        ],
      },
    },
  });
  assert.equal(settled.status, 200);
  assert.equal(settled.data.winning_outcome, 'over');
  assert.equal(settled.data.annual_rent, 48000);
  assert.equal(settled.data.settlement_price, 800000);
  assert.equal(settled.data.rent_yield, 0.06);

  const state = await request(`/api/rooms/${code}/state`);
  assert.equal(state.status, 200);
  assert.equal(state.data.settlement.rent_yield, 0.06);

  const replay = await request(`/api/rooms/${code}/replay`, { headers: hostHeaders });
  assert.equal(replay.status, 200);
  assert.equal(replay.data.replay.settlement.annual_rent, 48000);

  const verification = await request(`/api/rooms/${code}/public-verification`);
  assert.equal(verification.status, 200);
  assert.equal(verification.data.settlement.rent_yield, 0.06);
  assert.equal(JSON.stringify(verification.data).includes(created.data.host_token), false);
});
